# 85 — ECO-7 : fret maritime et comptoir d'importations V1 (solo statique)

**Statut : IMPLEMENTED (PR dédiée, non fusionnée à `main`).** Basée sur ECO-6, qui dépend d'ECO-5 et ECO-4. Le ferry joueur reste indépendant. Cette livraison ne prétend pas implémenter une économie réseau. Référence générale : [76 — Autonomie, économie et commerce inter-îles](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [84 — Marchés insulaires](84-ECONOMY-ISLAND-MARKETS-V1.md).

## 1. Boucle V1 effectivement implémentée

1. Deux **réserves d'exportation explicites et finies** existent dans un état économique global local au navigateur (sans scène 3D) : l'île forestière exporte du bois/planches ; l'île volcanique exporte lingots/blocs de pierre.
2. Chaque route de fret possède un calendrier indépendant des horaires de la **navette de voyage**. Au départ, la quantité effectivement disponible est débitée du dépôt d'origine ; une réserve épuisée ne crée plus de cargaison.
3. Après le délai logique, une cargaison identifiée produit des lots avec **`sourceIslandId != destinationIslandId`**, `shipmentId`, `itemId`, quantité et statut `delivered`.
4. Le panneau « Voyage entre les îles » propose un bouton **« Voir les importations »** au quai. Il ouvre un **comptoir d'importation dédié**, distinct des achats ordinaires du port. Le bouton exige la proximité du quai, pas la présence du ferry voyageur.
5. Le joueur peut acheter un ou plusieurs objets d'un lot importé. L'achat vérifie le stock restant, les pièces, la capacité du sac et la révision ; la pièce et l'objet sont modifiés ensemble par `purse.apply`. Les demandes répétées sont refusées et les stocks ne deviennent jamais négatifs.
6. L'état des deux îles, des cargaisons, des lots livrés et de leur provenance est conservé dans **une seule valeur JSON locale** `little-world:archipelago-cargo:v1`. Les changements logistiques y sont commités par un seul `localStorage.setItem()`. Ce document est séparé des slots de carte et des tickets de ferry `sessionStorage`.

Il s'agit d'un **service commercial fonctionnel**, mais encore d'une **station UI sans nouveau bâtiment low-poly placé sur la carte**. Le positionnement d'un vrai stand sera à intégrer dans Studio.

## 2. Répartition pilote, horaires et limites

| Source | Destination | Marchandises par départ (maximum) | Réserve auteur initiale |
| --- | --- | --- | --- |
| `forest-valley` | `volcano-island` | 4 planches + 5 bûches | 24 planches, 30 bûches |
| `volcano-island` | `forest-valley` | 2 lingots de fer + 3 blocs de pierre | 12 lingots, 18 blocs |

- Premier départ : **minute de jeu 10**, premier chargement à destination : **minute 55**. Les départs suivants sont espacés de 2 jours de jeu (2 880 minutes). Ce calendrier est **provisoire pour la démonstration**, pas dépendant de la fréquence du ferry.
- Aucun réapprovisionnement automatique des **réserves exportatrices** à ce stade : une expédition ne peut jamais puiser dans un stock inexistant. La croissance du stock depuis fermes, mines ou ateliers doit être explicitement raccordée en ECO-8.
- Pour éviter toute ambiguïté, les réserves d'exportation ne sont **pas des copies des stocks des comptoirs ECO-6**. Ce sont des **dépôts d'activité locale initialement peuplés par l'auteur**. ECO-8 devra décrire les flux producteurs → dépôt et les opérations de retrait/cross-save.
- Un lot est proposé au prix local d'achat par marchand, augmenté d'une marge de fret **15 %**, avec prix supérieur à la revente locale pour empêcher l'arbitrage immédiat sur une même île.

## 3. Contrats d'état et persistance

`src/archipelago/cargo-logistics.ts` définit :
- `CargoRoute` : IDs d'îles, fréquence, durée de transport et quantités voulues.
- `CargoShipment` : ID calculable à partir de la route et de la date, entrée/sortie, quantité *réellement débitée*, statut `in_transit | delivered`.
- `ImportLot` : origine, destination, ID de cargaison, item et quantité disponible.
- `CargoStateV1` : exportReserves par île, curseurs nextDepartures, expéditions, importLots et achats journalisés, révision, dernière horloge observée.
- `createCargoService(storage,{islandId,gameMinute,purse,...})` : adaptateur local, lecture et écriture d'un snapshot atomique ; refuse de repartir silencieusement à zéro si le JSON est illisible.
- `src/ui/ferry/import-stand.ts` : vue dédiée, **seulement les lots qui ont réellement traversé** et uniquement des achats.

