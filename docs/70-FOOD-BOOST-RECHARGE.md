# 70 — Aliments et recharge de propulsion (V1)

## Contrat technique

La réserve est contrôlée par `src/physics/gas-propulsion.ts` : capacité 200 / 224 / 252 / 280 suivant le niveau ; réserve initiale 150 ; coût 14 unités par impulsion. Chaque aliment recharge **une valeur fixe en unités de gaz**, jamais un pourcentage de la capacité, afin de conserver une progression compréhensible.

Consommation : depuis le sac, au sol, hors bateau ; jamais en plein vol. Vérifier l'item explicitement dans `FOOD_GAS`, la réserve non pleine et la quantité dans le runtime. Retirer **exactement un item de façon atomique**, puis appliquer `refillGas` avec plafonnement à `gasCapacity(player)`. S'il n'y a aucun gain possible, ne retirer aucun item. Le bouton indique le gain réel lorsque la réserve approche du maximum.

| Aliment | ID | Gain de gaz | Équivalent boosts (gain / 14) |
| --- | --- | ---: | ---: |
| Baies sauvages | `food:berry` | 10 | 0,7 |
| Cerises | `food:cherry` | 12 | 0,9 |
| Noisette | `food:hazelnut` | 12 | 0,9 |
| Prune | `food:plum` | 15 | 1,1 |
| Noix | `food:walnut` | 18 | 1,3 |
| Carotte récoltée | `farm:carrot` | 20 | 1,4 |
| Pomme | `food:apple` | 25 | 1,8 |
| Poire | `food:pear` | 25 | 1,8 |
| Girolle comestible | `food:chanterelle` | 25 | 1,8 |
| Cèpe comestible | `food:cepe` | 35 | 2,5 |
| Pomme de terre cuite | `food:potato` | 35 | 2,5 |
| Morceau de fromage | `food:cheese` | 45 | 3,2 |
| Citrouille récoltée | `farm:pumpkin` | 55 | 3,9 |

L'équivalent en boosts est indicatif : une impulsion n'est déclenchable qu'avec au moins 14 unités ; les restes de gaz sont conservés.

## Champignons et sécurité de la règle

`forage:mushroom` est un champignon sauvage **non identifié**, collecté par le système de cueillette actuel. Il ne doit **pas** être consommable implicitement. Les champignons de test `food:chanterelle` et `food:cepe` sont des objets identifiés distincts, et une future récolte devra être explicitement associée à leur ID. Ne jamais rendre un item comestible à partir de sa catégorie, de son nom ou de son mesh.

## Disponibilité et progression

Le kit de départ dans `src/gameplay/economy.ts` fournit de petites quantités de chaque type à **toute nouvelle partie** pour vérifier la boucle sac → manger → gaz → boost. Une sauvegarde restaurée garde son propre inventaire et ne reçoit pas une seconde fois le kit. Les récoltes de carotte et citrouille existantes restent utilisables ; les autres nouvelles provisions n'ont pas encore de sources de production/cueillette automatiques (hors kit de test).

Pour le gameplay définitif, répartir ces aliments entre les biomes, cultures, commerce et préparation/cuisine ; calibrer la fréquence de récolte avec le coût énergétique réel. Aucune régénération passive ni bonus temporaire n'est ajouté ici.

## Tests à lancer

`npm test`, `npm run typecheck`, `npm run build`, puis vérifier manuellement le sac, la consommation au sol, l'interdiction en vol/bateau, le plafond à 200 puis à 224+, et la sauvegarde/restauration. Aucun élément graphique 3D ou audio nouveau n'est requis pour cette étape.
