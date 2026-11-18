/** ECO-6: deterministic, local-only island markets. One counter owns its physical stock,
 * spending budget and immutable list of transaction IDs. No renderer, network or timers.
 * Currency and goods are always changed together through the existing inventory authority.
 */
import {COIN,SHOPS,priceOf,type Purse,type ShopKind} from '../gameplay/economy.ts';
import {identifier} from '../gameplay/schema.ts';

export interface MarketStateV1 {
  schemaVersion:1;
  shopId:string;
  islandId:string;
  shopKind:ShopKind;
  revision:number;
  cashCoins:number;
  stock:Record<string,number>;
  lastRestockGameMinute:number;
  appliedRequestIds:string[];
}
export interface MarketOffer {
  itemId:string;
  unitPrice:number;
  available:number;
}
export interface MarketView {
  shopId:string;islandId:string;shopKind:ShopKind;revision:number;
  cashCoins:number;buy:MarketOffer[];sell:MarketOffer[];
}
export interface MarketSaleLine {itemId:string;quantity:number}
export interface MarketSellBatchRequest {
 shopId:string;shopKind:ShopKind;islandId:string;
 lines:readonly MarketSaleLine[];requestId:string;expectedRevision?:number;
}
export type MarketTradeResult=
  |{ok:true;message:string;changes:{itemId:string;quantity:number}[];revision:number}
  |{ok:false;reason:string};
export interface MarketPurchase {
  shopId:string;shopKind:ShopKind;islandId:string;
  itemId:string;quantity:number;mode:'buy'|'sell';requestId:string;
  expectedRevision?:number;
}

const TRADE_REQUEST_HISTORY_LIMIT=2048;
const MAX_STOCK=9999;
const MAX_CASH=99_999;
const SHOP_KINDS=new Set<ShopKind>(Object.keys(SHOPS) as ShopKind[]);
const ints=(n:unknown,min:number,max:number):n is number=>
  typeof n==='number'&&Number.isSafeInteger(n)&&n>=min&&n<=max;
const id=(n:unknown):n is string=>typeof n==='string'&&identifier(n);
const dict=(n:unknown):n is Record<string,unknown>=>!!n&&typeof n==='object'&&!Array.isArray(n);

/** Seed prices for crafted products until Studio supplies versioned economic profiles.
 * All prices are in in-game coins. Buy = price offered by merchant to player.
 */
export const CRAFT_PRICES:Readonly<Record<string,{buy:number;sell:number}>>={
  'material:flour':{buy:11,sell:5},
  'food:bread':{buy:22,sell:11},
  'food:jam':{buy:24,sell:12},
  'food:soup':{buy:32,sell:16},
  'material:stone-block':{buy:10,sell:5},
  'material:iron-ingot':{buy:56,sell:27},
  'material:reed-fibre':{buy:8,sell:3},
  'item:reed-basket':{buy:20,sell:9},
  'material:plank':{buy:12,sell:6},
  'item:wooden-crate':{buy:38,sell:17},
};
/** Shop categories that trade crafted products. Their base stock remains independent
 * of workshops: a shop never magically receives the player's finished job.
 */
export const MARKET_CRAFT_OFFERS:Readonly<Record<ShopKind,{sells:readonly string[];buys:readonly string[]}>>={
  mine:{sells:['material:stone-block'],buys:['material:stone-block','material:iron-ingot']},
  forest:{sells:['material:plank'],buys:['material:plank','item:wooden-crate']},
  port:{sells:['item:reed-basket'],buys:['material:reed-fibre','item:reed-basket','item:wooden-crate']},
  market:{sells:['material:flour','food:bread'],buys:[
    'material:flour','food:bread','food:jam','food:soup','material:stone-block',
    'material:iron-ingot','material:reed-fibre','item:reed-basket','material:plank','item:wooden-crate',
  ]},
  farm:{sells:[],buys:['material:flour']},
  inn:{sells:['food:bread'],buys:['food:bread','food:jam','food:soup']},
};

/** Prices vary by demand/specialisation, not by per-frame oscillation.
 * These two authored island profiles are demonstrations, not a substitute for ECO-9 Studio.
 */
const ISLAND_ITEM_FACTORS:Readonly<Record<string,Readonly<Record<string,number>>>>={
  'forest-valley':{
    'wood:log':0.65,'material:plank':0.55,'item:wooden-crate':0.75,
    'food:bread':1.35,'material:iron-ingot':1.50,'material:stone-block':1.30,
  },
  'volcano-island':{
    'material:plank':1.80,'item:wooden-crate':1.60,
    'material:iron-ingot':0.85,'material:stone-block':0.70,
    'food:bread':1.40,'material:flour':1.25,
  },
};

