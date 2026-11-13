import {CommandBus,type EditPatch} from '../studio-core/commands.ts';
import {SelectionService} from '../studio-core/context.ts';
import {ProjectStore,type StoredProject} from '../studio-core/project-store.ts';
import {parseChunk,parseWorldV3} from '../studio-core/schema.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
/** Shared session. Sources hydrate only on demand; history contains changed fields. */
export class StudioSession {
 readonly document:ProjectDocument;
 readonly selection:SelectionService;
 readonly commands:CommandBus;
 private revision:number;
 private dirty=new Set<string>();
 private pending=false;
 private timer:ReturnType<typeof setTimeout>|undefined;
 private saving:Promise<void>|null=null;
 private listeners=new Set<()=>void>();
 status='Sauvegardé localement';
 constructor(readonly store:ProjectStore,stored:StoredProject){
  this.document=stored.document;this.revision=stored.revision;this.selection=new SelectionService(stored.context);
  this.commands=new CommandBus(this.document,(p,ids)=>{parseWorldV3(p.world);for(const id of ids)if(p.chunks[id])parseChunk(p.chunks[id],p.world);});
  if(stored.journal)this.commands.restore(stored.journal);
  this.commands.subscribe(t=>{for(const id of t.affectedChunks)this.dirty.add(id);this.changed();});
  this.selection.subscribe(()=>this.changed());
 }
 static async open(store:ProjectStore,id:string){
  const stored=await store.loadProject(id),journal=stored.journal;
  const ids=new Set([...(journal?.undo??[]),...(journal?.redo??[])].flatMap(t=>t.affectedChunks));
  // A deleted sector can exist solely in history; its inverse patch restores it.
  Object.assign(stored.document.chunks,await store.loadChunks(id,[...ids].filter(k=>stored.document.chunkIndex[k]),stored.revision));
  return new StudioSession(store,stored);
 }
 subscribe(listener:()=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
 private emit(){for(const listener of this.listeners)listener();}
 private changed(){this.pending=true;this.status='Modifications à sauvegarder…';clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flush().catch(()=>{}),650);this.emit();}
 async hydrate(ids:string[]){
  while(this.saving)await this.saving;
  const needed=new Set<string>();const visit=(id:string)=>{if(needed.has(id)||!this.document.chunkIndex[id])return;needed.add(id);for(const dep of this.document.chunkIndex[id].dependencies)visit(dep);};ids.forEach(visit);
  const missing=[...needed].filter(id=>!this.document.chunks[id]);Object.assign(this.document.chunks,await this.store.loadChunks(this.document.manifest.projectId,missing,this.revision));
 }
 /** Copy touched sectors only, then derive field patches. No complete world snapshots. */
 async change(label:string,ids:string[],edit:(draft:ProjectDocument)=>void){
  await this.hydrate(ids);const p=this.document,draft={...p,world:{...p.world},manifest:{...p.manifest},chunks:{...p.chunks},chunkIndex:{...p.chunkIndex},entityIndex:{...p.entityIndex},libraries:{...p.libraries}};
  for(const id of ids){if(p.chunks[id])draft.chunks[id]=structuredClone(p.chunks[id]);if(p.chunkIndex[id])draft.chunkIndex[id]=structuredClone(p.chunkIndex[id]);}
  edit(draft);const patches:EditPatch[]=[];
  const diff=(before:unknown,after:unknown,path:string[])=>{
   if(before===after)return;
   if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after)){
    const a=before as Record<string,unknown>,b=after as Record<string,unknown>;
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[key],b[key],[...path,key]);
   }else if(JSON.stringify(before)!==JSON.stringify(after))patches.push(after===undefined?this.commands.removePatch(path):this.commands.patch(path,after));
  };
  for(const key of ['world','manifest','chunks','chunkIndex','entityIndex','libraries'] as const)diff(p[key],draft[key],[key]);
  this.commands.execute(label,patches,ids);
 }
 async flush():Promise<void>{
  clearTimeout(this.timer);if(this.saving){await this.saving;if(this.pending)return this.flush();return;}
  if(!this.pending)return;
  const dirty=[...this.dirty];this.dirty.clear();this.pending=false;this.status='Sauvegarde…';this.emit();
  this.saving=(async()=>{try{
   this.revision=await this.store.saveChanges(this.document,dirty,{expectedRevision:this.revision,context:this.selection.snapshot(),journal:this.commands.serialize(),checkpoint:this.commands.needsCheckpoint});
   this.status=this.pending?'Modifications à sauvegarder…':'Sauvegardé localement';
  }catch(error){dirty.forEach(id=>this.dirty.add(id));this.pending=true;this.status=String(error);throw error;}finally{this.saving=null;this.emit();}})();
  await this.saving;if(this.pending)await this.flush();
 }
 async fullDocument(){await this.hydrate(Object.keys(this.document.chunkIndex));return this.document;}
}
