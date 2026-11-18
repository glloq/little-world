# Commerces portuaires — brief de production low-poly

**Statut : N1/N2 V1 retenus comme bases graphiques (N2 : réserves de mesh) ; N3 V1 CANDIDAT 3D EN ATTENTE DE VALIDATION ; N4–N5 reportés.** Design normatif : [docs/85 — Identité commerciale](../../docs/85-PORT-TRADE-CENTERS-VISUAL-DESIGN.md). Cette famille contient désormais un GLB N1 V1 de référence, mais aucun prefab runtime/Studio livré.

## N1 V1 — modèle de base validé (18 novembre 2026)

Le **modèle 3D actuel a été retenu comme base visuelle V1 du niveau 1**. Cette décision valide la direction artistique, pas l'intégration au moteur.

- **GLB versionné** : [`public/models/commerce-portuaire/port-trade-n1-v1.glb`](../../public/models/commerce-portuaire/port-trade-n1-v1.glb) ; 2 362 triangles, 5 meshes (structure, toile, comptoir, caisses, enseigne), couleurs par sommet, **aucune texture**.
- **Visualiseur de validation** : [`examples/port-trade-n1-v1-viewer.html`](../../examples/port-trade-n1-v1-viewer.html), autonome, avec rotation/zoom et palettes de biomes.
- **Manifeste de référence** : [`n1-v1.json`](n1-v1.json) (SHA-256 et caractéristiques). **Ne pas modifier silencieusement ce GLB** : toute variante implique une nouvelle version et une revue artistique.
- **Silhouette retenue** : stand à quatre poteaux, toile rayée réellement modélisée avec plis et bordure, renforts en bois, comptoir vide, caisses vides, panneau hexagonal commercial, aucune marchandise ; accès arrière libre pour le PNJ.
- **Restant avant intégration** : valider échelle PNJ et collisions en jeu, sockets d'interaction, LOD, palettes et catalogage Studio. **PTC-1 partiel** : modèle V1 versionné, pas encore LOD/runtime validé.

## N2 V1 — cabane marchande, base graphique acceptée avec réserves (18 novembre 2026)

- **GLB de référence, inchangé** : [`public/models/commerce-portuaire/port-trade-n2-candidate-v1.glb`](../../public/models/commerce-portuaire/port-trade-n2-candidate-v1.glb), **3 728 triangles exportés**, huit sous-ensembles, couleur par sommet, sans textures. Cette géométrie a **été acceptée depuis comme base V1**, avec défauts de mesh à examiner ultérieurement.
- **Visualiseur 3D WebGL autonome** : [`examples/port-trade-n2-candidate-v1-viewer.html`](../../examples/port-trade-n2-candidate-v1-viewer.html). Rotation, vues avant/arrière/latérale, masquage murs/toit, dégagement PNJ, cinq palettes et export GLB.
- **Source de génération reproductible** : [générateur Python](tools/generate_port_trade_n2.py) et [template HTML](tools/template_port_trade_n2.html). Dépendances locales de fabrication `numpy` et `trimesh` (pas de dépendance dans le jeu/browseur) ; artefacts générés dans le dossier de l'outil.
- **Continuité N1** : emblème hexagonal caisse, comptoir, trois caisses vides, auvent en toile rayée (désormais **secondaire**). Évolution **réelle** vers cabane en bois avec parois, toiture rigide, guichet réellement évidé, accès arrière et espace intérieur PNJ.
- **Données de la base** : glTF/GLB 229 744 octets, dimensions environ **3,66 × 3,39 × 3,29 m** avec enseigne et surplombs ; empreinte SHA-256 : `8e75cf0a5c86b5a58ee7b7f138a7b2dce1530ab5d79643c7441dbb3e7ba44c3a`.
- **Tests limités** : ouverture Chromium, commandes de visualisation, palettes, capture PNG et export GLB byte-identique. **Non testé dans Little World/World Studio**, collisions/LOD et validité de passage du PNJ en jeu à qualifier.
- **Manifeste d'acceptation** : [`n2-v1.json`](n2-v1.json), statut `accepted_visual_baseline_mesh_review_pending`. Plusieurs défauts de mesh ont été signalés **sans liste technique précise** ; les identifier lors d'une future inspection et produire un correctif **N2 V1.1**, sans écraser le GLB adopté.
- **Validation mise à jour** : l'utilisateur a accepté ce modèle comme **base N2 V1** en signalant des défauts de mesh non identifiés précisément ; l'asset n'est pas qualifié pour le runtime.

