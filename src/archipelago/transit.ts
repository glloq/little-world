/** Solo travel checkpoint. Session-scoped hand-off, separate from per-world saves.
 * A future server can replace this adapter without changing ferry commands. */
import {parseFlightProgress,type FlightProgress} from '../gameplay/flight-progress.ts';
import {parseQuestInstance} from '../quests/validation.ts';
import type {QuestInstanceV1} from '../quests/schema.ts';
import {parseItem,type ItemDefinition} from '../gameplay/schema.ts';
import {parsePlayerLoadout,type PlayerLoadout} from '../gameplay/player-loadout.ts';
import type {PublishedIsland} from './registry.ts';
export const FERRY_TRANSIT_KEY='little-world:ferry-transit:v1';
export const FERRY_RECOVERY_KEY='little-world:ferry-recovery:v1';
const TTL_MS=10*60*1000;
export interface TravelStore {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface TravelerState {inventory:Record<string,number>;gasReserve:number;flightProgress:FlightProgress;
  /** Optional player vitals, missing in legacy ferry tickets. */satiety?:number;boostRechargeProgress?:number;
  /** Definitions of carried items not necessarily present in the destination world. Optional for V1 tickets. */
  items?:ItemDefinition[];equippedItemId?:string|null;loadout?:PlayerLoadout;
  /** Accepted cross-island quest ledger; absent in legacy ferry tickets. */
  questsPortable?:Record<string,QuestInstanceV1>;}
export interface FerryTransit {
  schemaVersion:1;sourceId:string;sourceManifest:string;
  destinationId:string;destinationManifest:string;
  issuedAt:number;worldSeconds:number;traveler:TravelerState;
}
const ID=/^[a-z][a-z0-9-]{1,47}$/;
const ITEM=/^[a-zA-Z0-9:._-]{1,100}$/;
const MANIFEST=/^(?:maps\/[a-z0-9_-]+(?:\/[a-z0-9_-]+)*|archipelago\/worlds\/[a-z0-9_-]+)\/manifest\.json$/;
export function parseTraveler(raw:unknown):TravelerState {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Bagage invalide');
  const t=raw as Record<string,unknown>;
  if(!t.inventory||typeof t.inventory!=='object'||Array.isArray(t.inventory))throw Error('Inventaire de voyage invalide');
  const bag=t.inventory as Record<string,unknown>,names=Object.keys(bag);
  if(names.length>1000)throw Error('Trop d’objets transportés');
  const inventory:Record<string,number>={};
  for(const name of names){
    const count=bag[name];
    if(!ITEM.test(name)||!Number.isSafeInteger(count)||!(Number(count)>=0&&Number(count)<=9999))throw Error('Objet de voyage invalide');
    if(Number(count)>0)inventory[name]=Number(count);
  }
  let items:ItemDefinition[]|undefined;
  if(t.items!==undefined){
    if(!Array.isArray(t.items)||t.items.length>1000)throw Error('Catalogue portable invalide');
    const seen=new Set<string>();
    items=t.items.map(raw=>{
      const item=parseItem(raw);
      if(seen.has(item.id)||!inventory[item.id])throw Error('Définition portable dupliquée ou inutile');
      seen.add(item.id);
      return item;
    });
  }
  if(typeof t.gasReserve!=='number'||!Number.isFinite(t.gasReserve)||t.gasReserve<0||t.gasReserve>10000)throw Error('Réserve de propulsion invalide');
  for(const key of ['satiety','boostRechargeProgress'] as const){
    const value=t[key];if(value!==undefined&&(typeof value!=='number'||!Number.isFinite(value)||value<0||value>(key==='satiety'?100:1)))throw Error('Satiété de voyage invalide');
  }
  const equippedItemId=t.equippedItemId;
  if(equippedItemId!==undefined&&equippedItemId!==null&&
     (typeof equippedItemId!=='string'||!ITEM.test(equippedItemId)||!(inventory[equippedItemId]>0)))throw Error('Équipement de voyage invalide');
  let questsPortable:Record<string,QuestInstanceV1>|undefined;
  if(t.questsPortable!==undefined){
    if(!t.questsPortable||typeof t.questsPortable!=='object'||Array.isArray(t.questsPortable)||
      Object.keys(t.questsPortable).length>64)throw Error('Quêtes de voyage invalides');
    questsPortable={};
    for(const [key,value]of Object.entries(t.questsPortable)){
      const entry=parseQuestInstance(value);
      if(key!==entry.instanceId||!ITEM.test(key))throw Error('Identité de quête de voyage invalide');
      questsPortable[key]=entry;
    }
  }
  const loadout=t.loadout===undefined?undefined:parsePlayerLoadout(t.loadout);
  if(loadout?.head&&!(inventory[loadout.head]>0))throw Error('Casque de voyage absent du sac');
  return {inventory,gasReserve:t.gasReserve,flightProgress:parseFlightProgress(t.flightProgress),
    ...(t.satiety!==undefined?{satiety:t.satiety as number}:{}),...(t.boostRechargeProgress!==undefined?{boostRechargeProgress:t.boostRechargeProgress as number}:{}),...(items?{items}:{}),
    ...(equippedItemId!==undefined?{equippedItemId:equippedItemId as string|null}:{}),...(loadout?{loadout}:{}),...(questsPortable?{questsPortable}:{})};
}
export function parseTransit(raw:unknown,now=Date.now()):FerryTransit {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Traversée invalide');
  const v=raw as Record<string,unknown>;
  if(v.schemaVersion!==1||typeof v.sourceId!=='string'||!ID.test(v.sourceId)||
     typeof v.destinationId!=='string'||!ID.test(v.destinationId)||v.sourceId===v.destinationId||
     typeof v.sourceManifest!=='string'||!MANIFEST.test(v.sourceManifest)||
     typeof v.destinationManifest!=='string'||!MANIFEST.test(v.destinationManifest)||
     typeof v.issuedAt!=='number'||!Number.isFinite(v.issuedAt)||v.issuedAt>now+60000||now-v.issuedAt>TTL_MS||
     typeof v.worldSeconds!=='number'||!Number.isFinite(v.worldSeconds)||v.worldSeconds<0||v.worldSeconds>1e9)
    throw Error('Traversée expirée ou incompatible');
  return {schemaVersion:1,sourceId:v.sourceId,sourceManifest:v.sourceManifest,
    destinationId:v.destinationId,destinationManifest:v.destinationManifest,issuedAt:v.issuedAt,
    worldSeconds:v.worldSeconds,traveler:parseTraveler(v.traveler)};
}
export function beginTransit(storage:TravelStore,source:PublishedIsland,destination:PublishedIsland,
  worldSeconds:number,traveler:TravelerState,now=Date.now()):FerryTransit {
  const data=parseTransit({schemaVersion:1,sourceId:source.id,sourceManifest:source.manifest,
    destinationId:destination.id,destinationManifest:destination.manifest,issuedAt:now,worldSeconds,traveler},now);
  storage.setItem(FERRY_TRANSIT_KEY,JSON.stringify(data));
  return data;
}
export function pendingTransit(storage:TravelStore,destination:PublishedIsland|null,now=Date.now()):FerryTransit|null {
  const raw=storage.getItem(FERRY_TRANSIT_KEY);
  if(!raw||!destination)return null;
  try{
    const data=parseTransit(JSON.parse(raw),now);
    if(data.destinationId!==destination.id||data.destinationManifest!==destination.manifest)throw Error('Destination de traversée incohérente');
    return data;
  }catch{storage.removeItem(FERRY_TRANSIT_KEY);return null;}
}
export function clearTransit(storage:TravelStore){storage.removeItem(FERRY_TRANSIT_KEY);}
export function partitionTravelerInventory(inventory:Record<string,number>,
  available:readonly {id:string;maxQuantity:number}[]):{equipped:Record<string,number>;stashed:Record<string,number>} {
  const known=new Map(available.map(item=>[item.id,item.maxQuantity]));
  const equipped:Record<string,number>={},stashed:Record<string,number>={};
  for(const [id,quantity] of Object.entries(inventory)){
    const max=known.get(id);
    if(max===undefined){stashed[id]=quantity;continue;}
    const use=Math.min(quantity,max);
    if(use>0)equipped[id]=use;
    if(quantity>use)stashed[id]=quantity-use;
  }
  return {equipped,stashed};
}
