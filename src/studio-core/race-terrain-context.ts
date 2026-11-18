/** Authored project terrain for race planning; never uses the mutable runtime terrain singleton.
 * Studio must hydrate all source chunks before creating this context. */
import {projectGeography} from './geo-context.ts';
import type {ProjectDocument} from './types.ts';
import {createRaceTrackSampler} from '../gameplay/race-track.ts';
import {collisionDefinitionsFromProject} from './collision-adapter.ts';
import type {RaceTerrainEnvironment} from './race-terrain-planner.ts';
export function projectRaceTerrainEnvironment(project:ProjectDocument,exceptRaceId?:string):RaceTerrainEnvironment{
 const ctx=projectGeography(project).ctx;
 const others=Object.values(project.libraries.races??{}).filter(r=>r.id!==exceptRaceId);
 const roads=others.flatMap(r=>r.track?[createRaceTrackSampler(r.track,{height:ctx.height})]:[]);
 const gates=others.flatMap(r=>r.gates.map(g=>({x:g.center.x,z:g.center.z,width:g.width})));
 // Existing static colliders, including natural arches and habitat walls, have a proper
 // physical footprint even when their visual asset has no vegetation exclusion radius.
 const colliders=collisionDefinitionsFromProject(project).map(d=>({
   minX:d.position.x-d.size.x/2-2,maxX:d.position.x+d.size.x/2+2,
   minZ:d.position.z-d.size.z/2-2,maxZ:d.position.z+d.size.z/2+2
 }));
 const cells=new Map<string,number[]>(),large:number[]=[],cell=32;
 for(let i=0;i<colliders.length;i++){
   const b=colliders[i],minX=Math.floor(b.minX/cell),maxX=Math.floor(b.maxX/cell),
     minZ=Math.floor(b.minZ/cell),maxZ=Math.floor(b.maxZ/cell);
   if((maxX-minX+1)*(maxZ-minZ+1)>512){large.push(i);continue;}
   for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++){
     const key=x+':'+z,list=cells.get(key)??[];list.push(i);cells.set(key,list);
   }
 }
 const occupiedByCollider=(x:number,z:number)=>{
   const inside=(i:number)=>{const b=colliders[i];return x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;};
   for(const i of large)if(inside(i))return true;
   for(const i of cells.get(Math.floor(x/cell)+':'+Math.floor(z/cell))??[])if(inside(i))return true;
   return false;
 };
 return {
  bounds:project.world.bounds,seaLevel:project.world.seaLevel,
  height:ctx.height,water:(x,z,h)=>ctx.water(x,z,h),
  occupation:(x,z)=>{
   if(roads.some(s=>s.sample(x,z)!==null))return 'course existante';
   if(gates.some(g=>Math.hypot(x-g.x,z-g.z)<g.width/2+3))return 'départ / arrivée existants';
   if(occupiedByCollider(x,z))return 'collision solide existante';
   return ctx.occupancy(x,z);
  }
 };
}
