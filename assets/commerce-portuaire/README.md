# Commerces portuaires — brief de production low-poly

**Statut : OBJECTIF / ASSETS À PRODUIRE.** Design normatif : [docs/85 — Identité commerciale](../../docs/85-PORT-TRADE-CENTERS-VISUAL-DESIGN.md). Cette arborescence ne contient pas encore de GLB ni de prefab livré.

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
- Le **statut des modèles reste NOT IMPLEMENTED** tant que les GLB et les tests ne sont pas effectivement ajoutés et validés.

## Démonstrateur N1 utilisable dans un navigateur

Le prototype de validation [examples/port-trade-l1-preview.html](../../examples/port-trade-l1-preview.html) est un **fichier HTML autonome** : ouvrir dans Firefox ou Chrome et utiliser glisser/zoom. Il présente un N1 ouvert à toile et permet de tester les cinq palettes, le logo, les accessoires et le ponton ; il propose un export PNG. Il ne contient pas de GLB et ne constitue pas une livraison des jalons PTC-1…5.

## Jalons d'exécution

| Jalon | Livrable | Validation |
| --- | --- | --- |
| **PTC-0** | Planche N1–N5 + logo commun, silhouettes approuvées | N1/N2/N3 distincts sans accessoires |
| **PTC-1** | N1 GLB + 5 palettes + LOD | Stand ouvert strict ; lecture de l'enseigne |
| **PTC-2** | N2 GLB cabane bois et N3 GLB bâtiment dur | Matériaux/silhouettes distincts, modules réutilisés |
| **PTC-3** | N4 halle et N5 centre majeur | Hiérarchie complète, décoration limitée |
| **PTC-4** | Intégration catalogue/Studio/docks | Placement, interaction, sauvegardes, export |
| **PTC-5** | Mesures et tests en îles statiques | Profil matériel bas, pas de régression visuelle ni de fuite de ressources |

Aucun jalon PTC n'est déclaré terminé à la création de ce document.
