# 81 — Audit code CPU/GPU/streaming : optimiser sans sacrifier le rendu

**Statut : AUDITED (statique) / NOT BENCHMARKED sur matériel cible.** Sources lues sur `main@f37d7767f408632673d38044b606209afb5e9ef4` le 18 novembre 2026. Aucun fichier moteur modifié ici ; aucune amélioration FPS revendiquée. Les branches et PR non fusionnées ne sont pas supposées livrées sur `main`.

**But** : corriger d'abord le travail inutile à résultat graphique inchangé, puis augmenter la qualité des scènes sans augmenter la charge sur les PC 4–8 Go. Voir [80 — profils matériels](80-OLD-PC-HARDWARE-AUTO-QUALITY.md), [82 — roadmap](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md) et [22 — contrat ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md).

## 1. État réel utile

| Domaine/fichiers | Ce qui est déjà disponible | Limite ou risque détecté / à profiler |
| --- | --- | --- |
| `src/frame-clock.ts`, `src/main.ts` | Simulation fixe 30 Hz, présentation 30/20, résolution adaptive, `PerfSampler` et timer GPU WebGL2 optionnel | `PresentationBudget.observe(workMs, interval)` ne distingue pas encore causes CPU/GPU ; baisses de résolution potentiellement inutiles en cas de CPU limité |
| `src/chunks.ts`, `src/terrain-view.ts` | LOD 0/1/2, point d'intérêt caméra/vitesse, anticipation 2–4 s, hystérésis, workers, cache et ancien LOD conservé | Admission GPU/CPU non consolidée entre tous consommateurs ; le premier build peut dépasser son budget temporel |
| `src/dressing-view.ts` | 8 familles `InstancedMesh`, deux `BatchedMesh` d'espèces LOD0/1, cache 1200 cellules, canopée, génération workers, fallback silhouettes | `rebuild` reconstruit les matrices de familles à partir des cellules et marque des plages entières pour upload ; tri et allocations répétées |
| `src/render/grass.ts` | 3 triangles par touffe, vent en vertex shader, 1 draw call, profils `dense/balanced/ultra/groundOnly`, visibilité projetée | `InstancedMesh` global capacité 24 000 et `frustumCulled=false` ; rebuild copie matrices/couleurs de toutes cellules actives ; coût de recréation pendant vol à mesurer |
| `src/render/cliff-view.ts` | Segments proches, deux LOD, jusqu'à 32 meshes / trois nouveaux builds par update | Recherche `segments.map(...).filter(...).sort(...)` après déplacement ≥12 m ; création/dispose fréquente et rebuild LOD sans cache réutilisable |
| `src/structures/natural-view.ts` | Les formations naturelles ont un rendu local limité à 48 et collision logique distincte | Parcours/tri de toutes les entrées ≥16 m ; `naturalMesh` recréé puis supprimé en entrant/sortant du rayon |
| `src/world-production/placed-instances.ts` | `BatchedMesh` LOD par structures répétées, IDs d'instances stables, préparation progressive des GLB | À grande échelle, balayage de toutes les entrées lorsque focus/caméra déclenche la sélection ; besoin de secteurs pour villes nombreuses |
| `src/world.ts` | Frustum/occlusion d'asset, caches partagés, modules de monde distincts, pool de lumières limité | Parcours de `objects.children` à chaque présentation, recherche de distances/LOD ; index statique et cadence décorative différée à étudier |
| `src/render/horizon-occlusion.ts`, `src/horizon-view.ts` | Relief d'horizon conservateur, secteurs d'occlusion recalculés progressivement | Mesurer la charge des échantillonnages en vol/hauteur ; ne jamais couper silhouette ou geometry approchable |
| `src/geography/geo-workers.ts` | Pool 1–2 workers, jobs versionnés, `stale`, annulation et priorités | Trier la queue à chaque admission, jobs multiples et priorités locales ; orchestrer sans seconde queue centrale divergente |
| `src/lighting/light-view.ts` | 4 lumières locales max, halos regroupés, pas de shadow map locale | Optimiser d'abord la sélection, préserver lumière/lisibilité ; ombres avancées **futures**, non coût actuel principal |
| `src/environment/view.ts` | Ciel minimal sans fog camouflage, pluie GPU bornée | Préparer qualité supérieure progressive sans multiplier passes ni créer de traitements CPU par particule |

