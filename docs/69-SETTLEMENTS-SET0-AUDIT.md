# 69 — SET-0 : audit du code existant (colonies, collisions, Studio)

**Statut : AUDIT DE CODE EFFECTUÉ ; BASELINE D'EXÉCUTION NON QUALIFIÉE.**  
**Source inspectée : `main` @ `4ea35031b078296b4e94d4c565718499bcb405fd`, 17 novembre 2026.**  
Branche cible : `docs/studio-settlements-collision-roadmap`. Aucun moteur de colonies n'a été codé au cours de cet audit. Les conclusions portent sur le code effectivement consulté et sur le catalogue d'assets ; **pas** sur une exécution locale ou des FPS mesurés.

**Lecture connexe** : [65 — périmètre](65-SETTLEMENTS-STUDIO-SPEC.md), [66 — placement et routes](66-SETTLEMENTS-PLACEMENT-NETWORK.md), [67 — collisions](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md), [68 — roadmap](68-SETTLEMENTS-ROADMAP-TESTS.md), [70 — décisions de contrat](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md).

## 1. Matrice de réalité : composants réutilisables et lacunes

Légende : **EXISTANT** = code concret inspecté ; **PARTIEL** = mécanisme disponible mais besoin SET non couvert ; **ABSENT** = aucune capacité métier équivalente confirmée dans les chemins inspectés ; **À TESTER** = comportement à qualifier par exécution.

| Domaine | État | Preuve dans `main` | Impact pour les colonies |
| --- | --- | --- | --- |
| Projet Studio V3 et entités | **EXISTANT** | `src/studio-core/types.ts`, `schema.ts` | `EntityDefinitionV3`, composants typés, bibliothèques et IDs stables |
| Édition réversible | **EXISTANT** | `src/studio/session.ts`, `studio-core/commands.ts` | CommandBus, transactions et validation de secteurs ; réutiliser |
| Prefabs, variantes, assemblies | **PARTIEL** | `studio-core/references.ts`, `assemblies.ts` | variantes et groupes visuels ; assemblages n'embarquent pas les interactions |
| Placement manuel | **PARTIEL** | `studio/viewport/placement-rules.ts`, `placement-tool.ts` | limites et eau bloquantes, pente/proximité surtout en avertissements ; pas de rotation/empreinte détaillée ou vérification de porte |
| Catalogue assets | **EXISTANT** | `assets/world-assets.json`, `world-production/registry.ts` | 98 assets, 97 avec usage ; LOD et dimensions disponibles |
| Recettes de colonies, quartiers, parcelles | **ABSENT** | absence de types de colonies dans `studio-core/types.ts`, `schema.ts`, panneaux Studio inspectés | créer des recettes versionnées, solveur et aperçu |
| Routes visibles | **EXISTANT** | `world-data.ts`, `paths/path-geometry.ts`, `paths/path-view.ts` | 4 profils, splines, mesh par secteur et diagnostic |
| Graphe routier navigable | **PARTIEL** | `world-compiler/chunks.ts` ne produit que `pathIds`/voisins | pas de graphes nœuds/liaisons/multi-étages prêts pour villages |
| Collisions runtime | **EXISTANT** | `physics/collision-world.ts`, `player.ts` | balayage cinématique 3D, sous-pas ≤ 0,2 m, index spatial 32 m, plafond/sol, espaces et transitions |
| Collisions d'assets | **PARTIEL** | `world-production/registry.ts::colliderFor`, `physics/definitions.ts` | 1 boîte englobante pour bâtiment courant ; pas de découpe de porte |
| Collision compilée V3 | **EXISTANT** | `world-compiler/chunks.ts`, `runtime/compiled-world.ts` | `Collider` de l'entité compilé en un descriptor, plus morceaux de structures naturelles |
| Ouverture de porte | **PARTIEL — BLOQUANT** | `gameplay/templates.ts`, `gameplay/game-view.ts` | état `open` et rotation visuelle ; **tous** les colliders possédés par l'entité deviennent inactifs lorsqu'elle est ouverte |
| Ciblage d'interaction | **PARTIEL** | `gameplay/game-view.ts::describe` | recherche par distance 3D sur tous les interactables, sans occlusion/mur ni index spatial |
| Économie/vente existante | **EXISTANT, À ADAPTER** | `gameplay/economy.ts`, `ui/interactions/targets.ts` | shops et monnaie existants, pas encore une implantation économie ↔ parcelles |
| Structures naturelles | **PARTIEL** | `structures/natural-structure.ts`, `natural-collision.ts` | arches, ponts, tunnels à meshes/colliders locaux ; pas de grotte résidentielle garantie traversable |
| Espaces souterrains | **PARTIEL** | `physics/collision-world.ts::SpaceProvider`, `TransitionVolume`, docs 24 | connexions de niveaux prévues ; pas de générateur de falaises habitables |
| Navigation compilée | **PARTIEL** | `world-compiler/compile.ts`, `chunks.ts` | descripteurs d'agents et chemins ; **navmesh non pré-calculée** |
| Streaming des bâtiments et collisions | **PARTIEL** | `runtime/compiled-world.ts` | toutes les sources de chunks sont lues au démarrage (cap initial 48 Mio) ; terrain/rendu progressifs |
| Optimisation d'instances et LOD | **EXISTANT, À QUALIFIER** | `world.ts`, `world-production/registry.ts`, `world-production/placed-instances.ts` | géométries partagées, LOD ; étatful conserve objet distinct |
| Ressources PERF | **PARTIEL** | `src/frame-clock.ts`, docs 11/22 | politique 30 FPS/20 FPS, cible GPU intégré ; benchmark de ville dense manquant |

