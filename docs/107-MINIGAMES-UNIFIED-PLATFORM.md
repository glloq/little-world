# 107 — Mini-jeux : architecture unifiée, mutualisation et optimisation

Branche de travail : `feat/minigames-unified-platform`. Le premier lot a été fusionné par la PR #110 (`main` = `2603dd4`). Le second lot (audit, stabilisation, famille `target`, Studio 3D, composition) est sur la même branche, **non fusionné**.
Statuts : **TODO / IN_PROGRESS / IMPLEMENTED / TESTED / QUALIFIED / BLOCKED**. Rien n’est `QUALIFIED` : aucune mesure n’a été faite sur un GPU intégré réel.

## 0. Résumé

- **Un moteur** (`BallWorld`), **une** session, **un** cycle de vie et **un** format de données servent **deux familles** chargées à la demande :
  - `ball` : football, bowling, mini-golf ;
  - `target` : chamboule-tout, tir sur cible.
- Une famille apporte **une table de règles**, pas de moteur. Ajouter `target` n’a demandé **aucune modification** de `MiniGameManager`, `MiniGameSession` ni de l’autorité (§12).
- Les mini-jeux sont **déclarés par île** (`libraries.minigames`, facultatif) :
  - une île sans mini-jeu ne télécharge aucun de leurs modules (vérifié en navigateur) ;
  - une activité inactive ne simule rien (vérifié par test et banc).
- `simulatePlayer` n’est **pas modifié**. Les balles réagissent au corps du hamster (aller simple), sur la **même** boucle fixe 30 Hz.
- Studio :
  - module « Mini-jeux » : création, règles, analyse de terrain, aperçu, « Jouer ici » ;
  - **sélection 3D et gizmo de déplacement** des zones et de leurs éléments, par le système de sélection universel existant ;
  - cases à cocher dans l’écran de création d’île.
- Composition : option facultative `activities.minigames`, qui place chaque variante sur un terrain **naturellement** adapté.
- Multijoueur : contrats prêts (commandes par tick, ordre déterministe, instantanés reprenables) ; **aucun serveur** (AGENTS §1 quater).

## 1. Audit initial (lot 1)

| Système | Emplacement | Classe | Décision |
|---|---|---|---|
| Requêtes de collision | `src/physics/collision-world.ts` | REUSE + ADAPT | relief et matériaux partagés ; `solidsNear()` = lecture publique de la broadphase existante |
| Contrôleur joueur | `src/player.ts` | REUSE | inchangé ; un instantané `MiniGameActor` est lu après chaque pas |
| Constantes de mouvement | `src/physics/motion.ts` | REUSE | `MOTION.gravity`, `MOTION.walk`, `SURFACE_MOTION` |
| Horloge fixe | `frame-clock.ts`, `tick()` de `main.ts` | REUSE | un appel `minigameHost.tick()` par pas ; aucune boucle RAF ajoutée |
| Courses | `gameplay/races.ts` | REUSE (non migré) | patron repris par `session.ts` |
| Records de course | `gameplay/race-records.ts` | **MERGE (lot 2)** | mécanisme générique de record personnel partagé avec les mini-jeux |
| Activités mines/champs | `gameplay/activity-runtime.ts` | REUSE (patron) | séparation intention/autorité |
| Registre d’événements | `gameplay/events.ts` | ADAPT | + `minigame.finished` |
| Zones géographiques | `geography/engine.ts` | ADAPT | `GeoZone` `'minigame'` (sol réservé, pas d’arbres) |
| Sélection Studio | `studio-core/elements.ts`, `viewport/select-tool.ts` | **ADAPT (lot 2)** | sortes `minigame` et `minigameElement` |
| Pêche, musique, cueillette, surf, ski | divers | REUSE (non migré) | reliés par `gameplay/events.ts` |

Doublons hors périmètre, non modifiés : tests point-dans-polygone répétés dans plusieurs modules, et `main.ts` monolithique (~2 200 lignes). Les mini-jeux n’y ajoutent qu’un objet hôte et quatre points d’accroche.

