/** Adapter for the first playable workshop services at existing settlement counters.
 * Pure deterministic gameplay data: the counter entity owns station instances, while the
 * inventory authority remains the gameplay runtime. No new WebGL or network simulation.
 */
import {worldGameMinute} from '../archipelago/ferry-schedule.ts';
import type {ShopKind,Purse} from '../gameplay/economy.ts';
import type {ItemDefinition} from '../gameplay/schema.ts';
import {STARTER_RECIPES} from './starter-catalog.ts';
import {advanceWorkshop,collectProduction,newWorkshopState,parseProductionRecipe,
  parseWorkshopState,startProduction,type ProductionJobV1,type ProductionRecipeV1,
  type WorkshopStateV1} from './production.ts';

export interface WorkshopServiceView {
  stationId:string;
  stationType:string;
  title:string;
  recipes:ProductionRecipeV1[];
  jobs:ProductionJobV1[];
  gameMinute:number;
}
export type WorkshopActionResult={ok:true;message:string}|{ok:false;reason:string};

/** Prototype: adapt already-authored counters, before dedicated Studio station prefabs. */
export const COUNTER_WORKSHOPS:Record<ShopKind,readonly {type:string;title:string}[]>={
  mine:[{type:'smelter',title:'Fonderie'},{type:'smithy',title:'Forge'},{type:'stonecutter',title:'Tailleur de pierre'}],
  forest:[{type:'sawmill',title:'Scierie'},{type:'carpenter',title:'Menuiserie'}],
  port:[{type:'basketry',title:'Vannerie'}],
  market:[{type:'mill',title:'Moulin'},{type:'bakery',title:'Boulangerie'}],
  farm:[{type:'mill',title:'Moulin'}],
  inn:[{type:'kitchen',title:'Cuisine'},{type:'bakery',title:'Boulangerie'}],
};

export function workshopStationId(counterId:string,stationType:string):string{
  if(!counterId||counterId.length>128||/[\u0000-\u001f]/.test(counterId))throw Error('Comptoir invalide');
  if(!/^[a-z0-9-]{1,32}$/.test(stationType))throw Error('Type d’atelier invalide');
  // Stable across refreshes, no long entity IDs in the persisted job IDs.
  let hash=2166136261;
  for(const char of counterId){hash=Math.imul(hash^char.charCodeAt(0),16777619);}
  return 'station:'+((hash>>>0).toString(36))+':'+stationType;
}

export interface WorkshopControllerDeps{
  items:readonly ItemDefinition[];
  purse:Purse;
  elapsedSeconds():number;
  dayLengthSeconds:number;
  onChange():void;
  /** Quest integration: only after native successful, idempotent production collection. */
  onCollected?:(stationId:string,job:ProductionJobV1)=>void;
}
/** State is strictly local to a published world; save/restore by that world's save slot.
 * Workshop evaluation occurs only when requested or a whole game minute passes.
 */
export function createShopWorkshops(deps:WorkshopControllerDeps){
  const knownItems=new Set(deps.items.map(x=>x.id));
  const recipes=STARTER_RECIPES.filter(r=>
    [...r.inputs,...r.outputs].every(i=>knownItems.has(i.itemId))
  ).map(r=>parseProductionRecipe(r,knownItems));
  const byRecipe=new Map(recipes.map(r=>[r.recipeId,r]));
  const states=new Map<string,WorkshopStateV1>();
  const now=()=>worldGameMinute(deps.elapsedSeconds(),deps.dayLengthSeconds);
  let lastChecked=-1;

  const stations=(kind:ShopKind,counterId:string)=>
    COUNTER_WORKSHOPS[kind].map(s=>({...s,stationId:workshopStationId(counterId,s.type)}));

  function advanceDue(gameMinute=now()):number {
    if(gameMinute===lastChecked)return 0;
    lastChecked=gameMinute;
    let changed=0;
    for(const state of states.values())changed+=advanceWorkshop(state,Math.max(state.lastGameMinute,gameMinute));
    if(changed)deps.onChange();
    return changed;
  }

  function list(kind:ShopKind,counterId:string):WorkshopServiceView[]{
    const gameMinute=now();
    advanceDue(gameMinute);
    return stations(kind,counterId).map(s=>({
      stationId:s.stationId,stationType:s.type,title:s.title,gameMinute,
      recipes:recipes.filter(r=>r.stationType===s.type),
      jobs:(states.get(s.stationId)?.jobs??[]).filter(j=>j.status!=='collected').map(j=>structuredClone(j)),
    })).filter(s=>s.recipes.length||s.jobs.length);
  }

  function start(kind:ShopKind,counterId:string,recipeId:string,batches:number,requestId?:string):WorkshopActionResult{
    const recipe=byRecipe.get(recipeId);
    if(!recipe)return {ok:false,reason:'Recette indisponible dans ce monde'};
    const station=stations(kind,counterId).find(s=>s.type===recipe.stationType);
    if(!station)return {ok:false,reason:'Ce comptoir ne propose pas cet atelier'};
    const prior=states.get(station.stationId);
    const state=prior??newWorkshopState(station.stationId,station.type);
    const result=startProduction(state,recipe,{requestId:requestId??'craft-'+crypto.randomUUID(),
      ownerId:'solo-player',batches,gameMinute:Math.max(state.lastGameMinute,now()),queueCapacity:3},deps.purse);
    if(!result.ok)return result;
    states.set(station.stationId,state);
    deps.onChange();
    return {ok:true,message:'Fabrication lancée : '+result.job.outputs.map(x=>
      x.quantity+' × '+(deps.items.find(i=>i.id===x.itemId)?.name??x.itemId)).join(', ')};
  }

  function collect(kind:ShopKind,counterId:string,jobId:string,requestId?:string):WorkshopActionResult{
    const station=stations(kind,counterId).find(s=>jobId.startsWith(s.stationId+':'));
    if(!station)return {ok:false,reason:'Fabrication d’un autre comptoir'};
    const state=states.get(station.stationId);
    if(!state)return {ok:false,reason:'Fabrication inconnue'};
    const result=collectProduction(state,{jobId,requestId:requestId??'take-'+crypto.randomUUID(),
      ownerId:'solo-player',gameMinute:Math.max(state.lastGameMinute,now())},deps.purse);
    if(!result.ok)return result;
    deps.onCollected?.(station.stationId,result.job);
    deps.onChange();
    return {ok:true,message:'Fabrication récupérée : '+result.job.outputs.map(x=>
      x.quantity+' × '+(deps.items.find(i=>i.id===x.itemId)?.name??x.itemId)).join(', ')};
  }

  function serialize():Record<string,WorkshopStateV1>{
    const result:Record<string,WorkshopStateV1>=Object.create(null);
    for(const [id,s] of states)result[id]=parseWorkshopState(s);
    return result;
  }
  function restore(raw:Readonly<Record<string,WorkshopStateV1>>={}):void{
    if(Object.keys(raw).length>128)throw Error('Trop d’ateliers dans la sauvegarde');
    const valid=new Map<string,WorkshopStateV1>();
    for(const [id,value] of Object.entries(raw)){
      const parsed=parseWorkshopState(value);
      if(parsed.stationId!==id||valid.has(id))throw Error('Identité atelier incohérente');
      valid.set(id,parsed);
    }
    states.clear();for(const [id,s] of valid)states.set(id,s);
    lastChecked=-1;
  }
  return {list,start,collect,advanceDue,serialize,restore,get size(){return states.size;}};
}
