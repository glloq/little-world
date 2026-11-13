/** Base relief generators referenced by V3 sources (`world.terrain`).
 * A generator is pure: same descriptor + seed + sea level + bounds = same heights,
 * independent of rendering, LOD or which sectors are loaded. Authored terrain edits
 * are applied on top by `terrain.ts`. Absence of a descriptor means the historical
 * valley (`legacy-valley`), so V1/V2 maps and existing V3 projects keep their relief.
 */
export interface VolcanoParams {
  x:number;z:number;
  /** Footprint radius where the cone merges into the island (m). */
  radiusM:number;
  /** Rim height above sea level before the crater is cut (m). */
  heightM:number;
  craterRadiusM:number;
  craterDepthM:number;
}
export interface IslandParams {
  /** Minimum open sea between the project edge and the unperturbed coast (m). */
  seaMarginM:number;
  /** Coastline irregularity amplitude and wavelength (m). */
  coastNoiseM:number;
  coastWavelengthM:number;
  beachWidthM:number;
  shoreHeightM:number;
  lowlandHeightM:number;
  hillHeightM:number;
  seabedDepthM:number;
  volcano:VolcanoParams;
}
export type TerrainGeneratorDefinition =
  | {kind:'legacy-valley';version:1}
  | {kind:'island';version:1;island:IslandParams}
  | {kind:'archipelago';version:1;archipelago:import('./geography/archipelago.ts').ArchipelagoParams};
import {archipelagoField,type GeneratorField} from './geography/archipelago.ts';
import {fbm,valueNoise,volcanoProfile} from './geography/noise.ts';
export {fbm,valueNoise,volcanoProfile} from './geography/noise.ts';
import {parseArchipelago} from './geography/archipelago-params.ts';
export interface GeneratorWorld {seed:number;seaLevel:number;width:number;length:number}
export type HeightFunction=(x:number,z:number)=>number;

/** Vertical envelope shared by sources, collisions and camera checks (m, relative to y=0). */
export const VERTICAL_ENVELOPE={min:-300,max:1500} as const;
export const LEGACY_GENERATOR:TerrainGeneratorDefinition={kind:'legacy-valley',version:1};

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*clamp(t,0,1);

/** Preset sized to the project rectangle; values are editable defaults, not calibrated decisions. */
export function islandPreset(width:number,length:number):TerrainGeneratorDefinition{
  const minor=Math.min(width,length),major=Math.max(width,length),alongZ=length>=width;
  const margin=Math.round(clamp(minor*.09,60,400)),radius=Math.round(clamp(minor*.42,120,2200));
  const offset=Math.round(clamp(major/2-margin-radius*1.05,0,major/2)*.55);
  return {kind:'island',version:1,island:{seaMarginM:margin,coastNoiseM:Math.round(clamp(minor*.07,20,300)),coastWavelengthM:Math.round(clamp(minor*.3,120,1500)),
    beachWidthM:Math.round(clamp(minor*.02,12,80)),shoreHeightM:5,lowlandHeightM:Math.round(clamp(minor*.015,8,60)),hillHeightM:Math.round(clamp(minor*.012,6,40)),seabedDepthM:40,
    volcano:{x:alongZ?0:-offset,z:alongZ?-offset:0,radiusM:radius,heightM:Math.round(clamp(radius*.42,40,900)),craterRadiusM:Math.round(radius*.12),craterDepthM:Math.round(clamp(radius*.05,8,120))}}};
}

