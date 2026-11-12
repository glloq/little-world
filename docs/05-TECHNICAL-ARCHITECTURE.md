# 05 — Architecture technique — solo et GitHub Pages

**Statut : architecture cible avec un premier prototype codé.** Le périmètre final et le Studio sont spécifiés dans [12 — Limites](12-PROJECT-SCOPE.md) et [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md). `src/terrain.ts`, `src/world.ts`, `src/player.ts`, `src/main.ts` et `src/editor.ts` sont en place ; Rapier reste différé.

## Implémentation actuelle de la branche

**Statut : architecture incrémentale implémentée.** Pas de réécriture en monorepo : modules TypeScript dédiés au format source (`world-data`), terrain analytique (`terrain`), planification et rendu de chunks (`chunks`, `terrain-view`), écologie (`biomes`, `ecology`), comportement PNJ (`npc`), dialogues et édition (`dialogue`, `dialogue-authoring`, `dialogue-editor`), rig/animation, stockage et UI. La simulation joueur/bateau reste indépendante du rig ; Rapier reste différé.

Le terrain utilise actuellement une configuration active unique par page. Jeu et éditeur sont deux pages distinctes : ils ne doivent pas instancier simultanément deux cartes de configurations différentes dans un même contexte JavaScript. Le cache GLB et les géométries partagées restent résidents ; les géométries de terrain et les secteurs écologiques sont bornés et libérés explicitement.

La pile réellement utilisée est **Node.js 22, npm avec package-lock, TypeScript, Vite, Three.js et Playwright en développement**. `npm ci`, `npm test`, `npm run build`, puis `npm run test:browser` avec un serveur local constituent la validation. Le workflow `checks.yml` couvre les branches/PR ; `pages.yml` conserve le déploiement sur main. Les structures plus ambitieuses décrites ci-dessous restent des objectifs.


La cible Studio/100 km² ci-dessous reste à distinguer de cette implémentation locale.

## Principe cardinal

**Toute la V1 s'exécute dans le navigateur.** GitHub Pages sert le HTML, JavaScript, WASM, fichiers GLB, textures et cartes compilées. **Aucun serveur applicatif, API de jeu, WebSocket, comptes, PostgreSQL ou Colyseus.**

Le multijoueur pourra être étudié après la V1, mais **ne doit pas complexifier l'architecture courante** : garder simplement simulation et rendu séparés.

## Stack cible

| Partie | Technologie |
| --- | --- |
| Code commun | **TypeScript** strict |
| Rendu 3D | **Three.js** / WebGL |
| Physique | **Rapier JS/WASM** (prévu, pas encore installé dans le prototype) |
| Build / dev | **Vite** |
| Dépendances actuelles | **npm**, `package-lock.json` |
| Test du code | Tests unitaires TS et tests navigateur |
| Publication | **GitHub Actions → GitHub Pages** |
| Sauvegarde d'éditeur | **IndexedDB** + import/export JSON |
| Assets | **GLB** + manifeste local versionné |

Pas de service Node.js au runtime : Node n'est utilisé **qu'au développement et dans le build CI**.

## Structure visée

```text
little-world/
├── apps/
│   ├── game/              # Jeu solo statique Three.js
│   └── editor/            # Éditeur statique, même moteur
├── packages/
│   ├── core/              # Horloge, IDs, événements et contrats
│   ├── movement/          # Simulateur local et états de déplacement
│   ├── world/             # Générateur, carte source, compilation
│   ├── rendering/         # Three.js, caméra, animation
│   ├── interactions/      # États et actions locaux déclaratifs
│   ├── asset-registry/    # Catalogue, provenance, validation
│   └── shared/            # Types et schémas
├── assets/                # Assets redistribuables dans le repo
├── docs/
├── tools/                 # Conversion/import/tests
└── .github/workflows/     # Build/test/deploy Pages
```

Ne créer **aucun** `apps/server` dans la V1. Des packages ne doivent être créés que si la séparation sert réellement la maintenabilité ; éviter des abstractions inutiles.

## Découpage de l'exécution

