# 24 — MINE : mines creusables 2,5D, plusieurs niveaux, ressources et persistance

**Décision retenue le 13 novembre 2026.** Pour Little World, les mines sont des **zones souterraines localisées**, avec **galeries librement creusables dans une grille 2,5D par niveau**, **plusieurs niveaux connectés** par escaliers, rampes ou puits, et **métaux/cristaux exploitables**. Le terrain principal reste un **heightfield** ; la mine n'est **pas** un moteur voxel 3D couvrant les 100 km².

**Important :** ce choix **introduit une exception contrôlée** à la règle antérieure « le joueur ne modifie pas durablement la carte ». Le joueur peut **excaver et épuiser les ressources uniquement dans les volumes de mine autorisés**, et l'état est conservé dans les **sauvegardes de partie / futur serveur**, **jamais dans les sources du Studio** par défaut. Toute extension du creusement au terrain de surface relève d'une nouvelle décision et d'un benchmark.

**Statut : spécification de développement, pas fonctionnalité déjà codée.** Le projet actuel (`main`) utilise `terrainHeight(x,z)`, des meshes de terrain par chunks et des intérieurs/grottes GLB ; il n'existe pas encore de moteur de creusement multilevel, de synchronisation serveur ou de persistence partagée déployée. Les paramètres proposés sont des **hypothèses expérimentales**.