La mention « ABSENT » signifie **non identifié dans le périmètre inspecté** ; elle ne remplace pas une recherche exhaustive dans toutes les branches actives.

## 2. Inventaire concret des assets : pas de suppositions

`assets/world-assets.json` sur le commit audité :
- **98 assets**, **97 avec métadonnées d'usage**, **215 fichiers GLB LOD**, **1 295 652 octets** déclarés au registre. Ce sont des **données de catalogue**, pas la mémoire GPU ni le coût d'une colonie.
- **Habitations / activité déjà cataloguées** : `architecture.farmhouse`, `architecture.house_blue`, `architecture.house_timber`, `architecture.inn`, `architecture.stone_house`, `architecture.wooden_cabin`, `architecture.watermill_log_stone`, `architecture.windmill_stone`, `structure.pier_hut`, `architecture.lighthouse`.
- **Défense/lieux** : `architecture.castle_keep`, `architecture.watchtower`, `structure.castle_wall`, `structure.castle_gate`, `structure.castle_tower`, `landmark.cave_entrance`, `architecture.church`, `architecture.cathedral`.
- **Infrastructures** : `structure.bridge_log`, `structure.bridge_stone`, `structure.bridge_wooden_arch`, `structure.dock_tile`, `structure.dock_ramp`, `structure.palisade`, clôtures, murets, comptoirs forêt/mine/port, étal, puits, fontaine, feu, bancs.
- **À créer ou confirmer dans d'autres catalogues** : tente, yourte, dôme/terrier avec porte/fenêtre/cheminée, maison terre/adobe/pisé, façade blanche paramétrique, forge/fonderie en tant que bâtiments fonctionnels, intérieurs troglodytes, grotte habitable avec ouverture de terrain.

**Décision** : distinguer `AVAILABLE`, `VARIANT_OR_ASSEMBLY`, `TO_BUILD`. Ne pas exiger de nouveaux GLB pour des variations de couleur, de matériaux ou de petit décor.

## 3. Risques techniques vérifiés par lecture

### SET0-B01 — porte et bâtiment partagent une boîte solide (BLOQUANT)

`colliderFor` produit normalement **un collider box sur l'empreinte complète** d'un bâtiment ; `compileChunkData` émet un seul `Collider` pour l'entité, puis `game-view.ts` active/désactive ce collider selon `state.open` de l'entité. Deux erreurs potentielles si l'on rendait une maison interactive telle quelle :
1. **Porte visuellement ouverte mais entrée encore bloquée** quand on laisse la boîte de bâtiment active ;
2. **Maison entièrement traversable** si la même entité porte l'état `open`.

**Gate** : découper les volumes solides en murs/linteau/toit/plancher séparés ; la **barrière de porte** doit avoir une identité et un état distincts. Les ouvertures sont des vides réels. L'AABB de bâtiment peut subsister comme broadphase, mais pas comme narrowphase bloquant les portes.

