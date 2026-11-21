# 107 — Mini-jeux : architecture unifiée, mutualisation et optimisation

Branche : `feat/minigames-unified-platform` (non fusionnée). Statuts : **SPECIFIED / IMPLEMENTED / TESTED / QUALIFIED** distincts ; rien n’est `QUALIFIED` (aucune mesure sur GPU intégré réel).

## 0. Résumé

- Un seul moteur de balles (`BallWorld`), une seule gestion de session, un seul cycle de vie et un seul format de données servent **football, bowling et mini-golf**.
- Les mini-jeux sont **déclarés par île** (`libraries.minigames`, facultatif) et chargés **à la demande** : une île sans mini-jeu ne télécharge aucun de leurs modules (vérifié en navigateur), une activité inactive ne simule rien (vérifié par test et banc).
- Le contrôleur du joueur (`simulatePlayer`) n’est **pas modifié** ; la balle réagit au corps du hamster (aller simple), sur la **même** boucle fixe 30 Hz.
- Studio : module « Mini-jeux » (créer, configurer, analyser le terrain, aperçu, « Jouer ici »).
- Multijoueur : contrats prêts (commandes horodatées par tick, ordre déterministe, états sérialisables, autorité locale) ; **aucun serveur**, conformément à AGENTS §1 quater.

## 1. Audit de l’existant (code réel, 21/11/2026)

| Système | Emplacement | Rôle | Classe | Décision |
|---|---|---|---|---|
| Requêtes de collision | `src/physics/collision-world.ts` (`WorldCollisionQuery`) | relief (`reliefHeight`), matériaux, grille 32 m d’AABB, espaces de mine | **REUSE + ADAPT** | les balles lisent le même relief/matériaux ; ajout de `solidsNear()` (lecture publique de la broadphase existante, +125 o) |
| Contrôleur joueur | `src/player.ts` (`simulatePlayer`, roulade) | marche, roulade, vol, nage, surf, ski | **REUSE** | inchangé ; un instantané `MiniGameActor` est lu après chaque pas |
| Constantes de mouvement | `src/physics/motion.ts` | `MOTION.gravity`, `SURFACE_MOTION` | **REUSE** | gravité et frottement de sol des balles = ceux du joueur |
| Horloge fixe | `src/frame-clock.ts`, `tick()` de `src/main.ts` | simulation 30 Hz, présentation 30/20 FPS | **REUSE** | un seul appel `minigameHost.tick()` par pas ; **aucune boucle RAF** ajoutée |
| Courses | `src/gameplay/races.ts`, `race-track.ts`, `races-panel.ts` | sessions pures par tick, événements retournés | **REUSE (non migré)** | mécanique mature conservée ; son patron (pur, tick, événements retournés) est repris par `session.ts` |
| Activités mines/champs | `src/gameplay/activity-runtime.ts` | intention → autorité locale → notification | **REUSE (patron)** | même séparation intention/autorité dans `authority.ts` |
| Trackers 30 Hz | `src/gameplay/activity-trackers.ts` | plongée, surf, ski → événements typés | **REUSE** | inchangés |
| Registre d’événements | `src/gameplay/events.ts` | seul registre des événements de quête | **ADAPT** | + `minigame.finished` (pas de second bus) |
| Quêtes | `src/quests/*` | attendent des événements déclarés | **REUSE** | une quête peut attendre `minigame.finished` |
| Pêche, musique, cueillette | `fishing.ts`, `src/instruments`, `gathering.ts` | activités matures | **REUSE (non migré)** | rattachées au catalogue des familles, sans réécriture |
| `libraries.activities` | `src/gameplay/schema.ts` (`ActivityDefinition`) | regroupe des interactions/objectifs (collect, deliver, fish, puzzle) | **REUSE (inchangé)** | pas de zone, de physique ni de session : surcharger ce type aurait cassé ses validateurs ; `libraries.minigames` suit plutôt le modèle de `races`/`surfZones` |
| Zones géographiques | `src/geography/engine.ts` (`GeoZone`) | sol réservé des villages (pas d’arbres) | **ADAPT** | type `'minigame'` : terrains de jeu auteur sans arbres générés |
| Arbres / troncs | `src/geography/dressing.ts`, `gameplay/tree-colliders.ts` | cellules déterministes, troncs autour du joueur | **REUSE** | la recherche de site de la démo évite ces troncs |
| Studio | `shell.ts`, `races-panel.ts`, `surf-panel.ts`, `CommandBus` | modules paresseux, transactions | **REUSE + ADAPT** | nouveau module ; `StudioViewport.setOverlay()` générique |
| Bancs | `tools/bench-physics.mjs`, `tools/bench-activities.mjs` | coûts joueur / mines / champs | **REUSE** | + `tools/bench-minigames.mjs` (+ navigateur) |

