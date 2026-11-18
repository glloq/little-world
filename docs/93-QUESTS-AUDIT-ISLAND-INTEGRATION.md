# 93 — Quêtes automatiques : audit du main et décisions d'intégration

**Statut : AUDITED / DECIDED / SPECIFIED — documentation uniquement, aucun moteur de quêtes livré par ce lot.**  
**Base vérifiée : `main` au commit `f84c16cdbaa6faeacbe5ee00de9edc5a9f53f19d` (18/11/2026), après merge de la PR #75 `feat/stepped-island-identity`.**  
À lire avec [92 — Audit de contenu jouable](92-COMPLETE-WORLDS-STUDIO-AUDIT.md), [91 — Activités guidées](91-GUIDED-ACTIVITIES-RACES-ALPINE-MUSIC.md), [89 — Port/villages](89-COMPLETE-ISLAND-START-CALDERA-PORT-VILLAGES.md), [75 — Voyage](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [76 — Autonomie](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [81 — Économie](81-ECONOMY-PRODUCTION-CONTRACTS.md), [94 — Contrats de quêtes](94-QUESTS-DATA-EVENTS-REWARDS.md) et [95 — Roadmap](95-QUESTS-IMPLEMENTATION-ROADMAP.md).

**Extension PNJ / vie locale (spécifiée, non implémentée)** : [96 — audit des horaires, dialogues et navigation](96-NPC-LIFE-DIALOGUES-SCHEDULE-AUDIT.md) et [97 — roadmap NPC-0 à NPC-10](97-NPC-LIFE-IMPLEMENTATION-ROADMAP.md). L'intégration QuestDirector doit utiliser les rôles/horaires de l'unique état de vie logique, sans créer un deuxième système de dialogue, sans exécuter de déplacement hors écran à chaque frame, et sans valider une quête par la seule animation d'un métier.


## 0. But produit et non-objectifs

Chaque île doit pouvoir proposer via les PNJ une sélection **diversifiée, réalisable, facultative et persistante** de missions : faire découvrir le monde et chaque activité **réellement jouable**, progresser de la rencontre vers la collecte, la livraison, la transformation, les courses et les voyages, puis attribuer pièces, ressources, outils et récompenses régionales. Les missions ne doivent pas imposer une profession ni bloquer les actions libres du joueur.

Livraison initiale : **solo, 100 % statique GitHub Pages**, aucune IA générative, aucune API, aucun serveur, aucune BDD, aucun nouveau simulateur d'activités, aucune nouvelle boucle de PNJ à chaque frame. Le multijoueur reste un contrat d'autorité future, non un jalon de livraison.

## 1. Contrôle du dernier merge — ce qui existe sur main

Le merge #75 a intégré les travaux de création d'îles et **n'a pas intégré un générateur de quêtes**. Plusieurs chemins sont désormais exploitables par le futur QuestDirector :

| Source vérifiée sur main | Acquis | Limite ou usage pour les quêtes |
| --- | --- | --- |
| `src/studio-core/birth-port.ts`, `src/archipelago/port-n1-plan.ts` | Port N1 source, emprises, accès marin/terrestre et validations | Un port bâti **n'implique pas** une route inter-îles publiée ; vérifier catalogue/horaires |
| `src/settlements/services.ts`, `src/settlements/local-life.ts` | Services, comptoirs, poses `ShopAccess`, PNJ hôte et dialogues d'accueil | Le PNJ hôte n'est pas encore QuestGiver ; ne pas écraser le dialogue auteur |
| `src/studio-core/world-onboarding.ts` et génération guidée | Présélections île, caldeira, activités, première implantation | Pas de coordinateur complet « activités + ressources + quêtes + accessibilité » |
| `src/studio-core/race-*.ts`, `src/gameplay/races.ts` | Courses auteur, recherche de terrain/couloirs, événements course | Utiliser seulement des circuits réellement validés et jouables |
| `src/snow/*` et [91](91-GUIDED-ACTIVITIES-RACES-ALPINE-MUSIC.md) | Prototype ski/descente et remontée ; génération guidée limitée | **Pas** de compétition de ski complète ; événement objectif à qualifier |
| `src/studio-core/world-audit.ts`, `src/studio/*`, `tools/audit-island-playability.mjs` | Audit contenu/parcours et diagnostics bornés | Le rapport actuel **n'est pas** une preuve de solvabilité de quête |
| [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md) | Île historique : 14 objectifs/32 PNJ et copie d'audit enrichie non destructrice | Préserver les 14 missions historiques et toute source retouchée |

L'audit 92 observe 0 quête et 0 mine automatiquement composées sur les quatre profils prospectés ; la copie enrichie de l'île historique conserve ses 14 objectifs. Ces nombres décrivent **l'audit à son commit**, pas un résultat d'exécution de cette branche. Les écarts de chemins, d'accès au port et de village doivent être traités comme des diagnostics, jamais « réparés » en créant arbitrairement une mission.

Les fonctionnalités suivantes existent **mais ne constituent pas des preuves de réussite de quête** :

| Mécanisme métier | Source | Ce que le directeur doit recevoir |
| --- | --- | --- |
| `ObjectiveDefinition` et statuts `locked/active/complete` | `src/gameplay/schema.ts`, `runtime.ts` | Conserver l'ancien contrat ; nouvelle progression en complément |
| `onEvent`, `giveItem`, `takeItem`, dialogue à choix et conditions | `schema.ts`, `dialogue-session.ts`, `templates.ts` | Réutiliser actions et autorité du runtime ; adapter les événements de réussites |
| Journal actif/terminé | `src/ui/journal/journal.ts` | Étapes et compteurs, PNJ, cible, butin sans perdre les quêtes legacy |
| `grantItems` et monnaie `coin` | `src/gameplay/runtime.ts`, `economy.ts` | Transaction unique validée, inventaire / plein / plafond |
| `createGathering` + règles `ruleFor` | `src/gameplay/gathering.ts` | Événement de collecte effective avec source/type d'espèce |
| Pêche | `src/gameplay/fishing.ts`, `fishing-data.ts`, `main.ts` | Réussite « pris ET attribué », type d'eau et espèce |
| Mine et agriculture | `src/gameplay/activity-runtime.ts` | Cycle de récompense/dig, semis/récolte, localisation/niveau |
| Ateliers et marchés | `src/economy/workshop-services.ts`, `island-markets.ts` | Production collectée / transaction validée, PAS simple possession |
| Courses | `src/gameplay/races.ts`, `main.ts` | Finish validé, catégorie, temps, parcours et version |
| Sac et ferry | `src/archipelago/portable-inventory.ts`, `transit.ts`, `src/gameplay/save.ts` | États de quêtes locaux et déblocages inter-îles persistants |

**Point de vigilance :** `ActivityDefinition` ne couvre actuellement que `collect/deliver/fish/puzzle`, tandis que mines, fermes, courses, pêche et économie ont déjà leurs systèmes natifs. **Ne pas** dupliquer ces moteurs ni faire croire qu'une activité absente de `libraries.activities` est impossible.

## 2. Décisions d'architecture (source de vérité)

- **QD-01 — QuestDirector pur** : `src/quests/*`, sans Three.js, DOM, réseau ou accès direct au stockage ; simulation sur commandes/événements validés, et adaptateurs séparés. Aucun tick de suivi par PNJ ou par frame.
- **QD-02 — Deux moments de génération** : pendant la préparation/compilation Studio, établir un **catalogue de possibilités qualifiées** à partir des sources réelles ; pendant le jeu, choisir les offres des PNJ selon progression, rotation et contexte, sans reparcourir la géographie entière.
- **QD-03 — Pas de fausse disponibilité** : ressource référencée ≠ récoltable ; atelier décoratif ≠ atelier utilisable ; eau graphique ≠ spot de pêche accessible ; équipement référencé ≠ obtenable ; quai visuel ≠ destination publiée.
- **QD-04 — Contrats gameplay uniques** : dialogue PNJ, `onEvent`, autorité inventaire, ateliers, marchés, état de course et save existants restent propriétaires de leurs mutations. Une mission écoute les succès, pas les touches pressées ni la simple ouverture d'un panneau.
- **QD-05 — Patrimoine et overrides** : toutes les quêtes auteur, dialogues, PNJ, IDs, retouches et suppressions volontaires restent prioritaires. Les ajouts auto portent un namespace séparé et une provenance de génération. Ne jamais éditer les 14 objectifs de l'île historique par normalisation destructive.
- **QD-06 — Facteur humain** : quêtes calmes, facultatives, accessibles, récompenses lisibles. Priorité à découverte → pratique → maîtrise ; répétables plafonnées. Toujours au moins une offre réalisable **si** un PNJ et une activité appropriée existent ; sinon diagnostic explicite, pas création d'activité fictive.
- **QD-07 — Idempotence** : chaque événement d'activité et chaque remise de récompense possède un ID stable de transaction. Exactement une attribution même si double-clic, refresh, retour d'île, export/import ou reprise après échec.
- **QD-08 — Portée claire** : objectifs du monde/PNJ dans l'état **par île** ; quêtes impliquant plusieurs îles et déblocages uniques dans une progression **portable d'archipel** ; aucune deuxième propriété du stock d'inventaire.
- **QD-09 — Compatibilité** : anciens projets V3, mondes compilés, `GameSaveV1/V2` et objets portables continuent de charger. Ajouter extensions **facultatives/versionnées** et migrations pures ; ne pas rendre le champ `quests` obligatoire avant requalification.
- **QD-10 — Optimisation** : génération déterministe bornée ; index de capacités au chargement/publication, progression indexée par type d'événement, aucune requête géographique par frame. Les performances seront mesurées, non postulées.
- **QD-11 — Confiance** : templates et données Studio **déclaratifs et validés** ; aucun JS exécutable dans les quêtes/imports. Le service futur devra revérifier toutes les commandes côté serveur.
- **QD-12 — Gel de publication** : une quête acceptée fige template/version/paramètres/conditions de récompense ; une recomposition Studio ou un recalcul des offres ne modifie pas une mission en cours.

## 3. Contrat de l'île et analyse de faisabilité

Le `IslandCapabilityIndex` est calculé à partir des **sources compilées + manifestations réelles du gameplay**, pas uniquement à partir du catalogue d'objets. Il distingue :

1. **Capacité d'obtenir** : ressource + origine (récolte, pêche, mine, culture, vente réelle, import, fabrication), quantités/rareté/plafonds, prérequis d'outil et état de renouvellement.
2. **Capacité de pratiquer** : zone et entrée valides, point de service, accès physique, animation/mécanique activée, source d'événements validée.
3. **Capacité de terminer** : donneur et lieu de retour accessibles ; recette dont toutes les entrées sont réalisables ; liaisons inter-îles publiées ; stock/système de récompense connu.
4. **Localité et provenance** : item apporté d'une autre île peut servir à une livraison, mais **ne compte pas** comme capture/extraction locale ; le type d'événement porte le contexte.
5. **Incertitude** : `KNOWN`, `POSSIBLE_NEEDS_REVIEW`, `UNAVAILABLE` ; seuls les modèles dont les prérequis obligatoires sont `KNOWN` peuvent devenir des offres automatiques sans validation auteur.

Évaluer les dépendances via un graphe orienté : semences et parcelles → récolte → moulin → farine → livraison ; pioche → mine → minerai → forge ; canne → zone de pêche → capture. Supprimer les cycles de prérequis (ex. canne offerte uniquement après une capture). Un parcours proche en distance euclidienne n'est pas automatiquement franchissable : réutiliser le contrôle de chemins/surfaces de [92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md), et prévoir un playtest réel sur les cas à risque (falaises, eau, passerelles, souterrains).

Les ressources procédurales sont validées **par espèces/cellules et règles de récolte** avec échantillonnage déterministe borné et marge raisonnable ; une probabilité non nulle n'est pas une garantie de disponibilité. Les poissons sont sélectionnés en fonction de `WaterKind` et de la capacité à atteindre une berge valide. Les champs PNJ ou réservés ne deviennent pas des parcelles cultivables par joueur.

## 4. Allocation PNJ et contenu

- Affectation via rôle de lieu / service existant : `fishing`, `agriculture`, `forest`, `mine`, `market`, `inn`, `explorer`, `general`. Le `host` issu de `src/settlements/local-life.ts` peut servir d'introduction, sans réécriture de son dialogue auteur.
- Une fiche QuestGiver optionnelle référence des **templates/roles**, pas un nouveau rig ou une IA de dialogue. Le PNJ conserve son comportement de navigation et son dialogue actuel. Générer/greffer de nouveaux choix via un **adaptateur de présentation**, sans supprimer les choix existants et en respectant les limites du schéma dialogue.
- Répartition : privilégier les activités peu découvertes ; éviter trois PNJ proposant la même livraison ; proposer des suites progressives. À défaut de PNJ compétent, utiliser un donneur généraliste réellement présent ou signaler l'absence.
- Définir des niveaux 0 (rencontre/orientation), 1 (collecte unique), 2 (collecte + livraison), 3 (production/métier), 4 (régional/défi), 5 (chaîne d'aventure, éventuellement inter-îles).
- Activités additionnelles `ski` et `surf` sont **enregistrables comme capacité future**, mais aucun template généré sur main avant preuve d'événements de réussite et d'activité jouable. Le snowboard de présentation/prototype n'est pas une compétition ; les vagues/surf ne sont pas un mécanisme livré sur main.

## 5. Politique d'offres, récompenses et UX

Configuration initiale **proposée, à calibrer** : 1–2 offres visibles par PNJ, 3–5 quêtes actives par joueur, 20–60 candidates par île riche, quêtes structurées 1–5 étapes ; priorités : 1 découverte par grande activité, variété, accessibilité, temps estimé et localisation. Une île pauvre a le droit de produire moins de quêtes : ne pas gonfler artificiellement les chiffres.

- Récompenses **communes** : `coin`, ressources et consommables connus ; **rares** : outil utilisable ou skin/déblocage existant ; **régionales** : identité `islandId`, statut unique, slot équipé réellement pris en charge.
- L'équipement de tête et de mains fonctionne ; slots dos/pieds restent partiellement réservés : pas de mission promettant palmes/planche équipables sans schéma/item/contrôles, asset et usage validés.
- Une récompense outil déjà possédé, un sac plein ou un plafond monétaire doivent laisser la quête **prête à réclamer**, jamais éliminer son paiement ni dupliquer sa remise.
- Les répétables ont cooldown, quantité plafonnée et budget économique ; éviter de transformer achat/revente d'un même item en source de profit infini par quêtes.
- Le journal conserve les missions héritées ; ajouter donneur, origine locale, étapes x/y, icône type, récompense, suivi et carte. Pas de nouvelle scène WebGL pour l'inventaire de quête.

## 6. Points d'intégration Studio et règles de publication

Exposer un panneau `Quêtes` à partir de l'audit existant **Validation / compilation → Contenu jouable et espaces calmes**, pas un deuxième outil d'analyse de terrain. Réglages facultatifs : génération on/off, densité, difficulté, familles, quêtes auteur verrouillées, quotas ; prévisualisation : candidats acceptés, rejetés avec **reason codes**, zones d'origine et de remise, dépendances et parcours, offre des PNJ, coût/budget.

Workflow : **composer terrain/ports/villages/parcelles → valider les activités/chemins → calculer capacités → générer quêtes candidates → analyser solvabilité → auteur accepte/verrouille → compiler → tester → publier**. Enlever une mine ou fermer un chemin invalide les candidates dépendantes et déclenche des diagnostics ; aucune suppression automatique des objectifs auteurs.

Aucune carte officielle (notamment `maps/island.project.json`) ni seed historique n'est réécrite par cette phase de documentation. Le merge #75 et son [audit 92](92-COMPLETE-WORLDS-STUDIO-AUDIT.md) restent la base, sans branche ancienne en retard.

## 7. Travaux ouverts et preuves attendues

Voir [94](94-QUESTS-DATA-EVENTS-REWARDS.md) pour formats, atomicité, propagation d'événements, récompenses, migrations ; [95](95-QUESTS-IMPLEMENTATION-ROADMAP.md) pour lots, dépendances et tests. Ce lot est **spécification seulement** ; aucune unité, UI ou fonctionnalité n'est déclarée implémentée/qualifiée par ces documents.