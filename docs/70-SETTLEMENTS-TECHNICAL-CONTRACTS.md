# 70 — SET-0 : contrats techniques retenus pour le générateur de colonies

**Statut : CONTRATS DE CONCEPTION RETENUS APRÈS AUDIT STATIQUE — pas encore implémentés ni qualifiés.**  
**Base du diagnostic : `main` @ `4ea35031b078296b4e94d4c565718499bcb405fd`, 17 novembre 2026.**  
Voir [69 — audit factuel](69-SETTLEMENTS-SET0-AUDIT.md), [65 — périmètre](65-SETTLEMENTS-STUDIO-SPEC.md), [66 — implantation](66-SETTLEMENTS-PLACEMENT-NETWORK.md), [67 — physique](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md).

**Mise en œuvre par résultats utilisateur :** [71 — roadmap accélérée](71-SETTLEMENTS-FAST-TRACK.md) et [72 — interface Studio](72-SETTLEMENTS-STUDIO-UX.md). Ces documents ne changent pas les contrats bloquants décrits ici.

## 0. Sens de « validation »

- **RETAINED** : choix technique retenu pour SET-1 après confrontation au code ; pas une preuve de réussite d'exécution.
- **CONDITIONAL** : choix sous réserve d'un prototype/test de compatibilité ou de performance.
- **BLOCKED** : interdit de livrer la fonctionnalité avant preuve physique/UX.
- **UNDECIDED** : variantes à départager par prototype, sans imposer une technologie lourde.

La validation du schéma **sur le vrai parser** et le passage de `typecheck/build/tests` font partie des gates d'implémentation, pas du présent audit documentaire.

## 1. Tableau de décisions et API propriétaires

| ID | Décision | Statut | Propriétaire actuel ou adaptation attendue |
| --- | --- | --- | --- |
| SET-C01 | Un **seul Studio V3** et son CommandBus pour toute édition | **RETAINED** | `studio/session.ts`, `studio-core/commands.ts` |
| SET-C02 | Recette de colonie déclarative et versionnée, calcul pur indépendant du rendu | **RETAINED** | futur module de logique `settlements/*` + `studio-core/schema.ts` |
| SET-C03 | Séparer projet auteur, plan provisoire, monde compilé, sauvegarde de partie | **RETAINED** | V3 `ProjectDocument`, `world-compiler/*`, `gameplay/save.ts` |
| SET-C04 | Profils architecturaux indépendants de richesse, métier et matériaux | **RETAINED** | bibliothèque d'archétypes + prefabs |
| SET-C05 | Réutiliser `PathDefinition` et `PathView` comme sortie, ajouter un graphe de circulation | **RETAINED** | `world-data.ts`, `paths/*` |
| SET-C06 | Collisions à partir de volumes simples **composés**, indépendants des LOD | **RETAINED** | `physics/collision-world.ts`, contrat V3 à étendre |
| SET-C07 | **Porte comme obstacle séparé**, pas `open` sur le bâtiment complet | **RETAINED — P0** | `gameplay/templates.ts`, compilation collisions |
| SET-C08 | Points d'entrée/d'interaction nommés + clearance et occlusion | **RETAINED — P0** | metadata de prefab, `gameplay/game-view.ts` |
| SET-C09 | Navigation multi-niveaux explicite, aucune connexion par seul croisement XZ | **RETAINED** | route graph + `WorldCollisionQuery` transitions |
| SET-C10 | Terriers/dômes de surface posés ou semi-enterrés | **CONDITIONAL** | recette structure, heightfield local, fondation |
| SET-C11 | Grotte de falaise réellement traversable | **BLOCKED** jusqu'au prototype d'ouverture collision+terrain | `structures/*`, terrain, `SpaceProvider` |
| SET-C12 | Activation logique proche et rendu lointain LOD/imposteur sans collision manquante | **CONDITIONAL** | `runtime/compiled-world.ts`, `ResourceBudgetManager` |
| SET-C13 | Recettes déterministes, IDs stables, verrous, prévisualisation des diffs et rollback | **RETAINED** | `studio-core/*` |
| SET-C14 | Aucun nouveau moteur d'économie, de physique générale, de stockage ou de routes | **RETAINED** | étendre l'existant |
| SET-C15 | Futur multijoueur par IDs, états logiques et événements, sans réseau aujourd'hui | **RETAINED** | données seulement |
| SET-C16 | Pas de plafond fixé de 600 maisons « performant » sans mesures GPU | **RETAINED** | gate PERF et scènes de référence |

