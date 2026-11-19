# NPC Life — Finalisation F01 à F08 (19 novembre 2026)

Statut : **ROADMAP ACTIVE — F01–F03 partiels, F04–F08 démarrés ; Q1–Q5 et génération sociale partiellement raccordés, qualification navigateur en attente.** Branche : `feat/npc-life-finalization-f01-f08`. Baseline : `main` au moment de la création. Cette documentation n'est pas une affirmation de qualification navigateur.

## Contraintes permanentes

- **Réutiliser** `src/npc-life/*`, `src/npc.ts`, `src/settlements/*`, `src/gameplay/*` et les sources V3 de Studio. Aucun deuxième registre persistant, moteur de quêtes parallèle ou script JS de carte.
- Préserver identités, dialogues et objectifs auteurs, les suppressions volontaires, import/export, Undo/Redo et anciennes sauvegardes.
- Ne jamais fabriquer un emploi, un atelier, une récolte, une récompense ou un trajet qui n'existe pas physiquement et logiquement dans le monde. Aucun téléport visible.
- Simulation analytique hors caméra ; navigation coûteuse seulement sur changement de destination ou invalidation, jamais A* dans la boucle de rendu.
- Limite de ressources prouvée par mesures sur PC 4–8 Go ; tests Node/TypeScript/build/Studio navigateur sur **SHA final** avant fusion.
- Documenter distinctement : SPECIFIED / IMPLEMENTED / UNIT_TESTED / BROWSER_TESTED / QUALIFIED.

## Baseline réelle

Existant : 19 rôles, logements/postes qualifiés, génération déterministe conservant les edits, agenda avec jusqu'à trois visites, A* piéton multicouche, replanification bornée, accès portes extérieures, sociabilité par paires, dialogues contextuels, première quête sociale et budget de rigs. Tests ciblés : `tests/npc-life-*.test.mjs`. Les intérieurs et escaliers complets ne sont pas inclus.

## Jalons et critères de sortie

| Lot | Statut initial | Livrable | Gate |
| --- | --- | --- | --- |
| **F01 Navigation** | EN COURS | Contrôles de progression réelle, dernier point sûr, invalidation terrain/porte, reprise après dialogue, obstacle, angle, pont et transitions de secteurs | Aucune traversée, aucun saut proche, replans bornés ; tests unitaires, navigateur et télémétrie |
| **F02 Agendas** | EN COURS | Intentions/activités prioritaires déclaratives avec conditions météo/événement et fallback ; horaires V1 préservés | 24 h, 5 jours absents, pause/reprise, minuit, `rate=0`, interruption et changement d'activité |
| **F03 Population** | EN COURS | Hameaux, ratios habitat/emploi, budget par village/secteur, diversités et ajustement seed stable | 0/3/10/40/100 habitants, pas d'emploi inventé, absence de perte d'édition auteur |
| **F04 Actions métiers** | À FAIRE | Contrat d'activité partagé (requirements, availability, anchor, execution, cosmetics), raccordements aux interactions métier existantes | Gestes sans attribution fictive ; transaction uniquement dans système métier natif ; action ajoutable par catalogue |
| **F05 Dialogues et social** | À FAIRE | Contextes plus riches, barks et scènes sociales légères avec budgets/cooldowns | Pas de blocage des routines ni modification des dialogues auteurs, sous-titres et clavier fonctionnels |
| **F06 Quêtes** | Q1 SOCLE EN COURS | Étendre le QuestDirector natif : templates, événements métier fiables, solvabilité, donneur mobile, progression/récompense idempotente | Plusieurs familles faisables, aucune quête orpheline, restore/claim une fois, legacy inchangé |
| **F07 Studio/génération** | À FAIRE | Panneaux Vie locale/Quêtes, visualisation trajets, édition ancrages/horaires/activités, diagnostic monde complet, compilation | Générer, personnaliser, Undo/Redo, exporter/importer, Jouer ici, régénérer sans écraser auteur |
| **F08 Qualification/perf** | À FAIRE | Bench CPU/VRAM/heap, budgets 10/40/100 PNJ, CI et essais multi-cartes/multi-îles | Mesures PC 4–8 Go et navigation sans erreur, tests / CI verts au dernier SHA |

## F01 — Plan d'exécution détaillé

