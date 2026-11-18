/** Authored project terrain for race planning; never uses the mutable runtime terrain singleton.
 * Studio must hydrate all source chunks before creating this context. */
import {projectGeography} from './geo-context.ts';
import type {ProjectDocument} from './types.ts';
import {createRaceTrackSampler} from '../gameplay/race-track.ts';
import type {RaceTerrainEnvironment} from './race-terrain-planner.ts';
export function projectRaceTerrainEnvironment(project:ProjectDocument,exceptRaceId?:string):RaceTerrainEnvironment{
 const ctx=projectGeography(project).ctx;
 const others=Object.values(project.libraries.races??{}).filter(r=>r.id!==exceptRaceId);
 const roads=others.flatMap(r=>r.track?[createRaceTrackSampler(r.track,{height:ctx.height})]:[]);
 const gates=others.flatMap(r=>r.gates.map(g=>({x:g.center.x,z:g.center.z,width:g.width})));
 return {
  bounds:project.world.bounds,seaLevel:project.world.seaLevel,
  height:ctx.height,water:(x,z,h)=>ctx.water(x,z,h),
  occupation:(x,z)=>{
   if(roads.some(s=>s.sample(x,z)!==null))return 'course existante';
   if(gates.some(g=>Math.hypot(x-g.x,z-g.z)<g.width/2+3))return 'départ / arrivée existants';
   return ctx.occupancy(x,z);
  }
 };
}