## 1 bis. Audit du lot 2 (21/11/2026, code de `2603dd4`)

### Écarts entre spécification, code, tests et qualification

| Élément | Spécifié | Implémenté | Testé (preuve) | Qualifié | Correction faite / restante |
|---|---|---|---|---|---|
| `BallWorld` | oui | oui | Node : `minigames-physics`, `minigames-physics-limits` | non (SwiftShader seul) | 6 défauts corrigés (§6) |
| Poussée hamster | oui | oui | Node | non | traversée de mur corrigée, palier « course » ajouté |
| Gestionnaire et cycle de vie | oui | oui | Node : `minigames-core`, `minigames-lifecycle` ; navigateur | non | courses asynchrones vérifiées (pas de défaut) ; `restore(atTick)` ajouté |
| Session, règles | oui | oui | Node | — | `completeTurn` mutualisé (bowling + cibles) |
| Autorité locale | oui | oui | Node | — | ordre `(tick, joueur, seq)` documenté et testé |
| Football, bowling, mini-golf | oui | oui | Node + navigateur | non | trou : vitesse de capture selon le centrage |
| 2e famille | demandée | **oui (`target`)** | Node + navigateur | non | ricochets : TODO (§13) |
| Mutualisation des activités | demandée | records personnels | Node | — | courses/pêche/surf/ski non migrés (aucun gain mesurable) |
| Studio, manipulation 3D | demandée | oui | Node + navigateur (clic 3D, inspecteur, Undo) | — | glisser le gizmo à la souris : non automatisé (même code que les autres éléments) |
| Studio, validation de terrain | demandée | pente, eau, obstacles, accès, superposition, dimensions | Node | — | occupation `'none'` lue à tort comme obstacle : **corrigé** |
| Composition | demandée | option facultative | Node, île réelle composée | — | — |
| Bundle et ressources | demandés | mesurés (§10) | navigateur + Node | — | site search sorti du cœur Studio |

### Classement des composants

| Composant | Classe | Raison |
|---|---|---|
| `manager.ts`, `registry.ts`, `authority.ts`, `rules.ts` | KEEP | corrects (scénarios asynchrones vérifiés), aucune complexité inutile |
| `session.ts` | IMPROVE | `completeTurn` ; `snapshotSession` inutilisé supprimé |
| `ball-physics.ts`, `push.ts` | IMPROVE | défauts des cas limites (§6) |
| `ball/variants.ts` | REFACTOR | contrat et utilitaires sortis dans `ball/kit.ts` (pour la 2e famille) ; libellés HUD rapatriés depuis l’hôte |
| `ball/simulation.ts` | REFACTOR | reçoit la table de règles de la famille (au lieu d’importer celle du ballon) |
| `ball/view.ts` | REFACTOR | piloté par `catalog.visual` au lieu de tests sur les noms de variantes |
| `game-host.ts` | IMPROVE | messages délégués à la variante, abandon en changeant d’activité, temps non reçu non compté, records |
| `MiniGameSimulation.idle` | REMOVE | jamais lu |
| `gameplay/race-records.ts` | MERGE | un seul mécanisme de record personnel |
| 2e famille, manipulation 3D, composition | MISSING → ajoutés | §7, §8, §8 bis |

## 2. Architecture retenue

```
données d’île (libraries.minigames) ──compile──▶ PlayableWorld.minigames
                                                     │ (seulement si non vide, ou ?minigames=demo)
main.ts ──import()──▶ minigames/game-host.ts ──▶ MiniGameManager ──registry.load(famille)──▶ ball/family.ts | target/family.ts
   tick 30 Hz : host.tick(tick, dt, player, F, yaw)      │                                    └─ createBallSimulation(def, env, TABLE_DE_RÈGLES)
   draw       : host.render(alpha)                       ├─ LocalMiniGameAuthority                 ├─ BallWorld + push (partagés)
                                                         ├─ session.ts / rules.ts                  └─ loadView() ──▶ ball/view.ts (Three, chunk séparé)
```

