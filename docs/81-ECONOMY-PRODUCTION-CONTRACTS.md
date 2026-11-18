# 81 — Contrats de données : produits, recettes, ateliers et commerce maritime

**Statut : SPECIFIED / PROPOSED — aucun code livré.** Contrats TypeScript **illustratifs**, à intégrer avec les types réels après les gates du [80](80-ECONOMY-TRADE-CRAFT-AUDIT.md) ; roadmap [82](82-ECONOMY-PRODUCTION-ROADMAP.md). Ce document complète [76](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md) sans le remplacer.

## 1. Invariants fonctionnels validés

1. **Propriété du sac au joueur** : tout item transportable et ses pièces suivent son personnage entre îles, sans frais/limites arbitraires liés à l'import/export personnel. La conservation prévaut sur la facilité de chargement d'une île.
2. **Items identifiés indépendamment des scènes** : un item garde son `itemId` dans tout l'archipel ; ni le biome, ni la boutique, ni le préfab 3D ne redéfinissent son identité.
3. **Importer et exporter** : un comptoir maritime n'affiche comme importation que des lots dont l'île d'origine est **différente de l'île de destination** et ayant été reçus par événement logistique. Un produit local peut néanmoins être vendu à une autre boutique.
4. **Recettes = données** : ressources en entrée, résultats en sortie, type de station, durée, frais, conditions d'activation ; aucun script arbitraire de carte.
5. **Fabrication volontaire** : le joueur choisit un poste, une recette et une quantité. Les métiers restent ouverts et non exclusifs. Plusieurs régions peuvent offrir le même métier.
6. **Atelier ≠ boutique** : une station sait transformer, un commerce sait acheter/vendre, un établissement peut réunir les fonctions ; la logique métier ne dépend pas de sa représentation 3D.
7. **Expédition et demande** : opérations atomiques, quantités entières non négatives, révisions, requestId et événements idempotents ; aucun actif gagné deux fois par un refresh/replay.

## 2. Catalogue global d'objets

**Point d'entrée** : réutiliser `ItemDefinition` dans `src/gameplay/schema.ts`, `ECONOMY_ITEMS`, `MINE_ITEMS`, `FARM_ITEMS` et les bibliothèques projet. Définir une **vue de catalogue archipel commune** résolue au lancement et validée avant publication, par ex. `ItemCatalogV1`. L'île déclare des disponibilités, pas une définition concurrente.

~~~ts
// Formes indicatives ; préserver ItemDefinition et migration des anciennes cartes.
interface ItemCatalogV1 {
  schemaVersion: 1;
  catalogVersion: string;
  items: ItemDefinition[]; // id, name, category, maxQuantity, description?
}
interface ProductMetadataV1 {
  itemId: string;                       // référence à ItemDefinition
  tags?: string[];                      // grain, fibre, combustible, alimentaire...
  tradeable?: boolean;                  // défaut explicite selon catalogue
  consumableEffectId?: string;         // registre explicite (pas déduction depuis category)
  buildMaterialId?: string;
}
~~~

- Les noms et catégories sont des métadonnées de présentation ; **ne jamais déduire `edible`, le prix, la rareté ou une recette à partir du nom**. Les aliments restent définis explicitement dans `food-effects.ts` ou un registre validé équivalent.
- `maxQuantity` protège le slot par type ; la limite totale du sac reste une question de design/perf à auditer, pas une franchise de commerce.
- Conflit de même `itemId` entre manifestes : le build doit échouer si les définitions incompatibles ne sont pas migrées. Ne pas simplement « prendre la première » et masquer l'écart.
- Prévoir la migration des anciens IDs et un coffre de récupération **persistant et visible** pour un item intraduisible. Sauvegarder les inconnus sans avoir besoin de charger l'île source.
- Les nouveaux objets ne sont ajoutés au kit de départ qu'avec une décision explicite ; les premières recettes doivent s'appuyer au maximum sur les ressources existantes.

## 3. Recettes versionnées et stations

~~~ts
interface ProductionRecipeV1 {
  recipeId: string; version: number;
  stationType: string;                    // mill, bakery, kitchen, kiln, smithy...
  inputs: {itemId:string; quantity:number}[];
  outputs: {itemId:string; quantity:number}[];
  durationGameMinutes: number;            // 0 seulement si recette explicitement instantanée
  serviceFeeCoins: number;                // 0 autorisé
  unlockId?: string;                      // facultatif : aucune profession obligatoire
}
interface StationDefinitionV1 {
  stationId: string; islandId: string; prefabId?: string;
  stationType: string; recipeIds: string[];
  queueCapacity: number; batchCapacity: number;
  serviceFeeMultiplier: number;
  stockId?: string;                       // facultatif : réservoir propre
}
interface ProductionJobV1 {
  jobId:string; requestId:string; ownerId:string; islandId:string; stationId:string;
  recipeId:string; recipeVersion:number; batches:number;
  startedAtGameMinute:number; finishAtGameMinute:number;
  status:'queued'|'running'|'ready'|'collected'|'cancelled';
  inputsReserved:{itemId:string;quantity:number}[];
  outputsDue:{itemId:string;quantity:number}[];
  feePaidCoins:number;
}
~~~