1. **F01-A : progression et géométrie (CODE + TESTS AJOUTÉS)** — inspection bornée de chaque tronçon réellement traversé ; retour du dernier point sûr utilisable par les pilotes de déplacement ; rejeter paramètres non finis et tronçons malformés. Ajouter tests de bords, obstacles mobiles et angles. Ne pas remplacer A*.
2. **F01-B : intégration runtime (CODE + TESTS UNITAIRES DE LA DÉCISION AJOUTÉS)** — utiliser l'information de dernier point sûr lors de déplacement commandé et routine proche, arrêter avant obstacle, conserver l'intention ; replan depuis la position réelle sur cadence plafonnée.
3. **F01-C : invalidation (CODE PARTIEL + TESTS AJOUTÉS)** — changement de version de relief, porte, chemin ou collision rend les segments planifiés suspects ; valider le tronçon et recalculer au changement d'état, sans replan en boucle.
4. **F01-D : scénarios complexes** — ponts superposés, carrefours, hameaux, porte temporairement ouverte, PNJ en discussion, changement brutal d'heure/secteur, croisement de deux PNJ.
5. **F01-E : qualification** — tests Node + TypeScript + build + navigateur ; métriques `blocked/replanned/recovered`, capture d'une journée complète, absence de traversée ou de téléport visible.

F01 ne sera marqué **QUALIFIED** qu'une fois les cinq sous-lots démontrés. Les intérieurs complets, les escaliers et les foules denses relèvent de futurs lots optionnels.

## Matrice de validation finale

Cartes : hameau 3–5 maisons, village agricole, forêt, montagne avec pont, port marchand, île déserte. Vérifier avec seeds fixes : génération deux fois identique, traversabilité, absence de softlock, dialogues, quêtes, sauvegarde/restauration, édition manuelle préservée, budget CPU/GPU.

## Fichiers de travail prévus

- F01 : `src/npc-life/dynamic-route.ts`, `routes.ts`, `layered-routes.ts`, adaptateur runtime et `tests/npc-life-dynamic-route-v3.test.mjs`.
- F02–F05 : `schedule.ts`, `agenda.ts`, `generation-agenda.ts`, `population.ts`, `capabilities.ts`, `social.ts`, `dialogue.ts`, `gestures.ts`.
- F06 : `quest-director.ts`, `src/gameplay/*`, modules `src/quests/*` seulement s'ils réutilisent les contrats existants.
- F07–F08 : `src/studio/*`, `src/studio-core/*`, tests E2E et benchmarks.

## Journal

- 2026-11-19 : audit du dépôt, création de la roadmap, début de F01-A.

- 2026-11-19 : F01-B raccordé dans `src/npc-view.ts`, via `residentScriptedAdvance`. Le PNJ avance seulement jusqu'au point physiquement sûr, puis replanifie depuis cette nouvelle position. Les sauts >12 m sont refusés. Tests régressifs obstacle/angle/suspension ajoutés. **CI et playtest navigateur encore à qualifier**.

- 2026-11-19 : F01-C : `NPCLifeOptions.navigationRevision` optionnel, `residentReplanDue`, reprise depuis le point réellement atteint, replanification plafonnée à une tentative par seconde après blocage, trois échecs consécutifs maximum, sans saut de rattrapage. Les collisions sont toujours échantillonnées en direct même sans signal de révision. **Reste** : raccorder la révision au producteur réel de mutations terrain/portes/chemins, scénarios navigateur et CI.

## Nouvelles évolutions de cette branche

- **F01-C — portes réelles :** `createResidentNavigationRevisionTracker()` compte seulement les transitions d'état des portes observées, y compris l'ouverture temporaire des PNJ et la fermeture automatique. `game-view.ts` expose `navigationRevision` ; `main.ts` le transmet à `npc-view.ts`. Une porte éloignée ne déclenche pas A* si le parcours devant le PNJ reste praticable. Les routes longues après suspension ne franchissent jamais plus de 12 m non vérifiés. Raccordement terrain/chemins à chaud non terminé ; au chargement de nouveaux projets, le moteur est reconstruit normalement.
- **F01-D — tests unitaires :** cas de révisions des portes, obstacle inséré, dernier point sûr, virage, cadence et reprise de suspension. Restent collisions entre PNJ, playtests de ponts/portes et validation navigateur à 10/40/100 habitants.
- **F02 — début :** `MAX_RESIDENT_DAILY_STOPS=5` dans `schedule.ts`, Studio et validateur d'auteur ; agenda borné compatible V1. Les fenêtres générées de repas/rencontres s'adaptent aux horaires réels du métier (pêcheur matinal, etc.). Reste : conditions météo/événements, intention prioritaire et interruptions complexes.
- **F03 — début :** `residentPopulationTargets()` permet un poste réel pour un hameau de 3–5 maisons selon densité ; les villages plus grands augmentent la cible de postes jusqu'à 12 en haute densité, sous réserves des vrais emplois disponibles et du plafond global de 100 personnages. Aucun emploi fictif ajouté. Reste : intégration géographique multi-village, budgets par secteur et QA des éditions auteur sur redimensionnement.

**État de qualification :** code et tests ajoutés/poussés ; tests Node, TypeScript, build et navigateur non certifiés sur le SHA de cette mise à jour. Ne pas fusionner avant CI verte et playtest.