## N3 V1 — candidat 3D en bâtiment dur (18 novembre 2026)

**Proposition graphique non encore approuvée par l'utilisateur** : un petit véritable bâtiment en pierre, avec toiture rigide en tuiles, guichet ouvert et auvent de toile secondaire, même logo de caisse hexagonale que N1/N2.

- **GLB candidat** : [`port-trade-n3-candidate-v1.glb`](../../public/models/commerce-portuaire/port-trade-n3-candidate-v1.glb) ; **5 496 triangles**, **9 sous-meshes**, zéro texture, SHA-256 `6502a3b47d9145b01dc70905b9d6b8f8da8cafae82a0ef82218b4c470cee7d7d`.
- **Visualiseur autonome** : [`examples/port-trade-n3-candidate-v1-viewer.html`](../../examples/port-trade-n3-candidate-v1-viewer.html), caméra libre, 5 palettes, visibilité des murs/du toit, vue intérieure arrière et export PNG/GLB.
- **Source reproductible** : [`tools/generate_port_trade_n3.py`](tools/generate_port_trade_n3.py) et [`tools/template_port_trade_n3.html`](tools/template_port_trade_n3.html) ; exécution locale facultative via `PORT_TRADE_OUT=/chemin python assets/commerce-portuaire/tools/generate_port_trade_n3.py` (dépendances `numpy`, `trimesh`).
- **Forme** : volume en maçonnerie, joints appuyés sur une âme de mur et non des trous, guichet ouvert, porte arrière battante, fenêtre latérale réellement ajourée, comptoir vide, 3 caisses vides, espace PNJ libre. Pas de marchandises ni quai.
- **Manifeste** : [`n3-candidate-v1.json`](n3-candidate-v1.json), dimensions env. **4,40 × 4,30 × 3,72 m** en incluant enseigne et toiture.
- **Tests effectués** : GLB lisible, 5 496 triangles vérifiés, HTML ouvert sans erreur JS sur Chromium (rendu logiciel disponible), bascule des palettes/vues/masques, export GLB octet-identique et capture PNG.
- **Limites** : guide PNJ non exporté ; **aucun LOD, test moteur, collider, socket ni qualification GPU matériel**. Une validation utilisateur du mesh N3 reste à obtenir.

**Arrêt de la modélisation au N3 pour cette campagne** : ne pas produire les N4/N5 maintenant. La phase suivante sera un audit/cadrage séparé d'**implantation sur la carte** des comptoirs N1–N3, de leur accès joueur/PNJ, des pontons modulaires, des docks/quais/ports, des distances et collisions, des points d'embarquement et de la relation avec `portLevel` (0–4). Aucun système de port ou Studio n'est implémenté ici.

## Famille unique, 5 modèles

| Identifiant cible (proposé) | Niveau | Asset à produire | Exigence bloquante |
| --- | --- | --- | --- |
| `port_trade_l1_stall` | 1 | Stand à **4 poteaux et toile tendue**, sans parois | Vue 360° : aucun mur, aucune porte, aucun toit rigide |
| `port_trade_l2_cabin` | 2 | **Petite cabane en bois** avec porte et guichet | On distingue une cabane complète, pas un kiosque ouvert |
| `port_trade_l3_stone_shop` | 3 | **Bâtiment en dur** avec comptoir couvert | Murs en pierre/maçonnerie dominants, pas de cabane repeinte |
| `port_trade_l4_hall` | 4 | Halle marchande à plusieurs travées | Halle et zone logistique lisibles sans surcharge |
| `port_trade_l5_exchange` | 5 | Grand centre d'échange + annexes | Hiérarchie des volumes, continuité architecturale avec N3/N4 |

IDs proposés pour le futur catalogue, **non enregistrés** ; toute création doit respecter les IDs/contraintes de la bibliothèque d'assets réellement présente.

## Pièces réutilisables et règles de construction

