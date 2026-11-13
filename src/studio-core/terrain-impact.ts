/** E9 — coherence of authored elements after a relief change. A transaction's changed areas
 * (terrain retouches added/moved/removed, generator shapes) are intersected with paths,
 * rivers, zones and entities; each touched element is checked against the new relief so
 * nothing becomes silently inconsistent (path too steep, river flowing uphill, building on a
 * slope, object under water). Pure: works from the project document (2D map geography). */
import type {ProjectDocument} from './types.ts';
import type {EditTransaction} from './commands.ts';
import type {TerrainStroke,PathDefinition,WaterBody} from '../world-data.ts';
import {terrainChangeRects,type Rect} from './geo-edits.ts';
import {pathDiagnostics,centerline} from '../paths/path-geometry.ts';
import {compileWaterBody} from '../water/profile.ts';
import type {ElementRef} from './elements.ts';

export interface ImpactItem {ref:ElementRef;severity:'ERROR'|'WARNING';message:string;x:number;z:number}
export interface TerrainImpact {areas:Rect[];touched:number;items:ImpactItem[]}
export interface ImpactEnv {height(x:number,z:number):number;water?(x:number,z:number):number|null}

/** Areas whose relief changed in a transaction (retouches compared by id, generator shapes). */
export function transactionTerrainAreas(t:EditTransaction):Rect[]{
  const out:Rect[]=[...terrainChangeRects(t.patches).rects];
  if(terrainChangeRects(t.patches).global)out.push({minX:-Infinity,maxX:Infinity,minZ:-Infinity,maxZ:Infinity});
  for(const patch of t.patches){
    if(patch.path[0]!=='chunks'||patch.path[2]!=='terrainEdits'&&!(patch.path.length===2))continue;
    const pick=(v:unknown)=>{const value=v as {terrainEdits?:TerrainStroke[]}|TerrainStroke[]|undefined;return (Array.isArray(value)?value:value?.terrainEdits)??[];};
    const before=pick(patch.before.value),after=pick(patch.after.value),key=(e:TerrainStroke)=>JSON.stringify(e),old=new Map(before.map(e=>[e.id,key(e)])),now=new Map(after.map(e=>[e.id,key(e)]));
    for(const e of [...before,...after])if(old.get(e.id)!==now.get(e.id))out.push({minX:e.x-e.radius,maxX:e.x+e.radius,minZ:e.z-e.radius,maxZ:e.z+e.radius});
  }
  return out;
}
const hits=(areas:Rect[],x:number,z:number,pad=0)=>areas.some(a=>x>=a.minX-pad&&x<=a.maxX+pad&&z>=a.minZ-pad&&z<=a.maxZ+pad);
export function terrainImpacts(p:ProjectDocument,areas:Rect[],env:ImpactEnv):TerrainImpact{
  const items:ImpactItem[]=[];let touched=0;if(!areas.length)return {areas,touched,items};
  const paths=Object.values(p.libraries.paths),touchedPaths=paths.filter(path=>centerline(path).some(s=>hits(areas,s.x,s.z,path.width)));
  if(touchedPaths.length){touched+=touchedPaths.length;const ids=new Set(touchedPaths.map(v=>v.id));
    for(const d of pathDiagnostics(paths,env))if(ids.has(d.pathId)&&d.code!=='PATH_DUPLICATE')items.push({ref:{kind:'path',id:d.pathId},severity:d.severity,message:d.message,x:d.x,z:d.z});}
  for(const water of Object.values(p.libraries.water) as WaterBody[]){
    if(!water.points.some(q=>hits(areas,q.x,q.z,water.width+40)))continue;touched++;
    for(const d of compileWaterBody(water,env.height).diagnostics)items.push({ref:{kind:'water',id:water.id},severity:d.severity==='ERROR'?'ERROR':'WARNING',message:'Rivière : '+d.message,x:water.points[0].x,z:water.points[0].z});
  }
  for(const zone of Object.values(p.libraries.zones??{})){
    if(!zone.polygon.some(q=>hits(areas,q.x,q.z,20)))continue;touched++;
    const hs=zone.polygon.map(q=>env.height(q.x,q.z)),span=Math.max(...hs)-Math.min(...hs),size=Math.max(...zone.polygon.map(q=>q.x))-Math.min(...zone.polygon.map(q=>q.x))+1;
    if(zone.kind==='farm-plot'&&span/size>.25)items.push({ref:{kind:'zone',id:zone.id},severity:'WARNING',message:`Parcelle « ${zone.name} » en pente (${Math.round(span/size*100)} %)`,x:zone.polygon[0].x,z:zone.polygon[0].z});
  }
  for(const e of Object.values(p.entityIndex)){
    const {x,z}=e.position;if(!hits(areas,x,z,6))continue;touched++;
    const h=env.height(x,z),slope=Math.max(Math.abs(env.height(x+3,z)-env.height(x-3,z)),Math.abs(env.height(x,z+3)-env.height(x,z-3)))/6,w=env.water?.(x,z);
    if(w!=null&&w>h+.3&&e.kind!=='character')items.push({ref:{kind:'entity',id:e.id},severity:'WARNING',message:`« ${e.name} » se retrouve sous l’eau (${(w-h).toFixed(1)} m)`,x,z});
    else if(e.kind==='building'&&slope>.35)items.push({ref:{kind:'entity',id:e.id},severity:'WARNING',message:`Bâtiment « ${e.name} » sur une pente de ${Math.round(slope*100)} %`,x,z});
  }
  return {areas,touched,items};
}
export type {PathDefinition};