## 2. Séparation impérative des sources et dérivés

```text
ProjectDocument V3 (persistance auteur, extensions versionnées)
  ├── SettlementRecipeV1 (préférences, graines, contraintes, verrous)
  ├── BuildingArchetypes / architectural palettes / logical access points
  ├── Prefabs / Entities / water / paths / zones EXISTANTS
  └── Ownership + overrides des objets générés
            |
            v
  SettlementPlanner (calcul pur / preview temporaire, sans Three.js)
     site -> anchors -> transport graph -> districts -> parcels -> buildings
            |
            v
  GenerationDiff (ajouts/modifications/suppressions/conflits)
            |
            v
  StudioSession.change / CommandBus  -- commit ou rollback
            |
            v
  WorldCompiler (entités, chemins, collisions composées, accès/nav)
            |
            v
  Runtime : rendu LOD | collision | interactions | sauvegarde jeu
```

**Source auteur** : recette + objets validés et overrides + relations entre objets.  
**Dérivés jetables** : cartes de score, calcul A*, polygones rasterisés, candidats rejetés, index spatial/cache, GPU, instancing, LOD, primitives compilées reconstituables.  
**État de partie** : portes ouvertes, collecte, achats/récompenses, découvertes, triggers, inventaire ; jamais réécrire automatiquement la source du Studio.

## 3. Contrats de données proposés (illustrations TypeScript NON intégrées au parser)

### 3.1 SettlementRecipeV1 (dans une bibliothèque V3 optionnelle)

```ts
interface SettlementRecipeV1 {
  schemaVersion: 1;
  id: string; generatorVersion: 1; seed: number;
  region: { polygon: {x:number; z:number}[] };
  form: 'isolated'|'camp'|'hamlet'|'linear'|'radial'|
        'organic'|'terraced'|'cliff'|'fortified'|'harbor';
  targetBuildings: number;
  architectureStyleId: string;
  resourceProfileId?: string; wealthProfileId: string;
  activities: {roleId:string;required:boolean;maxCount?:number}[];
  defense: 'none'|'fence'|'palisade'|'stone_walls';
  roadPolicy: {useExisting:boolean;shareAccess:boolean};
  regeneration: {lockedIds:string[];lockedRegionIds:string[]};
}
```

- **Option recommandée** : registre optionnel `libraries.settlements` (ou ressource bibliothèque équivalente validée), jamais champ arbitraire dans `WorldDefinitionV3`. `schema.ts::parseLibraries` doit être étendu explicitement ; librairies historiques sans ce champ restent valides.
- Identifiant de recette distinct des IDs de parcelles, routes, bâtiments et interactions.
- Graines par phase dérivées d'un hash stable de `(seed, recipeId, phaseName, stableSlot)` ; aucun tirage global non déterministe.
- Propriétaire de chaque création automatique + `generationVersion` et emplacement logique stable ; modifications manuelles sous forme d'overrides/verrous.
- Les IDs sont **déterministes pour des slots conservés** (par exemple `settlementId/house/plot-17`), ou stables via table de provenance validée. Pas d'UUID neuf à chaque régénération : cela casserait les portes, références et sauvegardes.
- Une génération ne supprime que ses propres objets non verrouillés, jamais un objet manuel ou repris par un autre module.
- Conserver la longueur des listes/recettes bornée et valider toutes les références avant compilation.

### 3.2 BuildingArchetype et BuildingAccessPoint

```ts
interface BuildingArchetypeV1 {
  id: string; category: 'house'|'workshop'|'farm'|'mill'|
    'shop'|'warehouse'|'camp'|'defense'|'port'|'cave';
  allowedAssets: string[];
  forms: string[]; wallMaterials: string[]; roofMaterials: string[];
  facadeFinishes: string[]; allowedRoles: string[];
  minFootprintM2: number; maxFootprintM2: number;
  terrain: {maxSlope:number;shoreline?:boolean;cliff?:boolean};
  accessPoints: BuildingAccessPoint[];
  collisionProfileId?: string;
}
interface BuildingAccessPoint {
  id: string; kind: 'door'|'service'|'shop_counter'|'dock'|
    'stair'|'cave_portal'|'fire_safe_spot';
  position: {x:number;y:number;z:number}; yaw: number;
  clearWidthM: number; clearHeightM: number;
  agent: 'pedestrian'|'cart'|'boat';
  interactionId?: string;
}
```

