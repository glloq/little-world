# Little World — Sac V3, hamster et sélection multiple (implémentation incrémentale)

Branche: feat/inventory-v3-hamster-drag-multiselect (base: main / PR #79 instruments). Le moteur reste 100 % solo, statique, sans backend. La logique d'objets demeure dans le gameplay, jamais dans la vue.

## État de la branche

| Fonction | Statut | Module |
|---|---|---|
| Trois panneaux stock / hamster / équipements | Implémenté, à qualifier en navigateur | ui/inventory/inventory-v3.ts, inventory-v3.css |
| 10 emplacements favoris fixes, persistés localement | Implémenté | localStorage little-world:inventory-v3:favorites |
| Filtres Tout / Aliments / Ressources / Équipements | Implémenté | inventory-logic.ts |
| Sélection multiple appui long 450 ms, cases cochées, Échap | Implémenté | inventory-v3.ts, ui-controller.ts |
| Glisser-déposer souris/pointeur stock → hamster et favoris | Implémenté, tests tactiles à étendre | inventory-v3.ts |
| Sélection puis clic sur zone hamster (alternative tactile/clavier) | Implémenté | inventory-v3.ts |
| Manger un aliment depuis la bouche, le bouton ou la fiche | Implémenté | main.ts / eatFood |
| Calcul de consommation multiple minimisant le gaspillage | Implémenté | inventory-logic.ts |
| Retrait atomique du stock pour la consommation groupée | Implémenté | main.ts / eatFoods |
| Outils et instruments : équipement des mains + « Jouer » | Réutilise la PR #79 | game-view.ts / equipment |
| Casque : équipement de tête séparé | Réutilise le prototype existant | main.ts / headgear |
| Tenue réelle du hamster synchronisée avec le rendu du jeu | À faire | phase suivante |
| Persistance loadout tête/dos/pieds + favoris dans les sauvegardes | À faire | phase suivante |
| Dépôt au sol / transfert / vente groupée | À faire : pas de fausse commande active | gameplay, world, shops |
| Gestuelle PC/mobile et navigation clavier automatisées | Partiellement couvertes, à compléter | tools/test-ui-browser.mjs |

## Contrats

- Le stock est l'unique inventaire réel, fourni par gameplay.runtime.state.inventory.
- L'équipement des mains réutilise gameplay.equipment.setHands() et la sauvegarde equippedItemId.
- Le casque ne remplace pas l'objet tenu en main.
- Les catégories d'aliments sont *sans valeur d'autorisation* : foodGasValue(itemId) constitue la liste explicite.
- Déplacer un objet sur une case favorite **ne change pas son stock** et **ne l'équipe pas** automatiquement.
- Déplacer un instrument sur la main appelle le même équipement que le bouton « Équiper » ; « Jouer » ouvre le clavier musical existant.
- La consommation groupée n'utilise jamais les chiffres de l'interface comme vérité : main.ts revalide quantités, mode de déplacement, contexte et énergie puis soustrait tous les objets en une seule transaction.
- Pas de glisser-déposer HTML natif : Pointer Events, pointercapture, et une alternative à deux clics sur mobile.
- Pas de second canvas WebGL : silhouette hamster SVG fixe, zones DOM, quelques badges, pas de Three.js supplémentaire.
- Le scroll est limité au stock. Les dix favoris ne défilent jamais.
- Le mode de sélection multiple est transitoire et ne se propage pas dans une sauvegarde.

## Restants / décisions techniques

**P5 — loadout durable.** Ajouter un champ optionnel au GameSaveV2 (et à TravelerState) pour la tête et les futurs slots dos/pieds, avec migration de equippedItemId. Ne pas faire de favoris locaux une seconde source de vérité du stock ; préférences globales actuelles sont provisoires. À la vente/perte d'un objet, il faut invalider le slot de gameplay correspondant, sans détruire l'identité de l'objet dans les favoris.

**P6 — rendu hamster.** Le SVG est provisoire. Prévoir un portrait 2D issu du hamster actuel ou un atlas léger d'overlays cohérent avec le mesh, sans rendre une seconde scène. Les animations de manger/équiper se produisent uniquement après succès de la commande métier.

**P7 — déposer et vendre en quantité.** Déposer au sol doit créer une entité ramassable persistante avec position/collisions et retirer les quantités de façon atomique. Vendre doit être autorisé par le comptoir/port avec révision de marché et prix validés. Ne jamais déduire ces opérations du seul drag and drop.

**P8 — gestes et accessibilité.** Tester en vrai sur smartphone : scroll vertical vs drag horizontal, long-press 450 ms, pointercancel, zoom, réouverture du sac; mode sélection clavier alternatif et aria, restauration du focus, interactions sous 720×540. Vérifier l'absence de faux clic après un drop.

## Validation

Tests unitaires : tests/inventory-v3.test.mjs ; tests existants : tests/ui.test.mjs, tests/food-boost.test.mjs.
Tests navigateurs : tools/test-ui-browser.mjs (10 favoris, 5 zones, multi-selection, Échap, petit écran).
Commandes : npm test ; npm run typecheck ; npm run build ; npm run test:ui ; vérifier les actions Validate Little World avant merge.
