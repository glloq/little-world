# 97 — Roadmap : vie locale des PNJ, déplacements, dialogues et interactions avec les quêtes

**Statut : ROADMAP / SPECIFIED — à implémenter et qualifier.**  
Références : [96 — Audit détaillé des PNJ](96-NPC-LIFE-DIALOGUES-SCHEDULE-AUDIT.md), [93 — Quêtes par île](93-QUESTS-AUDIT-ISLAND-INTEGRATION.md), [94 — Contrats QuestDirector](94-QUESTS-DATA-EVENTS-REWARDS.md), [95 — Roadmap quêtes](95-QUESTS-IMPLEMENTATION-ROADMAP.md), [92 — Monde jouable](92-COMPLETE-WORLDS-STUDIO-AUDIT.md), [76 — Services](76-SETTLEMENTS-SERVICES-V1.md).

## Priorité complémentaire NPH — unifier tous les PNJ humanoïdes en hamsters

**Décision du 19/11/2026 :** mêmes rig, morphologie, animations et accessoires de base que le joueur pour tous les personnages humanoïdes ; la faune non parlante conserve sa morphologie animale. Les données `squirrel` des anciennes cartes doivent rester importables/exportables sans mutation : conversion **uniquement au runtime/rendu**. Les nouveaux habitants de Studio sont créés en `hamster`; aucun nouvel asset écureuil humanoïde.

- **NPC-H1 (P0)** : créer un adaptateur central de morphologie legacy → hamster visuel, aligner Studio et génération de villages, corriger la migration des rigs.
- **NPC-H2 (P0)** : remplacer la création systématique de rigs par une instanciation des seuls personnages proches ; partager géométries et animations, couper le planeur inutile.
- **NPC-H3 (P1)** : adapter les gestes des métiers au rig hamster (arroser, pêcher, mine, forêt, salut) sans attribuer d'items à l'animation.
- **NPC-H4 (P1)** : valider les 14 objectifs/32 PNJ historiques, le roundtrip V2/V3, la carte 4×3 km, les tests Studio et FPS/heap des villages riches.
- **NPC-H5 (P2)** : variantes visuelles sobres (échelle enfant, accessoires, éventuellement palette commune), sans dupliquer les modèles.