- `materials`, `wealth`, `culture`, `maintenance` et `role` sont **indépendants**. Une façade blanche est une finition, la paille peut être une couverture, la pierre est un matériau local possible ; pas un rang de richesse codé en dur.
- Réutiliser `PrefabDefinitionV3` et `EntityDefinitionV3`. L'archétype est une **règle de génération**, pas un `THREE.Object3D`.
- Une empreinte de bâtiment est un **polygone orienté** (et une réservation de volume 3D), pas un rayon fixe. Les coins, avant-toits et marches se valident à leur vraie place.
- Les ancres peuvent être référencées dans les interactions sans multiplier les scripts ; adapter le modèle de liens stables existant.
- Le catalogue d'assets indique `AVAILABLE`, `VARIANT_OR_ASSEMBLY`, `TO_BUILD`. Un absent obligatoire produit un diagnostic, pas un placeholder non déclaré.

## 4. Collision et portes : contrat P0

### 4.1 Représentation retenue

**Solution cible** : un bâtiment logique + un **profil de collision compilable en plusieurs sous-volumes** (boîtes AABB locales simples, surfaces de plancher/toiture/rampes, éventuellement OBB à tester), avec une entité enfant/porte distincte pour les états d'ouverture. La façade garde un vide réel autour de l'entrée.

Deux options techniques à comparer avant figer le schéma :
- **A — Prototype rapide** : plusieurs enfants entités V3 avec leurs propres `Collider` (compatible aux validateurs actuels). Avantage : vérifie immédiatement qu'une porte est jouable. Limite : explosion possible des entités, index et fichiers si utilisée à grande échelle.
- **B — Cible retenue pour la production** : `CollisionProfileV1` par prefab contenant des primitives nommées ; compilation en `CollisionDefinition[]` avec ID `buildingId::partKey`, **ownerId et état de barrière explicites**, sans devoir sérialiser chaque mur comme une entité. Nécessite versionnage de schémas, compilation, runtime et tests. À adopter seulement après A + benchmark.

**Important** : aujourd'hui `gameplay/game-view.ts` déduit l'état `open` du propriétaire d'un collider. En production, une sous-partie statique du mur doit **rester active** si la porte est ouverte ; seule la partie `door_leaf` bascule. `naturalColliderOwner` gère le suffixe des structures naturelles : ne pas lui ajouter silencieusement des conventions de parties de bâtiments sans adaptation validée.

### 4.2 Queries physiques

Conserver `WorldCollisionQuery.move/sweep` à pas fixe et broadphase actuelle, puis introduire seulement les primitives nécessaires au gameplay :
- colliders statiques simples, identifiés et stables ;
- feuille de porte dynamique avec état et jeu libre contrôlé ;
- surfaces marchables (quai, toit jouable, escalier) à identifier séparément d'une simple boîte ;
- portails/liaisons de zones, clearance par agent ;
- couches explicites joueur/PNJ/bateau si nécessaire ;
- accès aux requêtes d'**occlusion** de l'interaction par segment vers point nommé.

Les collisions ne sont **ni** le LOD graphique **ni** la forme GLB détaillée. Pas de rigidbodies pour chaque poutre, pierre, tente ou cheminée. Une `sphere` actuellement testée sur sa bounding box ne prouve pas un contact sphérique exact.

### 4.3 Porte et état

```text
building B (owner, style, colliders static: murs + linteau)
  ├── anchor entry.front (pose, largeur, hauteur, clearance)
  └── door D (identity stable, transform, state.open/locked)
        ├── colliders door-only (activés si fermée)
        ├── interaction makeDoor/makeLever existante
        └── nav-link valid iff accessible by the agent
```

La porte fermée bloque, ouverte laisse passer, déverrouillée suit l'état. L'animation est dérivée ; la transition logique et les colliders restent atomiques. La collision ne doit jamais rendre **toute la maison** traversable en ouvrant la porte.

## 5. Réseau de circulation, chemins et surfaces