export function marketCatalog(kind:ShopKind):{sells:string[];buys:string[]} {
  const base=SHOPS[kind],craft=MARKET_CRAFT_OFFERS[kind];
  return {sells:[...new Set([...base.sells,...craft.sells])],
    buys:[...new Set([...base.buys,...craft.buys])]};
}
export function marketUnitPrices(islandId:string,itemId:string):{buy?:number;sell?:number} {
  const base=CRAFT_PRICES[itemId]??priceOf(itemId);
  const multiplier=ISLAND_ITEM_FACTORS[islandId]?.[itemId]??1;
  const sell=base.sell===undefined?undefined:Math.max(1,Math.round(base.sell*multiplier));
  const buy=base.buy===undefined?undefined:Math.max((sell??0)+1,Math.round(base.buy*multiplier));
  return {buy,sell};
}
/** Stocks are bounded and intentionally finite. A small declared daily local-production
 * refill happens only for items this counter actually sells (no fabricated imports).
 */
export function marketInitialStock(kind:ShopKind):Record<string,number>{
  const stock:Record<string,number>=Object.create(null);
  for(const itemId of marketCatalog(kind).sells)
    stock[itemId]=itemId.startsWith('tool:')?2:itemId.startsWith('seed:')?16:6;
  return stock;
}
export function newMarketState(shopId:string,islandId:string,shopKind:ShopKind,minute=0):MarketStateV1 {
  if(!id(shopId)||!id(islandId)||!SHOP_KINDS.has(shopKind)||!ints(minute,0,1_000_000_000))
    throw Error('Identité de comptoir invalide');
  return {schemaVersion:1,shopId,islandId,shopKind,revision:0,
    cashCoins:2000,stock:marketInitialStock(shopKind),lastRestockGameMinute:minute,appliedRequestIds:[]};
}
export function parseMarketState(raw:unknown):MarketStateV1{
  if(!dict(raw)||raw.schemaVersion!==1||!id(raw.shopId)||!id(raw.islandId)||
    !SHOP_KINDS.has(raw.shopKind as ShopKind)||!ints(raw.revision,0,1_000_000_000)||
    !ints(raw.cashCoins,0,MAX_CASH)||!ints(raw.lastRestockGameMinute,0,1_000_000_000))
    throw Error('Sauvegarde de marché invalide');
  if(!dict(raw.stock)||Object.keys(raw.stock).length>150)throw Error('Stock marchand invalide');
  for(const [itemId,quantity] of Object.entries(raw.stock)){
    if(!id(itemId)||!ints(quantity,0,MAX_STOCK))throw Error('Produit ou quantité de stock invalide');
  }
  if(!Array.isArray(raw.appliedRequestIds)||raw.appliedRequestIds.length>TRADE_REQUEST_HISTORY_LIMIT||
    !raw.appliedRequestIds.every(id)||new Set(raw.appliedRequestIds).size!==raw.appliedRequestIds.length)
    throw Error('Journal de commerce invalide');
  return {schemaVersion:1,shopId:raw.shopId,islandId:raw.islandId,
    shopKind:raw.shopKind as ShopKind,revision:raw.revision as number,cashCoins:raw.cashCoins as number,
    stock:{...raw.stock} as Record<string,number>,
    lastRestockGameMinute:raw.lastRestockGameMinute as number,
    appliedRequestIds:[...raw.appliedRequestIds] as string[]};
}
export function advanceMarket(state:MarketStateV1,gameMinute:number):boolean{
  if(!ints(gameMinute,state.lastRestockGameMinute,1_000_000_000))throw Error('Horloge de marché invalide');
  const days=Math.floor((gameMinute-state.lastRestockGameMinute)/1440);
  if(days<=0)return false;
  const producedDays=Math.min(days,14); // bounded catch-up: no per-day loop for long absences.
  const initial=marketInitialStock(state.shopKind);
  for(const [itemId,qty] of Object.entries(initial))
    state.stock[itemId]=Math.min(qty,(state.stock[itemId]??0)+producedDays*(itemId.startsWith('tool:')?1:3));
  state.cashCoins=Math.min(MAX_CASH,state.cashCoins+producedDays*120);
  state.lastRestockGameMinute+=days*1440;
  state.revision++;
  return true;
}
export function marketView(state:MarketStateV1):MarketView{
  const catalog=marketCatalog(state.shopKind);
  const buy=catalog.sells.map(itemId=>({
    itemId,unitPrice:marketUnitPrices(state.islandId,itemId).buy??0,available:state.stock[itemId]??0,
  })).filter(o=>o.unitPrice>0);
  const sell=catalog.buys.map(itemId=>({
    itemId,unitPrice:marketUnitPrices(state.islandId,itemId).sell??0,
    available:Math.min(Math.floor(state.cashCoins/Math.max(1,marketUnitPrices(state.islandId,itemId).sell??1)),
      MAX_STOCK-(state.stock[itemId]??0)),
  })).filter(o=>o.unitPrice>0);
  return {shopId:state.shopId,islandId:state.islandId,shopKind:state.shopKind,
    revision:state.revision,cashCoins:state.cashCoins,buy,sell};
}

