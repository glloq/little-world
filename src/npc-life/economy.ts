/** Native NPC workshop economy. Reuses the exact deterministic production
 * transaction engine used by player workshops, but owns a SEPARATE ledger.
 * No infinite resource faucet: raw inputs must be supplied by a verified
 * world/economy producer via receive(). NPC animations never call receive().
 */
import type {LifeJob} from './capabilities.ts';
import type {ResidentRole} from './schedule.ts';
import {residentProfessionalAction} from './profession-actions.ts';
import {newWorkshopState,startProduction,advanceWorkshop,collectProduction,
 parseWorkshopState,parseProductionRecipe,type WorkshopStateV1,
 type ProductionRecipeV1,type ItemAmount} from '../economy/production.ts';

const id=(v:string)=>/^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
const amount=(n:number)=>Number.isSafeInteger(n)&&n>=0&&n<=9999;
export interface NpcWorkshopAccountV1 {
 version:1;residentId:string;workAnchorId:string;role:ResidentRole;
 stock:Record<string,number>;workshop:WorkshopStateV1;
}
export function createNpcWorkshopEconomy(
 residentId:string,role:ResidentRole,job:LifeJob,stationType:string,
 recipes:readonly ProductionRecipeV1[],itemLimits:Readonly<Record<string,number>>,
 initial?:NpcWorkshopAccountV1,
){
 const action=residentProfessionalAction(role,job);
 if(!id(residentId)||!id(stationType)||!action||action.service!=='workshop')
  throw Error('Économie PNJ : poste professionnel non qualifié');
 const supported=recipes.map(r=>parseProductionRecipe(r)).filter(r=>r.stationType===stationType);
 if(!supported.length)throw Error('Économie PNJ : aucun atelier natif compatible');
 const stationId='npc:'+residentId+':'+stationType;
 if(!id(stationId))throw Error('Économie PNJ : station invalide');
 let stock:Record<string,number>=Object.create(null);
 let workshop=newWorkshopState(stationId,stationType);
 const limits=new Map(Object.entries(itemLimits));
 const supportedItems=new Set(supported.flatMap(r=>[...r.inputs,...r.outputs].map(v=>v.itemId)));
 const apply=(changes:ItemAmount[]):boolean=>{
  const next={...stock};
  for(const change of changes){
   const max=limits.get(change.itemId);
   if(!supportedItems.has(change.itemId)||!amount(max??-1)||!Number.isSafeInteger(change.quantity))return false;
   const value=(next[change.itemId]??0)+change.quantity;
   if(!amount(value)||value>max!)return false;
   next[change.itemId]=value;
  }
  stock=next;
  return true;
 };
 const parse=(raw:NpcWorkshopAccountV1)=>{
  if(raw.version!==1||raw.residentId!==residentId||raw.workAnchorId!==job.sourceId||
    raw.role!==role||!raw.stock||typeof raw.stock!=='object'||Array.isArray(raw.stock)||
    Object.keys(raw.stock).length>64)throw Error('Économie PNJ : sauvegarde incompatible');
  const next:Record<string,number>=Object.create(null);
  for(const [itemId,quantity]of Object.entries(raw.stock)){
   if(!supportedItems.has(itemId)||!amount(quantity)||quantity>(limits.get(itemId)??-1))
    throw Error('Économie PNJ : inventaire invalide');
   next[itemId]=quantity;
  }
  const state=parseWorkshopState(raw.workshop);
  if(state.stationId!==stationId||state.stationType!==stationType||
    state.jobs.some(j=>j.ownerId!==residentId||!supported.some(r=>r.recipeId===j.recipeId)))
   throw Error('Économie PNJ : atelier sans provenance');
  return {stock:next,workshop:state};
 };
 if(initial){const restored=parse(initial);stock=restored.stock;workshop=restored.workshop;}
 return {
  get residentId(){return residentId;},
  get workAnchorId(){return job.sourceId;},
  inventory(){return {...stock};},
  jobs(){return workshop.jobs.map(j=>structuredClone(j));},
  /** Authoritative upstream producer supplies goods to a grounded NPC source.
   * The caller MUST verify the upstream harvest/delivery transaction. */
  receive(itemId:string,quantity:number):boolean{
   if(!id(itemId)||!Number.isSafeInteger(quantity)||quantity<=0)return false;
   return apply([{itemId,quantity}]);
  },
  start(recipeId:string,batches:number,gameMinute:number,requestId:string){
   const recipe=supported.find(r=>r.recipeId===recipeId);
   if(!recipe)return {ok:false as const,reason:'Recette indisponible'};
   return startProduction(workshop,recipe,{requestId,ownerId:residentId,batches,
    gameMinute,queueCapacity:3},{apply});
  },
  advance(gameMinute:number){return advanceWorkshop(workshop,gameMinute);},
  collect(jobId:string,gameMinute:number,requestId:string){
   return collectProduction(workshop,{jobId,ownerId:residentId,
    gameMinute,requestId},{apply});
  },
  save():NpcWorkshopAccountV1{return {version:1,residentId,
    workAnchorId:job.sourceId,role,stock:{...stock},workshop:parseWorkshopState(workshop)};},
 };
}