**Limites V1** : 32 routes, 256 expéditions, 96 lots par île, 512 achats importés dans le journal ; saturation = arrêt/refus explicite, pas purge silencieuse de l'historique. Le calcul d'une absence est borné à 24 événements par appel, avec reprise via curseurs. L'état n'évolue qu'avec le temps de jeu effectivement repris dans un navigateur ; pas de temps réel fictif hors session. Le code ne télécharge aucune scène d'une île absente.

## 4. Frontières d'atomicité (importantes avant qualification)

La conservation **fret ↔ fret** est atomique dans une seule valeur `localStorage` : retrait du dépôt d'origine, statut d'expédition et crédit du lot de destination sont idempotents, avec provenance vérifiée par les parseurs.

Un **achat joueur** met à jour deux autorités distinctes : l'inventaire gameplay et le ledger cargo. En mémoire, l'opération est vérifiée et toute erreur d'écriture du ledger provoque un remboursement de pièces et le retrait de l'article. Après succès, le jeu déclenche immédiatement une sauvegarde `slot-ferry-auto` au mieux.

**Reprise après crash ECO-7.1 (livrée dans cette branche) :** le registre cargo contient maintenant `buyerCheckpoint` (île, monde, révision et **inventaire complet immédiatement après l'achat**) dans **la même écriture localStorage** que la baisse du lot et la création de la facture. Le slot gameplay stocke `cargoPurchaseRevision` dans la **même sauvegarde que l'inventaire**. Au redémarrage, le client compare les révisions : si l'achat cargo est plus récent que le slot, il restaure le sac du registre avant de sauvegarder un slot cohérent. Si un voyage vient d'arriver, **le sac du voyageur est prioritaire** et la révision est acquittée pour éviter une restitution en double. Un rechargement simple après achat ne réinitialise donc pas les pièces et marchandises.

**Limites restantes :** plusieurs onglets en écriture simultanée ne sont pas gérés par une autorité transactionnelle commune ; un changement volontaire de profil/sauvegarde antérieure mérite une politique explicite (ECO-9). Le checkpoint n'est qu'un point de reprise pour **le navigateur solo**, pas une garantie multijoueur. Les achats sont validés par `purse.apply` et une erreur d'écriture du registre est compensée immédiatement.

Autre limite du stockage navigateur : deux onglets simultanés qui vendent les mêmes marchandises ne sont pas synchronisés comme un serveur ; les transactions communes devront utiliser un verrou ou une autorité serveur au stade multijoueur.

## 5. Interface et cas d'essai

**Accès :** rejoindre le quai, ouvrir l'interface de la navette (ou les horaires via carte), cliquer « Voir les importations ». Les marchandises d'import restent disponibles indépendamment de la présence du bateau voyageur. Si le joueur consulte depuis la carte hors du quai, le bouton d'achat est désactivé.

**Vérification logique automatisée :** `tests/cargo-logistics.test.mjs` couvre :
- expédition à la minute 10, arrivée à 55, stock d'origine réellement diminué ;
- provenance étrangère obligatoire et offre unique après rechargement ;
- refus des demandes dupliquées, du sac plein, du solde insuffisant et de la quantité épuisée ;
- consommation des dernières réserves sans apparition de marchandise « gratuite » ;
- rattrapage borné d'absence, sans synchronisation de scène WebGL ;
- stockage défaillant : rollback du débit d'inventaire, pas de stock perdu ;
- même achat et inventaire après rechargement : reprise par `buyerCheckpoint` et acquittement `cargoPurchaseRevision` ; test Chromium de persistance après achat.

**Qualification restante** : tests navigateurs réels de l'ouverture de ce nouveau panneau près du quai, navigation A→B→A puis rechargement après achat, comportement si `localStorage` plein ; vérification conjointe avec #62 avant merge final.

## 6. Prochaine étape

- **ECO-7.1** : rapprocher définitivement `CargoStateV1` des sauvegardes/journaux du joueur, rendre l'achat et le sac crash-safe au-delà de deux stockages, ajouter un contrôle de concurrence entre onglets.
- **ECO-8** : relier les réserves exportatrices aux productions réellement générées par la logique des mines/fermes/ateliers, introduire plus de ressources et des chaînes d'objets complexes.
- **ECO-9** : définir les routes, productions, quantités, tarifs et lieux de comptoir dans Studio, avec validation des références et vue des dépendances, sans avoir à modifier les fichiers de code pour ajouter une île.
