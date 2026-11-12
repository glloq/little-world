# 03 — Carte, génération et compilation du monde

**Statut : carte source v2 partagée, compatible v1.** Configuration dynamique de 200 × 600 m à 2 × 2 km, retouches terrain/biotopes, volumes d’eau, chemins, placements et PNJ. Le compilateur statique valide le JSON et émet un manifeste de limites de secteurs ; la génération des meshes est encore faite à la demande dans le navigateur. La vallée intégrée reste la carte par défaut, les grands formats sont des scènes synthétiques.

`maps/default.json` est la source ; `public/maps/default.json` et `public/maps/default.chunks.json` sont produits par `npm run compile:map -- maps/default.json public/maps/default.json`. Le jeu charge la carte statique avec la base Vite ; en mode test il utilise le même validateur sur le brouillon de session. Les anciens exports v1 migrent vers v2 sans perdre leurs placements.

Les retouches sont séparées en tableaux `terrain`, `biomes`, `water`, `paths` et `placements`. Les IDs sont stables. Aucun script importé n’est exécuté. Le générateur conserve encore une rivière et des bâtiments de démonstration aux positions historiques ; il ne constitue pas un auteur géographique arbitraire complet. Les bornes minimales préservent ces emplacements.


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