### SET0-B02 — la précision des colliders est conservative (BLOQUANT POUR PASSAGES)

`physics/definitions.ts::transformedCollider` enveloppe les boîtes transformées dans des **AABB monde**, conservant les gros volumes mais élargissant les coins d'un bâtiment tourné. `WorldCollisionQuery` évalue ses obstacles via bounds AABB même si `shape='sphere'`. C'est adapté aux obstacles simples mais pas aux passages étroits et formes courbes.

**Gate** : préférer petits sous-volumes simples et quelques surfaces marchables ; ne pas lancer un mesh collider triangle pour toutes les maisons. Mesurer les faux blocages à 0°, 30°, 45°, 90° et sous plusieurs échelles.

### SET0-B03 — interactions « à travers le mur » (BLOQUANT POUR MAGASINS)

`game-view.ts::describe` parcourt les `targets` et évalue **seulement la distance 3D** avec `Math.hypot`, sans requête d'occlusion. La même boucle est potentiellement coûteuse avec beaucoup d'objets interactifs.

**Gate** : index spatial/récupération du voisinage et test de visibilité vers l'ancre nommée de l'interaction. La distance d'affichage et la distance d'interaction ne doivent pas autoriser un achat depuis l'autre côté d'une façade.

### SET0-B04 — voirie visuelle sans réseau de transport (BLOQUANT POUR GÉNÉRATEUR)

`PathDefinition` contient `id, points, width, kind, smooth`. Les 4 `kind` sont `trail | dirt | stone | wood`, et `path-geometry.ts` calcule des surfaces/raccords et diagnostics. Il n'y a pas de modèle de nœuds 3D avec accessibilité par type d'agent et graphe de connexion complet. Le diagnostic `PATH_DUPLICATE` compare les paires de chemins et peut croître quadratiquement.

**Gate** : construire un graphe **logique** indépendant des profils visuels et indexé spatialement. Chaque porte doit être raccordée à ce graphe ; les ponts, escaliers et terrasses requièrent des connexions d'altitude explicites. Déplacer un segment ne doit pas casser la route « en pierre » par simple changement de matériau.

### SET0-B05 — une grotte graphique n'ouvre pas le heightfield (BLOQUANT POUR EXPLORABLE)

`geography/archipelago.ts` indique explicitement que surplombs et grottes sont des **maillages 3D locaux** ; `natural-structure.ts` n'effectue pas de CSG global, mais des volumes locaux et des modifications réversibles du relief. Aucun contrat prouvé n'expose actuellement une cavité horizontale réelle dans la collision du heightfield à l'emplacement d'une grotte de falaise.

**Gate** : prototype physique source de vérité sol/paroi/ouverture **sans faux passage**, puis seulement proposer `enterable` ; décorative sinon. Réutiliser `SpaceProvider` et `TransitionVolume` pour les niveaux sans transformer l'île en voxels.

### SET0-B06 — démarrage et charge d'une grande ville (RISQUE PERF)

`openCompiledWorld` récupère d'abord **tous les chunks compilés** (6 chargements concurrents par défaut), avec rejet au-delà de **48 Mio de payload auteur** ; les modèles de terrain et détails visuels restent plus progressifs. `game-view.ts` enregistre initialement tous les colliders passés par le playable. La broadphase est une grille 32 m ; les performances p95/p99 sur 600 bâtiments restent inconnues.

**Gate** : mesure mémoire/chargement/collision et stratégie d'activation par secteur pour une grande colonie, sans désactiver une collision sur la trajectoire du joueur. Ne pas déclarer « 600 bâtiments OK » avant benchmark.

### SET0-B07 — schémas V3 stricts et suppression manuelle (RISQUE DATA)

`parseComponents`, `parseEntity`, `parseLibraries` et les validateurs V3 refusent les champs inconnus. La génération ne peut pas simplement ajouter `settlement`, `buildingProfile`, `compoundCollider` dans les JSON sans modifier **contrats, validateurs, migrations et compilation**. Les assemblies existantes copient des éléments visuels/colliders, **pas** les interactions.

**Gate** : formaliser un contrat versionné pour recettes/prefabs/parties fonctionnelles, dérivés non persistants, ID stable, propriété des objets, diff et Undo/Redo. Ne pas sérialiser de champs temporaires de calcul ou de GPU.

