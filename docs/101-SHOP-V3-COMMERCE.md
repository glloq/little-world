# 101 — Commerce V3 : comptoirs compacts et revente depuis le sac

**Implémenté sur `feat/shop-v3-compact-trading`**, base `main`. La source de vérité du stock du joueur demeure `gameplay.runtime.state.inventory` et les échanges passent par `island-markets` et `purse.apply`. Aucun inventaire commercial parallèle, serveur ou persistance UI.

## Interface

- Le comptoir utilise des onglets **Acheter / Vendre / Transformer** (Transformer s'affiche si le comptoir possède des services).
- Les articles sont affichés sur **deux colonnes PC**, une seule sur petit écran, avec **icône du catalogue commun au sac V3**, nom, stock dans le comptoir ou dans le sac, prix unitaire.
- Un seul panneau inférieur fixe gère quantité de 1 à la limite réelle, **Max**, total et validation. Seule la liste centrale défile. Recherche textuelle et états indisponibles.
- Le prix et la quantité du joueur sont affichés ; **la caisse du marchand est masquée**, mais toujours validée par le moteur.
- Vendre n'affiche par défaut que les lignes de rachat dont le joueur possède l'objet ; le nombre de types non repris est donné sans encombrer la liste.
- Sélection multiple depuis le comptoir : bouton ou appui long **450 ms** (comme le sac V3), quantités par ligne, "1 / objet", "Max / objet", total puis **Vendre sélection**.
- Depuis le sac V3, une commande "Vendre" ou "Vendre au comptoir" apparaît **uniquement si un comptoir accessible rachète au moins un objet choisi** ; elle transfère la sélection à l'onglet Vendre sans déplacer d'objet. Le sac reste l'unique stock.
- Échap sort d'abord de la sélection multiple, puis ferme le comptoir. Le rendu conserve la position de défilement et le focus clé lors d'un réaffichage.

## Transactions et contraintes

- `tradeLimit()` plafonne la quantité affichée par **99**, le stock disponible, le solde, la capacité du sac ou de la bourse.
- La vue `marketView.sell[].available` tient désormais compte de la capacité financière **et** physique du marchand. Les totaux multi-types sont revalidés ensemble.
- `executeMarketSellBatch` est une commande **atomique**, à `requestId` et `expectedRevision` : toutes les limites d'offre, quantités, stocks et pièces doivent passer **avant** l'unique `purse.apply`. Une erreur ne modifie rien ; une commande rejouée est refusée.
- Les contrats de marché et de sauvegarde V1/V2 restent rétrocompatibles. Le passage au serveur multi-joueur n'est pas activé.
- Les ventes groupées ne sont jamais simulées par une boucle de `trade()` unitaire.

## Tests

- `tests/shop-v3.test.mjs` : partage d'icônes, affichage du stock, lignes reprises, quantité max, validité et atomicité d'une vente multi-objets.
- `tests/economy-island-markets.test.mjs` : non-régression du moteur transactionnel.
- `tools/test-economy-browser.mjs` : ouverture, achat de la hache, **vente depuis le sac V3**, transformation et vente des planches.
- `tools/test-settlement-services-browser.mjs` : achat sur un vrai comptoir de village, vérification des pièces et sauvegarde.
- Validation demandée : `npm test`, `npm run build`, `npm run test:economy` et test navigateur à faible résolution.

## Non inclus dans ce lot

Le comptoir des cargaisons étrangères conserve son flux spécialisé, avec lots identifiés par origine. Son alignement complet avec l'UI V3 sera une évolution distincte. Pas de glisser-déposer entre deux fenêtres simultanément : le contrôleur UI n'autorise qu'un panneau ouvert à la fois, d'où le **passage explicite de sélection**.
