# 56 — Audit gameplay solo / multijoueur futur et feuille de route

**Date de référence : 16 novembre 2026.**  
**Nature : audit statique du code, des documents, des branches Git et des résultats CI connus ; aucune exécution locale des tests, aucun benchmark matériel effectués pour cet audit.**  
**Base examinée : `main` @ `b761b237f3d6a7f214affa66bac6e0ec66fbe960` (fusion de la PR #25, mouvements dynamiques).**  
**Branche non fusionnée principale : `feat/hybrid-distant-impostors`, cinq commits en avance sur cette base au dernier relevé (tête alors `0a06a59aa`).**  

## 0. Objectif et conventions

Répertorier ce qui existe **réellement**, ce qui peut être réutilisé et ce qui manque pour un Little World plaisant en solo et extensible au multijoueur : hamster rond, roulade, conservation de l'élan, saut, planeur, nage, escalade, interactions physiques simples, courses, fantômes, mini-jeux, coopération, magie utilitaire, événements et retours audiovisuels.

Ne pas confondre `décrit`, `présent dans le code`, `couvert par un test`, `qualifié en performance` et `déployé`. Une documentation historique de branche peut être périmée. Les constats « absent » signifient « aucun module/flux opérationnel identifié dans les sources examinées », non une preuve absolue sur tous les assets.

**Statuts :** `E` = existant dans `main` ; `P` = partiel / socle réutilisable ; `N` = à créer ; `B` = présent seulement sur une branche hors `main`.  
**Priorités :** `P0` = fondation du ressenti / contrat ; `P1` = première boucle fun ; `P2` = enrichissement ; `P3` = multijoueur effectif ou extensions.  
**Contraintes héritées :** solo PC/GitHub Pages sans serveur ; Three.js/TypeScript ; simulation à pas fixe 30 Hz, rendu visé 30 FPS avec secours 20 FPS ; pas de combat ni survie punitive ; carte auteur V3 séparée du monde compilé et des sauvegardes ; pas de JS arbitraire dans les cartes ; relief heightfield + volumes/structures 3D ; pas de fog de camouflage. Voir `AGENTS.md`, `docs/11-LOW-RESOURCE-POLICY.md`, `docs/12-PROJECT-SCOPE.md`, `docs/14-TECHNICAL-CHOICES.md`, `docs/15-STUDIO-DATA-SCHEMAS-V3.md`, `docs/16-FUTURE-MULTIPLAYER.md` et `docs/22-RESOURCE-BUDGET-MANAGER.md`.

## 1. État constaté dans main

| Domaine | État vérifiable | Fichiers principaux | Limite / travail restant |
| --- | --- | --- | --- |
| Horloge | E — `FrameClock` : simulation 30 Hz indépendante du rendu 30/20 ; `PresentationBudget` présent | `src/frame-clock.ts`, `src/main.ts` | Pas de `ResourceBudgetManager` transversal complet tel que spécifié dans le doc 22 ; requalifier GPU et longues sessions. |
| Déplacement | E — marche, course, roulade pente/inertie, saut, glissade aérienne, planage à budget d'énergie, nage, plongée, escalade | `src/player.ts`, `src/physics/motion.ts`, `src/physics/surface-material.ts` | Ressenti, rebonds, courants ascendants, contrôles avancés et transitions « enchaînées » à enrichir. |
| Élan / replay | E — vitesse vectorielle conservée, `MovementCommand`, `captureMovement`, `restoreMovement`, `replayMovement` | `src/physics/movement-state.ts`, `docs/54-DYNAMIC-MOVEMENT.md` | Ce n'est **pas** un système de course, de fantôme prêt à jouer ou de rollback réseau. |
| Sols / collisions | E — relief, couches superposées, colliders boîte/sphère, sweep à sous-pas, transitions mine | `src/physics/collision-world.ts` | Physique principalement cinématique, pas de rigid bodies dynamiques ni rebonds configurables ; formes complexes approximées. |
| Caméra / entrée | E — orbite souris au clic-glissé, orientation du planeur par caméra, zoom, FOV vitesse optionnel, commandes clavier | `src/main.ts`, `src/camera-drag.ts`, `src/ui/app/preferences.ts` | Caméra anticollision hors mine et réglages de ressenti / accessibilité à améliorer ; conflits de commandes à tester. |
| Hamster | E — rig skinné rigide partagé, roulade, membranes, squash, accessoires, outils, animations/actions événementielles | `src/hamster/hamster-*.ts`, `src/hamster/tools.ts` | Pas de modèle logique d'objet transporté/lancé ; les actions `PICKUP/CARRY` sont surtout des animations. |
| Interactions | E — moteur déclaratif, triggers/conditions/séquences, liens de levier/porte, récompenses/états sauvegardés | `src/gameplay/runtime.ts`, `src/gameplay/schema.ts`, `src/gameplay/templates.ts` | Catalogue d'actions limité : pas d'impulsions, d'objet mobile, de vérification multi-acteurs ou de déclencheur de course natif. |
| Activités | E — pêche temporelle, collecte/abattage/repousse, mines 2,5D, agriculture, inventaire/commerce, objectifs/dialogues | `src/gameplay/gathering.ts`, `src/gameplay/activity-runtime.ts`, `src/farm`, `src/mine` | Pas de compétitions/équipes/transport physique ni de défis générés contextualisés. |
| Eau / météo | P — réseau d'eau, niveaux et cascades, nage/plongée, météo déterministe avec intensité de vent | `src/water/profile.ts`, `src/environment/climate.ts`, `src/player.ts` | `waterAt` donne un niveau, pas un champ de vitesse pour les nageurs ; le vent climatique n'est pas un champ de forces appliqué au planeur. |
| Bateau / PNJ | E — navigation bateau arcade, PNJ avec déplacements/routines simples, dialogue, variantes de silhouette | `src/boat.ts`, `src/gameplay/fleet.ts`, `src/npc.ts` | Pas de passagers synchronisés, remorquage, épreuves nautiques ni coopération. |
| Audio / UI | E — catalogue audio V2, impacts temporisés par événements d'animation, HUD/sac/journal/menus | `src/audio`, `src/hamster/impact-effects.ts`, `src/ui` | UI chrono/records/ghosts/magie/manipulation d'objets et effets de surfaces à ajouter. |
| Sauvegarde | E — slots V2, état du gameplay, mines, parcelles, récoltes | `src/gameplay/save.ts`, `src/gameplay/gathering.ts` | Ajouter des données de défis/objets mobiles/compétences avec migration explicite ; pas d'état serveur partagé. |
| Studio | E/P — projet V3, éditeurs de géographie/objets, événements, profils, tests, zones | `src/studio`, `src/studio-core` | Pas d'outils spécifiques à la création de courses, tremplins, volumes de vent/impulsion, défis/mini-jeux. |
| Joueurs distants | P dans main — état de présentation hamster ; B — buffers, atlas, imposteurs et simulateur distant | `src/hamster/presentation-state.ts` ; branche `feat/hybrid-distant-impostors` | Ni serveur, ni protocoles, ni vraie autorité/mouvements distants depuis réseau. |

**Important :** `docs/54-DYNAMIC-MOVEMENT.md` dit encore « branche non fusionnée », alors que la PR #25 a bien été fusionnée dans `main` le 16/11/2026. `docs/02-GAMEPLAY.md` et `docs/12-PROJECT-SCOPE.md` évoquent encore l'écureuil joueur, alors que `src/main.ts` instancie désormais le hamster. Les anciens statuts « non publié » des docs 42/43 doivent aussi être relus en regard de `main` et du déploiement, sans conclure à une qualification GPU.

## 2. Audit des branches visibles

Au relevé : **12 branches**, **aucune pull request ouverte** retournée par l'API REST. État comparé à `main` @ `b761b237`, avant publication de ce document :

| Branche | Situation vs main | Conclusion pour le gameplay |
| --- | --- | --- |
| `feat/hybrid-distant-impostors` | **+5 / −0 commit**, non fusionnée | **À examiner/terminer** : atlas, secteurs, politique LOD, `PresentationBuffer`, acteurs simulés, benchmarks. Garde-fou multijoueur futur ; ne pas annoncer un vrai multi. |
| `claude/studio-inspector-edit-guard` | **+1 / −377**, divergente | Revoir uniquement le commit spécifique et comparer aux fonctions déjà dans `main` ; **ne pas merger telle quelle**. Scope surtout édition Studio. |
| `feat/dynamic-movement` | +0 / −69 | Ancêtre de `main` : mouvements déjà fusionnés par PR #25 ; ne pas réimplémenter. |
| `feat/studio-geography-production-v2` | +0 / −6 | Ancêtre : apports déjà présents dans `main`. |
| `feat/studio-creation-workflows-v1` | +0 / −73 | Ancêtre : pas de commits exclusifs. |
| `work` | +0 / −70 | Ancêtre : pas de commits exclusifs. |
| `feat/little-world-assets` | +0 / −407 | Ancêtre : pas de commits exclusifs. |
| `feat/living-world-editor` | +0 / −694 | Ancêtre : pas de commits exclusifs. |
| `claude/little-world-production-v1-eym947` | +0 / −326 | Ancêtre : production monde/personnage déjà intégrée dans l'historique de `main`. |
| `claude/bold-tesla-b0pe7k` | +0 / −389 | Ancêtre : pas de commits exclusifs. |
| `claude/bold-bardeen-0xhlnb` | +0 / −395 | Ancêtre : pas de commits exclusifs. |

Lecture de `+N / −M` : commits présents seulement sur la branche / seulement sur `main`. **Une branche existante n'est pas nécessairement une fonctionnalité manquante**. Comparer à nouveau juste avant de reprendre, fusionner ou supprimer : les branches sont modifiées en parallèle.

### Branche imposteurs : limites constatées

Le code de `src/render/remote-characters.ts` y installe des acteurs **simulés localement** et un affichage adaptatif (hamster détaillé, proxy ou atlas). `src/render/presentation-buffer.ts` interpole des snapshots et borne l'extrapolation ; les sources disent explicitement **sans transport ni autorité de gameplay**. `tests/hybrid-rendering.test.mjs` contrôle sélection LOD/cache/atlas/interpolation, pas une partie multijoueur complète. La baseline SwiftShader présente dans `docs/55-HYBRID-DISTANT-RENDERING.md` n'est pas une mesure sur GPU intégré.

Les objectifs « imposteurs », « snapshots distants » et « joueur réseau » sont donc **trois livrables distincts** : le premier est en branche, le second possède un prototype de présentation, le troisième est futur.

## 3. Backlog exhaustif des mécaniques

Les IDs sont stables pour suivi par lots, issues ou PR. Priorités proposées, à valider par test de jouabilité.

### A — Contrôle, locomotion et plaisir du mouvement

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| MV-01 | Contrôleur unifié sol/air/roulade/planeur/eau/escalade | E | Base | Conserver `simulatePlayer`, sans moteur concurrent. |
| MV-02 | Élan cohérent roulade → saut → vol → atterrissage → roulade | P | P0 | Mesurer pertes d'élan réelles, rendre le report explicite et réglable ; prévention des gains d'énergie involontaires. |
| MV-03 | Coyote time, tampon de saut, tolérance des rampes et atterrissages | N | P0 | Entrées datées dans `Controls` / `MovementSnapshot` ; tests à 30 Hz et rendu variable. |
| MV-04 | Réception parfaite / brusque : impulsion restituée ou dissipée, sans dégâts | N | P1 | Fonction de contact déterministe selon vitesse/normale ; état court et animation. |
| MV-05 | Glisse différenciée glace, boue, sol humide, sable, roche, bois | P | P1 | Étendre `GroundMaterial`, `SURFACE_MOTION`, source géographique/colliders ; ne pas lire le shader. |
| MV-06 | Dérapage maîtrisable / freinage progressif de la boule | P | P1 | Calibrage virage/adhérence, retour audio/visuel et limites anti-oscillation. |
| MV-07 | Rebonds sur champignons / surfaces / trampolines naturels | N | P1 | Volumes/surfaces à impulsion unique, cooldown, directions, limites de vitesse. |
| MV-08 | Tremplins et lancement tangent depuis une rampe | P | P1 | La tangente de rampe existe ; créer objets/annotations auteur + scènes de test. |
| MV-09 | Courants ascendants de falaises/volcan, vent local, rafales | N | P1 | Champs de forces 3D typés, dépendants de `EnvironmentState`, intégrés au pas fixe. |
| MV-10 | Contrôle du planeur, décrochage, plongeon/cabrage, aérofrein | E | Base | Calibrer en jouabilité et varier l'assistance sans compromettre le bilan d'énergie. |
| MV-11 | Courants de rivières, rapides, cascades et nage en flux | P | P2 | Projeter le réseau d'eau en champ de courant logique ; tester rive/sortie/immersion. |
| MV-12 | Escalade/bords bas, reprise de déplacement après obstacle, caméra anti-occlusion | P | P2 | Climb extérieur existe ; finition franchissement et caméra hors galeries. |
| MV-13 | Enchaînements contextuels fluides sans « bouton combo » supplémentaire | N | P1 | Événements de transition, feedback, éventuellement micro-bonus **borné** à l'atterrissage. |
| MV-14 | Modes d'accessibilité : assistance vitesse, inversion caméra, motion réduite, remapping | P | P2 | Élargir préférences/contrôles et rejouer les cas AZERTY/QWERTY. |

### B — Monde physique interactif à coût borné

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| IN-01 | Interaction `E`, états et mécanismes déclaratifs | E | Base | Garder moteur de règles actuel. |
| IN-02 | Pousser pierres, caisses, fruits, mécanismes (marche ou boule) | N | P1 | `KinematicProp` à forme simple, masse arcade, résistance, grille collision. |
| IN-03 | Percussion de roulade : impulsion selon vitesse et orientation | N | P1 | Ajouter résolution de contact **autoritaire logique**, pas depuis événements d'animation. |
| IN-04 | Prendre/porter/déposer un objet (logique et collision) | P | P1 | Animation `CARRY` existante, état porté/poids/slot et transitions manquants. |
| IN-05 | Lancer un objet / viser / restituer la vitesse initiale | N | P2 | Projectile cinématique borné, collision simple, restitution au sol. |
| IN-06 | Objets interactifs persistants après déplacement | N | P1 | Identités V3 + états delta côté sauvegarde, pas sauvegarde de tous les props décoratifs. |
| IN-07 | Plateformes mobiles, portes à minuterie, poids sur plaques | P | P2 | Actions déclaratives existantes ; nouvel état/action/éditeur + collisions dynamiques. |
| IN-08 | Mécanismes « à deux personnes » avec alternative solo | N | P2 | Conditions « simultanéité » et solution solo à séquence/outil sans blocage. |
| IN-09 | Charges lourdes, poussée à plusieurs, arbitrage concurrent | N | P3 | Autorité future et validation des contributions sans rigid bodies distribués. |

### C — Courses, challenges, fantômes et mini-jeux

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| RC-01 | Définition générique `CourseDefinition` (départ, points, arrivée, règles) | N | P1 | Données auteur typées, IDs, validations, limites, édition Studio. |
| RC-02 | Checkpoints ordonnés et zones de passage | P | P1 | Moteur `onEnterZone` existant, mais pas de validation de parcours. |
| RC-03 | Chronomètre sur ticks, départ/arrêt/pause/annulation | N | P1 | Simulation 30 Hz, pas `Date.now()` pour score physique. |
| RC-04 | Contre-la-montre montagne / planeur / mixte / nage | N | P1 | Même moteur de course, contraintes de modes et checkpoints. |
| RC-05 | Départ raté, sortie, raccourcis, retour checkpoint sans téléportation abusive | N | P1 | Règles de validité / pénalité configurables ; anti-cheat futur. |
| RC-06 | Record personnel, top locaux, comparaison de parcours | N | P1 | Sauvegarde locale versionnée **séparée** des projets Studio. |
| RC-07 | Fantôme personnel (états/ticks horodatés, interpolation) | P | P1 | Réutiliser `MovementSnapshot` et présentation distante, mais créer acquisition, lecture et stockage borné. |
| RC-08 | Défis de saut, précision, slalom, anneaux, descente | N | P2 | `ChallengeDefinition` réutilisant volumes, chrono, scores, règles. |
| RC-09 | Course bateau, pêche chronométrée, livraisons, bowling de pierres | N | P2 | Plugins de règles légers, consommant les systèmes existants. |
| RC-10 | Course multi, positions relatives, départ partagé, classement serveur | N | P3 | Service d'autorité futur ; clients ne fixent jamais leur temps officiel. |
| RC-11 | Fantômes asynchrones partagés et records distants | N | P3 | Échange volontaire de replays validés, non un réseau obligatoire en solo. |

### D — Contenu, progression légère et jeu coopératif

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| GP-01 | Collecte, pêche, mines, agriculture, commerces, dialogue, quêtes courtes | E | Base | Conserver les règles et sauvegardes existantes, sans duplication. |
| GP-02 | Transport / livraison d'objets tangibles | P | P1 | `deliver` existe pour l'inventaire, pas pour un colis porté physiquement. |
| GP-03 | Trésors / raccourcis révélés par mouvement et observation | P | P2 | Coffres/états existent ; enrichir puzzles et Studio. |
| GP-04 | Défis locaux de PNJ, variantes selon météo/heure/biome | P | P2 | Triggers, timer et climat existent ; moteur d'offres contextuelles manque. |
| GP-05 | Activités collectives mine, récolte, bateau, transport | N | P3 | Modèle d'intention par joueur, transactions atomiques, états partagés futurs. |
| GP-06 | Mini-jeux jouables seuls, enrichis en groupe | N | P2 | Toutes les énigmes principales doivent avoir une voie solo ; multi facultatif. |
| GP-07 | Récompenses cosmétiques, progression non punitive | P | P2 | Accessoires/inventaire existants ; conditions de déblocage et UI à prévoir. |

### E — Magie utilitaire et phénomènes écologiques

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| MG-01 | Capacité « souffle » et courants d'air locaux | N | P2 | Réutiliser champs de forces de MV-09 ; cooldown/durée validés. |
| MG-02 | Bond magique ou impulsion de mobilité bornée | N | P2 | Impulsion de saut, aucune énergie gratuite non plafonnée en course. |
| MG-03 | Attirer / repousser petits objets | N | P2 | Réutiliser `KinematicProp` ; portée/masse/ligne de vue. |
| MG-04 | Lumière légère, visibilité en mine, détection d'indices | P | P2 | Lumières et interactions existent ; capacité, durées et effets manquent. |
| MG-05 | Zones exceptionnelles (thermes, roches rebondissantes, vent rare) | N | P2 | Composants de zone versionnés, effets logiques + VFX low-poly optionnels. |
| MG-06 | Répertoire de 2–3 capacités équipables sans surcharge des touches | N | P2 | `AbilityController` logique pur + HUD contextuel. |

### F — Personnage, audio et ergonomie

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| UX-01 | Squash, roulade, planeur, outils et événements audio synchronisés | E | Base | Capitaliser sur `HamsterAnimator` / catalogue audio. |
| UX-02 | Variations d'atterrissage, glissade, impact, eau et expression contextuelle | P | P1 | Compléter états/paramètres de pose sans rig supplémentaire ; pas d'autorité via animation. |
| UX-03 | Son de vitesse, glisse, vent, rebond, checkpoint, chrono et victoire | P | P1 | Ajouter événements sémantiques au catalogue V2, variations/rate limits. |
| UX-04 | HUD discret : vitesse/élan, course, checkpoint, record, ghost | P | P1 | Vitesse/FOV actuels ; widgets course et feedback audio manquent. |
| UX-05 | Éviter chevauchements de `E` / `F` / `X` / `Shift` / `Space` et menus | P | P0 | Routage d'intention unique et priorité contextuelle ; AZERTY/QWERTY. |
| UX-06 | Gestuelle/émotions visibles par d'autres joueurs | P | P3 | Apparence/action présentation en partie ; synchronisation autorisée futur. |

### G — Création Studio, données et qualité technique

| ID | Besoin | Statut | Priorité | Cible technique |
| --- | --- | --- | --- | --- |
| ST-01 | Bibliothèque de volumes de force, surfaces spéciales, objets mobiles | N | P1 | Composants V3 validés, placement/gizmos/inspecteur, export/compilation. |
| ST-02 | Éditeur de courses / challenges avec checkpoints et test « Jouer ici » | N | P1 | Panneau léger, volumes visibles, contrôle d'ordre et de franchissement. |
| ST-03 | Paramétrage mini-jeux/magie/coopération déclaratifs | N | P2 | Templates + formulaire, pas de scripts libres. |
| ST-04 | Migrations source V3 / monde compilé / sauvegarde de partie | P | P0 | Évolutions additives, lecteurs anciens, tests import/export et rejets sûrs. |
| ST-05 | Scène de référence de gameplay « fun lab » | P | P0 | Étendre `maps/motion-reference.project.json` : pente, rampe, falaise, zone aérienne, rivière, props, checkpoint. |
| ST-06 | Instrumentation performance des nouveaux mécanismes | P | P0 | Tester simulation, alloc/tick, draw calls, RAM/VRAM, FPS, popping, scènes lourdes. |
| ST-07 | Scénarios multi simulé SANS réseau | B/P | P2 | Buffer snapshots / proxys de la branche imposteurs ; tests trajectoires et densités. |

## 4. Direction technique : réutiliser avant d'ajouter

### 4.1 Architecture suggérée (pas un constat d'implémentation)

`PlayerInput → MovementIntent(tick) → simulatePlayer + ForceFieldQuery + CollisionQuery → MovementState → GameplayEvents → Presentation/Audio/UI`.

Conserver **un seul** propriétaire de la position/vitesse : `simulatePlayer`, et des noyaux numériques sans DOM/Three.js lorsque faisable. Le serveur futur pourra réutiliser règles et validations avec les mêmes données de monde. Les états audio, caméra, rig, imposteurs et effets sont **dérivés**, jamais sources d'autorité.

Créer progressivement :
- `src/physics/force-fields.ts` : requête spatiale de champs `wind/updraft/current/impulse`, déterministe au tick, filtrée par mode de mouvement ;
- `src/physics/contact-effects.ts` : classification de contacts, impulsions bornées, matériaux, rebonds, atterrissages ;
- `src/gameplay/props.ts` : objets portables/poussables/lancés, AABB/sphère, transactions et état minimal ;
- `src/gameplay/races.ts` : définition, session, checkpoints, temps/score, pénalités, résultats ;
- `src/gameplay/ghosts.ts` : capture, réduction, lecture et validation de replays ;
- `src/gameplay/abilities.ts` : capacités utilitaires, cooldown, coût borné ;
- adapters Studio, compilation, rendu, UI et audio **après** un noyau testé.

Ces chemins sont des **propositions**, pas des modules repérés dans `main`. Éviter un second contrôleur, un second « resource manager », un moteur de physique lourd ou du JavaScript fourni par des cartes.

### 4.2 Contrats de données proposés

- `ForceVolume` : `id, shape(box/sphere/cylinder), transform, forceType, vector, magnitude, falloff, enabledCondition, priority, cooldown` ; coordonnées en mètres Y-up, activations déterministes.
- `SurfaceGameplay` : `material, friction, grip, restitution, landingModifier`, associé à une source/collider stable (pas à un matériau Three.js).
- `KinematicProp` : `id, transform, velocity, collisionShape, motionRule, carryRule, persistencePolicy` ; seuls les props proches/actifs sont simulés ; dormants = état compact.
- `RaceDefinition` : `id, modeRestrictions, startZone, orderedCheckpoints, finishZone, resetPolicy, penalties, version` ; l'ordre est validé à la compilation.
- `RaceRun` : `raceId, playerId(local future), startTick, endTick, checkpointIndex, penalties, validity` ; temps depuis ticks.
- `GhostTape` : `physicsVersion, worldBuildVersion, raceVersion, tickRate, initialState, inputs/keyframes, checksum` ; lecture visuelle possible même si simulation n'est pas reproductible sur une autre version.
- `AbilityDefinition` : `id, targetKind, maxRange, durationTicks, cooldownTicks, effectType, params` ; aucune capacité réseau implicite.

**Ne pas intégrer d'objets physiques individuels dans les milliers d'instances de végétation**. Sélectionner seulement des props interactifs ; conserver la végétation procédurale et les collectes delta.

### 4.3 Save et compatibilité

Le `GameSaveV2` actuel conserve notamment mines, fermes et récoltes. Le replay fantôme et les records volumineux doivent avoir un stockage **borné, séparé ou externalisé** (IndexedDB si utile), avec possibilité d'effacer un record sans toucher à la partie. Les nouveaux props permanents et les compétences déverrouillées relèvent d'une **migration explicite** et non d'un champ injecté dans un vieux JSON sans validation.

Les projets Studio V3, builds compilés et sauvegardes restent trois produits distincts. Toute extension des schémas doit prévoir migration, validation, liens d'IDs, édition et round-trip.

## 5. Multijoueur : préparer les contrats, ne pas créer un serveur maintenant

Conformément à `AGENTS.md` / doc 16, **le multijoueur n'est pas le jalon en cours**. Le code solo doit néanmoins être prêt à distinguer :

1. **Commande** : `tick, playerId, buttons/axes, cameraIntent, actionIntent`, sans pointeurs DOM.
2. **Simulation** : pas fixe, état physique, collision, champs, règles de cooldown et d'énergie.
3. **Intention d'interaction** : `requestId, actorId, entityId, actionType, tick`. Validation par autorité (solo local maintenant ; serveur futur).
4. **Événement validé** : `eventId, tick, actorId, subjectId, outcome` ; idempotence pour collecte, pêche, culture, mine, courses, props.
5. **Présentation** : snapshots horodatés, interpolation/extrapolation bornées, niveau de détail indépendant de l'état logique.
6. **Persistance** : état de monde/partie déterminé par l'autorité, séparé des records locaux.

**Future étape réseau uniquement après décision explicite** : serveur autoritaire, validation anti-triche, prediction client/reconciliation, AOI, budgets de bande passante, arbitrage collisions simultanées, ownership des objets, transferts de secteurs, courses groupées, rejoin/disconnect, état persistant partagé.

**Fréquences à tester**, non garanties : simulation des règles à 30 Hz, personnages proches en course environ 10–20 snapshots/s, foule lointaine 2–3/s avec interpolation, visualisation très lointaine par imposteurs/LOD ; les interactions importantes restent des événements fiables, pas des mises à jour à 2 Hz. Une fréquence d'affichage distante faible ne diminue pas la fréquence de l'autorité.

**Critères de compatibilité** : solo sans réseau et sans faux acteurs ; réseau absent = aucune dépendance WebSocket ; deux personnes ne récoltent pas deux fois le même item ; pas de divergence de portes/props ; replay versionné ; possibilité d'activer/désactiver les imposteurs sans effet sur collisions ni gameplay.

## 6. Lots de livraison recommandés et dépendances

### Lot 0 — Stabilisation et preuves (P0)

- Revalider l'état Git des branches ; examiner seulement les commits exclusifs, particulièrement imposteurs et garde-inspecteur.
- Mettre à jour les statuts documentaires historiques (docs 02/12/42/43/54) sans écraser leurs historiques de mesure.
- Passer les tests existants, `typecheck`, `build`, `test:motion`, `test:hamster`, `test:swim`, `test:gameplay`, tests Studio pertinents.
- Scène « fun lab » versionnée ; captures et mesures baseline **sur matériel cible**.
- Clarifier le routage d'entrées et la signature d'état/replay avant nouvelles actions.

**Livrable :** baseline de jouabilité mesurée, liste d'anomalies et tests reproductibles.

### Lot 1 — Mouvement amusant (P0/P1)

- `MV-02/03/04/05/06/07/08/09/13` : enchaînements, sauts tolérants, atterrissages, glissade, rebonds, rampes, courants ascendants.
- Tests unitaires : conservation/dissipation de l'énergie, aucun boost à l'ouverture du planeur, pente montante/descendante, restitution bornée du rebond, absence d'oscillation aux seuils, passage à 20/30/60 FPS de présentation.
- Tests navigateur : roulade → rampe → saut → plané → courant → atterrissage → roulade, dans plusieurs matériaux.

**Livrable :** déplacement intéressant sans quête ni PNJ, avec feedback sonore/visuel.

### Lot 2 — Objets interactifs et Studio (P1)

- `IN-02/03/04/06` et `ST-01/04` : pousser, percussion, porter/déposer, props persistants, inspecteur Studio, compilation, migration.
- Pas de corps physique « réveillés » à distance ; plafonds d'objets actifs et collisions, événements d'état plutôt que snapshots de tous les décors.

**Livrable :** petite énigme solo à pierres/plaques, interaction partagée avec les autres contenus.

### Lot 3 — Courses, records, fantômes (P1)

- `RC-01..07`, `ST-02`, `UX-03/04` : moteur de course par ticks, éditeur parcours, contre-la-montre, records, ghost local.
- Un parcours montagne, un parcours planeur et un parcours mixte ; mêmes checkpoints, logique et HUD.
- Le ghost ne possède **aucune collision avec le joueur** et ne modifie pas les règles du monde.

**Livrable :** trois challenges solo complets, rejouables sans réseau, prêts pour classement futur.

### Lot 4 — Enrichissement léger (P2)

- `MV-11/12/14`, `IN-05/07/08`, `GP-02..04/06/07`, `MG-01..06`, `UX-02/06` : courants, lancer/plateformes, défis PNJ, magie utilitaire, mini-jeux, animations contextuelles.
- Évaluer chaque ajout selon **diversité de situations / réutilisation de composants / coût CPU-GPU** ; éviter l'empilement de systèmes indépendants.

**Livrable :** interactions amusantes dispersées dans les biomes, jouables avec les commandes existantes.

### Lot 5 — Multijoueur réel (P3, bloqué jusqu'au jalon décidé)

- `RC-10/11`, `IN-09`, `GP-05`, `ST-07` : circuits d'autorité, serveur, AOI, matchmaking léger si retenu, synchronisation des props/courses/activités, gestion de déconnexion.
- Utiliser les contrats/replays/LOD validés dans les lots précédents ; éviter de refaire le moteur physique pour le réseau.

## 7. Recette de validation : ne pas confondre test présent et test passé

Commandes existantes repérées dans `package.json` :

`npm ci` ; `npm test` ; `npm run typecheck` ; `npm run build` ; `npm run test:motion` ; `npm run test:hamster` ; `npm run test:swim` ; `npm run test:gameplay` ; `npm run test:studio` ; `npm run bench:physics` ; `npm run benchmark:route`.

Les tests navigateur nécessitent une instance du jeu/Studio en cours d'exécution selon leurs scripts. À chaque lot, ajouter :
- un test Node de règles physiques / interactions / invariants avec entrées et seeds fixes ;
- un test navigateur en conditions réelles (clavier/souris, caméra, retours d'onglet, erreurs console) ;
- un test migration + export/import V3 + reprise de partie ;
- une séquence de simulation à plusieurs fréquences de présentation ;
- un scénario de densité (props, PNJ, végétation, proximité d'eau et falaises) ;
- un jeu de captures de référence pour le feedback et l'absence de clipping/popping.

**Budget :** profil PC GPU intégré de référence, 1600×900, 8 Go, 30 FPS normal / secours 20 FPS, simulation inchangée à 30 Hz. Contrôler `frame p50/p95/p99`, temps simulation, JS heap/allocations par tick, draw calls, triangles, atlas/VRAM estimée, pics streaming et temps GPU **si extension de mesure disponible**. Ne jamais appeler « GPU ms » la durée JavaScript de soumission WebGL. Aucun seuil de performance n'est déclaré atteint par cet audit.

### Critères de sortie orientés fun

- Un parcours de 2–3 minutes doit être plaisant en ne faisant **que** courir/rouler/sauter/planer.
- Aucune transition de mode ne donne d'énergie gratuite non documentée ; chutes/erreurs restent non punitives.
- Un joueur solo peut réussir toute énigme essentielle sans second personnage.
- Un fantôme reproduit un record après rechargement, sans modifier les collisions.
- Un objet prop déplacé ou récolté conserve un état correct après sauvegarde/reprise.
- En basculant 30→20 FPS de rendu, la physique, le chrono et les checkpoints gardent le même résultat logique.
- Les options graphiques et l'éloignement d'un avatar ne modifient aucune interaction.

## 8. Risques et arbitrages à garder visibles

1. **Surcharge de `main.ts`** : l'orchestration d'entrée, interactions, audio, pêche, rendu et caméra y cohabite ; extraire par domaines lors des lots sans refactor global aveugle.
2. **Duplication de logique** : ne pas créer un deuxième système de physics/LOD, ni un moteur spécifique par mini-jeu.
3. **Confusion animation/autorité** : `CARRY`/`PICKUP` existent visuellement, pas comme règles de props ; déclencher sons/particules après validation, pas la simulation après les sons.
4. **Retours physiques coûteux** : privilégier forces/collisions analytiques, plafonds sur objets actifs, et rendu instancié pour décor.
5. **Concurrence multi future** : prévoir requestId et évènements idempotents sans implémenter maintenant sockets et backend.
6. **Documentation datée** : confronter chaque doc au commit de `main`. Toute branche « behind » peut déjà être totalement absorbée.
7. **Tests vs performance** : des tests SwiftShader/Node et un build GitHub Pages réussi ne qualifient pas une carte dense sur GPU intégré.

## 9. Résultat de l'audit / ordre de priorité

**Déjà disponible :** le cœur du hamster, la roulade liée à la pente, le vol avec conservation d'énergie, le replay de mouvements, le moteur d'interactions déclaratives, les activités courantes, le Studio V3 et les sauvegardes. **Il n'est pas nécessaire de recommencer ces systèmes.**

**Plus forts manques de gameplay :** (1) finition sensation du mouvement et volumes de force, (2) objets poussables/portables, (3) courses + chrono + fantôme, (4) auteur Studio pour ces objets/volumes/parcours, (5) feedback contextuel et mini-jeux réutilisables.

**Ordre retenu pour la suite :** Lot 0 → Lot 1 → Lot 2 → Lot 3 → Lot 4. Lot 5 reste une architecture compatible, pas un développement immédiat.

**Suite de lecture :** `docs/43-HAMSTER-JOUEUR.md`, `docs/54-DYNAMIC-MOVEMENT.md`, `docs/40-UI-JOUEUR.md`, `docs/36-PHYS-WATER-MINE-AGRI-CAMPAGNE.md`, `docs/16-FUTURE-MULTIPLAYER.md`, `docs/17-DISTANT-VIEW-RENDERING.md` et, sur branche, `docs/55-HYBRID-DISTANT-RENDERING.md`.