**Suivi réel de la première implémentation :** [PR #85](https://github.com/glloq/little-world/pull/85) et [document 98 sur sa branche](https://github.com/glloq/little-world/blob/feat/npc-life-routines-v1/docs/98-NPC-LIFE-V1-IMPLEMENTATION.md). Les lots NPC-1/3/4/5/7/8 sont en cours et partiellement livrés ; NPC-2 a encore les ponts/portes et NPC-6 les commandes de quêtes mobiles. Aucun lot ne doit être marqué **QUALIFIED** sans CI complète et playtest.


## 0. Livrable V1 jouable

Dans un village généré : un agriculteur quitte une maison accessible, suit un chemin validé vers un champ PNJ, anime une activité légère, s'arrête quand le joueur parle, puis repart ou rentre le soir. Le pêcheur suit le même modèle pour le quai ; un marchand apparaît au comptoir ; deux enfants jouent **sur une zone sûre** pendant la journée. Tous proposent des informations cohérentes avec leur lieu/heure, sans écraser les dialogues auteur. Les donneurs de quête auto suivent un horaire lisible dans le journal. La génération conserve les anciennes îles/PNJ et reste légère.

**Ne pas confondre** mouvement visuel PNJ et véritable production de stocks, apparition d'une activité et activité jouable, dialogue et récompense de quête. Une animation de pêche ne donne aucun poisson.

## 1. Phases et dépendances

~~~text
NPC-0 Baseline main / tests / contraintes anciennes
  └─ NPC-1 Profils de résident + ancres + validation source V3
      ├─ NPC-2 Graphe de déplacements piétons à partir de chemins réels
      │    └─ NPC-3 Horaires purs + mouvement loin / près / transitions
      │         └─ NPC-4 Premier agriculteur, pêcheur, marchand et enfants
      └─ NPC-5 Dialogue contextuel + relation / événements natifs
           └─ NPC-6 Pont QuestDirector : donneur mobile et disponibilité
                  └─ NPC-7 Génération vie locale intégrée aux villages Studio
                         └─ NPC-8 Animations / audio / scènes sociales légères
                              └─ NPC-9 Saves, QA, performance et release
NPC-10 Futur : scènes intérieures et foules avancées (NON BLOQUANT)
~~~

La route dynamique et les horaires peuvent être préparés en parallèle **après gel de NPC-1**. Les quêtes **Q0–Q5** de [95](95-QUESTS-IMPLEMENTATION-ROADMAP.md) servent de première verticale de progression ; pour ne pas bloquer la production, le donneur peut rester stationnaire jusqu'à NPC-6. Les quêtes automatiques **Q6–Q8** devront exploiter les profils/rôles validés dès NPC-1/NPC-7.

## 2. Étapes, modifications et gates

| Phase | Priorité | Fichiers / tâches | Gate |
| --- | --- | --- | --- |
| **NPC-0 — Baseline** | P0 | `src/npc.ts`, `npc-view.ts`, `migration.ts`, `game-view.ts`, `main.ts`, docs 76/92 et limites | Tests/sauvegardes historiques et identités gelées |
| **NPC-1 — Données** | P0 | `src/npc-life/schema.ts`, `residents.ts`, `validation.ts` ; `src/studio-core/types.ts`/`schema.ts` | Profil facultatif validé ; ancien Studio/projet/PNJ sans profil charge inchangé |
| **NPC-2 — Navigation** | P0 BLOQUANT | `src/npc-life/route-graph.ts`, `anchors.ts`, `navigation.ts` ; réutiliser `paths/terrain-route.ts`, `settlements/*`, collisions | Maison→champ→maison sans mur, pont traversable, refus explicite si chemin invalide |
| **NPC-3 — Routines et LOD logique** | P0 | `src/npc-life/schedule.ts`, `director.ts`, `projection.ts` ; adapter `npc.ts`, `npc-view.ts`, `main.ts` | 6/12/18/24h, changement heure/chargement, PNJ dormant à son bon lieu, zéro simulation offscreen par frame |
| **NPC-4 — Démo métiers/jeux** | P0 | Presets `farmer/fisher/merchant/child`, maisons/points métier validés ; UI minimale | 4 archétypes se déplacent réellement et restent atteignables |
| **NPC-5 — Dialogues** | P0 | `src/npc-life/dialogue-context.ts`, `composer.ts`, `barks.ts` ; `src/dialogue.ts`, `dialogue-session.ts`, `npc-view.ts` | Choix auteur préservés, texte heure/météo/métier, PNJ sans dialogue initial discutables si modèle existant |
| **NPC-6 — Quêtes** | P0/P1 | `src/quests/npc-adapter.ts`, `game-view.ts`, `src/ui/journal/*` ; route/comportement des donneurs | Carte suit donneur, remise accessible soir/jour, aucune double récompense, quête legacy intacte |
| **NPC-7 — Génération Studio** | P1 | `src/settlements/local-life.ts`/`planner.ts`/`authoring.ts`, `src/studio-core/*`, compiler/loader | Habitations, métiers, parcours, générations et locks cohérents ; pas de PNJ sans poste valide |
| **NPC-8 — Vie visuelle** | P1 | `npc-view.ts`, `character-animation.ts`, audio existant ; gestes d'arrosage/pêche, jeux, groupe place/marché | Animations légères, sous-titres barks non invasifs, zéro nouveau rig pour chaque métier |
| **NPC-9 — QA/perf/persistance** | P1 BLOQUANT | `src/gameplay/save.ts` + tests e2e et benchmarks, CI | Aucun PNJ perdu, reprise stable, pas de régression de frame ou de quêtes |
| **NPC-10 — Extensions** | FUTUR | Intérieurs visitables, école, enfants suivant parent, fêtes, foule dense, métiers réellement producteurs | À ouvrir après métriques/contrats et besoin confirmé |

## 3. Chemin technique recommandé

### NPC-0 : tests de référence

- Fixer SHA de `main` au début du code, vérifier que docs #93–97 et merge #75 sont intégrés ; si nouveau merge, auditer le diff.
- Tester `npm test`, `npm run typecheck`, `npm run build`, `tests/npc.test.mjs`, `tests/contextual-settlements.test.mjs`, `tests/settlement-services.test.mjs` et `node tools/audit-island-playability.mjs`. Les résultats des docs plus anciennes ne sont pas des tests de cette branche.
- Consigner l'îlot 4×3 km (PNJ, dialogues, objectifs, entrées), un village nouvellement créé (maisons, hôte immobile, ancrages de services) et un petit monde sans PNJ.

### NPC-1 : schémas et ancrages

- Profils `ResidentProfileV1` validés, portés par les sources V3 (extension facultative) avec références à `Character` existant et ancrages. Une seule bibliothèque de presets `DailyRoutineV1`.
- Préserver `NavigationComponent` (base de déplacement) et `DialogueActor` ; ne pas étendre directement les anciens `BehaviorDefinition.kind` tant que cela casserait des données.
- Valider maison existante, porte, poste, zone, rôle, entrée, chemin, horaires non contradictoires, limites de génération et suppression volontaire.
- Faire passer le profil dans `src/world-compiler/compile.ts`, `manifests.ts`, `load.ts` et `src/studio-core/migration.ts`/projection runtime sans rendre son absence invalide.
- Tests : `tests/npc-life-schema.test.mjs`, fixtures anciens projets et imports invalides, références inter-secteurs et UUID.

### NPC-2 : route graphe en cache

- Construire les **nœuds à partir des chemins et entrées réelles**, avec connexion sur seuils géométriques contrôlés ; interdire le couplage de deux rues superposées à niveaux différents. Vérifier les segments via `inspectGroundSegment`, géométrie et collision native : terrain, eau, ponts, maisons, portes.
- Rechercher une route courte **une fois par changement de destination**, A* ou Dijkstra sur petit graphe ; précalculer les trajets fréquents par site maison→poste.
- Séparer `RoutePlan` immuable (ancrages, chemin, longueur, temps minimal, version d'île) et état `RouteCursor` (progression), pour replanifier sans casser la sauvegarde.
- Si porte fermée/chemin supprimé : fallback au dernier ancrage sûr ; diagnostic non silencieux ; pas de téléport visible, pas de traversée d'objet solide.
- Tests : `tests/npc-life-routes.test.mjs`, pont à double niveau, rue inaccessible, suppression de maison, pente, rivière, accès mine et absence de chemins.

### NPC-3 : le point technique clé — lointain sans CPU

- Exécuter `resolveNpcIntent(npc, worldTime, weather, authoredState)` seulement sur changement de plage horaire/événement ; calcul analytique `logicalPositionAt(worldTime)` pour les transitions hors caméra.
- Ne **pas** utiliser `requestAnimationFrame` comme source de l'horloge sociale ; le `WorldClock` gameplay est la seule horloge. Respecter pause, `setRate`, recharge, traversée d'île, progression des journées.
- Dans `src/npc.ts`, conserver `updateNPC` pour le mouvement proche, avec route cible contrôlée et interpolation ; 10 Hz proche, 2 Hz moyen (valeurs actuelles), pas de per-frame spatial query hors 160 m.
- Ne pas changer la position d'un personnage **visible au joueur** par projection instantanée lorsque l'heure bascule ; achever physiquement la transition ou décaler discrètement hors du champ. Tester le passage 159↔161 m en continu.
- Tester la reprise d'un dialogue : gel temporaire du trajet, puis recalcul de destination selon l'heure **actuelle** ; ne pas reprendre aveuglément le vieux chemin si l'activité est terminée.
- Tests : `tests/npc-life-schedule.test.mjs` / `npc-life-projection.test.mjs` sur 20/30/60 FPS, reprise après 5 jours, minuit et `rate=0/240`.

### NPC-4 : prototype jouable à quatre profils

**Scénario de démonstration conseillé** (sur île source test distincte) :
1. À 07h, agricultrice sort de maison A et marche vers champ PNJ 1 ; à 12h, pause place ; à 18h elle repart à A.
2. Pêcheur va à une berge vraiment praticable, joue des gestes de pêche et rentre à la cabane ; la capture du PNJ n'alimente pas l'inventaire joueur.
3. Commerçant traverse sa place vers un comptoir **réellement activé** ; vente validée par économie existante ; pas de fermeture arbitraire si le contrat commerce n'en prévoit pas.
4. Deux enfants alternent un jeu de poursuite borné, une pause au banc et leur trajet vers des maisons accessibles ; pas de franchissement eau/race track.
5. Deux PNJ proches se saluent brièvement, sans qu'une routine sociale bloque la quête.

Vérifier la performance et la cohérence **avant** la génération de plusieurs dizaines de figurants.

### NPC-5 : dialogues enrichis sans système concurrent

- Faire composer un `DialogueSession` à partir de `gameplayDialogueSession` si présent et de templates additionnels déclaratifs, sans modifier le graphe auteur persisté.
- Intégrer dans `createNPCSystem` une proposition « parler » si dialogue **ou** session contextuelle réellement possible ; ne pas forcer une conversation sur les animaux non parlants.
- Conserver conditions/actions/émotions V3, 100 lignes / 8 choix max, contrôle d'accès par contexte en lecture seule. Rôles/noms/dialogues localisables et sûrs pour import Studio.
- Introduire barks courtes avec budget/cooldown, une seule à la fois près du joueur, sous-titres non bloquants et audio facultatif.
- Gérer `startDialogue` et `moveNPCTo` actuellement non branchés par un **adaptateur à commandes testables** et position d'acteur réelle (pas un `showInfo` de fallback).
- Tests : `tests/npc-dialogue-context.test.mjs`, `tests/dialogue-authoring.test.mjs`, `tests/gameplay.test.mjs`, test navigateur PNJ en marche + conversation.

### NPC-6 : compatibilité de QuestDirector

- Offres validées par le `QuestDirector`, qui interroge `NPCAvailability` (rôle, emplacement, fenêtre, prochaine présence), pas l'animation/simulateur d'horaires.
- Journal et carte : PNJ en déplacement, destination actuelle, prochain créneau visible, giver de secours **déclaré** si autorisé ; éviter le softlock par PNJ endormi.
- Les interactions de collecte/pêche/travail du PNJ ne fabriquent aucun `QuestGameEventV1` joueur. Seules les réussites transactionnelles du joueur restent preuves des quêtes.
- Tests : accepter le matin, remettre le soir/au domicile, changer d'île et reprendre, PNJ absent/inaccessible et dialogue auteur intact.

### NPC-7 : générateur de vie en suivant le terrain réel

- Après composition de villages/ports/activités, l'index `LocalLifeCapabilityIndex` propose emplois et ancrages physiques. Il réutilise `ContentPlan` et les valideurs de [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md), **sans recréer les maisons ni les parcelles**.
- Attribuer des résidences à proximité **en temps de chemin** et non en distance directe, préserver les `BuildingRecord`/`AmenityRecord`, noms et verrous/suppressions.
- Ajouter une section simple Studio **Vie locale**, densité/horaires/rôles, aperçu 24 h et diagnostics. Édition avancée d'un personnage et son itinéraire en conservant Undo/Redo existants.
- Ne pas modifier `maps/island.project.json` comme effet collatéral ; livrer des copies test en `/tmp` (comme outils audit 92) et vérifier import / compilation / jouer ici.
- Tests : `tests/settlement-local-life.test.mjs` et navigateur `tools/test-npc-life-browser.mjs` ; profils doux, forêt, rivière, caldeira sans village, ancien habitat non V3.

### NPC-8 : animations et ambiance sans surcoût significatif

- Réutiliser les gestes de salutation et travail existants, poses outils si rigs compatibles ; enrichir avec variantes `garden/fish/carry/play/sit` via petits cycles d'os/props temporaires.
- Réutiliser la météo et l'audio contextuel existants : pluie → habitants sous abri/activité intérieure si abri réel ; matin → place active ; nuit → lumières des maisons déjà gérées selon `LightMode`, **pas une lumière dynamique par PNJ**.
- Accès à des événements de village légers (petit marché, musique, rencontre au puits) déclenchés par horaire sans objets visibles hors secteur.
- Les accessoires n'induisent pas production réelle, collision permanente ou nouvelle texture unique pour chaque figurant.

### NPC-9 : sauvegardes, tests de charge, validation

- État canonique sauvegardé : modifications persistantes de routine, indices d'événement réellement nécessaires, éventuelles commandes en route/relations ; **ne pas sauvegarder** toutes les coordonnées dérivables ou le RNG-frame si une projection analytique et graine stable suffisent. Compatibilité `GameSaveV1/V2`.
- Si une quête, porte ou ressource change de propriétaire par migration, préserver identité, progression et dialogues. Le `NPCState` par défaut est une représentation, pas une deuxième sauvegarde d'inventaire.
- Profiler : 0, 10, 30, 60, 100 PNJ sources, 5–25 visibles, écran 1600×900, PC 4–8 Go/IGP ; CPU directeur vs rendu, draw calls, heap et coût de compilation. Ces valeurs sont des **scénarios**, pas une promesse de capacité réelle.
- Mesurer les cas de mouvement rapide en planeur (changements brutaux de cellules/LOD) et transport d'île. Vérifier 20–30 FPS selon budget existant **sur matériel**, sans déclarer le seuil atteint sans mesure.

## 4. Gates de livraison

| Gate | Critère | Lots |
| --- | --- | --- |
| **L0** Baseline | tests main, identités et historiques figés | NPC-0 |
| **L1** Données et route | schémas optionnels + domicile/travail et trajets valides | NPC-1/2 |
| **L2** Temps logique | déplacements jour/nuit proches/loin, transitions sûres | NPC-3 |
| **L3** Première vie | 4 types d'habitants visibles et interactifs | NPC-4 |
| **L4** Dialogues | contexte, graphes auteurs, sessions, barks, effets branchés | NPC-5 |
| **L5** Quêtes | giver mobile sans softlock ni faux événement | NPC-6 |
| **L6** Studio | générateur cohérent, locks, diagnostics, preview | NPC-7 |
| **L7** Finitions | animations, audio, budget et QA ancien PC | NPC-8/9 |

Chaque PR de code : `SPECIFIED → IMPLEMENTED → TESTED → QUALIFIED` ; SHA de `main`, tests lancés, mesures et scénarios de reproduction. Une route trouvée par A* **ne signifie pas** que la navigation est jouable tant que les supports physiques et la collision ne sont pas testés avec le contrôleur réel.

## 5. Recommandation de campagnes

- **Campagne A (NPC-0 à NPC-4)** : un seul village démonstratif, profils et horaires, vrai déplacement sans traversée. Le meilleur lot préalable aux dialogues.
- **Campagne B (NPC-5 et NPC-6)** : conversations/indices basés sur le lieu, disponibilité donneurs de quête ; à intégrer avec Q3–Q5 de la roadmap des quêtes.
- **Campagne C (NPC-7 à NPC-9)** : génération par île et Studio, diversité des habitants, animations, sauvegarde/performance. Une fois validé, enrichir les îles réelles et les récompenses régionales.
- **Extensions** : scènes sociales rares/événements saisonniers, intérieurs complets, personnages voyageurs entre îles, foule dense, futurs instructeurs ski/surf ; après qualification explicite.

**Critères de non-fusion** : PNJ impossible à retrouver, traversée eau/mur, téléport visible, dialogue auteur détruit, mission non réclamable, rechargement modifiant la position de vie, duplication d'argent/ressources, démultiplication des rigs ou baisse de FPS non contrôlée.

La PR de documentation qui héberge ce document ne contient **aucune implémentation de routines ni test runtime**.