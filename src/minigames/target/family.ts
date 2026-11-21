/** Target family module (separate Vite chunk): its own rule table on the shared BallWorld
 * simulation and the shared ball view — the proof that a family adds rules, not engines. */
import type {MiniGameFamilyModule} from '../types.ts';
import {createBallSimulation} from '../ball/simulation.ts';
import {TARGET_VARIANTS} from './variants.ts';

const family:MiniGameFamilyModule={
  family:'target',
  createSimulation:(def,env)=>createBallSimulation(def,env,TARGET_VARIANTS),
  loadView:async()=>(await import('../ball/view.ts')).ballViewFactory,
};
export default family;
