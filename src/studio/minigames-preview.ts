/** Studio preview of mini-game instances: the SAME family simulation and view as the game,
 * created at rest on the project relief (no session, no stepping). Presentation only. */
import * as THREE from 'three';
import {MiniGameRegistry} from '../minigames/registry.ts';
import type {MiniGameInstanceV1} from '../minigames/schema.ts';
import type {MiniGameEnvironment,MiniGameSimulation,MiniGameView,MiniGameViewContext} from '../minigames/types.ts';
import {classifyPoint} from '../geography/classify.ts';
import {geoContext} from '../geography/engine.ts';

/** Same automatic theme as the game (biome at the field), full detail, no effects. */
const PREVIEW_CONTEXT:MiniGameViewContext={tier:()=>'high',ground:(x,z)=>{try{const g=classifyPoint(geoContext(),x,z);return {biome:g.biome,material:g.material};}catch{return null;}}};

const registry=new MiniGameRegistry();
export async function createMiniGamePreview(defs:readonly MiniGameInstanceV1[],env:MiniGameEnvironment){
  const group=new THREE.Group();group.name='MiniGamePreview';
  const parts:{sim:MiniGameSimulation;view:MiniGameView}[]=[];
  for(const def of defs){
    try{
      const module=await registry.load(def.family),sim=module.createSimulation(def,env),factory=await module.loadView();
      const view=factory.create(group,sim,env,PREVIEW_CONTEXT);view.setState?.('ready');parts.push({sim,view});
    }catch(e){console.warn('Aperçu de mini-jeu impossible',def.id,e);}
  }
  return {group,dispose(){for(const p of parts){p.view.dispose();p.sim.dispose();}parts.length=0;group.removeFromParent();}};
}