Validation : IDs non vides stables, versions positives, arrays bornés, item IDs présents dans catalogue, doublons d'entrée normalisés, quantités entières >= 1, frais >= 0, temps fini >= 0, cycles et recettes instantanées bornés, débordements arithmétiques interdits.

**Démarrage de job** : valider station, recette, droits, portée, batch, inventaire, prix et capacité ; retirer **une seule fois** ingrédients et frais, réserver sortie et emplacement de queue. Un job `ready` garde les produits dans une **sortie d'atelier persistante** jusqu'au retrait. N'ajouter au sac que sur `COLLECT_JOB` atomique ; sac plein = retrait refusé sans perte. Le joueur peut changer d'île pendant l'attente.

**Annulation** : politique explicite par état (en attente / déjà commencé) ; remboursement déterministe si autorisé, jamais un reverse automatique sans validation ; toute action garde un requestId. Une recette mise à jour conserve sa `recipeVersion` et ses `outputsDue` enregistrés dans les jobs déjà lancés.

**Moteur pur** : `validateRecipe`, `startJob`, `advanceJobsTo`, `collectJob` et `cancelJob` n'importent ni Three.js ni DOM ; séparation entre `ProductionService` et contrôles UI. Regrouper les mêmes entrées/outputs sans créer une deuxième autorité inventaire.

## 4. Établissements, stocks et prix

~~~ts
interface TradeOfferV1 {
  itemId: string;
  buyUnitPriceCoins?: number;             // prix payé par le joueur
  sellUnitPriceCoins?: number;            // prix offert au joueur
  availableQuantity: number;              // stock vendeur réel
  demandRemaining?: number;               // plafond de reprise du cycle courant
  originIslandId?: string;                // exigé pour offre d'import
  shipmentId?: string;                    // exigé pour offre d'import
}
interface ShopStateV1 {
  shopId:string; islandId:string; revision:number;
  cashCoins:number; stock:Record<string,number>;
  offers:TradeOfferV1[];
  nextRestockGameMinute?:number;
}
interface IslandEconomicProfileV1 {
  islandId:string; profileVersion:number;
  producedItemIds:string[]; requestedItemIds:string[];
  supportedStationTypes:string[];
  policyId?:string; routeIds:string[];
}
~~~

- Boutique locale : reprend seulement des objets de sa compétence et dans son budget, mais le joueur ne perd rien si l'offre est refusée.
- Boutique maritime : vend des **lots d'import** avec `originIslandId !== islandId`, provenance et réception prouvées par `shipmentId` appliqué ; les objets non concernés ne sont pas ajoutés artificiellement à son catalogue.
- `BUY` valide quantité demandée, stock, place dans le sac et pièces ; `SELL` valide quantité, inventaire, budget du commerçant, capacité de pièces et demande. Prix et quantité **fixés dans la transaction** ; paiement intégral ou refus, jamais vente partiellement rémunérée.
- Achats/reventes simultanés : `expectedRevision`, `requestId`, validation côté autorité locale solo / serveur futur ; une commande identique n'applique pas un second mouvement.
- Marges : achat/revente du **même bien au même comptoir non rentable** par défaut ; écarts entre îles possibles par spécialité et demande, sans quotas arbitraires sur le sac. Modulations bornées et transparentes ; pas de cours recalculé par frame.
- **Proposition initiale à calibrer** : 2–3 offres au niveau port 0, 3–4 au niveau 1, 4–6 au niveau 2, 6–9 au niveau 3, 8–12 au niveau 4, avec stock borné par lot. Les niveaux portuaires dictent la capacité logistique, pas le niveau technique d'un atelier.

## 5. Cargaisons et calendrier

~~~ts
interface MaritimeShipmentV1 {
  shipmentId:string; routeId:string;
  sourceIslandId:string; destinationIslandId:string;
  sourceDockId:string; destinationDockId:string;
  departAtGameMinute:number; arriveAtGameMinute:number;
  goods:{itemId:string;quantity:number}[];
  status:'planned'|'departed'|'arrived'|'cancelled';
}
~~~

