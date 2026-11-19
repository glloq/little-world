# NPC Life — Finalisation F01 à F08 (19 novembre 2026)

Statut : **ROADMAP ACTIVE — F01-A, F01-B et F01-C (contrat de révision + retry) codés, qualification en cours**. Branche : `feat/npc-life-finalization-f01-f08`. Baseline : `main` au moment de la création. Cette documentation n'est pas une affirmation de qualification navigateur.

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
| **F02 Agendas** | À FAIRE | Intentions/activités prioritaires déclaratives avec conditions météo/événement et fallback ; horaires V1 préservés | 24 h, 5 jours absents, pause/reprise, minuit, `rate=0`, interruption et changement d'activité |
| **F03 Population** | À FAIRE | Hameaux, ratios habitat/emploi, budget par village/secteur, diversités et ajustement seed stable | 0/3/10/40/100 habitants, pas d'emploi inventé, absence de perte d'édition auteur |
| **F04 Actions métiers** | À FAIRE | Contrat d'activité partagé (requirements, availability, anchor, execution, cosmetics), raccordements aux interactions métier existantes | Gestes sans attribution fictive ; transaction uniquement dans système métier natif ; action ajoutable par catalogue |
| **F05 Dialogues et social** | À FAIRE | Contextes plus riches, barks et scènes sociales légères avec budgets/cooldowns | Pas de blocage des routines ni modification des dialogues auteurs, sous-titres et clavier fonctionnels |
| **F06 Quêtes** | À FAIRE | Étendre le QuestDirector natif : templates, événements métier fiables, solvabilité, donneur mobile, progression/récompense idempotente | Plusieurs familles faisables, aucune quête orpheline, restore/claim une fois, legacy inchangé |
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
