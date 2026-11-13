import {finite,identifier,record,stateValue,type ObjectiveStatus,type Point3,type StateValue} from './schema.ts';
import {parseMineSave,type MineSaveState} from '../mine/mine-state.ts';
import {parsePlotState,type FarmPlotState} from '../farm/farm-sim.ts';
import {indexedDbBlobStore,type BlobStore} from './save-blobs.ts';
export interface GameSaveV1 {schemaVersion:1;worldId:string;worldBuildVersion:string;slotId:string;savedAt:number;time:number;position:Point3;inventory:Record<string,number>;variables:Record<string,StateValue>;objectives:Record<string,ObjectiveStatus>;entities:Record<string,Record<string,StateValue>>;executed:Record<string,boolean>;cooldowns:Record<string,number>;dialogueFlags:Record<string,boolean>;pending:{interactionId:string;cursor:number;wakeAt:number}[];}
/** V2 = V1 + active space + per-mine excavation differences + per-plot farm states. Large
 * activity payloads live in IndexedDB (`external`), the compact manifest stays at the same
 * localStorage key, written last as the commit point. V1 slots are migrated on read. */
export interface GameSaveV2 extends Omit<GameSaveV1,'schemaVersion'> {schemaVersion:2;space?:{zoneId:string;levelId:string}|null;mines:Record<string,MineSaveState>;farms:Record<string,FarmPlotState>;external?:{key:string;bytes:number}}
export type GameSave=GameSaveV2;
/** Activity payloads above this size go to IndexedDB (when available). */
export const INLINE_ACTIVITY_LIMIT=256*1024;
const assert=(value:unknown,message:string):void=>{if(!value)throw Error(message);};
function entries(value:unknown,limit:number,check:(value:unknown)=>boolean):void {assert(record(value)&&Object.keys(value).length<=limit,'Dictionnaire de sauvegarde invalide');for(const [key,item]of Object.entries(value as object))assert(identifier(key)&&check(item),'Champ de sauvegarde invalide : '+key);}
export function parseGameSave(value:unknown):GameSaveV2 {
  assert(record(value),'Sauvegarde : objet attendu');const v=value as Record<string,unknown>;
  assert((v.schemaVersion===1||v.schemaVersion===2)&&identifier(v.worldId)&&identifier(v.worldBuildVersion)&&identifier(v.slotId)&&finite(v.savedAt,0,1e15)&&finite(v.time,0,1e9),'Version ou identité de sauvegarde invalide');
  assert(record(v.position)&&finite(v.position.x,-100000,100000)&&finite(v.position.y,-10000,10000)&&finite(v.position.z,-100000,100000),'Position de sauvegarde invalide');
  entries(v.inventory,1000,n=>Number.isInteger(n)&&finite(n,0,9999));entries(v.variables,10000,stateValue);
  entries(v.objectives,10000,s=>s==='locked'||s==='active'||s==='complete');entries(v.executed,10000,b=>typeof b==='boolean');entries(v.cooldowns,10000,n=>finite(n,0,1e9));
  entries(v.entities,10000,states=>{entries(states,100,stateValue);return true;});
  if(v.dialogueFlags!==undefined){assert(record(v.dialogueFlags)&&Object.keys(v.dialogueFlags).length<=10000,'Choix de dialogue invalides');for(const [key,value]of Object.entries(v.dialogueFlags as object))assert(key.length<=512&&typeof value==='boolean','Choix de dialogue invalide');}
  assert(Array.isArray(v.pending)&&v.pending.length<=64,'Séquences sauvegardées invalides');
  for(const raw of v.pending as unknown[]){assert(record(raw)&&identifier(raw.interactionId)&&Number.isInteger(raw.cursor)&&finite(raw.cursor,0,64)&&finite(raw.wakeAt,0,1e9),'Séquence sauvegardée invalide');}
  if(v.space!==undefined&&v.space!==null)assert(record(v.space)&&identifier(v.space.zoneId)&&identifier(v.space.levelId),'Espace de sauvegarde invalide');
  const mines:Record<string,MineSaveState>={},farms:Record<string,FarmPlotState>={};
  if(v.mines!==undefined){assert(record(v.mines)&&Object.keys(v.mines).length<=64,'États de mines invalides');for(const [id,m]of Object.entries(v.mines as object)){const parsed=parseMineSave(m);assert(parsed.mineId===id,'Identité de mine incohérente');mines[id]=parsed;}}
  if(v.farms!==undefined){assert(record(v.farms)&&Object.keys(v.farms).length<=512,'États de parcelles invalides');for(const [id,f]of Object.entries(v.farms as object)){const parsed=parsePlotState(f);assert(parsed.plotId===id,'Identité de parcelle incohérente');farms[id]=parsed;}}
  if(v.external!==undefined)assert(record(v.external)&&typeof v.external.key==='string'&&v.external.key.length<=300&&finite(v.external.bytes,0,1e9),'Référence de données de partie invalide');
  assert(new TextEncoder().encode(JSON.stringify({...v,mines:undefined,farms:undefined})).byteLength<=2_000_000,'Sauvegarde trop volumineuse');
  return structuredClone({...v,schemaVersion:2,dialogueFlags:v.dialogueFlags??{},space:v.space??null,mines,farms}) as unknown as GameSaveV2;
}
export const GAME_SAVE_PREFIX='little-world:game-save:v1:';
export interface SaveStorage {readonly length:number;key(index:number):string|null;getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export interface SaveSlot {slotId:string;worldId:string;savedAt?:number;worldBuildVersion?:string;error?:string;
  /** Minimal progress shown by the saves screen (world time, items carried, missions done). */progress?:{time:number;items:number;objectivesDone:number};}
/** Game slots have their own namespace; authoring drafts/checkpoints are never read or modified. */
export function createGameSaveStore(provided?:SaveStorage,blobStore?:BlobStore|null){
  const storage=()=>provided??localStorage;let blobsResolved=blobStore!==undefined,blobsValue=blobStore??null;
  const blobs=()=>{if(!blobsResolved){blobsResolved=true;blobsValue=indexedDbBlobStore();}return blobsValue;};
  /** Completes an externalised slot from IndexedDB (clear message if the data is gone). */
  async function inflate(save:GameSaveV2):Promise<GameSaveV2>{
    if(!save.external)return save;const raw=await blobs()?.get(save.external.key);
    if(raw==null)throw Error('Données détaillées de la partie (mines, parcelles) introuvables : le stockage du navigateur a peut-être été effacé. Importez une sauvegarde exportée.');
    const extra=JSON.parse(raw);const {external:_,...rest}=save;return parseGameSave({...rest,mines:extra.mines,farms:extra.farms});
  }
  const worldPrefix=(worldId:string)=>{if(!identifier(worldId))throw Error('Monde invalide');return GAME_SAVE_PREFIX+encodeURIComponent(worldId)+':';};
  const key=(worldId:string,slotId:string)=>{if(!identifier(slotId))throw Error('Slot invalide');return worldPrefix(worldId)+encodeURIComponent(slotId);};
  async function list(worldId:string):Promise<SaveSlot[]>{
    const s=storage(),prefix=worldPrefix(worldId),out:SaveSlot[]=[];
    for(let i=0;i<s.length;i++){const k=s.key(i);if(!k?.startsWith(prefix))continue;const slotId=decodeURIComponent(k.slice(prefix.length));try{const raw=s.getItem(k);if(!raw)continue;const parsed=parseGameSave(JSON.parse(raw));if(parsed.worldId!==worldId||parsed.slotId!==slotId)throw Error('Identité du slot incohérente');out.push({slotId,worldId,savedAt:parsed.savedAt,worldBuildVersion:parsed.worldBuildVersion,progress:{time:parsed.time,items:Object.values(parsed.inventory).reduce((n,q)=>n+q,0),objectivesDone:Object.values(parsed.objectives).filter(v=>v==='complete').length}});}catch(e){out.push({slotId,worldId,error:e instanceof Error?e.message:String(e)});}}
    return out.sort((a,b)=>(b.savedAt??0)-(a.savedAt??0));
  }
  return {
    list,
    async save(value:GameSaveV1|GameSaveV2):Promise<{external:boolean}>{
      const parsed=await inflate(parseGameSave(value)),s=storage(),k=key(parsed.worldId,parsed.slotId),previousRaw=s.getItem(k);
      if(previousRaw===null&&(await list(parsed.worldId)).length>=10)throw Error('Maximum de dix slots atteint pour ce monde');
      const activity=JSON.stringify({mines:parsed.mines,farms:parsed.farms}),store=blobs();let manifest:GameSaveV2=parsed,blobKey:string|null=null;
      if(activity.length>INLINE_ACTIVITY_LIMIT){
        if(!store)throw Error('Partie trop volumineuse pour le stockage local de ce navigateur (IndexedDB indisponible) : utilisez « Exporter la partie en cours ».');
        blobKey=`${parsed.worldId}:${parsed.slotId}:${parsed.savedAt}:${Math.random().toString(36).slice(2,8)}`;await store.set(blobKey,activity);
        manifest={...parsed,mines:{},farms:{},external:{key:blobKey,bytes:activity.length}};
      }
      try{s.setItem(k,JSON.stringify(manifest));}catch(e){if(blobKey)await store?.delete(blobKey);throw Error('Stockage local indisponible ou plein ('+(e instanceof Error?e.message:String(e))+') : utilisez « Exporter la partie en cours ».');}
      // The new manifest is committed: the previous detached payload of this slot can go.
      try{const old=previousRaw?JSON.parse(previousRaw).external?.key:undefined;if(old&&old!==blobKey)await store?.delete(old);}catch{/* best effort */}
      return {external:!!blobKey};
    },
    async load(worldId:string,slotId:string):Promise<GameSaveV2|null>{const raw=storage().getItem(key(worldId,slotId));if(raw===null)return null;const save=parseGameSave(JSON.parse(raw));if(save.worldId!==worldId||save.slotId!==slotId)throw Error('Identité de sauvegarde incohérente');return inflate(save);},
    async delete(worldId:string,slotId:string):Promise<void>{const s=storage(),k=key(worldId,slotId),raw=s.getItem(k);s.removeItem(k);try{const old=raw?JSON.parse(raw).external?.key:undefined;if(old)await blobs()?.delete(old);}catch{/* best effort */}}
  };
}
/** Prefix sandbox for a single disposable playtest snapshot. */
export function playtestSlotPrefix(scope:string){if(!identifier(scope))throw Error('Périmètre de test invalide');return 'little-world:playtest-slots:'+encodeURIComponent(scope)+':';}
export function scopedSaveStorage(storage:SaveStorage,scope:string):SaveStorage {
 const prefix=playtestSlotPrefix(scope);
 const keys=()=>Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((k):k is string=>!!k&&k.startsWith(prefix));
 return {get length(){return keys().length;},key(index){return keys()[index]?.slice(prefix.length)??null;},getItem(key){return storage.getItem(prefix+key);},setItem(key,value){storage.setItem(prefix+key,value);},removeItem(key){storage.removeItem(prefix+key);}};
}
