# 85 — Identité graphique des commerces portuaires : cinq niveaux low-poly

**Statut : DESIGN APPROUVÉ ; MODÈLE GLB N1 V1 DE RÉFÉRENCE VERSIONNÉ ; aucune intégration runtime livrée.**
**Décision du 18 novembre 2026.** Références : [75 — transports et ports](75-ISLAND-TRAVEL-FERRIES-PORTS.md), [76 — économie insulaire](76-ISLAND-AUTONOMY-ECONOMY-TRADE.md), [80 — audit du commerce](80-ECONOMY-TRADE-CRAFT-AUDIT.md), [82 — roadmap économique](82-ECONOMY-PRODUCTION-ROADMAP.md), [06 — pipeline assets](06-ASSET-PIPELINE.md), [11 — low-resource](11-LOW-RESOURCE-POLICY.md), [20 — Blender/Studio](20-BLENDER-STUDIO-INTERCHANGE.md), [75 — établissements V1](75-SETTLEMENTS-SURFACE-V1.md).

## 0 bis. Baseline 3D N1 V1 validée — 18 novembre 2026

Le **GLB low-poly de stand ouvert** fourni dans le prototype précédent a été **retenu comme base de la V1** : [modèle versionné](../public/models/commerce-portuaire/port-trade-n1-v1.glb), [visualiseur](../examples/port-trade-n1-v1-viewer.html) et [manifeste SHA-256](../assets/commerce-portuaire/n1-v1.json).

Identité du modèle : quatre poteaux et entretoises en bois, toile rayée avec légère courbure et feston modélisés, comptoir sans objets à vendre, caisses vides, panneau à caisse hexagonale, **zone libre pour le PNJ vendeur derrière le comptoir**. Cinq meshes, **2 362 triangles**, zéro texture. Dimensions indicatives **3,38 × 2,23 × 3,00 m** (largeur × profondeur × hauteur), à recaler sur l'échelle réelle des personnages.

**Statut précis : VALIDÉ COMME BASE ARTISTIQUE**, *pas* « intégré au jeu » ni « qualifié sur vieux PC ». Des modifications futures peuvent être proposées sous nouvelle version **N1 V1.1 ou V2**, sans remplacer cette référence immuable. Les objectifs de LOD, collisions, Studio et commerce restent à réaliser et tester.

## N2 — proposition 3D à valider

La cabane marchande N2 **candidate V1** est disponible sous forme de [GLB](../public/models/commerce-portuaire/port-trade-n2-candidate-v1.glb) et de [visualiseur 3D](../examples/port-trade-n2-candidate-v1-viewer.html), avec [source de génération](../assets/commerce-portuaire/tools/generate_port_trade_n2.py). Elle conserve les codes du stand N1 déjà approuvé : mêmes bois/palettes, symbole hexagonal de caisse, comptoir et caisses vides ; sa **toiture est en bois** et la toile rayée devient un auvent de guichet.

**Statut : PROTOTYPE NON APPROUVÉ**. Ne pas confondre avec le N1 V1 validé. Le N2 est une cabane à murs en planches, fenêtre de côté, guichet découpé en façade, porte arrière ouverte et zone intérieure libre pour PNJ. Les dimensions, colliders, LOD et placement Studio sont à qualifier avant production.

## 1. Objectif et périmètre

Un commerce portuaire de Little World doit être **immédiatement identifiable sur toutes les îles**, indépendamment du biome et de leur spécialisation économique. Les cinq niveaux constituent une **même famille visuelle** à progression nette : **stand ouvert en toile → petite cabane en bois → bâtiment en dur → halle marchande → grand centre d'échange**.

- **Décision graphique** : mêmes silhouettes et modules de référence par niveau sur toutes les îles. Adapter surtout **les couleurs**, secondairement de petits accessoires, sans créer cinq architectures distinctes par biome.
- **Signe distinctif invariant** : symbole de **caisse stylisée inscrite dans un contour hexagonal**, en silhouette simple et lisible à distance. Ce symbole ne doit pas dépendre d'un texte ni de l'échelle du bâtiment.
- **Progression lisible sans interface** : le joueur doit distinguer N1, N2 et N3 à leur nature constructive seule, pas au nombre de marchandises ou à la couleur.
- **Périmètre de ce chantier** : direction artistique, composition, exigences de modèles, palettes, placement, critères d'acceptation. La simulation commerciale, les trajets, le calendrier et les prix restent la propriété des systèmes existants.

