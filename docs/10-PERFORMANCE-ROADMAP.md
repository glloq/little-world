# 10 — Performance et agrandissement futur de la carte

**12 novembre 2026 — premières optimisations implémentées, mesures sur PC utilisateur à recueillir.**

**Document de référence pour les budgets globaux : [11 — Politique LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md). Objectif validé : 30 FPS nominaux, secours 20 FPS, simulation indépendante.**

## Objectif

Préparer Little World (prototype actuellement **200 × 600 m**) à devenir une **carte continue pouvant atteindre 10 × 10 km au maximum**, sans sacrifier le rendu low-poly organique ni ajouter prématurément un moteur de streaming complexe. **100 km² est une limite de format, non une capacité validée ni un monde à remplir immédiatement.**

Le projet vise désormais **30 images/s en fonctionnement normal** et autorise une baisse jusqu'à **20 images/s** si nécessaire, sans faire varier la vitesse des déplacements. Le joueur doit rester réactif à ces deux cadences ; le rendu 20 FPS est un filet de secours, non une excuse pour ne pas optimiser les assets et la simulation.

L'objectif est d'**augmenter progressivement les dimensions seulement après mesures**. Ce document ne fixe **aucun chiffre FPS, triangles, RAM ou draw calls comme atteint** ; seuls les tests sur un navigateur PC peuvent valider les performances réelles.

## Travail déjà intégré

| Technique | Implémentation | Bénéfice attendu |
| --- | --- | --- |
| Terrain en **16 sections** (2 × 8) | `src/world.ts:createTerrain` | Frustum culling des secteurs hors caméra ; base pour LOD futurs |
| Végétation en **6 secteurs longitudinaux** | `src/world.ts:createForest` | Ne pas dessiner les arbres éloignés hors champ |
| InstancedMesh pour arbres/rochers | `src/world.ts` | Plusieurs dizaines/centaines d'éléments par draw call |
| Cache de géométries | `src/world.ts:geometry` | Partage des meshes de boîtes/cylindres et de la végétation |
| Cache de matériaux | `src/world.ts:mat` | Réduction des matériaux et allocations |
| Chargement GLB mutualisé | `src/world.ts:loadModel` | Une seule requête et ressource 3D partagée par modèle |
| Qualité de rendu | `src/main.ts`, menu en haut à droite | Prise en charge de 3 plafonds de pixel ratio |
| HUD de performance | `src/main.ts` | FPS, **draw calls** et triangles rendus |
| Limites d'eau et navigation | `src/boat.ts` | Calculs simples, sans moteur physique nautique complexe |

Ces mesures facilitent l'extension, mais un monde nettement plus grand demandera de **distinguer chargement de données, visibilité, géométrie et logique**.

## Profilage à réaliser maintenant

Tester sur un même PC et avec les trois réglages de qualité :

| Scène | FPS | Draw calls | Triangles | Observations |
| --- | --- | --- | --- | --- |
| Départ dans la vallée | À mesurer | À mesurer | À mesurer | |
| Forêt en vue rapprochée | À mesurer | À mesurer | À mesurer | |
| Planage, vue panoramique | À mesurer | À mesurer | À mesurer | |
| Village/moulin | À mesurer | À mesurer | À mesurer | |
| Port et bateau en déplacement | À mesurer | À mesurer | À mesurer | |
| Éditeur, après plusieurs régénérations | À mesurer | À mesurer | À mesurer | |

Compléter par temps de chargement, taille JS/GLB, usage mémoire GPU (si profilage navigateur disponible), coûts de la simulation (CPU), garbage collection **et frametimes p50/p95 à 30/20 FPS**. Mesurer le mode dégradé sans changer la vitesse du joueur ou du bateau.

Les chiffres du panneau `renderer.info` sont les **triangles réellement soumis** au rendu de la frame, pas nécessairement la géométrie totale résidente en VRAM.

## Gate préalable à une carte étendue

