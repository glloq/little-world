/** Ball family module, loaded on demand by the registry (separate Vite chunk). The renderer
 * is a further chunk (`view.ts`), so a headless authority never imports Three.js. */
import type {MiniGameFamilyModule} from '../types.ts';
import {createBallSimulation} from './simulation.ts';
import {BALL_VARIANTS} from './variants.ts';

const family:MiniGameFamilyModule={
  family:'ball',
  createSimulation:(def,env)=>createBallSimulation(def,env,BALL_VARIANTS),
  loadView:async()=>(await import('./view.ts')).ballViewFactory,
};
export default family;
