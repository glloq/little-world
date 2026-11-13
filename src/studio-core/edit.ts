import type {CommandBus,EditPatch,EditTransaction} from './commands.ts';
import type {ProjectDocument} from './types.ts';
/** Copy only the touched sectors, run the edit on the draft, then record field-level patches
 * as ONE transaction (no complete world snapshot). Sources must already be hydrated. */
export function editDocument(bus:CommandBus,label:string,ids:string[],edit:(draft:ProjectDocument)=>void):EditTransaction|null{
  const p=bus.document,draft={...p,world:{...p.world},manifest:{...p.manifest},chunks:{...p.chunks},chunkIndex:{...p.chunkIndex},entityIndex:{...p.entityIndex},libraries:{...p.libraries}};
  for(const id of ids){if(p.chunks[id])draft.chunks[id]=structuredClone(p.chunks[id]);if(p.chunkIndex[id])draft.chunkIndex[id]=structuredClone(p.chunkIndex[id]);}
  edit(draft);const patches:EditPatch[]=[];
  const diff=(before:unknown,after:unknown,path:string[])=>{
    if(before===after)return;
    if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
      const a=before as Record<string,unknown>,b=after as Record<string,unknown>;
      for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],[...path,key]);
    }else if(JSON.stringify(before)!==JSON.stringify(after))patches.push(after===undefined?bus.removePatch(path):bus.patch(path,after));
  };
  for(const key of ['world','manifest','chunks','chunkIndex','entityIndex','libraries'] as const)diff(p[key],draft[key],[key]);
  return bus.execute(label,patches,ids);
}
