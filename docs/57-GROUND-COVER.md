# Couverture végétale proche et distante

Statut : implémenté et testé sur `feat/hybrid-distant-impostors`, pas fusionné dans `main`.
Baseline : `c34057f` ; branche propre au départ, 14 commits devant la référence locale
`origin/main`, aucune synchronisation ni réécriture des changements existants.

## Diagnostic et choix

Le terrain détaillé ajoutait deux sinusoïdes fines, absentes de l'horizon. Celui-ci estimait
également la pente avec son propre pas, contrairement aux tuiles : un même point pouvait
changer de matériau et de couleur au changement de représentation. Les touffes avaient leur
propre palette, plus saturée, et ne contrôlaient l'exclusion qu'au centre d'un carré de 4 m.
L'interaction ignorait la hauteur du joueur ; les cellules restaient préparées sous un planeur.

`geography/ground-cover.ts` dérive densité, herbe haute, type et couleur d'un **GeoSample déjà
calculé**, sans reclassification, import du monde ni dépendance à la caméra. `habitatOf` conserve
l'autorité sur les occupations ; les matériaux minéraux, l'eau, la pente et les masques restent
respectés. La classification géographique existante prend en compte altitude et humidité.
Les variantes de teinte utilisent deux bruits continus aux échelles **192 et 640 m**, la graine
du monde, l'humidité et la densité. Ce sont des masses de végétation et des mélanges terre/herbe,
pas une texture de brins ni une simulation de croissance.

`materialColor`, le terrain détaillé et l'horizon réutilisent ces couleurs. Un gradient canonique
à 2 m donne la même classification et les mêmes normales aux sommets communs, indépendamment
du pas de leur grille. Ce gradient est réutilisé pour l’éclairage : pas de quatre autres
échantillons de hauteur pour les normales détaillées.
Les anciennes sinusoïdes restent uniquement sur la vallée historique. La fréquence minimale
choisie convient jusqu'à la grille d'horizon de 64 m du format 10 × 10 km ; aucun filtrage
propre au LOD n'introduit une nouvelle rupture de teinte. L'interpolation entre sommets de
résolutions différentes n'est toutefois pas identique. Relief, indices, couverture de l'horizon
et géométries restent inchangés. Les matériaux Lambert reçoivent l'éclairage existant une seule
fois, y compris la nuit. La table sRGB → linéaire de 256 doubles (2 Kio) est exactement compatible
avec Three.js et évite trois puissances par couleur, sans cache croissant.

## Touffes et caméra

- Les profils gardent **dense 42 m / 2,2**, **balanced 32 m / 1,6**, **ultra 20 m / 1**
  (touffes/m² avant densité du biotope), puis `groundOnly`. Aucun accroissement de densité.
- Cellules de 16 m, trois triangles opaques par touffe, un seul InstancedMesh, vent GPU,
  sans texture ni ombre. Le fondu géométrique radial existant est conservé.
- Le placement final vérifie l'échantillon exact, empêchant un carré de 4 m de déborder sur
  route, champ, bâtiment, eau ou masque d'exclusion. Les couleurs utilisent ce même point.
- La taille projetée d'une touffe de référence de 0,35 m module progressivement son échelle
  entre **0,6 et 1,8 pixel** ; sous ce seuil, aucune nouvelle cellule n'est préparée. Les
  anciennes touffes finissent leur fondu temporel puis les cellules sont libérées. Le terrain
  végétalisé reste visible et la distance générale du paysage ne diminue pas.
- Une caméra basse (<12 m au-dessus de son sol), séparée de plus d'un demi-rayon du joueur,
  prépare autour d'elle. Autrement le focus existant reste le centre. Le joueur conserve une
  position d'interaction distincte. La vue orthographique Studio sans caméra perspective
  transmise conserve le comportement local historique.
- Deux cellules maximum par update, sous le budget de génération existant de 1 ms ; une cellule
  synchrone peut dépasser ce temps et ne peut pas être interrompue. Les cellules proches sont
  prioritaires, y compris dans le buffer limité à 24 000 touffes. Replanification par pas de 4 m.
  Les premières cellules sont affichées immédiatement ; pendant la préparation, les autres
  uploads sont espacés d'au moins 100 ms, sauf fin de file. Aucun upload au repos.
- **Deux acteurs** proches maximum, **un en ultra** : joueur prioritaire puis personnage voisin.
  Le shader vérifie la séparation verticale et ne plie pas l'herbe sous un planeur.
  `WorldView.setGrassActors` accepte les positions existantes des PNJ et personnages simulés ;
  aucun état réseau d'herbe, physique par touffe ou serveur n'est créé.
