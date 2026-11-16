# Rendu distant hybride — phases A à F

Branche issue de `main` b761b23 (PR #25 déplacements et évolutions Studio déjà intégrées).

## A — audit et baseline avant modification

- Terrain LOD0/1/2, planification caméra/direction/vitesse dans `chunks.ts`, cache temps/octets
  dans `terrain-view.ts` : conservés. Horizon géométrique et masque de couverture conservés.
- `dressing-view.ts` : deux BatchedMesh GLB, huit familles procédurales instanciées, cache proche
  et canopée collective issus du même classificateur. La canopée n'est pas à recréer.
- `placed-instances.ts` : deux lots GLB, hystérésis et culling individuel ; monuments individuels
  et animations de moulins dans `world.ts`. Pas d'atlas imposé aux petits objets/parties animées.
- PNJ : logique distincte, rig proche et proxy à cinq parties. Présentation distante v1 déjà
  disponible pour le hamster ; ni tampon de snapshots ni atlas animé présents avant ce travail.
- `FrameClock` et `PresentationBudget` sont l'unique régulateur réel. Le document 22 décrit une
  cible, pas un ResourceBudgetManager déjà implémenté : étendre cet arbitre, sans le doubler.
- Incohérence corrigée : `updateCamera` était appelé après `world.update`, qui consommait donc
  la caméra précédente pour LOD, frustum et occlusion. Déplacé avant les consommateurs visuels ;
  aucune modification de simulation/contrôles.

Baseline versionnée : `docs/benchmarks/hybrid/baseline/route.json` et `horizon.png`.
Commande existante, avant changement :

```sh
BENCHMARK_SCENARIOS=island-3x8 \
BENCHMARK_EXTRA_QUERY='world=maps/production-reference/manifest.json&spawn=-250,230&yaw=.2&pitch=.3&dist=35' \
node tools/benchmark-route.mjs http://127.0.0.1:5173/little-world/ /tmp/hybrid-baseline
```

Le nom historique de scénario reste island-3x8, mais la query surcharge le monde par la
référence World Production. Chromium/SwiftShader 960×640 : p50 83,4 ms, p95 183,4 ms,
p99 300 ms, appels moyens 73,64, triangles moyens 66 621 ; huit vues de contrôle sans trou
mesuré, aucune erreur. Ce n'est pas une qualification GPU ni une promesse de FPS.

## B–D — architecture réellement implémentée

Les imposteurs sont **optionnels, désactivés par défaut**. La géométrie actuelle est le repli
pour un atlas absent, périmé, hors quota ou une espèce non couverte. Les données auteur,
collisions, activités, export V3 et sauvegardes restent indépendants de cette représentation.

- `src/render/representation-policy.ts` : choix par taille projetée, famille, importance,
  FOV, hauteur du framebuffer et qualité ; hystérésis 15–18 %. Consomme les niveaux du
  `PresentationBudget` existant, qui expose aussi ses quotas. Aucun second régulateur.
- `impostor-manifest.ts`, `impostor-atlas.ts`, `resource-cache.ts` : manifeste validé avant
  allocation, chargement différé statique base-aware, atlas partagés par référence, LRU
  des ressources non détenues, destruction des textures/métadonnées lorsque libérées.
- `impostor-sectors.ts` : un quad de deux triangles par instance, un mesh par secteur,
  atlas/matériau communs, alpha-test opaque avec profondeur ; orientation choisie dans le
  vertex shader, pas un Sprite/matériau par arbre. Frustum Three.js par sphères conservatives.
  Les buffers ne réallouent pas à chaque frame. Les uploads de données des personnages
  restent nécessaires à chaque présentation ; la forêt ne réécrit que lors d'un redraw existant.
- `dressing-view.ts` : les instances remplacent seulement les silhouettes GLB éloignées
  éligibles. Les arbres proches, caches/workers, anneaux de canopée, occultation relief,
  masques de coupe et invalidations locales existants restent utilisés. Pas de forêt doublée.
- `world.ts` : éligibilité limitée à `castle_keep` et `church`, sans inclinaison ; moulins,
  phares animés, bâtiments génériques, landmarks et petites structures conservent leurs LOD.
  Terrain, horizon, falaises et océan restent intégralement géométriques.
- `hybrid-controls.ts` : panneau repliable du viewport Studio, comparaison depuis la même
  caméra, modes géométrie/arbres/monuments, secteurs 256/512 m, limites des secteurs en rose,
  compteurs et seuils projetés. Aucun réglage enregistré dans le projet.

### Lancement et génération

```sh
npm run dev
# Jeu, production de référence ; remplacer trees par all ou off
# /little-world/?world=maps/production-reference/manifest.json&impostors=trees&metrics=1
# Ajouter &remoteActors=10 (ou 50/100) pour le simulateur
# Ajouter &impostorSectors=512 pour comparer les cellules plus grandes
npm run generate:impostors
npm run check:impostors
node tools/test-hybrid-browser.mjs
node tools/benchmark-hybrid.mjs
```

Dans le Studio, ouvrir « Rendu distant · expérimental » en haut à droite de la vue.
Les atlas sont dans `public/impostors/`, accessibles après build sous le même préfixe statique
que les modèles. Le baker Playwright/Vite/Chromium est un outil hors runtime ; il n'entre pas
dans les bundles Studio/jeu. Aucun service externe ni nouvelle dépendance.

Le générateur compare les empreintes SHA256 des GLB, paramètres et code du baker. Une
modification d'un arbre reconstruit la page arbres, pas celle des personnages/bâtiments.
Une page contient quatre orientations, deux élévations pour arbres/monuments, trois pour
les personnages (−60°, 0°, +60°, donc dessus/dessous du planage). Pixels sans mipmaps,
gouttière transparente d'un pixel, ancrage du pied par frame. Arbres : 64²/frame ; hamster :
48²/frame, cadrage personnage de 2,8 m, neuf états × trois frames à 4 Hz, interpolation spatiale indépendante.

### Budgets et seuils

Les seuils sont en **pixels projetés**, donc pas des distances fixes : arbres 90/32/7/1 px,
bâtiments 100/35/8/1 px, personnages 32/14/3/0,65 px. À 66° et 720 pixels de hauteur,
un arbre de 10 m atteint 32 px vers 173 m ; un personnage de 1,2 m atteint 14 px vers 48 m.
La zone proche des arbres conserve en plus ses seuils GLB existants (60/170 m) ; l'atlas
n'intervient que dans l'anneau lointain. Maxima de politique : arbres 2 km, bâtiments 2,4 km,
personnages 1,8 km ; les rayons d'habillage existants peuvent réduire cette portée.

| Ressource | Normal / dégradé / secours |
|---|---|
| Sprites nouveaux, forêt + monuments + simulateur | 4 096 / 3 072 / 2 048 |
| Secteurs actifs correspondants | 32 / 24 / 16 |
| Réservation monuments / simulateur | 64 + 100 instances, 4 + 8 secteurs |
| Rigs complets du simulateur | 12 / 8 / 4 |
| Cache de secteurs, par consommateur | 32 maximum ; 512 instances/secteur |
| Atlas et métadonnées partagés | 5 463 232 octets pour les trois pages actuelles |
| Limite manifeste/cache atlas | 12 Mio, pages ≤ 2 048², ≤ 1 024 frames/page |
| Historique distant | 100 identités, 12 snapshots/identité, extrapolation ≤ 250 ms |

Les quotas ne suppriment jamais un arbre : l'instance refusée garde son proxy géométrique.
La limite de rigs concerne les personnages simulés, pas le joueur local ni les PNJ déjà
existants. Les atlas actuels tiennent aussi sous le quota secours de 8 Mio ; l'éviction
n'interrompt pas les ressources encore détenues.

## E — personnages, sans réseau

`presentation-buffer.ts` réutilise **PlayerPresentationState v1** : validation, tri borné,
refus des doublons/échantillons trop anciens, interpolation du cap par chemin court,
actions discrètes à leur timestamp, extrapolation bornée puis position figée. Le renderer
`remote-characters.ts` injecte les états par `push(id, state, appearance?)` et conserve
l'identité/historique/apparence lors des changements de représentation.

Proche : rig hamster existant et accessoires ; intermédiaire : proxy hamster 3D instancié
à quatre parties ; distant : atlas animé ; très distant : proxy ; hors portée : aucun rendu.
Les rigs inactifs sont évincés selon leur dernière utilisation et restent bornés ; au plus
un rig est créé par présentation. Frustum et occultation du relief existante éliminent les
représentations hors vue sans toucher aux historiques. L'horloge
absolue de présentation maintient les cycles d'animation des rigs reconstruits ; les
événements de gameplay ne sont jamais émis par le simulateur. Les accessoires sont volontairement
omis dans les proxies/atlas, sans combinatoire de textures. L'état d'apparence reste conservé.
Les PNJ hamster éloignés utilisent le même atlas lorsque `impostors=all` ; autres morphologies
et joueur local gardent leur rendu actuel et leur logique.

Le simulateur 10/50/100 identités produit des trajectoires déterministes et des états
roulade/planage/saut/nage/action, au pas logique du jeu. Sa cadence de snapshots alterne
20/8/2 Hz toutes les 12 secondes ; le délai d'interpolation suit cette cadence et le rendu
continue à chaque présentation. C'est une injection locale, pas un serveur ni une promesse
de capacité multijoueur.

## F — mesures et validation

`perf-sampler.ts` conserve 240 mesures : intervalles de présentation, simulation CPU,
mise à jour CPU et soumission WebGL distinctes, p50/p95/p99 et longues frames. Le timer GPU
WebGL2 est asynchrone (quatre requêtes maximum), jamais `finish`/attente active ; absence de
l'extension ou disjoint ⇒ valeur GPU indisponible, jamais remplacée par le temps JS.
`?metrics=1` expose les compteurs dans `littleWorldMetrics`, dont `hybrid`, `remoteActors`,
`perf` et `gpu`. Mémoire atlas = estimation RGBA + métadonnées, pas mesure VRAM du pilote.

La matrice `tools/benchmark-hybrid.mjs` compare les quatre configurations, viewport 960×640,
même carte/coordonnées par scène, captures PNG et rapport JSON. Les profils de qualité
restent adaptatifs comme dans le jeu ; la génération continue pendant l'échantillonnage.
Les petites différences doivent donc être interprétées avec prudence. Le scénario « flight »
place le personnage en altitude via le hook de test, puis utilise la commande normale de
planage ; « roll » utilise la commande normale de roulade. Le rapport conserve les modes
effectivement observés (planage et roulade confirmés dans les quatre configurations). La baseline A est une route plus longue,
elle ne doit pas être comparée directement aux vues statiques de cette nouvelle matrice.

### Validation fonctionnelle exécutée

- `npm test` : **481 tests, 0 échec**, dont 7 dédiés à la politique, aux données dérivées,
  au cache, au tampon de snapshots et au sampler CPU.
- `npm run typecheck`, `npm run build`, `npm run check:impostors` : réussis.
- `npm run test:hybrid` : shaders réels dans Chromium, 10/50/100 identités, somme des
  représentations cohérente, plafond des rigs, 70 changements de secteurs avec éviction,
  refus d'une entrée absente/périmée, atlas entièrement libérés après destruction,
  200/80/20 snapshots pour dix acteurs sur une seconde à 20/8/2 Hz, repli sans atlas et contrôles
  Studio sans changement de caméra.
- `npm run test:studio` : **17 contrôles, aucune erreur**, dont édition, Undo/Redo,
  sauvegarde, ZIP portable, compilation, migration V2 et playtest.
- `npm run test:dressing-stability` : **7 contrôles, aucune erreur**, déplacement prolongé,
  maintien des éléments proches et stabilité après retour au même endroit.
- Smoke du build statique via Vite preview, préfixe `/little-world/`, arbres + bâtiments +
  100 acteurs : atlas chargés et shaders valides. Le favicon existant à la racine renvoie
  404 ; ce bruit navigateur est exclu des erreurs de rendu de la matrice.
- Vérification visuelle des captures forêt/acteurs et des vues de comparaison. Les passages
  de LOD restent des bascules avec hystérésis, sans crossfade ni double dessin permanent.

### Limites et améliorations prioritaires

1. **Gain global non démontré** : l'ancien proxy végétal a déjà seulement 4–8 triangles.
   Deux triangles texturés ajoutent des secteurs/draw calls et du remplissage alpha-test.
   Conserver `off` tant qu'un GPU intégré réel n'a pas montré un bénéfice mesurable.
2. Éclairage des atlas précalculé, modulation nocturne simple ; soleil rasant, neige et
   raccords de teinte ne sont pas aussi cohérents que sur les meshes. Quatre azimuts et
   trois images d'animation peuvent produire des bascules lisibles. Affiner ces points
   avant d'augmenter la résolution ou le nombre de directions.
3. Accessoires et outils omis au loin ; « action » est un geste générique. Les autres
   morphologies de PNJ ne sont pas atlasées ; les rigs PNJ existants restent créés selon
   leur système actuel. Le simulateur dispose de proxies géométriques, pas d'un second rig.
4. Première préparation d'un rig toujours susceptible de coûter une longue frame ; au
   maximum une création par présentation, ressources de modèle déjà partagées. Les cycles
   utilisent le temps absolu, mais les transitions et actions ponctuelles ne sont pas une
   reproduction exacte image par image entre atlas et rig.
5. Quotas partagés pour les **nouveaux** consommateurs ; le ResourceBudgetManager complet
   de la spécification 22 n'est pas déclaré livré. L'arbitre adaptatif reste uniquement
   `PresentationBudget`. Pas de promesse 100 km² / 30 FPS ou de capacité multijoueur.
6. Le préchargement/streaming de terrain et forêt existant est conservé ; pas de nouveau
   préchargeur spéculatif d'atlas par direction, les trois petites pages sont partagées.
   LRU et refcounts sont bornés, pas un gestionnaire VRAM du pilote. Le coût d'overdraw
   n'est pas mesuré séparément : les timers couvrent toute la scène.
7. Diagnostic Studio : limites des secteurs imposteurs et seuils en pixels affichés ; pas
   d'annotation de chaque arbre ni de coloration universelle des LOD terrain/GLB. Les atlas
   ne se régénèrent jamais pendant un coup de pinceau ; seuls les lots concernés se redessinent.
8. Mesures SwiftShader uniquement, courtes et avec qualité adaptative. Les compteurs CPU
   de simulation reprennent le coût du callback présenté existant ; les callbacks rAF non
   présentés ne sont pas cumulés dans ce chiffre. Cette limite compte sur une machine rapide.
   La route de référence initiale reste utile pour une régression longue, pas pour prétendre
   qu'une différence de quelques millisecondes sur les vues statiques est significative.

### Fichiers et responsabilités

| Fichiers | Rôle |
|---|---|
| `src/render/representation-policy.ts` | Politique et quotas communs |
| `src/render/impostor-{manifest,atlas,sectors}.ts` | Contrat dérivé, chargement et rendu par secteurs |
| `src/render/resource-cache.ts` | Propriété partagée et LRU |
| `src/render/impostor-baker.ts`, `tools/impostors/bake.html`, `tools/generate-impostors.mjs` | Pipeline hors runtime incrémental |
| `public/impostors/*` | Trois pages PNG content-addressed et manifeste, 282 482 octets transférés au total |
| `src/render/{presentation-buffer,remote-characters}.ts` | Injection d'états, interpolation et simulateur |
| `src/render/{perf-sampler,hybrid-controls}.ts` | Mesures et diagnostics Studio |
| `src/{world,dressing-view,frame-clock,main,npc-view}.ts` | Intégration aux systèmes existants |
| `src/hamster/{hamster,hamster-animation}.ts` | Horloge absolue de présentation distante facultative |
| `src/studio/viewport/editor-viewport.ts` | Même renderer et diagnostics temporaires |
| `tests/hybrid-rendering.test.mjs`, `tools/test-hybrid-browser.mjs` | Tests purs et WebGL/Studio |
| `tools/benchmark-hybrid.mjs`, `docs/benchmarks/hybrid/*` | Matrice, baseline et captures |
| `package.json`, `.github/workflows/checks.yml` | Commandes et détection CI des atlas périmés |

### Résultats de la matrice finale

40 passages (10 scènes × 4 configurations), révision `0a06a59`, **0 erreur de rendu**.
Les captures et le rapport intégral sont dans [comparison/matrix.json](benchmarks/hybrid/comparison/matrix.json).

Exemple forêt : moyennes des compteurs, percentiles des intervalles observés après stabilisation.
Les FPS ci-dessous sont `1000 / p50`, donc une cadence médiane, pas une moyenne de débit.

| Configuration | Appels | Triangles | p50 / p95 / p99 (ms) | FPS médians |
|---|---:|---:|---:|---:|
| Géométrie actuelle | 103.1 | 81,650 | 155.2 / 307.6 / 518.3 | 6.4 |
| Atlas arbres, 512 m | 105.7 | 77,776 | 143.1 / 178.0 / 601.9 | 7.0 |
| Atlas arbres, 256 m | 106.4 | 76,905 | 128.3 / 261.8 / 511.9 | 7.8 |
| Atlas + 50 acteurs | 108.4 | 75,905 | 128.7 / 162.7 / 622.5 | 7.8 |

La forêt passe ici de 81 650 à 76 905 triangles (−5,8 %), mais de 103,1 à 106,4 appels
(+3,2 %). Le p50 baisse sur cette passe ; le p99 reste très élevé et les variations entre
passes sont importantes. Cela **ne démontre pas un gain général** et ne justifie pas une
activation par défaut. Le relief rocheux donne 40 622 → 37 236 triangles et 70,6 → 68,3 appels
avec les secteurs de 256 m, sur une scène différente : voir le JSON pour les distributions.

Le scénario 100 acteurs termine avec 18 imposteurs, 17 proxies et 65 représentations masquées,
un rig conservé en cache ; dernière mise à jour visuelle mesurée 0,2 ms. Ce n'est pas un
benchmark de 100 rigs visibles simultanément. Les quatre configurations ont bien parcouru
le planage et la roulade. Les timers GPU sont disponibles sous SwiftShader ; leurs valeurs
sont des durées asynchrones de la scène entière sur rendu logiciel, pas celles d'un GPU PC
de référence. Le rapport conserve également les coûts CPU et la dernière durée GPU valide.

Captures sélectionnées versionnées : forêt (4 configurations), falaise, panorama, village,
planage, roulade et simulateurs 10/100. Le script peut regénérer toutes les captures.

La dernière correction de cycle de vie ajoute la destruction d'un chargement qui termine
après libération de son propriétaire, couverte par un test dédié ; elle ne modifie pas le
rendu mesuré lorsque les atlas sont détenus. Aucun merge dans `main`.
