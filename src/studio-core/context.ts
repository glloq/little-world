/** Shared, serializable authoring context. No mesh/runtime state belongs here. */
export interface StudioSelection {kind:string;id:string;}
export interface StudioCamera {x:number;y:number;z:number;mode:'map2d'|'orbit'|'free';}
export interface StudioContext {
  schemaVersion:1;
  projectId:string;
  worldId:string;
  selected:StudioSelection|null;
  selectedIds:StudioSelection[];
  camera:StudioCamera;
  activeChunkId:string|null;
  activeModule:string;
  activeTool:string;
}
export function defaultStudioContext(projectId:string,worldId:string):StudioContext {
  return {schemaVersion:1,projectId,worldId,selected:null,selectedIds:[],camera:{x:0,y:150,z:0,mode:'map2d'},activeChunkId:null,activeModule:'map',activeTool:'select'};
}
function text(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.length<=200;}
function selection(value:unknown):value is StudioSelection {
  return !!value&&typeof value==='object'&&text((value as StudioSelection).kind)&&text((value as StudioSelection).id);
}
export function parseStudioContext(value:unknown):StudioContext {
  if(!value||typeof value!=='object')throw Error('Contexte Studio absent');
  const context=value as StudioContext;
  if(context.schemaVersion!==1||!text(context.projectId)||!text(context.worldId)||!text(context.activeModule)||!text(context.activeTool)||
    (context.activeChunkId!==null&&!text(context.activeChunkId))||
    (context.selected!==null&&!selection(context.selected))||!Array.isArray(context.selectedIds)||context.selectedIds.length>1000||!context.selectedIds.every(selection)||
    !context.camera||!['map2d','orbit','free'].includes(context.camera.mode)||!['x','y','z'].every(key=>Number.isFinite(context.camera[key as 'x'|'y'|'z'])))throw Error('Contexte Studio incompatible ou invalide');
  return structuredClone(context);
}
export class SelectionService {
  private current:StudioContext;
  private listeners=new Set<(value:StudioContext)=>void>();
  constructor(context:StudioContext){this.current=parseStudioContext(context);}
  get state():Readonly<StudioContext>{return this.snapshot();}
  snapshot():StudioContext{return structuredClone(this.current);}
  restore(value:unknown):void {
    const parsed=parseStudioContext(value);
    if(parsed.projectId!==this.current.projectId||parsed.worldId!==this.current.worldId)throw Error('Contexte appartenant à un autre projet');
    this.current=parsed;this.emit();
  }
  select(value:StudioSelection|null,additional:StudioSelection[]=[]):void {
    const selectedIds=value?[value,...additional.filter(v=>v.id!==value.id)]:[];
    this.patch({selected:value,selectedIds});
  }
  openModule(activeModule:string):void{this.patch({activeModule});}
  setTool(activeTool:string):void{this.patch({activeTool});}
  setChunk(activeChunkId:string|null):void{this.patch({activeChunkId});}
  setCamera(camera:StudioCamera):void{this.patch({camera});}
  subscribe(listener:(value:StudioContext)=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private patch(patch:Partial<StudioContext>):void{this.current=parseStudioContext({...this.current,...patch});this.emit();}
  private emit():void{for(const listener of this.listeners)listener(this.snapshot());}
}