Références : [02 — Gameplay](02-GAMEPLAY.md), [03 — Monde](03-WORLD-GENERATION.md), [04 — Studio](04-EDITOR-INTERACTIONS.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [06 — Assets](06-ASSET-PIPELINE.md), [07 — Roadmap](07-ROADMAP.md), [09 — Tests](09-BROWSER-TEST-PLAN.md), [10 — Performance](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — V3](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md), [17 — Horizon](17-DISTANT-VIEW-RENDERING.md), [20 — Blender](20-BLENDER-STUDIO-INTERCHANGE.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md), [23 — Audio](23-MIDI-AUDIO-LOW-RESOURCE.md).

## 1. Décision et alternatives

| Approche | Coût attendu | Liberté d'excavation | Pourquoi |
| --- | --- | --- | --- |
| Galeries GLB préfabriquées | Très faible | Faible : segments/portes seulement | Utile pour entrées, rampes, décors et pièces |
| **Grille excavable 2,5D par étage** | **Faible** | **Bonne en XY/XZ sur un étage**, connexions verticales contrôlées | **Solution principale retenue** |
| Voxels 3D clairsemés autour des mines | Moyen à important selon cache/maillage | Complète en XYZ | **Option de recherche MINE-0**, seulement si les limites de hauteur deviennent bloquantes |
| Voxels 3D mondiaux | Très élevé à l'échelle visée | Complète | **Exclu** |

**Limite architecturale assumée** : les galeries ont un **sol/plafond paramétrés par niveau** ; on peut creuser horizontalement librement dans cette couche, mais **pas** découper un plafond n'importe où, créer deux galeries à hauteurs arbitraires dans **une même couche**, ou creuser un trou vertical anarchique. Les changements de niveaux utilisent des **connecteurs explicites**. Une salle de grande hauteur ou une géométrie exceptionnelle se fait en **module GLB** ou par une exception de volume local explicitement conçue.

Une grille d'étage peut évoluer vers des cellules qui portent un `floorOffset/ceilingOffset` borné si un besoin réel est mesuré, mais **ne pas recréer silencieusement un moteur voxel à travers des exceptions non maîtrisées**.

## 2. Unités, mine et niveaux

**Référentiel monde** : mètres, **Y vertical**, X/Z horizontal. Une mine possède un `mineId` stable, un emprise spatiale autorisée et un ou plusieurs `levelId` explicitement ordonnés par altitude. Les données de chaque étage sont **locales à la mine** et se projetent sur le monde via une transformation stable.

**Hypothèses de prototype, à benchmarker** :

| Élément | Départ proposé | Condition |
| --- | --- | --- |
| Taille cellule horizontale | **1 × 1 m** | Test de lisibilité/largeur du personnage |
| Largeur galerie praticable | ≥2 cellules selon collision/rig | Ne pas autoriser un creusement non navigable sans alerte |
| Hauteur de galerie | **3–4 m** | Constante par étage ou section réglable |
| Écart entre étages | **5–8 m** | Réglable ; interdire recoupements accidentels |
| Chunk de mine | **32 × 32 cellules** | Couches/étages **séparés** |
| Étages de démonstration | **3**, puis **3–8** à tester | Aucun chargement de tous les étages inactifs |
| Types de matière | roche/terre/dure + filons et cristaux | Palette versionnée, pas 256 objets 3D |
| Éclairage | Matériau/vertex colors + très rares lumières | Éviter une lumière avec ombres par torche |

**Données géologiques source** : `seed`, version de générateur, propriétés des strates, distribution de gisements, zones interdites et limites de creusement. **Données modifiées persistantes** : cellules excavées, ressources épuisées, portes/soutènements/objets et connecteurs construits, si le gameplay permet leur création.

**Ne pas charger une matrice 3D mondiale** : une mine au repos ne prend que son index/manifest ; les chunks d'étage proches du joueur ou nécessaires à la logique sont reconstruits à la demande.

## 3. Architecture : source auteur, état mutable, dérivés visuels

```text
WorldDefinitionV3 / MineDefinitionV3 (auteur, stable)
                │
       MineGeologyGenerator
         seed + version
                │
 MineBaseChunk / hidden ore deposit data
                │            ┌────────────────────────────────┐
                ├───────────►│ MineStateStore (partie/serveur)│
                │            │ excavation, épuisement, révision│
                │            └────────────────┬───────────────┘
                ▼                             │
     MineRuntime + occupancy/query ◄──────────┘
                │
       ┌────────┼───────────────┐
       ▼        ▼               ▼
 MineMesher  MineCollision   MineNavigation
 murs/sols  solids/passage  graphe/liaisons d'étages
       │
 MineLOD/streaming ←── ResourceBudgetManager / WorkScheduler
```

**Responsabilités** :
- `MineDefinition` : limites, couches, entrées, connecteurs, géologie, presets, règles, seed/version, **immuable au cours de la partie**.
- `MineStateStore` : état réellement creusé/épuisé, inventaire lié, révisions et résultats d'actions ; **local pour la bêta solo, autoritaire serveur uniquement plus tard**.
- `MineQuery` : solidité et surface(s) à **X/Y/Z et dans un étage**, matières, profondeur, état du gisement ; aucun accès via le seul `terrainHeight(x,z)` de surface.
- `MineMesher` : géométrie dérivée des **cellules exposées** et bordures, jamais de cubes entiers cachés ; fusionner faces adjacentes si rentable.
- `MineCollision` : solide/vide, sols/plafonds/connecteurs ; indépendante des LOD render et des matériaux d'ambiance.
- `MineNavigation` : graphe de tronçons/cellules valides et portails entre étages, mis à jour localement quand un passage s'ouvre.
- `MineRenderer` : petite portion visible, variantes low-poly, effets de récolte éphémères, culling des salles et galeries derrière les murs.
- `MineSyncAdapter` : interface local→serveur ultérieure **sans rendre le backend nécessaire à la bêta solo**.

**Invariant** : reconstruction du mesh et choix de LOD n'altèrent jamais cellule solide/vide, inventaire ou permission de creuser.

## 4. Creusement et maillage à faible coût

**Action de creusement** :
1. Le joueur cible une paroi depuis l'outil, par **raycast ou interaction contrôlée par portée**.
2. Le moteur détermine **mineId + levelId + chunkId + cellId**, matière/resistance et si la zone est excavable ; vérifier la **cellule adjacente accessible** et la collision.
3. En **solo**, appliquer une commande locale transactionnelle ; en **multijoueur futur**, envoyer l'intention au serveur puis attendre l'état autorisé (retour visuel provisoire possible et réconciliable).
4. Déduire outil/temps et rendement de récolte ; **une seule** transaction persistante retire ou épuise la matière et attribue les ressources.
5. Invalider le **chunk touché et les bordures concernées**, puis géométrie/volume de collision, navigation, éclairage simplifié, audio et représentation de gisement ; aucune ré-édition de la carte extérieure complète.

**Maillage V1 le plus simple** : seules les **faces au contact vide/solide** sont émises ; fusion des faces coplanaires par runs/rectangles si rentable, low-poly avec couleurs de sommet et quelques variantes. Les planchers et plafonds peuvent être fusionnés pour réduire draw calls. Pas de mesh par cellule, pas de particule pour chaque grain.

**Amélioration artistique facultative** : convertir certains contours en **lignes extrudées / petits chanfreins** pour une galerie moins « carrée », en conservant la **grille comme collision et vérité gameplay**. Aucun recalcul de marching cubes sur 100 km².

**À la frontière d'un chunk**, garder un échantillon de l'état des cellules voisines (« halo ») pour éviter double paroi/fissure. **Sur changement**, ne pas recalculer une autre mine ou un autre étage sans connexion. Une refonte de l'état source doit invalider le cache dérivé par version.

**Mémoire brute indicative, hors overhead** : 32×32 cellules à **1 octet chacune = 1 024 octets = 1 Kio** par étage/chunk pour une seule propriété. **À compléter** par excavation (bitset 128 octets), état minerai/quantité, version, snapshots, index, objets, maillages CPU/GPU et codes de type. **Ne pas utiliser l'estimation 1 Kio comme mémoire totale** d'une mine.

## 5. Entrées, verticalité, collision et ergonomie

- **Entrées de surface** : trou/portail contrôlé dans heightfield **localisé**, ou façade GLB dédiée masquant la jonction. L'entrée doit être liée à `MineDefinition` pour que le générateur de terrain, les collisions et le chargement reconnaissent une **transition vers le sous-sol**.
- **Escaliers/rampes** : modules de connexion entre niveaux avec géométrie et collision **prédéfinies**, dimensions/hauteurs compatibles ; navigables à pied si pente acceptable.
- **Puits** : nœuds verticaux autorisés, besoin d'échelle/ascenseur/corde ou action explicite ; ni trou libre dans tous les plafonds ni traversée accidentelle de plusieurs étages.
- **Pièces hautes / cavernes** : un GLB d'intérieur peut représenter une pièce complète, ou quelques couches fusionnées sous contrat particulier ; ne pas prétendre que la grille régulière donne une liberté verticale totale.
- **Physique joueur** : le code actuel appelle `terrainHeight(x,z)` pour placer/déplacer l'écureuil. Prévoir un **`SurfaceQuery/CollisionWorld` dépendant de X,Y,Z et de la zone active**, avec `surface/outdoor/mine`, raycasts/capsule et priorité des sols **sous** le joueur. Interdire le snap au terrain extérieur depuis une galerie.
- **Navigation** : nœuds/portails `mineId/levelId` et connecteurs ; mises à jour locales des chemins après creusement, transitions vers surface/PNJ. Pas de recalcul général de navigation du monde.
- **Éclairage** : colorimétrie/vertex colors, plafond assez clair pour la lisibilité, quelques accents émissifs sur minerais/cristaux et torches fixes simples **sans shadow maps multiples** ; tester visibilité en GPU faible et clair de lune/entrée naturelle.
- **Audio et eau** : caves/reverb très légère éventuellement plus tard, quelques émetteurs AUD proches ; les aquifères/risques de rivière ou de mer doivent être **des règles de validation géologique** (mine interdite sous niveau d'eau ou volumes d'eau souterrains prédéfinis). **Pas de simulation d'inondation physique** dans MINE-V1.

## 6. Génération de métaux, cristaux et récolte

**Deux notions séparées** :
1. **Matière structurale** à creuser : terre/roche dure/roche friable, occupée par défaut selon le générateur.
2. **Gisement** `DepositDefinition` de **type de ressource et quantité** : cuivre, fer, autre métal, gemmes/cristaux selon profondeur, géologie et seed.

**Gisement généré de façon déterministe** par `mineId + geologyVersion + seed + levelId + cellCoord` ou en filons corrélés spatialement : **pas de tirage non déterministe à chaque visite** et pas de régénération silencieuse des minerais après rechargement.

- **Filons multi-cellules** : petit champ de concentration corrélé le long de strates/veines ; suivre un filon en creusant plusieurs cellules. La difficulté et les objets décoratifs varient selon la strate, sans créer des centaines de matériaux.
- **Cristaux** : quelques petits modèles GLB originaux, low-poly, instances proches uniquement ; le gisement logique porte le stock, l'animation d'extraction ne porte pas un objet physique par fragment.
- **Inventaire** : une seule récompense par cellule/lot d'extraction, avec validations de quantité/outils/temps, limites d'inventaire et idempotence de requête.
- **Repopulation** : `none` par défaut pour les cellules épuisées ; toute régénération événementielle explicite, paramétrée et persistante par règles, sans recharger une mine pour obtenir une deuxième récolte.
- **Sécurité future** : pour le multijoueur, **ne pas publier la graine secrète ni le plan complet de gisements rares dans les assets statiques publics** ; le serveur contrôle ce qui est découvert/attribué. En solo, les fichiers locaux sont accessibles : aucune anti-triche ne peut être promise.

## 7. Persistance, sauvegardes et synchro serveur (futur)

**Deux domaines distincts à préserver** :
- **Studio / archive source V3** : carte initiale, mine et niveaux, règles/gisements/entrées, gabarits et presets, seeds/versions. Les export/import auteurs **n'écrasent pas les mines déjà creusées dans des parties**.
- **Partie** : excavations, épuisements de ressource, construits en galerie, inventaire et progression. **Solo : sauvegarde locale versionnée** (IndexedDB/export de partie dédié). **Plus tard : stockage et autorité serveur**, hors GitHub Pages.

**Commande d'intention indicative** (pas un endpoint implémenté) :

```ts
interface MineDigRequest {
  requestId: string;       // stable/unique pour idempotence
  mineId: string;
  levelId: string;
  chunkId: string;
  cellX: number;
  cellZ: number;
  toolId: string;          // vérifié dans état serveur, pas confiance client
  expectedRevision?: number;
}

interface MineChunkDelta {
  mineId: string;
  levelId: string;
  chunkId: string;
  baseRevision: number;
  revision: number;
  changedCells: Array<{
    cellX: number;
    cellZ: number;
    excavated: boolean;
    remainingResource?: number;
  }>;
  // Récompense/inventaire : message ciblé au joueur, séparé de la
  // diffusion de la géométrie excavée aux spectateurs du chunk.
}
```

**Validation serveur** :
1. Authentifier et contrôler mine/partie/joueur, distance 3D réelle, outil, accès au niveau, cellule valide, état solide et progression ; **ne jamais accepter client « j'ai gagné 10 minerais »**.
2. Contrôler ordre et unicité `requestId`; **deux joueurs creusant la même cellule** ne doivent pas obtenir la récompense deux fois.
3. Appliquer **de façon atomique** excavation/épuisement + attribution d'inventaire dans le stockage transactionnel ; si opération échoue, ne confirmer ni modification ni ressource.
4. Incrémenter la **révision du chunk/étage** et émettre des deltas **ordonnés** aux abonnés AOI/zone de mine. Si la révision attendue diverge, **resynchroniser par snapshot** plutôt que recopier des meshes 3D.
5. Mettre en cache/compacter les deltas et snapshots périodiquement ; version de génération et format de cellule explicites, migration lors du changement de version **sans faire réapparaître les gisements épuisés**.
6. **Ne pas synchroniser** triangles, normales, géométries GLB, particules, éclairage ou positions de chaque cristal : les clients reconstruisent ces **dérivés**.
7. Entrées/sorties de mine et visibilité réseau **ne coïncident pas forcément avec les chunks mondiaux** : `mineId+levelId+chunkId` donne l'adresse stockage, pas la zone d'autorité.

**Solo avant serveur** : implémenter le même contrat via `LocalMineRepository`/commandes (sans auth réseau) et tester `save → close → reload → mêmes galeries/filons épuisés`. L'ajout du serveur remplace l'adaptateur de persistance et la validation d'autorité, pas toute la physique ou le rendu.

## 8. Streaming, LOD, culling et budget PERF

**Consommateur du [ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md)**, pas de deuxième régulateur de qualité.

- Charger **uniquement la mine active, les étages/galeries proches et les connexions imminentes** ; un étage inférieur lointain et plein de roche n'a **aucun mesh à dessiner**.
- **Faces exposées seulement**, géométrie du chunk si nécessaire, matériaux roche/cristal partagés, couleurs de sommet, instancing pour répétitions ; **aucune géométrie opaque dans les cellules solides**.
- **Culling de portes/secteurs** : un tunnel tournant derrière une paroi peut être non rendu, même s'il est à quelques mètres ; solutions simples de **graphe salles/portails** avant occlusion GPU sophistiquée.
- LOD : près = parois normales et quelques cristaux visibles ; moyen = contours/plafonds simplifiés ; loin = **non chargé ou proxy derrière les portails**, mais ne pas retirer un couloir visible par le joueur.
- **Collision et état logique non soumis au LOD graphique** : les zones actives restent praticables et les éditions ne créent pas de trous de collision temporaire.
- `WorkScheduler` borne remeshing, recalcul nav/collision, décodage GLB et upload WebGL par frame ; **P0 collision/praticabilité** avant P1 rendu proche, P2 minéraux décoratifs, P3 précalcul hors vue.
- Prévoir **mise à jour immédiate de la grille de collision** à l'application du delta, et remplacement de la géométrie visuelle **asynchrone** avec overlay/proxy sûr jusqu'à actualisation.
- `ResourceRegistry` mesure **octets estimés** cellules/overrides, vertices/index, meshes et GLB partagés ; éviction seulement des chunks inactifs non référencés.
- Éviter **lumières ponctuelles multiples avec shadowmaps**, terrain volumétrique global, fragmentation de draw calls par cellule et effets de poussière coûteux.

## 9. Studio et Blender : édition, validation et export

**Studio doit avoir un éditeur Mine compact** :
- Ajouter une mine → placer **entrée** de surface, sélectionner emprise creusable et nombre de niveaux (avec **altitude/hauteur**).
- Vue **plan par étage** et coupe simple : afficher **solide/creusé/filon/connexion**, contrôle de niveau, preview parcours, limite autorisée et géométrie GLB décorative.
- **Génération de départ** : seed, strates/gisements, rareté/quantités, pièces pré-creusées, passages obligatoires, zones protégées, escaliers/rampes/puits.
- Aperçu/validation : changements de niveau, secteurs affectés, tunnels qui se touchent ou recoupent des volumes d'eau/constructions, entrée correcte, collision/passages accessibles.
- Mode test `Dig` dans **un état de partie temporaire**, **pas une modification du modèle auteur** sauf action explicite de l'éditeur pour appliquer à la source.
- Bibliothèque Blender/GLB : **entrées de mine, lampes, rails, rochers, parois décoratives, cristaux, treuils, escaliers, puits** ; conserver `MineDefinition` et les cellules comme source logique.
- **Export ZIP auteur** : mine et niveaux/strates/filons initiaux en sources versionnées, GLB et dépendances ; le **joueur** exporte séparément une **sauvegarde de partie** si demandée.
- **Preview performance** : chunks/meshes exposés, collision/navigation, file de remeshing, emprise mémoire et visibilité selon étage, avec métriques PERF.

**Règle** : le Studio ne doit pas être transformé en éditeur voxel 3D généraliste, ni fabriquer un modèle GLB intégral des 8 niveaux après chaque excavation.

## 10. Compatibilités transversales

- **Terrain extérieur / horizon (docs 03, 17)** : surface visible jusqu'à l'horizon inchangée, sauf **ouverture localisée de l'entrée** ; ne pas charger des caves depuis le ciel.
- **Eau (doc 21)** : vérifier niveaux de cours d'eau, lacs et mer pour interdictions d'excavation ou cavités/galeries inondées **prédécidées** ; simulation d'inondation **hors scope**.
- **Blender (doc 20)** : modules d'entrée, escaliers, rampe, puits, soutènement, rochers et cristaux ; aucun **GLB seul** ne représente le stockage de cellules et récoltes.
- **Audio (doc 23)** : un/deux profils d'ambiance intérieure et sons de frappe/collecte échantillonnés, avec émetteurs AUD proches, pas un son par cellule.
- **PNJ / navigation** : graphe de chemin par mine/étage, connexions vers surface ; ne pas calculer pathfinding sur toutes les cellules souterraines du monde à chaque tick.
- **Multijoueur (doc 16)** : serveur autoritaire **futur**, snapshots/deltas AOI localisés, pas de réplication géométrie, révisions/idempotence, pas de synchronisation à l'échelle du monde.
- **PERF (doc 22)** : profils faibles conservent minerai/galerie/collision ; seuls éclairage, effets de poussière et ornements diminuent.

## 11. Validation, benchmark, limites et gates

**Gates indispensables** :
1. **MINE-0 benchmark comparatif** : mêmes trois galeries/étages/capacité avec grille 2,5D, GLB modulaires et voxels 3D **strictement localisés**. Mesurer rapidité d'édition, CPU remeshing p50/p95/p99, allocations, triangles/draw calls, collisions et taille des deltas.
2. Creuser 1, 10 et 100 cellules, dont frontière de chunk : **remesh local**, pas de fissure/bordure dupliquée ; collision/passabilité mises à jour et stabilité visuelle.
3. Trois puis huit étages superposés, puits/rampe/escalier : aucun snap vers `terrainHeight`, pas de tunnel à mauvais niveau, pas de collision fantôme.
4. **Entrée** dans hauteur/surface extérieure : trou unique sans eau/sol qui flotte, transition surface ↔ mine et retour.
5. Filon multi-cellules/couleurs/cristaux : **même gisement à seed identique**, extraction épuisement persistant sans duplication par save/reload.
6. Deux commandes identiques ou simultanées (simulateur serveur) : **une récompense**, révision monotone et resync par snapshot en cas de trou de delta.
7. Cache de mine borné, entrée/sortie/retour, longue session, téléportation, FPS 20/30, contexte WebGL perdu/restauré, pas de glissement du mesh ni fuite persistante.
8. Mine traversant lac/mer/fond de rivière, niveau recoupé ou entrée inaccessible : **avertissement ou blocage de validation**.
9. Export/import source ZIP V3 puis sauvegarde/chargement partie : **pas de confusion des domaines**, références GLB/cristaux stables et états de récolte inchangés.
10. Vraie machine GPU intégré : **30 FPS normal / 20 FPS dégradé à qualifier**, p95/p99/cpu/mémoire/chargement. Aucun quota de cellules ou FPS annoncé comme déjà mesuré.

**Indicateurs** : cellules source/creusées, chunks résident/actif, étages préchargés, temps de reconstruction CPU, allocations, mesh triangles/draw calls, temps de collision, recalcul de nav, résidences GPU/CPU estimées, taille snapshot/delta, nombre de transactions et taux de resynchronisation.

**Valeurs à ne pas figer sans benchmark** : 1 m/cellule, 32×32, 3–8 étages, hauteur et séparation, coût CPU/VRAM, taille des maillages, taille/découpage des snapshots, limites de profondeur de mine et gisements.

## 12. Phases de développement MINE-0…MINE-9

| Phase | Livrable / critère |
| --- | --- |
| **MINE-0** | Banc comparatif 2,5D vs GLB modules vs voxels localisés ; décision de détail/flexibilité après mesure |
| **MINE-1** | Contrats `MineDefinitionV3/MineLayer/MineChunk/MineState`, géologie/ID/version, limites |
| **MINE-2** | Commande locale creuser + occupancy + faces exposées/maillage sectorisé et seams |
| **MINE-3** | SurfaceQuery/CollisionWorld 3D, entrée de mine, escaliers/puits/rampes, navigation interétages |
| **MINE-4** | Gisements/filons/couleurs/cristaux déterministes et règles de génération par profondeur |
| **MINE-5** | Récolte, inventaire, stockage de partie solo et reprise déterministe après rechargement |
| **MINE-6** | Streaming/culling des galeries, LOD, ResourceRegistry/WorkScheduler, bench des assets |
| **MINE-7** | Interfaces d'autorité serveur **sans serveur obligatoire** : requêtes, transactions, révisions, snapshots/deltas |
| **MINE-8** | Studio Mine, plan par niveau, GLB entrées/prefabs, validation, test et ZIP auteur |
| **MINE-9** | Tests de concurrence simulée, charge multi-client réelle si serveur disponible ultérieurement et benchmarks GPU intégré |

**Ordre privilégié** : un **prototype vertical concret** avec deux/trois niveaux, creusement, collision, récolte et sauvegarde locale avant d'implémenter les couches d'édition/serveur complètes. Mettre les interfaces de commandes/snapshots dès MINE-1, mais **ne pas développer de backend multijoueur dans l'itération solo**.

**Statut strict** : `SPECIFIED` ≠ `IMPLEMENTED` ≠ `TESTED` ≠ `BENCHMARKED` ≠ `RELEASED`. La présente décision rend possible un développement ordonné, **pas une promesse d'une mine creusable déjà jouable**.
