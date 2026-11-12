# 03 — Génération, format et compilation d'une carte continue

**Statut : spécification cible ; prototype de vallée 200 × 600 m existant.**
**Périmètre :** carte continue jusqu'à **10 × 10 km maximum** (100 km²), sans garantie de pouvoir la charger intégralement en mémoire.

## Implémentation de cette branche

**Statut : carte source v2 partagée, compatible v1.** Configuration dynamique de 200 × 600 m à 2 × 2 km, retouches terrain/biotopes, volumes d’eau, chemins, placements et PNJ. Le compilateur statique valide le JSON et émet un manifeste de limites de secteurs ; la génération des meshes est encore faite à la demande dans le navigateur. La vallée intégrée reste la carte par défaut, les grands formats sont des scènes synthétiques.

`maps/default.json` est la source ; `public/maps/default.json` et `public/maps/default.chunks.json` sont produits par `npm run compile:map -- maps/default.json public/maps/default.json`. Le jeu charge la carte statique avec la base Vite ; en mode test il utilise le même validateur sur le brouillon de session. Les anciens exports v1 migrent vers v2 sans perdre leurs placements.

Les retouches sont séparées en tableaux `terrain`, `biomes`, `water`, `paths` et `placements`. Les IDs sont stables. Aucun script importé n’est exécuté. Le générateur conserve encore une rivière et des bâtiments de démonstration aux positions historiques ; il ne constitue pas un auteur géographique arbitraire complet. Les bornes minimales préservent ces emplacements.


La limite **expérimentale du validateur actuel** est de 2 km par axe. Le plafond de conception reste 10 km par axe ; le format sectorisé et le streaming complet de 100 km² restent à développer.

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

## Vue panoramique : production de reliefs et d'horizons lointains

Décision documentée dans [17 — Rendu sans brouillard, horizon et imposteurs](17-DISTANT-VIEW-RENDERING.md) : la **surface du monde et les objets lointains doivent rester visibles en silhouette** sans précharger les maillages proches.

- Le générateur/compilateur doit pouvoir produire **reliefs/côtes/îles en meshes ultra-légers** séparés des chunks locaux.
- Les **massifs de forêt, monuments et bâtiments éloignés** peuvent bénéficier de proxies ou imposteurs précalculés, seulement là où la perspective reste crédible.
- Les produits de rendu (proxies, images, atlas) sont **dérivés des sources**, avec hash et invalidation après édition locale ; les overrides restent la source d'autorité.
- Le **ciel/skybox** ne remplace pas les montagnes approchables ; pas de fog de dissimulation.
- Les vues de planage et haute altitude doivent être évaluées en priorité. Une distance de vue profonde **n'implique pas** de charger la végétation/faune/physique de l'horizon.
- Mesurer la taille des ressources, les changements de LOD, le temps de compilation et la charge GPU avant de figer le codec et les distances.

## Végétation basse : herbes procédurales très légères

La [spécification 18](18-GRASS-LOW-RESOURCE.md) fixe la stratégie d'**herbes courtes/hautes low-resource**, complémentaire au rendu lointain sans brouillard du document 17 :

- Le **sol porte la majorité de l'aspect herbeux** via les couleurs du heightfield et les règles de biotopes.
- Des **touffes 3D opaques instanciées** sont générées seulement dans une bande locale utile autour du joueur ; aucune instance persistante par brin.
- Le placement se reconstruit à partir de `seed + version + chunk + biotope`, avec exclusions (routes, eau, bâtiments) et paramètres auteur ; l'anneau local **n'entraîne pas de glissement** des touffes en coordonnées monde.
- Toute édition de biotope ou de terrain **invalide seulement les cellules concernées**, avec Undo/Redo V3 ; le monde à 100 km² reste descriptible sans stocker chaque herbe.
- Le vent et les interactions sont purement visuels côté client, sans influence sur collisions/PNJ ; le terrain lointain conserve des couleurs/silhouettes sans géométrie d'herbe.

## Environnement macro-régional : météo sans simulation par chunk

La [spécification 19](19-ENVIRONMENT-WEATHER-SKY.md) fixe un **état environnemental indépendant du moteur de relief** : soleil, ciel étoilé, plusieurs lunes à cycles distincts, climats, vent, neige au sol et brouillard météo.

- Les **zones climatiques** couvrent de grands territoires/altitudes ; **pas de simulateur de météo pour chaque chunk de 64 m**.
- `EnvironmentDefinitionV3` décrit l'environnement auteur ; `EnvironmentSnapshot` décrit l'état dynamique horodaté ; le rendu lit des paramètres sans altérer le relief.
- L'apparence neigeuse du terrain, des arbres, des toitures et des **proxies lointains** utilise des masques/coefficient de matériau, **pas une nouvelle triangulation ou une seconde carte**.
- Le calcul de chute de neige/pluie et ses particules n'a lieu **qu'autour du client** ; neige accumulée/fonte par région peut rester cohérente hors champ.
- Les règles météorologiques dépendantes du temps utilisent une **horloge unique** : source locale pendant la bêta, serveur comme autorité seulement lors d'une phase multijoueur ultérieure.
- Les **lumières d'astres n'augmentent pas avec le nombre de lunes** ; pas de shadow map globale de terrain, une zone solaire proche seulement si qualité suffisante.
- L'éditeur peut tester des états météo arbitraires **sans écrire les paramètres de test dans les sources auteur**.

## Géographie depuis Blender et export de monde Studio

**Décision validée :** [20 — Blender, presets, heightfields et cartes rééditables](20-BLENDER-STUDIO-INTERCHANGE.md). Un monde peut mélanger **relief heightfield importé de Blender**, retouches locales Studio et **falaises/grottes/arches en modules GLB**.