**Doublons et couplages relevés (hors périmètre, non modifiés)** : tests point-dans-polygone et distance à un segment réimplémentés dans plusieurs modules (`mine-data.ts`, `activity-trackers.ts`, `activity-runtime.ts`) ; `main.ts` (~2 200 lignes) orchestre en ligne courses, défis de vol, surf, ski et télésièges. Les mini-jeux n’ajoutent **qu’un objet hôte et quatre points d’accroche** à `main.ts` au lieu d’une logique de plus en ligne. Aucune simulation inutile n’a été trouvée sur le chemin des mini-jeux ; les trackers existants ne tournent que si leurs zones existent.

**Ce qui est réellement nouveau (NEW)** : physique de sphères, poussée bornée, session générique, règles composables, autorité locale, registre/gestionnaire de familles, trois variantes, vue Three, hôte navigateur, analyse de site, panneau Studio.

## 2. Architecture retenue

```
données d’île (libraries.minigames) ──compile──▶ PlayableWorld.minigames
                                                     │ (seulement si non vide, ou ?minigames=demo)
main.ts ──import()──▶ minigames/game-host.ts ──▶ MiniGameManager ──registry.load('ball')──▶ ball/family.ts
   tick 30 Hz : host.tick(tick, dt, player, F, yaw)      │                               │
   draw       : host.render(alpha)                       ├─ LocalMiniGameAuthority      ├─ simulation.ts (BallWorld + push + variants)
                                                         ├─ session.ts / rules.ts        └─ loadView() ──import()──▶ ball/view.ts (Three)
```

| Fichier | Responsabilité |
|---|---|
| `src/minigames/catalog.ts` | données des familles et variantes (règles, éléments, paramètres physiques, critères de site) |
| `src/minigames/schema.ts` | contrat `MiniGameInstanceV1`, validation stricte, repère de zone, zones géographiques réservées |
| `src/minigames/layouts.ts` | gabarits prêts à l’emploi par variante |
| `src/minigames/session.ts` | **MiniGameSession** : joueurs, équipes, statut, scores, tentatives, manches, chrono en ticks, résultats, événements numérotés |
| `src/minigames/rules.ts` | **MiniGameRules** : prédicats composables (`scoreTarget`, `timeLimit`, `attempts`, `allFinished`, `rounds`) |
| `src/minigames/authority.ts` | intentions horodatées + autorité locale (ordre déterministe, rejet des rejoués/périmés) |
| `src/minigames/registry.ts` | **MiniGameRegistry** : famille → `import()` statiquement analysable, vol unique |
| `src/minigames/manager.ts` | **MiniGameManager** : découverte, cycle de vie, isolement des erreurs, nettoyage |
| `src/minigames/types.ts` | contrats famille/simulation/vue (types seuls, sans Three) |
| `src/minigames/ball/ball-physics.ts` | **BallPhysics** (`BallWorld`) |
| `src/minigames/ball/push.ts` | poussées hamster ↔ balle et lancers bornés |
| `src/minigames/ball/variants.ts` | règles propres au football, bowling, mini-golf (crochets, pas de physique) |
| `src/minigames/ball/simulation.ts` | assemblage commun d’une instance (monde, murs, obstacles, ordre des étapes) |
| `src/minigames/ball/view.ts` | rendu low-poly (chunk séparé) |
| `src/minigames/game-host.ts` | adaptateur navigateur (proximité, entrées, HUD, messages, événements de quête) |
| `src/minigames/sites.ts`, `demo.ts` | analyse/suggestion de terrain, démonstration opt-in |
| `src/studio/minigames-panel.ts`, `minigames-preview.ts`, `src/studio-core/minigame-authoring.ts` | Studio |

Pas de framework générique, pas d’ECS, pas de second bus : la spécialisation reste dans les modules de famille, le gestionnaire ne fait que coordonner.

## 3. Contrat de données (`libraries.minigames`, V3 facultatif)