> **Attention aux niveaux homonymes** : les **niveaux d'infrastructure portuaire 0–4** de [75](75-ISLAND-TRAVEL-FERRIES-PORTS.md) gèrent les navettes, quais et capacités de fret. Les **niveaux graphiques de commerce 1–5** de ce document sont **une autre échelle**, sans correspondance numérique implicite. Aucun changement de `portLevel` existant n'est autorisé par cette spécification.

## 2. Contrat visuel des cinq niveaux

| Niveau graphique | Nom retenu | Silhouette impérative | Éléments visibles | À proscrire |
| --- | --- | --- | --- | --- |
| **N1** | **Stand d'échange** | **Étal entièrement ouvert**, quatre poteaux légers, **toile tendue** en guise de couverture ; aucune cabane | Table/comptoir indépendant, petite enseigne à caisse, 1–2 caisses ou sacs | Murs, porte, fenêtres, bardage fermant le fond, toiture rigide, bâtiment |
| **N2** | **Cabane marchande** | **Petite cabane fermée en bois**, murs en planches et toit rigide ; fenêtre/guichet commercial en façade | Comptoir à guichet, porte d'accès, petite réserve, enseigne commune, auvent facultatif | Ressembler à un simple stand ouvert, maçonnerie dominante, ailes volumineuses |
| **N3** | **Maison de commerce** | **Vrai bâtiment en dur**, pierre/maçonnerie clairement perceptible, toiture robuste ; façade marchande | Comptoir couvert, ouvertures et réserve intérieure, enseigne, petites marchandises | Simple cabane de bois repeinte, complexité d'une grande halle |
| **N4** | **Halle marchande** | Grand volume de commerce en dur, **galerie/halle couverte ouverte sur la circulation** | Plusieurs travées, stockage identifiable, une ou plusieurs zones de service, grande bannière/enseigne | Château, édifice religieux, profusion de petites tourelles sans rôle |
| **N5** | **Grand centre d'échange** | Bâtiment principal commercial **plus imposant**, annexes/entrepôts lisibles, composition cohérente avec N3–N4 | Entrée marchande centrale, zones logistiques, grande signalétique, marqueurs portuaires | Palais irréaliste, multiplication décorative des textures et lumières |

### Décisions de détail

**N1 — référence prioritaire**
- **Toile visible, tendue ou légèrement retombante**, à deux bandes de couleur alternées. Elle constitue **la toiture**, pas un auvent ajouté à une cabane.
- Quatre poteaux en bois, **aucun volume mural** ; table de vente simple, espace libre sous la toile, signe suspendu sur l'un des côtés.
- Une petite caisse et un sac suffisent. Le stand doit rester identifiable **sans ponton, palmier, décor, PNJ ou éclairage**.
- Emprise cible de départ : **1 module de quai de 2 × 2 m** si le placement le permet, à calibrer à l'échelle du personnage et au passage du joueur.

**N2 — changement constructif**
- Cabane compacte **en bois**, avec murs de planches, **porte** et **guichet** ouverts vers le joueur.
- Toit à pans simple et rigide ; **petit auvent de toile facultatif** pour rappeler N1, mais le bâtiment ne peut pas paraître ouvert sur ses quatre faces.
- Présenter une réserve intérieure ou accolée **sans transformer la cabane en entrepôt**.

**N3 — changement de matériau**
- Murs majoritairement **pierre, brique ou maçonnerie en dur** ; ossature bois décorative possible, mais le mur doit se lire comme massif.
- Toit durable (tuiles/planches renforcées selon la palette), façade avec guichet et entrée.
- La différence N2→N3 doit être évidente **en niveaux de gris** et avec tous les accessoires masqués.

**N4–N5 — évolution de la même famille**
- N4 agrandit les surfaces commerciales en une halle à travées et stockage ; N5 rassemble la halle, une façade centrale forte et des volumes d'entrepôts.
- Ne pas introduire une architecture étrangère aux trois premiers niveaux ; faire grandir la famille de modules, non les ornements arbitraires.

## 3. Signature commune et variantes de biomes

