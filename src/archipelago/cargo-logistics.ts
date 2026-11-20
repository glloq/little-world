/** ECO-7: deterministic maritime cargo for the offline archipelago.
 * One atomic localStorage document holds ALL export reserves, in-transit cargo and import lots.
 * No Three.js, DOM, server, wall-clock simulation or per-frame cargo updates.
 * Source reserves are separate, author-declared production/port warehouses, NOT copies of
 * the normal player's shop stock. Future Studio/producers may refill these reserves.
 */
import {marketUnitPrices} from '../economy/island-markets.ts';
import {COIN,type Purse} from '../gameplay/economy.ts';
import {identifier} from '../gameplay/schema.ts';

export const CARGO_STORAGE_KEY='little-world:archipelago-cargo:v1';
const ID=/^[a-zA-Z][a-zA-Z0-9:._-]{0,115}$/;
const isId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const int=(v:unknown,lo:number,hi:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=lo&&v<=hi;
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const MAX_SHIPMENTS=256,MAX_LOTS=96,MAX_PURCHASES=512;
export type CargoGoods={itemId:string;quantity:number};
export interface CargoRoute {
  id:string;fromIslandId:string;toIslandId:string;
  firstDepartureMinute:number;frequencyMinutes:number;travelMinutes:number;
  goods:CargoGoods[];
}
export interface CargoShipment {
  id:string;routeId:string;fromIslandId:string;toIslandId:string;
  departMinute:number;arriveMinute:number;goods:CargoGoods[];
  status:'in_transit'|'delivered';
}
export interface ImportLot {
  id:string;shipmentId:string;sourceIslandId:string;destinationIslandId:string;
  itemId:string;quantity:number;
}
export interface CargoPurchase {
  requestId:string;lotId:string;islandId:string;itemId:string;
  quantity:number;totalCoins:number;
}
export interface CargoBuyerCheckpoint {
  islandId:string;worldId:string;revision:number;inventory:Record<string,number>;
}
export interface CargoStateV1 {
  schemaVersion:1;revision:number;lastObservedMinute:number;
  /** Wallet at the moment of the most recent committed import purchase, saved atomically
   * with its cargo debit. Restored only if a world slot has not acknowledged the receipt. */
  buyerCheckpoint?:CargoBuyerCheckpoint;
  nextDepartures:Record<string,number>;
  exportReserves:Record<string,Record<string,number>>;
  shipments:CargoShipment[];
  importLots:Record<string,ImportLot[]>;
  purchases:CargoPurchase[];
}
export interface ImportOffer {
  lotId:string;itemId:string;originIslandId:string;shipmentId:string;
  quantity:number;unitPrice:number;
}
export interface ImportStandView {
  islandId:string;revision:number;offers:ImportOffer[];
  inTransit:number;nextArrivalMinute:number|null;
}
export type CargoResult={ok:true;message:string;revision:number}|{ok:false;reason:string};

/** Demonstration routes are explicitly authored, independent of passenger ferry windows.
 * A first ship departs after 10 game minutes and arrives after another 45.
 */
const ORIGINAL_CARGO_ROUTES:readonly CargoRoute[]=[
  {id:'forest-to-volcano',fromIslandId:'forest-valley',toIslandId:'volcano-island',
    firstDepartureMinute:10,frequencyMinutes:2880,travelMinutes:45,
    goods:[{itemId:'material:plank',quantity:4},{itemId:'wood:log',quantity:5}]},
  {id:'volcano-to-forest',fromIslandId:'volcano-island',toIslandId:'forest-valley',
    firstDepartureMinute:10,frequencyMinutes:2880,travelMinutes:45,
    goods:[{itemId:'material:iron-ingot',quantity:2},{itemId:'material:stone-block',quantity:3}]},
];
export const CARGO_ROUTES:readonly CargoRoute[]=[
  ...ORIGINAL_CARGO_ROUTES,
  {id:'harvest-to-alpine',fromIslandId:'harvest-island',toIslandId:'alpine-island',
    firstDepartureMinute:80,frequencyMinutes:2880,travelMinutes:55,
    goods:[{itemId:'farm:wheat',quantity:6},{itemId:'material:flour',quantity:3}]},
  {id:'harvest-to-surf',fromIslandId:'harvest-island',toIslandId:'surf-island',
    firstDepartureMinute:110,frequencyMinutes:2880,travelMinutes:40,
    goods:[{itemId:'farm:pumpkin',quantity:3},{itemId:'farm:carrot',quantity:6}]},
];
/** Finite starting reserves in the corresponding producing islands, NOT spawned per shipment.
 * ECO-8 will replace this author seed with aggregate producer output and configurable caps.
 */
export const CARGO_INITIAL_RESERVES:Readonly<Record<string,Readonly<Record<string,number>>>>={
  'forest-valley':{'material:plank':24,'wood:log':30},
  'volcano-island':{'material:iron-ingot':12,'material:stone-block':18},
  'harvest-island':{'farm:wheat':36,'material:flour':18,'farm:pumpkin':18,'farm:carrot':36},
};

export function validateCargoRoutes(routes:readonly CargoRoute[]):void{
  if(routes.length>32)throw Error('Trop de routes cargo');
  const ids=new Set<string>();
  for(const r of routes){
    if(!isId(r.id)||ids.has(r.id)||!isId(r.fromIslandId)||!isId(r.toIslandId)||
      r.fromIslandId===r.toIslandId||
      !int(r.firstDepartureMinute,0,1_000_000_000)||!int(r.frequencyMinutes,1,1_000_000_000)||
      !int(r.travelMinutes,1,1_000_000)||!Array.isArray(r.goods)||r.goods.length<1||r.goods.length>12)
      throw Error('Route cargo invalide');
    const items=new Set<string>();
    for(const good of r.goods){
      if(!isId(good.itemId)||items.has(good.itemId)||!int(good.quantity,1,9999))throw Error('Marchandise cargo invalide');
      items.add(good.itemId);
    }
    ids.add(r.id);
  }
}

export function newCargoState(routes:readonly CargoRoute[]=CARGO_ROUTES):CargoStateV1{
  validateCargoRoutes(routes);
  const reserves:Record<string,Record<string,number>>=Object.create(null);
  for(const [island,items] of Object.entries(CARGO_INITIAL_RESERVES))
    reserves[island]={...items};
  return {schemaVersion:1,revision:0,lastObservedMinute:0,
    nextDepartures:Object.fromEntries(routes.map(r=>[r.id,r.firstDepartureMinute])),
    exportReserves:reserves,shipments:[],importLots:{},purchases:[]};
}
export function parseCargoState(raw:unknown,routes:readonly CargoRoute[]=CARGO_ROUTES):CargoStateV1{
  validateCargoRoutes(routes);
  if(!obj(raw)||raw.schemaVersion!==1||!int(raw.revision,0,1_000_000_000)||
    !int(raw.lastObservedMinute,0,1_000_000_000))
    throw Error('État de fret invalide');
  const next=raw.nextDepartures;
  if(!obj(next)||Object.keys(next).length!==routes.length)throw Error('Calendrier cargo invalide');
  for(const r of routes)if(!int(next[r.id],r.firstDepartureMinute,1_000_000_000))
    throw Error('Horloge de route invalide');
  if(!obj(raw.exportReserves)||Object.keys(raw.exportReserves).length>100)
    throw Error('Dépôts de fret invalides');
  const reserves:Record<string,Record<string,number>>=Object.create(null);
  for(const [island,items] of Object.entries(raw.exportReserves)){
    if(!isId(island)||!obj(items)||Object.keys(items).length>100)throw Error('Dépôt cargo invalide');
    reserves[island]=Object.create(null);
    for(const [itemId,quantity] of Object.entries(items)){
      if(!isId(itemId)||!int(quantity,0,9999))throw Error('Réserve cargo invalide');
      reserves[island][itemId]=quantity;
    }
  }
  if(!Array.isArray(raw.shipments)||raw.shipments.length>MAX_SHIPMENTS)
    throw Error('Journal des cargaisons invalide');
  const shipIds=new Set<string>(),shipments:CargoShipment[]=[];
  for(const v of raw.shipments){
    if(!obj(v)||!isId(v.id)||shipIds.has(v.id)||!isId(v.routeId)||
      !isId(v.fromIslandId)||!isId(v.toIslandId)||v.fromIslandId===v.toIslandId||
      !int(v.departMinute,0,1_000_000_000)||!int(v.arriveMinute,(v.departMinute as number)+1,1_000_000_000)||
      !['in_transit','delivered'].includes(String(v.status))||
      !Array.isArray(v.goods)||v.goods.length<1||v.goods.length>12)
      throw Error('Cargaison invalide');
    const goods:CargoGoods[]=[],seen=new Set<string>();
    for(const g of v.goods){
      if(!obj(g)||!isId(g.itemId)||seen.has(g.itemId)||!int(g.quantity,1,9999))
        throw Error('Contenu de cargaison invalide');
      seen.add(g.itemId);goods.push({itemId:g.itemId,quantity:g.quantity});
    }
    const route=routes.find(r=>r.id===v.routeId);
    if(!route||route.fromIslandId!==v.fromIslandId||route.toIslandId!==v.toIslandId)
      throw Error('Cargaison sans route');
    shipIds.add(v.id);
    shipments.push({id:v.id,routeId:v.routeId as string,
      fromIslandId:v.fromIslandId as string,toIslandId:v.toIslandId as string,
      departMinute:v.departMinute as number,arriveMinute:v.arriveMinute as number,
      status:v.status as CargoShipment['status'],goods});
  }
  if(!obj(raw.importLots)||Object.keys(raw.importLots).length>100)
    throw Error('Lots d’import invalides');
  const importLots:Record<string,ImportLot[]>=Object.create(null),lotIds=new Set<string>();
  for(const [island,values] of Object.entries(raw.importLots)){
    if(!isId(island)||!Array.isArray(values)||values.length>MAX_LOTS)
      throw Error('Lots de l’île invalides');
    importLots[island]=[];
    for(const l of values){
      if(!obj(l)||!isId(l.id)||lotIds.has(l.id)||!isId(l.shipmentId)||!shipIds.has(l.shipmentId)||
        !isId(l.sourceIslandId)||!isId(l.destinationIslandId)||l.destinationIslandId!==island||
        l.sourceIslandId===island||!isId(l.itemId)||!int(l.quantity,0,9999))
        throw Error('Provenance de marchandise invalide');
      const shipment=shipments.find(s=>s.id===l.shipmentId);
      if(!shipment||shipment.status!=='delivered'||shipment.fromIslandId!==l.sourceIslandId||
        shipment.toIslandId!==island||!shipment.goods.some(g=>g.itemId===l.itemId&&(l.quantity as number)<=g.quantity))
        throw Error('Lot sans cargaison arrivée');
      lotIds.add(l.id);
      importLots[island].push({id:l.id as string,shipmentId:l.shipmentId as string,
        sourceIslandId:l.sourceIslandId as string,destinationIslandId:island,
        itemId:l.itemId as string,quantity:l.quantity as number});
    }
  }
  if(!Array.isArray(raw.purchases)||raw.purchases.length>MAX_PURCHASES)
    throw Error('Achats importés invalides');
  const purchaseIds=new Set<string>(),purchases:CargoPurchase[]=[];
  for(const p of raw.purchases){
    if(!obj(p)||!isId(p.requestId)||purchaseIds.has(p.requestId)||
      !isId(p.lotId)||!isId(p.islandId)||!isId(p.itemId)||
      !int(p.quantity,1,99)||!int(p.totalCoins,1,999999))
      throw Error('Historique de ventes importées invalide');
    purchaseIds.add(p.requestId);purchases.push({requestId:p.requestId,lotId:p.lotId as string,
      islandId:p.islandId as string,itemId:p.itemId as string,
      quantity:p.quantity as number,totalCoins:p.totalCoins as number});
  }
  let buyerCheckpoint:CargoBuyerCheckpoint|undefined;
  if(raw.buyerCheckpoint!==undefined){
    const v=raw.buyerCheckpoint;
    if(!obj(v)||!isId(v.islandId)||!identifier(v.worldId)||
      !int(v.revision,1,raw.revision as number)||!obj(v.inventory)||
      Object.keys(v.inventory).length>1000)
      throw Error('Point de reprise d’achat importé invalide');
    const inventory:Record<string,number>={};
    for(const [itemId,qty] of Object.entries(v.inventory)){
      if(!identifier(itemId)||!int(qty,0,9999))throw Error('Inventaire de reprise invalide');
      if(qty>0)inventory[itemId]=qty;
    }
    buyerCheckpoint={islandId:v.islandId,worldId:v.worldId,
      revision:v.revision as number,inventory};
  }
  return {schemaVersion:1,revision:raw.revision as number,
    ...(buyerCheckpoint?{buyerCheckpoint}:{}),
    lastObservedMinute:raw.lastObservedMinute as number,
    nextDepartures:{...next} as Record<string,number>,exportReserves:reserves,
    shipments,importLots,purchases};
}

function readPublishedCargoState(raw:unknown):CargoStateV1{
  if(!obj(raw)||!obj(raw.nextDepartures)||
    Object.keys(raw.nextDepartures).length!==ORIGINAL_CARGO_ROUTES.length||
    !ORIGINAL_CARGO_ROUTES.every(route=>Object.hasOwn(raw.nextDepartures as object,route.id)))
    return parseCargoState(raw);
  const state=parseCargoState(raw,ORIGINAL_CARGO_ROUTES);
  for(const route of CARGO_ROUTES){
    if(Object.hasOwn(state.nextDepartures,route.id))continue;
    const elapsed=state.lastObservedMinute-route.firstDepartureMinute;
    const cycles=Math.max(0,Math.floor(elapsed/route.frequencyMinutes)+1);
    state.nextDepartures[route.id]=Math.min(1_000_000_000,route.firstDepartureMinute+cycles*route.frequencyMinutes);
    state.exportReserves[route.fromIslandId]??={...CARGO_INITIAL_RESERVES[route.fromIslandId]};
  }
  state.revision++;
  return parseCargoState(state);
}

type CargoEventChoice={kind:'depart'|'arrive';minute:number;id:string;
  route?:CargoRoute;ship?:CargoShipment};
function nextEvent(state:CargoStateV1,routes:readonly CargoRoute[]):CargoEventChoice|null{
  let choice:CargoEventChoice|null=null;
  const choose=(candidate:CargoEventChoice)=>{
    if(choice===null||candidate.minute<choice.minute||
      candidate.minute===choice.minute&&candidate.id<choice.id)choice=candidate;
  };
  for(const r of routes)choose({kind:'depart',minute:state.nextDepartures[r.id],id:'d:'+r.id,route:r});
  for(const ship of state.shipments)if(ship.status==='in_transit')
    choose({kind:'arrive',minute:ship.arriveMinute,id:'a:'+ship.id,ship});
  // Assignments through a nested closure are not tracked by TS flow analysis.
  return choice as CargoEventChoice|null;
}
/** Process a bounded number of chronological events, with a persisted departure cursor.
 * A long absence is replayed over several calls, never as an unbounded blocking loop.
 * The source export warehouse is debited at dispatch, the arrival lot is credited once.
 */
export function advanceCargo(state:CargoStateV1,gameMinute:number,
  routes:readonly CargoRoute[]=CARGO_ROUTES,maxEvents=24):{events:number;pending:boolean}{
  if(!int(gameMinute,0,1_000_000_000)||!int(maxEvents,1,128))throw Error('Horloge fret invalide');
  if(gameMinute<state.lastObservedMinute)return {events:0,pending:false};
  let events=0,changed=false;
  while(events<maxEvents){
    const e=nextEvent(state,routes);
    if(!e||e.minute>gameMinute)break;
    if(e.kind==='depart'){
      const route=e.route!;
      const goods:CargoGoods[]=[];
      const reserve=state.exportReserves[route.fromIslandId]??{};
      for(const g of route.goods){
        const quantity=Math.min(g.quantity,reserve[g.itemId]??0);
        if(quantity>0)goods.push({itemId:g.itemId,quantity});
      }
      // Consume a timetable occurrence even if exports are exhausted; never invent cargo.
      const next=e.minute+route.frequencyMinutes;
      if(!Number.isSafeInteger(next)||next>1_000_000_000)break;
      state.nextDepartures[route.id]=next;
      if(goods.length&&state.shipments.length<MAX_SHIPMENTS){
        const id=route.id+':'+e.minute;
        if(!state.shipments.some(s=>s.id===id)){
          for(const g of goods)reserve[g.itemId]-=g.quantity;
          const shipment:CargoShipment={id,routeId:route.id,
            fromIslandId:route.fromIslandId,toIslandId:route.toIslandId,
            departMinute:e.minute,arriveMinute:e.minute+route.travelMinutes,
            goods,status:'in_transit'};
          state.shipments.push(shipment);
        }
      }
    }else{
      const ship=e.ship!;
      const target=state.importLots[ship.toIslandId]??[];
      // Never drop an arriving shipment when the import stand is saturated.
      if(target.length+ship.goods.length>MAX_LOTS)break;
      for(const good of ship.goods)target.push({id:ship.id+':'+good.itemId,
        shipmentId:ship.id,sourceIslandId:ship.fromIslandId,
        destinationIslandId:ship.toIslandId,itemId:good.itemId,quantity:good.quantity});
      state.importLots[ship.toIslandId]=target;
      ship.status='delivered';
    }
    events++;changed=true;
  }
  if(gameMinute>state.lastObservedMinute)state.lastObservedMinute=gameMinute;
  if(changed)state.revision++;
  const pending=nextEvent(state,routes);
  return {events,pending:!!pending&&pending.minute<=gameMinute};
}
export function importStandView(state:CargoStateV1,islandId:string):ImportStandView{
  if(!isId(islandId))throw Error('Île d’import inconnue');
  const offers=(state.importLots[islandId]??[]).filter(l=>l.quantity>0&&l.sourceIslandId!==islandId)
    .map(l=>({...{lotId:l.id,itemId:l.itemId,originIslandId:l.sourceIslandId,
      shipmentId:l.shipmentId,quantity:l.quantity},unitPrice:importUnitPrice(islandId,l.itemId)}));
  const future=state.shipments.filter(s=>s.toIslandId===islandId&&s.status==='in_transit');
  return {islandId,revision:state.revision,offers,
    inTransit:future.length,nextArrivalMinute:future.length?Math.min(...future.map(s=>s.arriveMinute)):null};
}
export function importUnitPrice(islandId:string,itemId:string):number{
  const prices=marketUnitPrices(islandId,itemId);
  // Freight service is a small explicit markup; imports never undercut local resale quotes.
  return Math.max((prices.sell??0)+1,Math.ceil((prices.buy??(prices.sell??6)*2)*1.15));
}

/** The player can buy exactly the received quantity, but cannot "sell" directly to the
 * import-only stand. One ledger snapshot persists all remaining lots and purchase IDs.
 */
export function buyCargoLot(state:CargoStateV1,args:{islandId:string;lotId:string;
  quantity:number;requestId:string;expectedRevision?:number},purse:Purse,
  itemName:(id:string)=>string=(id)=>id):CargoResult{
  if(!isId(args.islandId)||!isId(args.lotId)||!isId(args.requestId)||
    !int(args.quantity,1,99)||state.purchases.length>=MAX_PURCHASES||
    state.purchases.some(p=>p.requestId===args.requestId))
    return {ok:false,reason:'Demande d’import invalide ou déjà traitée'};
  if(args.expectedRevision!==undefined&&state.revision!==args.expectedRevision)
    return {ok:false,reason:'Stock d’import modifié, veuillez actualiser'};
  const lot=state.importLots[args.islandId]?.find(l=>l.id===args.lotId);
  if(!lot||lot.sourceIslandId===args.islandId||lot.quantity<args.quantity)
    return {ok:false,reason:'Ce lot importé est indisponible'};
  const cost=importUnitPrice(args.islandId,lot.itemId)*args.quantity;
  if(!Number.isSafeInteger(cost)||cost>999999)return {ok:false,reason:'Prix invalide'};
  if(purse.count(COIN)<cost)return {ok:false,reason:'Pièces insuffisantes'};
  if(purse.count(lot.itemId)+args.quantity>purse.max(lot.itemId))
    return {ok:false,reason:'Sac plein'};
  if(!purse.apply([{itemId:COIN,quantity:-cost},{itemId:lot.itemId,quantity:args.quantity}]))
    return {ok:false,reason:'Transaction refusée'};
  lot.quantity-=args.quantity;
  state.purchases.push({requestId:args.requestId,lotId:lot.id,islandId:args.islandId,
    itemId:lot.itemId,quantity:args.quantity,totalCoins:cost});
  state.revision++;
  return {ok:true,revision:state.revision,message:'Importé : '+args.quantity+' × '+itemName(lot.itemId)+' (−'+cost+' pièces)'};
}

export interface CargoStorage {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
}
/** Explicit single-record commit. The service never silently resets a corrupted ledger.
 * All economic state and purchases are local to this browser/profile (Pages solo).
 */
export function createCargoService(storage:CargoStorage,args:{
  islandId:string;gameMinute():number;purse:Purse;itemName(id:string):string;
  onChange?():void;routes?:readonly CargoRoute[];
  /** The current gameplay inventory, captured inside the same localStorage commit. */
  worldId?:string;inventory?():Readonly<Record<string,number>>;
}){
  const routes=args.routes??CARGO_ROUTES;
  if(!isId(args.islandId))throw Error('Île de fret invalide');
  validateCargoRoutes(routes);
  const raw=storage.getItem(CARGO_STORAGE_KEY);
  const decoded=raw===null?null:JSON.parse(raw);
  let state=raw===null?newCargoState(routes):args.routes===undefined?readPublishedCargoState(decoded):parseCargoState(decoded,routes);
  if(raw!==null&&state.revision!==decoded?.revision)storage.setItem(CARGO_STORAGE_KEY,JSON.stringify(state));
  function advance(){
    const candidate=structuredClone(state);
    const result=advanceCargo(candidate,args.gameMinute(),routes);
    if(candidate.revision!==state.revision){
      storage.setItem(CARGO_STORAGE_KEY,JSON.stringify(candidate));
      state=candidate;args.onChange?.();
    }else state=candidate;
    return result;
  }
  function buy(lotId:string,quantity:number,expectedRevision?:number,requestId='import-'+crypto.randomUUID()):CargoResult{
    advance();
    const candidate=structuredClone(state);
    const before=candidate.importLots[args.islandId]?.find(l=>l.id===lotId);
    const itemId=before?.itemId??'';
    const cost=before?importUnitPrice(args.islandId,itemId)*quantity:0;
    const result=buyCargoLot(candidate,{islandId:args.islandId,lotId,quantity,requestId,expectedRevision},
      args.purse,args.itemName);
    if(!result.ok)return result;
    try{
      if(args.inventory&&args.worldId){
        candidate.buyerCheckpoint={
          islandId:args.islandId,worldId:args.worldId,
          revision:candidate.revision,inventory:{...args.inventory()},
        };
      }
      // Reject an invalid recovery snapshot before committing payment and cargo together.
      parseCargoState(candidate,routes);
      storage.setItem(CARGO_STORAGE_KEY,JSON.stringify(candidate));
    }catch(error){
      // The ledger was not committed, so restore the existing player's inventory as well.
      if(!args.purse.apply([{itemId:COIN,quantity:cost},{itemId,quantity:-quantity}]))
        throw Error('Restauration d’import impossible : '+String(error));
      return {ok:false,reason:'Stockage du commerce indisponible : achat annulé'};
    }
    state=candidate;args.onChange?.();
    return result;
  }
  return {view:()=>{advance();return importStandView(state,args.islandId);},
    buy,advance,serialize:()=>parseCargoState(state,routes),
    buyerCheckpoint:()=>state.buyerCheckpoint?structuredClone(state.buyerCheckpoint):null};
}