| Fichier | Responsabilité |
|---|---|
| `minigames/catalog.ts` | familles, variantes, règles, éléments autorisés, physique, `visual`, critères de site |
| `minigames/schema.ts` | `MiniGameInstanceV1`, validation stricte, repère de zone, `minigameGeoZones` |
| `minigames/layouts.ts` | gabarits par variante |
| `minigames/session.ts` / `rules.ts` | session pure (joueurs, équipes, scores, tours, chrono en ticks, événements numérotés) / prédicats composables |
| `minigames/authority.ts` | intentions horodatées, autorité locale |
| `minigames/registry.ts` / `manager.ts` | chargement paresseux par famille / cycle de vie et isolement des erreurs |
| `minigames/types.ts` | contrats famille/simulation/vue (types seuls) |
| `minigames/ball/ball-physics.ts`, `push.ts` | moteur et interactions bornées (partagés par toutes les familles à balles) |
| `minigames/ball/kit.ts` | contrat `BallVariantLogic` et utilitaires communs aux familles |
| `minigames/ball/simulation.ts` | assemblage d’une instance (monde, murs, obstacles, ordre des étapes) |
| `minigames/ball/variants.ts` | règles football / bowling / mini-golf |
| `minigames/target/variants.ts`, `family.ts` | règles chamboule-tout / tir sur cible |
| `minigames/ball/view.ts` | rendu low-poly partagé |
| `minigames/records.ts` | records personnels (mécanisme de `race-records.ts`) |
| `minigames/game-host.ts` | adaptateur navigateur |
| `minigames/sites.ts`, `demo.ts` | analyse et suggestion de terrain, démo opt-in |
| `studio-core/minigame-authoring.ts` | écriture validée (`putMiniGame`…) |
| `studio-core/minigame-elements.ts` | mini-jeux comme éléments Studio universels |
| `studio-core/minigame-composition.ts` | requêtes de terrain du projet, placement par le compositeur |
| `studio/minigames-panel.ts`, `minigames-preview.ts` | module Studio et aperçu |

### API publiques principales

- `createMiniGameManager(defs, {env, registry?, authority?, colliders?, onError?})` renvoie un objet exposant :
  - `prepare(id)` et `release(id)` ;
  - `proximity(x, z)` ;
  - `submit(cmd)` et `tick(tick, dt, actors)`, ce dernier renvoyant `{events, refusals, stepped}` ;
  - `suspend` / `resume` ;
  - `snapshot(id)` / `restore(id, snap, atTick?)` ;
  - `subscribe` et `dispose`.
- `createMiniGameHost(options)` renvoie `tick`, `capturesAction`, `render`, `stats`, `debug` et `dispose`.
- Famille : `MiniGameFamilyModule {family, createSimulation(def, env), loadView()}`.
- Variante d’une famille à balles : `BallVariantLogic` dans `ball/kit.ts`, avec les crochets `capacity`, `initial`, `parseState`, `setup`, `reset`, `launch`, `afterStep`, `hint`, et les crochets facultatifs `describe`, `pushable` et `touched`.
- Studio : `putMiniGame`, `removeMiniGame`, `createMiniGame` et `resetMiniGameLayout` ; `projectSiteQueries` et `composeMiniGames` ; `inspectMiniGame(def, q, {others})`, `suggestMiniGameSites` et `areasOverlap`.

## 3. Contrat de données (`libraries.minigames`, V3 facultatif)

```json
{"minigame:cans-1":{"id":"minigame:cans-1","version":1,"name":"Chamboule-tout 1",
 "family":"target","variant":"cans","playersMin":1,"playersMax":4,
 "area":{"x":120,"z":-40,"heading":0.6,"halfWidth":1.5,"halfLength":5},
 "rules":{"attempts":3,"rounds":3,"practice":true},
 "elements":[{"id":"tee","kind":"tee","x":0,"z":-4.2},
             {"id":"table","kind":"obstacle","x":0,"z":3.5,"width":1.6,"depth":0.5,"height":0.8},
             {"id":"can-1","kind":"target","x":-0.25,"z":3.5,"height":0.92}]}}
```