Le catalogue `assets/world-assets.json` de ce `main` répertorie **98 assets, 215 fichiers GLB LOD, ~1,30 Mo de GLB et zéro texture déclarée**. La compression lourde des textures n'est donc pas une priorité immédiate. Les futurs assets texturés nécessiteront une campagne dédiée, pas une dépendance imposée maintenant.

## 2. Priorités de reprise du code (sans dégradation artistique)

### P0 — éliminer le travail redondant

**P0-A — `dressing-view.ts` (gain CPU/uploads attendu, à mesurer).**
- Séparer **données de cellules stables** (graine, classification, matrice, couleur, LOD, ID) et **liste d'instances actives** ; dirty flags par cellule/famille/LOD.
- Conserver instances/offsets stables si caméra, secteur et LOD ne changent pas ; mettre à jour **plages GPU modifiées**, éviter `needsUpdate=true` sur tout le groupe à chaque rebuild local.
- Comparer une partition cullable par secteurs de 128/256 m à l'agrégation globale actuelle : trop de sous-meshes peut **augmenter** les draw calls ; mesurer un optimum.
- Réutiliser `Vector3`, `Box3`, tableaux et matrices temporaires dans les boucles ; pas de nouveau `Vector3` par point de borne. Remplacer les `sort` globaux répétés par une structure spatiale/ordre stabilisé quand pertinent.
- Préserver priorité à la flore récoltable, canopée lointaine et silhouette, identité des arbres coupés et réapparition de tous les éléments importants lors du retour.

**P0-B — `cliff-view.ts` + `natural-view.ts` (indexation/ownership).**
- Indexer segments/placements par cellules spatiales ; requêtes sur secteurs proches (nombre de candidats dépend de la densité locale, pas du total de la carte).
- Cacher géométries par `(featureId,segmentId,lod,terrainRevision)` et GLB/structures partagées par ID et révision ; libérer seulement après éviction d'éléments inactifs et vérification d'ownership.
- Conserver le mesh du LOD précédent jusqu'à préparation du suivant ; invalider **uniquement** après édition touchant le segment. Budget d'intégration mesuré, pas seulement `buildPerUpdate=3`.
- **Ne pas supprimer** les grandes formations visibles à cause d'un plafond d'objets ; privilégier LOD/proxy équivalent.

**P0-C — métriques de travail réel.**
- Ajouter compteurs `dressingRebuildMs`, `dirtyCells`, `bufferBytesUploaded`, `reuseHitRate`, `cliffCandidates`, `naturalMeshCreated/disposed`, `GC/longTasks` si accessibles ; coût collecteur borné/optionnel.
- Différencier `cpuUpdate`, `cpuRenderSubmission` et `gpuTime` facultatif ; enregistrer p50/p95/p99 et nombre d'images >50/100 ms.
- Mettre en place A/B à trajectoire, capture et qualité identiques. Aucune affirmation de gain sur seuls draw calls/triangles.

### P1 — stabiliser les déplacements rapides et la mémoire

**P1-A — `chunks.ts`, `terrain-view.ts`, `geo-workers.ts`.**
- Anticiper **la trajectoire réelle** (vitesse physique + direction du mouvement), virages, altitude, sens caméra, temps de préparation observé. Aujourd'hui `maxLookahead=4` mais `maxAheadShift=0.5` réduit le décalage effectif : ne pas assimiler horizon temporel et distance garantie.
- Priorité P0 terrain de sécurité/collision, P1 avant de caméra/obstacles/lieux proches, P2 côté et demi-tour, P3 panorama opportuniste ; maintien de l'horizon et de l'ancien mesh.
- Étaler les transferts GPU et intégrer les travaux prêts au moment où ils comptent ; annulation versionnée à changement de carte, téléportation, édition Studio, transfert d'île.
- Garder un budget de **temps CPU et de quantité** ; interrompre/diviser les grosses tâches coopérativement au lieu de faire passer un build lourd sans limite.

**P1-B — `world.ts`, `placed-instances.ts`, `asset-culling.ts`.**
- Index spatial des objets **statiques** ; changement de visibilité sur région/rotation significative et non parcours complet à chaque présentation.
- Prendre en compte la vraie caméra (déjà placée avant les LOD dans `main.ts`), conserver conservativement les objets proches, dynamiques et landmarks.
- Grouper statique par matériau/LOD/secteur sans casser interactions : objets avec état logique conservent identité, transform et collider même quand leur mesh est absent.
- Prévoir le futur nombre de maisons/villages plutôt que tout convertir en un lot global.