| Couche | Rôle |
| --- | --- |
| `InputMapper` | Souris/clavier → commandes |
| `MovementSimulator` | Machine à états, accélérations, planage, eau |
| `PhysicsAdapter` | Collisions et volumes Rapier |
| `WorldLoader` | Charger manifeste/terrain/objets statiques locaux |
| `InteractionRuntime` | Événements et états locaux d'objets |
| `CharacterView` | Modèle GLB, animations, interpolation graphique |
| `CameraController` | Caméra troisième personne indépendante |
| `EditorState` | Modifications, undo/redo, sérialisation (éditeur seulement) |

**Le rendu ne décide pas de l'état physique.** Simulation à pas fixe, rendu à fréquence variable ; mesures de performance et trajectoires reproductibles.

### Politique de cadence et de ressources

La référence globale est [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md) : **30 Hz d'affichage nominal (33,3 ms/image), 20 Hz en secours (50 ms/image)**. Proposition pour la simulation locale : **pas fixe 30 Hz** et interpolation visuelle, indépendamment du FPS. Le joueur, le bateau et les interactions doivent conserver leur vitesse et leurs commandes en mode 20 FPS ; PNJ et faune peuvent employer des fréquences plus basses. Éviter l'exécution de plusieurs moteurs de simulation ou de rendu par entité.

**Migration implémentée sur la branche de campagne :** `frame-clock.ts` simule à 30 Hz indépendamment de la présentation (cible 30, secours 20), interpole la position visuelle et borne le rattrapage. Résolution puis détails écologiques sont réduits après surcharge soutenue, avec restauration temporisée. Le jeu et l’éditeur suspendent leur rendu lorsque l’onglet est masqué ; l’éditeur actif est plafonné à 30 Hz. Les décisions PNJ tournent à 10 Hz proches / 2 Hz intermédiaires et leurs positions sont interpolées. Tests d’indépendance 20/30/60 FPS, reprise d’onglet et équivalence approximative avec les anciennes trajectoires 60 Hz. Les seuils adaptatifs sont provisoires ; cela ne prouve pas l’atteinte de 30 FPS sur PC.

Le joueur ne charge pas les outils de compilation/édition ; mettre la génération lourde, la validation et l'optimisation des cartes hors de la boucle de rendu.

## Gestion des données

### Jeu

Charge une **carte de démonstration versionnée** livrée avec le site ; aucune requête vers un backend. Les états temporaires (roue du moulin, leviers, position) peuvent rester en mémoire et sont réinitialisés au chargement pour la V1. La persistance de progression joueur n'est **pas nécessaire pour le prototype initial**, mais le **jeu final doit disposer de plusieurs sauvegardes de partie locales** (inventaire léger, flags, objectifs, position et états persistants), distinctes des projets auteur.

### Éditeur

- Format source JSON validé par schéma.
- Stockage de travail IndexedDB (stockage local non garanti à vie).
- Export/import JSON manuel comme sauvegarde portable.
- Carte publiée dans le site seulement après **validation, commit et nouveau build**.

### Assets

Registre local stable, chemins de fichiers construits **relativement à la base publique du build**, sans dépendance CDN. Aucun chargement d'asset via URL externe non validée par défaut.

## Spécificités GitHub Pages

Site de projet prévu : `https://glloq.github.io/little-world/`.

Pour Vite, choisir **`base: '/little-world/'`** en production. Ne pas écrire de chemins absolus `/assets/...` qui chercheraient les fichiers à la racine de `github.io`. Utiliser `import.meta.env.BASE_URL` quand il faut fabriquer une URL publique dynamiquement.

Jeu et éditeur peuvent être deux points d'entrée statiques ou utiliser un routage **hash** ; éviter les URLs SPA profondes qui provoquent un 404 au rechargement sans configuration de fallback.

CI : lint/typecheck/tests → build → vérification des chemins/artefacts → déploiement GitHub Pages. Le workflow **sera implémenté à M0** ; GitHub Pages doit être activé dans les paramètres du repo.

Détails : [08-GITHUB-PAGES.md](08-GITHUB-PAGES.md).

## Tests V1

1. Build statique **sans serveur au runtime**.
2. Chargement correct depuis le préfixe **`/little-world/`** et non seulement depuis `localhost:/`.
3. Rapier WASM et textures/GLB accessibles avec les bons chemins.
4. Marche/course/saut/planage/nage/plongée testés à différents FPS.
5. Générateur déterministe et formats de cartes validés.
6. Sauvegarde/export/import/rechargement d'éditeur sans perte.
7. Test navigateur automatisé avec capture des erreurs réseau/console.
8. Budgets LOW-RESOURCE (30/20 FPS, temps CPU/GPU, draw calls, triangles, téléchargements, mémoire) mesurés sur un PC de test de référence.
9. Un artefact de build publié est **visuellement vérifié** sur GitHub Pages.
10. Une baisse d'affichage à 20 FPS ne ralentit pas le monde ; aucune perte d'input, aucun rattrapage CPU incontrôlé après changement d'onglet.