/** Fully checked atomic purchase. No partial payment, no stock mutation on rejection.
 * The request ID remains stored in the same save snapshot as inventory and purse.
 */
export function executeMarketTrade(state:MarketStateV1,request:MarketPurchase,purse:Purse,
  name=(itemId:string)=>itemId):MarketTradeResult{
  if(state.shopId!==request.shopId||state.islandId!==request.islandId||state.shopKind!==request.shopKind)
    return {ok:false,reason:'Comptoir différent du devis'};
  if(!id(request.requestId)||state.appliedRequestIds.includes(request.requestId)||
    state.appliedRequestIds.length>=TRADE_REQUEST_HISTORY_LIMIT)
    return {ok:false,reason:'Commande déjà traitée ou journal complet'};
  if(request.expectedRevision!==undefined&&request.expectedRevision!==state.revision)
    return {ok:false,reason:'Prix ou stock modifié, veuillez actualiser'};
  if(!ints(request.quantity,1,99)||!id(request.itemId)||!['buy','sell'].includes(request.mode))
    return {ok:false,reason:'Article ou quantité invalide'};
  const offers=marketCatalog(state.shopKind);
  const buying=request.mode==='buy';
  if(!(buying?offers.sells:offers.buys).includes(request.itemId))
    return {ok:false,reason:'Ce comptoir ne propose pas cette transaction'};
  const unitPrice=marketUnitPrices(state.islandId,request.itemId)[buying?'buy':'sell'];
  if(!unitPrice)return {ok:false,reason:'Prix indisponible'};
  const total=unitPrice*request.quantity;
  if(!Number.isSafeInteger(total)||total<1)return {ok:false,reason:'Montant invalide'};
  let changes:{itemId:string;quantity:number}[];
  if(buying){
    if((state.stock[request.itemId]??0)<request.quantity)return {ok:false,reason:'Stock du comptoir insuffisant'};
    if(purse.count(COIN)<total)return {ok:false,reason:'Pièces insuffisantes'};
    if(purse.count(request.itemId)+request.quantity>purse.max(request.itemId))
      return {ok:false,reason:'Sac plein'};
    if(state.cashCoins+total>MAX_CASH)return {ok:false,reason:'Caisse du comptoir saturée'};
    changes=[{itemId:COIN,quantity:-total},{itemId:request.itemId,quantity:request.quantity}];
  }else{
    if(purse.count(request.itemId)<request.quantity)return {ok:false,reason:'Vous ne possédez pas cette quantité'};
    if(total>state.cashCoins)return {ok:false,reason:'Budget de rachat insuffisant'};
    if(purse.count(COIN)+total>purse.max(COIN))return {ok:false,reason:'Bourse pleine'};
    if((state.stock[request.itemId]??0)+request.quantity>MAX_STOCK)
      return {ok:false,reason:'Réserve du comptoir pleine'};
    changes=[{itemId:request.itemId,quantity:-request.quantity},{itemId:COIN,quantity:total}];
  }
  if(!purse.apply(changes))return {ok:false,reason:'Transaction refusée par l’inventaire'};
  state.cashCoins+=buying?total:-total;
  state.stock[request.itemId]=(state.stock[request.itemId]??0)+(buying?-request.quantity:request.quantity);
  state.appliedRequestIds.push(request.requestId);
  state.revision++;
  return {ok:true,revision:state.revision,changes,
    message:(buying?'Acheté : ':'Vendu : ')+request.quantity+' × '+name(request.itemId)+
      (buying?' (−': ' (+')+total+' pièces)'};
}

