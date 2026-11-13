# Ponton modulaire — assets originaux Little World

Kit low-poly v1 retenu pour les futures compositions de pontons. Il n'est pas encore connecté à la palette de placement du Studio.

## Source et chemins

- `public/models/structures/dock/{tile,post,bollard,ramp,ladder}/lod{0,1,2}.glb` : 15 fichiers binaires GLB originaux.
- `assets/structures/dock/manifest.json` : dimensions, métriques, empreintes SHA-256 et conventions.
- `src/structures/assemble-dock.mjs` : assemblage en Three.js 0.180 avec `InstancedMesh` et poteaux dédupliqués.
- `src/structures/example-usage.mjs` : utilisation du kit.

## Contrat

Grille de 2 m : un seul plancher universel de 2 × 2 m, dessus Y=1 m. Les poteaux sont des objets indépendants : deux cellules contiguës partagent deux poteaux, une plateforme de quatre cellules utilise neuf poteaux.

```js
import { assembleDock } from './structures/assemble-dock.mjs';
const dock = await assembleDock({
  cells: [[0,0],[1,0],[2,0],[2,1]],
  assetBaseUrl: `${import.meta.env.BASE_URL}models/structures/dock/`,
  lod: 0,
  bollards: [{tile:[0,0],offset:[0.4,0.4]}]
});
scene.add(dock);
```

Les bordures sont générées sur le périmètre uniquement. La rampe, l'échelle et la bitte d'amarrage sont facultatives. Palette via couleurs par sommet, zéro texture.

### Coûts par module (triangles LOD0 / LOD1 / LOD2)
| Module | LOD0 | LOD1 | LOD2 |
|---|---:|---:|---:|
| Plancher | 96 | 72 | 12 |
| Poteau | 36 | 24 | 12 |
| Bitte | 68 | 36 | 24 |
| Rampe | 96 | 72 | 12 |
| Échelle | 96 | 60 | 48 |

## Statut

GLB, empreintes, compteurs et déduplication des poteaux testés hors du jeu. Chargement dans Vite, sélection, collisions, sauvegarde V3, navigation et transitions LOD dynamiques sont à tester et à intégrer séparément.

Licence : `project-original` — modèles originaux créés pour Little World.
