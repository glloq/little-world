/** F09-A — bounded authoritative raw-material ledgers for NPC harvests.
 * A caller must have a successful native source transaction before recording
 * its receipt. No role or animation automatically grants an item.
 */
export type HarvestRole='farmer'|'fisher'|'woodcutter';
export interface NpcHarvestAccountV1{
 version:1;residentId:string;sourceId:string;role:HarvestRole;
 stock:Record<string,number>;lastActionGameMinute:number;appliedRequestIds:string[];
}
const validId=(s:unknown):s is string=>typeof s==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(s);
const safe=(n:unknown,min:number,max:number)=>Number.isSafeInteger(n)&&(n as number)>=min&&(n as number)<=max;
export function parseNpcHarvestAccount(raw:unknown):NpcHarvestAccountV1{
 const a=raw as NpcHarvestAccountV1;
 if(!a||typeof a!=='object'||Array.isArray(a)||a.version!==1||
  !validId(a.residentId)||!validId(a.sourceId)||
  !['farmer','fisher','woodcutter'].includes(a.role)||
  !safe(a.lastActionGameMinute,0,1000000000)||
  !a.stock||typeof a.stock!=='object'||Array.isArray(a.stock)||
  Object.keys(a.stock).length>32||
  !Array.isArray(a.appliedRequestIds)||a.appliedRequestIds.length>64||
  a.appliedRequestIds.some(id=>!validId(id))||
  new Set(a.appliedRequestIds).size!==a.appliedRequestIds.length)
  throw Error('Compte de récolte PNJ invalide');
 for(const [id,qty]of Object.entries(a.stock))
  if(!validId(id)||!safe(qty,0,9999))throw Error('Stock de récolte PNJ invalide');
 return structuredClone(a);
}
export function createNpcHarvestAccount(
 residentId:string,sourceId:string,role:HarvestRole,
 limits:Readonly<Record<string,number>>,initial?:NpcHarvestAccountV1,
){
 if(!validId(residentId)||!validId(sourceId)||!['farmer','fisher','woodcutter'].includes(role))
  throw Error('Récolteur PNJ invalide');
 let state:NpcHarvestAccountV1={version:1,residentId,sourceId,role,
  stock:{},lastActionGameMinute:0,appliedRequestIds:[]};
 if(initial){
  const prior=parseNpcHarvestAccount(initial);
  if(prior.residentId!==residentId||prior.sourceId!==sourceId||prior.role!==role)
   throw Error('Récolteur déplacé : source incompatible');
  state=prior;
 }
 const limit=(itemId:string)=>limits[itemId]??0;
 for(const [item,quantity]of Object.entries(state.stock))
  if(!safe(limit(item),1,9999)||quantity>limit(item))throw Error('Stock hors capacité');
 const canReceive=(itemId:string,quantity:number)=>validId(itemId)&&safe(quantity,1,9999)&&
  safe(limit(itemId),1,9999)&&(state.stock[itemId]??0)+quantity<=limit(itemId);
 const canTake=(itemId:string,quantity:number)=>validId(itemId)&&safe(quantity,1,9999)&&
  (state.stock[itemId]??0)>=quantity;
 return {
  get residentId(){return residentId;},get sourceId(){return sourceId;},get role(){return role;},
  canReceive,canTake,
  hasRequest:(requestId:string)=>state.appliedRequestIds.includes(requestId),
  /** Called only inside a source's successful native harvest/landed catch transaction. */
  commitHarvest(requestId:string,itemId:string,quantity:number,gameMinute:number):boolean{
   if(!validId(requestId)||!safe(gameMinute,0,1000000000)||
     state.appliedRequestIds.includes(requestId)||gameMinute<state.lastActionGameMinute||
     !canReceive(itemId,quantity))return false;
   state.stock[itemId]=(state.stock[itemId]??0)+quantity;
   state.lastActionGameMinute=gameMinute;
   state.appliedRequestIds.push(requestId);
   if(state.appliedRequestIds.length>64)state.appliedRequestIds.shift();
   return true;
  },
  take(itemId:string,quantity:number):boolean{
   if(!canTake(itemId,quantity))return false;
   state.stock[itemId]-=quantity;return true;
  },
  /** Atomic sale against a native market: remove goods, add actual market
   * coins, and record the receipt in one isolated ledger mutation.
   */
  exchange(requestId:string,itemId:string,quantity:number,coinAmount:number,gameMinute:number):boolean{
   if(!validId(requestId)||!safe(gameMinute,0,1000000000)||
     gameMinute<state.lastActionGameMinute||state.appliedRequestIds.includes(requestId)||
     !canTake(itemId,quantity)||!canReceive('coin',coinAmount)||itemId==='coin')
    return false;
   state.stock[itemId]-=quantity;
   state.stock.coin=(state.stock.coin??0)+coinAmount;
   state.lastActionGameMinute=gameMinute;
   state.appliedRequestIds.push(requestId);
   if(state.appliedRequestIds.length>64)state.appliedRequestIds.shift();
   return true;
  },
  /** For native inter-resident transfers: source debit is rolled back on
   * a rejected destination; no visible intermediate frame or credit. */
  transfer(itemId:string,quantity:number,destination:{
    canReceive(itemId:string,quantity:number):boolean;
    commitHarvest(requestId:string,itemId:string,quantity:number,gameMinute:number):boolean;
  },requestId:string,gameMinute:number):boolean{
   if(!canTake(itemId,quantity)||!destination.canReceive(itemId,quantity))return false;
   if(!destination.commitHarvest(requestId,itemId,quantity,gameMinute))return false;
   state.stock[itemId]-=quantity;return true;
  },
  inventory(){return {...state.stock};},
  save(){return parseNpcHarvestAccount(state);},
 };
}
