# Little World — Sac V3, hamster et sélection multiple (implémentation incrémentale)

Branche: feat/inventory-v3-hamster-drag-multiselect (base: main / PR #79 instruments). Le moteur reste 100 % solo, statique, sans backend. La logique d'objets demeure dans le gameplay, jamais dans la vue.

## État de la branche

| Fonction | Statut | Module |
|---|---|---|
| Trois panneaux stock / hamster / équipements | Implémenté, à qualifier en navigateur | ui/inventory/inventory-v3.ts, inventory-v3.css |
| 10 favoris enregistrés dans le gameplay et la sauvegarde V2 | Implémenté (à qualifier en CI) | game-view.ts, player-loadout.ts, inventory-v3.ts |
| Filtres Tout / Aliments / Ressources / Équipements | Implémenté | inventory-logic.ts |
| Sélection multiple appui long 450 ms, cases cochées, Échap | Implémenté | inventory-v3.ts, ui-controller.ts |
| Glisser-déposer souris/pointeur stock → hamster et favoris | Implémenté, tests tactiles à étendre | inventory-v3.ts |
| Sélection puis clic sur zone hamster (alternative tactile/clavier) | Implémenté | inventory-v3.ts |
| Manger un aliment depuis la bouche, le bouton ou la fiche | Implémenté | main.ts / eatFood |
| Calcul de consommation multiple minimisant le gaspillage | Implémenté | inventory-logic.ts |
| Retrait atomique du stock pour la consommation groupée | Implémenté | main.ts / eatFoods |
| Outils et instruments : équipement des mains + « Jouer » | Réutilise la PR #79 | game-view.ts / equipment |
| Casque : slot de tête persistant et synchronisé dans les mines | Implémenté (à qualifier en CI) | game-view.ts / equipment.head, main.ts |
| Portrait : badges des objets portés et animations CSS légères | Implémenté (prototype SVG) | inventory-v3.ts, inventory-v3.css |
| Portrait issu du modèle 3D réel du hamster | À faire | phase graphique suivante |
| Loadout validé V2 et transporté entre îles | Implémenté (tête + favoris actifs ; dos/pieds réservés) | save.ts, player-loadout.ts, transit.ts, main.ts |
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

**P5 — loadout durable (implémenté).** `GameSaveV2` et `TravelerState` possèdent un champ `loadout?` validé (tête, dos/pieds réservés, 10 favoris). L'ancien `equippedItemId` reste pris en charge. Le casque est la source métier pour la lampe de mine et sa présence est contrôlée avant usage. La grille de favoris réutilise les IDs d'objets, sans inventaire parallèle ; une préférence globale antérieure peut être migrée une fois, puis le gameplay devient l'autorité. Des favoris restent mémorisés même lorsqu'un objet est temporairement absent du stock. Les cases peuvent être remplacées, échangées ou libérées.

**P6 — rendu hamster.** Des badges des équipements actuels et des animations CSS « manger/équiper » sont ajoutés sans WebGL supplémentaire. Le SVG est provisoire : préparer un vrai portrait 2D dérivé du hamster actuel ou un atlas léger d'overlays cohérent avec son modèle, sans deuxième scène. Les actions refusées n'activent pas ces animations.

**P7 — déposer et vendre en quantité.** Déposer au sol doit créer une entité ramassable persistante avec position/collisions et retirer les quantités de façon atomique. Vendre doit être autorisé par le comptoir/port avec révision de marché et prix validés. Ne jamais déduire ces opérations du seul drag and drop.

**P8 — gestes et accessibilité.** Tester en vrai sur smartphone : scroll vertical vs drag horizontal, long-press 450 ms, pointercancel, zoom, réouverture du sac; mode sélection clavier alternatif et aria, restauration du focus, interactions sous 720×540. Vérifier l'absence de faux clic après un drop.

## Validation

Tests unitaires : tests/inventory-v3.test.mjs, tests/player-loadout.test.mjs ; tests existants : tests/ui.test.mjs, tests/food-boost.test.mjs, tests/save-v2.test.mjs, tests/ferry-transit.test.mjs.
Tests navigateurs : tools/test-ui-browser.mjs (10 favoris, 5 zones, multi-selection, Échap, petit écran).
Commandes : npm test ; npm run typecheck ; npm run build ; npm run test:ui ; vérifier les actions Validate Little World avant merge.

## Régression et compatibilité

- Les sauvegardes anciennes sans `loadout` restent acceptées. L'état de mains `equippedItemId` est conservé pour leur migration.
- Le billet de ferry et le checkpoint portable recopient aussi le loadout, pour éviter de perdre casque/favoris à l'arrivée ou au rafraîchissement.
- Identifiants d'objets du loadout strictement validés (format portable), tableau favoris exactement 10 entrées, sans doublons.
- Les propriétés de dos et pieds sont prévues dans le format mais aucun équipement ou mesh n'est activé pour l'instant.
- Les favoris peuvent être vidés et leur ordre modifié, sans retrait d'objet du stock. L'interface ne doit jamais afficher « acheter/vendre/déposer » comme actif sans commande métier.
- Playwright vérifie désormais l'appui long, le comportement d'Échap, le portrait et l'absence de scroll dans la grille de favoris ; vérifier les résultats CI avant fusion.