- Éléments dans le **repère de la zone** : x en travers, z le long de `heading`.
  - Pour une cible, `height` est l’élévation de son centre.
  - Sortes d’éléments : `goal`, `pin`, `tee`, `hole`, `obstacle`, `spawn`, `ball`, `target`.
- Validation stricte (`validateMiniGame`) au Studio, au monde compilé et dans `parsePlayableWorld`. Elle contrôle les familles et variantes, les nombres d’éléments par sorte, les équipes, les limites de carte, et refuse les champs inconnus ; 64 instances au maximum.
- Les zones deviennent des `GeoZone` `'minigame'` : sol réservé, sans arbres générés. **Un projet sans mini-jeu compile exactement comme avant** (test).
- Sauvegardes : les parties sont éphémères (minutes) et **ne sont pas** écrites dans les emplacements de sauvegarde. Les résultats persistent par les quêtes (`minigame.finished`) et par les records personnels (`localStorage`, clé liée au tracé). Aucune migration de sauvegarde n’est nécessaire.

## 4. Chargement conditionnel et cycle de vie

| État | Signification | Coût par tick |
|---|---|---|
| `UNLOADED` | rien d’instancié (le code de la famille peut rester en cache module) | 0 |
| `LOADING` | `import()` en cours ; `release` ou `dispose` pendant le chargement = rien ne sera créé | 0 |
| `READY` | simulation au repos, vue, colliders statiques | **0** |
| `ACTIVE` | session en cours | pas physique + règles |
| `SUSPENDED` | session figée (temps non compté) | 0 |
| `DISPOSED` / `FAILED` | détruit / exception isolée, nouvelle tentative possible | 0 |

- Proximité : chargement 45 m au-delà du rayon de la zone, libération à 80 m, contrôle toutes les 15 ticks.
- Le chargement est unique par famille : trois instances simultanées déclenchent un seul `import()` (test).
- Libération : simulation, vue, colliders et commandes en attente sont libérés ; les géométries et matériaux partagés sont conservés.
- Changement d’île = navigation de page. `dispose()` est testé pour un changement sans rechargement : 0 collider orphelin, 0 listener, aucune croissance monotone du tas.
- Vérifié par les tests :
  - sortir de la zone puis revenir 3 fois : une seule vue, colliders créés une fois ;
  - 200 sessions de suite : aucune commande en attente, aucune partie active.

## 5. Sessions, règles, commandes

- Session pure, JSON, sans horloge murale ni hasard. Chaque mutation émet `{type, sessionId, tick, seq}` exactement une fois (tests).
- Événements :
  - `game:start`, `game:finish`, `game:reset`, `game:abandon` ;
  - `player:join`, `player:leave` ;
  - `ball:hit`, `ball:out`, `target:hit`, `score:changed`.
- `completeTurn` : fin de tour commune au bowling et aux familles de cibles (tentatives remises à zéro, manche comptée, tour suivant).
- Égalité d’équipes = pas de vainqueur ; égalité individuelle = victoire partagée. Après la fin, un tir est refusé et une nouvelle inscription ouvre une **nouvelle** session (`<id>:s<n>`).
- Hôte :
  - le temps où l’hôte n’est pas appelé (télésiège) n’est pas compté dans le chrono ;
  - entrer dans **une autre** activité abandonne la partie en cours, ainsi F agit toujours sur l’activité où l’on se trouve ;
  - l’appui sur F qui démarre une partie ne déclenche jamais de tir.
- Commandes : `join`, `leave`, `start`, `abandon`, `reset`, `launch{yaw, power}`.
  - Ordre de traitement : tick, puis joueur, puis `seq`.
  - Un `seq` inférieur ou égal au dernier reçu pour ce joueur et cette instance est refusé ; le client envoie dans l’ordre.
  - Plus de 90 ticks de retard : refusé.
  - Une commande pour une instance libérée est refusée.

## 6. Physique (`BallWorld`)

