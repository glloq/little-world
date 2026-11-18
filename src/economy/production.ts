/** Deterministic workshop production V1. No Three.js, DOM, timers, storage or network.
 * Work is advanced by canonical game minutes on action/reload, not each animation frame.
 * A single authoritative caller owns both the workshop and inventory transaction.
 */
export interface ItemAmount {itemId:string;quantity:number}
export interface ProductionRecipeV1 {
  recipeId:string;version:number;stationType:string;
  inputs:ItemAmount[];outputs:ItemAmount[];
  durationGameMinutes:number;serviceFeeCoins:number;
}
export type JobStatus='queued'|'running'|'ready'|'collected';
export interface ProductionJobV1 {
  jobId:string;requestId:string;ownerId:string;recipeId:string;recipeVersion:number;
  batches:number;startsAtGameMinute:number;finishesAtGameMinute:number;
  outputs:ItemAmount[];status:JobStatus;
}
export interface WorkshopStateV1 {
  schemaVersion:1;stationId:string;stationType:string;
  revision:number;lastGameMinute:number;
  jobs:ProductionJobV1[];
  appliedRequestIds:string[];
}
export interface InventoryPort {apply(changes:ItemAmount[]):boolean}
export type ProductionResult =
  |{ok:true;job:ProductionJobV1;revision:number}
  |{ok:false;reason:string};

const ID=/^[a-zA-Z0-9:._-]{1,100}$/;
const validInt=(v:unknown,min:number,max:number):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const validId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const assert=(v:unknown,msg:string):void=>{if(!v)throw Error(msg);};

function parseAmounts(raw:unknown,label:string):ItemAmount[] {
  assert(Array.isArray(raw)&&raw.length>=1&&raw.length<=12,label+' : liste invalide');
  const seen=new Set<string>();
  return (raw as unknown[]).map(value=>{
    assert(record(value)&&validId(value.itemId)&&validInt(value.quantity,1,9999),label+' : quantité ou objet invalide');
    const item=value as unknown as ItemAmount;
    assert(!seen.has(item.itemId),label+' : objet dupliqué '+item.itemId);
    seen.add(item.itemId);
    return {itemId:item.itemId,quantity:item.quantity};
  });
}

/** Treat recipe data as untrusted: authoring/compiled assets must validate before use. */
export function parseProductionRecipe(raw:unknown,knownItemIds?:ReadonlySet<string>):ProductionRecipeV1 {
  assert(record(raw),'Recette invalide');
  const v=raw as Record<string,unknown>;
  assert(validId(v.recipeId)&&validInt(v.version,1,1000000)&&validId(v.stationType)&&
    validInt(v.durationGameMinutes,0,1_000_000)&&validInt(v.serviceFeeCoins,0,1_000_000),'Identité ou coût de recette invalide');
  const inputs=parseAmounts(v.inputs,'Ingrédients'),outputs=parseAmounts(v.outputs,'Produits');
  if(knownItemIds){
    for(const amount of [...inputs,...outputs])assert(knownItemIds.has(amount.itemId),'Objet de recette absent : '+amount.itemId);
  }
  const overlap=new Set(inputs.map(x=>x.itemId));
  for(const out of outputs)assert(!overlap.has(out.itemId),'Transformation directe du même objet non supportée');
  assert(v.serviceFeeCoins!==0||inputs.length>0,'Production gratuite et sans ingrédients');
  return {recipeId:v.recipeId as string,version:v.version as number,stationType:v.stationType as string,
    inputs,outputs,durationGameMinutes:v.durationGameMinutes as number,serviceFeeCoins:v.serviceFeeCoins as number};
}

export function newWorkshopState(stationId:string,stationType:string):WorkshopStateV1 {
  if(!validId(stationId)||!validId(stationType))throw Error('Atelier invalide');
  return {schemaVersion:1,stationId,stationType,revision:0,lastGameMinute:0,jobs:[],appliedRequestIds:[]};
}

/** Validate persisted state before use. No data-dependent unbounded loops. */
export function parseWorkshopState(raw:unknown):WorkshopStateV1 {
  assert(record(raw)&&raw.schemaVersion===1&&validId(raw.stationId)&&validId(raw.stationType)&&
    validInt(raw.revision,0,1_000_000_000)&&validInt(raw.lastGameMinute,0,1_000_000_000),
    'État atelier invalide');
  const v=raw as unknown as WorkshopStateV1;
  assert(Array.isArray(v.jobs)&&v.jobs.length<=256&&Array.isArray(v.appliedRequestIds)&&
    v.appliedRequestIds.length<=1024&&v.appliedRequestIds.every(validId)&&
    new Set(v.appliedRequestIds).size===v.appliedRequestIds.length,'Historique atelier invalide');
  const jobs=new Set<string>();
  for(const job of v.jobs){
    assert(record(job)&&validId(job.jobId)&&validId(job.requestId)&&validId(job.ownerId)&&validId(job.recipeId)&&
      validInt(job.recipeVersion,1,1_000_000)&&validInt(job.batches,1,99)&&
      validInt(job.startsAtGameMinute,0,1_000_000_000)&&validInt(job.finishesAtGameMinute,job.startsAtGameMinute,1_000_000_000)&&
      ['queued','running','ready','collected'].includes(job.status),'Commande de production invalide');
    parseAmounts(job.outputs,'Sortie atelier');
    assert(!jobs.has(job.jobId),'Job atelier dupliqué');jobs.add(job.jobId);
  }
  return structuredClone(v);
}

