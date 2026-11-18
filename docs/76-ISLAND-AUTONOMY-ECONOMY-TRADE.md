# 76 — Simulation autonome, écologie, économie et échanges entre îles

**Statut : SPECIFIED — architecture cible ; aucun serveur persistant livré.** Références [73](73-ARCHIPEL-VISION-DECISIONS.md), [74](74-ISLAND-MANIFEST-REGISTRY.md), [25 — Agriculture](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

## 1. Principe central

Une île possède un **état logique indépendant de Three.js** : ressources naturelles, parcelles, stocks, bâtiments productifs, besoins de PNJ, commandes, événements commerciaux, chantiers, horloge du dernier calcul. Le monde graphique peut être entièrement déchargé.

Deux modes d'exécution utilisent **les mêmes règles métiers** :
- **Bêta solo GitHub Pages** : aucun traitement ne tourne si aucun navigateur n'est ouvert ; au prochain chargement, **rattrapage déterministe, borné et local** des événements depuis le dernier instant sauvegardé. Aucune synchronisation entre navigateurs, ni économie globale authentique entre utilisateurs.
- **Futur serveur multijoueur (non activé)** : le serveur est autoritaire sur temps, stocks, échanges, permissions et journal d'événements ; une île sans joueur peut évoluer via tâches événementielles, sans scène WebGL chargée.

## 2. Contrats cibles

~~~ts
interface IslandEconomySnapshotV1 {
  islandId: string;
  revision: number;
  lastAppliedGameMinute: number;
  inventories: Record<string, Record<string, number>>;
  resourceNodes: Record<string, { remaining: number; renewAtGameMinute?: number }>;
  productionQueues: Array<{ jobId: string; buildingId: string; recipeId: string; finishGameMinute: number }>;
  shipmentIdsApplied: string[];
  pendingEvents: Array<{ eventId: string; dueGameMinute: number; kind: string; payloadRef: string }>;
}
~~~

Schéma illustratif : les types métiers existants gardent la priorité après audit ; ne pas créer une deuxième économie parallèle.

Événements versionnés et identifiables : ressource.renewed, crop.ready, production.finished, population.consumed, cargo.departed, cargo.arrived, construction.progressed. Les transactions de production **débitent les entrées et créditent les sorties une seule fois**.

## 3. Écologie et production

- Ressources dépendantes des biotopes et saisons, avec limites, renouvellement et impacts locaux (exploitation forestière, agriculture, habitats).
- Bâtiments productifs par recettes : entrées, sorties, durée, capacité, énergie/eau selon bâtiment ; préconditions explicites.
- PNJ consomment des ressources selon profils agrégés ; **pas de simulation 3D individuelle** pour les îles non chargées.
- Stocks publics/privés distincts, plafonds, réserves pour projets, maintenance facultative ; éviter inflation illimitée et pénurie punitive.
- Spécialisation émergente par activités/infrastructures (agricole, forestière, artisanale, portuaire, minière), **distincte** du niveau de port et du développement général.

## 4. Commerce maritime

- Routes déclarées par islandId, dockId et calendrier logistique ; les **bateaux voyageurs** ne dictent pas nécessairement la fréquence des cargos.
- Contrat d'achat/vente : ressource, quantité maximale, seuil de stock, capacité et priorité ; échanges bornés par les stocks disponibles.
- En bêta statique, **livraisons scénarisées/déterministes contre réserves locales** ou entre îles d'exemple sous simulation locale cohérente ; ne PAS prétendre transférer réellement un stock partagé entre des navigateurs indépendants.
- En multijoueur, une expédition a un ID immuable, un débit autoritaire à l'origine et un crédit idempotent à destination ; journal durable et traitement des retards/erreurs. Un bateau visible au port n'est qu'une représentation d'une expédition planifiée.

## 5. Horloge, rattrapage et coût borné

Rattraper des événements datés, pas itérer chaque frame/jour sur chaque arbre/PNJ. La fenêtre maximale, la granularité et les politiques d'agrégation restent **à mesurer**. Un calcul trop long se découpe en lots atomiques avec curseur persistant et limites de CPU ; conserver la conservation des stocks et l'ordre causal. Les îles non chargées n'ont ni scène, ni physique, ni audio, ni PNJ 3D.

**Attention horloges** : temps de jeu local déterministe pour la démo, autorité serveur future ; sans navigateur ouvert, les événements ne s'exécutent pas immédiatement, ils sont **reconstruits à la reprise**. Définir explicitement si un mode pause ou un temps écoulé réel avance le calendrier solo ; ne pas laisser le Date.now local déterminer des soldes sans borne.

## 6. Validation

- Même snapshot + mêmes événements → mêmes résultats ; tests répétables par seed et ordre.
- Conservation des stocks et non-négativité, capacité d'entrepôt, débits/crédits idempotents.
- Déconnexion/reprise, rattrapage de semaines, passage d'île et import/export de sauvegarde.
- Aucun calcul O(nombre de PNJ × frames) pour les îles absentes.
- Simulation d'une flotte/centaine d'îles logiques **sans charger leurs assets 3D**, mesure CPU/RAM et débit ; ne pas annoncer de capacité serveur avant benchmark.

## 7. Extension — commerce libre et filières de transformation (18/11/2026)

La nouvelle campagne de conception spécifie le **transport libre des biens dans le sac**, les **comptoirs réservés aux importations réellement reçues**, les **ateliers spécialisés de transformation**, les **recettes versionnées**, les **prix/stocks locaux** et les **transactions idempotentes**. Elle reste **SPECIFIED** et n'active aucun multijoueur.

Ordre de lecture : [80 — Audit du code et risques](80-ECONOMY-TRADE-CRAFT-AUDIT.md) → [81 — Contrats de produits/recettes/stocks](81-ECONOMY-PRODUCTION-CONTRACTS.md) → [82 — Roadmap, Studio et qualification](82-ECONOMY-PRODUCTION-ROADMAP.md). Les contrats 76 de simulation d'île non chargée et d'expédition atomique restent applicables ; ne pas développer un deuxième moteur d'économie.