## Studio, monde et gameplay final (cible, non implémentée)

- **Limite : une seule carte géographique continue jusqu'à 10 × 10 km**, 100 km² maximum théorique. La carte actuelle 200 × 600 m reste une démonstration, pas la limite du projet.
- **Studio multi-éditeurs (E1=C)** : carte globale, terrain, eau/chemins, biotopes, objets/bâtiments, personnages/PNJ, dialogues, interactions, assets et tests. Les écrans sont spécialisés mais partagent IDs, formats, projet, sélection et historique Undo/Redo.
- **Format auteur sectorisé** : manifeste global, `WorldDefinition`, chunks/overrides, prefabs, entités, graphes d'interactions, dialogues, navigation, schémas versionnés. Éviter un JSON monolithique à 100 km².
- **Runtime compilé** : fichiers statiques de secteurs, LOD, collisions, index PNJ/biotopes ; le jeu charge les secteurs proches et **ne télécharge pas les modules lourds du Studio**.
- **PNJ animaux et créatures, aucun humain** : réutiliser les variantes du rig joueur lorsque possible. Activités/reactions simples, mais **navigation libre** avec planification hiérarchique par secteurs et évitement local ; IA dormant hors proximité.
- **Interactions** : événements, conditions ET/OU, actions séquencées, références typées par IDs, sauvegarde des flags utiles. Aucun JS arbitraire issu d'une carte importée.
- **Activités** : exploration avec petites missions, objets ramassables/inventaire léger, énigmes et possibilités de pêche/collecte ; pas de combat ni RPG lourd.
- **Sauvegardes séparées** : projets et brouillons auteur d'une part, parties joueur (plusieurs slots) d'autre part. Compilation/édition n'écrasent pas la progression.
- **30 FPS nominal / 20 FPS de secours**, pas fixe indépendant, benchmarks avant toute garantie de fluidité sur 100 km².

En pratique : éditeur → source autorisée → validation/compilation par secteurs → build statique GitHub Pages → runtime et slots de partie. **Le Studio ne publie pas directement depuis le navigateur public**.

## Visibilité longue portée sans brouillard (cible de rendu)

**Décision validée :** relief visible à plusieurs kilomètres sans fog-cache, au moyen d'un **horizon 3D simplifié indépendant des chunks détaillés**, accompagné si utile d'imposteurs/atlas/silhouettes précalculés et d'un ciel panoramique. Voir [17 — Rendu panoramique](17-DISTANT-VIEW-RENDERING.md).

Le **terrain actuel à trois LOD** reste la base locale ; le système d'horizon et les LOD de forêts, bâtiments, eau et silhouettes sont des **extensions à implémenter et benchmarker**. Les changements V3 d'auteur invalident seulement les dérivés affectés.

Le rendu **n'est pas** un état du monde : la physique, la navigation, les dialogues et la persistance sont indépendants des meshes/proxies. Éviter `camera.far` illimité, `logarithmicDepthBuffer` global sans test et les billboards alpha trop coûteux. Comparer les performances à graine, contenu et caméra identiques sur GPU intégré.

## Architecture cible : environnement, ciel et ombres à coût limité

**Contrat :** [19 — Environnement météo/astral LOW-RESOURCE](19-ENVIRONMENT-WEATHER-SKY.md). Le prototype actuel a une couleur de fond, un fog fixe, une `HemisphereLight` et deux `DirectionalLight` fixes ; **ce n'est pas encore un système météo/soleil**.

À terme : `WorldClock` (temps absolu) → `EnvironmentStateSource` (locale/test, serveur ultérieur) → `EnvironmentState` → un ensemble de rendus spécialisés. Le rendu ne connaît pas la source : changer d'autorité ne réécrit pas le ciel, les surfaces ou le code des PNJ.