- 2026-11-19 : F01-D : les routeurs `routes.ts` et `layered-routes.ts` revalident les tronçons lors d'une demande de trajet. Si le plus court chemin issu du graphe initial est devenu bloqué, une seconde recherche A* bornée inspecte les arêtes réelles pour trouver une alternative ; les supports de pont sont vérifiés en direct et ne peuvent rester « fantômes » après suppression. Ajout de tests sur détours, absence de détour et disparition/réapparition de ponts.
- 2026-11-19 : F02 : règle de présentation `residentWorkMode` ; sous la pluie, certains métiers extérieurs suspendent leurs gestes de travail (sans transaction ni téléportation). Les autres métiers continuent normalement. Il ne s'agit pas encore d'un ordonnanceur météo avec déplacement vers un abri.
- Limitation de qualification : la CI est relancée à chaque push et annule les jobs plus anciens. Les suites Node et builds étaient vertes sur des commits intermédiaires ; conserver le dernier SHA stable jusqu'à confirmation des checks et des scénarios navigateur.

- 2026-11-19 : F02 — activités Studio V1 enrichies d'une condition météo optionnelle `any/dry/rain`. Le moteur d'agenda ne suit un arrêt que si la condition est satisfaite ; sinon il conserve la position au poste réel. Validation de schéma, tests de pose sèche/pluie et de sauvegarde auteur ajoutés. Les transitions à proximité passent toujours par le garde-fou physique `residentRoutineStepClear` et la récupération existante ; aucun transport instantané n'est volontairement créé. **Conditions météo seules implémentées : priorité générale, événements et abris restent à faire.**

## F06 — Démarrage du moteur de quêtes, sous-lot Q1 uniquement

- `src/quests/schema.ts` : contrats déclaratifs de `QuestTemplateV1`, étapes, récompenses, événements, commandes, catalogue, instances et configuration d'offres. Les objectifs historiques `ObjectiveDefinition` ne sont PAS remplacés.
- `src/quests/validation.ts` : validateurs fermés, tailles/compteurs bornés et rejet d'instructions inconnues.
- `tests/quests-schema.test.mjs` : schéma valide, champs inattendus, injections de scripts, mauvais rôles/quantités, événements et compteurs persistants.
- **Non implémenté** : Q2 producteurs d'événements authentifiés ; Q3 progression ; Q4 claims atomiques ; Q5 UX ; Q6 solvabilité ; Q7 génération ; Q8 Studio ; Q9–Q11.
- Ces fichiers de contrats sont passifs et n'attribuent jamais de récompense ni n'émettent de faux succès. Le runtime historique reste seul propriétaire des objectifs déjà jouables.

## F01 — Régressions et corrections CI

- Deux tests de franchissement de pont ont initialement échoué lors du renforcement de `layered-routes.ts`. La vérification distingue désormais entrée en rampe, sortie de tablier et terrain au-delà de l'emprise du pont. Test de pont supprimé/réinstallé ajouté.
- Le dernier SHA doit encore être qualifié sur la totalité des tests et browser checks ; aucun commit antérieur annulé ne vaut preuve de réussite finale.

## F03 — Réduction de densité

- Préserver les résidents édités volontairement même si leur ancien créneau de génération disparaît, conserver leur source/dialogue et réserver leur logement/poste avant de générer des nouveaux.
- Limiter les nouveaux résidents à la borne de 24 records d'implantation, en tenant compte des services et des résidents protégés.
- Ajouter test de réduction haute → basse densité et protection des personnages auteur.

## Campagne F04–F08 : progression intégrée (état non qualifié au navigateur)

