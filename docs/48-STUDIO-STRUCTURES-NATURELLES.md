# 48 — Structures naturelles : arches, ponts rocheux et tunnels

Branche `feat/studio-creation-workflows-v1`, ne pas fusionner automatiquement dans `main`.

## Parcours dans le Studio

Ouvrir **Structures naturelles** (barre Construire). Choisir **Nouvelle arche rocheuse**, **Nouveau pont naturel** ou **Nouveau tunnel traversant**, puis cliquer **deux extrémités** dans la vue 3D. L'outil réutilise la polyligne et ses poignées : glisser un point pour déplacer une entrée, clic droit/molette pour naviguer, Échap pour abandonner et Entrée pour valider.

Une prévisualisation 3D translucide est générée localement pendant le tracé. Le panneau de tracé permet de modifier, avant validation, **type**, **forme** (arrondie, ogivale, plate), **largeur**, **hauteur libre**, **épaisseur** et **courbure**. La portée suit la distance entre les points. Après enregistrement, sélectionner l'ouvrage puis utiliser **Structures naturelles > Modifier la structure sélectionnée**, ou cliquer **Modifier** dans la liste des ouvrages.

Validation des valeurs : portée 3–40 m ; largeur 2,5–20 m ; hauteur libre 2,3–12 m ; épaisseur 0,6–5 m ; courbure 0,2–2. Un dénivelé supérieur à 3 m entre les extrémités est rejeté. La rotation est automatiquement alignée sur l'axe des deux points.

## Choix techniques

- Le **heightfield global est conservé** : ni CSG ni marching-cubes global sur la carte.
- La roche est un **seul mesh local** de 16 segments, soit **192 triangles** et **1 draw call** par ouvrage (hors instances/LOD) ; couleurs par sommets, pas de textures. Geométrie en `src/structures/natural-mesh.ts`.
- Pour un **tunnel**, une succession de `TerrainEdit` locaux `flatten` crée un couloir praticable au centre, recouvert d'une voûte 3D. Les retouches portent des IDs préfixés `natural:<entityId>:` pour pouvoir les retrouver et les annuler.
- Les roches sont des **colliders analytiques décomposés** en 16 volumes distincts ; aucune boîte pleine ne traverse l'ouverture. La physique peut interroger séparément le plafond au-dessus du joueur et le plancher praticable au-dessus de la voûte.
- Les collisions suivent la transformation V3 et sont calculées dans le Studio et dans le lecteur compilé, indépendamment du LOD visuel.
- Les ouvrages sont des entités V3 avec un `Transform`, un `Visual` builtin `procedural.natural_structure` et un `NaturalStructure` paramétré. Les modèles 3D sources/GLB existants ne sont pas dupliqués.
- Chaque opération de création/modification/suppression fonctionne via une transaction `StudioSession.change` et l'historique Undo/Redo.

## Sauvegarde et édition sûre

Les paramètres sont enregistrés dans le composant `NaturalStructure`. Le projet source ZIP et le monde compilé conservent ces paramètres et recalculent leurs meshes et collisions au chargement.

Afin d'éviter une perte d'intégrité, **les déplacements génériques et Ctrl+D sont refusés pour ces ouvrages** : leur géométrie, leurs collisions et, dans le cas des tunnels, les retouches du heightfield doivent évoluer ensemble. Le panneau spécialisé permet de déplacer les extrémités et redimensionner l'ouvrage. La suppression générique retire également les retouches d'excavation associées.

Le terrain et la voûte sont des **structures hybrides 2,5D + 3D**, **pas** un vrai percement volumique dans le heightfield. Les ouvertures du tunnel s'obtiennent par le couloir de terrain abaissé et le toit rapporté.

## Performance / limitations connues

Budget géométrique maximal par structure : 192 triangles dans un mesh, 16 volumes de collision AABB locaux ; pas de réseau de milliers de voxels ni calcul de CSG. Une copie indépendante utilise actuellement un mesh indépendant ; l'instanciation et les LOD simplifiés par distance pourront être ajoutés si des centaines de structures sont nécessaires.

Les passages sont dimensionnés au minimum pour un personnage de 1,8 m, mais la **qualification réelle de traversabilité** (franchissement sur terrain pentu, caméra, contact avec les bords, nav PNJ) nécessite des tests en jeu sur la carte cible. Les tunnels complexes avec embranchements, les forages entièrement souterrains multi-étages et les plafonds en vraie roche volumique restent hors de ce premier lot.

À contrôler particulièrement : rampes d'accès au sommet des ponts, changement de niveau du terrain après création et collision aux raccords entre les 16 segments.

## Tests

- `tests/studio-natural-structures.test.mjs` : profils, limites, triangle budget, collisions sous/dessus, retouches V3, cycle de suppression/Undo/Redo et compilation.
- `tools/test-studio-natural-structures-browser.mjs` : création, preview, édition, sauvegarde/export ZIP, Undo/Redo, tunnel ; captures Chromium dans les artifacts Actions.
- Workflow `.github/workflows/checks.yml` : **Natural structures Studio acceptance**.

Commande manuelle : `npm test && npm run build`, puis depuis le serveur de prévisualisation `node tools/run-browser-check.mjs studio-natural-structures`.

## Recette humaine

1. Créer une arche sur une plaine, la modifier plusieurs fois et essayer de passer dessous.
2. Poser un pont naturel au-dessus d'une petite ravine, contrôler la montée sur le toit, les appuis et l'espacement des colliders.
3. Tracer un tunnel sur un relief marqué, parcourir toute sa longueur en mode Jouer ici, sans être bloqué par le heightfield.
4. Sauvegarder, recharger, exporter/importer le ZIP puis vérifier que voûte, paramètres et retouches sont inchangés.
5. Tester Undo/Redo, suppression et l'absence de retouches orphelines.
6. Sur PC peu puissant et téléphone compatible WebGL, mesurer draw calls, RAM et fluidité à différentes distances.