```json
{"minigame:football-1":{"id":"minigame:football-1","version":1,"name":"Stade du port",
 "family":"ball","variant":"football","playersMin":2,"playersMax":6,
 "area":{"x":120,"z":-40,"heading":0.6,"halfWidth":9,"halfLength":14},
 "teams":[{"id":"blue","name":"Bleus","color":4161496},{"id":"red","name":"Rouges","color":14176319}],
 "rules":{"scoreTarget":3,"timeLimitSeconds":180,"practice":true},
 "elements":[{"id":"goal-blue","kind":"goal","x":0,"z":-14,"width":4,"depth":1,"height":1.6,"teamId":"blue"},
             {"id":"goal-red","kind":"goal","x":0,"z":14,"width":4,"depth":1,"height":1.6,"teamId":"red"},
             {"id":"ball","kind":"ball","x":0,"z":0}]}}
```

- Éléments exprimés **dans le repère de la zone** (x en travers, z le long de `heading`) : déplacer/tourner la zone déplace tout.
- Validation stricte (`validateMiniGame`) à la frontière Studio (`studio-core/schema.ts`), au monde compilé et à `parsePlayableWorld` : champs inconnus refusés, éléments requis par variante, équipes, limites de carte, 64 instances max.
- Compilation : la bibliothèque passe dans `compiled-logic` existant ; `playableFromCompiled` produit `minigames` **uniquement s’il y en a** ; les zones de jeu deviennent des `GeoZone` `'minigame'`. **Un projet sans mini-jeu compile exactement comme avant** (test `minigames-pipeline`).
- Plusieurs instances d’une même variante : identifiants stables `minigame:<variante>-<n>`, états totalement séparés.

## 4. Chargement conditionnel et cycle de vie

| État | Signification | Coût par tick |
|---|---|---|
| `UNLOADED` | rien d’instancié (le code de famille peut être en cache module) | 0 |
| `LOADING` | `import()` de la famille en cours | 0 |
| `READY` | simulation au repos + vue + colliders statiques (poteaux) | **0** (jamais pas à pas) |
| `ACTIVE` | session en cours | pas physique + règles |
| `SUSPENDED` | session figée (temps non compté) | 0 |
| `DISPOSED` / `FAILED` | détruit / désactivé après exception (isolé, réessayable) | 0 |

- `main.ts` n’importe `game-host.ts` que si l’île déclare des mini-jeux (ou `?minigames=demo`). Le chunk `family` n’est importé qu’à l’approche (45 m au-delà du rayon de zone), la vue (`view.ts`, Three) dans un chunk séparé ; libération à 80 m (hystérésis), toutes les 15 ticks seulement.
- Libération : simulation détruite, colliders retirés de `WorldCollisionQuery`, commandes oubliées, vue retirée ; géométries/matériaux **partagés** des balles et quilles conservés (quelques Ko) ; le code JS importé reste dans le cache du navigateur (non déchargeable, assumé).
- Changement d’île = navigation de page (`location.assign`, cf. `archipelago`) : tout est libéré par le navigateur ; `dispose()` existe pour les tests et un futur changement sans rechargement.

## 5. Sessions, règles, événements

- Session pure, JSON, sans horloge murale ni hasard ; chaque mutation émet un événement `{type, sessionId, tick, seq}` : `game:start`, `game:finish`, `game:reset`, `game:abandon`, `player:join`, `player:leave`, `ball:hit`, `ball:out`, `target:hit`, `checkpoint:passed` (réservé), `score:changed`.
- Ces événements sont **retournés** (comme `advanceRace`) ; seul `game:finish` est relayé au registre existant sous `minigame.finished` (`targetId` = instance, `source` = variante ou `variante:won`, `measuredSeconds`).
- Règles par variante (catalogue) : football `scoreTarget`+`timeLimit` ; bowling `rounds` (tentatives par manche, manches par joueur, tour par tour) ; mini-golf `allFinished`+`timeLimit` (coups max, pénalité de sortie). Égalité d’équipes = pas de vainqueur.
- Entraînement solo (`rules.practice`) : permet de démarrer sous `playersMin` dans le jeu solo actuel.

## 6. Physique simplifiée (`BallWorld`)