const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function num(v:unknown,label:string,min:number,max:number):number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Générateur : ${label} hors limites`);return v;}
function only(v:Record<string,unknown>,allowed:string[],label:string){for(const key of Object.keys(v))if(!allowed.includes(key))throw Error(`${label} : champ inconnu ${key}`);}
/** Strict validation; the world rectangle is centered on the origin like the runtime adapter. */
export function parseTerrainGenerator(value:unknown,world:{width:number;length:number}):TerrainGeneratorDefinition{
  if(!record(value))throw Error('Générateur de relief invalide');
  if(value.kind==='legacy-valley'){only(value,['kind','version'],'Générateur');if(value.version!==1)throw Error('Version du générateur inconnue');return {kind:'legacy-valley',version:1};}
  if(value.kind==='archipelago'){only(value,['kind','version','archipelago'],'Générateur');if(value.version!==1)throw Error('Version du générateur d’archipel inconnue');return {kind:'archipelago',version:1,archipelago:parseArchipelago(value.archipelago,world)};}
  if(value.kind!=='island'||value.version!==1||!record(value.island))throw Error('Générateur de relief inconnu');
  only(value,['kind','version','island'],'Générateur');const i=value.island;
  only(i,['seaMarginM','coastNoiseM','coastWavelengthM','beachWidthM','shoreHeightM','lowlandHeightM','hillHeightM','seabedDepthM','volcano'],'Île');
  const minor=Math.min(world.width,world.length);
  const island:IslandParams={seaMarginM:num(i.seaMarginM,'marge marine',20,minor*.4),coastNoiseM:num(i.coastNoiseM,'irrégularité de côte',0,600),coastWavelengthM:num(i.coastWavelengthM,'longueur d’onde de côte',50,5000),
    beachWidthM:num(i.beachWidthM,'plage',2,400),shoreHeightM:num(i.shoreHeightM,'rivage',.5,50),lowlandHeightM:num(i.lowlandHeightM,'plaine',0,300),hillHeightM:num(i.hillHeightM,'collines',0,300),seabedDepthM:num(i.seabedDepthM,'fond marin',2,200),
    volcano:{x:0,z:0,radiusM:0,heightM:0,craterRadiusM:0,craterDepthM:0}};
  if(!record(i.volcano))throw Error('Volcan invalide');const v=i.volcano;only(v,['x','z','radiusM','heightM','craterRadiusM','craterDepthM'],'Volcan');
  island.volcano={x:num(v.x,'volcan X',-world.width/2,world.width/2),z:num(v.z,'volcan Z',-world.length/2,world.length/2),radiusM:num(v.radiusM,'rayon du volcan',0,5000),
    heightM:num(v.heightM,'hauteur du volcan',0,VERTICAL_ENVELOPE.max-100),craterRadiusM:num(v.craterRadiusM,'rayon du cratère',0,2000),craterDepthM:num(v.craterDepthM,'profondeur du cratère',0,600)};
  const vol=island.volcano;
  if(vol.craterRadiusM>=vol.radiusM&&vol.radiusM>0)throw Error('Le cratère doit être plus petit que le volcan');
  if(vol.craterDepthM>vol.heightM)throw Error('Cratère plus profond que le volcan');
  if(Math.abs(vol.x)+vol.radiusM>world.width/2||Math.abs(vol.z)+vol.radiusM>world.length/2)throw Error('Le volcan dépasse l’emprise du projet');
  return {kind:'island',version:1,island};
}

/** Signed distance (m) to a rounded rectangle; positive inside. */
function roundedInside(x:number,z:number,hx:number,hz:number,r:number):number{
  const qx=Math.abs(x)-(hx-r),qz=Math.abs(z)-(hz-r);
  return -(Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-r);
}
/** Island relief: closed perturbed coast, beach, rolling lowland, gullied volcano and seabed. */
export function islandHeight(world:GeneratorWorld,p:IslandParams):HeightFunction{
  const sea=world.seaLevel,seed=world.seed>>>0,hx=world.width/2-p.seaMarginM,hz=world.length/2-p.seaMarginM,round=Math.min(hx,hz)*.85;
  const coastFreq=1/p.coastWavelengthM,hillFreq=1/Math.max(80,p.coastWavelengthM*.45),v=p.volcano;
  return (x,z)=>{
    const coast=roundedInside(x,z,hx,hz,round)+fbm(seed^0x51ed,x*coastFreq,z*coastFreq,3)*p.coastNoiseM;
    let h:number;
    if(coast<0)h=sea-1-p.seabedDepthM*smooth(0,Math.max(150,p.seaMarginM*1.5),-coast);
    else{
      const inland=smooth(p.beachWidthM,p.beachWidthM+500,coast);
      h=sea-1+(p.shoreHeightM+1)*smooth(0,p.beachWidthM,coast)+(p.lowlandHeightM-p.shoreHeightM)*Math.max(0,inland)
        +fbm(seed^0x1f3d,x*hillFreq,z*hillFreq,3)*p.hillHeightM*inland;
    }
    const dv=Math.hypot(x-v.x,z-v.z);
    if(dv<v.radiusM){
      // Radial gullies: angular noise scaled by distance keeps the silhouette readable from afar.
      const angle=Math.atan2(z-v.z,x-v.x),gully=1-.12*Math.abs(valueNoise(seed^0x7a11,angle*7+3,dv*.004))*smooth(v.craterRadiusM,v.radiusM*.6,dv);
      const cone=volcanoProfile(v,dv)*gully,merge=smooth(v.radiusM,v.radiusM*.55,dv);
      // The cone rises from whatever lies beneath it (lowland or seabed); merge avoids a crease at its foot.
      h=Math.max(h,lerp(h,sea-1+cone+(coast<0?0:(h-sea+1)*.35),merge));
    }
    return h;
  };
}
export function generatorHeight(def:TerrainGeneratorDefinition,world:GeneratorWorld,legacy:HeightFunction):HeightFunction{
  return generatorField(def,world,legacy).height;
}
/** Shared generator outputs (height, coast distance, coastal steepness, volcanic influence). */
export function generatorField(def:TerrainGeneratorDefinition,world:GeneratorWorld,legacy:HeightFunction):GeneratorField{
  if(def.kind==='archipelago')return archipelagoField(world,def.archipelago);
  if(def.kind==='island'){const coast=islandCoastDistance(world,def.island),v=def.island.volcano;
    const volcanic=(x:number,z:number)=>smooth(v.radiusM,v.radiusM*.35,Math.hypot(x-v.x,z-v.z));
    return {height:islandHeight(world,def.island),coast,cliff:()=>0,volcanic,site:(x,z)=>({coast:coast(x,z),cliff:0,volcanic:volcanic(x,z)})};}
  // Historical valley: the open sea lies towards +Z beyond ~190 m.
  return {height:legacy,coast:(_x,z)=>190-z,cliff:()=>0,volcanic:()=>0,site:(_x,z)=>({coast:190-z,cliff:0,volcanic:0})};
}
/** Approximate inland distance used by colouring/biomes; negative offshore. */
export function islandCoastDistance(world:GeneratorWorld,p:IslandParams):HeightFunction{
  const hx=world.width/2-p.seaMarginM,hz=world.length/2-p.seaMarginM,round=Math.min(hx,hz)*.85,f=1/p.coastWavelengthM,seed=world.seed>>>0;
  return (x,z)=>roundedInside(x,z,hx,hz,round)+fbm(seed^0x51ed,x*f,z*f,3)*p.coastNoiseM;
}