/** Only due events change jobs; an unloaded island needs no running JS intervals. */
export function advanceWorkshop(state:WorkshopStateV1,gameMinute:number):number {
  if(!validInt(gameMinute,state.lastGameMinute,1_000_000_000))throw Error('Horloge atelier invalide');
  let changed=0;
  for(const job of state.jobs){
    if(job.status==='collected')continue;
    const next:JobStatus=job.finishesAtGameMinute<=gameMinute?'ready':
      job.startsAtGameMinute<=gameMinute?'running':'queued';
    if(job.status!==next){job.status=next;changed++;}
  }
  state.lastGameMinute=gameMinute;
  if(changed)state.revision++;
  return changed;
}

function allowedRequest(state:WorkshopStateV1,requestId:string):boolean {
  return validId(requestId)&&!state.appliedRequestIds.includes(requestId)&&state.appliedRequestIds.length<1024;
}

/** Debit inputs + fee exactly once and enqueue a version-pinned result.
 * Caller must serialize commands per workshop. apply() validates all inventory changes atomically.
 */
export function startProduction(state:WorkshopStateV1,recipe:ProductionRecipeV1,args:{
  requestId:string;ownerId:string;batches:number;gameMinute:number;queueCapacity:number;
},inventory:InventoryPort):ProductionResult {
  const r=parseProductionRecipe(recipe);
  if(state.stationType!==r.stationType)return {ok:false,reason:'Atelier incompatible'};
  if(!allowedRequest(state,args.requestId))return {ok:false,reason:'Demande déjà traitée ou journal saturé'};
  if(!validId(args.ownerId)||!validInt(args.batches,1,99)||!validInt(args.queueCapacity,1,32)||
    !validInt(args.gameMinute,state.lastGameMinute,1_000_000_000))return {ok:false,reason:'Paramètres de fabrication invalides'};
  // Bound the entire state instead of silently evicting historical jobs/IDs.
  if(state.jobs.length>=256)return {ok:false,reason:'Journal des fabrications saturé'};
  advanceWorkshop(state,args.gameMinute);
  const pending=state.jobs.filter(j=>j.status==='queued'||j.status==='running');
  if(pending.length>=args.queueCapacity)return {ok:false,reason:'File atelier pleine'};
  const startsAt=Math.max(args.gameMinute,...pending.map(j=>j.finishesAtGameMinute));
  const finishesAt=startsAt+r.durationGameMinutes*args.batches;
  const fee=r.serviceFeeCoins*args.batches;
  if(!Number.isSafeInteger(finishesAt)||finishesAt>1_000_000_000||!Number.isSafeInteger(fee))return {ok:false,reason:'Durée ou coût trop élevé'};
  const debit=r.inputs.map(x=>({itemId:x.itemId,quantity:-x.quantity*args.batches}));
  if(fee)debit.push({itemId:'coin',quantity:-fee});
  const outputs=r.outputs.map(x=>({itemId:x.itemId,quantity:x.quantity*args.batches}));
  if(!debit.every(x=>Number.isSafeInteger(x.quantity))||!outputs.every(x=>Number.isSafeInteger(x.quantity)&&x.quantity<=9999))
    return {ok:false,reason:'Quantité trop élevée'};
  if(!inventory.apply(debit))return {ok:false,reason:'Ingrédients ou frais insuffisants'};
  const job:ProductionJobV1={
    jobId:state.stationId+':'+args.requestId,requestId:args.requestId,ownerId:args.ownerId,
    recipeId:r.recipeId,recipeVersion:r.version,batches:args.batches,
    startsAtGameMinute:startsAt,finishesAtGameMinute:finishesAt,outputs,
    status:finishesAt<=args.gameMinute?'ready':startsAt<=args.gameMinute?'running':'queued',
  };
  state.jobs.push(job);state.appliedRequestIds.push(args.requestId);state.revision++;
  return {ok:true,job:structuredClone(job),revision:state.revision};
}

/** Outputs stay in the workshop until explicitly collected; a full bag loses nothing. */
export function collectProduction(state:WorkshopStateV1,args:{
  jobId:string;requestId:string;ownerId:string;gameMinute:number;
},inventory:InventoryPort):ProductionResult {
  if(!allowedRequest(state,args.requestId)||!validId(args.jobId)||!validId(args.ownerId)||
    !validInt(args.gameMinute,state.lastGameMinute,1_000_000_000))
    return {ok:false,reason:'Demande invalide ou déjà traitée'};
  advanceWorkshop(state,args.gameMinute);
  const job=state.jobs.find(j=>j.jobId===args.jobId);
  if(!job||job.ownerId!==args.ownerId||job.status!=='ready')
    return {ok:false,reason:'Fabrication introuvable ou non prête'};
  if(!inventory.apply(job.outputs))return {ok:false,reason:'Sac plein pour la fabrication'};
  job.status='collected';state.appliedRequestIds.push(args.requestId);state.revision++;
  return {ok:true,job:structuredClone(job),revision:state.revision};
}
