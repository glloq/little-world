# 86 — Implantation V1 des commerces maritimes sur les îles générées

**Statut : audit de l'existant et contrat d'intégration proposé — non implémenté.**  
**Décisions du 18 novembre 2026** (suite à la validation des modèles N1, N2 et N3 comme **bases graphiques**, malgré des défauts de mesh à traiter plus tard).

## 0. Objectif et limites

Intégrer **un comptoir maritime N1, N2 ou N3 par point de commerce maritime retenu** sur les cartes d'îles générées / publiées, en **réutilisant les GLB déjà produits**, les sites portuaires et le kit de ponton existants, le moteur de commerce et le système de navettes. Les îles de démonstration statiques GitHub Pages restent la cible principale.

- **Pas de N4/N5, pas de progression ni d'amélioration automatique**, pas d'association mécanique entre `portLevel` des navettes (0–4) et `tradeVisualLevel` des commerces (1–3).
- **Choix fixe par île / par point de commerce**, déterministe dans les données auteur (défaut proposé N1 pour un nouveau comptoir uniquement si un site valide a été confirmé). Une île peut explicitement choisir N2 ou N3 quel que soit le niveau du quai, sous réserve d'un terrain et d'un accès compatibles.
- N1 : stand ouvert en toile ; N2 : cabane bois ; N3 : maisonnette maçonnée. Enseigne hexagonale commune ; couleurs par biome ; **GLB inchangés** dans ce lot.
- Pas de nouvelle simulation d'économie, de PNJ ou de route maritime. **Même service cargo**, même sac, même politique de marché et même horloge de ferry que l'existant.

## 1. Audit code : points de raccord réels

| Zone | Existant | Adaptation à prévoir |
| --- | --- | --- |
| Monde généré | `src/studio-core/world-composition.ts`, `terrain-site-planner.ts`, `terrain-sites.ts`, `terrain-access.ts` | Pour une composition V5 avec `layout.harbor`, un `TerrainSite.kind='harbor'` fournit **plateau, `entry`, `shore`**, avec accès terrestre si validé. **C'est une réservation**, pas un quai ni une boutique construite. Les anciennes cartes / compositions hors V5 ne garantissent pas cette donnée. |
| Studio | `src/studio/terrain-sites-view.ts` | Le panneau indique explicitement **« Emplacement réservé : aucun quai ni bâtiment construit »**. Après qualification seulement, proposer l'implantation sur ce site, avec choix N1/N2/N3 et prévisualisation. |
| Pontons | `assets/structures/dock/README.md`, `public/models/structures/dock/*/lod0..2.glb`, `src/structures/assemble-dock.mjs` | Réemployer la **grille modulaire 2×2 m**, tile/post/bollard/ramp/ladder, sans second générateur de quais. |
| GLB commerces | `public/models/commerce-portuaire/port-trade-n1-v1.glb`, `port-trade-n2-candidate-v1.glb`, `port-trade-n3-candidate-v1.glb` | Les fichiers existent sur la branche. Les noms **candidate** de N2/N3 sont historiques ; **les trois sont acceptés comme bases artistiques V1**, non comme meshes runtime corrigés. |
| Registre 3D | `assets/world-assets.json`, `src/world-production/registry.ts`, `asset-usage.ts`, `src/world.ts` | **Un GLB dans `public/` n'est pas automatiquement plaçable.** Déclarer chaque prefab et son usage/provenance dans le pipeline de catalogue, générer les données, tester chargement, pivot, dimensions, LOD (ou statut provisoire explicite). Ne pas supprimer l'ancien `structure.counter_port` sans migration. |
| Placement / collision | `src/studio/viewport/placement-rules.ts`, `src/settlements/planner.ts`, `src/studio-core/terrain-access.ts` | Tester **emprise orientée réelle**, sol, eau, pente, accès continu joueur/PNJ, collision et dégagement du guichet. Le simple avertissement de placement ne suffit pas pour un placement automatique valide. |
| Comptoir local | `src/gameplay/economy.ts` (`ShopKind='port'`), `src/ui/shop/shop.ts` | Aujourd'hui ce commerce vend notamment la canne à pêche et reprend des produits locaux. Il est distinct des **lots importés** ; un même vendeur peut offrir des actions/onglets séparés qui réutilisent chacun leur autorité existante. |
| Import maritime | `src/archipelago/cargo-logistics.ts`, `src/ui/ferry/import-stand.ts` | Les lots proviennent des expéditions effectivement reçues ; **aucune marchandise fictive**. Le stock reste dans le service cargo, pas dans l'objet 3D. |
| Navette et UI | `src/archipelago/ferry-schedule.ts`, `ferry-view.ts`, `src/main.ts`, `src/ui/ferry/ferry-panel.ts` | Horloge et `ferryStatus(...).present` déjà disponibles. **L'import est aujourd'hui ouvert depuis le panneau ferry et `canUse()` dépend de `canBoardFerry()`** ; créer un **point de commerce distinct** et un **point de rameur à quai**. La navette est dessinée par `ferry-view.ts`, qui possède déjà une silhouette de rameur **embarquée** : veiller à ne pas afficher deux rameurs simultanément. |
| Îles publiées | `src/archipelago/registry.ts`, `public/archipelago/catalog.json` | Ce registre inclut `portLevel` **0–4 uniquement**. Ne pas lui ajouter `tradeVisualLevel` sans décider la source autoritaire / la migration. Préférer au début une instance auteur par monde V3 ; un catalogue de démonstration peut choisir sa présence via les données compilées. |

