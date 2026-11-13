/** AGRI-2/3 — deferred, deterministic plot simulation and validated actions.
 * Growth is evaluated only on action, consultation, save/load: never per frame or per plant.
 * Time advances in fixed slices aligned on absolute multiples of SLICE (½ game hour); each
 * slice integrates the exact climate summary of its interval (heat, rain, clear sky), never
 * « current weather × absence ». Actions take effect at the slice boundary before them, so a
 * plot evaluated every second and the same plot evaluated after ten days with the same
 * actions end in bit-identical states. Pure (no Three.js, no storage). */
import type {ClimateHistory} from '../environment/climate.ts';
import {CROPS,FARM_MODEL_VERSION,type FarmSettingsV3} from './farm-data.ts';

export type FarmStage='empty'|'seeded'|'growing'|'mature'|'failed';
export interface FarmCropState {cropId:string;plantedAt:number;progress:number;dryHours:number;stage:FarmStage}
export interface FarmPlotState {plotId:string;revision:number;modelVersion:number;evaluatedAt:number;moisture:number;crop:FarmCropState|null;harvests:number;history:string[];requests:string[];
  /** Reserved for later models (fertility, rotation, health, pests): kept, not simulated in B1. */fertility:number}
export interface FarmAction {requestId:string;type:'plant'|'water'|'harvest'|'clear';cropId?:string;time:number;waterAvailable?:boolean;expectedRevision?:number}
export type FarmResult={ok:true;stage:FarmStage;reward:{itemId:string;quantity:number}|null;revision:number}|{ok:false;reason:string};
const DRY=.05,COMFORT=.3,WITHER_HOURS=36;

export function sliceSeconds(climate:ClimateHistory){return climate.definition.dayLengthSeconds/48;}
export function newPlotState(plotId:string,settings:FarmSettingsV3):FarmPlotState{
  return {plotId,revision:0,modelVersion:FARM_MODEL_VERSION,evaluatedAt:0,moisture:.5,crop:settings.initialCrop?{cropId:settings.initialCrop,plantedAt:0,progress:0,dryHours:0,stage:'seeded'}:null,harvests:0,history:[],requests:[],fertility:settings.soil.fertility};
}
function stageOf(c:FarmCropState):FarmStage{if(c.stage==='failed')return 'failed';const f=c.progress/CROPS[c.cropId].maturity;return f>=1?'mature':f>=.15?'growing':'seeded';}
/** Integrate whole slices up to `time` (later partial slice not committed). */
export function evaluate(state:FarmPlotState,settings:FarmSettingsV3,climate:ClimateHistory,time:number):FarmPlotState{
  // Integer slice indices: t = k·P, identical whatever the evaluation pattern.
  const P=sliceSeconds(climate),day=climate.definition.dayLengthSeconds,k0=Math.round(state.evaluatedAt/P),k1=Math.floor(time/P);
  if(k1<=k0)return state;
  if(k1-k0>200000)throw Error('Absence trop longue pour cette parcelle (plus de 11 années de jeu)');
  const gameDays=P/day,drain=1+settings.soil.drainage*.5;
  for(let k=k0;k<k1;k++){const t=k*P;
    const crop=state.crop,profile=crop?CROPS[crop.cropId]:undefined,s=climate.summarize(t,(k+1)*P,profile?.baseTempC??0);
    const rain=s.weatherSeconds.rain/P,clear=s.weatherSeconds.clear/P,use=(profile&&crop&&crop.stage!=='failed'&&crop.stage!=='mature'?profile.waterUse:.12)*drain;
    state.moisture=Math.min(1,Math.max(0,state.moisture+gameDays*(rain*2-use*(1+.5*clear))));
    if(!crop||!profile||crop.stage==='failed'||crop.stage==='mature')continue;
    const degreeDays=s.degreeHours*(86400/day)/24,factor=state.moisture>=COMFORT?1:state.moisture/COMFORT;
    crop.progress+=degreeDays*factor;crop.dryHours=state.moisture<=DRY?crop.dryHours+gameDays*24:Math.max(0,crop.dryHours-gameDays*6);
    crop.stage=crop.dryHours>WITHER_HOURS?'failed':stageOf(crop);
  }
  state.evaluatedAt=k1*P;return state;
}
/** Public, compact state for rendering and HUD (no private yield prediction). */
export function publicView(state:FarmPlotState){const c=state.crop;return {plotId:state.plotId,cropId:c?.cropId??null,stage:(c?.stage??'empty') as FarmStage,growth:c?Math.min(1,c.progress/CROPS[c.cropId].maturity):0,moisture:state.moisture,revision:state.revision};}
/** Validated action; the plot is first evaluated to the action time. Harvest grants the
 * reward atomically (grant must accept) and every request id is applied at most once. */
