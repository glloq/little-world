# 58 — Audit et roadmap graphismes LOW-RESOURCE (16 novembre 2026)

> **Statut : proposition documentée, sans modification du runtime.** Référence : `main@5001f868d10127368c88d8bb68ab8f2fd3798bb9`. Le code et les documents ont été inspectés via GitHub, sans exécution locale ni nouvelle qualification matérielle. Les anciens documents de branche peuvent mentionner « non fusionné » : comparer les ancêtres Git avant de conclure. Ne pas traiter les tests historiques comme une validation du HEAD courant.
>
> **Objectif :** améliorer sensiblement la lisibilité, l'unité artistique et la vie des paysages de Little World (île 4 × 3 km, PC à GPU intégré) **sans multiplier les passes GPU, les objets actifs, les textures ou les mises à jour CPU**. Éviter toute régression du jeu, du Studio et de la compatibilité V3.

Documents de référence : [LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [PERF](22-RESOURCE-BUDGET-MANAGER.md), [profondeur de vue](17-DISTANT-VIEW-RENDERING.md), [météo](19-ENVIRONMENT-WEATHER-SKY.md), [eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [imposteurs](55-HYBRID-DISTANT-RENDERING.md), [culling](56-RENDER-PREPARATION-CULLING.md), [couverture du sol](57-GROUND-COVER.md), [falaises](53-CLIFF-REFERENCE.md), [contrats Studio V3](15-STUDIO-DATA-SCHEMAS-V3.md).

## 1. Résultat de l'audit : ce qui EXISTE déjà

| Domaine | Présent dans le code | Reste à qualifier ou améliorer |
| --- | --- | --- |
| Rendu et adaptation | `src/main.ts` : Three.js/WebGL, sRGB + ACES, `PresentationBudget` 30/20, ratios adaptatifs ; `render/perf-sampler.ts` : p50/p95/p99 CPU et requêtes GPU asynchrones si disponibles | Matériel iGPU réel, causes fill-rate, antialias WebGL toujours demandé, régressions lors de chargement |
| Terrain/horizon | `terrain-view.ts`, `terrain-data.ts`, `horizon-view.ts` : chunks LOD, couleurs/normales compactées, workers, couverture d'horizon et mer annulaire | Interpolations LOD, écotones, silhouettes lointaines, cache au retournement et en vol |
| Couverture et herbes | `geography/ground-cover.ts`, `geography/materials.ts`, `render/grass.ts` : palette partagée, groupements larges, 16 m/cellule, 3 triangles/touffe opaque, 1 InstancedMesh, vent GPU, 2 influences maximum, profils `dense/balanced/ultra/groundOnly` | Transitions près/loin, flatness `groundOnly` à caméra basse, variations de silhouettes sans densification |
| Falaises | `render/cliff-view.ts` : strates/fractures, vertex colors, LOD0/1, budget 32 segments proches / 3 constructions par update | Éboulis, raccord terre/mousse, silhouettes volcaniques et détails à base de géométrie existante |
| Eau | `water/geometry.ts`, `water/sectors.ts` et `world.ts::refreshWater` : rivière/lac/cascade géométriques, maillage simple Lambert ; `horizon-view.ts` : océan | Nuances profondeur/courant, écume localisée, lumière et raccords sans transparence coûteuse |
| Lumière/ciel/météo | `environment/sky-lighting.ts`, `environment/view.ts` : fond uni variable, soleil/fill/hémisphère partagés, pluie GPU locale ; `lighting/light-view.ts` : peu de point lights et halos | Ciel dégradé, horizon, contact et atmosphère stylisée ; pas de neige/lunes/étoiles livrées à supposer |
| Assets | `world-production/placed-instances.ts` : regroupement maisons statiques et décors ; `world.ts` : matériaux partagés, GLB multi-LOD, conversion couleurs | Cohésion des palettes, détails perceptibles, contrôle des pivots et de la lecture au loin |
| Imposteurs | `render/representation-policy.ts`, `impostor-sectors.ts`, `dressing-view.ts` : atlas partagés, secteur 512 m profil utilisateur, culling/hystérésis, profil expérimental désactivé par défaut | Qualité des bascules, surcoût de fill-rate/alpha-test, performance iGPU avant activation automatique |
| Studio et tests | `studio/viewport/editor-viewport.ts` partage les lumières, test de nuit ; nombreux outils de comparaison dans `tools/` et baselines versionnées | Référence artistique fixe, captures A/B scène identique, profils de performance réels, inspection des changements au Studio |

### Résultats existants — ne pas surinterpréter

- [Hybride île complète](55-HYBRID-DISTANT-RENDERING.md) : forêt 46 467 → 39 704 triangles, 84 → 89 appels, p50 98,0 → 103,4 ms sous SwiftShader (hybride 256 m) : **moins de triangles ne signifie pas un rendu plus rapide**. Profil arbres 512 m facultatif, non validé sur iGPU.
- [Bâtiments regroupés](56-RENDER-PREPARATION-CULLING.md) : fixture de 40 maisons, 40 → 1 appels avec `WEBGL_multi_draw`, 3 200 triangles inchangés et image identique ; vérifier le chemin sans extension. Au village, les appels 179 → 140 dans une passe contrôlée.
- [Couverture du sol](57-GROUND-COVER.md) : panorama 141 → 140 appels et 74 008 → 67 850 triangles ; couleur seule de 100 000 points CPU 3,87 → 12,21 ms, mais une tuile LOD0 réelle 5,78 → 4,89 ms après réutilisation des gradients. Les résultats sont locaux, pas une preuve GPU.
- [Falaises](53-CLIFF-REFERENCE.md) : nouvelle géologie/assombrissement dans les vertex colors **sans nouvel appel, triangle ou shader**, aucun coût par frame ajouté. La palette et les formes restent à améliorer.
- **CI :** workflow de déploiement `main@5001f868` réussi le 16/11/2026 ; les exécutions de validation des derniers commits étaient encore en cours lors de l'audit. Ce document ne revendique aucune campagne de tests nouvellement exécutée.

### Risques concrets déduits du code

1. `src/main.ts` construit `WebGLRenderer({antialias:true})` y compris quand la qualité se dégrade : comparer un contexte sans MSAA sur l'iGPU, avec coût de recréation du contexte. Ne pas basculer sans mesure d'aliasing.
2. `src/environment/view.ts` définit `scene.background` comme couleur uniforme : fort potentiel de gain visuel, coût quasi nul côté logique ; préférer shader de fond fixe / dégradé procédural léger à une volumétrie.
3. `world.ts::refreshWater` dessine des rubans avec une couleur Lambert unique ; la mer de proximité utilise aussi une surface translucide étendue. Attention à l'overdraw et aux surfaces coplanaires.
4. `render/grass.ts` utilise un seul `InstancedMesh` avec `frustumCulled=false`, choix favorable aux appels mais défavorable aux cas où une large fraction est hors-champ : tester avant de segmenter en plusieurs draw calls.
5. `render/cliff-view.ts` rend les faces en `DoubleSide` : vérifier l'orientation des faces et les vues sous/au-dessus avant d'expérimenter `FrontSide` ; ne pas créer de trous.
6. Le contrôleur adaptatif livré est `PresentationBudget`, pas le `ResourceBudgetManager` complet spécifié : **ne pas créer de second arbitre graphique concurrent**.
7. Les bascules d'imposteurs sont franches avec hystérésis, **pas** des crossfades ; un fondu permanent doubles les coûts. Tester uniquement des transitions ciblées.
8. Moteur de lumière principal sans shadow map globale ; les points lumineux locaux sont sans ombre. Réduire les impressions de flottement par couleurs de contact avant toute vraie shadow map.

## 2. Règles de conception à préserver

- **Unifier la direction artistique** : palettes terre/roche/plante/eau/toit, contraste moyen/lointain, cohérence aube-midi-soir-nuit et Studio/game.
- Ne jamais cacher une limite de rendu par du brouillard dense. Préserver la silhouette 3D, le relief et la perspective de l'île.
- Préférer les couleurs de sommets, les formes réutilisées et les variations déterministes à la création de textures massives ou de maillages de détail partout.
- Pas de SSAO plein écran, SSR, post-traitement multi-passes, shader PBR lourd pour chaque asset, ombres générales, reflets d'eau calculés par caméra secondaire ou nuages volumétriques en première intention.
- Protéger les budgets CPU de génération/streaming ; les micro-tâches synchrones peuvent toujours provoquer une longue frame même si la queue est bornée.
- **Sources V3 ≠ proxies calculés**. Les atlas, maillages de détail, effets graphiques et caches restent des dérivés ; ne pas polluer les projets/sauvegardes. Invalidation géographique locale et révisions correctes après Undo/Redo.
- L'identité des acteurs, leur simulation, leurs collisions et leur réplication future restent indépendantes de leur représentation LOD.
- Une modification artistique ne doit pas dégrader l'ergonomie du Studio ni la visibilité du personnage, des chemins, des objets interactifs et des ressources.

## 3. Roadmap incrémentale (une petite PR par lot, modes A/B explicites)

| Lot | Priorité | Action principale | Coût attendu | Dépend |
| --- | --- | --- | --- | --- |
| **GFX-0** | **P0, impératif** | Baseline reproductible et référence artistique | Outillage | — |
| **GFX-1** | **P0** | Palette terrain/biomes + continuité des couleurs | Quasi nul GPU ; génération CPU à mesurer | GFX-0 |
| **GFX-2** | **P0** | Ciel léger, horizon et lumière harmonisée | Faible si ≤1 passe de fond | GFX-0/1 |
| **GFX-3** | **P0** | Contact visuel et profondeur sans shadow map mondiale | Faible à mesurer | GFX-1/2 |
| **GFX-4** | **P1** | Eau, rivières, berges et cascades | Faible/moyen selon fill-rate | GFX-1/2 |
| **GFX-5** | **P1** | Falaises : silhouettes, éboulis, végétation de rebord | Génération locale + quelques instances | GFX-1 |
| **GFX-6** | **P1** | Herbes, arbres et écotones : distribution et LOD artistiques | Sans hausse de densité cible | GFX-1/5 |
| **GFX-7** | **P1 conditionnel** | Distant : atlas, secteurs, transition, coût d'imposteur | **Potentiellement négatif** ; A/B obligatoire | GFX-0/2/6 |
| **GFX-8** | **P2** | Cohésion artistique bâtiments, props et personnages | Vertex colors/LOD, sans meshes systématiques | GFX-1/3 |
| **GFX-9** | **P2 expérimental** | Vie du monde : petits effets météo et végétation | GPU/local borné | GFX-2/6 |
| **GFX-10** | **P0 transversal** | Qualification visuelle et performance de chaque lot | Tests et mesures | Tous |

### GFX-0 — Baseline / captures de référence

- Reprendre les scripts existants `benchmark:hybrid-island`, `benchmark:ground-cover`, `benchmark:route`, `test:render-budget`, `capture:views` plutôt qu'un deuxième banc de rendu.
- Capturer les **mêmes graines, caméra, heure, météo, viewport, framebuffer et mode de qualité fixe** : forêt dense, prairie caméra basse, village/lac, rivière/cascade, volcan/falaise, panorama/vol, côte/océan, intérieur de mine ; prévoir jour/coucher/nuit pour les scènes pertinentes.
- Captures froides (chargement initial, streaming/retournement, téléportation) et stabilisées ; compléter par parcours dynamique, où les blocages de 1 % des frames apparaissent.
- Export JSON : renderer matériel, extension de timer GPU, framebuffer, FPS de présentation, p50/p95/p99 intervals, simulation/update/submit CPU, GPU mesuré ou `null`, draw calls, triangles, uploads, secteurs, cache et mémoire **estimée**.
- Matrice : Chrome + Firefox sur un **PC de référence réellement équipé d'un GPU intégré**, 1600×900 et plus petite résolution de diagnostic, profils Auto et budget fixé.
- **Gate :** baselines et captures publiées ; aucune affirmation 30/20 FPS ou gain GPU sans mesure matérielle. Les écarts doivent être attribuables à un unique interrupteur de test.

### GFX-1 — Palette et matière géographique

- Sur `src/geography/materials.ts`, `ground-cover.ts`, `surface.ts` : formaliser une **palette canonique** de biomes et familles de matériaux. Retoucher séparément saturation, luminosité et contraste, sans transformer la classification.
- Accentuer par calcul à la génération (pente, altitude, humidité, strates et luminosité de facette) les éléments qui rendent le relief lisible ; conserver cohérence sRGB→linéaire et Lambert/ACES.
- Éviter le bruit chromatique trop fin qui disparaît à l'horizon. Traiter les écotones/masques auteur par transition **uniquement si la source permet un gradient contrôlé** ; ne pas inventer un nouveau biome.
- **Gate :** surface/LOD/horizon sans rupture de teinte artificielle ; temps de construction des vraies tuiles LOD0/1/2 et cache inchangés ou justifiés ; zéro nouveau draw call.

### GFX-2 — Ciel, profondeur et horaire

- `src/environment/view.ts` + `sky-lighting.ts` : passer du fond uniforme à un **dégradé de ciel procédural** dépendant de l'altitude solaire et de la couverture nuageuse ; préserver la visibilité des crêtes 3D sans fog-cache.
- Harmoniser tonalités lointaines via lumière/matériaux existants et non via opacité exponentielle. Nuages stylisés **optionnels**, peu de couches, sans volumétrie ni ombre nuageuse globale. Lunes/étoiles : proposer séparément après comparaison visuelle.
- Même paramétrage dans `src/studio/viewport/editor-viewport.ts` pour prévisualisation nuit/jour ; ne pas dupliquer l'horloge/climat.
- **Gate :** comparaison horizon/océan avec coucher et nuit, aucune teinte « carte postale » brûlée par ACES, aucun artefact de parallaxe ; zéro passe plein écran supplémentaire de post-traitement, coût GPU mesuré.

### GFX-3 — Ombrage de contact économique

- Commencer par **assombrissement de vertex colors** pré-calculé sous rochers/falaises, à l'implantation d'objets statiques et sur les rebords, sans introduire de fausse occlusion directionnelle.
- Tester une ombre de contact stylisée du **personnage local seulement**, très limitée en surface, sans texture pleine résolution ni centaines de disques transparents ; si elle ne gagne pas artistiquement, revenir au simple shader/matériau.
- Les shadow maps solaires locales restent **une expérience optionnelle et réversible** : mesurer casters, passes et budget GPU d'abord, ne jamais les activer sur toutes les maisons.
- **Gate :** silhouette/lisibilité de nuit et au soleil, absence de halos flottants ; pas de régression nette sur les scènes forêt/village.

### GFX-4 — Eau lisible et low-poly

- `src/water/geometry.ts`, `src/world.ts::refreshWater` : attribuer des couleurs déterministes par section (profondeur proxy, largeur, type lac/rivière/cascade) **sans accroître le maillage sans nécessité** ; distinguer eau calme, rapides, source chaude et chute avec les données disponibles.
- Tester des **bandes d'écume locales opaques** sur obstacles/cascades et rives sélectionnées ; pas d'overlay translucide sur des kilomètres. Une animation UV ou sommet très faible doit rester pilotée par uniforms/temps (et dormir si invisible).
- Réévaluer le coût de la mer translucide proche dans `src/horizon-view.ts` à l'écran entier ; garder l'anneau de mer/les côtes cohérents et éviter z-fighting.
- Ne pas modifier hydrographie, baignade, bateau, collisions ni contours V3 dans ce lot.
- **Gate :** vues rivière, cascade, lac, côte, sous l'eau ; profondeur visuelle, absence de trous/raccords, coût GPU mesuré sur océan plein écran, pas de régression jeu.

### GFX-5 — Falaises plus naturelles sans lourdeur

- Conserver le heightfield comme autorité du relief/collision ; surfaces `render/cliff-view.ts` purement visuelles, LOD0/1, budget proche 32 maillages et reconstruction bornée.
- Variantes déterministes de silhouette, fracturation basaltique, strates lisibles et quelques **éboulis groupés**/mousses aux pieds et rebords ; privilégier couleurs de sommet et géométrie déjà existante.
- Adapter l'intensité aux cinq références de `docs/53-CLIFF-REFERENCE.md`; attention aux faces inversées, au `DoubleSide` et aux jonctions entre segments.
- **Gate :** cinq types, pente, basalte, plateau, raccords et LOD ; comptages CPU/GPU et proximité/collision identiques ; pas d'éboulis sur l'ensemble de l'île.

### GFX-6 — Herbes, forêt et transitions de végétation

- Conserver `src/render/grass.ts` : profils existants, **3 triangles/touffe**, buffers partagés, vent et deux influences ; ne pas déployer de billboards pour l'herbe lointaine.
- Dans `geography/ground-cover.ts`, `biomes.ts` et `geography/dressing.ts` : mieux répartir buissons, bouquets, ruptures de densité, clairières et teintes par biotope ; ne pas doubler des milliers d'objets.
- Inspecter le compromis **un InstancedMesh sans frustum culling** versus petits lots proches : ne segmenter que si le gain CPU/GPU sur une prairie réelle dépasse les draw calls ajoutés.
- Tester caméra basse, en vol, terrain en pente, clairière/forêt, route, ferme, eau et masques d'exclusion ; une faible silhouette de végétation près du joueur vaut mieux qu'un tapis dense à distance.
- **Gate :** aucun nouveau matériau par touffe, profil `groundOnly` toujours disponible, pas de mise à jour de buffers à l'arrêt ; performances et captures inchangées sur les configurations désactivées.

### GFX-7 — Rendu lointain : optimiser, ne pas généraliser

- Reprendre `representation-policy.ts`, `impostor-sectors.ts`, `dressing-view.ts`, `placed-instances.ts` et les fichiers `docs/55`–`57`. Évaluer d'abord le gain réel des secteurs 256/512 m avec matériel natif.
- Examiner les **draw calls supplémentaires, l'alpha-test, l'overdraw et le surcoût d'uploads** versus silhouettes géométriques à 4–8 triangles ; optimiser avant d'augmenter les distances d'activation.
- Rapprocher visuellement teintes/jour-nuit, silhouettes de canopée et changements d'orientation d'atlas. Hystérésis déjà en place ; si popping visible, tester dither/transitions **très courtes, ciblées et plafonnées**, jamais une double représentation permanente.
- Garder `impostors=off` et le profil utilisateur classique par défaut tant qu'un gain GPU réel n'est pas établi. Personnages lointains = présentation ; aucune fréquence réseau introduite.
- **Gate :** scènes forêt/village/panorama/vol, cache et ressources libérées, tests `test:hybrid`, `test:hybrid-map`, `test:impostor-optimization`, trajet aller-retour ; aucun upgrade par défaut sur la foi du seul nombre de triangles.

### GFX-8 — Bâtiments, objets et personnage

- Standardiser des **palettes et contrastes** communs (bois, pierre, enduit, toiture, métal, tissus) au niveau source GLB/vertex colors ; détails lisibles à l'écran plutôt que microgéométrie invisible.
- Préserver LOD0/1/2, caches de géométrie/matériaux, `BatchedMesh` statique et traitements distincts des objets interactifs, animés et miroirs ; ne pas réintroduire le bug d'hystérésis LOD corrigé (`0.02` au lieu de `2`).
- Joueur local/PNJ : prioriser silhouette, animation et ombre de contact légère ; ne pas mettre à jour des accessoires invisibles à 300 m.
- **Gate :** tests d'équivalence visuelle, sens des faces et partage GPU ; pas d'augmentation systématique des appels par maison.

### GFX-9 — Petits effets de monde vivant (expérimental)

- Étudier seulement après les lots P0 : vent subtil sur feuillage, poussières localisées, feuilles et éclats près d'une action, oiseaux/insectes aux zones pertinentes, nuages stylisés légers.
- Utiliser les mêmes sources temps/vent/météo, petits buffers recyclés, culling spatial ; réduire/masquer les éléments cosmétiques en qualité `ultra` ou lorsque la caméra vole.
- **Gate :** coût CPU/GPU et transparence mesurés ; aucun effet cosmetic ne doit occulter des indices de gameplay ni provoquer d'upload permanent au repos.

### GFX-10 — Qualification et livraisons

Chaque PR ajoute : une scène A/B contrôlée, captures avant/après, mesures CPU/GPU si disponible et `null` sinon, profil de qualité inchangé, allocation/mémoire estimée, tests déterministes, Studio Undo/Redo et export V3, lancement statique GitHub Pages et note des limites. Le résultat **n'est pas marqué qualifié** si l'exécution n'a couvert que SwiftShader.

## 4. Ordre conseillé de réalisation

1. **Premier bloc à haute valeur :** `GFX-0 → GFX-1 → GFX-2`. Les couleurs et le ciel unifiés doivent être établis avant de juger les effets restants.
2. **Deuxième bloc :** `GFX-3` et `GFX-4` en PR indépendantes ; le contraste/ombrage est transverse, l'eau a un coût fill-rate distinct.
3. **Troisième bloc :** `GFX-5 → GFX-6` ; relire et préserver le travail déjà livré sur falaises et couverture du sol.
4. **Quatrième bloc :** `GFX-7` uniquement si les mesures de référence montrent un intérêt ; `GFX-8` peut être indépendant.
5. **Dernier bloc optionnel :** `GFX-9`. `GFX-10` est une porte de qualification continue, pas une grosse campagne différée.

**Stratégie de branches :** créer `feat/gfx-01-palette`, `feat/gfx-02-sky`, etc. depuis `main` courant, PR petites et réversibles ; ne pas repartir de l'ancienne branche hybride, intégrée. Ne pas merger des fonctionnalités expérimentales au mode par défaut avant qualification. Ne jamais supprimer une branche divergente sans audit du commit propre (ex. `claude/studio-inspector-edit-guard`, lié à l'UX Studio).

## 5. Définition de « gain graphique à faible coût »

| Mesure | Exigence / seuil |
| --- | --- |
| Performance | **30 FPS cible, 20 FPS secours**, simulation 30 Hz indépendante ; aucune garantie tant que l'iGPU de référence n'est pas mesuré |
| Qualité | Images identiques selon caméra/seed/heure pour les contrôles A/B ; différences artistiques explicables et acceptées ; pas de popping/fissures visibles |
| CPU/GPU | Comparer p50/p95/p99 et mesure GPU native si possible ; coût de génération/chargement séparé du coût stable |
| Draw calls / triangles | Compteurs diagnostiques, **jamais** preuves uniques de fluidité |
| VRAM | Estimation des textures/arrays et suivi du cache, **pas** compteur VRAM pilote inventé |
| Effets plein écran | Aucun post-processing multi-passes ajouté en P0/P1 ; mer/ciel à mesurer en framebuffer réel |
| Robustesse | Repli si WebGL extension absente, perte de contexte, atlas absent, ressource lente ou matériel réduit |
| Studio/V3 | Pas de changement source V3 obligatoire pour un effet dérivé ; prévisualisation, Undo/Redo, export ZIP, compilation et migration inchangés |
| Multijoueur futur | Contrat d'identité/snapshot indépendant du LOD, pas d'implémentation réseau dans cette roadmap |

**Cible de décision pratique par effet :** conserver uniquement un changement dont le bénéfice visuel est visible à caméra identique et dont le surcoût p95 GPU/CPU est faible et reproductible. En cas d'écart soutenu >5 % du p95 de frame (seuil de tri **provisoire**, pas garantie de précision statistique), corriger, rendre optionnel ou rejeter ; ne pas masquer la régression par une baisse automatique de qualité pendant la comparaison. Refaire au moins plusieurs séries et vérifier le scénario pire cas.

## 6. Commandes pour reproduire / vérifier (sans prétendre les avoir exécutées ici)

```sh
npm ci --no-audit --no-fund
npm test
npm run typecheck
npm run build
npm run check:impostors
npm run check:world-assets
npm run test:render-budget
npm run test:hybrid
npm run test:hybrid-map
npm run test:ground-cover
npm run test:cliffs
npm run test:environment
npm run test:water
npm run test:studio
npm run benchmark:hybrid-island -- http://127.0.0.1:5173/little-world/ /tmp/hybrid-island
# Pour iGPU réel seulement : vérifier le renderer retourné par le navigateur.
HYBRID_GPU=default npm run benchmark:hybrid-island -- http://127.0.0.1:5173/little-world/ /tmp/hybrid-iGPU
```

Les tests Playwright demandent l'installation Chromium et un serveur Vite/preview au bon port, conformément au CI. La plupart des rapports existants sont sous `docs/benchmarks` ; **ne pas remplacer** les baselines précédentes, versionner une nouvelle campagne distincte. Éviter de comparer des dates, cartes ou résolutions différentes comme des preuves de gain.

## 7. Décisions immédiates

- **Démarrer par GFX-0 puis GFX-1/GFX-2**. Le plus grand gain visuel probable est la qualité de la couleur et de la lumière à coût presque constant.
- Ne pas remplacer les moteurs terrain, biomes, herbes, falaises, eau ou imposteurs : leur architecture et leurs tests sont déjà substantiels.
- Reporter les shadow maps globales, la volumétrie et les reflets lourds ; conserver l'hybride optionnel.
- Intégrer les améliorations visuelles au **renderer et aux données dérivées**, pas aux règles du gameplay ni aux sources auteur V3.
- Après ces trois premiers lots, reclasser eau/falaises/lointain selon les captures et les chiffres du matériel cible.
