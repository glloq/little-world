# Préparation, regroupement, culling et éclairage du rendu

Branche `feat/hybrid-distant-impostors`, depuis `bd9d648`. Modifications du renderer seulement :
les sources V3, compilations de cartes, collisions, interactions et pas logique 30 Hz restent
indépendants du rendu. Aucune nouvelle dépendance, texture d'asset, shadow map ou système adaptatif.

## Préparation répartie entre les présentations

`src/terrain-view.ts` ne crée plus les géométries directement dans les callbacks de workers.
Les résultats rejoignent une file bornée par les **six crédits de travail existants**, réponses
prêtes incluses. `update()` intègre les résultats dans l'ordre courant des priorités, avec le
budget CPU existant de 4 ms et **deux tuiles maximum par update** dans le jeu. Un ancien LOD
reste affiché jusqu'au remplacement ; l'horizon conserve sa couverture. Aucun changement aux
positions, hauteurs, normales, couleurs ou jupes des tuiles.

La génération synchrone et le repli après un échec de worker utilisent le même plafond. Une
édition invalide les réponses déjà reçues mais pas encore intégrées ; un déplacement annule les
requêtes devenues inutiles. Les temps de préparation incluent désormais l'intégration auparavant
exécutée hors de l'update. `terrainWork.ready`, `inFlight` et `maxReady` exposent la file ; `ready`
est un sous-ensemble des crédits `inFlight`, pas une seconde file à additionner à ces crédits.

`placed-instances.ts` prépare aussi **un seul lot GLB/LOD par update**, après le chargement des
fichiers. Les lots peuvent devenir visibles progressivement ; les bâtiments gardent leur volume
de secours tant que leur LOD n'est pas prêt. La création des trois gros buffers n'arrive plus
ensemble dans un callback de chargement. Les compteurs `preparedThisUpdate`, `pendingLevels` et
`maxPrepareMs` distinguent cette préparation du rendu.

Ce sont des plafonds d'opérations, pas une promesse de durée totale de frame : une seule grosse
opération synchrone ne peut pas être interrompue. La lecture/décompression GLB et les transferts
réalisés par le pilote restent à profiler sur une vraie machine.

## Décors et maisons : réutiliser les lots existants

Le renderer des clôtures/rochers/objets placés conserve désormais les IDs d'instances tant que
leur visibilité et leur LOD ne changent pas. Il ne supprime plus tous les membres pour les recréer
à chaque déplacement ou nouvelle information d'occlusion. Les matrices inchangées ne sont plus
réécrites.

Une liste explicite de bâtiments statiques rejoint ce même renderer : maisons bleues, maisons
à colombages, maisons de pierre, cabanes, fermes, auberges et cabanes de ponton. Le garde-fou
existant de `main.ts` reste prioritaire : un objet interactif ou porteur d'état conserve son objet
individuel. Moulins, phares, bateaux, personnages et bâtiments inconnus ne sont pas aplatis.
Les matrices miroir de déterminant négatif conservent également le chemin individuel, pour que
Three.js ajuste correctement le sens des faces.

Les petites structures gardent leurs deux LOD ; les maisons conservent **les trois LOD GLB déjà
existants**, leurs distances du catalogue et leur visibilité jusqu'à 900 m. Le troisième lot ne
réserve de places et de géométries que pour les bâtiments qui en ont besoin : sur l'île, **65
places au lieu de 1 338** pour ce niveau. Les petits objets et rochers n'y sont pas dupliqués.
La géométrie partagée reste propriété du cache d'assets ; les lots et modèles de secours sont
libérés par leur renderer.

Correction associée : `THREE.LOD.addLevel` attend une fraction d'hystérésis. L'ancien `2` devenait
200 %, ce qui pouvait empêcher le retour au modèle détaillé. La valeur est maintenant **0,02**,
et les bâtiments groupés utilisent la même règle. La proximité retrouve ainsi son vrai détail ;
il peut donc y avoir un peu plus de triangles qu'avant sur certaines vues.

### Fixture contrôlée, vraies soumissions WebGL

```sh
npm run dev
npm run test:render-budget
```

40 maisons, mêmes GLB, positions, rotations, caméra, LOD et éclairage :

| Mesure | Objets séparés | Lot partagé |
|---|---:|---:|
| Appels WebGL | 40 | 1 |
| Triangles soumis | 3 200 | 3 200 |
| Erreur absolue moyenne par canal de l'image | — | 0 |

20 reconstructions de visibilité identique ne recréent aucune instance. Cette mesure utilise
`WEBGL_multi_draw`, présent sur ce Chromium/SwiftShader. Sans cette extension, Three.js émule les
soumissions ; la réduction du nombre d'appels n'est pas garantie dans les mêmes proportions.

[Résultats](benchmarks/render-four/controlled/results.json),
[avant](benchmarks/render-four/controlled/buildingsBefore.png),
[après](benchmarks/render-four/controlled/buildingsAfter.png).

## Culling conservateur des parents d'objets

`src/render/asset-culling.ts` calcule une borne locale par asset à partir de **tous ses LOD**, puis
la transforme selon la position, le quaternion et l'échelle de l'objet. Ce test court-circuite les
sous-arbres GLB qui sont entièrement hors frustum, avant leurs mises à jour de LOD et soumissions.
Les meshes avaient déjà un culling natif : ce changement vise surtout le travail CPU des parents,
pas une multiplication fictive du gain GPU.