export function act(state:FarmPlotState,settings:FarmSettingsV3,climate:ClimateHistory,a:FarmAction,grant:(r:{itemId:string;quantity:number})=>boolean):FarmResult{
  if(state.requests.includes(a.requestId))return {ok:false,reason:'Demande déjà traitée'};
  if(a.expectedRevision!==undefined&&a.expectedRevision!==state.revision)return {ok:false,reason:'Parcelle modifiée entre-temps'};
  evaluate(state,settings,climate,a.time);
  const fail=(reason:string):FarmResult=>({ok:false,reason}),c=state.crop;let reward:{itemId:string;quantity:number}|null=null;
  switch(a.type){
    case 'plant':if(c)return fail(c.stage==='failed'?'Nettoyer d’abord la parcelle':'Parcelle déjà cultivée');if(!a.cropId||!settings.crops.includes(a.cropId)||!CROPS[a.cropId])return fail('Culture non autorisée ici');
      state.crop={cropId:a.cropId,plantedAt:state.evaluatedAt,progress:0,dryHours:0,stage:'seeded'};break;
    case 'water':if(!a.waterAvailable)return fail('Aucune eau d’irrigation à portée');if(state.moisture>=.95)return fail('Le sol est déjà détrempé');state.moisture=Math.min(1,state.moisture+.6);if(c)c.dryHours=0;break;
    case 'harvest':{if(!c||c.stage!=='mature')return fail(c?'Pas encore mûr':'Rien à récolter');const p=CROPS[c.cropId],q=Math.max(1,Math.round(p.yield*(.75+.5*settings.soil.fertility)*(c.dryHours>6?.75:1)));
      reward={itemId:p.itemId,quantity:q};if(!grant(reward))return fail('Inventaire plein');state.history=[...state.history,c.cropId].slice(-5);state.harvests++;state.crop=null;break;}
    case 'clear':if(!c)return fail('Parcelle déjà vide');state.history=[...state.history,c.cropId].slice(-5);state.crop=null;break;
    default:return fail('Action inconnue');
  }
  state.revision++;state.requests=[...state.requests,a.requestId].slice(-32);
  return {ok:true,stage:state.crop?.stage??'empty',reward,revision:state.revision};
}
export function parsePlotState(value:unknown):FarmPlotState{
  const v=value as FarmPlotState,num=(x:unknown,a:number,b:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=a&&x<=b;
  if(!v||typeof v!=='object'||typeof v.plotId!=='string'||!Number.isInteger(v.revision)||v.modelVersion!==FARM_MODEL_VERSION||!num(v.evaluatedAt,0,1e9)||!num(v.moisture,0,1)||!Number.isInteger(v.harvests)||!Array.isArray(v.history)||!Array.isArray(v.requests)||v.requests.length>32||!num(v.fertility,0,1))throw Error('État de parcelle invalide');
  if(v.crop!==null&&(!v.crop||!CROPS[v.crop.cropId]||!num(v.crop.progress,0,1e6)||!num(v.crop.dryHours,0,1e6)||!num(v.crop.plantedAt,0,1e9)||!['seeded','growing','mature','failed'].includes(v.crop.stage)))throw Error('Culture sauvegardée invalide');
  return structuredClone(v);
}
