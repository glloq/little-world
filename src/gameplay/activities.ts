/** Activities of a playable world: mines and farm plots resolved from the authoring zones
 * (explicit settings, or defaults derived from the relief when the author set none), plus the
 * system items their rewards use. Runtime-only projection, validated like the rest. */
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {ItemDefinition} from './schema.ts';
import {defaultMineSettings,validateMineSettings,MINE_ITEMS,type MineZone} from '../mine/mine-data.ts';
import {defaultFarmSettings,validateFarmSettings,FARM_ITEMS,type FarmZone} from '../farm/farm-data.ts';

export interface PlayableActivities {mines:MineZone[];farms:FarmZone[]}
const centre=(z:ActivityZoneV3)=>({x:z.polygon.reduce((s,p)=>s+p.x,0)/z.polygon.length,z:z.polygon.reduce((s,p)=>s+p.z,0)/z.polygon.length});
export function activitiesFromZones(zones:ActivityZoneV3[],ground:(x:number,z:number)=>number):PlayableActivities{
  const mines:MineZone[]=[],farms:FarmZone[]=[];
  for(const z of [...zones].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
    const polygon=z.polygon.map(p=>({x:p.x,z:p.z}));
    if(z.kind==='mine'){const c=centre(z);mines.push({id:z.id,name:z.name,polygon,mine:z.mine?structuredClone(z.mine):defaultMineSettings(polygon,z.levels??2,ground(c.x,c.z),hashId(z.id))});}
    else farms.push({id:z.id,name:z.name,polygon,farm:z.farm?structuredClone(z.farm):defaultFarmSettings(polygon)});
  }
  return {mines,farms};
}
export function parseActivities(value:unknown):PlayableActivities{
  const v=value as PlayableActivities;if(!v||typeof v!=='object'||!Array.isArray(v.mines)||!Array.isArray(v.farms)||v.mines.length>32||v.farms.length>256)throw Error('Activités invalides');
  const ids=new Set<string>(),poly=(p:unknown)=>Array.isArray(p)&&p.length>=3&&p.length<=64&&p.every(q=>q&&Number.isFinite(q.x)&&Number.isFinite(q.z));
  for(const m of v.mines){if(typeof m.id!=='string'||ids.has(m.id)||!poly(m.polygon))throw Error('Mine invalide');ids.add(m.id);validateMineSettings(m.mine,m.polygon,m.mine?.levels?.length??0);}
  for(const f of v.farms){if(typeof f.id!=='string'||ids.has(f.id)||!poly(f.polygon))throw Error('Parcelle invalide');ids.add(f.id);validateFarmSettings(f.farm);}
  return structuredClone(v);
}
/** Items granted by activities, added to the registry when the project does not define them. */
export function activityItems(a:PlayableActivities,existing:ItemDefinition[]):ItemDefinition[]{
  const have=new Set(existing.map(i=>i.id)),out=[...existing];
  for(const item of [...(a.mines.length?MINE_ITEMS:[]),...(a.farms.length?FARM_ITEMS:[])])if(!have.has(item.id))out.push({...item});
  return out;
}
function hashId(id:string){let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return (h>>>0)%2147483647;}
