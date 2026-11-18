import {parseSkiArea,type SkiAreaV1} from '../snow/ski-area.ts';
import {parseActivities} from './activities.ts';
import {validateAudioLinks} from '../audio/schema.ts';
import {parseAnyAudioDefinition,type AnyAudioDefinition} from '../audio/migrate.ts';
import {playtestSlotPrefix} from './save.ts';
import {validateRace,type RaceDefinition} from './races.ts';
import {validateSurfZone,type SurfZone} from '../surf/wave-field.ts';
import {validateSurfFeature,type SurfFeature} from '../surf/surf-features.ts';
import {validateCollisionDefinition,type CollisionDefinition} from '../physics/definitions.ts';
import {naturalColliderOwner} from '../structures/natural-collision.ts';
/** Runtime input has no authoring database access or Studio module dependency. */
import {parseWorld,type WorldDefinition} from '../world-data.ts';
import {parseGameplayData,finite,identifier,record,type GameplayData,type Point3} from './schema.ts';
export interface PlayableWorld {schemaVersion:1;kind:'playable-world';audio?:AnyAudioDefinition;alpine?:SkiAreaV1;collisions?:CollisionDefinition[];world:WorldDefinition;gameplay:GameplayData;spawn:Point3;
  /** Mines and farm plots (runtime projection of activity zones). */activities?:import('./activities.ts').PlayableActivities;
  /** Optional fixed circuits compiled from a Studio project. */races?:RaceDefinition[];
  /** Optional local swells, separate from flat hydrographic water. */surfZones?:SurfZone[];surfFeatures?:SurfFeature[];}
