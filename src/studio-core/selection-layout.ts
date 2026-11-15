/** Alignment and equal spacing of selected author entities, preserving all other components. */
import type {ProjectDocument} from './types.ts';
import {entityTransform,type TransformUpdate} from './transforms.ts';
export type LayoutMode='align-x'|'align-z'|'distribute-x'|'distribute-z';
export function layoutUpdates(project:ProjectDocument,ids:string[],mode:LayoutMode):TransformUpdate[]{
  const unique=[...new Set(ids)];
  if(unique.length<2||unique.length>100)throw Error('Sélectionner 2 à 100 objets');
  const axis=mode.endsWith('x')?'x':'z',entries=unique.map(id=>({id,t:entityTransform(project,id)}));
  const values=entries.map(e=>e.t.position[axis]),mean=values.reduce((a,b)=>a+b,0)/values.length;
  const min=Math.min(...values),max=Math.max(...values),sorted=[...entries].sort((a,b)=>a.t.position[axis]-b.t.position[axis]||a.id.localeCompare(b.id));
  const targets=new Map<string,number>();
  if(mode.startsWith('align'))for(const entry of entries)targets.set(entry.id,mean);
  else for(let i=0;i<sorted.length;i++)targets.set(sorted[i].id,min+(max-min)*i/(sorted.length-1));
  return entries.map(({id,t})=>({id,transform:{...t,position:{...t.position,[axis]:targets.get(id)!}}}));
}
