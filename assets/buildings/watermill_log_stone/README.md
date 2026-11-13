# Moulin à eau — V5 / Little World

GLB avec couleurs par sommet (pas de textures externes) :

- `lod0.glb` : modèle V5 validé, géométrie inchangée.
- `lod1.glb` : décor réduit (rondins, fenêtres, arche, roue).
- `lod2.glb` : silhouette distante, porte et arche conservées.

`WheelPivot` : rotation animable autour de l'axe local X, à vitesse modérée.
Le pied en pierre est plein à l'arrière. La porte se trouve sur le pignon en rondins opposé à la roue.
Pas d'escalier.

Générateur : `tools/assets/generate-watermill.py` (dépendances `trimesh`, `numpy`).