**Source logique** : `TransportGraphV1` (nœuds 3D, bords, niveaux/structures, classage d'agent, ancrages de portes/ports), issu de la recette et des tracés manuels.

```ts
interface TransportNodeV1 {
  id:string; position:{x:number;y:number;z:number};
  levelId?:string; kind:'junction'|'door'|'square'|'bridge'|
    'stair'|'dock'|'trail'|'gate';
}
interface TransportEdgeV1 {
  id:string; from:string;to:string; pathId?:string;
  mode:'foot'|'cart'|'boat'; maxSlope:number;
  clearanceM:number; status:'passable'|'blocked'|'conditional';
  conditionEntityId?:string;
}
```

- **Réutiliser la géométrie** de `PathDefinition` : 4 matériaux existants `trail/dirt/stone/wood`. Les futurs pavés, briques, gravier et transitions doivent être des variantes de surface **avec schéma/migration**, pas de nouvelles routes non connectées.
- Le réseau représente les liaisons **et** les hauteurs : deux traits qui se croisent en XZ ne se connectent pas sous un pont ou entre deux étages de grotte.
- L'accès privé se branche sur un chemin partagé ; le solveur maximise la desserte réutilisée, puis réserve la place/les fondations avant les maisons.
- Pour une ville de pierre prospère, le centre peut être en pierre/pavés, le port en pierre, la périphérie en terre ; **style matériel ≠ obligation d'uniformité**.
- `TransportGraphV1` peut rester un dérivé recompilable si ses sources stables sont chemins/points d'accès ; ne le persister que si des modifications manuelles de sa topologie ne sont pas reconstructibles depuis ces sources.
- Éviter le contrôle de voisinage O(n²) pour les gros réseaux ; utiliser grille spatiale et tests ciblés de liaisons/overlaps.

## 6. Implantation et solveur : contrat d'entrée/sortie

```ts
interface SettlementPlanV1 { // MÉMOIRE TEMPORAIRE, PAS FORMAT ZIP
  recipeId:string; sourceRevision:number; recipeHash:string;
  anchors:unknown[]; routes:unknown[]; districts:unknown[];
  parcels:unknown[]; proposedEntities:unknown[];
  diagnostics:{code:string;severity:'ERROR'|'WARNING'|'INFO';
    targetId?:string;message:string}[];
  estimatedCost:{assets:number;colliders:number;drawCalls?:number};
}
```

Pipeline :
1. analyser contraintes terrain/eau/ressources + obstacles manuels ;
2. réserver ancrages obligatoires : château, port, place, moulin et autres métiers ;
3. construire graphe partagé et routes régionales, ponts/escaliers ;
4. poser les parcelles orientées et les points d'entrée ;
5. attribuer rôles, styles, richesse, ressources et matériaux ;
6. valider volumes 3D, accessibilité, conflits et budget ;
7. afficher preview et diff ; appliquer **une seule action auteur Undo/Redo**.

Séparer **hard constraints** (block) de **soft scores** (classer). La proximité d'une forge à la mine doit être évaluée par coût de transport réel et compatibilité avec quartiers/ressources, pas seulement mètres droits.

Une même graine + même recette + même révision des sources doit produire mêmes plans/IDs **indépendamment des chunks chargés ou de l'ordre des appels**.

Le `CommandBus` a actuellement un historique borné (4 Mio par défaut, 150 transactions, checkpoint). Pour une ville dense, prévoir une commande logique unique avec patches regroupés/sectorisés et rollback sans dépasser le budget ; valider avant un commit massif.

## 7. Terriers et grottes : contrat de faisabilité distinct

| Mode | Représentation | Condition |
| --- | --- | --- |
| `burrow_decorative` | dôme, façade, porte, fenêtre, cheminée ; pas d'intérieur jouable | placement sur colline/prairie |
| `burrow_enterable` | dôme + intérieur et passage libre, façade vraiment percée | collision profilé + clearance confirmés |
| `cave_decorative` | ouverture visuelle/rocher sans promesse de traversée | site falaise et accès décoratif |
| `cave_enterable` | ouverture terrain **et collision**, cavité locale en 3D, espace/niveau/portail | **BLOQUÉ jusqu'au prototype** |
| `cave_multilevel` | entrées/escaliers/passerelles avec liens par étage | après `cave_enterable` |

La source de vérité du relief est un **heightfield**, pas un volume 3D excavable partout. Ne jamais masquer seulement les triangles visibles en conservant une collision bloquante. Si les ressources locales sont insuffisantes, signaler une incompatibilité dans Studio ; ne pas déplacer automatiquement les grottes.

## 8. Interactions et jeu futur

- Utiliser `Interactable`, `State`, `Persistence`, `TriggerVolume` et les templates `makeDoor/makeCollect/makeDeliver`.
- Dans les grandes colonies, remplacer la recherche linéaire de toutes les cibles par une requête spatiale ; tester occlusion/portée et privilégier la pose d'interaction définie.
- Un comptoir commercial, une forge ou un moulin peuvent exposer une action déclarative **sans simuler une économie globale continue**. Le futur multijoueur répliquera des événements/états métier, non les maillages.
- Réserver un point d'usage de chaque atelier/port et garder l'accès libre à la taille du hamster.
- Collisions, portée, états de porte et inventaire **indépendants** des LOD, imposteurs, FPS et de la distance au GPU.

## 9. Migration, sécurité et stockage

1. Modifier explicitement `src/studio-core/types.ts`, `schema.ts`, `references.ts`, `world-compiler/*` et `runtime/compiled-world.ts` **seulement en phase d'implémentation**.
2. Toute nouvelle bibliothèque V3 est **optionnelle pour la lecture des anciennes cartes** ; le nouveau générateur produit ses valeurs requises et le compilateur valide toutes les références.
3. Les anciens `Collider {shape, size, layer}` continuent à se compiler ; nouveaux collision profiles versionnés ajoutés sans les écraser.
4. Éviter le JSON exécutable, code arbitraire, fonctions dans les recettes. Valider taille, nombre, bornes, IDs et hash de source ; garder une limite explicite d'itérations pour les générateurs.
5. Les composants et fichiers édités manuellement doivent survivre aux re-seeds, migrations, remplacements d'assets et export/import portable.
6. Le plan de preview ne peut être appliqué si `sourceRevision` et `recipeHash` divergent au commit ; invalider et recalculer plutôt que réutiliser un résultat périmé.

## 10. Gates de validation avant toute étape suivante

| Gate | Test minimal exigé pour passer | Statut au 17/11/2026 |
| --- | --- | --- |
| **CT-0** | Types V3 + parser + migration, anciennes cartes intactes | Cible définie, **non exécuté** |
| **CT-1** | Maison composée, porte ouverte/fermée, murs toujours solides | **BLOQUANT** |
| **CT-2** | Personnage marche/roule/plane contre maison sans traverser ; rotations 0°/45° | **NON TESTÉ** |
| **CT-3** | Réseau routier connecté, chemin mutualisé et pont sans jonction fictive | **NON IMPLÉMENTÉ** |
| **CT-4** | Interaction de boutique depuis devant le comptoir, impossible derrière mur | **BLOQUANT** |
| **CT-5** | Terrasse, escalier et intérieur : surfaces marchables multi-niveaux cohérentes | **NON TESTÉ** |
| **CT-6** | Entrée de grotte : terrain et collider ouverts, ou fallback décoratif | **BLOQUANT** |
| **CT-7** | Même seed + même source = mêmes IDs, preview=commit et Undo/Redo correct | **NON IMPLÉMENTÉ** |
| **CT-8** | Import/export, suppression et édition locale : verrous/refs inchangés | **NON TESTÉ** |
| **CT-9** | Mesure CPU / mémoire / collision / rendu sur 20–600 maisons et vol rapide | **NON MESURÉ** |

**Décision de fin de SET-0 :** les contrats C01–C09, C13–C16 constituent une base de travail cohérente et réutilisent l'architecture du dépôt. **Il n'est pas autorisé de qualifier le générateur complet « prêt »** avant les prototypes de passage/porte (CT-1), le réseau navigable (CT-3), et la preuve d'entrée de grotte (CT-6). L'ordre de réalisation s'appuie sur [68](68-SETTLEMENTS-ROADMAP-TESTS.md).

**Prochain lot recommandé** : CT-0 + CT-1 sur **une** maison à porte fonctionnelle, en réutilisant la physique et le CommandBus. Pas de génération automatique de 80 maisons avant cette validation.


## Contrat d'intégration construction joueur / ISL (future)

Réutiliser TransportGraphV1, règles de placement, parcelles, profils d'accès et collisions SET. Les commandes de construction joueur doivent référencer **islandId, parcelId, prefabId, transform, revision**, utiliser les stocks/plans de l'économie de partie et écrire des **deltas runtime** ; ne jamais écrire automatiquement dans la source Studio. La transaction autoritaire et les permissions serveur sont **futures** ; une implémentation locale solo peut tester les mêmes prédicats sans connexion réseau.

Voir [74 — Manifeste](74-ISLAND-MANIFEST-REGISTRY.md), [77 — Construction](77-ISLAND-COMMUNITY-CONSTRUCTION.md), [79 — Validation](79-ISLAND-ROADMAP-VALIDATION.md).