- Le mémo de classification de `biomes.ts` suit les révisions géographiques et du terrain.
  Les éditions/Undo réutilisent l'invalidation locale de `WorldView.refreshTerrain` ; aucun
  nouveau champ n'est ajouté aux sources V3, exports ou sauvegardes.

Les métriques `littleWorldMetrics.grass` exposent cellules, touffes, génération cumulée,
update, reconstruction, uploads demandés et octets demandés. `bytes` estime les tableaux CPU
réservés et le cache des cellules ; le miroir GPU des matrices/couleurs ajoute au plus
**1 824 000 octets** (capacité fixe), hors petits buffers de la touffe et allocations du pilote.
Les octets demandés ne sont pas une mesure de temps de transfert GPU réel.

## Reproduction et résultats

Dans le jeu lancé par `npm run dev`, ouvrir :
`/little-world/?world=maps/island/manifest.json&spawn=-340,-1200&yaw=.3&pitch=.2&dist=8&grass=balanced&metrics=1`.
Pour la vue lointaine : `dist=500&pitch=.5&grass=groundOnly`. Ajouter `impostors=trees` pour
comparer les arbres hybrides ; `impostors=off` conserve leurs géométries. Les masques et outils
Studio existants continuent à commander les mêmes sources ; aucun nouvel éditeur n'est créé.

```sh
npm run dev
npm run test:ground-cover
HYBRID_CONFIGS=balanced HYBRID_RENDER_TIER=1 HYBRID_WAIT_IDLE=1 \
  HYBRID_SAMPLE_MS=1500 HYBRID_SETTLE_MS=500 npm run benchmark:ground-cover -- \
  http://127.0.0.1:5173/little-world/ /tmp/ground-cover
# Profils et arbres hybrides sur deux vues :
HYBRID_SCENARIOS=meadow,panorama HYBRID_CONFIGS=groundOnly,ultra,dense,hybrid \
  HYBRID_RENDER_TIER=1 HYBRID_WAIT_IDLE=1 npm run benchmark:ground-cover
node --experimental-strip-types tools/benchmark-ground-cover-data.mjs c34057f /tmp/cover-cpu.json
```

`tools/ground-cover-views.json` fixe les dix caméras historiques de comparaison, puis deux
caméras supplémentaires de prairie ouverte de l'île : forêt, village/champs, région du
marais, panorama, vol, prairie proche, secteur sec, rivière, pente et nuit. Les noms sont des
points géographiques de l'île, pas une garantie de matériau uniforme dans tout leur champ.
La fixture contrôlée impose séparément les quatre couvertures, dont la prairie dense et sèche.

- [Avant](benchmarks/ground-cover/before/matrix.json) et
  [après](benchmarks/ground-cover/after/matrix.json) : mêmes coordonnées, caméras, profil balanced,
  viewport 960×640, qualité fixée à 1. La nuit a été recapturée avec `night=1`. Cette première
  passe précède les derniers ajustements CPU/uploads et le raccord des normales. Les couleurs
  de données sont identiques ; le dernier raccord corrige aussi leur éclairage à la frontière.
- [Profils et imposteurs](benchmarks/ground-cover/profiles/matrix.json) : terrain seul,
  ultra, dense, arbres hybrides, mêmes vues prairie/panorama.
- [Confirmation finale](benchmarks/ground-cover/final/matrix.json) : panorama, prairie ouverte
  proche/lointaine, balanced/groundOnly, après raccord des normales.
- [Prairie ouverte](benchmarks/ground-cover/open-meadow/matrix.json) : biome meadow
  vérifié dans les sources, coordonnées −340/−1200, caméras à 8 et 500 m, balanced/groundOnly.
  [Proche final](benchmarks/ground-cover/final/open-meadow-near-balanced.png),
  [lointaine finale](benchmarks/ground-cover/final/open-meadow-far-groundOnly.png).
- [Fixture WebGL](benchmarks/ground-cover/controlled/results.json) : 32 cas, quatre couvertures ×
  quatre profils × deux distances, contrôle jour/nuit supplémentaire. **Zéro upload de buffer au
  repos**, au plus deux appels (sol + touffes), un appel pour `groundOnly`.
- [Préparation CPU](benchmarks/ground-cover/data.json) : comparaison alternée après chauffe sur
  100 000 couleurs. Le calcul enrichi est plus coûteux ; ce travail a lieu à la génération des
  tuiles/cellules, pas par pixel ou par touffe chaque frame. Ce microbenchmark exclut la
  classification et le calcul de pente. Le même rapport mesure aussi la génération complète
  d’une tuile réelle de 64 m (les anciens builders utilisent le helper LinearColor actuel,
  mathématiquement équivalent). Les transferts GPU et le transport worker restent exclus.

Comparaisons visuelles :

