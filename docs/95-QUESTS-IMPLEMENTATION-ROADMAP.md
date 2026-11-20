# 95 — Roadmap d'implémentation : quêtes automatiques par île et PNJ

**Statut : ROADMAP / SPECIFIED (18/11/2026) — documentation seule, aucune fonctionnalité nouvelle prétendue livrée.**  
**Branche de conception** : `docs/quest-director-island-generation-roadmap`, créée sur `main@f84c16cd` (PR #75 fusionnée).  

**Dépendance PNJ étendue (non livrée)** : [96 — audit des déplacements/horaires/dialogues](96-NPC-LIFE-DIALOGUES-SCHEDULE-AUDIT.md), [97 — lots NPC-0 à NPC-10](97-NPC-LIFE-IMPLEMENTATION-ROADMAP.md). Q3–Q5 peuvent commencer avec des donneurs fixes ; avant Q7–Q9, le générateur doit savoir quel PNJ possède un rôle et où/comment le retrouver (domicile, poste, disponibilité) et refuser un donneur inaccessible. Les gestes professionnels ne prouvent jamais une récolte/production du joueur.

Références : [93 — Audit/choix](93-QUESTS-AUDIT-ISLAND-INTEGRATION.md), [94 — Contrats](94-QUESTS-DATA-EVENTS-REWARDS.md), [92 — Mondes complets/audit jouabilité](92-COMPLETE-WORLDS-STUDIO-AUDIT.md), [91 — Activités guidées](91-GUIDED-ACTIVITIES-RACES-ALPINE-MUSIC.md), [81–82 — Économie/roadmap](81-ECONOMY-PRODUCTION-CONTRACTS.md), [79 — Archipel](79-ISLAND-ROADMAP-VALIDATION.md).

## 0. Définition de terminé

Une île créée/publicable possède un catalogue reproductible de quêtes **faisables** ; ses PNJ existants proposent des missions variées ; le joueur peut accepter, progresser par vraies actions, voir les compteurs dans le journal, remettre, recevoir **une fois** les récompenses, sauvegarder/reprendre et changer d'île sans régression. Studio explique toutes les candidates rejetées et respecte les contenus/retouches auteur. Les sports non jouables et équipements futurs sont masqués ; aucune nécessité de serveur pour la première livraison.

**Règles transversales** : une seule économie/inventaire, un seul moteur d'activités, pas d'IA/LLM, pas de JS de carte, aucune mission impossible « pour faire du volume », aucune modification destructive de `maps/island.project.json`, pas de code réseau en phase solo, priorité à performances PC 4–8 Go.

## 1. Dépendances et lotissement

~~~text
Q0 audit/base
  └── Q1 types + commandes
       ├── Q2 événements authentifiés
       │    └── Q3 moteur de progression, étapes, dialogues legacy
       │         └── Q4 sauvegardes + attribution atomique
       │              └── Q5 UX PNJ + journal (démonstrateur jouable)
       └── Q6 index des capacités + preuves locales
            └── Q7 générateur déterministe
                 └── Q8 Studio / compilation / diagnostics
                      └── Q9 quêtes métiers, défis et récompenses régionales
                           └── Q10 quêtes inter-îles + progression portable
                                └── Q11 qualification, optimisation, publication
Q12 sports complémentaires (ski qualifié / surf implémenté) : après leurs événements natifs
Q13 multi autoritaire : uniquement sur décision ultérieure
~~~

**Ordre de livraison recommandé** : Q0→Q1→Q2→Q3→Q4→Q5 pour valider une boucle verticale sur l'île historique, puis Q6→Q7→Q8 pour les îles générées, puis Q9→Q10→Q11. Les validateurs de Q6 peuvent démarrer en parallèle de Q2 **uniquement après gel du schéma Q1**. Ne pas implémenter la génération « intelligente » tant que les événements réels et les claims ne sont pas fiables.

## 2. Tableau exécutable des étapes

| Lot | Prio | Travail principal | Gate / preuve de sortie |
| --- | --- | --- | --- |
| **Q0 — Baseline main** | P0 | Vérifier merge #75, schémas, contenus, cartes, scripts et tests ; construire matrice réel / prévu / non livré | SHA main archivé ; tests baseline ; aucun faux « surf/quête auto implémentés » |
| **Q1 — Contrats purs** | P0 | Types/template/instance/commande/résultat/event/diagnostics ; parsers, versions et limites | Import malformé rejeté ; IDs uniques ; API stable |
| **Q2 — Pont d'événements métier** | P0 | Émettre des succès seulement après commit : PNJ, collecte, pêche, mine, ferme puis atelier/marché/course | Tests succès, refus, plein, doublon, origine |
| **Q3 — QuestDirector V1** | P0 | Acceptation, états, étapes, compteurs, source explicite, remise, anciens objectifs compatibles | Suite parler→cueillir→livrer sans faux progrès |
| **Q4 — Persistance + claims** | P0 BLOQUANT | Journal d'événements, récompense atomique et idempotente, save locale V1/V2 migrée | Double claim/refresh/import : une seule récompense ; sac plein : retry sûr |
| **Q5 — PNJ + journal** | P0 | Dialogue QuestGiver optionnel, marqueur, compteurs, carte, notifications, récompenses | Mission complète PC, clavier + contrôle UI ; 14 anciennes quêtes conservées |
| **Q6 — Capabilities** | P1 BLOQUANT pour génération | Sources réelles, accès, producteurs, outils, stations, liens ; solvabilité/cycles/incertitude | Aucun candidat déclaré faisable s'il manque outil, source, PNJ ou trajet |
| **Q7 — Générateur auto** | P1 | Templates + seed stable, binding ressources/PNJ/lieux, score diversité, quotas, rotation | Même entrée → mêmes offres ; profils distincts produisent contenu cohérent |
| **Q8 — Studio / compile** | P1 | Paramètres, aperçu, raisons de rejet, overrides/locks, payload compilé optionnel | Recompilation identique, retouches préservées, nouvelles îles testables |
| **Q9 — Métiers + régional** | P1 | Chaînes agriculture/farine/cuisine, mine/forge, commerces, défis de vol/course, objets régionaux **fonctionnels** | Étapes multiples et rémunération contrôlée, item/skin effectivement utilisable |
| **Q10 — Archipel** | P1/P2 | Quêtes A→B→A, état portable, provenance commerce/transport, journal de transaction durable | Retour et refresh sur chaque île sans perte/double gain |
| **Q11 — Qualification/perf** | P1 | Régressions sur île 4×3 km, îles guidées, publication, mesures et CI | Quêtes faisables au contrôleur réel ; frame/heap non dégradés |
| **Q12 — Extensions sport** | FUTUR/conditionnel | Ski et surf seulement après boucle jouable/événement/contrat équipement | Aucune quête sport non jouable générée |
| **Q13 — Multijoueur** | FUTUR | Serveur autoritaire, ownership, journal idempotent et coopération | Jamais requis par Q0–Q11 |

## 3. Détails par lot : points de code et tests

### Q0 — Synchronisation et baseline (bloquant)

- Lire `AGENTS.md` ; relire `docs/92` et les fichiers du merge #75, le code générateur récent (`src/studio-core/birth-port.ts`, `src/settlements/services.ts`, `src/settlements/local-life.ts`, `src/studio-core/world-onboarding.ts`, courses et neige).
- Collecter au minimum : `npm test`, `npm run typecheck`, `npm run build`, `node tools/audit-island-playability.mjs` et `node tools/report-world-profiles.mjs` ; enregistrer SHA + versions. Ne pas copier comme résultats actuels les 824 tests historiques de [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md).
- Contrôler que `main` n'a pas changé avant de démarrer une branche **d'implémentation** distincte de cette branche docs ; si oui synchroniser par merge/rebase non destructif et refaire audit différentiel.
- Prouver qu'aucun générateur existant n'est doublé et que les objectifs de l'île historique et les zones retouchées sont préservés.

### Q1 — Schémas et compatibilité

**Créer** `src/quests/schema.ts`, `src/quests/validation.ts`, `src/quests/diagnostics.ts` et tests `tests/quests-schema.test.mjs`. Réutiliser les validateurs/`identifier` de `src/gameplay/schema.ts` quand compatibles ; ne pas permettre des templates JSON avec fonctions. Définir contrats `QuestTemplateV1`, `QuestCatalogEntryV1`, `QuestInstanceV1`, `QuestGameEventV1`, `QuestCommandV1` et méthodes de lecture d'état. Préciser bornes explicites (étapes, chaînes, identifiants, quantité, taille mémoire, nombre de répétitions).

**Gate Q1 :** anciens fichiers Studio/compilés/saves sans champ quêtes restent valides ; fichiers mal formés, références mortes et variantes de données invalides sont refusés ; même template normalisé = même hash.

### Q2 — Contrats d'événements

**Créer** `src/quests/events.ts` + éventuel adaptateur `src/gameplay/quest-events-adapter.ts` et tests `tests/quests-events.test.mjs`. Ajouter des émissions **après succès** aux points existants (pas de patch direct depuis le journal) :

- `src/main.ts` : capture de poisson réellement attribuée ; fin de course issue de `advanceRace` ; arrivée de ferry restaurée.
- `src/gameplay/gathering.ts` : événement après `deps.grant` validé et mutation de récolte.
- `src/gameplay/activity-runtime.ts` : extraction/récolte après résultat accepté, sans compter une frappe partielle.
- `src/economy/workshop-services.ts` : produit collecté ; `src/economy/island-markets.ts` : achat/vente atomique.
- `src/gameplay/dialogue-session.ts` et/ou `runtime.ts` : dialogue authentifié et choix stable ; éviter un événement à chaque re-render.

Pas d'émission en cas d'outil manquant, interaction hors portée, prise non créditée, sac plein, minage sans production, pêche ratée ou course interrompue.

**Gate Q2 :** tous les producteurs ont IDs uniques/réessayables, origine et contexte ; tests sur fausses répétitions et limites. Ne pas faire du diff d'inventaire la source unique de vérité.

### Q3 — Moteur de quêtes et première verticale

**Créer** `src/quests/director.ts`, `src/quests/templates.ts`, `src/quests/progress.ts`, tests `tests/quests-director.test.mjs`. Actions minimales `offer/accept/consumeEvent/deliver/claim` + état `available/active/ready/claimed` ; étendre annulé/suspendu seulement avec usages prouvés.

Construire manuellement pour tests cinq templates de base : parler, visiter, récolter N, pêcher N, livrer N. Le premier démonstrateur peut s'appuyer sur **l'île historique**, ses 32 PNJ/14 objectifs et les sources existantes, mais **sans modifier les 14 objectifs eux-mêmes**. Une nouvelle quête auto/manuelle doit être distincte et se raccorder au journal.

**Gate Q3 :** événement de pêche acheté/refusé ne compte pas ; acquisition « any » accepte le stock seulement si explicitement permis ; étapes validées dans l'ordre ; quête après recharge retrouve son compteur ; zéro mutation non autorisée.

### Q4 — Claims, migrations, équipements et sauvegardes (bloquant)

**Modifier prudemment** `src/gameplay/save.ts`, `save-blobs.ts` si volume justifié, `src/gameplay/game-view.ts`, `src/gameplay/runtime.ts` via un port transactionnel. **Créer** `src/quests/rewards.ts`, `persistence.ts` et `tests/quests-persistence.test.mjs`, `tests/quests-rewards.test.mjs`.

Garder `GameSaveV1/V2` compatibles et tester `questLocal?` facultatif ; la récompense doit être appliquée atomiquement avec `claimed` et ledger de commande, ou utiliser recovery explicite. Les outils doivent être validés par `ItemDefinition`/`equipment.setHands/setHead` ; les skins par leur propre registre de déblocages, pas par le sac. Le `maxQuantity` de l'outil et le plafond de `coin` sont bloquants, pas ignorés.

**Gate Q4 :** gain uniquement une fois pour deux appels identiques, reload, export/import et coupure après préparation ; sac plein conserve `ready` ; aucun solde négatif ; aucun équipement promis sans mode d'usage réel.

### Q5 — PNJ, dialogues, UI et journal

**Adapter** `src/settlements/local-life.ts` (lien optionnel au rôle), `src/gameplay/dialogue-session.ts`, `src/npc.ts` / `npc-view.ts` seulement si nécessaire, `src/ui/journal/journal.ts`, `src/ui/app/game-ui.ts` et carte. Afficher proposition et conditions, accepter/refuser, résultat/étapes x/y, récompense, position du donneur ; ne pas surcharger les choix historiques ni recalculer l'île à chaque dialogue.

**Gate Q5 :** un même hôte de village peut présenter les options d'origine puis une quête sans perdre son dialogue ; journal legacy identique, notifications une fois, UI clavier/mobile sur petits écrans ; pas de second canvas WebGL.

### Q6 — Disponibilité et graphe de dépendances

**Créer** `src/quests/capabilities.ts`, `src/quests/reachability.ts`, `src/quests/solvability.ts`, tests `tests/quests-capabilities.test.mjs` et `tests/quests-solvability.test.mjs`. **Réutiliser** `src/studio-core/world-audit.ts` et `src/studio-core/terrain-access.ts`, le code eau/relief, `src/gameplay/gathering.ts`, `fishing-data.ts`, `mine/*`, `farm/*`, `economy/*`, `gameplay/races.ts`, `src/archipelago/registry.ts`.

Distinguer trois états `KNOWN / POSSIBLE_NEEDS_REVIEW / UNAVAILABLE`. Ne pas confondre : arbres visuels et arbres récoltables ; recette disponible et atelier jouable ; parcelle PNJ et parcelle joueur ; quai et ferry publié ; terrain enneigé et ski certifié ; lac et berge accessible ; objet en catalogue et source d'obtention.

**Gate Q6 :** supprimer pioche, canne, rive accessible, source d'ingrédient, pont ou ferries publiés → la candidate correspondante est rejetée avec un code explicite. Cycles impossibles détectés, contenu historique préservé.

### Q7 — Générateur d'offres

**Créer** `src/quests/generator.ts`, `src/quests/ranking.ts`, `src/quests/catalog.ts` et `tests/quests-generation.test.mjs`. La seed est issue des identités/version de l'île et du modèle ; variations bornées uniquement parmi les étapes prouvées faisables. Pondérer découverte, diversité, rôle PNJ, distance, coût de déplacement, métier et historique du joueur.

Mesurer trois configurations (faible/normale/riche) ; pas de quota « 20 quêtes minimum » si le contenu est insuffisant ; ne pas faire apparaître un PNJ fictif ou une récolte fantôme pour compléter la grille.

**Gate Q7 :** entrée identique → bytes du catalogue identiques ; ordre d'objets permuté → sortie canonique identique ; deux îles avec capacités différentes → missions différentes ; régénération n'altère pas une quête acceptée.

### Q8 — Studio, source/compilé et contrôle auteur

**Modifier** `src/studio-core/types.ts`, `schema.ts` (clés optionnelles strictement validées), `src/world-compiler/compile.ts`, `manifests.ts`, `load.ts`, `src/gameplay/project-adapter.ts`, `src/studio/*` et audit existant. Ne pas ajouter un schéma V3 concurrent : étendre les bibliothèques/profil de génération avec provenance, version, overrides, exclusions et lock auteur.

Panneau **Quêtes** : génération activée, densité, niveaux, familles, plafonds, aperçu/carte, donneurs choisis, rejets et raisons, mode édition manuelle, regénération **non destructive**. Relier au flux « composer les pôles → vérifier activité/accès → quêtes → compiler ». Aucun nouveau champ obligatoire dans les anciens projets.

**Gate Q8 :** édition d'un village ne détruit pas ses quêtes auteur ; générer deux fois est stable ; déplacer/supprimer une station invalide proprement sa quête ; importer/exporter et « Jouer ici » préservent identifiants et progression.

### Q9 — Quêtes avancées et objets régionaux

Familles : agriculture (blé→farine→pain), mine (pierre/fer→fonderie→forge), économie (commerce local), cours de vol/roulade, exploration de sites qualifiés ; récompenses locales puis régionales en ordre de difficulté 0–5. L'équipement de tête/mains est utilisable ; dos/pieds restent exclus tant qu'implémentation réelle absente. Cosmétiques `FlightProgress` débloqués par l'API autoritaire et persistance explicite.

**Gate Q9 :** plusieurs étapes autonomes, progression partielle, provenance correcte, pas d'achat/revente exploitant les prix, outil déjà possédé avec alternative contrôlée, reward unique reproductible.

### Q10 — Quêtes de l'archipel

Réutiliser `src/archipelago/transit.ts`, `portable-inventory.ts`, `cargo-logistics.ts`, `registry.ts` et la séparation `worldId/islandId`. Les quêtes de transport ne doivent jamais supposer qu'une île non publiée est visitable. Garder le journal global de quêtes multi-îles hors des saves locales, comme la progression portable, et définir transaction/recovery non ambiguë.

**Gate Q10 :** trajet A→B→A, refresh à chaque étape, reprise d'une cargaison/d'une récompense, port non disponible, stock plein, item étranger, commande rejouée : état cohérent, gain unique, pas d'objet perdu.

### Q11 — Qualification finale, tests et benchmarks

**Tests unitaires attendus** : `tests/quests-*.test.mjs` + régressions `tests/gameplay.test.mjs`, `tests/save-v2.test.mjs`, `tests/npc.test.mjs`, `tests/economy*.test.mjs`, `tests/fishing.test.mjs`, `tests/races.test.mjs`, `tests/island-transit.test.mjs`, `tests/settlement*.test.mjs` selon fichiers présents.

**Intégration** : `npm test`, `npm run typecheck`, `npm run build` ; audit `node tools/audit-island-playability.mjs`, rapports de profils `node tools/report-world-profiles.mjs`. Ajouter un test navigateur dédié (par exemple `tools/test-quests-browser.mjs`) plutôt que déclarer que les tests anciens couvrent automatiquement les dialogues produits. Valider manuellement les parcours sous vrai contrôleur de déplacement.

**Matrice de qualification** : île historique inchangée ; île douce port+village+champ ; île de rivière/forêt+comptoir ; île alpin avec ski non déclaré en compétition ; île caldeira où village manque ; île sans PNJ ; île sans mine ; port non publié ; ancienne save V1/V2 ; écran petit et PC 4–8 Go. L'île doit pouvoir rester volontairement calme/peu garnie.

**Performance** : aucun recalcul géographique par frame, index type d'événement, taille bornée de journal/données, aucune nouvelle entité 3D requise pour une quête. Benchmarks **à mesurer** : temps compile/génération, mémoire avant/après, temps dialogue/journal, impact frame CPU sur vrai vieux PC ; pas de chiffres FPS annoncés par la présente spec.

### Q12 / Q13 — Livraisons ultérieures non bloquantes

- **Ski** : utiliser ses événements de victoire seulement après un mode compétitif/évaluation validé ; ne pas confondre `snow-slide` et `race.finished`.
- **Surf** : attendre une mécanique de vague/board/score réellement intégrée ; la mer, le bateau et le snowboard ne suffisent pas.
- **Multijoueur** : port d'autorité serveur, validation de commandes joueurs, journal/event IDs, droits, progression personnelle ou collective ; aucune modification obligatoire du client solo pour Q0–Q11.

## 4. Gates d'avancement

| Gate | Exigence | Passage |
| --- | --- | --- |
| G0 — Référence | Baseline `main` après PR #75, audit 92 intégré | Q0 |
| G1 — Événements | Événements authentifiés, versions, limites | Q1–Q2 |
| G2 — Verticale solo | Quête PNJ→action→livraison→récompense unique, save/reprise | Q3–Q5 |
| G3 — Faisabilité | Capacités réelles, accès, prérequis, cycles et reasons | Q6 |
| G4 — Génération | Catalogue déterministe, diversité et refus corrects | Q7 |
| G5 — Studio | Config/aperçu/compile/versionnage et source auteur protégée | Q8 |
| G6 — Richesse | Chaînes métiers, courses et équipement régional utilisable | Q9 |
| G7 — Voyage | A→B→A durable, transactions idempotentes | Q10 |
| G8 — Publication | Tests end-to-end, mémoire/CPU, aucune régression 4×3 km | Q11 |

Pour chaque phase : **SPECIFIED → IMPLEMENTED → TESTED → QUALIFIED**, associer SHA/branche, fichiers, commande et résultats ; un rendu de prévisualisation ou une compilation réussie **ne qualifient pas** l'accessibilité ni les FPS.

## 5. Première campagne recommandée et séparation des branches

1. **Branche docs actuelle** : uniquement décisions, contrats, roadmap, liens de navigation — **aucune fonctionnalité livrée**. Ouvrir une PR vers main, relire puis merger.
2. **Branche implémentation A** (depuis main à jour) : Q0–Q5. Mission démonstrative auprès d'un PNJ existant ; collection locale, capture de truite et livraison ; tests et UI. Aucun générateur complet requis à ce stade.
3. **Branche implémentation B** : Q6–Q8. Génération de 2 îles aux capacités contrastées à partir des outils du merge #75 et audit des refus ; configuration/édition Studio.
4. **Branche implémentation C** : Q9–Q11. Quêtes métiers/régionales, transport entre 2 îles effectivement publiées, perf et qualification avant publication.
5. **Extension ultérieure** : ski qualifié, surf jouable, multijoueur si demandé.

**Stop conditions** : ne pas fusionner une phase si sauvegarde duplique des récompenses, si une quête réclame une ressource introuvable, si une île générée modifie les sources historiques/retouches, ou si le studio dit « prêt à jouer » alors que les accès et conditions de succès n'ont pas été testés.

## 6. Registre des risques

| Risque | Protection / propriétaire |
| --- | --- |
| Récompense double après refresh/voyage | Q4/Q10 : ledger durable et commit atomique/recovery |
| Mission impossible par générateur optimiste | Q6 : preuve de source et d'accès, diagnostic de refus |
| Désynchronisation avec nouvelles îles | Q0/Q8 : suivi de main et schéma optionnel compilé |
| Dérive des quotas/monnaie | Q7/Q9 : limites, coûts réels et cooldown |
| Régression de quêtes historiques | Q3/Q5/Q8 : namespace auto et tests fixture des 14 objectifs |
| Promesse d'activité future | Q2/Q12 : feature/capability gates stricts |
| Consommation CPU/GPU sur vieux PC | Q7/Q11 : calcul événementiel, pas de tick 3D supplémentaire |
| Migration de save corrompue | Q4/Q10 : parse strict + compat ancienne + export/import |
| Suppression de missions lors de retouche | Q8 : source prioritaire, provenance/verrouillage, suspend/migration |
| PNJ noyés sous trop d'offres | Q5/Q7 : 1–2 propositions/PNJ et regroupement journal |

**Livrables attendus en fin de campagne** : types + moteur pur + émetteurs d'événements + tests déterministes + adaptateurs UI + persistance + audit de faisabilité Studio + rapports de jouabilité et de perf + deux îles d'exemple, sans serveur.

## Missions des îles publiées

- Aux Cimes, l’habitant du port propose **Première descente aux Cimes**. Une course de ski validée débloque la récompense.
- Aux Moissons, l’habitant propose **Les premières carottes**. Le journal situe la parcelle du joueur, puis l’habitant à qui remettre une carotte. La quête avance à la récolte effective, à la livraison et à la remise de la récompense via les services existants.
