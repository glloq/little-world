# 80 — Audit de l'économie maritime, de l'inventaire et des transformations

**Statut : AUDITED / SPECIFIED (18 novembre 2026).** Audit de la branche `main` au moment de la rédaction ; cette documentation **n'implémente aucune fonctionnalité** et n'atteste pas la qualification des branches récentes. À lire avec [73 — Archipel](73-ARCHIPEL-VISION-DECISIONS.md), [74 — Manifestes](74-ISLAND-MANIFEST-REGISTRY.md), [75 — Navettes](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [76 — Autonomie / commerce](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [79 — Roadmap](79-ISLAND-ROADMAP-VALIDATION.md), [70 — Nourriture](70-FOOD-BOOST-RECHARGE.md), [81 — Contrats de production](81-ECONOMY-PRODUCTION-CONTRACTS.md), [82 — Roadmap de livraison](82-ECONOMY-PRODUCTION-ROADMAP.md).

## 1. Objectifs décidés et périmètre

- Le **sac personnel suit le joueur librement** entre toutes les îles publiées. Aucune catégorie « marchandise déclarée », pas de quota ou taxe spéciale de transport commercial : seuls s'appliquent les plafonds ordinaires d'inventaire et le coût explicite du voyage s'il existe.
- Le joueur peut **acheter, emporter, vendre, consommer, transformer, déposer et récupérer** ses biens suivant les fonctions disponibles. Une boutique n'achète pas forcément tous les biens ; chercher le bon acheteur fait partie du jeu, sans confiscation des objets invendus.
- **Comptoir d'importation maritime** près du quai : vend des marchandises physiquement issues d'une autre île ; jamais un objet présenté comme importé uniquement parce que son nom est « exotique ».
- **Ateliers spécialisés** : moulin, cuisine, boulangerie, briqueterie, tailleur de pierre, vannerie, filature, tissage, fonderie, forge, scierie, menuiserie, verrerie, artisanat. Les recettes sont des données versionnées, réutilisables.
- Les ressources locales / spécialisations / niveaux de développement / niveaux portuaires sont **quatre variables distinctes**. Les chaînes sont des graphes de transformation, pas une progression linéaire obligatoire.
- L'économie des îles peut avancer sans charger leurs scènes Three.js : logique événementielle, pas une boucle de simulation par objet / PNJ / frame.
- **Priorité : bêta solo 100 % statique GitHub Pages** avec îles publiées et sauvegardes locales. Le multijoueur est préparé par les contrats (ID, révisions, commandes, journal) sans serveur, WebSocket ou comptes dans cette campagne.

**Non-objectifs initiaux** : commerce joueur à joueur, magasin global en ligne, simulation permanente côté serveur, métiers exclusifs, économie financière complexe, marché boursier, milliers de PNJ producteurs simulés individuellement, fabrication automatique sans stocks et contrôle de l'auteur.

## 2. Audit du code sur main

| Existant vérifié | Capacités actuelles | Limite / modification ciblée |
| --- | --- | --- |
| `src/gameplay/schema.ts` | `ItemDefinition {id,name,category,maxQuantity,description?}`; validation des bibliothèques | Aucune métadonnée économique, provenance, recette ni station. Étendre de manière facultative et compatible ou utiliser des catalogues métier séparés. |
| `src/gameplay/economy.ts` | Catalogue `ECONOMY_ITEMS`, `COIN`, `priceOf`, `SHOPS`, `buy/sell`, `Purse.apply` | Catalogue et prix globaux fixes ; `ShopKind` fermé ; aucune trésorerie/stock propre au commerçant ni prix local. `buy` plafonne une commande à 99 ; `sell` n'a pas cette limite. |
| `src/gameplay/game-view.ts` | `trade()` délègue aux fonctions de l'économie ; `purse.apply` réutilise `runtime.grantItems` ; `compose/restore` | Ajouter des commandes métier à la même autorité logique, sans muter l'inventaire depuis l'UI. Le kit de départ est injecté à la création uniquement. |
| `src/gameplay/runtime.ts` | `grantItems` applique un lot d'items atomiquement avec contrôle de `maxQuantity` | Le lot doit à terme intégrer aussi **stock de boutique + argent + réservation d'atelier** dans une même transaction logique. |
| `src/ui/shop/shop.ts` + `src/ui/app/game-ui.ts` | Interface Achat/Vente, bouton Vendre tout, routage `shopKind` | Ajouter onglet Transformer, quantité, origine, stock, demande et état de fabrication sans dupliquer les modales. |
| `src/ui/inventory/inventory.ts` | Catégories, quantités, outils et consommation d'aliments | Catégories d'artisanat, informations d'utilisation/recettes ; ne pas dupliquer les objets du sac par île. |
| `src/farm/farm-data.ts` et `farm-sim.ts` | Blé, carotte, citrouille ; simulation agricole différée | Maïs, fibres et autres cultures = nouvelles données à produire ; recettes alimentaires ne rendent pas automatiquement une culture récoltable. |
| `src/mine/*`, `src/gameplay/activity-runtime.ts` | Extraction, récoltes et contrats d'actions | Réutiliser les produits existants comme entrées ; ne pas créer une deuxième extraction ni un deuxième runtime. |
| `src/gameplay/food-effects.ts` | Liste explicite d'aliments consommables donnant du gaz | Tout repas nouveau exige une déclaration explicite ; le champignon sauvage non identifié ne doit pas devenir comestible par catégorie. |
| `src/archipelago/registry.ts` + `public/archipelago/catalog.json` | Registre statique avec deux îles publiées et `portLevel` | Pas encore de profil économique, d'exportations ou de routes logistiques par île. Ne pas confondre registre géographique et état des stocks. |
| `src/archipelago/ferry-schedule.ts` | Horaires voyageurs, niveaux portuaires 0–4 | Le calendrier de fret doit rester distinct, même si un navire visible sert aux deux usages. |
| `src/archipelago/transit.ts` + `src/main.ts` | Ticket de passage, reprise d'inventaire, `partitionTravelerInventory` et réserve temporaire des objets inconnus | **Blocage P0 : réserve `unavailableTravelItems` en mémoire seulement.** Un refresh, une sauvegarde locale ou un retour mal géré peut rendre des biens inaccessibles/perdus. |
| `src/gameplay/save.ts` + `save-blobs.ts` | Sauvegarde V2 par `worldId`, payload mines / fermes externalisable dans IndexedDB | Ajouter état de production/économie et bagage global **sans réutiliser un slot par île comme unique propriétaire du sac** ; migration/version contrôlées. |
| `src/studio-core/schema.ts` | Bibliothèques Studio V3 fortement validées, entités/prefabs | Le schéma refuse les clés de bibliothèque inconnues : `recipes`, `stations`, `economyProfiles` exigent un changement de types, parseurs, validation et compilation. |

### Défauts et risques prioritaires

1. **Inventaire inter-îles :** une destination n'ayant pas un `itemId` garde l'excédent/inconnu dans `unavailableTravelItems` (volatile) ; il n'est pas utilisable au commerce local. Construire un **catalogue d'objets stable pour tout l'archipel**, préserver tout item lors des voyages, des sauvegardes et de la restauration ; choisir une réserve durable uniquement pour les items rendus incompatibles par une migration, visible et récupérable.
2. **Vente partiellement payée :** `sell()` calcule `Math.min(price*quantity, capacité de pièces restante)` puis retire la **quantité entière**. Corriger : refuser la transaction ou ajuster la quantité payée *avant* de débiter ; ne jamais prendre des marchandises contre un paiement inférieur au prix annoncé.
3. **Limites inventaire :** `maxQuantity` par item et limite technique de 1 000 IDs dans `parseGameSave` ne sont pas une « franchise douanière ». Ne pas les lever sans budget et validation ; conserver le refus propre quand le sac est plein.
4. **Double dépense / chargement :** production, stocks, voyages et réservations doivent utiliser opérations atomiques et IDs idempotents, y compris en cas de rechargement et d'échec d'écriture IndexedDB.
5. **Prix / arbitrage :** `priceOf` n'accepte pas le contexte d'île, de boutique, de stock ou de demande. Les achats/reventes identiques doivent rester déficitaires sur un même comptoir ; bénéfice possible **entre îles** après prix du trajet et capacité de rachat.
6. **Rattrapage hors écran :** aucun cargo / atelier ne doit être évalué à chaque frame. Une horloge canonique en minutes de jeu, événements ordonnés, reprise déterministe et bornée sont nécessaires.
7. **Versionnage des catalogues :** les items et recettes de plusieurs versions d'îles doivent partager des IDs pérennes ; suppression/renommage d'ID implique migration ou coffre de récupération, jamais disparition silencieuse.

## 3. Choix d'architecture à respecter

- **Un seul moteur de transactions** réutilisant la validation de `grantItems` et étendu à plusieurs comptes/états ; pas de second porte-monnaie ni de deux copies divergentes d'inventaire.
- **Catalogue global** d'objets et recettes livrés en assets statiques versionnés ; chaque île ne contient que ses disponibilités, prix, postes de travail et mutations locales.
- **Données auteur** (Studio), **compilation statique** (catalogue), **runtime joueur** (bagage, argent), **runtime île** (stocks, ateliers, jobs, livraisons), **présentation UI / Three.js** : cinq couches sans dépendances inversées.
- Un joueur peut entreprendre plusieurs chaînes artisanales, sans attribution forcée de métier ; les recettes locales sont accessibles selon station, ressources et options de progression configurables.
- Sur Pages, la simulation n'existe que durant la session et sous forme de rattrapage calculé à la reprise. Aucune économie partagée entre deux navigateurs.

## 4. Priorités de réalisation

**Bloquants avant la première démo économique :** P0 conservation du sac portable y compris objets inconnus + reprise et tests ; P0 correction du paiement des ventes ; P0 contrats recettes et validation ; P0 stockage et migration ; P0 ateliers sans géométrie lourde.

**Puis :** P1 commerçants avec stocks/demande/prix locaux ; P1 transport maritime de marchandises ; P1 nouvelles chaînes et métiers ; P2 ergonomie Studio ; futur serveur.

Les objectifs, schémas et tests vérifiables sont dans [81](81-ECONOMY-PRODUCTION-CONTRACTS.md) et [82](82-ECONOMY-PRODUCTION-ROADMAP.md).

## 5. Tests d'audit à écrire ou compléter

- Trajet A→B→refresh→C→A avec item **inconnu sur B** : quantité inchangée et exploitable après découverte de son catalogue.
- Achat/vente en plusieurs quantités, inventaire presque plein, monnaie au maximum, trésorerie du comptoir insuffisante : **aucune perte d'objet ni paiement partiel**.
- Deux demandes de même ID : **une seule** création de marchandises ou fabrication.
- Recette invalide, élément absent, stock insuffisant, sortie saturée, durée de production nulle non autorisée par profil : résultat refusé sans mutation.
- Parcours solo de trois îles sans serveur, rechargement de page pendant fabrication ou passage de bateau, export/import de sauvegarde.
- Économie hors écran de N îles testée sans création de scènes 3D ; budgets mesurés, pas supposés.

**Sources d'audit :** inspection statique des fichiers mentionnés dans ce document ; aucun build/test exécuté lors de la rédaction.