- **Blender crée la géométrie** ; le **Studio conserve** la source géographique sectorisée, les biotopes/masques/densités, eau/splines, routes, placements, PNJ et logique.
- Hauteurs importées en **heightfield avec échelle, origine, précision et bornes explicites** ; vérifier vraie précision 16 bits ou binaire. Pas d'inférence des altitudes depuis une simple texture 8 bits.
- Pour la géométrie complexe/overhang, **import GLB modulaire**, mais terrain et collisions restent des données séparées. Une carte de 10 × 10 km n'est jamais exportée comme un **unique gros GLB** à charger d'un coup.
- **Export/import carte complète** en ZIP standard **portable** contenant manifest, fichiers source par secteur, heightfields/masques, prefabs/GLB, données de biotopes, navigation, PNJ, dialogues, interactions et météo ; ne pas confondre avec build compilé ou scène Blender.
- **Export d'une zone vers Blender** = GLB + sidecar IDs/transforms pour **modifier les géométries/placements**, sans perte des états non géométriques au réimport. Afficher les différences et préserver les overrides sans écrasement silencieux.
- Les **presets de paysage** (ruines, pont, bord de marais, port, village) doivent pouvoir être importés/exportés et **repeints** dans Studio. Les végétaux instanciés restent générés par seed et recette, non dupliqués en géométries Blender.
- Recompiler **uniquement les secteurs et index affectés** après import, modification de prefab, terrain ou biome. Préflight des tailles/collisions/liaisons/compatibilité low-poly avant publication.

## Réseau d'eau compilé : relief, cascades et mer lointaine

La [spécification 21](21-WATER-HYDROLOGY-LOW-RESOURCE.md) complète l'eau de la carte : **rivières tracées dans Studio** sous forme de splines avec source/exutoire, niveau automatique suivant le terrain, rapides/cascades, jonctions, lacs horizontaux et embouchure.

- **WaterNetwork** est une source auteur de nœuds/segments/bassins/chutes ; **volumes de nage/courants** indépendants des rubans et LOD visuels. Une cascade possède **haut/bas** et la mer un niveau de référence.
- Profil de pente et adaptation du lit calculés **à l'édition/compilation** sur le **terrain source avant incision du lit** ; signaler rivière ascendante, niveaux verrouillés contradictoires et jonctions invalides.
- Rivières, berges, profondeurs, volumes, nav et masques d'écume sont recompilés **par secteurs affectés**. Les overrides auteur/IDs demeurent stables, avec Undo/Redo et migration V2 non destructive.
- **Océan en patches et LOD0–3** : surface toujours visible au loin sans fog-cache, mais **pas de vagues/écume/transparence coûteuse au loin**. Éviter l'eau dessinée sous les îles et les seams entre chunks.
- Vue sous-marine : visibilité, couleur et volume selon **caméra réelle**, sans second moteur; gameplay ne dépend pas du niveau de détail visuel.
- Export ZIP V3 inclut sources hydrographiques et références ; un GLB Blender de cascade n'implique pas automatiquement un volume de nage.

## Génération, secteur et cache sous budget global PERF

Le [contrat PERF](22-RESOURCE-BUDGET-MANAGER.md) remplace l'optimisation locale isolée par un **budget commun de streaming, temps de génération et mémoire**. Le monde reste **une géographie continue jusqu'à 10×10 km**, avec relief d'horizon sans brouillard-cache.

- Le planificateur priorise chunks **proches/visibles**, puis préchargement **devant le joueur** en planage/bateau, puis ressources lointaines non critiques ; ne pas parcourir tous les secteurs.
- **Deux constructions de mesh par update** dans `terrain-view.ts` ne constituent pas une limite de temps CPU : instrumenter leur durée et ajouter un **quota de travail**, des tâches découpées si besoin et un fallback de LOD temporaire.
- Préserver bordures/LOD, **IDs de secteur**, collisions, sources d'eau et biotopes. Le niveau de qualité ne doit modifier que la **représentation**, pas `WorldDefinitionV3` ni la navigation.
- Les caches terrain/éco/GLB doivent déclarer **octets estimés, références et résidence** ; n'évincer que des ressources libérables sans trou, invalider localement après modification.
- LOD de relief, maisons/forêts, cascades et océan selon **taille projetée et importance**, avec priorité aux grandes silhouettes de côtes et îles et jamais de fog de masque.

## Biotopes et sources sonores AUD : pas de coût par objet généré

La [spécification audio 23](23-MIDI-AUDIO-LOW-RESOURCE.md) réutilise la répartition **déterministe** des biotopes/espèces et les volumes d'eau pour déclencher des ambiances à **quelques sources réellement audibles**.

- Les zones de biotope peuvent référencer des **profils d'ambiance et séquences MIDI**, avec 5–10 instruments partagés dans tout le monde et échantillons naturels mutualisés.
- Ne pas associer un moteur audio actif à chaque arbre/oiseau/chunk. Générer seulement des **candidats à événements/émetteurs** par seed, puis limiter ceux audibles au voisinage du joueur avec culling spatial.
- Les rivières/lacs/cascades fournissent des **références logiques** de proximité et intensité de bruit de fond ; aucune dépendance à la géométrie LOD de l'eau.
- Le budget voix/PCM et spatialisation est confié à `AudioBudgetManager` sous PERF ; audio suspendu hors présence du joueur ou onglet inactif, **sans altération du monde auteur**.
- L'archive V3 de carte contient sources MIDI/samples et profils avec références licences, **pas** des milliards d'instanciations sonores.

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
