/** Validation, presets and conversions of archipelago parameters (V3 `world.terrain`). */
import type {ArchipelagoParams,Landmass,PointXZ,ReliefFeature} from './archipelago.ts';
import type {IslandParams} from '../terrain-generator.ts';

const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
function num(v:unknown,label:string,min:number,max:number):number{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error(`Archipel : ${label} hors limites`);return v;}
function only(v:Record<string,unknown>,allowed:string[],label:string){for(const key of Object.keys(v))if(!allowed.includes(key))throw Error(`${label} : champ inconnu ${key}`);}
function id(v:unknown,label:string):string{if(typeof v!=='string'||!/^[a-zA-Z0-9_:.-]{1,64}$/.test(v))throw Error(`${label} : identifiant invalide`);return v;}
function points(v:unknown,label:string,min:number,max:number,world:{width:number;length:number}):PointXZ[]{
  if(!Array.isArray(v)||v.length<min||v.length>max)throw Error(`${label} : ${min} à ${max} points`);
  return v.map(p=>{if(!record(p))throw Error(label+' : point invalide');only(p,['x','z'],label);return {x:num(p.x,label,-world.width/2,world.width/2),z:num(p.z,label,-world.length/2,world.length/2)};});
}
/** Optional local re-seed of one shape ("Varier"): absent = 0, kept absent on round-trip. */
function variant(raw:Record<string,unknown>):{variant?:number}{if(raw.variant===undefined)return {};const v=num(raw.variant,'variante',0,999999);if(!Number.isInteger(v))throw Error('Archipel : variante entière attendue');return {variant:v};}
export const ARCHIPELAGO_LIMITS={landmasses:12,outline:64,features:64,line:32} as const;
export function parseArchipelago(value:unknown,world:{width:number;length:number}):ArchipelagoParams{
  if(!record(value))throw Error('Archipel invalide');only(value,['seabedDepthM','detailM','landmasses','features'],'Archipel');
  if(!Array.isArray(value.landmasses)||value.landmasses.length<1||value.landmasses.length>ARCHIPELAGO_LIMITS.landmasses)throw Error('Archipel : 1 à 12 terres');
  if(!Array.isArray(value.features)||value.features.length>ARCHIPELAGO_LIMITS.features)throw Error('Archipel : 64 formes au maximum');
  const ids=new Set<string>(),unique=(v:string)=>{if(ids.has(v))throw Error('Archipel : identifiant dupliqué '+v);ids.add(v);return v;};
  const minor=Math.min(world.width,world.length);
  const landmasses:Landmass[]=value.landmasses.map(raw=>{
    if(!record(raw))throw Error('Terre invalide');only(raw,['id','name','outline','coastNoiseM','coastWavelengthM','beachWidthM','shoreHeightM','lowlandHeightM','hillHeightM','cliffs','variant'],'Terre');
    if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80)throw Error('Terre : nom requis');
    return {id:unique(id(raw.id,'Terre')),name:raw.name,outline:points(raw.outline,'Contour',3,ARCHIPELAGO_LIMITS.outline,world),coastNoiseM:num(raw.coastNoiseM,'irrégularité de côte',0,600),coastWavelengthM:num(raw.coastWavelengthM,'longueur d’onde de côte',50,5000),
      beachWidthM:num(raw.beachWidthM,'plage',2,400),shoreHeightM:num(raw.shoreHeightM,'rivage',.5,80),lowlandHeightM:num(raw.lowlandHeightM,'plaine',0,400),hillHeightM:num(raw.hillHeightM,'collines',0,300),cliffs:num(raw.cliffs,'falaises',0,1),...variant(raw)};
  });
  const features:ReliefFeature[]=value.features.map(raw=>{
    if(!record(raw))throw Error('Forme invalide');const fid=unique(id(raw.id,'Forme'));
    const center=()=>({x:num(raw.x,'X',-world.width/2,world.width/2),z:num(raw.z,'Z',-world.length/2,world.length/2)});
    switch(raw.kind){
      case 'volcano':{only(raw,['id','kind','x','z','radiusM','heightM','craterRadiusM','craterDepthM','variant'],'Volcan');const v={id:fid,kind:'volcano' as const,...center(),radiusM:num(raw.radiusM,'rayon',20,minor),heightM:num(raw.heightM,'hauteur',5,1400),craterRadiusM:num(raw.craterRadiusM,'cratère',0,2000),craterDepthM:num(raw.craterDepthM,'profondeur du cratère',0,600),...variant(raw)};
        if(v.craterRadiusM>=v.radiusM)throw Error('Volcan : cratère trop large');if(v.craterDepthM>v.heightM)throw Error('Volcan : cratère trop profond');return v;}
      case 'mountain':case 'hill':only(raw,['id','kind','x','z','radiusM','heightM','roughness','variant'],'Massif');return {id:fid,kind:raw.kind,...center(),radiusM:num(raw.radiusM,'rayon',10,minor),heightM:num(raw.heightM,'hauteur',1,1200),roughness:num(raw.roughness,'rugosité',0,1),...variant(raw)};
      case 'basin':only(raw,['id','kind','x','z','radiusM','depthM','variant'],'Cuvette');return {id:fid,kind:'basin',...center(),radiusM:num(raw.radiusM,'rayon',10,minor),depthM:num(raw.depthM,'profondeur',.5,300),...variant(raw)};
      case 'plateau':only(raw,['id','kind','polygon','heightM','edgeM','variant'],'Plateau');return {id:fid,kind:'plateau',polygon:points(raw.polygon,'Plateau',3,ARCHIPELAGO_LIMITS.outline,world),heightM:num(raw.heightM,'altitude',0,1200),edgeM:num(raw.edgeM,'bordure',2,600),...variant(raw)};
      case 'ridge':only(raw,['id','kind','points','widthM','heightM','variant'],'Crête');return {id:fid,kind:'ridge',points:points(raw.points,'Crête',2,ARCHIPELAGO_LIMITS.line,world),widthM:num(raw.widthM,'largeur',5,2000),heightM:num(raw.heightM,'hauteur',1,800),...variant(raw)};
      case 'valley':only(raw,['id','kind','points','widthM','depthM','variant'],'Vallée');return {id:fid,kind:'valley',points:points(raw.points,'Vallée',2,ARCHIPELAGO_LIMITS.line,world),widthM:num(raw.widthM,'largeur',5,2000),depthM:num(raw.depthM,'profondeur',.5,400),...variant(raw)};
      default:throw Error('Forme de relief inconnue');
    }
  });
  return {seabedDepthM:num(value.seabedDepthM,'fond marin',2,200),detailM:num(value.detailM,'détail',0,20),landmasses,features};
}
/** Closed outline of an ellipse-like land mass with a few reproducible bulges. */
export function blobOutline(cx:number,cz:number,rx:number,rz:number,count=20,phase=0):PointXZ[]{
  return Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2,k=1+.12*Math.sin(a*3+phase)+.06*Math.sin(a*5+phase*2);return {x:Math.round((cx+Math.cos(a)*rx*k)*10)/10,z:Math.round((cz+Math.sin(a)*rz*k)*10)/10};});
}
/** Rounded rectangle outline (used to convert the historical island preset). */
export function roundedRectOutline(hx:number,hz:number,r:number,perCorner=5):PointXZ[]{
  const out:PointXZ[]=[];const corners=[[hx-r,hz-r,0],[-(hx-r),hz-r,Math.PI/2],[-(hx-r),-(hz-r),Math.PI],[hx-r,-(hz-r),Math.PI*1.5]] as const;
  for(const [cx,cz,start]of corners)for(let i=0;i<=perCorner;i++){const a=start+i/perCorner*Math.PI/2;out.push({x:Math.round((cx+Math.cos(a)*r)*10)/10,z:Math.round((cz+Math.sin(a)*r)*10)/10});}
  return out;
}
/** Approximate conversion of the single-island preset to an editable archipelago (same volcano). */
export function islandToArchipelago(p:IslandParams,width:number,length:number):ArchipelagoParams{
  const hx=width/2-p.seaMarginM,hz=length/2-p.seaMarginM;
  return {seabedDepthM:p.seabedDepthM,detailM:2,landmasses:[{id:'main',name:'Île principale',outline:roundedRectOutline(hx,hz,Math.min(hx,hz)*.85),coastNoiseM:p.coastNoiseM,coastWavelengthM:p.coastWavelengthM,beachWidthM:p.beachWidthM,shoreHeightM:p.shoreHeightM,lowlandHeightM:p.lowlandHeightM,hillHeightM:p.hillHeightM,cliffs:0}],
    features:[{id:'volcano',kind:'volcano',...p.volcano}]};
}
/** Editable preset: main island (volcano, massif, ridge, valley, plateau) + two islets.
 * A starting point only: every shape is visible and editable on the map. */