- SoA `Float64Array`, capacité ≤ 32, **aucune allocation dans `step`** (≈ 35–85 o/tick mesurés en régime permanent, bruit V8 compris).
- Sol : relief partagé (pont/route de course inclus), normale par différences centrées, gravité `MOTION.gravity`, résistance au roulement `rolling × frottement matériau × g × 0,15`, rebond si vitesse d’impact > 0,9 m/s.
- Obstacles : boîtes orientées (murs, obstacles, cadres de but) + colliders statiques partagés via `solidsNear` copiés une fois par pas dans un pool.
- Balle/balle : impulsions avec restitution min., séparation au prorata des masses inverses, réveil.
- Sous-pas : `n = ceil(vmax·dt / (r/2))`, borné à 8 ; anti-traversée garantie jusqu’à `8 · r/2 · 30` m/s (golf r = 0,12 → 14,4 m/s ; lancer max 9 m/s) pour des parois ≥ 0,2 m (test). Vitesse bornée à 30 m/s.
- Sommeil : au sol et < 0,06 m/s pendant 12 ticks ; un monde endormi coûte ~0,2 µs/tick.
- Eau : drapeau `inWater` + flottaison ; les variantes en font une sortie.
- Poussée hamster (`push.ts`) : séparation **de la balle seulement**, transfert `approche·(1+e)·m_h/(m_h+m_b)`, vitesse normale plafonnée (marche 5,5 m/s, roulade 13 m/s), Δv ≤ 8 m/s par acteur et par tick ; plusieurs hamsters s’additionnent (test grosse balle). Lancer volontaire (tir, boule, putt) borné, portée 1,1 m.
- Déterminisme : mêmes commandes → instantanés identiques bit à bit (tests).
- **Pas de Rapier/Cannon/Ammo** : 16 balles actives ≈ 16–20 µs/tick (p50) en Node, aucun besoin mesuré.
- Projectiles (pommes de pin, palets, ricochets) : réutilisables via `BallWorld` ; une trajectoire analytique reste préférable quand aucun contact n’est nécessaire (non implémenté).

## 7. Trois démonstrations

| Jeu | Éléments | Spécificités (dans `variants.ts`) |
|---|---|---|
| Football | 2 buts d’équipe, 1 balle, points de départ | contact + tir chargé, but = franchissement de ligne entre poteaux sous la barre, remise au centre, sortie → remise en jeu |
| Bowling | départ, 1–10 quilles | lancer chargé visé dans ±0,3 rad, quilles = sphères dormantes réveillées par contact, comptées à 10 cm de déplacement, retirées entre lancers, relevées à chaque manche, tour par tour |
| Mini-golf | départ, trou, 0–24 obstacles, murs | une balle par joueur, putt dosé, trou si < 3,2 m/s à 22 cm, sortie/eau → +1 coup et retour au dernier repos, coups max |

En jeu : approcher, **F** pour commencer, **maintenir F puis relâcher** pour tirer/lancer/putter dans la direction de la caméra ; s’éloigner de 25 m abandonne. Démo : `?minigames=demo` (sites cherchés autour du départ : pente, eau, troncs, colliders).

## 8. Studio

Module **Logique › Mini-jeux** : famille/variante, « Créer au centre de la vue » ou « Trouver un terrain adapté près de la vue » (`suggestMiniGameSites`), nom, joueurs, entraînement solo, orientation, dimensions (disposition remise à l’échelle), règles, équipes, coordonnées des éléments, ajout/retrait d’obstacles, « Analyser le terrain » (pente, eau, occupation), « Voir », « Déplacer au centre de la vue », « Disposition par défaut », « Supprimer ». Chaque modification = **une transaction** du `CommandBus` (Undo/Redo, sauvegarde, archive ZIP). L’aperçu 3D réutilise **la même simulation et la même vue** que le jeu (`setOverlay`). « Jouer ici » compile et charge les mini-jeux du brouillon.

Point d’intégration composition : `suggestMiniGameSites(variante, requêtes, {anchors, bounds, avoid})` (football près des villages sur terrain plat, mini-golf sur relief modéré). Le compositeur ne l’appelle **pas encore** (TODO) ; aucune génération de terrain n’a été ajoutée.

## 9. Contrats multijoueurs (préparés, non activés)

- Identifiants stables : instance (`minigame:*`), session (`<instance>:s<n>`), joueur (`[a-zA-Z0-9:_-]{1,64}`).
- Commandes `{instanceId, playerId, tick, seq, type…}` (`join`, `leave`, `start`, `abandon`, `reset`, `launch{yaw,power}`) ; ordre `(tick, joueur, seq)` ; rejouées et > 90 ticks de retard rejetées.
- L’autorité vérifie portée, tour, visée, coups restants : le client **n’envoie jamais** de position de balle ni de résultat.
- États sérialisables : `manager.snapshot(id)` / `restore()` (session + simulation) ; reprise après coupure ; `leave` d’un dernier joueur ⇒ abandon (déconnexion).
- Physique et règles sans rendu ni temps mural ⇒ exécutables par un futur serveur autoritaire ; `LocalMiniGameAuthority` est l’adaptateur local. **Non implémenté** : transport, prédiction/réconciliation, acteurs distants.

