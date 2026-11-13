import {validateCollisionDefinition,type CollisionDefinition} from '../physics/definitions.ts';
/** Runtime input has no authoring database access or Studio module dependency. */
import {parseWorld,type WorldDefinition} from '../world-data.ts';
import {parseGameplayData,finite,identifier,record,type GameplayData,type Point3} from './schema.ts';
export interface PlayableWorld {schemaVersion:1;kind:'playable-world';collisions?:CollisionDefinition[];world:WorldDefinition;gameplay:GameplayData;spawn:Point3;}
export interface StudioPlaytest {schemaVersion:1;kind:'studio-playtest';snapshotId:string;projectId:string;createdAt:number;content:PlayableWorld;}
export function parsePlayableWorld(value:unknown):PlayableWorld {
 if(!record(value)||value.schemaVersion!==1||value.kind!=='playable-world'||!record(value.spawn)||!finite(value.spawn.x,-10000,10000)||!finite(value.spawn.y,-10000,10000)||!finite(value.spawn.z,-10000,10000))throw Error('Monde jouable invalide');
 const world=parseWorld(value.world),gameplay=parseGameplayData(value.gameplay),spawn=value.spawn as unknown as Point3;
 const width=world.config.width??200,length=world.config.length??600;
 if(Math.abs(spawn.x)>width/2||Math.abs(spawn.z)>length/2)throw Error('Point de départ hors de la carte');
 const rendered=new Set([...world.placements.map(e=>e.id),...world.npcs.map(e=>e.id)]);
 for(const entity of gameplay.entities)if(entity.interactable&&!rendered.has(entity.id))throw Error('Objet interactif sans représentation : '+entity.id);
 if(value.collisions!==undefined){if(!Array.isArray(value.collisions)||value.collisions.length>100000)throw Error('Liste de collisions invalide');const ids=new Set<string>(),entityIds=new Set(gameplay.entities.map(e=>e.id));for(const body of value.collisions){validateCollisionDefinition(body);if(ids.has(body.id)||!entityIds.has(body.id))throw Error('Référence collider invalide');ids.add(body.id);}}
 return {schemaVersion:1,kind:'playable-world',world,gameplay,spawn:{...spawn},...(value.collisions?{collisions:structuredClone(value.collisions) as CollisionDefinition[]}:{} )};
}
const PREFIX='little-world:studio-playtest:v1:';
export function savePlaytest(value:Omit<StudioPlaytest,'schemaVersion'|'kind'|'snapshotId'|'createdAt'>,storage:Storage=sessionStorage):StudioPlaytest {
 const snapshot:StudioPlaytest={schemaVersion:1,kind:'studio-playtest',snapshotId:crypto.randomUUID(),createdAt:Date.now(),projectId:value.projectId,content:parsePlayableWorld(value.content)};
 if(!identifier(snapshot.projectId))throw Error('Projet de test invalide');
 const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((k):k is string=>!!k&&k.startsWith(PREFIX));
 // Bound retained source copies; game slots use another namespace.
 const previous=keys.map(key=>{try{return {key,at:JSON.parse(storage.getItem(key)!).createdAt??0};}catch{return {key,at:0};}}).sort((a,b)=>b.at-a.at);
 for(const entry of previous.slice(4))storage.removeItem(entry.key);
 storage.setItem(PREFIX+snapshot.snapshotId,JSON.stringify(snapshot));return snapshot;
}
export function loadPlaytest(id:string,storage:Storage=sessionStorage):StudioPlaytest {
 if(!identifier(id))throw Error('Identifiant de test invalide');const raw=storage.getItem(PREFIX+id);if(!raw)throw Error('Copie de test absente. Relancez-la depuis Studio.');const value=JSON.parse(raw);
 if(value.schemaVersion!==1||value.kind!=='studio-playtest'||value.snapshotId!==id||!identifier(value.projectId)||!finite(value.createdAt,0,1e15))throw Error('Copie de test invalide');
 return {...value,content:parsePlayableWorld(value.content)};
}