- Données en SoA `Float64Array`, capacité ≤ 32 balles.
- Sol : relief partagé avec le joueur, gravité `MOTION.gravity`, résistance au roulement liée au matériau.
- Une **sphère qui roule** prend 5/7 g sinθ en pente.
- Rebonds avec restitution, boîtes orientées, colliders partagés **sans plafond**, impulsions sphère/sphère, eau, mise en sommeil.

**Défauts trouvés par les tests de cas limites et corrigés :**

| Défaut | Correction |
|---|---|
| le hamster pouvait **téléporter la balle à travers un mur fin** (correction de position au contact) | séparation par vitesse bornée et proportionnée aux masses : la balle garde les collisions balayées du monde |
| 256 colliders partagés au maximum, **coupés silencieusement** | plus de plafond ; nombre exposé dans `sharedCount` |
| deux balles exactement superposées ne se séparaient jamais | axe de séparation déterministe par paire |
| un relief qui renvoie NaN propageait NaN | pas de contact sur relief invalide ; un état non fini revient à la dernière position valide (compté dans `recovered`) |
| accélération g sinθ en descente (trop forte) | 5/7 g sinθ |
| anti-traversée limité à 8 sous-pas | 16 sous-pas, puis vitesse plafonnée à r/2 par sous-pas, ce qui tient pour tous les rayons jusqu’à 30 m/s (test) |
| poussée identique en marchant et en courant | paliers marche 5,5 m/s < course 8 m/s (au-delà de `MOTION.walk`) < roulade 13 m/s ; Δv ≤ 12 m/s par tick |

Cas couverts par des tests : balle immobile, pente faible et forte, rebonds décroissants, murs fins, obstacles orientés, coins, plusieurs obstacles à la fois, balles superposées, masses différentes, balle endormie réveillée, eau, sortie de terrain, grande vitesse, absence de gain d’énergie (16 balles pendant 60 s), NaN. Côté poussée : contact latéral, pendant un saut et par-dessus, plusieurs pousseurs, balle lourde, balle poussée contre un mur. Pas de Rapier, Cannon ni Ammo : aucun besoin mesuré.

## 7. Familles et variantes opérationnelles

| Famille | Variante | Règles | Spécificités |
|---|---|---|---|
| `ball` | football | `scoreTarget`, `timeLimit` | contact et tir chargé, but entre les poteaux sous la barre, remise au centre, sortie → remise en jeu |
| `ball` | bowling | `rounds` | lancer visé (±0,3 rad), quilles = sphères dormantes, retirées entre deux lancers et relevées à chaque manche |
| `ball` | mini-golf | `allFinished`, `timeLimit` | putt dosé, **capture à 0,9 m/s au bord et 2,6 m/s au centre**, sortie ou eau → +1 coup |
| `target` | chamboule-tout | `rounds` | 3 balles par manche, pyramide 3-2-1 sur une table ; une boîte soutenue se réveille quand ce qui la porte bouge |
| `target` | tir sur cible | `rounds` | anneaux de 5 à 1 point selon la distance au centre ; la balle reste collée à la cible |

En jeu : approcher, **F** pour commencer, **maintenir F puis relâcher** pour tirer dans la direction de la caméra. Le record personnel est affiché avant la partie. Démo : `?minigames=demo` (5 activités).

## 8. Studio

- Module **Logique › Mini-jeux** :
  - choix de la famille, puis de la variante (liste filtrée) ;
  - création au centre de la vue, ou sur un terrain adapté trouvé automatiquement ;
  - joueurs, équipes, règles, éléments, obstacles, disposition par défaut ;
  - « Analyser le terrain » : pente, eau, obstacles existants, **accès à pied**, **superposition** avec d’autres activités ; les dimensions minimales sont imposées par le schéma.
