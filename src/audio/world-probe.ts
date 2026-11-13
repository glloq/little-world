/** Cheap, cached audio facts about the ground under the player (surface, place, biome).
 * Sampled at most every 250 ms / 2 m: the router never queries the terrain every frame. */
import {sampleBiome,type BiomeId} from '../biomes.ts';
import {pathDistance,terrainHeight,waterSurface} from '../terrain.ts';
import type {Place,Surface} from './context.ts';
const PLACE:Record<BiomeId,Place>={forest:'forest',meadow:'plain',mountain:'mountain',river:'river',lake:'lake',coast:'coast',village:'village'};
const SURFACE:Record<BiomeId,Surface>={forest:'grass',meadow:'grass',mountain:'stone',river:'grass',lake:'grass',coast:'sand',village:'dirt'};
export interface GroundAudio {biome?:BiomeId;place?:Place;surface?:Surface;}
export function createGroundProbe(){
 let last:{x:number;z:number;t:number;value:GroundAudio}|null=null;
 return (x:number,z:number,now:number):GroundAudio=>{
  if(last&&now-last.t<250&&Math.hypot(x-last.x,z-last.z)<2)return last.value;
  let value:GroundAudio={};
  try{const biome=sampleBiome(x,z),ground=terrainHeight(x,z),water=waterSurface(x,z),shallow=water!==null&&water>ground+.02;
   value={biome,place:PLACE[biome],surface:shallow?'water':pathDistance(x,z,2)<1.4?'dirt':SURFACE[biome]};}catch{/* Unknown ground: generic takes. */}
  last={x,z,t:now,value};return value;
 };
}