- **Emblème canonique** `port_trade_emblem` : caisse géométrique au sein d'un hexagone ; contour simple, contrasté et lisible de loin. Même forme sur les cinq assets, changement de support seulement (panneau N1–N3, bannière N4–N5).
- `trade_counter` : comptoir/table réutilisé avec adaptation minime ; surface de service et position d'interaction.
- `trade_canopy_cloth` : toile à faible nombre de faces ; **couverture principale N1**, simple auvent facultatif N2–N5.
- `trade_crates`, `trade_sacks`, `trade_barrel`, `trade_lantern` : détails optionnels et instanciables. Pas d'accessoire nécessaire à la reconnaissance du niveau.
- Partager quand pertinent matériaux et géométries ; attention aux pivots, normals, faces arrière, rigueur des collisions et de la décomposition GLB.

## Prévisualisations à produire

1. **Silhouettes sans accessoires**, fond neutre, même caméra isométrique, même éclairage et échelle relative N1–N5.
2. **Faces avant/latérales**, N1–N3 en priorité ; contrôle à hauteur du hamster.
3. **Comparatif des cinq palettes** sur **un même niveau** : tropical (corail/crème), forêt (vert/crème), montagne (bleu/écru), marais (ocre/beige), volcan (rouille/crème).
4. **Vue depuis un ponton** et depuis le sol ; l'enseigne est toujours visible depuis la zone d'accès commerciale.
5. **LOD près/moyen/loin** sans gros popping en déplacement rapide ; garder la silhouette et le logo quand discernables.

Les rendus de référence de la discussion servent de direction artistique **uniquement** ; ils ne sont ni meshes ni fichiers source de production.

## Intégration et vérification futures

- Exporter les cinq GLB et leurs LOD dans le **catalogue asset existant** après qualification ; conserver sources éventuelles et manifeste de provenance.
- S'appuyer sur [dock modulaire](../structures/dock/README.md) : cellules de **2 × 2 m** ; adapter les emprises sans imposer la même taille à tous les niveaux.
- Conserver `portLevel` (transport 0–4) **distinct** du niveau visuel commercial (1–5). Le niveau de bâtiment n'implique aucun prix ni stock automatique.
- Au Studio, une famille de prefab avec sélection niveau/palette ; ne pas coder de nouveau moteur de quai, d'économie ou de collision.
- Vérifier à terme : GLB et dimensions ; normals ; pivots ; enseigne ; accessibilité au guichet ; collisions ; sauvegardes/Undo-Redo ; vues proches et rapides ; coûts CPU/draw calls/RAM/GPU ; GitHub Pages statique.
- Les GLB N1/N2 sont des **bases visuelles acceptées**, et le GLB N3 est un **candidat pour validation** ; leur intégration au runtime/Studio reste **NOT IMPLEMENTED**.

## Démonstrateur N1 utilisable dans un navigateur

Le prototype de validation [examples/port-trade-l1-preview.html](../../examples/port-trade-l1-preview.html) est un **fichier HTML autonome** : ouvrir dans Firefox ou Chrome et utiliser glisser/zoom. Il présente un N1 ouvert à toile et permet de tester les cinq palettes, le logo, les accessoires et le ponton ; il propose un export PNG. Il s'agit du tout premier prototype, conservé pour historique. Le **visualiseur GLB de référence N1 V1** est désormais celui du lien ci-dessus. Les jalons LOD/runtime restent ouverts.

## Jalons d'exécution

| Jalon | Livrable | Validation |
| --- | --- | --- |
| **PTC-0** | Planche N1–N5 + logo commun, silhouettes approuvées | N1/N2/N3 distincts sans accessoires |
| **PTC-1** | N1 GLB + 5 palettes + LOD | Stand ouvert strict ; lecture de l'enseigne |
| **PTC-2** | N2 GLB cabane bois et N3 GLB bâtiment dur | Matériaux/silhouettes distincts, modules réutilisés |
| **PTC-3** | N4 halle et N5 centre majeur | Hiérarchie complète, décoration limitée |
| **PTC-4** | Intégration catalogue/Studio/docks | Placement, interaction, sauvegardes, export |
| **PTC-5** | Mesures et tests en îles statiques | Profil matériel bas, pas de régression visuelle ni de fuite de ressources |

**PTC-0** : direction graphique adoptée ; **PTC-1** : GLB N1 V1 de base livré, **LOD/intégration non qualifiés** ; **PTC-2** : N2 base acceptée avec corrections futures et N3 candidat à valider ; **PTC-3 à PTC-5** : reportés à la prochaine phase, sans débuter N4/N5.