/** All-or-nothing sale of several inventory stacks, with one inventory apply and one revision. */
export function executeMarketSellBatch(state:MarketStateV1,request:MarketSellBatchRequest,purse:Purse,
 name=(itemId:string)=>itemId):MarketTradeResult{
 if(state.shopId!==request.shopId||state.shopKind!==request.shopKind||state.islandId!==request.islandId)
   return {ok:false,reason:'Comptoir différent du devis'};
 if(!id(request.requestId)||state.appliedRequestIds.includes(request.requestId)||
    state.appliedRequestIds.length>=TRADE_REQUEST_HISTORY_LIMIT)
   return {ok:false,reason:'Commande déjà traitée ou journal complet'};
 if(request.expectedRevision!==undefined&&request.expectedRevision!==state.revision)
   return {ok:false,reason:'Prix ou stock modifié, veuillez actualiser'};
 if(!Array.isArray(request.lines)||request.lines.length<1||request.lines.length>50)
   return {ok:false,reason:'Sélection de vente invalide'};
 const catalog=new Set(marketCatalog(state.shopKind).buys),seen=new Set<string>();
 let gain=0;
 const changes:{itemId:string;quantity:number}[]=[];
 for(const line of request.lines){
   if(!line||!id(line.itemId)||!ints(line.quantity,1,99)||seen.has(line.itemId)||
     !catalog.has(line.itemId))return {ok:false,reason:'Article ou quantité non accepté'};
   seen.add(line.itemId);
   const unit=marketUnitPrices(state.islandId,line.itemId).sell;
   if(!unit)return {ok:false,reason:'Prix indisponible'};
   if(purse.count(line.itemId)<line.quantity)return {ok:false,reason:'Stock du sac insuffisant'};
   if((state.stock[line.itemId]??0)+line.quantity>MAX_STOCK)
     return {ok:false,reason:'Réserve du comptoir pleine'};
   const subtotal=unit*line.quantity;
   if(!Number.isSafeInteger(subtotal)||!Number.isSafeInteger(gain+subtotal))
     return {ok:false,reason:'Montant invalide'};
   gain+=subtotal;
   changes.push({itemId:line.itemId,quantity:-line.quantity});
 }
 if(gain>state.cashCoins)return {ok:false,reason:'Budget de rachat insuffisant'};
 if(purse.count(COIN)+gain>purse.max(COIN))return {ok:false,reason:'Bourse pleine'};
 changes.push({itemId:COIN,quantity:gain});
 if(!purse.apply(changes))return {ok:false,reason:'Transaction refusée par l’inventaire'};
 state.cashCoins-=gain;
 for(const line of request.lines)state.stock[line.itemId]=(state.stock[line.itemId]??0)+line.quantity;
 state.appliedRequestIds.push(request.requestId);state.revision++;
 return {ok:true,changes,revision:state.revision,
   message:'Vendu : '+request.lines.map(line=>line.quantity+' × '+name(line.itemId)).join(', ')+
     ' (+'+gain+' pièces)'};
}

export interface MarketServiceDeps {
  islandId:string;
  purse:Purse;
  itemName(id:string):string;
  gameMinute():number;
  onChange():void;
}
export function createIslandMarkets(deps:MarketServiceDeps){
  const markets=new Map<string,MarketStateV1>();
  const ensure=(kind:ShopKind,shopId:string)=>{
    let state=markets.get(shopId);
    if(!state){state=newMarketState(shopId,deps.islandId,kind,deps.gameMinute());markets.set(shopId,state);}
    if(state.shopKind!==kind||state.islandId!==deps.islandId)throw Error('Comptoir incohérent');
    advanceMarket(state,Math.max(state.lastRestockGameMinute,deps.gameMinute()));
    return state;
  };
  function trade(kind:ShopKind,shopId:string,itemId:string,quantity:number,mode:'buy'|'sell',
    requestId='market-'+crypto.randomUUID(),expectedRevision?:number):MarketTradeResult{
    const state=ensure(kind,shopId);
    const result=executeMarketTrade(state,{shopId,shopKind:kind,islandId:deps.islandId,
      itemId,quantity,mode,requestId,expectedRevision},deps.purse,deps.itemName);
    if(result.ok)deps.onChange();
    return result;
  }
  function sellBatch(kind:ShopKind,shopId:string,lines:readonly MarketSaleLine[],
    requestId='market-'+crypto.randomUUID(),expectedRevision?:number):MarketTradeResult{
    const state=ensure(kind,shopId);
    const result=executeMarketSellBatch(state,{shopId,shopKind:kind,islandId:deps.islandId,
      lines,requestId,expectedRevision},deps.purse,deps.itemName);
    if(result.ok)deps.onChange();
    return result;
  }
  function serialize():Record<string,MarketStateV1>{
    const saved:Record<string,MarketStateV1>=Object.create(null);
    for(const [shopId,state] of markets)saved[shopId]=parseMarketState(state);
    return saved;
  }
  function restore(raw:Readonly<Record<string,MarketStateV1>>={}):void{
    if(Object.keys(raw).length>128)throw Error('Trop de marchés sauvegardés');
    const restored=new Map<string,MarketStateV1>();
    for(const [shopId,unparsed] of Object.entries(raw)){
      const state=parseMarketState(unparsed);
      if(state.shopId!==shopId||state.islandId!==deps.islandId)throw Error('Marché d’une autre île');
      restored.set(shopId,state);
    }
    markets.clear();for(const [id,state] of restored)markets.set(id,state);
  }
  return {view:(kind:ShopKind,shopId:string)=>marketView(ensure(kind,shopId)),trade,sellBatch,
    serialize,restore,get size(){return markets.size;}};
}