## 2. Composition cible du petit port

Un emplacement commercial et un point d'arrivée **sont un ensemble fonctionnel**, mais pas un seul mesh.

```text
                  MER / zone de navigation
                      [ NAVETTE ]
                          |
                     [ ACCOSTAGE ]
                          |
                    [ PONTON 2×2 ]
                          |
                [ RAMEUR à quai ]  <-- visible SI ferry.present
                          |
                 [ ESPACE D'ACCES ]
                          |
     [ COMMERCE N1/N2/N3 ]  <-- façade et interaction côté chemin
           [ VENDEUR ]         N1: présent SI ferry.present
                               N2/N3: présent en permanence
                          |
                   [ CHEMIN TERRESTRE ]
                          |
                         ÎLE
```

Ce schéma illustre des **relations** et non une obligation de montage en ligne. Selon côte, rochers et village, le commerce peut être **à côté du ponton**, sur le replat terrestre, avec un accès court. Il n'est pas nécessaire de poser la maison N3 **sur** un ponton.

### Sockets / emplacements logiques

| Socket proposé | Rôle | Permanence |
| --- | --- | --- |
| `mooring` | Zone en eau pour la navette, profondeur et dégagement compatibles | Toujours géométriquement réservé ; bateau visible selon l'escale |
| `boarding` | Point piéton sûr à l'extrémité du ponton/quai | Toujours présent et identifiable |
| `rowerQuay` | Position debout / accès du **rameur sur le quai** | **PNJ visible uniquement pendant l'escale** |
| `tradeBuilding` | Pivot / empreinte 3D du stand, cabane ou maisonnette | **Bâtiment toujours visible** |
| `merchantHome` | Position du **commerçant**, derrière le comptoir / dans le guichet | **N1 : ferry présent ; N2/N3 : toujours** |
| `tradeInteract` | Point d'interaction joueur **devant** la façade marchande, relié à l'économie/cargo | Visible/actif selon la présence du marchand |
| `landAccess` | Liaison accessible vers le chemin de l'île et les éventuels villages | Toujours présente |

Positions et orientations sont **des données dérivées/validées à partir du site final**, puis persistées dans les entités V3 ou leurs paramètres d'authoring, **pas des clés inventées dans les schémas V3 existants**. Le **point rameur** doit être distinct du `ferryDock` en eau et du guichet. Le `boarding` est aussi distinct de `tradeInteract`.

**Ordres de grandeur de départ à ajuster après test réel** : N1 **3,38 × 2,23 m** au sol hors dégagement, N2 **3,66 × 3,39 m**, N3 **4,40 × 4,30 m**. Un ponton est composé de multiples de **2 m**. Tester dégagement devant comptoir (2 m cible), libre passage vers embarquement (≥2 m cible), rameur non superposé à l'interaction ferry ni à la collision du quai. Ce sont des **cibles d'authoring**, non des dimensions certifiées par le moteur.