- Fret = événements logiques, **indépendants du calendrier du ferry voyageur** ; un bateau visible peut illustrer une livraison sans simulation 3D hors champ.
- Départ : réserver/débiter les ressources disponibles à l'origine **une seule fois**. Arrivée : créditer la destination **une seule fois**. Rejet si capacité insuffisante, report déterministe ou reliquat explicite ; jamais de génération de produits depuis un stock vide, sauf **scénario d'approvisionnement solo explicitement déclaré**.
- Deux îles publiées sont déjà déclarées dans `public/archipelago/catalog.json`. Commencer par des profils d'exemple pour ces deux îles ; l'extension à trois îles reste un jalon de la roadmap.
- En solo GitHub Pages, le navigateur ne simule pas hors session : reconstruire au chargement les événements depuis la dernière horloge **avec borne et curseur**. Pas de comptes communs, pas de stock partagé réel entre navigateurs.
- Au futur serveur, même commande/événement, journal durable, autorité unique par stock et gestion des transferts sans double débit/crédit.

## 6. Sauvegarde, migration et autorité

**Frontière à formaliser avant codage :**
- `PlayerEconomyState` : sac et pièces globalement portables, progression de recettes, éventuelle réserve d'items incompatibles ; **ne dépend pas de `worldId`** pour son existence.
- `IslandEconomyState` : stocks des magasins, jobs et sorties d'ateliers, inventaires logiques producteurs, livraisons et dernières minutes appliquées **par islandId**.
- `WorldSave` : positions, parcelles, mines, entités et monde spécifique ; réutilise V2 avec migration explicite.
- `TravelEnvelope` : transfert temporaire de session et rollback ; **n'est pas un stockage durable** d'items.
- `CompiledContent` : recettes, catalogues, stations publiés et immuables par version.

Ne pas étendre silencieusement `GameSaveV2` sans adapter `parseGameSave`, `createGameSaveStore`, export/import, `compose/restore`, tests et externalisation IndexedDB ; documenter une migration V2→V3 **ou** un sidecar versionné transactionnel durable. Choisir une stratégie unique au gate ECO-0. Les commandes multi-états doivent disposer d'un point de validation atomique (manifest écrit en dernier, rollback si erreur).

Conserver un point de retour en cas de panne pendant un voyage. Test obligatoire : A→B avec `itemId` absent du catalogue local, refresh sur B, sauvegarde sur B, C→A puis utilisation et vente de l'objet sur A, sans perte, duplication ou écrasement de slot.

## 7. Catalogue de démonstration — données candidates non livrées

| Chaîne | Entrées → sortie | Station | Remarque |
| --- | --- | --- | --- |
| Farine | 3 blés → 1 farine | Moulin | `farm:wheat` existe ; farine nouvelle |
| Pain | 2 farines + 1 eau* → 2 pains | Boulangerie | *L'eau en item n'existe pas encore : utiliser une condition de station ou ajouter l'item |
| Soupe | 2 carottes + 1 pomme de terre* → 1 soupe | Cuisine | *Vérifier l'item pomme de terre cru ; `food:potato` désigne actuellement une pomme de terre cuite |
| Confiture | 4 baies → 1 confiture | Cuisine | Effet de recharge alimentaire explicitement déclaré |
| Pierre taillée | 3 pierres → 2 blocs | Tailleur de pierre | Reprendre `mine:stone` existant |
| Brique | 2 argiles* + combustible → 2 briques | Briqueterie | *Argile et combustible nouveaux, extraction distincte à définir |
| Vannerie | 3 roseaux → 1 panier | Vannier | `forage:reed` existe |
| Lingot | 3 minerais de fer + charbon* → 1 lingot | Fonderie | *Charbon nouveau ; coût/four à définir |
| Outil | Lingot + bois → pioche de fer | Forge | Exiger ID outil distinct et un gameplay compatible |

Les quantités sont **propositions de test**, non équilibrage validé. Ajouter plus tard maïs, lin, laine, verre, voiles, meubles, accessoires et pièces avancées, sans annoncer qu'ils existent déjà.

## 8. Contrats d'interaction et compilation

- Commandes typées : `BUY_ITEM`, `SELL_ITEM`, `START_JOB`, `COLLECT_JOB`, `CANCEL_JOB`, `REQUEST_SHIPMENT` (dernier réservé à la simulation / future logistique). Chacune est idempotente, validée avant mutation ; la réponse fournit résultat et erreur lisible.
- Studio V3 doit autoriser optionnellement les nouvelles bibliothèques / références et les convertir en assets compilés versionnés. Les anciennes cartes sans économie conservent leur chargement et leurs interactions.
- Prefab station = visuel low-poly et collider/interaction propres ; un stand peut utiliser un modèle existant avec plaque/enseigne. Pas de PNJ obligatoire ni de physique de production.
- Le système émet des événements légers (`production.started`, `production.ready`, `cargo.arrived`, `shop.restocked`) ; l'UI, la carte et l'audio s'y abonnent sans les recalculer.

**Gate de validation :** pour un même snapshot versionné, les mêmes commandes et événements triés produisent les mêmes stocks, pièces, jobs et sac. Aucun test de rendu seul ne suffit à qualifier le moteur.