- **Manipulation 3D** (lot 2), par le système existant, sans second système :
  - un clic sélectionne la zone ou l’un de ses éléments (but, quille, cible, obstacle, départ, trou, balle) ;
  - le gizmo de déplacement (`W`) déplace en une transaction ; l’élément suit le gizmo dans le repère tourné de la zone ;
  - Supprimer, Dupliquer, liste d’auteur et inspecteur fonctionnent comme pour les autres éléments ;
  - l’inspecteur donne les valeurs précises (orientation, largeur et rotation d’un obstacle, hauteur d’une cible) ;
  - toute écriture passe par `putMiniGame` (même validation) ; supprimer un élément obligatoire est refusé.
- Aperçu : même simulation et même vue que le jeu. « Jouer ici » charge les mini-jeux du brouillon.

## 8 bis. Composition des îles

- `generation.activities.minigames`, facultatif, V5, au plus 8 variantes distinctes.
- L’étape « activités » existante place une instance par variante :
  - autour des villages si `site.nearSettlement`, sinon autour du centre de l’île ;
  - **après** les villages, courses et pistes, pour les éviter.
- Les critères sont ceux du Studio (`projectSiteQueries`, `inspectArea`). Le relief n’est **jamais** modifié.
- Une variante sans terrain adapté produit un `WARNING`, jamais un blocage. Sans l’option, le monde composé est inchangé (test).

## 9. Préparation multijoueur

- Identifiants stables : instance, session, joueur.
- Commandes par tick dans un ordre déterministe ; l’autorité vérifie portée, tour, visée et coups restants.
- `snapshot` / `restore(atTick)` reprend une partie sur une autre autorité ou une autre base de ticks, à l’identique (test).
- Départ du dernier joueur = abandon (déconnexion).
- **Non implémenté** : transport, prédiction et réconciliation, acteurs distants dans le jeu.

## 10. Mesures

Même machine, Node 22.23, Chromium SwiftShader. Références :
- `accdcc8` : `main` avant tout mini-jeu ;
- `2603dd4` : `main` après la PR #110 (lot 1) ;
- branche : lot 2.

**Bundle** (`node tools/report-bundle.mjs dist <ref>/dist`, octets bruts minifiés) :

| | `accdcc8` | `2603dd4` | branche (lot 2) |
|---|---|---|---|
| JS initial du jeu | 1 461 011 | 1 463 754 | **1 464 149** (+395 o vs lot 1 ; +3,1 Ko vs avant les mini-jeux) |
| JS initial du Studio | 1 051 327 | 1 060 688 | **1 070 721** (+10,0 Ko vs lot 1 : éléments Studio, libellés, gabarits ; la recherche de site est sortie du cœur) |
| Chunks à la demande | — | `game-host` 16,6 Ko · `family` 21,4 Ko · `view` 4,3 Ko | `game-host` 13,2 Ko · famille `ball` 8,9 Ko · famille `target` 5,9 Ko · moteur et vue partagés en chunks communs · panneau Studio 7,6 Ko |

Une île sans mini-jeu ne demande **aucun** de ces chunks (contrôle navigateur).

**CPU Node** (`npm run bench:minigames`, médiane de 3 passes, p50/p95 en µs par tick 30 Hz, avec / sans obstacles) :

| Balles | lot 1 (`2603dd4`) | lot 2 |
|---|---|---|
| 1 | 1,6/5,3 · 1,2/2,4 | 1,9/5,6 · 1,3/1,9 |
| 4 | 2,6/6,2 · 2,1/3,1 | 2,6/6,2 · 2,2/3,2 |
| 8 | 5,4/11,7 · 5,2/8,0 | 5,4/11,7 · 4,7/8,3 |
| 16 | 11,8/21,0 · 13,4/17,7 | 11,9/21,5 · 11,0/16,9 |
| 32 | 34,1/57,8 · 33,0/48,6 | 26,1/46,6 · 33,8/48,9 |
| 32 endormies | 0,38 | 0,37 |
| 10 activités READY | 0,28 — `stepped = 0` | 0,28 — `stepped = 0` |
| 1 football actif + dribble | 1,65/2,53 | 1,80/3,11 |

Les corrections de physique n’ont pas de coût mesurable : les écarts sont du même ordre que la variance entre passes (environ ±30 %). Pire cas, 32 balles en mouvement : moins de 0,2 % d’un tick de 33 ms.