La garantie de proximité est conservée à **80 m**. Les assets inconnus et les propriétaires animés
restent sur leur chemin existant ; les pivots et faisceaux déclarent `dynamicVisual`. Les boîtes
incluent les échelles non uniformes ou négatives, avec une marge. Le relief conserve son champ
d'occlusion existant, sans être lui-même masqué. Les bâtiments groupés réutilisent le culling par
instance de `BatchedMesh`. `littleWorldMetrics.objectCulling` expose les tests et rejets des parents.

## Cohérence des imposteurs avec la lumière du monde

`src/render/impostor-lighting.ts` calcule une correction RGB moyenne à partir **des mêmes lumières**
que les modèles Lambert : soleil, remplissage et hémisphère ciel/sol. La correction est relative
au midi de référence, où elle vaut exactement `(1,1,1)` ; elle suit ensuite les intensités et les
couleurs du ciel couvert, de l'aube/coucher et de la nuit.

Un seul objet couleur par vue est partagé avec les uniformes des arbres, monuments éligibles,
PNJ hamster éloignés et personnages simulés. Le jeu et le Studio utilisent le même calcul.
L'ancien facteur nocturne reste le repli des renderers isolés, mais n'est pas appliqué une seconde
fois lorsqu'une correction d'éclairage est fournie. Pas de texture de normales, second échantillon
par pixel, lumière par arbre ni reconstruction d'atlas à chaque heure.

Captures de contrôle : modèle 3D à gauche, imposteur à droite,
[jour](benchmarks/render-four/controlled/day.png),
[coucher](benchmarks/render-four/controlled/sunset.png),
[couvert](benchmarks/render-four/controlled/cloudy.png),
[nuit](benchmarks/render-four/controlled/night.png).

Limites : les facettes et ombres de l'atlas restent précalculées ; ce n'est pas un rééclairage
directionnel exact et les quatre orientations restent discrètes. Le moteur climatique actuel
expose clair/couvert/pluie, pas une accumulation de neige : aucune neige fictive n'est annoncée
ici. Les ombres locales et accessoires détaillés restent gérés par les représentations proches.

## Contrôles et limites des mesures

- **493 tests unitaires réussis**, dont budgets d'intégration terrain, annulation après édition,
  repli après échec de worker, préparation GLB par étapes, réutilisation des instances, LOD,
  modèles manquants, miroir, culling et éclairage.
- `npm run typecheck`, `npm run build`, `npm run check:impostors` : réussis ; aucun atlas à rebâtir.
- `npm run test:render-budget` : même image de maisons, 40 → 1 appels, contrôles de lumière.
- `npm run test:hybrid`, `npm run test:hybrid-map` (dev et build statique) : WebGL, cache, partage/libération, réglage,
  persistance et points de l'île réussis.
- Parcours d'environ 4,84 km avec `impostors=trees&impostorSectors=512` : **8 contrôles réussis**,
  aucun élément proche perdu, cache borné (392 sprites et 19 secteurs en fin de test).
- `npm run test:studio` : **17 contrôles, zéro erreur**, édition, Undo/Redo, ZIP, compilation,
  migration et playtest.

Les captures de scène utilisent un viewport 960×640, framebuffer 768×512, qualité fixée à 1,
terrain/habillage stabilisés, même île et mêmes vues. Le mode d'atlas est désactivé dans cette
comparaison pour isoler les changements de préparation/décors. Rendu **SwiftShader**, pas un GPU
intégré qualifié ; le temps de soumission JS n'est pas une durée GPU.

| Vue | Appels avant → après | Triangles avant → après | Frame p50 avant → après (ms) |
|---|---:|---:|---:|
| forest | 84 → 84 | 46 323 → 46 321 | 98.5 → 97.9 |
| village | 179 → 140 | 66 176 → 67 271 | 123.3 → 119.0 |

Au village, **−21,8 % d'appels**. Sur la première passe, le CPU de mise à jour passe de 6,62 à
4,88 ms en moyenne et la soumission de 5,67 à 4,96 ms. Le p99 reste variable : aucun gain général
de FPS ni suppression totale des longues frames n'est affirmé. Les triangles un peu plus nombreux
au village ne sont pas cachés : le retour aux LOD détaillés a été corrigé. La forêt sans groupe
important de maisons reste quasiment inchangée en appels, ce qui sert de contrôle.

[Rapport avant](benchmarks/render-four/before.json), [après](benchmarks/render-four/after.json).
Les mesures statiques après stabilisation ne quantifient pas directement les pires saccades en
streaming ; les plafonds de préparation sont vérifiés séparément. Les prochaines mesures utiles
sont un parcours sur GPU intégré réel et le temps d'upload du pilote à froid. Le mode hybride reste
facultatif dans les paramètres, sans nouvelle activation automatique. Aucun merge dans `main`.

Confirmation avec la préparation GLB étalée et la capacité LOD2 limitée : **140 appels**
au village, p50 109.3 ms, aucun chargement en attente au moment de l'échantillonnage.
[Confirmation finale](benchmarks/render-four/staged-confirmation.json). Cette passe reste un signal
de régression logiciel ; elle ne remplace pas la qualification matérielle.
