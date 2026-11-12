# 17 — Rendu de grande profondeur sans brouillard : terrain, objets et horizons

**Cadrage validé par le créateur — 12 novembre 2026.** Objectif : conserver une **vue large et profonde** pendant la marche, le planage, depuis les falaises et sur l'océan, **sans masquer les limites du monde par du brouillard**. Une carte continue est limitée par conception à **10 × 10 km maximum**.

**Statut : spécification cible, non implémentée intégralement.** Les seuils et budgets indiqués sont des **hypothèses de benchmark**. Aucun FPS ni horizon de 5 km n'est revendiqué comme atteint.

Références : [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [10 — Mesures](10-PERFORMANCE-ROADMAP.md), [14 — Choix techniques](14-TECHNICAL-CHOICES.md), [15 — Données V3](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md).

## 1. Décision fondamentale : pas de brouillard-cache

**La distance de visibilité géographique doit être indépendante de la distance d'activité/simulation.** Un joueur peut voir la silhouette d'une montagne à plusieurs kilomètres, alors que la végétation locale, les collisions, les PNJ et la faune de cette montagne sont déchargés.

**Interdit comme palliatif principal :**
- `Fog` / `FogExp2` utilisés pour masquer une coupure des chunks ou dissimuler des objets absents.
- Fond uniforme qui fait disparaître brusquement les reliefs à la distance de clipping.
- Étendre la distance de chargement des meshes détaillés jusqu'à l'horizon.
- Utiliser partout un simple panorama fixe pour représenter des montagnes proches où la parallaxe de marche/planage devient évidente.

**Autorisé :** ciel stylisé, variation de couleurs avec altitude/distance pour l'unité artistique, faible perspective atmosphérique **non occultante** si désirée. Elle ne doit jamais être nécessaire à la continuité du paysage.

## 2. Architecture cible en couches indépendantes

```text
Caméra / frustum / altitude / vitesse / qualité GPU
    ├── Couche 0 : jeu proche      terrain LOD0, objets proches, eau et interactions
    ├── Couche 1 : monde moyen     terrain LOD1/2, végétation et bâtiments simplifiés
    ├── Couche 2 : paysage loin    terrain LOD grossier, lignes de crête, rives/îles visibles
    ├── Couche 3 : arrière-plan   silhouettes précalculées / imposteurs par direction
    └── Couche 4 : ciel           sky dome / skybox / panorama d'environnement
```

**Charger/simuler/dessiner sont trois décisions différentes :**
- La source auteur `WorldDefinitionV3` est inchangée quelle que soit la distance.
- Les **meshes et buffers de paysage** sont des ressources compilées/recalculables, jetables selon la mémoire.
- La **logique des entités** (états de PNJ, mécanismes, flags) vit indépendamment des meshes.
- La **vue globale 2D du Studio** ne charge pas automatiquement les couches 3D.
- **Aucune couche ne nécessite de serveur** pour fonctionner en solo ou sur GitHub Pages.

## 3. Stratégie de LOD du terrain

**Retenir un système spatial hiérarchique** (quadtree, anneaux de terrain, tuiles LOD ou équivalent) à évaluer sur le générateur actuel ; ne pas ajouter un moteur de terrain lourd si les secteurs V3 existants suffisent.

- LOD d'abord piloté par **erreur projetée à l'écran** / importance de silhouette, puis par distance ; intégrer FOV, hauteur de caméra, vitesse de planage et qualité GPU.
- Détailler fortement seulement la zone proche ; des **proxies terrain d'horizon** deviennent visibles bien au-delà de la distance d'activation des chunks détaillés.
- **Mailles cohérentes aux frontières** (échantillons compatibles, skirts et/ou morphing géométrique), éviter crevasses et clignotements.
- **Hystérésis + budget de remplacement** des meshes pour éviter le va-et-vient de LOD et les pics CPU/GPU ; se méfier des fondus qui doublent temporairement les appels de rendu.
- Mettre les reliefs lointains en **batches matériels** ; ne pas créer un `THREE.LOD` par arbre ou élément minuscule.
- Collisions/surfaces de gameplay proche **découplées** des LOD de rendu ; un LOD visuel ne change jamais l'altitude physique sous le joueur.

### Valeurs illustratives à mesurer, non contractuelles

| Bande visuelle | Terrain | Objets et végétation |
| --- | --- | --- |
| **0–100 m** | Source détaillée / LOD0 | Modèles et animation nécessaires |
| **100–400 m** | LOD1/2 géométrie simplifiée | Mesh low-poly/instancing |
| **400 m–1,5 km** | Relief coarse et silhouettes | Imposteurs, proxies/arbres simplifiés |
| **1,5–5 km** | Ligne de crête, côtes, grandes îles en meshes ultra-légers | Panoramas locaux/silhouettes précalculées si parallaxe acceptable |
| **Au-delà / ciel** | Panorama ou skybox pour éléments sans parallaxe significative | Aucun contenu détaillé actif |

Ces bandes sont **de simples scénarios**, à ajuster pour que l'horizon demeure cohérent sans dépasser 30/20 FPS. En particulier, une montagne visible depuis une falaise peut être conservée alors qu'un arbre de même distance est totalement supprimé.

## 4. Arrière-plan en image : quand et comment

**Trois techniques complémentaires :**

1. **Skybox / sky dome** : ciel, nuages et couleurs du très grand lointain, *sans parallaxe*. Solution idéale pour le ciel ; **mauvais remplacement pour un terrain situé dans les 10 km du monde** si le joueur peut s'en approcher.
2. **Imposteurs / panoramas précalculés** : textures sur quads orientés, couches par directions ou imposteurs à plusieurs vues pour **forêts, groupes d'arbres, bâtiments et reliefs très éloignés**. Nécessitent profondeur/masque/alpha ou géométrie proxy adaptée pour ne pas mal s'occulter derrière les collines.
3. **Proxy terrain 3D ultra-faible coût** : crêtes, côtes, îles, falaises et montagnes, reposant sur une **véritable géométrie simplifiée**. **Préféré** lorsque le joueur peut se déplacer/voler et modifier sensiblement la perspective.

**Décision recommandée : hybride géométrie d'horizon + imposteurs + ciel**, pas une unique photographie panoramique statique pour toute la carte.

Exemples :
- Une vallée forestière à 2 km : relief grossier 3D + grands volumes de forêt en imposteurs agrégés.
- Une montagne à 4 km : ligne de crête/proxy 3D, couleur simplifiée, aucun arbre individuellement chargé.
- Une île éloignée sur l'océan : silhouette 3D simplifiée, matériau peu coûteux.
- Nuages et ciel au-dessus : dôme/cubemap sans parallaxe.

### Précalcul et édition

- Prévoir un **pipeline de compilation optionnel** produisant silhouettes/proxies/imposteurs à partir de `generatorVersion`, sources par secteurs, biotopes et placements.
- Stocker `sourceHash`, version de recette, zone couverte, niveau de détail, altitude/angle de vue pris en charge et dépendances ; **invalidate/recompile uniquement les régions touchées**.
- Ne pas générer en temps réel des rendus panoramiques à 360° autour de chaque point de la carte : coût mémoire/stockage énorme.
- Pour objets dynamiques, joueurs, PNJ, bateau en déplacement et mécanismes interactifs : **ne pas cuire l'état temporel dans l'image de fond** ; rendre/synchroniser uniquement les éléments nécessaires.
- Règles de transition : suppression d'imposteur lorsque vrai objet apparaît, visibilité/occlusion cohérente, seuils avec hystérésis et priorité de chargement.
- Lorsque le joueur change rapidement de position/altitude (planage) : un proxy géographique stable est préférable à un panorama statique faux ; précharger les bandes de terrain dans le sens du déplacement.

## 5. LOD par famille d'éléments

| Type | Proche | Moyen | Lointain | Hors intérêt |
| --- | --- | --- | --- | --- |
| **Terrain** | Heightfield détaillé | LOD simplifié | Mesh de crête / proxy faible résolution | Ciel seulement si relief absent |
| **Arbres / forêt** | Instancing géométrique | Arbres très simplifiés | Massifs de forêt en silhouettes/imposteurs | Rien |
| **Herbes, fleurs, petits rochers** | Instances locales | Densité réduite/agrégats | Rien | Rien |
| **Bâtiments / ruines** | Prefab/meshes | Bâtiment fusionné ou proxy | Silhouette/carte de formes | Rien |
| **Personnages / PNJ** | Rig complet si nécessaire | Silhouette animée | Masqué ou image ponctuelle si pertinente | Aucun rendu, état logique conservé |
| **Eau / mer** | Shader/surface de jeu locale | Surface simplifiée/clipmap | Surface d'horizon à coût constant | Ciel, pas de simulation de vagues |
| **Particules / magie** | Effets budgetés | Effets réduits | Lueur/proxy si élément majeur | Rien |
| **Ombres** | Proches et importantes | Qualité/frequence réduites | Pas d'ombres dynamiques | Rien |

Les objets d'horizon peuvent conserver une silhouette identifiable (moulin, phare, grand arbre, ruine) **même si leurs petites décorations et leur animation détaillée disparaissent**.

Les PNJ et futurs autres joueurs ne doivent **pas** être cuits définitivement dans les panoramas ; les LOD des foules sont prévus dans [16](16-FUTURE-MULTIPLAYER.md).

## 6. Détail géométrique : optimiser ce qui est vraiment coûteux

**Ne pas optimiser uniquement les triangles.** Mesurer :
- **Draw calls**, nombre de meshes/materials et traversée d'objets par Three.js.
- Pixels ombrés / **overdraw de transparents** (arbres billboards et particules), shaders, ombres, bandes mémoire GPU.
- Génération/upload des géométries, frames longues, GC et cache.
- Taille des textures d'imposteurs, formats compressés si supportés, niveau de mipmaps, alpha bleeding et coûts de téléchargement.
- CPU du planificateur LOD, changement de tiers, création/suppression et distances de caméra.

**Instancing :** utiliser `THREE.InstancedMesh` pour des éléments qui partagent géométrie et matériau ; grouper **par région utile**, pas une instance sur 100 km² qui reste constamment dans un groupe visible.

**Billboards de forêts :** éviter une forêt géante avec un grand nombre de quads alpha opaques au GPU ; éventuellement **agréger par masses**, choisir alpha cutout/masques et comparer avec un mesh simplifié opaque.

**Profondeur Z :** un horizon kilométrique peut produire du z-fighting si le plan proche est trop petit et le lointain trop grand. Évaluer :
1. réglage raisonnable de `camera.near` et `camera.far`, en **gardant far proche pour les meshes détaillés** ;
2. rendu de fond/proxy dans un passage séparé si nécessaire, avec traitement correct d'occlusion ;
3. `reversedDepthBuffer` **seulement si `EXT_clip_control` disponible et benchmark favorable** ;
4. `logarithmicDepthBuffer` **pas activé globalement par défaut**, car il peut désactiver des optimisations d'early depth et accroître le coût d'overdraw.

Ces choix sont à vérifier dans la version de Three.js du projet et sur les GPU cibles. Ne pas augmenter aveuglément `camera.far` à 10 000 m tout en affichant toute la scène au même niveau de détails.

## 7. Studio : options utiles à exposer, sans interface complexe

**Éditeur Terrain / Carte globale :** aperçu du terrain complet à basse résolution, vue panoramique depuis une position, surimpression des limites de LOD, choix de marqueurs de points de vue.

**Éditeur Biotopes / Objets :** type d'objet pouvant avoir une silhouette lointaine, importance visuelle (ordinaire/repère), géométrie proxy/imposteur automatiquement générée si rentable, et aperçu côte à côte.

**Bibliothèque Assets :** métadonnées d'optimisation avec tailles mesh, matériaux, triangles, textures, LOD disponibles, version et licence ; avertir si un asset n'a aucun proxy et reste visible très loin.

**Éditeur Test / Performance :** commandes de qualité (auto/faible/normale), couches proches/moyennes/horizon activables individuellement, caméra fixe et répétition d'itinéraires à pied/planage/bateau, rapport de coût.

**Les seuils et caches de rendu sont une politique globale/technique** ; ne pas faire remplir à chaque auteur des distances en mètres sur chaque arbre.

## 8. Intégration avec les schémas V3

La **source auteur** reste indépendante du rendu. Ajouter aux **ressources compilées et au catalogue d'assets** (en mode facultatif) des dérivés :

```ts
// Exemples indicatifs ; aucune obligation d'ajouter immédiatement ces champs au V3.
interface RenderProxyDescriptor {
  sourceId: string;            // prefab, massif, chunk ou asset
  sourceHash: string;          // permet invalidation ciblée
  kind: "lowpoly" | "impostor" | "silhouette";
  boundsM: { min: [number,number,number]; max: [number,number,number] };
  supportedView?: { minHeightM?: number; maxHeightM?: number; angleCount?: number };
  materialRef?: string;
  meshRef?: string;
  textureRef?: string;
  recipeVersion: string;
}
interface HorizonData {
  worldId: string;
  generatorVersion: string;
  terrainProxyRefs: string[];
  landmarkProxyRefs: string[];
  biomeMassProxyRefs: string[];
}
```

Ce sont des **produits du compilateur**, pas des états persistants du gameplay. Le WorldCompiler peut les reconstruire depuis les sources. Les ressources statiques sont adressables avec `base: '/little-world/'` sur GitHub Pages.

**Impact de l'édition :** une sculpture de relief peut invalider le proxy terrain et la silhouette de forêt de plusieurs secteurs voisins, mais pas la totalité du monde ; l'index de dépendances V3 doit le savoir.

## Cas particulier : herbes courtes/hautes sans brouillard ni masse géométrique

La [spécification 18 — Herbes ultra-low-resource](18-GRASS-LOW-RESOURCE.md) précise le rendu de végétation basse :

- **Herbe courte** visuellement intégrée au sol du biome, sans maillage individuel à distance.
- **Herbe haute** en touffes 3D opaques uniquement proches, basculant progressivement vers les couleurs de sol/masses de végétation déjà représentées par terrain et proxies.
- Aucune vue de prairie ne doit nécessiter d'étendre les chunks détaillés ou d'activer du fog pour masquer l'arrêt des touffes.
- Le budget de l'herbe est **subordonné au paysage d'horizon** ; la réduction de densité ou `groundOnly` ne doit pas effacer les lignes de crête, îles et côtes.
- Toute animation de vent/réaction est purement locale, décorative et désactivable.

## Compatibilité avec la météo et le ciel nocturne

Le [document 19](19-ENVIRONMENT-WEATHER-SKY.md) valide **ciel étoilé, une ou plusieurs lunes à cycles propres, neige accumulée et lumière solaire évolutive**, en conservant une vue lointaine réelle.

- Les **proxies de terrain/horizon, îles et montagnes** reçoivent les **mêmes palettes jour/nuit et coefficients de neige** que le terrain proche, pour éviter une rupture visuelle.
- Les couleurs du ciel, du soleil couchant, des lunes et des étoiles **ne remplacent pas** la géométrie d'horizon.
- **Brouillard uniquement météorologique** : ne jamais réintroduire un fog fixe afin de masquer le manque de chunks; par beau temps, la visibilité longue reste disponible.
- La zone d'ombres dynamiques du soleil reste **proche du joueur** : les reliefs lointains utilisent un éclairage/proxy à faible coût, même lors des couchers.
- Prévoir scènes de test sur falaises, océan, montagnes enneigées et planage, à midi, aube, nuit étoilée et tempête.

## 9. Tests et portes de qualification

**Scènes à couvrir :**
- Fond de vallée avec collines masquant partiellement l'horizon.
- Crête/falaise, vue élevée à **plusieurs kilomètres**.
- Planage rapide : arrivée sur un relief, géométrie remplacée sans « pop », trou ni flash.
- Mer + côte + îles visibles au loin ; déplacement en bateau et rotation complète caméra.
- Forêt dense, bâtiments et grand monument/ruine.
- Mode éditeur après sculpture d'une montagne / plantation d'une forêt ; recalcul local d'horizon.
- Benchmark avec 20/40 avatars stylisés (simulation locale, sans introduire de multijoueur), pour tester coûts du rendu de foule.

**Comparer des variantes activables individuellement :** baseline actuelle ; uniquement terrain LOD lointain ; + proxies d'horizon ; + forêts simplifiées ; + imposteurs ciblés ; combinaison complète. **Même caméra, même graine, même contenu, même résolution**, sinon l'attribution du gain est invalide.

**Mesures minimales :** frametime CPU/GPU si possible, p50/p95/p99, FPS 30/20, draw calls, triangles, nombre de meshes actifs, overdraw estimé, mémoire géométries/textures, temps chargement et upload, temps de génération, bande passante, absence de trous et stabilité visuelle.

**Critères d'acceptation :**
1. Aucun brouillard utilisé pour dissimuler la distance de clipping.
2. Une crête/île visible de loin ne s'évanouit pas brutalement lors d'un déplacement.
3. Les montagnes et côtes proches ont une **parallaxe cohérente** ; seuls les objets suffisamment lointains peuvent devenir panoramas/imposteurs.
4. La disparition de végétation n'entraîne pas de basculement visible de la silhouette globale.
5. Aucun LOD ne modifie collisions, navigation ou états de gameplay.
6. La vue panoramique n'entraîne pas la génération/activation de l'ensemble des chunks, faunes et PNJ.
7. Les opérations d'édition invalident les dérivés affectés et sont compatibles Undo/Redo V3.
8. Qualité auto/fallback reste compatible **30 FPS normal, 20 FPS secours** sur matériel mesuré ; aucun résultat inventé.

## 10. Phases d'implémentation recommandées

| Étape | Action | Gate |
| --- | --- | --- |
| **HZ-0** | Instrumenter/baseline : vallée, falaises/planage, océan, forêt, GPU intégré | Comparaison à contenu et caméra identiques |
| **HZ-1** | Horizon géométrique basse résolution **indépendant du chargement proche** | Montagnes/côtes à kilomètres, sans fog ni trous |
| **HZ-2** | Politique LOD/erreur écran, hystérésis, transitions et préchargement directionnel | Pas de popping critique en planage |
| **HZ-3** | LOD forêts, bâtiments, repères paysagers, instancing par secteurs | Baisse de rendu/CPU mesurée à silhouette conservée |
| **HZ-4** | Proxies/imposteurs précalculés lorsque rentables, atlas/contrôle d'occlusion | Parallaxe acceptable, textures/overdraw bornés |
| **HZ-5** | Compilation/invalidation locale V3, diagnostics et preview dans Studio | Modification de relief mise à jour sans reconstruire toute la carte |
| **HZ-6** | Réglages adaptatifs, batteries de tests 30/20 FPS et régressions visuelles | Résultats mesurés, profil GPU intégré, aucun brouillard-cache |

**Ne pas développer toutes les étapes dès maintenant par simple exigence de compatibilité.** La première valeur concrète est un **horizon de relief simplifié** distinct de l'aire détaillée actuelle, avec un benchmark.

## 11. État actuel et décisions à ne pas confondre

**Existant d'après le code `main` examiné** :
- `src/chunks.ts` : rayon de vue autour de la caméra, 3 LOD et hystérésis.
- `src/terrain-view.ts` : maillages de terrain avec échantillonnage 2,5 / 5 / 10 m, jupes et cache GPU borné, au plus 2 meshes créés par mise à jour.
- `src/world.ts` et `src/ecology.ts` : instancing local de végétation/faune.
- `src/npc.ts` : classes de distance/simulation, représentation simplifiée.
- `docs/10-PERFORMANCE-ROADMAP.md` : benchmarks logiciel SwiftShader non représentatifs d'une preuve de 30 FPS GPU intégré.

**Manque identifié :** découplage horizon / distance d'activation du terrain local ; terrain « de très loin » avec maillages pauvres mais visibles, proxies de côtes/îles/monuments, baking d'imposteurs conditionné par la parallaxe, tests de panorama/crête, politique de rendu de ciel et transitions garanties sans brouillard.

**Politique produit :** vue large sans fog. **Politique technique :** réduire progressivement la complexité de la géométrie et des shaders, pas augmenter aveuglément les rayons de simulation. **Mesures :** chaque gain sera qualifié en comparaison équitable, pas sur une scène différente.
