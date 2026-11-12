# 15 — Little World Studio : schémas V3 et contrats entre éditeurs

**Décision architecturale validée le 12 novembre 2026.** Ce document précise les choix déjà approuvés pour le Studio et le jeu final ; il **ne signifie pas que le format V3 ou les éditeurs spécialisés sont implémentés**.

**Références de périmètre :** [12 — Limites du jeu](12-PROJECT-SCOPE.md), [13 — UX Studio](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix techniques](14-TECHNICAL-CHOICES.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

## 0. Diagnostic du code actuel et obligation de compatibilité

**Faits relevés dans la branche `main` lors du cadrage :**

- `src/world-data.ts` expose `WorldDefinition` **schemaVersion 2** avec des tableaux globaux `placements / terrain / biomes / water / paths / npcs`, des transformations 2D et une validation monolithique. `parseWorld` borne actuellement largeur et longueur à **2 000 m**, avec limites de quantité par tableau.
- `src/npc.ts` contient `NPCDefinition` avec apparition, comportement et **dialogue éventuellement embarqué** ; navigation de proximité encore simplifiée.
- `EditHistory<T>` conserve jusqu'à **60 copies complètes** de l'état, non viable pour une grande carte.
- `src/editor-storage.ts` conserve un seul brouillon IndexedDB sous la clé **`main`**.
- `tools/compile-map.mjs` lit un JSON de **2 Mo maximum** et émet une carte avec un manifeste de secteurs ; ce n'est pas encore une compilation source/maillages/graphes réellement sectorisée.
- `src/editor.ts` concentre de nombreuses responsabilités de vue et d'édition. L'éditeur courant possède déjà des outils utiles (sculpture, eau, biomes, objets, PNJ/dialogues) : **les réutiliser et les migrer**, ne pas repartir de zéro.

**Règle de migration :** le V2 doit rester lisible pendant la transition V3. Ne pas modifier les données originales lors de l'import ; produire une copie convertie, valider puis confirmer son enregistrement. Les fonctionnalités V3 passent derrière un chemin d'exécution ou un module distinct tant que la migration n'est pas qualifiée.

## 1. Trois modèles séparés : auteur, runtime et partie

| Domaine | Source d'autorité | Où et comment | Éditable ? |
| --- | --- | --- | --- |
| **Projet auteur** | Studio | Manifeste + sources par secteur + registres + bibliothèques | Oui, avec Undo/Redo |
| **Monde compilé** | WorldCompiler, dérivé du projet auteur | Manifeste + chunks statiques, LOD, collisions, index | Non ; régénérable |
| **Sauvegarde joueur** | Runtime de la partie | Slots locaux versionnés, position, inventaire, flags/états | Pas via les outils auteur |

Ne **jamais** enregistrer l'état de partie dans les sources auteur ni recopier les géométries dans les slots de sauvegarde. Une modification de carte doit pouvoir identifier sa compatibilité avec les anciennes sauvegardes joueur (IDs supprimés, changements de schéma, version de monde).

### Arborescence de principe (proposée, ajustable après test)

```text
project/
  project.json                # métadonnées, schemaVersion: 3
  world/world.json            # une carte continue, dimensions, seed, config
  world/chunks/<cx>_<cz>.json # sources/overrides locaux et index d'entités
  world/terrain/<cx>_<cz>.*   # données heightfield compactes si nécessaire
  library/prefabs.json        # définitions de prefabs réutilisables
  library/characters.json     # rigs, espèces, variantes
  library/dialogues.json      # dialogues référencés par ID
  library/behaviors.json      # routines / réactions
  library/interactions.json   # séquences d'événements/conditions/actions
  library/activities.json     # collectes, pêche, petites missions, énigmes
  assets/catalog.json         # IDs, versions, provenance, références
  project.checks.json         # optionnel : diagnostic reproductible
```

Une archive exportée conserve l'organisation logique. Les extensions exactes des heightfields (binaires, compressées) et des index sont un **détail de codec**, à choisir par benchmark. Aucun navigateur ne doit avoir à ouvrir ou désérialiser tous les fichiers d'un monde de 100 km².

## 2. Contrats V3 : éléments et identité

Les noms de types ci-dessous décrivent une **forme cible**, pas l'API déjà présente.

### Projet et monde

```ts
type StableId = string;               // UUID pour objets auteur
type ChunkId = string;                // ID déterministe du secteur dans le monde
type AssetId = string;                // catalogue, pas simple indice de tableau

interface StudioProjectV3 {
  schemaVersion: 3;
  projectId: StableId;
  name: string;
  worldId: StableId;                  // un monde continu par projet jouable
  assetCatalogVersion: string;
  createdWith: string;                // version outil/migration
  sourceManifest: SourceManifest;
}

interface WorldDefinitionV3 {
  schemaVersion: 3;
  worldId: StableId;
  seed: number;
  generatorVersion: string;
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  seaLevel: number;
  chunkSizeM: number;
  coordinateSystem: "meters-y-up";
  chunkIndexRef: string;
}

interface ChunkSourceV3 {
  schemaVersion: 3;
  chunkId: ChunkId;
  index: { cx: number; cz: number };
  terrainSourceRef?: string;
  terrainEdits: TerrainEdit[];
  biomeEdits: BiomeEdit[];
  waterRefs: StableId[];
  pathRefs: StableId[];
  entityIds: StableId[];
  revision: number;
}
```

**Contraintes :** rectangle de monde continu avec **largeur et longueur ≤ 10 000 m**, coordonnées réelles en mètres, **Y vertical**, vecteurs sans `NaN`/`Infinity`, dimensions positives, bornes et versions vérifiées à l'import. Pour faciliter la migration V2, conserver les coordonnées X/Z centrées autour de l'origine comme convention initiale, mais **calculer les IDs de secteurs à partir de `bounds.minX/minZ`**, pas d'une constante de carte. Au bord supérieur du rectangle, définir explicitement la propriété du secteur (indexation demi-ouverte sauf dernier bord).

Le `chunkSizeM` est configurable : **64 m constitue une hypothèse de départ**, pas un choix imposé à toutes les scènes. Le heightfield peut avoir plusieurs résolutions ; la **résolution de rendu LOD n'est pas la résolution de la source d'édition**.

### IDs et références

- Objet créé par l'auteur : **UUID** persistant. Ne jamais réémettre un ID au rechargement ou au changement de secteur.
- Géométrie/instance générée déterministiquement : clé stable dérivée de **version générateur + chunkId + clé locale** ; ne pas persister un UUID aléatoire pour chaque brin d'herbe.
- Chaque élément persistant a **un propriétaire logique** (`ownerChunkId` pour l'entité spatiale, ou `global` pour définition partagée) et peut posséder une emprise sur plusieurs secteurs.
- Les références entre secteurs utilisent des **IDs**, jamais les noms d'affichage, `Object3D.uuid` Three.js ou les index de tableaux.
- Maintenir un **registre léger mondial `id → kind + owner + locator`**, disponible sans charger chaque chunk détaillé ; distinguer `missing`, `unloaded` et `loaded`.
- Déplacement d'un objet entre secteurs : **transaction atomique** sur son propriétaire, son index et ses références ; son ID reste identique.
- Suppression d'un ID référencé : avertir, proposer **réaffecter / annuler / supprimer avec confirmation** ; ne jamais casser silencieusement les dialogues et actions.

## 3. Entités, composants, prefabs et variantes

Une entité est un objet auteur identifié. Ses capacités viennent de **composants typés et validés**, pas d'une classe spéciale par nouveau décor.

```ts
interface EntityDefinitionV3 {
  id: StableId;
  kind: "prop" | "building" | "character" | "trigger" | "effect";
  prefabId?: StableId;
  ownerChunkId: ChunkId;
  parentId?: StableId;
  components: ComponentMap;           // discriminé / validé par schémas
  overrides?: PrefabOverrides;
}

interface TransformComponent {
  type: "Transform";
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number }; // quaternion
  scale: { x: number; y: number; z: number };
}

interface PrefabDefinitionV3 {
  id: StableId;
  version: number;
  name: string;
  components: ComponentMap;
  childPrefabs?: PrefabChild[];
}
```

**Catalogue limité initialement aux composants effectivement nécessaires :**

| Composant | Fonction | Exemple |
| --- | --- | --- |
| `Transform` | position/orientation/échelle/hiérarchie | maison, PNJ |
| `Visual` | asset/variante/LOD | arbre, bâtiment |
| `Collider` | forme simple et couche | mur, porte |
| `Animator` | animation(s), sockets | écureuil, mécanisme |
| `Interactable` | invite, portée, déclencheur | panneau, levier |
| `State` | état initial et transitions | vanne, porte |
| `Character` | espèce, rig compatible, apparence | PNJ animal |
| `Navigation` | capacités, limites et comportements de trajet | PNJ mobile |
| `DialogueActor` | IDs de dialogues possibles | meunier |
| `InventoryContainer` | contenu/objets ramassables | panier, coffre |
| `TriggerVolume` | forme, filtre, événements de zone | entrée de ruine |
| `Persistence` | états sauvegardables | mécanisme ouvert |
| `AudioEmitter` / `EffectEmitter` | ambiance, sons et effets contrôlés | cascade, magie |

**Prefabs :** définition immuable/versionnée + variantes + **overrides explicites par champ**. Résolution déterministe : base du prefab → variante → overrides de l'instance. Les overrides sont **typiquement des chemins de composants whitelistés**, pas du JSON arbitraire exécuté. Un changement global de prefab doit être **prévisualisable**, signaler les conflits et laisser les overrides locaux intacts.

**Réutilisation des rigs :** `Character` référence famille morphologique/rig, apparence et clips ; ne pas imposer le rig d'écureuil à tous les animaux. Les oiseaux/insectes/poissons décoratifs peuvent être des systèmes de faune simplifiés sans entité complète par individu.

## 4. Registres gameplay : dialogues, PNJ, actions et activités

La **définition d'un PNJ** référence sa `Character`, sa `Navigation`, son `BehaviorId` et ses `DialogueId` ; elle **n'embarque plus directement un graphe de dialogue** en V3. Les données de conversation deviennent réutilisables et vérifiables sans recharger le chunk de l'acteur.

### Comportements et navigation

- `BehaviorDefinition` : routine légère, horaires liés à l'horloge commune, états `idle/wander/patrol/work/greet/flee/talk` avec extensions validées.
- `NavAgent` : capacités par espèce (`walk/swim/fly` **si supportées**), pente/franchissement, zones, coût des surfaces, type de graphe. **Ne pas inférer automatiquement** que tout PNJ peut conduire un bateau.
- Données navigables **hiérarchiques par secteurs** : connexions/portails + couches locales ; invalider la navigation concernée par terrain, eau, ponts et portes.
- Éloignement : état/routine logique dormante, pas de pathfinding global ni de mise à jour visuelle constante.

### Dialogue et événements

```ts
type StateValue = boolean | number | string;
interface VariableDefinition {
  id: StableId;
  scope: "entity" | "zone" | "world" | "savegame";
  valueType: "boolean" | "number" | "string";
  initialValue: StateValue;
  persistent: boolean;
}
interface InteractionDefinitionV3 {
  id: StableId;
  trigger: TriggerDefinition;          // tagged union
  condition?: ConditionExpr;           // all/any/not + prédicats typés
  sequence: ActionStep[];              // tagged union : setState, playAnimation, ...
  repeat: "once" | "always" | "cooldown";
}
```

- **Déclencheurs** : `onInteract`, `onEnterZone`, `onExitZone`, `onDialogueChoice`, `onTimer`, `onStateChanged`, `onAnimationFinished`, `onObjectiveChanged`.
- **Conditions** : `all/any/not` (profondeur bornée), états, variables typées, distance, inventaire, objectif, cooldown.
- **Actions** : `setState`, `setVariable`, `playAnimation`, `playSound`, `showText`, `startDialogue`, `giveItem`, `takeItem`, `moveNPCTo`, `emitEvent`, `wait`, `setObjective`.
- **Séquences** : ordre déterministe, délais explicites, politique claire si acteur/objet cible devient absent ou déchargé. Éviter les cycles d'`emitEvent` sans attente ; budget d'événements exécutés et nombre de déclenchements bornés.
- **DialogueDefinition** : graphes de répliques et choix avec identifiants stables, conditions/effets typés et référence `actorId` ; jamais index de ligne comme cible persistante.
- **ActivityDefinition** : templates composant les mêmes variables, événements et actions : `collect`, `fish`, `puzzle`, `deliver`. **Pas de mini-moteur spécifique pour chaque nouvelle activité**.

Les variables d'état/réactions **fonctionnent sur des entités non chargées** : le registre logique d'état est distinct des meshes et des systèmes d'animation. La présentation visuelle se synchronise quand le chunk devient actif. Ne pas charger une maison à 5 km pour y changer un flag de porte.

## 5. Studio Core : contrat commun des modules

**Tous les éditeurs** consomment un même `StudioContext` ; seuls les outils et inspecteurs sont spécialisés.

```ts
interface StudioContext {
  projectId: StableId;
  worldId: StableId;
  selected: { kind: string; id: StableId } | null;
  camera: { x: number; y: number; z: number; mode: "map2d" | "orbit" | "free" };
  activeModule: string;
  activeTool: string;
  // services référencés, non sérialisés : SelectionService,
  // ProjectStore, CommandBus, ReferenceIndex, ValidationService,
  // WorldPreview, ExportCompiler...
}
```

La sélection, le secteur actif, le viewport et l'historique survivent à un changement d'éditeur. Depuis un PNJ, « Modifier le dialogue » ouvre le bon dialogue ; « Voir sur carte » retourne à la position d'origine. Un écran de dialogue n'a pas besoin d'instancier Three.js s'il ne montre pas de prévisualisation.

### Interfaces et responsabilités

| Module | Manipule principalement | Réaction aux changements |
| --- | --- | --- |
| **Carte globale** | `WorldDefinition`, `ChunkIndex`, `EntityIndex` | aperçu 2D/index mis à jour |
| **Terrain** | sources heightfield et `TerrainEdit` | collisions, nav locale, végétation à invalider |
| **Eau / chemins** | splines, régions, volumes | terrain, collisions, navigation, biotopes |
| **Biotopes** | zones et règles/overrides | régénération du secteur concerné |
| **Bâtiments / objets** | entities, prefabs, transforms | index spatial, collisions, points d'interaction |
| **PNJ** | characters, behaviors, NavAgent | navigation, animations, sélection |
| **Dialogues** | graphe/dialogue IDs | liens PNJ, variables, interactions |
| **Actions** | triggers, conditions, sequences | dépendances vers IDs, prévisualisation |
| **Assets** | catalogue, variantes, clips, licences | références et caches des utilisateurs d'asset |
| **Tests** | snapshot du brouillon, diagnostics | runtime jetable sans mutation auteur |

**Contrat UX minimal pour chacun** : sélectionner → créer/modifier → aperçu immédiat → annuler/refaire → sauvegarder → « Jouer ici » → retour au même contexte. L'inspecteur montre des **propriétés métier**, pas des structures JSON brutes.

## 6. Édition réversible : commandes et checkpoints

Remplacer le principe de **copies complètes `EditHistory<WorldDefinition>`** par un **bus de commandes transactionnelles**, en conservant la compatibilité avec le V2 durant la migration.

```ts
interface EditCommand {
  id: StableId;
  label: string;
  projectId: StableId;
  targets: StableId[];                 // ou chunkIds
  apply(context: EditorState): void;
  revert(context: EditorState): void;
  affectedChunks: ChunkId[];
}
interface EditTransaction {
  id: StableId;
  commands: EditCommand[];
  committedAt: number;
}
```

- Un **drag**, un coup de pinceau, une session de modification spline ou une réplique éditée = **une transaction**, contenant les changements minimaux (avant/après ou patches inverses).
- Annuler/refaire **à travers les modules**, conserver l'ordre causal et les dépendances ; l'index spatial et les aperçus sont réactualisés après application/réversion.
- **Checkpoints périodiques** du projet, historique **borné en mémoire**, règles de crash recovery et d'autosauvegarde explicites. Ne pas sérialiser comme source des closures de méthodes `apply/revert` : le **journal persistant** doit utiliser un format **déclaratif et versionné** (type de commande + payload + inverse).
- Une commande touche plusieurs secteurs ? **Commit atomique** et restauration cohérente ; la transaction ne doit jamais laisser une moitié de déplacement.
- Checkpoints et logs sont séparés des **slots de sauvegarde de joueur**.
- Si un schéma changé rend un ancien journal invalide : restaurer un checkpoint compatible et afficher une erreur claire ; **ne jamais perdre silencieusement le projet**.

## 7. Validation et index de dépendances

**Validation en trois étapes :**

1. **À la saisie** : champs numériques/ranges/types, référence ciblée, feedback immédiat local.
2. **Au commit d'une transaction** : schémas des entités touchées, index et dépendances locales, duplicate ID, incohérence de prefab, chemin impossible.
3. **Au préflight/compilation** : contrôle global du projet et des liens, versions, licences/asset paths, cycles d'événements, limites du monde, compatibilité des migrations, tailles/sorties.

Catégories d'erreur : `ERROR` (bloque l'export/compilation), `WARNING` (signalé, publication possible), `INFO` (réglage facultatif). **La navigation/UX** doit permettre de cliquer une erreur → sélectionner la cible → ouvrir le bon éditeur à l'emplacement associé.

Un index de dépendances `sourceId → dependentIds` permet, par exemple :
- de changer une variante de porte sans modifier tous les dialogues ;
- de signaler qu'un PNJ utilise un dialogue supprimé ;
- de reconstruire seulement la navmesh/les collisions/instances des secteurs concernés ;
- de maintenir l'état d'une porte lointaine sans charger son modèle.

**La validation ne doit pas transformer chaque mouvement de souris en recalcul global**.

## 8. Migration V1/V2 → V3 : règles de reprise

1. **D'abord tests golden de fichiers V1/V2 réels** ; garder un fichier source inchangé pour comparaison.
2. Import `schemaVersion 1` ou `2` → **adaptateur pur** `migrateWorldToV3(input)` ; aucune modification de la source fournie.
3. Préserver `seed`, dimensions, `placements.id`, positions `x/z`, rotation autour de Y, échelles, strokes terrain/biomes, polylignes eau/chemins, PNJ et IDs de dialogues/répliques.
4. Convertir `Placement` en `EntityDefinitionV3` avec `Transform`, `Visual` et éventuel prefab ; convertir les PNJ en `Character`, `Navigation`, `BehaviorRef`, `DialogueActor`. **Conserver les liens dialogue** en extrayant leur graphe dans la bibliothèque V3.
5. Affecter propriétaires de secteurs et recalculer les index sans changer l'emplacement. Les strokes V2 deviennent des overrides V3 **dans le même ordre d'application** ; pour ceux qui traversent des frontières de chunk, garder une source/ID unique et référencer les secteurs impactés (éviter de les appliquer deux fois).
6. Mettre les données transformées dans un **nouveau brouillon/projet** ; présenter un rapport de migration (comptages, IDs, avertissements), puis valider/importer.
7. Export V3 puis réimport V3 : mêmes objets/effets/états initiaux ; test de **déterminisme** au rendu/terrain et tests de navigation.
8. Ne pas augmenter simplement les limites de `parseWorld` V2 pour lui faire traiter 10 km : le V3 possède son propre parseur par manifeste et par secteur. Le V2 reste un format de compatibilité/transition.

## 9. Sauvegarde, packaging et publication

- IndexedDB versionné avec **plusieurs projets** (pas une seule clé `main`), stockage indépendant du jeu et statut d'autosauvegarde visible.
- Source auteur : index/secteurs et bibliothèques ; **export portable** dans une archive projet (structure section 1), références d'assets valides, tailles et quota contrôlés.
- **CompiledWorldManifest** : hash/version de source, liste des chunks, bundles, index global d'entités/logique, LOD et nav ; paquets statiques `base-aware` pour GitHub Pages.
- Build incrémental : recompilation du secteur modifié **et des dépendances identifiées**, pas du monde entier. Les ressources GPU/générées sont jetables et reconstruisibles.
- Runtime : **GameSaveV1** séparé avec `worldId`, `worldBuildVersion`, `slotId`, emplacement, inventaire/flags/objectives/états persistants ; migrer/avertir si des IDs ont disparu.
- Pas de token GitHub public ni de scripts importés ; publier par validation → compilation → commit Git → GitHub Actions.
- Distinguer **données structurées du projet** et **données compilées du jeu**. Une archive source n'est pas un build publiable.

## Compatibilité future avec la réplication — **ne pas la coder aujourd'hui**

Le [cadrage du futur multijoueur](16-FUTURE-MULTIPLAYER.md) doit être pris en compte dans les contrats V3 **sans introduire de serveur ni de système de réseau dans le solo**.

- `EntityDefinitionV3.id` stable et index mondial `entityId → type/owner/location` : base future de l'Interest Management et des abonnements.
- `ChunkId` **définit le stockage**, pas une future autorité serveur ni la portée de visibilité ; une entité/événement peut agir hors du chunk courant.
- `State`, `Persistence`, `InteractionDefinitionV3` : distinguer **définition auteur**, **état logique de runtime** et **données persistantes de partie**. Éviter tout état important uniquement porté par un `THREE.Object3D`.
- `Transform` en mètres avec origine/coordonnées cohérentes, compatible avec une future **quantification relative au chunk**, sans imposer un encodage réseau maintenant.
- `BehaviorDefinition`/scheduler et animations reposent sur des horloges indépendantes du rendu ; les PNJ dormants conservent leurs états importants.
- Des métadonnées de réplication **facultatives** pourront être ajoutées à une version future **après benchmark**, mais **aucun champ `network` obligatoire, classe `NetworkEntity` ni dépendance socket/Colyseus** dans le V3 actuel.

Le futur multijoueur utiliserait un serveur autoritaire, des abonnements AOI contextualisés, réplication adaptative du mouvement de 2 à 20 Hz, événements critiques prioritaires, LOD de foule et, si nécessaire, zones d'autorité distinctes des chunks. Ces fonctionnalités sont **hors périmètre de l'implémentation V3 solo**.

## Contrat V3 — dérivés graphiques et arrière-plan lointain

Les choix du [document 17](17-DISTANT-VIEW-RENDERING.md) sont **indépendants du gameplay** :

- `WorldDefinitionV3` et `ChunkSourceV3` continuent à décrire une géographie **réelle et éditable**, jamais un panorama comme source d'autorité.
- `CompiledWorldManifest` peut référencer des **proxies de relief, silhouettes de forêt, proxies de bâtiments et imposteurs** avec version, empreinte du contenu source et région de validité.
- Le **compilateur V3** reconstruit/invalide les produits graphiques après sculpture, modifications de biotope/prefab et déplacements de grands repères, **uniquement sur les zones dépendantes**.
- Le **runtime** décide de ses tiers de détail selon caméra/altitude/erreur écran, pas selon les états de gameplay.
- Le Studio permet de **prévisualiser horizon/LOD depuis un point de vue**, mais l'auteur n'a pas à paramétrer manuellement la distance de rendu de chaque arbre.
- Les montagnes, côtes et îles **approchables** utilisent de préférence un proxy 3D ; skybox/texture panoramique réservées au très loin/ciel, avec précalcul quand il est rentable.
- Les `RenderProxyDescriptor` et `HorizonData` de la spécification 17 sont **illustratifs et facultatifs** tant qu'aucun bench ne justifie le stockage binaire/texture exact.

**Ne pas stocker les proxies dans les sauvegardes de joueur ni introduire de brouillard pour masquer les limites de la carte.**

## Schéma V3 — herbes comme données de biotope, pas comme entités individuelles

La [spécification 18](18-GRASS-LOW-RESOURCE.md) fixe une **végétation d'herbes déterministe**, indépendante des états de PNJ, des collisions et des données d'édition détaillées.

- Stocker dans les sources/overrides de biotope **une densité, une hauteur/classe, une variante de palette, une seed/règle et des exclusions**, avec validation/migration. Ne **jamais** sérialiser des centaines de milliers de `EntityDefinitionV3` pour des touffes générées.
- `GrassGenerator` reconstruit des cellules près du joueur à partir de `worldId + generatorVersion + chunkId + biome`, avec positions monde stables, heightfield et zones interdites.
- `GrassRenderer` et son champ d'interaction visuel sont **des ressources dérivées et jetables** : aucun état de pliage persisté ni collision par plante.
- Les changements de `TerrainEdit` / `BiomeEdit` invalident **uniquement les cellules recoupées**, compatibles Undo/Redo et WorldCompiler.
- Des profils de rendu globaux (`groundOnly` / économique / équilibré / dense) limitent le coût et se partagent un budget avec le reste des LOD ; ce ne sont **pas** des valeurs à enregistrer dans chaque touffe.
- En futur multijoueur, chaque client déforme les herbes avec les **positions déjà reçues** ; aucune propriété réseau obligatoire ajoutée dans les données V3.

Les prototypes TypeScript précis de ces modules restent à fixer à l'implémentation, après mesures sur le rendu réel.

## Contrat V3 — environnement auteur, état météo, météo visualisée

**Spécification :** [19 — Environnement et astres](19-ENVIRONMENT-WEATHER-SKY.md). Les états météo et les ressources graphiques ne doivent **pas** être mélangés aux données de terrain auteur.

- `EnvironmentDefinitionV3` versionné dans la **source du Studio** : rythme solaire, étoiles/seed, définitions de **0/1/plusieurs lunes** (IDs, périodes indépendantes, phases initiales, inclinaisons et apparences), climats macro et palettes.
- `EnvironmentSnapshot` état **dynamique** : `worldTimeSeconds` absolu, heure/scale, zones météo, neige accumulée/fonte, température, vent, précipitation, humidité, fog météo, orage, version, seed/transitions. Local en bêta ; serveur futur via même interface.
- `EnvironmentVisualState` (uniformes, particules, matrices d'ombres, prototypes de nuages) est une **ressource dérivée, non persistante et non source d'autorité**.
- Sources de météo macro-régionales et effets locaux **distincts des chunks de 64 m** : éviter des millions de sources météo dans la carte de 100 km².
- Neige sur terrain, arbres, toits, rochers et **proxies d'horizon** via masques de matériau/attributs dérivés ; pas de mutation `TerrainEdit` quand il neige. Collisions inchangées, sauf mécanique explicite ultérieure.
- `ShadowBudgetManager` ne modifie pas l'auteur : sélection runtime de casters volumineux/proches, shadow map solaire unique en option, sans ombres d'herbe, de ciel ni de lunes.
- Le **panneau bêta** remplace temporairement la source `EnvironmentSnapshot` et peut exporter un scénario reproductible ; aucune sauvegarde implicite dans la source V3 ou le slot joueur.
- Validation/migration : IDs de lunes uniques, périodes positives, valeurs finies, `schemaVersion` géré et anciennes cartes sans environnement compatibles via valeurs par défaut. Le serveur futur n'est **pas** une dépendance du runtime actuel.

Les types détaillés du document 19 sont **illustratifs jusqu'à implémentation et tests**. Garder les mêmes contrats pour « Jouer ici » et le runtime publié.

## Contrat V3 — interop Blender, presets et archives auteur

**Référence** : [20 — Blender ↔ Studio](20-BLENDER-STUDIO-INTERCHANGE.md). Distinguer sans ambiguïté **source d'asset Blender** (`.blend`), **ressource géométrique** (`.glb`), **source Studio V3** (terrain, biotopes, placements, logiques) et **runtime compilé**.

**Types indicatifs de contrats, à figer/tester progressivement :**

```ts
interface StudioAssetReference {
  assetId: string;                  // stable, jamais un nom de node GLB
  version: string;
  glbPath: string;                  // chemin résolu et validé dans Library / build
  sourceHash: string;
  sourceBlendPath?: string;         // auteur facultatif, exclu du runtime
  licenseId: string;
  originDescription?: string;
  pivot?: [number, number, number];
  category: string;
}

interface SceneInstanceExchange {
  sourceNodeKey: string;            // stable pour réimport avec sidecar versionné
  entityId?: string;                // seulement après validation de provenance et collision
  prefabId: string;
  transform: {
    positionM: [number, number, number]; // Y up Studio
    rotationQuat: [number, number, number, number];
    scale: [number, number, number];
  };
  parentSourceNodeKey?: string;
}

interface PresetPackManifest {
  schemaVersion: number;
  presetId: string;
  prefabVersion: string;
  kind: "asset" | "composite" | "biome" | "place";
  assetDependencies: Array<{assetId: string; version: string; hash: string}>;
  logicalDependencies?: string[];
}

interface PortableWorldArchiveManifest {
  schemaVersion: number;
  worldId: string;
  includesDependencies: true;       // uniquement si physiquement présentes
  sourceSchemaVersion: number;
  entries: Array<{path: string; hash: string; sizeBytes: number}>;
}
```

- `TransformComponent` V3 **déjà prévu** porte XYZ, quaternion et scale XYZ. L'UI emploie rotation Y/scale uniforme par défaut et contrôle 3 axes en avancé. **Blender Z-up → glTF/Studio Y-up une seule fois**, mètres, pivot explicite.
- Les **child prefabs et groupes** conservent leurs références/IDs via transactions et migrations ; remplacer une ressource GLB ne supprime ni les interactions, ni les biotopes, ni les dialogues.
- **Heightfield source**, masque de biotope, zones de végétation et règles de génération sont **des sources V3 versionnées**, jamais implicitement les sommets d'un GLB de décor ou des géométries GPU. Les `TerrainEdit/BiomeEdit` restent éditables et invalidés localement.
- **Archive portable de carte** = ZIP standard avec **toutes** les dépendances réellement présentes : manifest, secteurs et sources, heightfields/masques, GLB, prefabs, dialogues, interactions, PNJ, environnements. Variante **références seulement** clairement distincte et non autonome.
- **Export vers Blender** = GLB de scène **plus sidecar** pour IDs/mapping ; les métadonnées de gameplay non glTF **restent dans le projet V3**. Réimport = comparaison ajout/modification/conflit et choix d'application transactionnelle ; supprimer explicitement uniquement après validation.
- Les extras glTF, ZIP et manifest importés sont **non fiables** : allowlist, tailles, types, hashes, chemins relatifs, licences, extension glTF supportée, IDs uniques et compteurs de charge GPU. Un échec ne doit pas altérer le brouillon courant.
- Lors d'un **round-trip archive V3**, vérifier la conservation sémantique des données (IDs, références, positions, biomes, événements, dialogue, horaires et sources), sans exiger ZIP identique au bit près.

**Contraintes de compatibilité** : le validateur actuel V2 utilise `Placement` avec `x/z/rotation/scale` simplifiés ; faire migrer via adaptateur non destructif, pas transformer silencieusement le V2 en API finale V3.

## Contrat V3 — réseau hydrographique, volumes d'immersion et LOD dérivés

**Contrat cible :** [21 — Eau LOW-RESOURCE et hydrographie](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

- `WaterNetworkDefinitionV3` est une **source auteur** : `WaterNode` (source/jonction/sortie/embouchure), `WaterReach` spline orientée, `WaterBasin` polygone de lac/mer à niveau stable, `WaterDrop` cascade avec **altitude supérieure et inférieure explicites**. Les cas V2 `WaterBody` sont migrés sans inventer silencieusement de cascades.
- **HydroProfileCompiler** dérive altitude de rivière non ascendante et propose rapides/chutes selon le **relief original** (avant incision du lit). Les exceptions et niveaux manuels sont des **overrides explicites**, validés et annulables.
- Sources persistantes : topologie, IDs, points, largeurs/profondeurs/courants, zones navigables, valeurs auteur et `generatorVersion`. **Dérivés non persistants** : lit/berges compilés, maillages rubans, écume, volumes indexés, colliders, masques, WaterLOD0–3/proxies.
- **WaterVolumes** définit les requêtes `surface/depth/isCameraSubmerged/current` pour nage/bateau et futures autorités logiques ; **jamais** basé sur le mesh de vague ni sur le LOD du rendu. Une cascade verticale n'est pas un volume d'immersion horizontal.
- `WaterLODManager` consomme les données dérivées et réduit animation, opérations shader et géométrie selon taille projetée/distance/budget, sans changer le **volume logique et courant**.
- Rivières/lacs/chutes/mer compilés par secteur, index et dépendances entre secteurs vérifiés, invalidation locale après édition, **IDs stables**, Undo/Redo et import/export dans les archives **V3 ZIP**.
- Blender GLB peut servir de **décor de cascade/falaise/pont**, mais ne crée pas un graphe d'eau ou un exutoire par son apparence. Les métadonnées glTF importées restent non fiables.
- Sources répliquées côté serveur futur seulement pour états de gameplay nécessaires ; **vagues et écume locales** sans trafic réseau particulier.

**Types de référence (illustratifs, pas encore livrés)** : `WaterNodeV3`, `WaterReachV3`, `WaterBasinV3`, `WaterDropV3` et `WaterNetworkDefinitionV3` sont esquissés dans le document 21. Les unités = mètres, Y vertical, profils et coordonnées validés.

## Contrat V3 / Runtime PERF — budgets locaux non persistants

La [spécification 22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) **sépare les choix d'auteur des choix de rendu**.

- `WorldDefinitionV3`, `EntityDefinitionV3`, `WaterNetworkDefinitionV3`, biotopes, prefab, états PNJ et données source par secteur restent **indépendants de l'appareil**. Ne pas stocker `qualityLevel`, résolution GPU, draw calls ou caches dans le ZIP auteur.
- `QualityBudgetSnapshot` **readonly/versionné** est un **état runtime éphémère**, produit par un `ResourceBudgetManager` commun à la partie et au playtest Studio. Ce n'est ni un état de gameplay autoritaire ni un composant d'entité.
- Les **métadonnées auteur admises** incluent catégorie de LOD, marqueurs d'importance (pont, site, point d'intérêt, objet interactif), taille visuelle et **sources LOD/proxies**. La sélection de profil et distance de détail reste **locale**.
- Les caches `TerrainLOD`/`WaterLOD`, instances de végétation, ressources de GPU, imposteurs, textures compilées, registre mémoire et tâches de génération sont des **dérivés**, avec identifiants/versions de sources et invalidation locale.
- L'index spatial auteur et les relations entre secteurs doivent permettre la **priorité visible/proche/directionnelle** sans parcourir toute la carte ; l'ownership des ressources partagées est **runtime**, non une entité sauvée.
- Valeurs configurables **profil utilisateur** éventuellement sauvegardées dans préférences locales, jamais transportées dans une archive de carte rééditable.
- Les schémas et adaptateurs V1/V2 → V3 sont testés à tous les profils graphiques ; aucune baisse de qualité ne doit altérer la topologie de l'eau, collisions, PNJ, dialogues ou placements.

**Interfaces TypeScript détaillées** `FrameSample/PerfWindow/QualityBudgetSnapshot/QualityConsumer` : document 22, indicatives jusqu'à implémentation. Le gestionnaire **ne doit pas** doubler le composant existant `PresentationBudget`.

## 10. Architecture de code proposée (pas de refonte cosmétique préalable)

```text
src/
  world-data.ts                   # contrat V1/V2 maintenu provisoirement
  studio-core/
    project-schema.ts             # V3 projet/monde/secteurs, parseurs
    entity-schema.ts              # entités, composants et prefabs
    references.ts                 # registry + dependency index
    commands.ts                   # transactions inversables
    project-store.ts              # IndexedDB, checkpoints, migrations
    validation.ts                 # diagnostics par niveau
  gameplay/
    dialogue-schema.ts
    interactions-schema.ts
    behaviors-schema.ts
    activities-schema.ts
    save-schema.ts
  studio/
    shell.ts                      # routes, context/selection, vue globale
    terrain-editor.ts
    water-path-editor.ts
    biome-editor.ts
    objects-editor.ts
    npc-editor.ts
    dialogue-editor.ts
    actions-editor.ts
    assets-editor.ts
    playtest.ts
  world-compiler/
    manifests.ts
    chunks.ts
    navigation.ts
    validate.ts
```

**Ces chemins sont indicatifs, pas une obligation de déplacer immédiatement les fichiers existants.** Commencer par extraire des fonctions du `src/editor.ts` seulement lorsqu'une responsabilité en bénéficie. Ne pas créer une structure monorepo lourde pour remplacer les fichiers sans raison.

## 11. Ordre de mise en œuvre et tests d'acceptation

| Phase | Livraison verticale | Gate vérifiable |
| --- | --- | --- |
| **V3-A** | schémas V3, parseurs, adaptateur V2→V3, fixtures | migration stable ; test non-mutation et préservation des IDs |
| **V3-B** | StudioContext, ProjectStore multi-projets, sélection + Undo/Redo transactionnel | édition → annulation → autosave → reload sans perte |
| **V3-C** | index mondial + manifeste/secteurs source, vue carte globale 2D | ouvrir secteur distant sans charger le monde entier |
| **V3-D** | entités/prefabs, objets et terrain/water/biomes sur contrats V3 | déplacer prefab, déplacer PNJ, sculpter sans casser liens |
| **V3-E** | variables, actions, dialogues/PNJ refactorisés, scheduler léger | porte/vanne/PNJ fonctionnent depuis données V3, même hors chunk |
| **V3-F** | activités, sauvegardes joueur, tests « Jouer ici » | collecte/pêche/énigme/mission ; slots persistants |
| **V3-G** | compilation incrémentale, performance et publication | build Pages statique, tests navigateur et mesures 30/20 FPS |

**Scénario transversal obligatoire :** créer une forêt et une maison → placer un meunier → définir sa navigation → lier un dialogue à un levier et une vanne → tester → revenir à l'édition → annuler la vanne → sauvegarder/exporter/réimporter → compiler → vérifier qu'aucun ID/référence n'est perdu.

### Invariants à préserver

1. La carte 200 × 600 m du prototype V2 reste jouable et importable.
2. **Une carte continue** par monde, limite au plus **10 × 10 km**, sans simulation intégrale obligatoire.
3. Aucun ralentissement des mouvements lorsque le rendu passe de 30 à 20 FPS.
4. Aucun `WorldDefinition` complet copié à chaque coup de pinceau dans la version V3.
5. Aucune action/condition associée directement à un mesh Three.js en guise de source de vérité.
6. Aucun système autorisé à stocker la progression joueur dans la carte auteur.
7. Aucune affirmation de performance V3 **sans mesure sur matériel**.

**Statut final : spécification validée et utilisable comme contrat de développement. Les interfaces/types illustratifs doivent être consolidés et testés au moment de leur implémentation.**
