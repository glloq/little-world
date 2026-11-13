import {finite,identifier,record,stateValue,type ObjectiveStatus,type Point3,type StateValue} from './schema.ts';
export interface GameSaveV1 {schemaVersion:1;worldId:string;worldBuildVersion:string;slotId:string;savedAt:number;time:number;position:Point3;inventory:Record<string,number>;variables:Record<string,StateValue>;objectives:Record<string,ObjectiveStatus>;entities:Record<string,Record<string,StateValue>>;executed:Record<string,boolean>;cooldowns:Record<string,number>;dialogueFlags:Record<string,boolean>;pending:{interactionId:string;cursor:number;wakeAt:number}[];}
const assert=(value:unknown,message:string):void=>{if(!value)throw Error(message);};
function entries(value:unknown,limit:number,check:(value:unknown)=>boolean):void {assert(record(value)&&Object.keys(value).length<=limit,'Dictionnaire de sauvegarde invalide');for(const [key,item]of Object.entries(value as object))assert(identifier(key)&&check(item),'Champ de sauvegarde invalide : '+key);}
export function parseGameSave(value:unknown):GameSaveV1 {
  assert(record(value),'Sauvegarde : objet attendu');const v=value as Record<string,unknown>;
  assert(v.schemaVersion===1&&identifier(v.worldId)&&identifier(v.worldBuildVersion)&&identifier(v.slotId)&&finite(v.savedAt,0,1e15)&&finite(v.time,0,1e9),'Version ou identité de sauvegarde invalide');
  assert(record(v.position)&&finite(v.position.x,-100000,100000)&&finite(v.position.y,-10000,10000)&&finite(v.position.z,-100000,100000),'Position de sauvegarde invalide');
  entries(v.inventory,1000,n=>Number.isInteger(n)&&finite(n,0,9999));entries(v.variables,10000,stateValue);
  entries(v.objectives,10000,s=>s==='locked'||s==='active'||s==='complete');entries(v.executed,10000,b=>typeof b==='boolean');entries(v.cooldowns,10000,n=>finite(n,0,1e9));
  entries(v.entities,10000,states=>{entries(states,100,stateValue);return true;});
  if(v.dialogueFlags!==undefined){assert(record(v.dialogueFlags)&&Object.keys(v.dialogueFlags).length<=10000,'Choix de dialogue invalides');for(const [key,value]of Object.entries(v.dialogueFlags as object))assert(key.length<=512&&typeof value==='boolean','Choix de dialogue invalide');}
  assert(Array.isArray(v.pending)&&v.pending.length<=64,'Séquences sauvegardées invalides');
  for(const raw of v.pending as unknown[]){assert(record(raw)&&identifier(raw.interactionId)&&Number.isInteger(raw.cursor)&&finite(raw.cursor,0,64)&&finite(raw.wakeAt,0,1e9),'Séquence sauvegardée invalide');}
  assert(new TextEncoder().encode(JSON.stringify(value)).byteLength<=2_000_000,'Sauvegarde trop volumineuse');return structuredClone({...v,dialogueFlags:v.dialogueFlags??{}}) as unknown as GameSaveV1;
}
export const GAME_SAVE_PREFIX='little-world:game-save:v1:';
export interface SaveStorage {readonly length:number;key(index:number):string|null;getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void;}
export interface SaveSlot {slotId:string;worldId:string;savedAt?:number;worldBuildVersion?:string;error?:string;}
/** Game slots have their own namespace; authoring drafts/checkpoints are never read or modified. */
export function createGameSaveStore(provided?:SaveStorage){
  const storage=()=>provided??localStorage;
  const worldPrefix=(worldId:string)=>{if(!identifier(worldId))throw Error('Monde invalide');return GAME_SAVE_PREFIX+encodeURIComponent(worldId)+':';};
  const key=(worldId:string,slotId:string)=>{if(!identifier(slotId))throw Error('Slot invalide');return worldPrefix(worldId)+encodeURIComponent(slotId);};
  async function list(worldId:string):Promise<SaveSlot[]>{
    const s=storage(),prefix=worldPrefix(worldId),out:SaveSlot[]=[];
    for(let i=0;i<s.length;i++){const k=s.key(i);if(!k?.startsWith(prefix))continue;const slotId=decodeURIComponent(k.slice(prefix.length));try{const raw=s.getItem(k);if(!raw)continue;const parsed=parseGameSave(JSON.parse(raw));if(parsed.worldId!==worldId||parsed.slotId!==slotId)throw Error('Identité du slot incohérente');out.push({slotId,worldId,savedAt:parsed.savedAt,worldBuildVersion:parsed.worldBuildVersion});}catch(e){out.push({slotId,worldId,error:e instanceof Error?e.message:String(e)});}}
    return out.sort((a,b)=>(b.savedAt??0)-(a.savedAt??0));
  }
  return {
    list,
    async save(value:GameSaveV1):Promise<void>{const parsed=parseGameSave(value),s=storage(),k=key(parsed.worldId,parsed.slotId);if(s.getItem(k)===null&&(await list(parsed.worldId)).length>=10)throw Error('Maximum de dix slots atteint pour ce monde');s.setItem(k,JSON.stringify(parsed));},
    async load(worldId:string,slotId:string):Promise<GameSaveV1|null>{const raw=storage().getItem(key(worldId,slotId));if(raw===null)return null;const save=parseGameSave(JSON.parse(raw));if(save.worldId!==worldId||save.slotId!==slotId)throw Error('Identité de sauvegarde incohérente');return save;},
    async delete(worldId:string,slotId:string):Promise<void>{storage().removeItem(key(worldId,slotId));}
  };
}
/** Prefix sandbox for a single disposable playtest snapshot. */
export function scopedSaveStorage(storage:SaveStorage,scope:string):SaveStorage {
 if(!identifier(scope))throw Error('Périmètre de test invalide');const prefix='little-world:playtest-slots:'+encodeURIComponent(scope)+':';
 const keys=()=>Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((k):k is string=>!!k&&k.startsWith(prefix));
 return {get length(){return keys().length;},key(index){return keys()[index]?.slice(prefix.length)??null;},getItem(key){return storage.getItem(prefix+key);},setItem(key,value){storage.setItem(prefix+key,value);},removeItem(key){storage.removeItem(prefix+key);}};
}