**Symbole canonique** : caisse 3D stylisée (trois faces ou rubans simples), **dans un hexagone**. Une seule géométrie/silhouette pour tous les niveaux. Pas de typographie indispensable au repérage.

**Placement** : panneau latéral suspendu N1, plaque/enseigne au-dessus du guichet N2–N3, bannière ou panneau agrandi N4–N5. En approchant, le logo doit toujours désigner **le point d'interaction commerciale**.

**Règle des variantes** : partager le prefab/mesh ; appliquer une **palette couleur par biome** à des emplacements nommés, sans multiplier les modèles. Le symbole garde sa géométrie et un contraste fort avec son support.

| Biome | Bois/socle | Toile et accents du commerce | Bâtiment en dur N3+ |
| --- | --- | --- | --- |
| Tropical | Bois clair, sable | Corail / crème | Pierre sable, murs clairs |
| Forêt | Bois brun naturel | Vert mousse / crème | Pierre grise chaude |
| Montagne | Bois brun sombre | Bleu ardoise / écru | Pierre gris froid |
| Marais | Bois grisé | Ocre / beige ou olive | Pierre gris-ocre |
| Volcan | Bois brun-roux | Rouille / crème | Basalte sombre |

Les valeurs précises de palette seront fixées **après revue des rendus en lumière réelle du jeu**. On peut adapter accessoires végétaux et petits éléments nautiques au biome, mais **pas changer forme, organisation ou emblème** de la famille.

## 4. Cohérence avec le port, le gameplay et l'économie

- Un comptoir se place sur une **zone de circulation praticable près d'un accès maritime** (ponton, quai ou côte), sans bloquer l'embarquement ni les collisions.
- **Ne pas exiger un grand port pour afficher un N1** ; un simple débarcadère peut accueillir le stand. Les ports bâtis sont un sujet de composition séparé.
- La classe graphique d'un bâtiment **n'accorde pas automatiquement** un meilleur prix, une route ou du stock. Les capacités commerciales dépendent des profils et règles d'économie réellement mis en place.
- L'**import maritime** n'expose une marchandise étrangère comme reçue que si l'expédition correspondante existe ; voir ECO-7 dans [82](82-ECONOMY-PRODUCTION-ROADMAP.md). Un comptoir local généraliste n'est pas une preuve d'importation.
- Toutes les interfaces achat/vente du joueur doivent réutiliser les commandes et les données de marché existantes ; aucun système parallèle de boutique.
- L'inventaire personnel du joueur reste librement transportable entre îles selon les limites ordinaires : aucun blocage graphique, taxe ou quota de transit introduit ici.
- Signe/enseigne : conserver le lien vers une interaction commerciale au LOD proche ; le rendu lointain peut afficher un proxy, **sans supprimer la logique d'interaction**.

## 5. Cahier de production 3D LOW-RESOURCE

- Livrer **cinq prefabs**, au minimum, chacun avec identifiant stable, pivot sol et axes/échelle compatibles Studio, emprise/zone d'interaction, silhouette LOD0/LOD1 et éventuellement proxy lointain.
- Réutiliser les géométries de **comptoir, poteaux, caisse, logo, panneau, toile, guichet** quand elles ont le même rôle. Matériaux unis/vertex colors de préférence ; pas de textures 4K ni de shaders spéciaux.
- Kit docks existant : [assets/structures/dock/README.md](../assets/structures/dock/README.md), grille **2 × 2 m**. Prévoir des compositions sur modules adjacents plutôt qu'une nouvelle génération de quai.
- Un matériau de toile **opaque et double face si nécessaire** ; contrôler faces inversées, culling, lumière, ombres et profondeur. Préférer la géométrie simple aux alpha/transparences qui augmentent l'overdraw.
- Collisions simplifiées et décorrélées des détails : plancher, murs et comptoir suffisent ; nav/interaction accessibles à pied. Accessoires décoratifs sans collider individuel sauf usage interactif réel.
- Ne pas fixer de budget de triangles absolu « validé » sans regarder le prefab final et ses instances. Évaluer triangles, **draw calls, matériaux, mémoire, overdraw et popping**, en zoom proche et en plané rapide. N1 doit rester particulièrement léger.
- Conserver la qualité perçue : lire les **silhouettes à distance**, puis réduire petits détails par LOD. Ne pas faire disparaître un centre d'échange important sans représentation lointaine.
- Sources originales/redistribuables ; .glb pour la scène, .blend optionnel hors runtime. Les catalogues et transformations restent des données de source, pas une image aplatie.
- Ne pas créer de nouveaux systèmes d'ombre, d'instances ou de streaming pour ce lot : s'appuyer sur le pipeline existant après audit.

