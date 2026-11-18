# 84 — ECO-6 : marchés d'île, stocks réels et revente artisanale

**Statut : IMPLEMENTED sur `feat/economy-island-markets-stock-pricing`, PR dépendante de #64, non fusionnée sur `main` à la rédaction.** Fondations : [80 — audit](https://github.com/glloq/little-world/blob/docs/economy-maritime-crafting-roadmap/docs/80-ECONOMY-TRADE-CRAFT-AUDIT.md), [81 — contrats](https://github.com/glloq/little-world/blob/docs/economy-maritime-crafting-roadmap/docs/81-ECONOMY-PRODUCTION-CONTRACTS.md), [82 — roadmap](https://github.com/glloq/little-world/blob/docs/economy-maritime-crafting-roadmap/docs/82-ECONOMY-PRODUCTION-ROADMAP.md) (documents de la PR #61, pas nécessairement encore présents sur cette branche), [83 — ateliers V1](83-ECONOMY-WORKSHOPS-PLAYABLE-V1.md).

## Objectif et limites

Autoriser le joueur à **acheter des biens en quantité limitée**, **transformer ses ressources**, **revendre des produits finis** et profiter des **différences de prix entre îles**. Un comptoir possède son propre stock, ses offres, ses pièces et l'historique borné de ses commandes. Les objets et la monnaie du joueur restent dans l'inventaire existant.

**Cette V1 ne simule pas encore le fret maritime.** Elle ne crée pas de marchandises « importées » artificiellement et n'implémente pas de marché synchronisé entre joueurs. Les approvisionnements locaux de base sont scénarisés et bornés, indépendants des ferries (ECO-7).

## Modules et contrats

- `src/economy/island-markets.ts` : `MarketStateV1`, `MarketView`, `marketCatalog`, `marketUnitPrices`, `newMarketState`, `advanceMarket`, `executeMarketTrade`, `createIslandMarkets`.
- `src/gameplay/game-view.ts` : autorité de commerce associée à un `counterId` et `islandId`, commandes passant par `purse.apply`/le gameplay runtime existant. Les anciennes fonctions `economy.buy/sell` restent pour compatibilité de leur API et des tests existants, mais la boutique joueur utilise désormais le service ECO-6.
- `src/gameplay/save.ts` : champ facultatif `markets` de `GameSaveV2`, validation stricte, lecture rétrocompatible des anciens slots et externalisation dans IndexedDB aux côtés des mines/fermes/ateliers.
- `src/ui/shop/shop.ts` : prix propres à l'île, stock disponible, budget marchand, vente des matériaux transformés, devis à révision `expectedRevision`, boutons Acheter / Acheter 5 / Vendre 1 / Tout vendre.
- `src/main.ts` : transmet l'identité de l'île actuellement chargée, pas un nom d'île déduit depuis l'interface.

### Valeurs V1 à équilibrer

