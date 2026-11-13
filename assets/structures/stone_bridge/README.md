# Pont en pierre — Little World V2

Asset low-poly validé par le créateur, optimisé à partir du pont V1.

- GLB : `public/models/structures/stone_bridge/lod0.glb`, `lod1.glb`, `lod2.glb`.
- 564 / 362 / 186 triangles, zéro texture, couleurs par sommets, repère Y vertical en mètres.
- Arche réellement ouverte, tablier légèrement bombé, parapets bas.
- Empreintes SHA-256 et métadonnées : `manifest.json`.
- Générateur source versionné : `tools/asset-sources/stone_bridge/generate_stone_bridge.py` (dépendances de développement : numpy, trimesh).
- Régénération : `python tools/asset-sources/stone_bridge/generate_stone_bridge.py`; écrit les 3 GLB et `manifest.generated.json` à côté du générateur, sans écraser le manifeste approuvé.
- Régénération contrôlée localement : SHA-256 des trois GLB identiques aux modèles validés.

**État : artistique validé, intégration moteur et collisions/non-régression à qualifier.** Aucun changement du catalogue de placement ou des scènes existantes.