## 6. Contrat cible World Studio (non implémenté)

**Famille** `port-trade-center` ; **niveau graphique** `tradeVisualLevel: 1 | 2 | 3 | 4 | 5`, **style de couleur** `biomePaletteId`, **identité économique** `shopId` (ou lien métier déjà supporté), **socket d'interaction** et **empreinte au sol**.

Ces champs sont **indicatifs**, non un nouveau schéma Studio accepté : vérifier les schémas V3 et le modèle d'établissements avant introduction. **Ne pas renommer `portLevel` ni injecter une nouvelle clé inconnue dans `libraries`** ; toute évolution nécessite migration, validation et compilation.

Cible UX : sélection unique « Commerce portuaire » → niveau 1–5 → palette automatique selon biome (override couleur facultatif) → prévisualisation, placement, rotation, déplacement, Undo/Redo, export. Pas de cinq panneaux d'édition différents.

## 7. Critères d'acceptation artistique (gates)

- **VIS-1** : cinq silhouettes différentes et ordonnées sur fond neutre, même échelle, sans décor. N1 est *strictement un stand à toile* ; N2 une *petite cabane en bois* ; N3 un *bâtiment en dur*. Échec si l'un peut se confondre avec son voisin.
- **VIS-2** : logo de caisse hexagonal **identique et reconnaissable** sur N1–N5, y compris couleurs de biomes différentes.
- **VIS-3** : jeu de variantes par couleurs sur au moins **tropical, forêt, montagne, marais, volcan** ; pas de silhouettes différentes pour un même niveau.
- **VIS-4** : inspection isométrique, vue joueur proche, vue à moyenne distance et vol rapide ; lisibilité sans accessoire ni éclairage spécifique.
- **VIS-5** : pas de murs sur N1 ; N2 fermé et guichet accessible ; N3 maçonnerie réellement lisible ; colliders/accès cohérents.
- **VIS-6** : assets réutilisables/LOD, budget CPU-GPU évalué sur scène chargée, aucune promesse de FPS avant mesure.
- **VIS-7** : si intégration Studio : placement, sauvegarde, réouverture, Undo/Redo, interactions et migration des anciens projets sans perte.

**État de livraison** : N1 V1 de référence (GLB) versionné, design des N2–N5 documenté. N1 non intégré au jeu/Studio ; LOD et tests de performance manquants. La production des autres GLB reste à faire.

## Prototype interactif de validation (18/11/2026)

Le fichier [examples/port-trade-l1-preview.html](../examples/port-trade-l1-preview.html) est un **visualiseur autonome d'architecture N1**, ouvrable localement dans un navigateur, sans serveur ni bibliothèque externe. Il permet rotation libre, zoom, cinq palettes de biomes, visibilité du ponton, des accessoires et de l'enseigne, ainsi qu'une capture PNG.

**Statut** : **prototype géométrique interactif de validation uniquement**. Le rendu utilise une scène 3D projetée sur Canvas 2D ; **ce n'est pas un GLB/asset de production**, ni un prefab Studio, ni une intégration au gameplay. Les formes, proportions, couleurs et emblème attendent la validation visuelle du joueur avant l'implémentation Three.js/GLB.

## 8. Ordre recommandé

1. **Graphique d'abord** : planche neutre N1–N3 et logo commun ; verrouiller les silhouettes et le ratio d'échelle.
2. **Validation N1** : produire le stand ouvert avec toile, variation de palettes ; vérifier lecture en jeu à distance.
3. **Validation N2–N3** : cabane bois puis bâtiment en dur, en partageant enseigne, comptoir et accessoires.
4. **Extension N4–N5** : halle et centre majeur, stockage/logistique et réduction LOD.
5. **Studio et gameplay** : composer avec les modules docks, relier au commerce existant, tester interactions, îles statiques GitHub Pages et performances.

Voir le [brief de production d'assets](../assets/commerce-portuaire/README.md).