export function archipelagoPreset(width:number,length:number):ArchipelagoParams{
  const w=width/2,l=length/2,s=Math.min(width,length);
  const r=(v:number)=>Math.round(v);
  return {seabedDepthM:40,detailM:2,
    landmasses:[
      {id:'main',name:'Île principale',outline:blobOutline(-w*.08,-l*.05,w*.62,l*.72,24,.4),coastNoiseM:r(s*.05),coastWavelengthM:r(s*.25),beachWidthM:45,shoreHeightM:4,lowlandHeightM:r(s*.014),hillHeightM:r(s*.01),cliffs:.35},
      {id:'islet-north',name:'Îlot du nord',outline:blobOutline(w*.55,l*.8,w*.16,l*.07,12,1.7),coastNoiseM:r(s*.02),coastWavelengthM:r(s*.1),beachWidthM:20,shoreHeightM:3,lowlandHeightM:12,hillHeightM:8,cliffs:.6},
      {id:'islet-south',name:'Îlot du sud',outline:blobOutline(w*.62,-l*.78,w*.1,l*.05,10,2.9),coastNoiseM:r(s*.015),coastWavelengthM:r(s*.08),beachWidthM:25,shoreHeightM:2,lowlandHeightM:6,hillHeightM:4,cliffs:.1},
    ],
    features:[
      {id:'volcano',kind:'volcano',x:r(-w*.1),z:r(-l*.4),radiusM:r(s*.3),heightM:r(s*.14),craterRadiusM:r(s*.035),craterDepthM:r(s*.018)},
      {id:'massif',kind:'mountain',x:r(-w*.18),z:r(l*.32),radiusM:r(s*.24),heightM:r(s*.09),roughness:.6},
      {id:'ridge',kind:'ridge',points:[{x:r(-w*.32),z:r(l*.12)},{x:r(-w*.18),z:r(l*.32)},{x:r(-w*.05),z:r(l*.5)}],widthM:r(s*.07),heightM:r(s*.03)},
      {id:'valley',kind:'valley',points:[{x:r(w*.02),z:r(l*.38)},{x:r(w*.14),z:r(l*.15)},{x:r(w*.3),z:r(-l*.02)},{x:r(w*.52),z:r(-l*.1)}],widthM:r(s*.06),depthM:r(s*.012)},
      {id:'plateau',kind:'plateau',polygon:blobOutline(w*.2,-l*.12,w*.12,l*.06,8,.9),heightM:r(s*.012),edgeM:r(s*.025)},
      {id:'hills',kind:'hill',x:r(w*.12),z:r(l*.5),radiusM:r(s*.09),heightM:r(s*.012),roughness:.3},
      {id:'marsh',kind:'basin',x:r(w*.28),z:r(-l*.32),radiusM:r(s*.05),depthM:3},
    ]};
}
/** Preset: a chain of small islands of different characters (one volcanic). */
export function isletChainPreset(width:number,length:number):ArchipelagoParams{
  const w=width/2,l=length/2,s=Math.min(width,length),r=(v:number)=>Math.round(v);
  const spots:[number,number,number,number,number][]=[[-.45,-.7,.24,.12,.2],[.1,-.35,.3,.14,.7],[-.25,0,.36,.16,.3],[.35,.32,.26,.12,.5],[-.1,.7,.22,.1,.1]];
  return {seabedDepthM:35,detailM:2,
    landmasses:spots.map(([x,z,rx,rz,cliffs],i)=>({id:'islet-'+(i+1),name:'Îlot '+(i+1),outline:blobOutline(w*x,l*z,w*rx,l*rz,14,i*1.3),coastNoiseM:r(s*.025),coastWavelengthM:r(s*.12),beachWidthM:30,shoreHeightM:3,lowlandHeightM:r(s*.008)+4,hillHeightM:r(s*.006),cliffs})),
    features:[
      {id:'volcano',kind:'volcano',x:r(w*.1),z:r(-l*.35),radiusM:r(s*.18),heightM:r(s*.09),craterRadiusM:r(s*.025),craterDepthM:r(s*.012)},
      {id:'hills',kind:'hill',x:r(-w*.25),z:r(0),radiusM:r(s*.12),heightM:r(s*.02),roughness:.4},
      {id:'ridge',kind:'ridge',points:[{x:r(w*.2),z:r(l*.28)},{x:r(w*.45),z:r(l*.36)}],widthM:r(s*.05),heightM:r(s*.02)},
    ]};
}