export interface StudioPlaytest {schemaVersion:1;kind:'studio-playtest';snapshotId:string;projectId:string;createdAt:number;content:PlayableWorld;}
export function parsePlayableWorld(value:unknown):PlayableWorld {
 if(!record(value)||value.schemaVersion!==1||value.kind!=='playable-world'||!record(value.spawn)||!finite(value.spawn.x,-10000,10000)||!finite(value.spawn.y,-10000,10000)||!finite(value.spawn.z,-10000,10000))throw Error('Monde jouable invalide');
 const world=parseWorld(value.world),gameplay=parseGameplayData(value.gameplay),spawn=value.spawn as unknown as Point3;
 const width=world.config.width??200,length=world.config.length??600;
 if(Math.abs(spawn.x)>width/2||Math.abs(spawn.z)>length/2)throw Error('Point de départ hors de la carte');
 const rendered=new Set([...world.placements.map(e=>e.id),...world.npcs.map(e=>e.id)]);
 for(const entity of gameplay.entities)if(entity.interactable&&!rendered.has(entity.id))throw Error('Objet interactif sans représentation : '+entity.id);
 if(value.collisions!==undefined){if(!Array.isArray(value.collisions)||value.collisions.length>100000)throw Error('Liste de collisions invalide');const ids=new Set<string>(),entityIds=new Set(gameplay.entities.map(e=>e.id));for(const body of value.collisions){validateCollisionDefinition(body);if(ids.has(body.id)||!entityIds.has(naturalColliderOwner(body.id)))throw Error('Référence collider invalide');ids.add(body.id);}}
 const races:RaceDefinition[]|undefined=value.races===undefined?undefined:(()=>{
   if(!Array.isArray(value.races)||value.races.length>64)throw Error('Liste de courses invalide');
   const ids=new Set<string>();
   return value.races.map(raw=>{const r=validateRace(raw, {minX:-width/2,maxX:width/2,minZ:-length/2,maxZ:length/2});
     if(r.worldId!==gameplay.worldId||ids.has(r.id))throw Error('ID de course invalide');
     ids.add(r.id);return structuredClone(r);
   });
 })();
 const surfZones:SurfZone[]|undefined=value.surfZones===undefined?undefined:(()=>{
   if(!Array.isArray(value.surfZones)||value.surfZones.length>32)throw Error('Zones surf invalides');
   const ids=new Set<string>();
   return value.surfZones.map(raw=>{
     const zone=validateSurfZone(raw as SurfZone);
     if(ids.has(zone.id)||zone.minX< -width/2||zone.maxX>width/2||
        zone.minZ< -length/2||zone.maxZ>length/2||zone.seaLevel!==world.config.seaLevel)
       throw Error('Zone surf hors du monde');
     ids.add(zone.id);return structuredClone(zone);
   });
 })();
 const surfFeatures:SurfFeature[]|undefined=value.surfFeatures===undefined?undefined:(()=>{
   if(!Array.isArray(value.surfFeatures)||value.surfFeatures.length>200)throw Error('Modules surf invalides');
   const ids=new Set<string>();
   return value.surfFeatures.map(raw=>{
     const f=validateSurfFeature(raw as SurfFeature);
     if(ids.has(f.id)||f.x< -width/2||f.x>width/2||f.z< -length/2||f.z>length/2||
        !(surfZones??[]).some(zone=>f.x>=zone.minX&&f.x<=zone.maxX&&f.z>=zone.minZ&&f.z<=zone.maxZ))
       throw Error('Module surf hors de zone');
     ids.add(f.id);return structuredClone(f);
   });
 })();
 const audio=value.audio!==undefined?parseAnyAudioDefinition(value.audio):undefined;const actions=[...gameplay.interactions.flatMap(i=>i.sequence),...gameplay.dialogues.flatMap(d=>d.lines.flatMap(l=>[...(l.actions??[]),...l.choices.flatMap(c=>c.actions??[])]))];validateAudioLinks(audio,gameplay.entities.map(e=>e.id),actions.filter(a=>a.type==='playSound').map(a=>(a as {soundId:string}).soundId));
 return {schemaVersion:1,kind:'playable-world',...(value.alpine?{alpine:parseSkiArea(value.alpine,{minX:-width/2,maxX:width/2,minZ:-length/2,maxZ:length/2})}:{}),...(audio?{audio}:{}),world,gameplay,spawn:{...spawn},...(value.collisions?{collisions:structuredClone(value.collisions) as CollisionDefinition[]}:{} ),...(value.activities!==undefined?{activities:parseActivities(value.activities)}:{}),...(races?{races}:{}),...(surfZones?{surfZones}:{}),...(surfFeatures?{surfFeatures}:{})};
}
const PREFIX='little-world:studio-playtest:v1:';
export function savePlaytest(value:Omit<StudioPlaytest,'schemaVersion'|'kind'|'snapshotId'|'createdAt'>,storage:Storage=sessionStorage):StudioPlaytest {
 const snapshot:StudioPlaytest={schemaVersion:1,kind:'studio-playtest',snapshotId:crypto.randomUUID(),createdAt:Date.now(),projectId:value.projectId,content:parsePlayableWorld(value.content)};
 if(!identifier(snapshot.projectId))throw Error('Projet de test invalide');
 const keys=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((k):k is string=>!!k&&k.startsWith(PREFIX));
 // Bound retained source copies; game slots use another namespace.
 const previous=keys.map(key=>{try{return {key,at:JSON.parse(storage.getItem(key)!).createdAt??0};}catch{return {key,at:0};}}).sort((a,b)=>b.at-a.at);
 for(const entry of previous.slice(4)){storage.removeItem(entry.key);try{const prefix=playtestSlotPrefix(entry.key.slice(PREFIX.length)),slots=Array.from({length:storage.length},(_,i)=>storage.key(i)).filter((key):key is string=>!!key&&key.startsWith(prefix));for(const key of slots)storage.removeItem(key);}catch{/* A malformed snapshot key has no valid slot namespace. */}}
 storage.setItem(PREFIX+snapshot.snapshotId,JSON.stringify(snapshot));return snapshot;
}
export function loadPlaytest(id:string,storage:Storage=sessionStorage):StudioPlaytest {
 if(!identifier(id))throw Error('Identifiant de test invalide');const raw=storage.getItem(PREFIX+id);if(!raw)throw Error('Copie de test absente. Relancez-la depuis Studio.');const value=JSON.parse(raw);
 if(value.schemaVersion!==1||value.kind!=='studio-playtest'||value.snapshotId!==id||!identifier(value.projectId)||!finite(value.createdAt,0,1e15))throw Error('Copie de test invalide');
 return {...value,content:parsePlayableWorld(value.content)};
}