## 10. Mesures (référence `main` = `accdcc8`, même machine, Node 22.23, Chromium SwiftShader)

**Bundle** (`node tools/report-bundle.mjs dist <main>/dist`, octets bruts minifiés) :

| | main | branche | Δ |
|---|---|---|---|
| JS initial du jeu (fermeture statique d’`index.html`) | 1 461 011 | 1 462 456 | **+1 445** (+590 gzip) : crochets `main.ts`, `solidsNear`, extraction du helper de préchargement Vite |
| JS initial du Studio | 1 051 327 | 1 058 287 | +6 960 (validateur + catalogue, ~5,9 Ko) |
| Chunks paresseux mini-jeux | — | `game-host` 16,6 Ko · `family` 21,4 Ko · `view` 4,3 Ko · `demo` 3,2 Ko | jamais chargés sur une île sans mini-jeu |

**CPU Node** (`npm run bench:minigames`, p50/p95/p99 µs par tick 30 Hz, une exécution) :

| Scénario | p50 | p95 | p99 |
|---|---|---|---|
| 1 balle en mouvement | 1,5–1,8 | 4–6 | 9–16 |
| 4 balles | 2,7–4,2 | 6–9 | 13–30 |
| 8 balles | 5,3–8,9 | 11–14 | 34–47 |
| 16 balles | 15,6–20,3 | 30–35 | 85–114 |
| 16 balles endormies | 0,24 | 0,36 | 0,42 |
| gestionnaire sans instance | 0,39 | 0,57 | 0,93 |
| **10 activités READY (inactives)** | 0,28 | 0,47 | 0,83 — `stepped = 0` |
| 1 football actif + acteur qui dribble | 1,6 | 4,5 | 12,2 |

Allocations : 35–85 o/tick (8 balles, régime permanent). Cycles d’île (créer, charger 3, jouer 60 ticks, libérer) : 0,2–0,3 ms ; 0 collider orphelin ; tas sans croissance monotone sur 28 000 cycles. Joueur (`npm run bench:physics`, 2 passes chacun) : identique à `main` au bruit près (code inchangé).

**Navigateur** (`npm run bench:minigames:browser`, île officielle, même point, 15 s, SwiftShader ⇒ signal de régression seulement) :

| Scénario | chargement | frame p50/p95 (ms) | simulation p50/p95 (ms) | draw calls |
|---|---|---|---|---|
| base (sans paramètre) | 8,1 s | 133 / 200 | 0,4 / 2,8 | 114 |
| démo READY (2 terrains proches) | 8,7 s | 133 / 200 | 0,4 / 1,0 | 118 |
| démo, football actif | 8,9 s | 133 / 217 | 0,5 / 1,8 | 117 |

Résolution de `performance.now()` du navigateur : 0,1 ms. Temps de chargement : une seule mesure chacun (bruit de l’ordre de la différence). **Cibles 30/20 FPS non qualifiées sur GPU intégré.**

## 11. Tests

- Node (`npm test`) : `minigames-physics` (rebond, pente, roulement, matériau, impulsions, parois orientées, anti-traversée, colliders partagés, eau, poussées bornées/cumulées, déterminisme, sommeil), `minigames-core` (schéma, repère, session, règles, autorité, registre, chargement paresseux, READY sans calcul, isolement d’erreur, rechargement sans doublon, nettoyage), `minigames-variants` (but/score/fin, poussée, sortie, quilles/manches/fin, tours et visée imposés, putt/trou/pénalité, moteur commun, non-interférence, rejeu identique), `minigames-pipeline` (Studio → archive → compilation → monde jouable, zones réservées, projet sans mini-jeu inchangé, sites, événement de quête).
- Navigateur (`npm run test:minigames`, ajouté au workflow `checks`) : île sans mini-jeu = aucun chunk demandé ; démo = 3 activités, chunk `family` chargé à l’approche, F démarre, tir chargé, bowling (strike observé), coup de mini-golf compté, abandon en quittant, libération complète au loin, aucune erreur ; Studio = liste, édition de règle, Undo, création d’une seconde instance, sauvegarde, « Jouer ici » charge l’hôte.
- Régressions (21/11/2026, build complet `npm run build` + `verify-static-build` + fixtures de test, Chromium SwiftShader) : `npm test` **1157/1157** (1126 avant la branche + 31 nouveaux), `typecheck` OK, et 13 contrôles navigateur **tous verts** : `test:minigames`, `published`, `gameplay`, `hamster` (marche, roulade, saut), `swim`, `boats`, `climb`, courses Studio→jeu, `test:fishing`, `test:surf`, îles d’extension (ski chronométré, télésiège, semis), `studio`, `economy`. Le planeur est couvert par `bench:physics` et les tests Node existants, pas par un contrôle navigateur dédié dans cette campagne.