Avant tout streaming ou agrandissement significatif, instrumenter les **budgets globaux** ([LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md)) et mesurer la scène à **30 FPS**, puis à **20 FPS si nécessaire**. Les plafonds indicatifs (draw calls, triangles, téléchargement, mémoire) sont des garde-fous, pas des gains déjà constatés. Mettre d'abord en place le régulateur d'affichage, la simulation indépendante et les mesures ; garder des scénarios d'essai identiques.

## Étape suivante : culling et LOD

1. Mesurer le coût des **sections de terrain** : trop fines => trop d'appels ; trop grosses => trop de triangles invisibles.
2. Mettre en place **LOD 0/1/2** pour le relief, avec transitions propres, particulièrement en planage.
3. Ajouter LOD ou **impostors** aux arbres distants ; ne pas multiplier les modèles.
4. Séparer données statiques des objets interactifs et de leurs points de collision.
5. Profiler les collisions et la fréquence des tests de profondeur avant d'optimiser la physique.
6. Préparer le générateur pour une compilation par **secteur stable** (ID, version, hachage, AABB et voisins).
7. Charger/décharger des secteurs selon la caméra et la position du joueur seulement si la surface le nécessite.

L'utilisation de **chunks ne signifie pas que le streaming est implémenté** : le prototype charge encore toute sa carte à l'ouverture. Le découpage actuel sert surtout au *frustum culling*.

## Étape ultérieure : streaming géométrique et assets

- Précompilation de maillages, collisions et instances par zone.
- Bundles par zone, chargement asynchrone proche caméra, anticipation selon vitesse (surtout planage).
- Cache mémoire LRU et délai de déchargement pour éviter le clignotement.
- Compression géométrie/GLB seulement après validation coût CPU de décompression (Meshopt ou Draco selon profilage).
- Atlas de textures / KTX2 pour les textures si elles deviennent significatives.
- Petits modèles statiques réutilisables et instancing, tout en limitant le nombre de matériaux.
- Génération déterministe réalisée à l'éditeur, **pas à chaque frame** du jeu.

## Contraintes de conception du générateur

Éviter de figer des constantes **200 × 600** dans tous les modules. Les dimensions et les sections devront être lues d'un `WorldConfig` versionné, et non du code de simulation.

Pour l'instant les dimensions sont encore des constantes dans `src/terrain.ts` : **c'est une dette technique explicite avant extension réelle**. Le Studio multi-éditeurs doit exploiter une **vue mondiale 2D/simplifiée**, indépendante des maillages haute résolution, et recompiler localement les données de navigation libre des PNJ en cas de modification terrain/eau/obstacles.

Le format des cartes éditables doit pouvoir référencer des objets par ID, des zones par coordonnée locale et des assets par ID stable, sans dépendance à l'ordre de génération.

## Scénarios d'extension vers 10 × 10 km

- Générer un monde **synthétique de taille maximale** en données source et secteurs, sans le peupler intégralement.
- Déplacer la caméra/éditeur vers des secteurs très éloignés et confirmer que seules les ressources utiles sont actives.
- Vérifier le passage du PNJ d'une zone à une autre par graphe de navigation **hiérarchique**, sans recalcul de chemin global chaque frame.
- Comparer marche, planage, bateau et vue globale Studio sur les **mêmes budgets 30/20 FPS** et sans ralentissement de simulation.
- Mesurer le coût des données de source, du manifest global, de la navigation par secteurs, de la mise à jour locale et de l'export/compilation.
- Le plafond 100 km² **n'est pas un résultat de performance atteint** tant que les essais de production n'existent pas.

## Procédure d'acceptation

- **Ne pas inventer de gains** : comparer *avant / après* avec la même scène, la même caméra, la même résolution et le même matériel.
- Garder les tests de contrôle, bateau, plongée, éditeur et import/export au vert.
- Ne pas augmenter la taille du monde tant que la qualité, les FPS et la mémoire ne sont pas suffisamment mesurés.
- Une optimisation du rendu ne doit pas réduire la cohérence géographique ou les collisions du joueur.
- Documenter le surcoût de chaque draw call supplémentaire avant de découper encore davantage le terrain.