- Jour/nuit, étoiles et **plusieurs lunes à cycles propres**, disque du soleil/lune et nuages dans un ciel peu coûteux ; aucun objet astral lourd.
- Pluie et neige **locale visuelle** partageant un même système, état météo **par grandes zones climatiques**, pas de particules par chunk.
- Neige persistante/fonte/température : coloration par masques sur terrain, arbres, toiture et silhouettes d'horizon ; **ne pas reconstruire les meshes** à chaque météo.
- **ShadowBudgetManager** : au maximum une shadow map solaire locale pour grands objets proches, désactivée dans les profils modestes ; ombres de contact simples pour personnages si nécessaire.
- Le fog est un **état météo explicite**, interdit comme masque des limites du rendu ; le paysage profond du document 17 reste géométriquement présent.
- Outils bêta : menus contrôlant météo, horloge, lunes indépendantes, ombres et profil qualité, sans sauvegarde auteur involontaire.

**Interdit maintenant** : serveur permanent, synchronisation de la pluie, moteur de climat physiquement simulé, nuages volumétriques, ombres lunaires multiples.

## Blender ↔ Studio : architecture d'échange non destructive

Voir [20 — Contrat import/export GLB, presets et cartes](20-BLENDER-STUDIO-INTERCHANGE.md).

**Couches indépendantes** : auteur `.blend` facultatif → ressource géométrique **glTF/GLB** interopérable → catalogue/prefabs et sources **WorldDefinitionV3** → **compilation par secteurs** vers runtime statique. Le moteur **n'utilise pas de fichiers `.blend`** et ne dépend pas de Blender au lancement.

**Modes d'échange** :
- Asset GLB → entrée catalogue/prefab versionné (preview, licence, validation) ;
- Scene/collection GLB + JSON sidecar → transforms, ancrages et groupes de placements, avec réimport diff plutôt qu'un overwrite aveugle ;
- Preset ZIP+JSON+GLB → ensemble réutilisable inter-projets ;
- **Carte V3 ZIP portable** → sources auteur par secteur + dépendances réelles, données de logique et biotopes ;
- Build compilé sur GitHub Pages → **indépendant** des archives auteur, supports LOD/streaming/instancing.

**Stabilité** : IDs stables, conversion Blender **Z-up** ↔ Studio/glTF **Y-up** faite une seule fois, gestion des pyramides transform (quaternions, échelles), hashes de sources, transactions et Undo/Redo, migration V1/V2/V3 ; sécurité et budget GPU à l'import. Les interactions, dialogues et règles de biotopes sont **données V3**, non inférées de meshes Blender.

## Compatibilité avec un futur multijoueur (non implémenté)

**Contrat de préparation**, cf. [16 — Architecture multijoueur future](16-FUTURE-MULTIPLAYER.md) :

- **IDs/repères spatiaux/états de gameplay V3** indépendants des meshes, de l'éditeur, des bibliothèques de transport et des processus.
- Contenu statique (carte compilée, assets) livré séparément de la **simulation dynamique**, pour éviter la retransmission des décors.
- Future réplication **par destinataire et intérêt spatial/contextuel (AOI)**, distincte des chunks de stockage et des zones d'autorité.
- **Simulation serveur future à cadence propre**, réplication de mouvement adaptative typiquement 2–20 Hz et actions critiques prioritaires ; le rendu client reste 30/20 FPS.
- Animations locales et modèles de foule à plusieurs LOD ; PNJ et faune à fréquence adaptée.
- En cas d'évolution à plusieurs processus : propriétaire logique d'entité, transferts atomiques d'autorité et continuité de jeu ; **ne pas l'implémenter sans démontrer la saturation d'un serveur dédié unique**.
- Objectif d'étude : 30 joueurs d'abord, **200 visés**, 500 comme expérimentation ; benchmarks serveur et vrais navigateurs distincts.

**N'ajouter aucun module réseau, socket, compte, dépendance serveur ou `ReplicationPolicy` obligatoire aux données V3 pour le solo.**

## Travaux explicitement différés

Colyseus ou autre transport, serveur autoritaire, prédiction/réconciliation réseau, rooms, chat, authentification, base de données, positions des autres joueurs, sauvegarde partagée et tests de charge (30 → 200, 500 expérimental).

Une future évolution réseau demanderait un nouveau jalon et une conception spécifique ; **ne pas ajouter d'infrastructure prématurée**.
