/** Authoring reservations and route requests shared with future settlement planning.
 * Geometry lives in native terrain features and paths; no parallel terrain/road format. */
import type {WorldDefinitionV3,ProjectLibraries} from './types.ts';
export interface LayoutRequirements {version:1;harbor:boolean;farms:number;lake:boolean;connect:boolean;maxSlope:number;accessRequired:boolean}
export interface TerrainSite {id:string;kind:'harbor'|'farm'|'lake';name:string;featureId:string;supportFeatureIds?:string[];waterId?:string;farmZoneId?:string;
 entry:{x:number;z:number;heading:number};shore?:{x:number;z:number};locked:boolean;clearWidthM:number;}
export interface TerrainAccess {id:string;from:string;to:string;pathId?:string;generatedPathHash?:string;mode:'foot';maxSlope:number;clearWidthM:number;}
export interface TerrainPlanV1 {version:1;id:string;sites:TerrainSite[];access:TerrainAccess[];}
export const DEFAULT_LAYOUT:LayoutRequirements={version:1,harbor:false,farms:0,lake:false,connect:true,maxSlope:.35,accessRequired:false};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(n:unknown,a:number,b:number)=>typeof n==='number'&&Number.isFinite(n)&&n>=a&&n<=b;
const id=(v:unknown)=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,64}$/.test(v);
function keys(v:object,allowed:string[]){if(Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Plan de terrain : champ inconnu');}
export function validateLayout(value:unknown):asserts value is LayoutRequirements{
 if(!record(value))throw Error('Organisation du terrain invalide');keys(value,['version','harbor','farms','lake','connect','maxSlope','accessRequired']);
 if(value.version!==1||!num(value.farms,0,4)||!Number.isInteger(value.farms)||!num(value.maxSlope,.08,.6)||['harbor','lake','connect','accessRequired'].some(k=>typeof value[k]!=='boolean'))throw Error('Organisation du terrain invalide');
}
export function validateTerrainPlan(value:unknown,world:WorldDefinitionV3,libs:Pick<ProjectLibraries,'paths'|'water'|'zones'>):TerrainPlanV1{
 if(!record(value))throw Error('Plan de terrain invalide');keys(value,['version','id','sites','access']);
 if(value.version!==1||!id(value.id)||!Array.isArray(value.sites)||value.sites.length>12||!Array.isArray(value.access)||value.access.length>24)throw Error('Plan de terrain hors limites');
 const ids=new Set<string>(),features=world.terrain?.kind==='archipelago'?world.terrain.archipelago.features:[];
 const point=(v:unknown)=>{if(!record(v))throw Error('Ancre de site invalide');if(!num(v.x,world.bounds.minX,world.bounds.maxX)||!num(v.z,world.bounds.minZ,world.bounds.maxZ))throw Error('Ancre de site hors carte');};
 for(const site of value.sites){
  if(!record(site))throw Error('Site invalide');keys(site,['id','kind','name','featureId','supportFeatureIds','waterId','farmZoneId','entry','shore','locked','clearWidthM']);
  if(!id(site.id)||ids.has(site.id as string)||!['harbor','farm','lake'].includes(String(site.kind))||typeof site.name!=='string'||!site.name.trim()||site.name.length>80||typeof site.locked!=='boolean'||!num(site.clearWidthM,1,20))throw Error('Site invalide');
  ids.add(site.id as string);point(site.entry);keys(site.entry as object,['x','z','heading']);if(!num((site.entry as Record<string,unknown>).heading,-Math.PI*2,Math.PI*2))throw Error('Orientation du site invalide');
  if(site.shore!==undefined){point(site.shore);keys(site.shore as object,['x','z']);}
  if(!features.some(f=>f.id===site.featureId&&f.kind==='plateau'&&f.surface))throw Error('Plateforme du site absente');
  if(site.supportFeatureIds!==undefined&&(!Array.isArray(site.supportFeatureIds)||site.supportFeatureIds.length>4||new Set(site.supportFeatureIds).size!==site.supportFeatureIds.length||site.supportFeatureIds.some(v=>v===site.featureId||!id(v)||!features.some(f=>f.id===v))))throw Error('Support du site absent');
  if(site.farmZoneId!==undefined&&(site.kind!=='farm'||!id(site.farmZoneId)||libs.zones?.[site.farmZoneId as string]?.kind!=='farm-plot'))throw Error('Parcelle agricole du site absente');
  if(site.waterId!==undefined&&(!id(site.waterId)||libs.water[site.waterId as string]?.kind!=='lake'))throw Error('Lac du site absent');
 }
 const edges=new Set<string>();
 for(const edge of value.access){
  if(!record(edge))throw Error('Accès invalide');keys(edge,['id','from','to','pathId','generatedPathHash','mode','maxSlope','clearWidthM']);
  if(!id(edge.id)||edges.has(edge.id as string)||!ids.has(String(edge.from))||!ids.has(String(edge.to))||edge.from===edge.to||edge.mode!=='foot'||!num(edge.maxSlope,.08,.6)||!num(edge.clearWidthM,1,20))throw Error('Accès invalide');
  if(edge.generatedPathHash!==undefined&&(typeof edge.generatedPathHash!=='string'||!/^[a-f0-9]{16}$/.test(edge.generatedPathHash)))throw Error('Empreinte du chemin invalide');
  edges.add(edge.id as string);if(edge.pathId!==undefined&&(!id(edge.pathId)||!libs.paths[edge.pathId as string]))throw Error('Chemin du site absent');
 }
 return value as unknown as TerrainPlanV1;
}
