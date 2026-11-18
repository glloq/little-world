# 77 — Îles communautaires, permissions et construction progressive

**Statut : SPECIFIED — gameplay validé ; collaboration réseau non implémentée.** Références [73](73-ARCHIPEL-VISION-DECISIONS.md), [78](78-ISLAND-STUDIO-PLAYER-UX.md), [65 — Colonies](65-SETTLEMENTS-STUDIO-SPEC.md), [70 — Contrats de placement](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md), [16 — Multi](16-FUTURE-MULTIPLAYER.md).

## 1. Gouvernance sans propriétaire obligatoire

Une île peut être **publique, privée ou sur invitation**. Mode de construction configurable : libre encadrée, collaboration sur projets, approbation collective des grands travaux, **mixte**. Aucune nécessité d'un propriétaire universel ; une équipe peut gérer les politiques ou la communauté peut gouverner des biens communs.

Distinguer absolument :
- droit de **visiter** l'île ;
- droit de **réserver/occuper une parcelle** ;
- droit de **construire/modifier/supprimer** un objet précis ;
- droit de **contribuer** à un chantier ou stock ;
- droit de **proposer/voter** les infrastructures publiques ;
- droit de **modifier les politiques de gouvernance**.

Les habitants, visiteurs et constructeurs n'ont pas implicitement les droits d'administrateur. Les îles sauvages officielles peuvent refuser toute construction sauf zones explicitement ouvertes.

## 2. Parcelles et décisions

- Parcelle personnelle facultative avec droits d'usage configurables ; les routes, quais, espaces communs et ressources protégées restent communautaires.
- Petite décoration autorisée automatiquement dans limites de zones/quotas/collisions ; bâtiments moyens via projets de chantier ; routes majeures, nouveau port et restructuration demandent une décision collective si la politique l'exige.
- Votes : électorat, quorum, durée, veto de protection et recours sont **configurables et à calibrer**, sans valeur codée en dur. Prévoir absence de votants, conflits et transfert de responsabilités.
- Un changement de politique ne réattribue jamais silencieusement les constructions et matériaux ; versionner la décision et conserver les droits précédents jusqu'à migration contrôlée.

## 3. Plans, matériaux, chantiers

Le joueur sélectionne un **plan** (cabane, yourte, maison en terre/pierre/bois, terrier/dôme, atelier, moulin, ponton, routes, mobilier) dans le catalogue déjà partagé avec le Studio. Plans déverrouillables/achetables **une fois**, ressources consommées **à chaque construction** ; coût adapté aux matériaux et au thème, sans blocage arbitraire de styles si la logistique permet d'importer les matériaux.

États : PLANNED → FUNDED → BUILDING → COMPLETED, plus CANCELLED/PAUSED. L'apparition visuelle par étapes est une variation de prefab ; **pas de simulation de chaque ouvrier**. Dans les projets communs, plusieurs joueurs peuvent déposer des matériaux de manière sûre, avec provenance et quotas ; contributions auditables, règles de remboursement si annulation.

~~~ts
type IslandAccess = "private" | "invite" | "public";
type BuildingPhase = "planned" | "funded" | "building" | "completed" | "paused" | "cancelled";
interface BuildProjectV1 {
  projectId: string; islandId: string; parcelId: string;
  prefabId: string; prefabVersion: string;
  plannedTransform: {x:number;y:number;z:number;rotation:number};
  phase: BuildingPhase;
  requiredItems: Record<string, number>;
  contributedItems: Record<string, number>;
  revision: number;
}
~~~

Contrats illustratifs, à raccorder à l'inventaire, aux prefabs, transactions et colliders V3 réels.

## 4. Moteur commun Studio / jeu

**Ne pas recréer de second moteur de placement.** Reprendre solveur de parcelles, graphe de chemins, validations de pente, ancrages, dégagements, collision, portes, nav et budget de la campagne SET. Le Studio génère des sources auteur ; la construction joueur écrit des **mutations runtime persistantes**, jamais des changements dans le projet auteur publié.

Un placement joueur doit vérifier : droit d'éditer, terrain, pente, eau, cheminement vers porte, emprise/obstacles, coût, disponibilité du plan, quotas et cohérence des identifiants. Les interactions, collisions et LOD découlent du même prefab validé.

Le futur serveur traite **PLACE_BUILDING**, **CONTRIBUTE_MATERIAL**, **CANCEL_PROJECT** et **CHANGE_POLICY** comme commandes idempotentes et autoritaires, avec contrôle serveur, journal, révision et mise à jour incrémentale. L'UI ne préjuge jamais la réussite d'une commande.

## 5. Sécurité, persistance et mode solo

- Interdire destruction arbitraire de biens d'autrui, doublons de dépenses, triche d'inventaire, saturation de secteurs, constructions sur points d'apparition et blocage des routes/ports.
- Attribution de mutations et journal de restauration, outils d'annulation modérée, protection des parcelles, résolution des conflits et vieillissement des projets inactifs.
- **Sur GitHub Pages** : la construction test peut fonctionner en solo avec plans/stocks fictifs ou sauvegardés localement ; pas de collaboration réelle entre navigateurs, pas de vote inter-joueurs ni de propriété communautaire distante.
- La gouvernance collective est **compatible au niveau des données**, pas activée tant qu'un serveur multijoueur n'est pas explicitement décidé.

## 6. Recette de qualification

- Deux commandes simultanées simulées sur même parcelle : une seule construction validée.
- Une contribution rejouée ne débite jamais deux fois l'inventaire ; annulation conforme à la politique.
- Une porte reste franchissable, le chemin principal et le quai restent libres.
- Import/export local conserve plan, chantier, contributions simulées et droits sans dégrader le monde auteur.
- Tests permission refusée, perte de connexion future, reprise, revision mismatch, migration et restauration.
