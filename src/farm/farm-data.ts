/** AGRI-1 — crop profiles and the authoring settings of a farm plot (`farm-plot` zone).
 * Values are versioned starting points for the B1 loop, to be tuned in play tests. */
import type {PointXZ} from '../studio-core/types.ts';

export const FARM_MODEL_VERSION=1;
export interface CropProfile {id:string;name:string;itemId:string;baseTempC:number;
  /** Game degree-days (above baseTempC) needed to reach maturity. */maturity:number;
  /** Soil moisture used per game day (0–1 scale). */waterUse:number;yield:number;color:number;matureColor:number;height:number}
export const CROPS:Record<string,CropProfile>={
  wheat:{id:'wheat',name:'Blé',itemId:'farm:wheat',baseTempC:5,maturity:34,waterUse:.32,yield:4,color:0x7fae4f,matureColor:0xd9b85a,height:.9},
  carrot:{id:'carrot',name:'Carotte',itemId:'farm:carrot',baseTempC:4,maturity:24,waterUse:.4,yield:3,color:0x5f9e3c,matureColor:0x6faa3e,height:.35},
  pumpkin:{id:'pumpkin',name:'Citrouille',itemId:'farm:pumpkin',baseTempC:8,maturity:30,waterUse:.5,yield:2,color:0x4f8c3a,matureColor:0xe08a2c,height:.5},
};
export const FARM_ITEMS=Object.values(CROPS).map(c=>({id:c.itemId,name:c.name,category:'farm',maxQuantity:999}));
export interface FarmSettingsV3 {crops:string[];initialCrop:string|null;rowAngle:number;soil:{fertility:number;drainage:number};irrigation:{x:number;z:number}|null}
export interface FarmZone {id:string;name:string;polygon:PointXZ[];farm:FarmSettingsV3}
export function defaultFarmSettings(polygon:PointXZ[]):FarmSettingsV3{
  const xs=polygon.map(p=>p.x),zs=polygon.map(p=>p.z);
  return {crops:Object.keys(CROPS),initialCrop:null,rowAngle:0,soil:{fertility:.6,drainage:.5},irrigation:{x:Math.max(...xs)+2,z:(Math.min(...zs)+Math.max(...zs))/2}};
}
const finite=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateFarmSettings(value:unknown):FarmSettingsV3{
  const f=value as FarmSettingsV3,fail=(t:string)=>{throw Error('Parcelle : '+t);};
  if(!f||typeof f!=='object'||Array.isArray(f))fail('paramètres invalides');
  for(const k of Object.keys(f))if(!['crops','initialCrop','rowAngle','soil','irrigation'].includes(k))fail('champ inconnu '+k);
  if(!Array.isArray(f.crops)||!f.crops.length||f.crops.some(c=>!CROPS[c])||new Set(f.crops).size!==f.crops.length)fail('cultures inconnues');
  if(f.initialCrop!==null&&!f.crops.includes(f.initialCrop))fail('culture initiale non autorisée');
  if(!finite(f.rowAngle,-Math.PI*2,Math.PI*2))fail('orientation des rangs invalide');
  if(!f.soil||!finite(f.soil.fertility,0,1)||!finite(f.soil.drainage,0,1)||Object.keys(f.soil).length!==2)fail('sol invalide');
  if(f.irrigation!==null&&(!f.irrigation||!finite(f.irrigation.x,-1e5,1e5)||!finite(f.irrigation.z,-1e5,1e5)))fail('point d’irrigation invalide');
  return structuredClone(f);
}