- Allocations en régime permanent (8 balles) : 69 à 362 o/tick selon la passe, contre 69 à 275 au lot 1. C’est du bruit de mesure du tas V8.
- Cycles d’île : 0,3 ms, 0 collider orphelin. Le tas oscille sans croissance monotone sur 28 000 cycles (lot 1, reconduit).
- Joueur (`npm run bench:physics`, médiane de 3 passes, p50 en µs) : relief 6,0 → 5,8 ; 400 obstacles 79,6 → 89,9 (p95 196 → 271, bruit) ; mine 5,3 → 5,4 ; roulade 6,5 → 6,6 ; planeur 5,7 → 5,9. **Code du joueur inchangé.**

**Navigateur** (`npm run bench:minigames:browser`, île officielle, même point, 15 s, SwiftShader : signal de régression seulement) :

| Scénario | chargement | frame p50/p95 (ms) | simulation p50/p95 (ms) | draw calls |
|---|---|---|---|---|
| base (sans paramètre) | 8,9 s | 117 / 200 | 0,4 / 0,9 | 114 |
| démo READY (4 activités proches chargées) | 7,8 s | 133 / 200 | 0,4 / 1,5 | 123 |
| démo, football actif | 7,9 s | 133 / 217 | 0,6 / 1,9 | 122 |

Les temps de frame sous SwiftShader sont dominés par le rendu logiciel. Les chargements sont mesurés une seule fois : le bruit est du même ordre que la différence. **Aucune cible FPS n’est qualifiée sur GPU intégré.**

## 11. Tests

- Node (`npm test`) : `minigames-physics`, `minigames-physics-limits`, `minigames-core`, `minigames-lifecycle`, `minigames-variants`, `minigames-target`, `minigames-pipeline`, `minigames-studio-elements`, `minigames-composition`, plus `race-records` (inchangé).
- Navigateur (`npm run test:minigames`, dans le workflow CI `checks`) :
  - île sans mini-jeu : aucun chunk ;
  - 5 activités de démo ;
  - modules de famille séparés ;
  - but, strike, putt, lancer au chamboule-tout ;
  - abandon et libération complète ;
  - Studio : liste, règle, Undo, **clic 3D, inspecteur, Undo**, nouvelle instance, « Jouer ici ».
- Régressions (21/11/2026, lot 2) :
  - build complet, `verify-static-build`, fixtures de test, Chromium SwiftShader ;
  - `npm test` **1193/1193**, `typecheck` OK ;
  - 19 contrôles navigateur exécutés : minigames, published, gameplay, hamster, swim, boats, climb, courses, fishing, surf, îles d’extension (ski, télésiège, semis), studio, economy, ui, sélection universelle, monde Studio, édition à l’inspecteur, voyage entre îles, local.
  - **18/19 verts au premier passage.** `hamster` a échoué une fois sur l’étape « Espace deux fois : planeur ». Relancé seul : 4/4. Il échoue aussi lorsqu’il tourne en même temps qu’un autre contrôle navigateur (2 sur 3). Le test enchaîne deux appuis à des instants d’horloge murale : il est sensible à la charge CPU. Ni le planeur ni les entrées ne sont modifiés par la branche. Risque résiduel : instabilité du test en CI chargée.

## 12. Guide : créer un nouveau mini-jeu

Exemple : **pétanque**, une variante de la famille `ball`.

1. **Catalogue** (`minigames/catalog.ts`) :
   - ajouter `'petanque'` à `MiniGameVariantId` ;
   - ajouter une entrée `MINIGAME_VARIANTS.petanque` : `family:'ball'`, `rules:['rounds']`, `requiredRules:['attempts','rounds']`, éléments autorisés (`tee:[1,1]`, `target:[1,1]` pour le cochonnet), physique (`ballRadius:.08`, `ballMass:.7`, `rolling:2`, `contactPush:false`, `command:'throw'`, `loft:5`), `visual` et `site`.
