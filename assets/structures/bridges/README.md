# Little World — Ponts en bois V1 (validés)

Deux ponts 3D originaux, sans textures externes, en GLB glTF 2.0 avec couleurs par sommet. Unités : mètres ; axe vertical : Y.

| Modèle | LOD0 | LOD1 | LOD2 | Portée / largeur |
|---|---:|---:|---:|---|
| Pont en bois arqué | 652 | 412 | 208 | 5,6 m / 2,45 m |
| Pont en rondins | 296 | 240 | 132 | 4,3 m / 2,25 m |

Emplacements :

- public/models/structures/bridges/wooden_arch_bridge/lod0.glb à lod2.glb
- public/models/structures/bridges/log_bridge/lod0.glb à lod2.glb
- assets/structures/bridges/manifest.json (empreintes SHA-256 et points d'ancrage de rive)
- tools/assets/generate-wooden-bridges.py (source reproductible, numpy 2.3.5 + trimesh 4.11.1)

Générer les fichiers avec : python tools/assets/generate-wooden-bridges.py

Les objets sont approuvés artistiquement ; tests runtime de collision, navigation, LOD dynamique et raccordement terrain encore à réaliser. Ne pas les déclarer automatiquement disponibles au placement Studio avant qualification.

Les six GLB peuvent être reconstruits sur la branche via GitHub Actions, avec contrôle de leurs empreintes SHA-256 d'origine.
