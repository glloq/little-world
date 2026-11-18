# 83 — ECO-5 : premiers ateliers jouables aux comptoirs

**Statut : IMPLEMENTED sur `feat/economy-workshops-ui-persistence` (PR #64), non fusionné au `main` au moment de la rédaction.** Dépendance : PR #63 (moteur de production). Cible : solo statique GitHub Pages, sans serveur ni multijoueur actif.

## Objectif et périmètre

La première version permet de **transformer des ingrédients du sac dans un comptoir existant**, conserver la commande pendant que le joueur explore, revenir chercher le produit et enregistrer l'état dans une sauvegarde locale. La production est déclenchée par une commande explicite ; pas de simulation par frame ni de PNJ de fabrication supplémentaire.

Cette version **réutilise les comptoirs** comme portes d'accès à des services artisanaux ; elle ne prétend pas que leurs bâtiments 3D sont déjà des moulins, fonderies ou boulangeries. Les préfabriqués propres à chaque profession et la configuration Studio arriveront ensuite.

## Mapping temporaire des comptoirs

| Comptoir | Services proposés (types de stations) |
| --- | --- |
| Mine | Fonderie, forge, taille de pierre |
| Forestier | Scierie, menuiserie |
| Port | Vannerie |
| Marché | Moulin, boulangerie |
| Agricole | Moulin |
| Auberge | Cuisine, boulangerie |

La source de vérité du mapping est `src/economy/workshop-services.ts`. Les recettes et produits du catalogue V1 proviennent de `src/economy/starter-catalog.ts`. Les stations ne sont pas créées par le Studio à ce stade.

## Architecture

- `src/economy/production.ts` : moteur pur, contrat `ProductionRecipeV1`, `WorkshopStateV1`, `ProductionJobV1`, lancement/fin/retrait et demandes idempotentes.
- `src/economy/workshop-services.ts` : associe chaque `shop entity id` à des stations avec IDs stables, filtre les recettes disponibles selon les identifiants du catalogue courant, adapte l'horloge du monde en minutes de jeu. Une commande n'impacte jamais un autre comptoir.
- `src/gameplay/game-view.ts` : connecte les ateliers au portefeuille/inventaire **existant** via `runtime.grantItems`; aucun second inventaire. Définitions de ressources minières, agricoles et produits artisanaux partagées pour l'archipel.
- `src/gameplay/save.ts` : champ facultatif `workshops` dans `GameSaveV2`, validation des identifiants/jobs, migration rétrocompatible des anciens slots V1/V2, externalisation dans IndexedDB avec les états mines/fermes si le seuil est dépassé. Les slots gardent leur séparation par `worldId`.
- `src/ui/shop/shop.ts`, `src/ui/app/game-ui.ts`, `src/main.ts` : onglet Acheter/Vendre ou Transformer au comptoir réel, nombre de lots, ingrédients, frais, délai, affichage des jobs et retrait. Le panneau de commerce ne met pas en pause le temps de jeu ; il bloque seulement les commandes de déplacement.
- `src/gameplay/food-effects.ts` : seuls les nouveaux aliments explicitement enregistrés sont comestibles ; le champignon non identifié reste exclu.

## Règles de sécurité et compatibilité

1. Début de fabrication : les entrées et les frais sont débités ensemble une seule fois ; le joueur ne reçoit pas les sorties avant récupération.
2. Fin : le job passe à `ready` uniquement lorsque les minutes de jeu ont atteint son échéance ; il reste stocké à ce comptoir même si le joueur change d'île.
3. Récupération : refuse un sac plein sans détruire la production ; le même job ne peut pas être récupéré deux fois.
4. Reprise : sauvegarde/rechargement du job au même `worldId` ; le sac portable reste le propriétaire du joueur et n'est pas confondu avec le stock de l'atelier.
5. Compatibilité : une ancienne sauvegarde sans `workshops` produit simplement un état vide ; l'île et les anciennes cartes Studio ne changent pas sur disque.
6. Consommation : pain (+38 gaz), confiture (+42), soupe (+58) sont des paramètres V1, à équilibrer ; ne jamais déduire qu'un item est comestible depuis son nom.

**Limite :** les fabrications sont conservées par les sauvegardes de partie (manuelles ou checkpoints de voyage si la PR #62 est intégrée). Ce pilote n'ajoute pas un autosave global permanent par défaut. Il ne comprend pas encore l'achat/revente des produits finis, les prix locaux, les stocks de boutique ni l'approvisionnement cargo.

## Recette navigateur de référence

1. Charger l'île officielle 4 × 3 km en solo ; ouvrir un comptoir forestier déjà présent.
2. Donner/récolter 2 bûches et disposer d'une pièce ; choisir **Transformer → Scierie → 4 planches**.
3. Vérifier : exactement 2 bûches et 1 pièce consommées, une fabrication affichée, aucun produit dans le sac avant la fin.
4. Attendre 6 minutes **de jeu**, actualiser le panneau, récupérer 4 planches. Retenter la récupération : aucun gain supplémentaire.
5. Test logique complémentaire : sauvegarder au milieu d'une fabrication, recharger, avancer le temps et récupérer le résultat.
6. Essayer sans ingrédients, sans monnaie et avec sac plein ; chaque refus laisse l'état intact.

**Tests automatisés :** `tests/economy-production.test.mjs` (PR #63), `tests/economy-workshops.test.mjs`, `tests/save-v2.test.mjs` et `tools/test-economy-browser.mjs` (scène forestière). CI requise : `npm test`, `npm run typecheck`, `npm run build`, `npm run test:economy`.

## Après ECO-5

- ECO-6 : stock marchand réel, budgets de rachat, prix par île et vente des produits artisanaux.
- ECO-7 : comptoir de **seules marchandises étrangères** réellement livrées, horloge cargo différente du ferry voyageurs.
- ECO-8 : agriculture maïs/lin, argile/briques, filatures et autres matières productibles.
- ECO-9 : menu Studio d'ateliers, paramètres d'économie et vérification des chaînes de production avant publication.