## 3. Règles fermes de présence du rameur et du commerçant

**Source unique pour la navette** : `ferryStatus(worldGameMinute(...), island.portLevel).present`. Aucun minuteur indépendant / état stocké de présence de PNJ qui dérive de l'horloge.

| Niveau du commerce | Navette présente | Navette absente |
| --- | --- | --- |
| **N1 — stand à toile** | Navette visible ; **rameur à quai** ; **commerçant derrière le stand** ; voyage et commerce disponibles si conditions métier OK | Pas de navette ; **pas de rameur** ; **pas de commerçant** ; commerce inaccessible mais **stand, caisses et enseigne persistent** |
| **N2 — cabane bois** | Navette + rameur à quai ; commerçant à son guichet | **Navette et rameur absents** ; commerçant **reste à son guichet** ; commerce accessible |
| **N3 — maison en dur** | Navette + rameur à quai ; commerçant à son guichet | **Navette et rameur absents** ; commerçant **reste à son guichet** ; commerce accessible |

Interprétation explicite : **« les deux disparaissent » concerne les deux PNJ au niveau 1, et non l'asset du stand ou son stock**. Les caisses et structures sont permanentes. Le rameur est un **personnage distinct du commerçant**, même si la carte reste déserte entre deux escales N1.

- `merchantVisible = tradeVisualLevel >= 2 || ferryPresent`.
- `rowerQuayVisible = ferryPresent`.
- `merchantInteractionEnabled = merchantVisible && marketServiceReady && playerNearTradeInteract`.
- `ferryInteractionEnabled = ferryPresent && playerNearBoarding && ferryServiceReady`.
- **Voyage** : conditionné au rameur/ferry et au point `boarding`, pas à la présence du vendeur.
- **Commerce N1 absent** : panneau de marché non interactif ; des offres peuvent rester **persistées** dans le service cargo. Pas de suppression d'offres, de pièces, de vente différée ni de réinitialisation de marchandises au départ de la navette.
- **Commerce N2/N3 hors escale** : achats/ventes possibles selon **réel stock** et règles métier ; l'absence de navette ne génère **aucune cargaison**.
- Si `ferryStatus` indique une escale permanente (port d'infrastructure 4), les deux PNJ peuvent rester présents, conformément à la **logique de présence du bateau** ; c'est indépendant du niveau graphique du commerce.

### Transition de l'escale (une seule autorité)

```text
Initialisation / chargement / retour d'une autre île
  -> lire ferryStatus(gameMinute, portLevel)
  -> synchroniser visibilité bateau, rameur et commerçant (N1 seulement pour commerçant)

Arrivée : ferryPresent = true
  -> montrer navette + rameur à rowerQuay
  -> montrer commerçant si N1, conserver vendeur si N2/N3
  -> interactions habilitées selon position et économie

Préavis départ à -5 min : son de cloche EXISTANT
  -> aucun changement forcé d'acteur ; navette encore présente

Départ : ferryPresent = false
  -> masquer navette et rameur
  -> masquer commerçant **uniquement si N1**
  -> désactiver embarquement ; N1 commerce non interactif
  -> conserver stock, placements, collisions, repères de carte

Changement d'île / restauration / saut de temps
  -> recalcul direct depuis ferryStatus, sans créer de second actor
  -> ne pas rejouer rétroactivement les cloches
```

**Risque réel identifié** : `src/archipelago/ferry-view.ts` construit déjà une représentation de rameur **assise dans la barque** (torse / tête / oreilles). Quand le rameur autonome est visible à quai, soit retirer/masquer ce petit personnage embarqué pendant l'escale, soit remplacer la visualisation par une version canonique. **Jamais deux copies visibles de « rameur de la navette » pour une seule escale.** Le futur PNJ autonome ne doit pas devenir un second système de trajet.

**Présentation UX** : N1 hors escale peut afficher une info « Commerçant de passage — revient avec la navette » par un repère non marchand ou sur la carte, sans ouvrir un panneau d'achat inaccessible. N2/N3 utilisent le même déclenchement d'interaction à proximité du `tradeInteract`, avec la navette dans une action et le commerce dans une autre. Sur mobile, garder le bouton Action existant.

## 4. Contrat d'implantation : déterministe et sans doublons

1. **Sélectionner le site portuaire** : privilégier le `TerrainSite.kind='harbor'` de V5 ; vérifier `entry`, `shore`, plateforme finale, pente, eau, trajet vers l'intérieur. Si aucun site ou eau d'approche valide : **diagnostic explicite** et possibilité de le placer manuellement dans Studio, pas de spawn arbitraire près du joueur.
2. **Déterminer `tradeVisualLevel`** depuis la recette d'île/auteur (**1, 2 ou 3**, valeur **fixe**), **indépendant du `portLevel`**. Ne pas le déduire de richesse, population ou météo ; aucune montée de niveau.
3. **Composer un ponton minimum viable** avec le kit existant et `boarding`, `rowerQuay` ; garder un passage entre zone de rameur et chemin, sans chevaucher le point d'amarrage.
4. **Trouver le sol du commerce** sur le replat terrestre : tester emprise orientée (y compris toit/enseigne), collision avec chemins/maisons/falaise/eau, pente, dégagement côté joueur et accès PNJ. **Façade commerciale face au chemin / passage joueur**, non aveuglément vers l'eau. Préférer un retrait à la rive plutôt que de construire N2/N3 sur la structure du ponton.
5. **Créer une entité V3 stable** (composants `Transform`, `Visual`, collisions ciblées), un point d'interaction marchand, un point PNJ marchand et un point PNJ rameur ; les liens de métier restent dans le système économique existant, avec des IDs réutilisables et non indexés sur l'ordre des GLB.
6. **Connecter les interactions** aux contrôles existants : `src/main.ts` `currentTarget()` / `nearShop()`, `src/ui/interactions/targets.ts`, `GameUi.openShop` ou panneau import. **Ne plus utiliser `canBoardFerry()` comme test de distance du stand d'import**. Garder le panneau ferry dédié au voyage ; il peut lier vers les offres en lecture seule, pas court-circuiter la localisation du marchand.
7. **Sauvegarde / compilation** : placer dans les sources natives V3 (avec indices/chunks/transform), tests aller-retour Studio → compilation → GitHub Pages, maintien des modifications utilisateur. Une génération identique ne multiplie pas les stands/acteurs ; un site verrouillé ou corrigé manuellement reste conservé.
8. **Cas d'île N0** : une île sans commerce / site éligible reste publiable sans stand, sans se voir imposer un quai par la seule présence d'une navette. Gérer le ferry existant sans régression, avec diagnostic de limite de placement commercial.

**Remarque collision** : `src/world-production/registry.ts` attribue typiquement aux bâtiments un gros collider de footprint. Cela peut bloquer l'accès intérieur/guichet et placer le PNJ dans une zone solide. Décomposer si nécessaire en segments de murs, comptoir et porte ; ne pas générer un gros collider plein qui annule l'ouverture réelle. Le PNJ décoratif doit pouvoir être caché par LOD, mais ses interactions suivent l'horloge et la distance, pas `Object3D.visible`.

## 5. Catalogue / données proposées (à adapter aux schémas validés)

```ts
// Proposition de données d'authoring, PAS un nouveau type de schema V3 déjà accepté.
type TradeVisualLevel = 1 | 2 | 3;
interface MaritimeTradePlacementDraft {
  islandId: string;
  siteId: string;              // lien vers harbor ou site manuel autorisé
  tradeVisualLevel: TradeVisualLevel;
  assetId: string;             // ID du registre World Production, PAS chemin ad hoc
  tradeCounterId: string;      // id stable, référencé par les services commerciaux
  boardingAnchorId: string;
  rowerQuayAnchorId: string;
  merchantAnchorId: string;
  merchantInteractAnchorId: string;
  merchantPolicy: 'ferry-only' | 'permanent'; // dérivé de N1 vs N2/N3, pas éditable
}
```

Le schéma validé des `ProjectDocument`, `libraries`, `MapRequirements` et `PublishedIsland` est strict : **ne pas ajouter ces champs sans migration / validation / test**. Préférer d'abord les **entités et composants V3 existants**, avec un petit manifeste auteur dédié seulement si réellement nécessaire.

## 6. Roadmap d'intégration réduite (sans N4/N5)

| Jalon | Travail | Preuve requise |
| --- | --- | --- |
| **PTC-P0** | Cadrer le site, les points `mooring/boarding/rowerQuay/tradeBuilding/merchantHome/tradeInteract`, statuts N1–N3 et règles d'escale | Deux PNJ séparés ; matrice de présence validée ; diagnostics de site |
| **PTC-P1** | Inscrire 3 GLB dans la pipeline d'assets / Studio sans écraser `counter_port` ; pivots, palettes, rendus et LOD minimum | Catalogue généré, tests actifs, aucun GLB manquant / régression |
| **PTC-P2** | Composer ponton + emprise du commerce sur un site existant validé (prévisualisation + commit V3) | Pas de collision ni de pente invalides, retour Undo/Redo, positions stables |
| **PTC-P3** | Deux sockets PNJ, branchement `ferryStatus`, embarquement et interaction commerce autonomes | Tests présence/absence N1/N2/N3, priorité `E`, mobile ; aucune duplication |
| **PTC-P4** | Rebrancher panneau import du ferry sur l'interaction commerçant ; garder autorité des lots et stocks | Tests vente/achat, distance marchand vs quai, sauvegarde, changement d'île |
| **PTC-P5** | Intégrer une île de démonstration de chaque style (ou une scène test pour les trois) et passage GitHub Pages | Build, FPS bas matériel, distance/accès PNJ, vue vol rapide, arrivée/départ + persistance |

### Tests de régression non négociables

- [ ] N1 ferry absent : **0 PNJ**, bâtiment visible, stand non interactif, stock inchangé.
- [ ] N1 ferry présent : **1 rameur au quai + 1 commerçant derrière le stand**, navette visible, chacun a son interaction propre.
- [ ] N2/N3 ferry absent : **0 rameur mais 1 commerçant**, commerce actif, aucun faux bateau.
- [ ] N2/N3 ferry présent : **1 rameur + 1 commerçant**, absence de doublon rameur embarqué/à quai.
- [ ] Passage début/fin d'escale, fermeture/réouverture, saut de plusieurs heures, changement d'île : aucun PNJ orphelin, pas de cloches historiques rejouées.
- [ ] Un commerce N2/N3 seul ne rend pas le ferry présent ; un `portLevel` élevé ne change pas automatiquement le modèle de commerce.
- [ ] L'implantation ne casse pas les navettes, les chemins, les collisions, les anciens `structure.counter_port`, les anciennes sauvegardes, le commerce de pêche ni les lots réellement livrés.
- [ ] Pas de commerçant placé dans un collider plein / de comptoir inaccessible ; **interaction côté joueur**, rameur dans un espace praticable du quai ; aucune marchandise fictive.
- [ ] Aucune génération aléatoire de commerce à proximité du spawn ni pose automatique sur eau/terrain inadapté. Warnings ou erreurs de site traités explicitement.

## 7. Décisions explicitement reportées

- Évolution des bâtiments et **niveaux 4–5**.
- Port industriel, grandes jetées, stockage visible détaillé, plusieurs navettes simultanées.
- Nouveaux PNJ économiques avec emplois du temps indépendants ; l'horloge du ferry est suffisante en N1 et la permanence des N2/N3 est statique pour le moment.
- Économie avancée/multijoueur : état de marché maintenu dans l'architecture solo actuelle.
- Correction des **meshes N2/N3** : accepter ces fichiers comme **bases visuelles**, qualifier et versionner des corrections séparément, pas modifier les fichiers approuvés silencieusement.

**Ordre de la prochaine intervention de code recommandé :** `PTC-P0` + `P1` + une **implantation de démonstration N1** ; seulement après validation des points de vue et de la circulation, généraliser N2/N3. Ce plan est une spécification de mise en œuvre, et **ne prétend pas que les stands sont déjà placés sur les îles**.
