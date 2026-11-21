/** Ball family module, loaded on demand by the registry (separate Vite chunk). The renderer
 * is a further chunk (`view.ts`), so a headless authority never imports Three.js. */
import type {MiniGameFamilyModule} from '../types.ts';
import {createBallSimulation} from './simulation.ts';

const family:MiniGameFamilyModule={
  family:'ball',
  createSimulation:createBallSimulation,
  loadView:async()=>(await import('./view.ts')).ballViewFactory,
};
export default family;