## 12. Ajouter un mini-jeu

1. **Variante de balle** (pétanque, course de balle…) : une entrée dans `MINIGAME_VARIANTS` (`catalog.ts` : règles, éléments, physique, site), un gabarit dans `layouts.ts`, un objet de crochets dans `ball/variants.ts` (but/tour/score uniquement), éventuellement un message dans `describe()` de `game-host.ts`, puis des tests. **Aucune physique à recopier.**
2. **Nouvelle famille** (cible, coopération…) : un module implémentant `MiniGameFamilyModule` (`createSimulation`, `loadView`) et une ligne dans `DEFAULT_LOADERS` (`registry.ts`) — chunk séparé automatiquement.
3. **Activité déjà existante** (course, pêche, musique) : ne pas migrer ; la relier par un événement du registre `gameplay/events.ts` ou un adaptateur léger.

## 13. Limitations connues

- Quilles = sphères ; la chute est une animation de présentation. Les balles ne tournent pas visuellement.
- Seuls les poteaux de but bloquent le joueur (AABB) ; filets et murets bas sont franchissables par le hamster (marche 0,45 m).
- Balles en extérieur uniquement (pas dans les espaces de mine) ; pas de vent ni de courant sur les balles.
- Solo : un seul joueur local, pas d’IA adverse ; les parties à plusieurs sont testées par commandes (Node).
- Charge comptée en ticks de simulation (correct et déterministe ; plus lente que l’horloge si la simulation ralentit) ; visée = direction caméra.
- Édition des éléments par champs numériques (pas de gizmo 3D) ; analyse de terrain du Studio fondée sur l’occupation, pas sur les arbres générés (inutile pour les zones auteur, réservées sans arbres).
- Compositeur de mondes non branché à `suggestMiniGameSites`.
- `dispose()` non appelé sur `pagehide` (changement d’île = rechargement de page).
- Mesures : SwiftShader et Node seulement ; aucune qualification GPU.

## 14. Roadmap

| ID | Élément | Statut |
|---|---|---|
| MG-0 | Audit, inventaire REUSE/ADAPT/MERGE/NEW | IMPLEMENTED |
| MG-1 | Schéma `libraries.minigames`, catalogue, gabarits, validation | TESTED |
| MG-2 | Session, règles composables, événements, `minigame.finished` | TESTED |
| MG-3 | Registre à imports dynamiques, gestionnaire, cycle de vie, isolement | TESTED (Node + navigateur) |
| MG-4 | `BallWorld`, poussée hamster, lancers bornés | TESTED |
| MG-5 | Football, bowling, mini-golf | TESTED (Node + navigateur SwiftShader) |
| MG-6 | Pipeline compilé, zones réservées, intégration `main.ts`, démo | TESTED |
| MG-7 | Studio Mini-jeux, aperçu, « Jouer ici » | TESTED (navigateur) |
| MG-8 | Contrats multijoueurs, autorité locale, instantanés | IMPLEMENTED (pas de transport) |
| MG-9 | Bancs CPU/mémoire/bundle/navigateur | IMPLEMENTED (mesures SwiftShader) |
| MG-10 | Qualification 30/20 FPS sur GPU intégré de référence | TODO |
| MG-11 | Branchement du compositeur (`suggestMiniGameSites`) | TODO |
| MG-12 | Familles Cible (lancer, ricochets, chamboule-tout) via `BallWorld` | TODO |
| MG-13 | Adaptateur courses → gestionnaire (sans migrer `races.ts`) | TODO |
| MG-14 | Gizmo 3D des éléments dans le Studio | TODO |
| MG-15 | Serveur autoritaire et réplication | BLOCKED (jalon multijoueur non approuvé, AGENTS §1 quater) |
