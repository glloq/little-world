/** Read-only index of actual native settlement capabilities.
 * No NPC, road, job or production asset is fabricated by this module.
 */
import type {ActivityZoneV3,ProjectDocument} from '../studio-core/types.ts';
import type {AmenityRecord,BuildingRecord,SettlementRecipe} from '../settlements/schema.ts';
import type {ResidentRole,ResidentPoint} from './schedule.ts';

export interface LifeHome {id:string;slot:number;point:ResidentPoint}
export interface LifeJob {id:string;role:ResidentRole;point:ResidentPoint;sourceId:string;kind:'amenity'|'farm'|'mine'}
export interface LocalLifeCapabilityIndex {
  homes:LifeHome[];
  play:LifeJob[];
  jobs:LifeJob[];
  warnings:string[];
}
const distance=(a:ResidentPoint,b:ResidentPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
const centroid=(polygon:readonly ResidentPoint[]):ResidentPoint=>polygon.reduce((out,p)=>({x:out.x+p.x/polygon.length,z:out.z+p.z/polygon.length}),{x:0,z:0});
/** Do not read project/author metadata as generation instructions. Everything is data. */
export function localLifeCapabilities(
  recipe:SettlementRecipe,buildings:readonly BuildingRecord[],
  amenities:readonly AmenityRecord[],zones:readonly ActivityZoneV3[],
  project?:Pick<ProjectDocument,'libraries'>,
):LocalLifeCapabilityIndex{
  const warnings:string[]=[],jobs:LifeJob[]=[],play:LifeJob[]=[];
  const homes=[...buildings].filter(b=>Number.isFinite(b.entry.x)&&Number.isFinite(b.entry.z))
    .sort((a,b)=>a.slot-b.slot||a.id.localeCompare(b.id)).map(b=>({id:b.id,slot:b.slot,point:{...b.entry}}));
  const usable=amenities.filter(a=>Number.isFinite(a.entry.x)&&Number.isFinite(a.entry.z));
  const at=(role:string)=>usable.filter(a=>a.role===role).sort((a,b)=>a.id.localeCompare(b.id));
  const add=(role:ResidentRole,id:string,p:ResidentPoint,kind:LifeJob['kind'])=>{
    if(!jobs.some(j=>j.id===id))jobs.push({id,role,point:{...p},sourceId:id,kind});
  };
  const amenity=(role:ResidentRole,source:string)=>{
    for(const a of at(source))add(role,a.id,a.entry,'amenity');
  };
  // All sources have to exist in the generated plan. A fishing-themed market
  // is not a fishing platform, and a mining counter is not a mine entrance.
  for(const a of [...at('well'),...at('bench')])play.push({id:a.id,role:'child',point:{...a.entry},sourceId:a.id,kind:'amenity'});
  for(const field of zones.filter(z=>z.kind==='farm-plot'&&z.farm?.assignment==='npc'&&z.polygon.length>=3).sort((a,b)=>a.id.localeCompare(b.id)))
    add('farmer',field.id,centroid(field.polygon),'farm');
  if(recipe.activity==='fishing'||recipe.waterfront||recipe.maritimePort){
    for(const a of [...at('harbor'),...at('shore-hut')])add('fisher',a.id,a.entry,'amenity');
  }
  if(recipe.activity==='forest'){
    amenity('woodcutter','fire');
    amenity('gatherer','fire'); // distinct worker only if the source is free
  }
  if(recipe.activity==='agriculture')amenity('miller','mill');
  if(recipe.maritimePort)for(const a of at('harbor'))add('dockworker',a.id,a.entry,'amenity');
  if(recipe.activity==='mine')for(const a of at('workshop'))add('blacksmith',a.id,a.entry,'amenity');
  for(const a of at('counter'))add('merchant',a.id,a.entry,'amenity');
  for(const a of at('bench'))add('musician',a.id,a.entry,'amenity');
  for(const a of at('inn'))add('innkeeper',a.id,a.entry,'amenity');
  for(const a of at('workshop'))add('artisan',a.id,a.entry,'amenity');
  if(recipe.activity==='mine'){
    const mines=Object.values(project?.libraries.zones??{})
      .filter(z=>z.kind==='mine'&&z.polygon.length>=3)
      .map(z=>({...z,point:centroid(z.polygon)}))
      .filter(z=>distance(z.point,recipe.center)<Math.max(220,recipe.radius*2))
      .sort((a,b)=>a.id.localeCompare(b.id));
    for(const mine of mines)add('miner',mine.id,mine.point,'mine');
  }
  if(!homes.length)warnings.push('LIFE_NO_HOMES');
  if(!jobs.length)warnings.push('LIFE_NO_JOBS');
  if(!play.length)warnings.push('LIFE_NO_PLAY_ANCHOR');
  return {homes,jobs,play,warnings};
}