| Vue | Avant | Après |
|---|---|---|
| Sous-bois proche, point historique « meadow » | [image](benchmarks/ground-cover/before/meadow-balanced.png) | [image](benchmarks/ground-cover/after/meadow-balanced.png) |
| Marais / raccord des surfaces | [image](benchmarks/ground-cover/before/marsh-balanced.png) | [image](benchmarks/ground-cover/after/marsh-balanced.png) |
| Panorama | [image](benchmarks/ground-cover/before/panorama-balanced.png) | [image](benchmarks/ground-cover/after/panorama-balanced.png) |
| Nuit | [image](benchmarks/ground-cover/before/night-balanced.png) | [image](benchmarks/ground-cover/after/night-balanced.png) |

Le rendu utilise **Chromium/SwiftShader**, et non un GPU intégré qualifié. Les temps de
soumission JS ne sont pas des temps GPU ; même le timer WebGL disponible ici mesure le backend
logiciel. Les oiseaux, PNJ, vent et certains objets animés restent vivants ; les petites
variations de triangles et de pixels ne prouvent pas un gain du terrain. Le cycle diurne lent
n'était pas pausé sur les neuf premières vues avant ; il l'est après et sur la nuit corrigée.
Les mesures longues de streaming matériel et les captures strictement pixel-identiques de la
carte entière restent à faire.

## Mesures retenues et validation

| Mesure | Avant | Après |
|---|---:|---:|
| Panorama, appels | 141 | 140 |
| Panorama, triangles soumis | 74 008 | 67 850 |
| Panorama, touffes | 1 990 | 0 |
| Couleurs seules, 100 000 points, médiane CPU | 3,87 ms | 12,21 ms |
| Tuile réelle LOD0, 1 089 sommets surface, médiane CPU | 5,78 ms | 4,89 ms |
| Même tuile LOD1 / LOD2 | 1,42 / 0,39 ms | 1,23 / 0,36 ms |

Les couleurs enrichies seules coûtent davantage de CPU. La réutilisation du gradient pour les
normales compense ce coût sur la tuile mesurée : environ **−15 %** en LOD0, sans nouvel appel ni
coût shader de terrain. Ce résultat local ne garantit pas un gain identique sur tout l'archipel.
Les workers et quotas existants bornent la file ; ils ne rendent pas une opération synchrone
interruptible. Le microbenchmark ne démontre pas une amélioration générale du temps de frame.

Fixture finale de prairie, vue proche (le sol de fixture compte 32 768 triangles) :

| Profil | Touffes | Appels herbe | Tableaux CPU + cache |
|---|---:|---:|---:|
| dense | 15 711 | 1 | 3 018 036 octets |
| balanced | 7 017 | 1 | 2 357 292 octets |
| ultra | 2 582 | 1 | 2 020 232 octets |
| groundOnly | 0 | 0 | 1 824 000 octets réservés |

Aucun transfert de buffer sur les douze frames immobiles de chacun des 32 cas contrôlés.
La réserve GPU des instances n'est pas détruite à chaque passage en groundOnly, pour éviter
le churn ; le cache de cellules est vidé. Les compteurs d'octets ne comprennent pas le pilote.

Contrôles exécutés avec Node 22 : **501 tests unitaires**, `npm run typecheck`, `npm run build`,
`npm run test:hybrid`, `npm run test:hybrid-map`, `npm run test:render-budget`,
`npm run test:studio` (**17 contrôles, zéro erreur**) et `npm run test:ground-cover`
(**32 cas WebGL, zéro erreur**). Déterminisme, exclusions exactes, masque/Undo au même point,
frontières tuiles/LOD/horizon, couleurs Three.js, aller-retour, refresh local, caméra détachée,
altitude, nombre d'acteurs et préparation bornée sont couverts. Le contrôle de bâtiments reste
à 40 → 1 appels, image identique ; aucune régression détectée des atlas et de leur libération.
L'absence de scintillement temporel sur matériel réel reste une vérification visuelle à compléter.

## Limites visuelles et suite

Les grands motifs sont volontairement sobres. Ils n'ajoutent ni brins lointains ni relief à
l'herbe ; une prairie vue au ras du sol en `groundOnly` reste une surface. Même avec des couleurs et normales identiques aux sommets partagés, les interpolations
de l’horizon grossier et les frontières des
masques auteur et les changements francs de matériau peuvent encore être lisibles : les
masques ne sont pas réécrits ni lissés en inventant de nouveaux biotopes. Les touffes gardent
leur silhouette simple de trois triangles. Un GPU réel doit encore qualifier les objectifs
30/20 FPS et le coût des deux influences shader. Aucune texture partagée, couche superposée,
texture d'influence de foule ou nouveau shader de terrain n'est activé, même expérimentalement.