| Chantier | État de code | Preuve et limite |
| --- | --- | --- |
| F04 Métiers | **PARTIEL** | `src/npc-life/profession-actions.ts` : catalogues de services/gestes reliés aux postes vrais ; aucune économie fictive. Une production PNJ native avec transactions reste à construire. |
| F05 Dialogue et social | **PARTIEL** | Répliques selon repas, repos, jeu, course, météo et métier ; choix auteurs conservés, tests ajoutés. Groupes persistants, dialogues entre plusieurs PNJ et barks restent à construire. |
| F06 Q1 | **CODE AJOUTÉ** | `src/quests/schema.ts`, `validation.ts` : catalogues, templates, instances, récompenses et événements strictement validés ; tests `quests-schema`. |
| F06 Q2 | **PARTIEL** | `gameplay/dialogue-session.ts`, `gameplay/game-view.ts`, `main.ts` : événements seulement après choix valide, grant de récolte, achat, pêche créditée ; visite calculée à 1 Hz par position réelle. Mine/ferme/atelier/course/ferry encore à raccorder à leurs commits natifs. |
| F06 Q3 | **PARTIEL** | `quests/progress.ts`, `director.ts` : acceptation, étapes ordonnées, compteurs, contrôle source/île/distance, anti-replay et quotas. Pas de chaînes complexes ni commandes de livraison atomique. |
| F06 Q4 | **PARTIEL** | `GameSaveV2.questsLocal?` + séquence d'événements optionnelle ; remboursement/claim d'objets et de pièces via `runtime.grantItems` atomique et donneur à portée, sauvegardés dans un même manifeste. Déblocages cosmétiques et claims inter-îles exclus tant que leur autorité transactionnelle n'est pas branchée. |
| F06 Q5 | **PARTIEL JOUABLE** | `quests/dialogue.ts`, `ui/journal/journal.ts`, `ui/app/game-ui.ts` : offre, acceptation, progression, notification de récompense, journal et carte en réutilisant la fenêtre PNJ et les données legacy. Tests Unitaires, QA navigateur à effectuer. |
| F06 Q6–Q7 | **SOCIAL SEULEMENT** | `quests/generator.ts` : génération déterministe de missions de rencontre uniquement si PNJ réels, dialogues et routes qualifiées. Réutilise `npc-view` router, ignore villages sans preuve. Catalogues métier/régional/inter-îles, solvabilité ressources non terminés. |
| F07 Studio | **PARTIEL** | Prévisualisation météo des visites et intention professionnelle, edition des 5 activités ; génération universelle des quêtes directement dans Studio, overrides/locks et audit monde restent à construire. |
| F08 Perf | **OUTIL AJOUTÉ** | `node --experimental-strip-types tools/bench-npc-life.mjs` : microbenchmark CPU sans GPU sur 10/40/100 PNJ. La preuve PC 4–8 Go, Chromium réel et budgets FPS n'est pas acquise. |

### Conditions de fusion impératives

1. Vérifier que le **dernier SHA** passe `npm test`, `npm run build`, les scripts navigateur et les anciens tests d'inventaire/dialogue/économie.
2. Playtest : accepter mission PNJ → parler à une vraie cible → journal `ready` → retour près du donneur → récompense unique → sauver/recharger sans double attribution ; vérifier sac plein et refus de récompense.
3. Vérifier stabilité de génération sous permutation des habitants, suppression/ajout d'un pont, secteurs manquants, changement de densité et protection des dialogues/PNJ auteurs.
4. Ne pas annoncer « F01–F08 terminés » avant événements métiers restants, scénarios navigateur dédiés, Studio complet, quêtes régionales/inter-îles et benchmark hardware.

### Invariants techniques de la verticale sociale

- Les anciennes `ObjectiveDefinition` et leurs actions restent intactes. Les quêtes générées sont des entrées optionnelles de la même interface de journal, stockées dans `questsLocal?`.
- Le QuestDirector ne reçoit jamais une animation PNJ comme récolte du joueur. Tous les événements lui parviennent par un adaptateur natif après succès d'action.
- Le stockage des pièces et objets est celui de `runtime.grantItems`, validé entièrement avant crédit ; un claim `ready → claimed` est synchronisé au même manifeste de sauvegarde que l'inventaire.
- Aucune mission n'est créée sans PNJ présent, dialogue jouable et itinéraire retourné par le routeur existant ; maximum 12 offres sociales par île.
- Une récompense cosmétique non supportée est rejetée intégralement plutôt que silencieusement substituée.

## Consolidation ultérieure — livraison, lieux et disparition de PNJ

- **Q4 Livraison** : `gameplay.deliverQuest(instanceId,targetId)` vérifie le PNJ destinataire réel, sa portée et l'occlusion ; retire les objets uniquement par `runtime.grantItems` atomique puis émet `quest.delivered` après succès. Choix « Livrer les objets demandés » dans la fenêtre native, avec reprise en cas de stock insuffisant. Test dialogue livraison/retry/double débit.
- **Q6 Référence perdue** : `QuestDirector.reconcileNpcAvailability` suspend une quête acceptée si son donneur ou interlocuteur disparaît, puis la réactive au retour du même ID. La progression et les récompenses restent sauvegardées, aucun accomplissement fictif.
- **Q7 Génération** : en plus de la rencontre, une famille « découvrir un lieu de travail » exploite exclusivement des ancrages d'entité compilés, effectivement positionnés, reliés par le routeur de PNJ et situés à 300 m maximum. Répartir le budget en 8 rencontres + 4 visites (12 offres/île maximum). Aucun point de quête fabriqué pour les zones sans entité positionnée.
- **Événements** : courses validées `race.finished` post-franchissement final (durée mesurée) et test de non-régression des événements de vente/achat. Pas de résultat basé sur l'animation des PNJ.
- **Gates encore ouvertes** : tests navigateur sur le dernier SHA, visualisation Studio universelle des quêtes, événements exploitation minière/agricole/ateliers, chaînes régionales, professions économiquement transactionnelles et benchmarks matériels 4–8 Go.

