# Little World — Végétation low-poly, lots 1 et 2

26 modèles validés, chacun avec deux niveaux de détail (LOD0 et LOD1), soit 52 GLB.

- GLB 2.0, mètres, Y-up, couleurs intégrées aux sommets.
- Aucun fichier de texture externe.
- Modèles: `public/models/vegetation/{trees|shrubs|ground|deadwood}/<asset-id>/lod{0|1}.glb`
- Manifeste lot 1: `assets/vegetation/lot1-manifest.json` (14 modèles).
- Manifeste lot 2: `assets/vegetation/lot2-manifest.json` (12 modèles).
- LOD0: près du joueur; LOD1: affichage distant (seuils à régler dans le jeu).
- Préférer instancing pour éléments répétitifs et culling par zone/chunk.
- Les assets sont des ressources de bibliothèque; leur placement et règles de génération restent à implémenter.

Cette publication n'ajoute ni bosquets rejetés ni générateur de scène.
