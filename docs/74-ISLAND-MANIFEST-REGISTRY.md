# 74 — Registre des îles, manifestes, formats et publication

**Statut : SPECIFIED — proposition de contrats ; aucune API ni migration livrée.** Voir [73](73-ARCHIPEL-VISION-DECISIONS.md), [15](15-STUDIO-DATA-SCHEMAS-V3.md), [03](03-WORLD-GENERATION.md), [62](62-GUIDED-WORLD-COMPOSITION.md).

## 1. Délimiter les données

1. **StudioProject** : sources géographiques et créatives, recette/version/seed/overrides, historique auteur.
2. **CompiledIsland** : manifeste et chunks statiques publiables, géométrie, navigation, index, assets et données d'arrivée ; régénérable et immuable pour une version.
3. **IslandRuntimeState** : constructions, parcelles, stocks, économie et gouvernance persistants, sous forme de deltas référencés au manifeste ; local en solo, autoritaire serveur plus tard.
4. **PlayerProgress** : inventaire, compétences, découvertes, progression et positions de retour par islandId ; ne pas écrire dans StudioProject.
5. **ArchipelagoRegistry** : liste versionnée des îles publiées, routes, descriptions et conditions d'accès ; référentiel de navigation, PAS carte mondiale fusionnée.

Dans GitHub Pages, ArchipelagoRegistry et CompiledIsland sont des **assets versionnés statiques**. Les états solo sont stockés localement (IndexedDB/slots, migrations), sans synchronisation entre navigateurs.

## 2. Contrats proposés (noms provisoires)

~~~ts
type IslandId = string;
type CompiledIslandRef = { islandId: IslandId; contentVersion: string; manifestUri: string };
type IslandPublishStatus = "draft" | "generated" | "validated" | "published";

interface IslandManifestV1 {
  schemaVersion: 1;
  islandId: IslandId;             // stable indépendamment de son nom
  contentVersion: string;         // change lors de la publication d'un nouveau snapshot
  sourceProjectId: string;
  generatorVersion: string;
  seed: number | string;
  name: string;
  themeTags: string[];
  mapBoundsM: { width: number; length: number };
  chunksManifestUri: string;
  arrivalAnchors: Array<{ dockId: string; position: [number,number,number] }>;
  buildPolicyId?: string;
  economyProfileId?: string;
  portProfileId?: string;
  assetCatalogVersion: string;
}
interface ArchipelagoRegistryV1 {
  schemaVersion: 1;
  registryVersion: string;
  islands: CompiledIslandRef[];
  routes: Array<{routeId: string; fromIslandId: IslandId; toIslandId: IslandId; scheduleId: string}>;
}
interface IslandSaveV1 {
  schemaVersion: 1;
  islandId: IslandId;
  basedOnContentVersion: string;
  lastSimulatedGameTime: number;
  placedEntityDeltas: unknown[];
  simulationSnapshot: unknown;
}
~~~

**Important :** exemples de forme, à aligner sur les types V3 réels avant codage ; ne pas ajouter une seconde représentation d'entités, de collisions ou de routes. Les URI sont relatifs au build et résolus via BASE_URL ; jamais d'URL absolue GitHub codée en dur.

## 3. Publication et validation

Chaîne statique : **Studio → génération/aperçu → validation des schémas/références/geometry/nav/performances → compilation → ajout explicite au registre → CI → GitHub Pages**. Aucun auto-upload par le joueur en solo.

États : DRAFT (auteur) → GENERATED → VALIDATED → PUBLISHED. Refuser une destination si l'île n'est pas présente dans le registre compilé, si son manifeste est incompatible ou si l'ancre d'arrivée manque. Une version publiée peut être désactivée sans réutiliser son ID pour une autre île.

Contrôles de validation : dimensions par île, intégrité des chunks, points d'arrivée en zone sûre, collision et nav près du débarquement, présence d'un point de retour, dépendances assets, limites de mémoire/draw calls et migrations des données.

## 4. Exemple statique minimal

- **Réutiliser l'île officielle 4 × 3 km existante**, sans modifier son manifeste tant que les adaptations ne sont pas validées.
- Ajouter ensuite une/deux petites îles de référence pré-générées, différentes en thème ou desserte ; chaque exemple est compilé dans le dépôt et accessible sur Pages.
- En première livraison, registre et fichiers JSON suffisent ; aucun stockage distant, aucun service de matchmaking.
- Un archipel géographique généré dans une carte V3 est distinct du registre d'îles jouables. Un seul islandId correspond à une unité de chargement/runtime, même si le relief comporte plusieurs terres.

## 5. Sauvegardes et migrations

Toujours inclure islandId et contentVersion ; les sauvegardes antérieures sans islandId sont mappées explicitement vers **l'île exemple par défaut** lors d'une migration non destructive. Conserver les anciens slots et détecter version incompatibles, IDs supprimés ou assets absents. Jamais de remplacement silencieux des constructions.

Le registre peut évoluer pendant qu'un joueur possède un ancien état local : migrer si possible ou afficher un diagnostic et offrir export de sauvegarde. Les liens d'entités inter-îles sont des références typées, pas des pointeurs directs entre scènes Three.js.

## Deuxième île publiée — forêt/village

Le build statique inclut désormais la référence V3 `little-world-production-reference` dans `dist/archipelago/worlds/forest-valley/`. Le catalogue pointe vers son manifeste compilé, et le contrôle `verify-static-build` exige ses secteurs et sa logique. Le projet source reste dans les fixtures de référence du Studio et ne devient **pas** un fichier auteur éditable depuis la partie publique. La carte 4 × 3 km demeure inchangée. Le changement de carte réinitialise la scène Three.js via un nouveau document navigateur : **une seule île graphique par client à un instant donné**.
