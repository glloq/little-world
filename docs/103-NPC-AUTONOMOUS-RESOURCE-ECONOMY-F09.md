# F09 — Ressources autonomes des PNJ : agriculture, pêche, forêt

> Dernier palier fonctionnel envisagé pour la simulation de vie locale. La PR #100 reste **draft** : F09 ne remplace pas la qualification F01–F08.

## Contrat non négociable

1. Un gain doit venir d'un **producteur natif autoritaire** et d'une source réelle qualifiée (parcelle NPC, habitat aquatique, élément de végétation déterministe). Ne jamais produire une ressource sur un simple état `phase=work` ou une animation.
2. Les mêmes règles de quantité, durée, état, épuisement et retour de ressource s'appliquent au joueur et aux PNJ. Réutiliser les modules existants. Si une réserve écologique n'existe pas dans le jeu, l'ajouter explicitement et en faire l'autorité commune, plutôt qu'une table de « loot PNJ ».
3. La position de travail et le trajet sont validés par le routeur NPC. Un poste inexistant, déplacé, inaccessible, sous l'eau/inapproprié ou hors plage horaire est refusé. Réinterroger seulement lors des transitions ou à une cadence bornée.
4. Le stock du PNJ est indépendant du sac du joueur, borné, sauvegardé et auditable. Un événement `resource.*` ne peut être publié qu'après **crédit réussi** et marqué par une identité de transaction persistante.
5. Pas de collecte hors carte, ni de récolte de parcelles auteur affectées au joueur, ni de création de PNJ fictif, ni de rembobinage infini à la restauration d'une sauvegarde.

## Sous-étapes

### F09-A — Registre des récoltes et dépôts (commun)
- `NpcResourceAccount` : `residentId`, `sourceId`, `role`, `stock`, `lastActionGameMinute`, `appliedRequestIds` bornés. Validation stricte et sauvegarde locale V2 optionnelle.
- `NativeHarvestReceipt` : source, ressource, quantité et identifiant unique ; accepté uniquement après le commit du fournisseur, avec anti-rejeu et capacité prévalidée.
- Aucun stock initial gratuit. Transfert ultérieur vers ateliers/marchés par opération métier documentée et sans duplication.

### F09-B — Agriculteurs (première implémentation)
- Réutiliser `farm-sim.ts` `evaluate/act`, non une nouvelle croissance.
- Uniquement parcelles `assignment:'npc'`; liaison exacte entre `workAnchorId` et parcelle `id`.
- Au travail et à portée : `plant`, `water` si eau disponible, `harvest` si mûre, `clear` si desséchée. Les semences de l'économie, si définies, sont débitées **avant** semis.
- Crédit de récolte dans `NpcResourceAccount` uniquement si capacité suffisante. La parcelle reste mûre si le dépôt est refusé.
- Tests : pluie/sécheresse, parcelle joueur intouchée, stockage plein, sauvegarde/restauration, retard de simulation.

### F09-C — Forestiers et cueilleurs
- Réutiliser les cellules de végétation et `ruleFor` de `gameplay/gathering.ts`, avec **un registre partagé** des arbres coupés et de leur repousse. Interdire deux récoltes d'un même arbre entre joueur et PNJ.
- Exploiter une zone de travail réellement boisée et accessible ; recherche spatiale bornée aux cellules proches, sans balayage global.
- Les coupes demandent des actions et l'outil correspondant. Réutiliser la progression multi-coups de `createGathering` ; crédit atomique de `wood:log`, suppression du modèle via le filtre de végétation existant, repousse native.
- Tests : même arbre joueur/PNJ, absence d'arbre, mauvais outil, inventaire plein, rechargement et repousse.

### F09-D — Pêcheurs
- Vérifier l'habitat réel mer/rivière/lac et la position de rive/quai. Utiliser `FISH_BY_WATER` pour les espèces et les règles de rareté.
- Le mini-jeu joueur ne doit **pas** être simulé sous forme d'inputs artificiels. Introduire un **stock écologique partagé et borné** par secteur/cycle, consommé à chaque capture et régénéré à cadence déterministe. Le joueur doit consulter cette même autorité lors d'une capture victorieuse.
- La pêche PNJ se déroule en sessions espacées, interrompues si le PNJ s'absente, avec un débit limité de poissons et des journées sans prise possibles.
- Tests : mauvais milieu, quota épuisé, reprise après absence, espèces autorisées, sauvegarde/réinitialisation et absence de pêche « depuis la terre ferme ».

### F09-E — Chaînes économiques et commerces
- Transferts traçables **agriculteur → meunier → farine**, **forestier → scierie → planches**, **pêcheur → vendeur de poisson**.
- L'atelier utilise `startProduction/collectProduction`, déjà intégré à F04. Un marché achète/stocke le produit via le moteur de transaction natif ; ne pas injecter des items directement dans le sac du joueur.
- Les PNJ transporteurs/marchands pourront exécuter les livraisons uniquement avec une commande native dont source, destination et stocks sont vérifiés.

