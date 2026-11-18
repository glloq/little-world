import type {RaceDefinition,RaceGate} from '../gameplay/races.ts';
import {validateRace} from '../gameplay/races.ts';
import type {SurfDemoSite} from './surf-demo.ts';

/** Training course tied to deterministic surf-wave parameters; never a ranked online race. */
export function makeDemoSurfRace(site:SurfDemoSite,worldId:string):RaceDefinition {
 const z=site.zone,distances=[12,36,63,92],direction={x:z.dirX,y:0,z:z.dirZ};
 const gates:RaceGate[]=distances.map((d,i)=>({
   id:'surf-gate-'+(i+1),
   center:{x:site.start.x+z.dirX*d,y:z.seaLevel+.4,z:site.start.z+z.dirZ*d},
   normal:direction,shape:'rectangle',width:i===2?12:18,height:7,
   allowedModes:['surf','air']
 }));
 return validateRace({
  id:'race:surf-demo',name:'Surf — descente vers la plage',version:1,
  kind:'surf',classification:'practice',worldId,
  layoutKey:['surf-demo-v1',z.id,z.seed,z.amplitude,z.wavelength,z.speed].join(':'),
  maxTicks:30*150,startOnFirstGate:true,gates,
 });
}