### SET0-B08 — génération manuelle ≠ validation automatique (RISQUE UX)

`checkPlacement` refuse les limites du monde ou l'eau profonde ; une pente excessive ou une proximité d'objet produit un **warning** plutôt qu'un rejet systématique. Il n'y a pas encore de validation sur footprint orienté, parcelle, distance d'une porte à la route ni hauteur libre.

**Gate** : séparer contraintes bloquantes, avertissements et préférences ; diagnostiquer toute requête obligatoire non réalisable avant commit.

## 4. Points positifs à préserver — décisions « REUSE »

1. **Moteur collision actuel** : `WorldCollisionQuery`, broadphase à cellules 32 m, `move/sweep`, `SpaceProvider`, `TransitionVolume`. Ne pas réinventer de moteur physique.
2. **Simulation fixe** : `simulatePlayer` et `FrameClock` ; ne pas créer de rAF ni lier collisions aux FPS.
3. **Studio V3** : `ProjectDocument`, `StudioSession.change`, `CommandBus`, ID stable, references, édition réversible et compilateur sectorisé.
4. **Chemins** : `PathDefinition`, `paths/path-geometry.ts`, `paths/path-view.ts` comme sortie visuelle, pas un moteur routier parallèle.
5. **Modules naturels** : `naturalColliders` découpe déjà les voûtes, à conserver pour ponts/arches et réutiliser conceptuellement pour grottes.
6. **Templates d'interactions** : `makeDoor`, `makeLever`, `makeCollect`, `makeDeliver` ; étendre des points et conditions nommés, non par scripts dans les cartes.
7. **Assets/LOD** : registre GLB avec dimensions/LOD/collision d'usage, instancing des décors et objets stateful individualisés.
8. **Gouvernance PERF** : respecter documents 11 et 22 ; collisions et interactions priment sur les effets graphiques.

## 5. Niveau de validation réellement atteint

| Contrôle | Résultat de l'audit |
| --- | --- |
| Lecture du code cible `main` et comparaison aux docs | **FAIT** |
| Inventaire registry GLB/LOD/roles (98 assets) | **FAIT** |
| Vérification des API V3, conversion compiler/runtime, collisions, routes, gameplay | **FAIT par inspection statique** |
| Choix du contrat cible initial | **VALIDÉ POUR CADRAGE** dans [70](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md) |
| `npm test`, `npm run typecheck`, `npm run build` sur cet instantané | **NON EXÉCUTÉS** ; aucun clone exécutable dans l'environnement d'audit |
| `npm run test:studio`, `npm run test:paths`, tests collision navigateur | **NON EXÉCUTÉS** |
| Mesure GPU intégré / Chrome / Firefox / 20–30 FPS | **NON MESURÉE** |
| Test terrain de grotte traversable | **NON DÉMONTRÉ** |
| Test de collision à 120 km/h contre maisons/portails | **NON DÉMONTRÉ** |
| Qualification « prêt à implémenter toutes les villes » | **NON — blocages B01…B08 ouverts** |

Aucun statut `TESTED` ou `BENCHMARKED` ne doit être attribué à SET-0 sur la base de la seule lecture du code. Les contrats [70](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md) sont **compatibles conceptuellement**, mais leur extension réelle des schémas doit être accompagnée de tests/migrations.

## 6. Prochaines actions ordonnées

- **P0, avant toute génération** : baseline tests, mesurer le nombre de colliders, fixer l'interface d'ouverture/portes et choisir l'extension versionnée du modèle V3.
- **P0** : prototype collision d'une maison avec porte ouverte/fermée et surfaces d'appui, vérification à angle et à vitesse élevée ; rendu et physique distincts.
- **P0** : prototype de graphe 3D d'une rue principale, 3 branches mutualisées, parcelles et points d'entrée.
- **P1** : prototypes terrier et grotte ; si ouverture heightfield impossible, garder le mode décoratif et ouvrir une décision technique dédiée.
- **P1** : scene minimaliste 12 bâtiments, camp, port, forge et moulin, puis 80 bâtiments pour valider bornes.
- **P1** : mesures de densité 20/80/300/600 bâtiments et plan de streaming adapté aux résultats.

**Aucune implémentation SET-1…SET-12 n'a été réalisée lors de cette phase.**
