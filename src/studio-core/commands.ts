import type { ProjectDocument } from './types.ts';

export interface PatchValue {exists:boolean;value?:unknown;}
export interface EditPatch {path:string[];before:PatchValue;after:PatchValue;}
export interface EditTransaction {schemaVersion:1;id:string;projectId:string;label:string;committedAt:number;patches:EditPatch[];affectedChunks:string[];}
export interface CommandJournal {schemaVersion:1;projectId:string;worldId:string;sequence:number;undo:EditTransaction[];redo:EditTransaction[];}
export type TransactionValidator=(document:ProjectDocument,affectedChunks:readonly string[])=>void;
export interface CommandBusOptions {maxHistoryBytes?:number;maxTransactions?:number;checkpointInterval?:number;}
const roots=new Set(['manifest','world','chunkIndex','entityIndex','libraries','assets','chunks']);
const unsafe=new Set(['__proto__','prototype','constructor']);
const has=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
export class CommandConflictError extends Error {}
export class JournalRecoveryError extends Error {}
function same(a:unknown,b:unknown):boolean {
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const ak=Object.keys(a),bk=Object.keys(b);if(ak.length!==bk.length)return false;
  return ak.every(key=>has(b,key)&&same((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));
}
function json(value:unknown,depth=0):boolean {
  if(depth>48)return false;
  if(value===null||typeof value==='boolean'||typeof value==='string')return true;
  if(typeof value==='number')return Number.isFinite(value);
  if(typeof value!=='object'||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))return false;
  return Object.keys(value).every(key=>!unsafe.has(key)&&json((value as Record<string,unknown>)[key],depth+1));
}
function checkPath(path:unknown):asserts path is string[] {
  if(!Array.isArray(path)||path.length<2||path.length>32||!roots.has(path[0])||path.some(p=>typeof p!=='string'||!p.length||p.length>200||unsafe.has(p)))throw Error('Chemin de commande non autorisé');
}
function read(document:ProjectDocument,path:string[]):PatchValue {
  let current:unknown=document;
  for(const key of path){
    if(!current||typeof current!=='object'||!has(current,key))return {exists:false};
    current=(current as Record<string,unknown>)[key];
  }
  return {exists:true,value:current};
}
function equalSlot(a:PatchValue,b:PatchValue):boolean{return a.exists===b.exists&&(!a.exists||same(a.value,b.value));}
function validSlot(value:unknown):value is PatchValue {
  return !!value&&typeof value==='object'&&typeof (value as PatchValue).exists==='boolean'&&(!(value as PatchValue).exists||json((value as PatchValue).value));
}
function validatePatch(patch:EditPatch):void {
  checkPath(patch.path);
  if(!validSlot(patch.before)||!validSlot(patch.after))throw Error('Valeur de commande invalide');
}
/** Copy only ancestors of the changed field. Unrelated chunks/entities remain shared. */
function write(document:ProjectDocument,path:string[],slot:PatchValue):ProjectDocument {
  const result={...document};let source:unknown=document;let target:unknown=result;
  for(let i=0;i<path.length-1;i++){
    const key=path[i];
    const next=(source as Record<string,unknown>)[key];
    if(!next||typeof next!=='object')throw new CommandConflictError('Parent absent : '+path.slice(0,i+1).join('/'));
    const copied=Array.isArray(next)?next.slice():{...next};
    (target as Record<string,unknown>)[key]=copied;source=next;target=copied;
  }
  const leaf=path[path.length-1];
  if(Array.isArray(target)&&(!/^\d+$/.test(leaf)||Number(leaf)>target.length||!slot.exists))throw Error('Modifier une liste par valeur ou par indice existant');
  if(slot.exists)(target as Record<string,unknown>)[leaf]=structuredClone(slot.value);
  else delete (target as Record<string,unknown>)[leaf];
  return result;
}
function stage(document:ProjectDocument,patches:EditPatch[],inverse=false):ProjectDocument {
  let result=document;
  for(const patch of inverse?[...patches].reverse():patches){
    validatePatch(patch);
    // Editing an unloaded source is an explicit error, never an implicit empty chunk.
    if(patch.path[0]==='chunks'&&patch.path.length>2&&!has(result.chunks,patch.path[1]))throw new CommandConflictError('Secteur non chargé : '+patch.path[1]);
    const expected=inverse?patch.after:patch.before,next=inverse?patch.before:patch.after;
    if(!equalSlot(read(result,patch.path),expected))throw new CommandConflictError('État modifié depuis la commande : '+patch.path.join('/'));
    result=write(result,patch.path,next);
  }
  return result;
}
function size(value:unknown):number{return new TextEncoder().encode(JSON.stringify(value)).byteLength;}
function transactionValid(value:unknown,projectId:string):value is EditTransaction {
  if(!value||typeof value!=='object')return false;
  const t=value as EditTransaction;
  if(t.schemaVersion!==1||t.projectId!==projectId||typeof t.id!=='string'||typeof t.label!=='string'||t.label.length>300||!Number.isFinite(t.committedAt)||!Array.isArray(t.patches)||t.patches.length>20000||!Array.isArray(t.affectedChunks)||!t.affectedChunks.every(id=>typeof id==='string'))return false;
  try{t.patches.forEach(validatePatch);return true;}catch{return false;}
}
export class CommandBus {
  readonly document:ProjectDocument;
  private validator:TransactionValidator;
  private options:Required<CommandBusOptions>;
  private past:EditTransaction[]=[];
  private future:EditTransaction[]=[];
  private gesture:{label:string;patches:EditPatch[];affectedChunks:Set<string>}|null=null;
  private listeners=new Set<(transaction:EditTransaction,operation:'execute'|'undo'|'redo'|'cancel')=>void>();
  private sequence=0;
  constructor(document:ProjectDocument,validator:TransactionValidator=()=>{},options:CommandBusOptions={}){
    this.document=document;this.validator=validator;
    this.options={maxHistoryBytes:options.maxHistoryBytes??4*1024*1024,maxTransactions:options.maxTransactions??150,checkpointInterval:options.checkpointInterval??20};
  }
  get canUndo(){return !this.gesture&&this.past.length>0;}
  get canRedo(){return !this.gesture&&this.future.length>0;}
  get isGesturing(){return this.gesture!==null;}
  get historyBytes(){return size(this.past)+size(this.future);}
  get needsCheckpoint(){return this.sequence>0&&this.sequence%this.options.checkpointInterval===0;}
  get undoLabel(){return this.past.at(-1)?.label??null;}
  get redoLabel(){return this.future.at(-1)?.label??null;}
  patch(path:string[],value:unknown):EditPatch {
    checkPath(path);if(!json(value))throw Error('Seules les valeurs JSON finies sont autorisées');
    return {path:[...path],before:structuredClone(read(this.document,path)),after:{exists:true,value:structuredClone(value)}};
  }
  removePatch(path:string[]):EditPatch{checkPath(path);return {path:[...path],before:structuredClone(read(this.document,path)),after:{exists:false}};}
  set(label:string,path:string[],value:unknown,chunks:string[]=[]):EditTransaction|null{return this.execute(label,[this.patch(path,value)],chunks);}
  execute(label:string,patches:EditPatch[],affectedChunks:string[]=[]):EditTransaction|null {
    if(this.gesture)throw Error('Terminer ou annuler le geste en cours');
    patches.forEach(validatePatch);
    const useful=patches.filter(p=>!equalSlot(p.before,p.after));if(!useful.length)return null;
    const transaction=this.make(label,useful,affectedChunks);
    if(size(transaction)+4>this.options.maxHistoryBytes)throw Error('Transaction trop volumineuse pour l’historique ; divisez l’opération');
    this.apply(transaction,false);this.remember(transaction);this.notify(transaction,'execute');return transaction;
  }
  begin(label:string):void{if(this.gesture)throw Error('Un geste est déjà actif');this.gesture={label,patches:[],affectedChunks:new Set()};}
  update(path:string[],value:unknown,affectedChunks:string[]=[]):void {
    if(!this.gesture)throw Error('Aucun geste actif');
    const patch=this.patch(path,value);if(equalSlot(patch.before,patch.after))return;
    const staged=stage(this.document,[patch]);this.validator(staged,affectedChunks);Object.assign(this.document,staged);
    this.gesture.patches.push(patch);affectedChunks.forEach(id=>this.gesture!.affectedChunks.add(id));
  }
  commit():EditTransaction|null {
    if(!this.gesture)throw Error('Aucun geste actif');
    const gesture=this.gesture;this.gesture=null;
    if(!gesture.patches.length)return null;
    // Consecutive writes to one field are compacted; overlapping parent/child writes retain causal order.
    const patches:EditPatch[]=[];
    for(const patch of gesture.patches){const last=patches.at(-1);if(last&&same(last.path,patch.path))last.after=patch.after;else patches.push(structuredClone(patch));}
    const transaction=this.make(gesture.label,patches,[...gesture.affectedChunks]);
    if(size(transaction)+4>this.options.maxHistoryBytes){this.apply(transaction,true);throw Error('Geste trop volumineux ; opération annulée, utilisez plusieurs traits');}
    this.remember(transaction);this.notify(transaction,'execute');return transaction;
  }
  cancel():void {
    if(!this.gesture)return;const gesture=this.gesture;
    const transaction=this.make(gesture.label,gesture.patches,[...gesture.affectedChunks]);this.apply(transaction,true);this.gesture=null;this.notify(transaction,'cancel');
  }
  undo():boolean{if(!this.canUndo)return false;const transaction=this.past[this.past.length-1];this.apply(transaction,true);this.past.pop();this.future.push(transaction);this.sequence++;this.notify(transaction,'undo');return true;}
  redo():boolean{if(!this.canRedo)return false;const transaction=this.future[this.future.length-1];this.apply(transaction,false);this.future.pop();this.past.push(transaction);this.sequence++;this.notify(transaction,'redo');return true;}
  serialize():CommandJournal {
    if(this.gesture)throw Error('Ne pas enregistrer une transaction incomplète');
    return structuredClone({schemaVersion:1,projectId:this.document.manifest.projectId,worldId:this.document.manifest.worldId,sequence:this.sequence,undo:this.past,redo:this.future});
  }
  restore(value:unknown):void {
    if(this.gesture)throw Error('Un geste est actif');
    const j=value as CommandJournal;
    if(!j||j.schemaVersion!==1||j.projectId!==this.document.manifest.projectId||j.worldId!==this.document.manifest.worldId||!Number.isSafeInteger(j.sequence)||j.sequence<0||!Array.isArray(j.undo)||!Array.isArray(j.redo)||j.undo.length>10000||j.redo.length>10000||size(j)>16*1024*1024||!j.undo.every(t=>transactionValid(t,j.projectId))||!j.redo.every(t=>transactionValid(t,j.projectId)))throw new JournalRecoveryError('Journal incompatible ; restaurer un checkpoint compatible');
    try{
      let check=this.document;for(const t of [...j.undo].reverse())check=stage(check,t.patches,true);
      check=this.document;for(const t of [...j.redo].reverse())check=stage(check,t.patches,false);
    }catch(error){throw new JournalRecoveryError('Journal ne correspondant pas au projet : '+String(error));}
    this.past=structuredClone(j.undo);this.future=structuredClone(j.redo);this.sequence=j.sequence;this.trim();
  }
  subscribe(listener:(transaction:EditTransaction,operation:'execute'|'undo'|'redo'|'cancel')=>void):()=>void{this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  private make(label:string,patches:EditPatch[],affectedChunks:string[]):EditTransaction {
    if(typeof label!=='string'||!label.length||label.length>300)throw Error('Libellé de commande invalide');
    const chunks=new Set(affectedChunks);for(const p of patches)if(p.path[0]==='chunks')chunks.add(p.path[1]);
    return {schemaVersion:1,id:crypto.randomUUID(),projectId:this.document.manifest.projectId,label,committedAt:Date.now(),patches:structuredClone(patches),affectedChunks:[...chunks]};
  }
  private apply(transaction:EditTransaction,inverse:boolean):void{const staged=stage(this.document,transaction.patches,inverse);this.validator(staged,transaction.affectedChunks);Object.assign(this.document,staged);}
  private remember(transaction:EditTransaction):void{this.past.push(transaction);this.future=[];this.sequence++;this.trim();}
  private trim():void{while(this.past.length>this.options.maxTransactions||this.historyBytes>this.options.maxHistoryBytes){if(this.past.length)this.past.shift();else if(this.future.length)this.future.shift();else break;}}
  private notify(transaction:EditTransaction,operation:'execute'|'undo'|'redo'|'cancel'):void{for(const listener of this.listeners)listener(transaction,operation);}
}