| Paramètre | Valeur initiale | Portée |
| --- | --- | --- |
| Caisse initiale | 2 000 pièces | Chaque comptoir |
| Stock initial des outils | 2 unités par type | Chaque comptoir vendeur |
| Stock initial des semences | 16 unités par type | Chaque comptoir vendeur |
| Autres offres de vente | 6 unités par type | Chaque comptoir vendeur |
| Réapprovisionnement local | +1 outil ou +3 autres produits par jour écoulé ; plafond = stock initial | Simple scénario solo |
| Budget reconstitué | +120 pièces / jour, au maximum 14 jours de rattrapage par calcul | Simulation hors scène sans tick |
| Journal de transactions | 2 048 `requestId` par comptoir (refus propre ensuite, pas d'éviction silencieuse) | Borne technique temporaire |
| Portefeuille joueur | Limite actuelle de l'objet `coin` | Pas de taxe/limite de marchandise supplémentaire |

Ces bornes sont **des réglages techniques initiaux**, pas un équilibrage qualifié. Le journal requiert une stratégie de rotation signée avant des sessions très longues. Il n'y a ni serveur ni échange entre deux navigateurs.

## Prix et spécialisation des îles

Les catalogues de référence restent dans `src/gameplay/economy.ts` et `CRAFT_PRICES` pour les produits transformés. Les facteurs économiques V1 sont déclarés explicitement pour `volcano-island` et `forest-valley` ; les autres îles utilisent le prix de base.

L'achat au commerçant et la vente au commerçant utilisent **deux prix distincts** et une marge garantie sur un même article : acheter puis revendre immédiatement au même prix local ne doit pas rapporter d'argent.

**Exemple de transport rentable** (valeurs indicatives du profil V1, à vérifier par test) :

- 1 planche achetée au comptoir forestier de `forest-valley` : 7 pièces.
- Même planche revendue à un marché de `volcano-island` : 11 pièces.
- Marge brute : 4 pièces par planche, **avant coût éventuel du voyage**. Stock du comptoir forestier limité à 6 planches lors de l'initialisation.
- Le même produit acheté puis revendu sur une seule île reste déficitaire.

Le joueur garde toute sa liberté d'inventaire. Les niveaux portuaires ne doivent pas modifier arbitrairement les prix d'un atelier ou bloquer les biens personnels.

## Transactions sans perte et sans duplication

1. Une transaction fournit `shopId`, `islandId`, `itemId`, quantité, mode, `requestId` unique, et éventuellement la `revision` affichée.
2. Avant tout débit : valider offre, quantité entière, prix, stock vendeur, argent disponible, caisse acheteuse, place dans le sac et révision.
3. `purse.apply` effectue le mouvement simultané d'objets et de pièces. **Si cette opération refuse, ne modifier ni argent ni stock marchand**.
4. Après succès uniquement : stock et caisse du comptoir sont mis à jour, la révision augmente et l'ID est journalisé.
5. Une requête rejouée ou un devis périmé est refusé. Une vente ne prend jamais 5 objets en payant seulement 3.
6. Chaque comptoir est indépendant : deux commerçants du même type ne partagent pas leur caisse ou stock. Chaque île garde ses propres sauvegardes de monde.

**À faire avant le futur multijoueur :** centraliser la transaction dans un serveur autoritaire, remplacer les écritures multi-états en mémoire par un journal durable et ajouter la stratégie de purge du journal borné.

## Interface joueur

Le panneau classique du comptoir est conservé, ainsi que l'onglet **Transformer** d'ECO-5. Le commerce affiche :
- les pièces du joueur et la caisse du commerçant ;
- le prix unitaire par île et la quantité effectivement en stock ;
- les produits fabriqués rachetés selon la spécialité du commerçant ;
- la raison du refus (stock épuisé, pièces insuffisantes, caisse vide, inventaire saturé, devis périmé).

Les composants ne créent aucun nouvel objet 3D et le calcul de prix/stock est déclenché à l'ouverture ou lors d'une action, pas à chaque frame.

## Tests et gate de validation

- `tests/economy-island-markets.test.mjs` : séparation des comptoirs, stocks finis, argent vendeur, refus sans effet partiel, double ID, relecture V2, île étrangère refusée, arbitrage rentable entre îles, réapprovisionnement borné hors écran.
- `tools/test-economy-browser.mjs` : acheter une hache, vendre les bûches, fabriquer quatre planches dans la scierie, puis revendre le produit fini.
- CI : `npm test`, `npm run build`, tests navigateurs GitHub Pages. Ne qualifier le lot qu'après succès effectif de la dernière exécution.
- Scénario manuel restant : A→B→A avec sac contenant plusieurs produits, refresh et reprise des marchés et ateliers (nécessite ECO-1/ECO-2 de la PR #62 fusionnée avec les branches d'ateliers).
- Test à ajouter avant ECO-7 : un atelier d'une île charge ses produits finis après un voyage retour, sans réinitialiser la trésorerie ni le marché de destination.

## Suites prévues

**ECO-7 :** créer des routes de cargaison (source/destination/horaires, lot, provenance) indépendantes des ferries voyageurs et alimenter un **comptoir d'importation réservé aux lots étrangers**, avec débit à l'origine et crédit à l'arrivée idempotents.

**ECO-8 :** étendre les matières réellement récoltables et les filières (briques/argile, maïs/farine, textiles, etc.) et calibrer recettes/prix de reprise.

**ECO-9 :** exposer des profils d'île et règles de production dans le Studio, avec validation de disponibilité des ressources, prix et routes.
