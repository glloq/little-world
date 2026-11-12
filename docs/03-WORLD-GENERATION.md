# 03 — Carte, génération et compilation du monde

**Statut : terrain et rivière procéduraux codés en prototype**, mais édition fine, compilation éditable et contrôles de cohérence restant à développer. V1 mono-carte solo statique.

## Géographie

- Carte jouable : **200 m de large × 600 m de long** (enveloppe de conception).
- Vallée montagneuse orientée **de la source vers la mer**.
- Rivière, moulin à eau, forêt, clairières, village, estuaire, port, côte maritime.
- Montagnes lointaines et pentes raides : contraintes naturelles et décor simplifié.
- Quelques ruines, éléments de magie environnementale discrets.
- Relief en hauteur pour rendre le **planage** intéressant ; profondeurs localisées pour la **plongée**.

## Génération procédurale déterministe

Le monde est **généré dans l'éditeur**, retouché, puis **compilé en ressources statiques** servies par GitHub Pages. Il n'est **pas nécessaire de régénérer la vallée à chaque ouverture du jeu**.

Pipeline :

1. Paramètres versionnés : `seed`, dimension, version du générateur, styles.
2. Axe de vallée, zones de montagne et littoral.
3. Source, rivière continue, profil de hauteur descendant, connexion à la mer.
4. Terrain triangulé low-poly à partir de profils/bruit et contraintes d'eau.
5. Emplacements potentiels du moulin, village, chemins et pontons.
6. Distribution de végétation/rochers selon altitude, pente, distance à l'eau.
7. Application des **modifications manuelles** (sculpture, splines, placements).
8. Compilation des géométries, collisions simplifiées, instances et interactions.

Les mêmes entrées `seed` + `generatorVersion` + paramètres doivent produire le même résultat.

## Structure à conserver dans l'éditeur

- `base` : résultat procédural.
- `overrides` : retouches humaines non destructives.
- `authored` : bâtiments/objets/chemins/interactions ajoutés volontairement.
- `compiled` : carte optimisée pour l'exécution dans le jeu (recalculable).

**Aucune régénération ne doit écraser silencieusement les overrides.** Le mode aperçu doit signaler les conflits.

## Géométrie et eau

- Terrain principal sous forme de **heightfield maillé** ; grottes, falaises surplombantes et ponts en maillages distincts.
- Rivière dessinée par **spline**, largeur et profondeur configurables.
- Surface visuelle, fond physique et **volume d'immersion logique** séparés.
- Moulin : roue et vanne séparées, positions de pivot précises, animation locale.
- Mer : niveau défini, zone praticable limitée par le relief/conception.
- Collision simplifiée, culling par section si nécessaire ; **pas de système de chunks infinis**.

## Fichiers et publication

- **Source éditable** : manifeste versionné et données JSON (terrain, eau, objets, overrides).
- **Build joueur** : GLB/meshes, objets instanciés, textures locales, manifeste et interactions.
- Référencer les assets par ID stable ; inclure un `schemaVersion` et `worldVersion`.
- Le jeu charge la **carte compilée par défaut** via des URL relatives à la base Vite `/little-world/` ; pas d'API serveur.
- Dans la V1, **l'éditeur conserve ses modifications localement** (IndexedDB) et propose un import/export JSON. Publier une nouvelle carte sur Pages nécessite de l'ajouter au dépôt et de reconstruire.
- Versionner les données sources et assurer une validation avant compilation.

## Performance

- Petit monde fixe : tester un **chargement complet** avant d'implémenter un découpage progressif.
- Instancing des arbres/rochers ; faible nombre de matériaux/lumières.
- Géométries éloignées simplifiées, textures compactes, allocations évitées dans la boucle.
- Limiter draw calls, triangles, taille des GLB et coût des collisions.
- Les objectifs de taille et FPS sont **des budgets à mesurer** sur PC réels, pas des garanties.

## Vérifications

- Même graine et paramètres → résultats identiques.
- Source → rivière → estuaire → mer sans discontinuité incohérente.
- Maison/moulin/ponton placés sur surfaces adaptées.
- Parcours de la vallée praticable ; endroits où le planage et la plongée sont réellement utiles.
- Sauvegarde, export, import et rechargement de la carte source fidèles.
- Publication de la carte compilée sur **site statique sans backend**.
- Modification de la carte impossible depuis le mode joueur.
