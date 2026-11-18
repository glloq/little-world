/** A portable, locally persisted player bag independent of the currently loaded island.
 * Only the island's own world state belongs to its per-world save. No server or Three.js.
 */
import {identifier,parseItem,type ItemDefinition} from '../gameplay/schema.ts';
import {parseTraveler,type TravelStore,type TravelerState} from './transit.ts';

export const PORTABLE_TRAVELER_KEY='little-world:portable-traveler:v1';
const ISLAND=/^[a-z][a-z0-9-]{1,47}$/;

export interface PortableTravelerCheckpoint {
  schemaVersion:1;
  islandId:string;
  worldId:string;
  traveler:TravelerState;
}

/** Foreign items must be usable and visible even when absent from the target island manifest.
 * Reuse the destination definition for known IDs, but never silently truncate a carried stack.
 */
export function withPortableItems(items:readonly ItemDefinition[],traveler:TravelerState):ItemDefinition[]{
  const result=items.map(item=>({...item}));
  const indexes=new Map(result.map((item,index)=>[item.id,index]));
  const declared=new Map((traveler.items??[]).map(item=>[item.id,item]));
  for(const [id,quantity] of Object.entries(traveler.inventory)){
    if(quantity<=0)continue;
    const index=indexes.get(id);
    if(index!==undefined){
      if(result[index].maxQuantity<quantity)result[index]={...result[index],maxQuantity:quantity};
      continue;
    }
    const definition=declared.get(id)??{id,name:id,category:'divers',maxQuantity:quantity,
      description:'Objet transporté depuis une autre île.'};
    const item=parseItem({...definition,maxQuantity:Math.max(definition.maxQuantity,quantity)});
    indexes.set(id,result.length);
    result.push(item);
  }
  return result;
}

export function parsePortableCheckpoint(raw:unknown):PortableTravelerCheckpoint {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Sauvegarde portable invalide');
  const v=raw as Record<string,unknown>;
  if(v.schemaVersion!==1||typeof v.islandId!=='string'||!ISLAND.test(v.islandId)||
    !identifier(v.worldId))throw Error('Identité portable invalide');
  return {schemaVersion:1,islandId:v.islandId,worldId:v.worldId,traveler:parseTraveler(v.traveler)};
}

/** Explicit commit after arrival; never use the session-scoped transit ticket as a durable save. */
export function savePortableCheckpoint(storage:TravelStore,islandId:string,worldId:string,traveler:TravelerState):PortableTravelerCheckpoint{
  const checkpoint=parsePortableCheckpoint({schemaVersion:1,islandId,worldId,traveler});
  storage.setItem(PORTABLE_TRAVELER_KEY,JSON.stringify(checkpoint));
  return checkpoint;
}
export function loadPortableCheckpoint(storage:TravelStore,islandId:string,worldId:string):PortableTravelerCheckpoint|null{
  const raw=storage.getItem(PORTABLE_TRAVELER_KEY);
  if(raw===null)return null;
  const checkpoint=parsePortableCheckpoint(JSON.parse(raw));
  return checkpoint.islandId===islandId&&checkpoint.worldId===worldId?checkpoint:null;
}