**P1-C — caches et mémoire.**
- Comptabiliser séparément heap JS estimé, buffers géométriques, buffers instances, caches GLB, atlas et données sources ; valeurs GPU estimées explicitement.
- Reuse/evict LRU basé sur octets estimés, visibilité, fraîcheur et coût de reconstruction ; limiter cache spéculatif sur vieux PC mais préserver l'anneau de sécurité.
- Garantie `dispose` unique des ressources partagées ; tests boucle île A→B→A, transitions de Studio et modèles répétés, aucune croissance non bornée.

### P2 — qualité future, sans effet gratuit supposé

- **LOD perceptuels** : taille projetée et importance, erreur de silhouette, hystérésis et transition contrôlée ; caméra haute et vol rapide sans popping.
- **Imposteurs** : mode `off` conservé par défaut ; comparer silhouettes 4–8 triangles / atlas 2 triangles texturés avec GPU réel. Un atlas peut être pire en fill-rate, ne pas généraliser.
- **Herbes** : préserver `dense` au sol lorsque peu coûteux, améliorer seulement le culling/buffering ; `groundOnly` si herbe réellement non discernable ou surcharge démontrée.
- **Rendu futur** : AO/ombres de contact léger pré-calculés/vertex colors, plus de variété de végétation, meilleurs raccords d'eau et de falaises, ciel lumineux, ombres sélectives ; soumettre chaque nouvel effet au budget visuel.
- **Compression/WebGPU** : non prioritaires sur le catalogue actuel sans données de coût de chargement; WebGL2 et Pages restent obligatoires.

## 3. Points de vigilance précis

1. `grass.ts` : le buffer initial d'instances (24 000 × 19 floats × 4 octets, ~1,82 Mo, avant caches locaux) reste alloué même si la couche 3D est désactivée. Proposer une allocation à la demande **si** la pression mémoire 4 Go le justifie, sans cycles d'alloc/dispose à chaque changement de profil.
2. `dressing-view.ts` : `maxCells=1200`, `MAX_CANOPY=6000`, tailles `CAPACITY` et fréquences 250/1000 ms ne doivent pas être changées arbitrairement. Réduire les transferts réels et les traversées avant de diminuer les densités.
3. `cliff-view.ts` : le quota 32 visible + 3 builds sert de garde-fou, pas de budget artistique final. Index/cache d'abord, puis recalibrage des caps sans pertes.
4. `frame-clock.ts` : réduire résolution à chaque surcharge, sans diagnostic GPU, peut être inutile pour un goulet CPU. Faire évoluer **un seul** arbitre et garder la simulation 30 Hz.
5. `world.ts` : les assets individuels interactifs ne sont pas tous éligibles au batching, et c'est voulu ; ne pas rendre les entités du jeu dépendantes du culling ou du nombre d'objets affichés.
6. `render/impostor-sectors.ts` : uploads différés, atlas et groupes sont déjà optimisés ; documenter **coût de fill-rate et de secteurs** avant toute activation Auto.

## 4. Mesures existantes : prudence sur les conclusions

- [56 — préparation/batching](56-RENDER-PREPARATION-CULLING.md) : fixture 40 objets, 40→1 appels sans différence d'image dans ce test ; scène village 179→140 appels sous Chromium/SwiftShader. Pas d'équivalence automatique « draw calls = FPS ».
- [55 — hybride](55-HYBRID-DISTANT-RENDERING.md) et [benchmarks île](benchmarks/hybrid/island-rollout/) : réduire des triangles par imposteurs a parfois **augmenté** les appels et le coût de rendu. Maintenir un choix de représentation fondé sur mesure.
- [57 — couverture du sol](57-GROUND-COVER.md) : couleur de sol/tufts et benchmarks de captures disponibles ; préserver lisibilité et flore rapprochée.
- Les tests enregistrés sont principalement Chromium/SwiftShader et des fixtures ciblées, **pas** une preuve d'atteinte de 30/20 FPS sur PC 4 ou 8 Go réel.

## 5. Définition « optimisé à qualité constante »

Une optimisation P0/P1 n'est acceptable que si : mêmes pixels/erreur visuelle explicitée en capture déterministe, mêmes données de monde et gameplay, pas de trous/objet perdu à grande vitesse, p95/p99 de travail CPU et temps GPU (si connu) non régressifs, consommation mémoire stable, tests navigateur + TypeScript/build validés. Les améliorations artistiques ajoutées après ces gains ont leurs propres budgets, voir [82](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md).

**État :** uniquement audit et objectifs. Chaque PR technique marquera `IMPLEMENTED` puis `TESTED` puis `BENCHMARKED 4GB/8GB` de façon distincte.