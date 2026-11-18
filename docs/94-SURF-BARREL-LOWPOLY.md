# 94 — SURF-BARREL V1 · tube près de la plage

**Statut : PROTOTYPE.** Branche `docs/surf-island-full-plan` · PR #83.
La documentation présente le code réellement ajouté ; elle **ne** qualifie pas les FPS, les collisions
de personnage ni l'expérience navigateur avant les tests.

## Décision : lèvre 3D séparée, même crête déterministe

Le `SurfWaveField` reste une fonction de hauteur unique (et garde la même valeur d'eau
hydrographique que la nage, les bateaux et la pêche). Un vrai surplomb est impossible avec
un simple heightfield. On ajoute donc **une bande 3D low-poly** au-dessus de la crête
sans modifier l'eau physique. Un **volume analytique** calcule l'ouverture praticable
avec les *mêmes* paramètres de crête et de fermeture que la géométrie.

- `src/surf/surf-barrel.ts` : profil de déferlement, indices de crêtes, clairance, entrée,
  traversée latérale, effondrement et repli vers `swim`. Fonction pure à tick 30 Hz.
- `src/render/surf-barrel-view.ts` : un `BufferGeometry` et un seul matériau
  à couleurs de sommets (eau turquoise / écume claire). Position mise à jour
  dans un `BufferAttribute` `DynamicDrawUsage`. Maillage en arche ouverte
  (10 segments transversaux au surplomb), 30 segments le long d'une crête.
  **Maximum 4 fronts simultanés : 1 364 sommets et 2 400 triangles**.
  Les buffers sont créés une fois, pas de `Mesh` par crête ni de matériau dupliqué.
- `src/player.ts` : appelle le contrôleur de tube *dans le même pas physique* que
  la planche et ses collisions. Le rendu n'est jamais une autorité de gameplay.
- `src/physics/movement-state.ts` : sérialisation/validation des champs de
  progression du tube, pour rejouer le mouvement sur le même `SurfWaveField`.
- `src/main.ts` : affichage, métriques facultatives `?metrics=1`,
  messages de réussite/chute et nettoyage de la géométrie.

## Propagation et fermeture physique

`phase = 2π · (dot(direction, position) - speed · tick/30) / wavelength + seedPhase`

La crête représentée par la lèvre correspond au **maximum exact** de la formule existante
`sin(phase)+0.22·sin(2·phase)`, pas à une animation visuelle indépendante.
Chaque crête possède un index entier stable pendant son trajet vers la côte.

La forme est conditionnée par la profondeur locale sous le niveau marin :

- **Eau profonde** (`depth ≥ 2.2 × shoreFadeDepth`) : houle sans lèvre.
- **Bande de déferlement** : ouverture maximale vers `0.9 × shoreFadeDepth`.
  La lèvre monte, s'enroule puis redescend vers l'avant, avec une écume stylisée.
- **Eau trop peu profonde** (`depth ≤ 0.34 × shoreFadeDepth`) : disparition
  de la lèvre avant la terre et le sable ; aucune géométrie sous la plage.
- **Bords de zone** : atténuation progressive pour éviter les coupures nettes.

La position, l'intensité et la fermeture sont fonctions de `x,z,tick,seed` et du terrain,
sans hasard par frame ni accumulation de temps flottant.

## Gameplay V1

Pendant une glisse `surf/ride`, si la lèvre laisse une clairance
de plus de 1,52 m et que le hamster va assez vite *le long* de la crête,
le joueur entre dans le tube. Il peut valider la traversée en progressant
latéralement de 5 m pendant au moins 10 ticks **avant** que la clairance
ne devienne insuffisante. Une fermeture pendant le passage provoque
un `wipeout` contrôlé et le retour à la nage. Un cooldown de 75 ticks
empêche de récolter des réussites en restant immobile dans le même tube.

Les règles sont arcade et provisoires : le personnage n'a pas encore
de vraie collision capsule contre chaque triangle de la lèvre ; seul un
volume analytique détermine s'il peut tenir sous la voûte.

## Réglages Studio, compatibilité

`SurfZone.barrelStrength?: number` entre 0 et 1 :

- Zone sans propriété (ancien projet/ancienne île) : **0 — aucun tube**.
- Nouvelle zone créée dans Studio Surf : **0.85** initial, éditable.
- Mode `?surfDemo=1` : **1**, pour montrer le maximum de la fonctionnalité.

La propriété suit validation stricte Studio V3 → compilation → runtime.
Le modèle de vagues, le niveau marin et les circuits existants restent identiques.
Aucun serveur et aucun multijoueur requis.

## Limites et mesures à réaliser

Le coût théorique du maillage est faible (**≤ 2 400 triangles** pour les tubes d'une zone),
mais la valeur CPU des échantillons de terrain par tick et le coût GPU sur PC 4–8 Go
**n'ont pas été mesurés**. Les quatre fronts constituent une limite dure.
La distance de rendu est centrée près du joueur, pas encore un vrai LOD distant.

Les principaux points restant à qualifier : synchronisation fine de l'interpolation
visuelle crête/lèvre, raccords près du sable, aspect de l'écume, caméra à l'intérieur
du tube, collision du corps, animations du hamster, sons et pénalité en course.

## Tests

- `node --experimental-strip-types --test tests/surf-barrel.test.mjs` :
  synchronisation des crêtes, profondeurs, disparition avant la plage, clairance,
  réussite/chute, budget mesh, replay.
- `npm test` : tous les tests unitaires et contrats de compilation Studio.
- `npm run build` : TypeScript + Vite + build statique.
- `npm run test:surf` : acceptation facultative Chromium/SwiftShader,
  y compris indicateurs du tube. Ne remplace pas le test sur iGPU réel.

**Ne pas fusionner** sans CI verte, preuve navigateur, contrôle des coutures
sur une vraie plage et mesure performance bas de gamme.
