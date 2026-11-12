# 03 — Génération, format et compilation d'une carte continue

**Statut : spécification cible ; prototype de vallée 200 × 600 m existant.**
**Périmètre :** carte continue jusqu'à **10 × 10 km maximum** (100 km²), sans garantie de pouvoir la charger intégralement en mémoire.

## Géographie

La carte de démonstration reste une vallée source → rivière → moulin → village → port → mer. L'architecture cible ne doit **pas imposer** cette géographie à tous les projets créés dans le Studio.

- **Un monde jouable = une géographie unique et continue**. Plusieurs projets/cartes auteur peuvent être enregistrés séparément, pas plusieurs niveaux disjoints dans une partie.
- Dimensions du monde configurables, maximum **10 km par axe**.
- Terrain heightfield maillé pour le relief ; grottes, tunnels, ponts et surplombs sous forme de meshes/prefabs distincts, pas de voxels universels.
- Rivières, lacs, bassins, cascades et mer : géométrie visuelle et volumes physiques distincts.
- Biotopes : régions et pinceaux, règles de densité et d'espèces, zones interdites/exclusions ; variations locales reproductibles.

## Source d'autorité

L'auteur travaille sur des **sources éditables**. Le runtime ne doit pas traiter les géométries affichées comme la source de vérité.

```text
WorldDefinition (ID, schemaVersion, seed, dimensions, paramètres globaux)
 + GeneratorVersion + BaseGeneration
 + TerrainOverrides / RiverSplines / Paths / BiomeRegions
 + PlacedObjects / Prefabs / NPCs / Triggers / Dialogues / Interactions
 = Compilation sectorisée → WorldManifest + ChunkBundle[] + AssetRegistry
```

- La même version de générateur, graine et paramètres donne les mêmes données de base.
- Les retouches **ne sont jamais écrasées silencieusement** par une régénération.
- La régénération locale affiche aperçu et conflits ; elle peut être annulée.
- Les entités conservent un ID stable, les ressources un `assetId` stable.

## Secteurs et grande carte

- Taille initiale proposée des chunks : **64 × 64 m**, configurable et vérifiée en benchmark.
- Secteurs avec IDs stables, AABB, voisinage, version, sources auteur, géométries compilées.
- Culling, LOD terrain et végétation, chargement prioritaire autour de la caméra/joueur et de sa vitesse (planage, bateau).
- **Un aperçu global 2D/simplifié** pour le Studio, sans charger tous les maillages 3D haute résolution.
- Compiler seulement les secteurs modifiés et invalider les dépendances (collision, végétation, navigation PNJ) selon les changements.
- Les PNJ peuvent naviguer librement : **topologie traversable à grande échelle** (ponts/portes/secteurs) + planification locale/évitement.
- Éviter d'activer tous les PNJ, poissons et oiseaux de la carte au même instant.

## Eau, relief et interactions

- Surface visible, niveau, fond et volume d'immersion séparés ; pas de simulation hydrodynamique lourde.
- Vérifier la continuité des splines et l'accessibilité des transitions (rive, pont, embarcation).
- Tracer chemins/splines avec exclusion locale de végétation et options de pont.
- Bâtiments et intérieurs simples configurables par modules, non générés comme terrain volumétrique.
- Les points d'interaction, NPC et volumes sont des **données**, pas des éléments codés dans `world.ts` pour chaque cas.

## Sauvegarde et publication

- Ne pas imposer **un unique JSON gigantesque** pour 100 km² ; manifeste + données par secteur + références partagées.
- Le Studio conserve des brouillons IndexedDB et exporte une archive de projet portable avec versions ; contrôles de références/assets et migrations.
- Le jeu charge **les chunks compilés**, assets GLB et états interactifs ; les slots de **sauvegarde joueur** (position, inventaire, flags) sont indépendants des données Studio.
- Publication d'une carte dans le jeu public : export/validation → dépôt GitHub → build statique → GitHub Pages. Aucun token d'écriture GitHub exposé.
- **Pas de serveur, de chargement de niveau indépendant ni de collaboration multi-utilisateur** requis.

## Critères techniques

1. Même seed/versions/paramètres → même génération.
2. Sculpter une zone ne reconstruit pas toute la carte.
3. Une régénération ne détruit pas les overrides, événements, PNJ, chemins et assets déjà placés.
4. Le Studio ouvre une section depuis le plan global avec une latence mesurée acceptable.
5. Le jeu peut traverser plusieurs secteurs sans cassure visible, sans changement de vitesse de simulation.
6. Les navmeshes/graphes de navigation affectés par le terrain/eau/bâtiment sont invalidés localement.
7. Une carte proche du plafond 10 × 10 km peut **être représentée dans le format source**, mais ses performances doivent être benchmarkées avant toute promesse.
8. Vérifier les budgets de [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md) : cible 30 FPS, secours 20 FPS.

Voir [13 — Studio](13-STUDIO-UX-ARCHITECTURE.md) pour les flux d'édition.