2. **Gabarit** (`minigames/layouts.ts`) : une fonction `petanque()` (zone, départ, cochonnet) ajoutée à `TEMPLATES`. Le compilateur signale toute entrée manquante.
3. **Règles** (`ball/variants.ts`) : un objet `BallVariantLogic`, en réutilisant les utilitaires de `ball/kit.ts`.
   - `setup` : boules et cochonnet ;
   - `launch` : `launchBall` et le contrôle du tour ;
   - `afterStep` : fin de lancer, et en fin de manche la boule la plus proche marque, puis `completeTurn` ;
   - `hint` et `describe`.
   - Aucune physique et aucune session à écrire.
4. **Studio** : rien à coder. La variante apparaît dans le module, l’écran de création et la sélection 3D. Ajouter un libellé d’élément seulement si la sorte est nouvelle.
5. **Tests** : un fichier `tests/minigames-petanque.test.mjs` qui pilote le gestionnaire comme `minigames-target`, puis « Analyser le terrain » et « Jouer ici » dans le Studio.

**Nouvelle famille** (ex. coopération) : un dossier avec `family.ts` qui implémente `MiniGameFamilyModule`, et une ligne dans `DEFAULT_LOADERS` (`registry.ts`). Elle obtient automatiquement un chunk séparé. Si elle utilise des balles, elle réutilise `createBallSimulation` avec sa propre table de règles, comme `target`.

## 13. Limitations connues

- Quilles et boîtes = sphères ; leur chute est une présentation. Les balles ne tournent pas visuellement.
- Pas de visée verticale : la portée d’un lancer dépend de la seule puissance (lancer en cloche, gravité arcade).
- Ricochets (famille `target`) : **TODO**. Il faut une règle de site « eau obligatoire » et un contact eau dédié.
- Seuls les poteaux de but bloquent le hamster. Les balles restent en extérieur (pas dans les mines) et ignorent vent et courant.
- Solo : un seul joueur local, pas d’IA adverse.
- Studio : la rotation des zones et des obstacles se fait par l’inspecteur (le gizmo des éléments non-entités ne fait que translater). Le glisser du gizmo n’est pas automatisé en navigateur ; le code de déplacement est testé en Node.
- Mesures : Node et SwiftShader seulement.

## 14. Roadmap

| ID | Élément | Statut |
|---|---|---|
| MG-0 | Audits (lot 1, lot 2) | IMPLEMENTED |
| MG-1 | Schéma, catalogue, gabarits | TESTED |
| MG-2 | Session, règles, événements, `minigame.finished`, `completeTurn` | TESTED |
| MG-3 | Registre, gestionnaire, cycle de vie, chargements asynchrones | TESTED (Node + navigateur) |
| MG-4 | `BallWorld`, poussée, cas limites | TESTED |
| MG-5 | Football, bowling, mini-golf | TESTED (Node + navigateur SwiftShader) |
| MG-6 | Pipeline compilé, zones réservées, intégration `main.ts`, démo | TESTED |
| MG-7 | Studio Mini-jeux, aperçu, « Jouer ici » | TESTED (navigateur) |
| MG-8 | Contrats multijoueurs, `restore(atTick)` | TESTED (sans transport) |
| MG-9 | Bancs CPU, mémoire, bundle, navigateur | IMPLEMENTED (Node + SwiftShader) |
| MG-10 | Qualification 30/20 FPS sur GPU intégré | TODO |
| MG-11 | Composition (`activities.minigames`) | TESTED |
| MG-12 | Famille `target` : chamboule-tout, tir sur cible | TESTED |
| MG-12b | Ricochets | TODO |
| MG-13 | Records personnels partagés avec les courses | TESTED |
| MG-14 | Sélection 3D, gizmo, inspecteur des éléments | TESTED (clic et inspecteur en navigateur ; glisser du gizmo en Node) |
| MG-15 | Serveur autoritaire, réplication | BLOCKED (jalon multijoueur non approuvé, AGENTS §1 quater) |
| MG-16 | Visée verticale des lancers | TODO |
