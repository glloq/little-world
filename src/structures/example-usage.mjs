// Example in the Little World Vite app (adapt import path to your actual src tree).
import { assembleDock } from './assemble-dock.mjs';

const ponton = await assembleDock({
  // 2m grid: shared corners automatically produce only 1 post per intersection.
  cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, -1]],
  assetBaseUrl: `${import.meta.env.BASE_URL}models/structures/dock/`,
  lod: 0,
  bollards: [{ tile: [0, 0], offset: [-0.5, 0.5] },
             { tile: [2, 1], offset: [0.4, 0.4] }],
  ramps: [{ tile: [0, 0], side: 'west' }],
  ladders: [{ tile: [2, 1], side: 'south' }]
});
// scene.add(ponton);
// console.log(ponton.userData.dockMetrics);