### F09-F — Qualité et budgets
- Simulation logique à cadence de minute de jeu ou sur transition, jamais par frame, sans calcul GPU supplémentaire.
- Budget par île : maximum 32 comptes de producteurs actifs ; maximum 1 requête de récolte par compte et par période de travail ; nombre de scans de végétation borné ; événements uniquement lors de commits.
- Scénarios : carte sans ferme/forêt/eau, village mixte, 10/40/100 PNJ, cinq jours d'absence, plusieurs îles, sérialisation/rechargement, versions anciennes.
- Gate : Node + build TypeScript + scénarios Chromium réels + benchmark CPU 4–8 Go. Ne pas valider sur un seul test unitaire.

## État de référence (au 19 novembre 2026)
- Déjà disponibles : parcelles et simulations agricoles natives, génération déterministe des ressources forestières, pêche et espèces par milieu, comptes d'ateliers PNJ F04, stock marchand, dialogue d'échange et sauvegardes V2.
- **Non encore terminé** : partage effectif de la récolte entre joueur et travailleurs, quotas halieutiques, producteur autonome unifié et transferts métier à métier.
- Préserver le comportement joueur, les sauvegardes existantes, les zones éditées manuellement et les contraintes low-poly/low-resource.

## Implémentation sur la PR #100 (F09-A–F : code initial raccordé)

| Étape | Modules / tests | État |
| --- | --- | --- |
| F09-A | `npc-life/harvest-ledger.ts`, `gameplay/save.ts`, `tests/npc-life-f09-ledgers.test.mjs` | Stocks et reçus anti-rejeu par producteur, limite 32, provenance vérifiée, sauvegarde V2 optionnelle |
| F09-B | `gameplay/activity-runtime.ts:npcFarmAct`, `npc-life/harvest-runtime.ts`, `tests/npc-life-f09-native-harvest.test.mjs` | Parcelles `assignment=npc` exclusivement, `farm-sim` identique au joueur, crédit atomique ou parcelle conservée |
| F09-C | `gameplay/gathering.ts:npcAct`, `npc-life/harvest-runtime.ts`, `tests/npc-life-f09-forest.test.mjs` | Même cible native, coups d'outil et registre de repousse partagés avec le joueur ; recherche de 8 directions au maximum |
| F09-D | `npc-life/fish-population.ts`, `gameplay/game-view.ts:creditFishCatch`, `main.ts` | Réserve réelle par milieu et cellule de 128 m, capacité 12, renouvellement 1/30 min de jeu, pêche PNJ à 15 min, pas de récompense si sac plein/secteur épuisé |
| F09-E | `npc-life/raw-transfers.ts`, `npc-life/economy-runtime.ts`, `economy/island-markets.ts:supplyFromNpc`, `tests/npc-life-f09-economy-chain.test.mjs` | Blé/bois remis aux ateliers actifs voisins (≤8 m) ; scierie uniquement à un poste réellement identifié, vente de poissons au comptoir portuaire proche avec débit du budget commercial et crédit du PNJ |
| F09-F | `tools/bench-npc-f09.mjs`, tests F09 + CI générale | Cadence logique minute de jeu, max 32 producteurs, microbenchmark 10/40/100 comptes, aucun calcul par frame hormis lecture de l'horloge |

### Limitations assumées et gates de validation

- Les circuits de livraison automatique entre métiers fonctionnent **uniquement pour des postes physiquement voisins (≤8 m)**. Il n'y a pas encore de livreur autonome longue distance, pas de téléportation de produits et pas de commerce inter-îles par simple duplication.
- Les comptes démarrent vides ; le champ produit via le simulateur agricole. Le moulin et la scierie restent soumis aux pièces nécessaires à leur fabrication native. La provenance du stock ne peut pas être inventée pour déclencher une recette.
- Les pêcheurs ne produisent pas à chaque session ; le tirage est déterministe, soumis aux espèces de l'habitat et à la réserve partagée avec le joueur. Un comptoir portuaire doit effectivement exister et disposer de liquidités pour acheter le poisson.
- Pour le forestier, un site réel mais sans arbre à portée ne fournit rien : aucun arbre ou faux bois n'est créé. Le PNJ effectue les mêmes coups et subit la même repousse que le joueur.
- **À qualifier** : CI complète sur le dernier SHA, état des parcelles et du stock après fermeture/rechargement, tests navigateur sur plusieurs villages réels (dont 10/40/100 PNJ), preuve du budget matériel GPU intégré 4–8 Go. Le benchmark Node est un signal CPU, **pas** une preuve de FPS.
- Ne pas fusionner PR #100 avant la validation ; noter le résultat réel des checks sans confondre `cancelled` et `success`.
