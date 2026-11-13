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
export const ARCHIPELAGO_LIMITS={landmasses:12,outline:64,features:64,line:32} as const;
export function parseArchipelago(value:unknown,world:{width:number;length:number}):ArchipelagoParams{
  if(!record(value))throw Error('Archipel invalide');only(value,['seabedDepthM','detailM','landmasses','features'],'Archipel');
  if(!Array.isArray(value.landmasses)||value.landmasses.length<1||value.landmasses.length>ARCHIPELAGO_LIMITS.landmasses)throw Error('Archipel : 1 à 12 terres');
  if(!Array.isArray(value.features)||value.features.length>ARCHIPELAGO_LIMITS.features)throw Error('Archipel : 64 formes au maximum');
  const ids=new Set<string>(),unique=(v:string)=>{if(ids.has(v))throw Error('Archipel : identifiant dupliqué '+v);ids.add(v);return v;};
  const minor=Math.min(world.width,world.length);
  const landmasses:Landmass[]=value.landmasses.map(raw=>{
    if(!record(raw))throw Error('Terre invalide');only(raw,['id','name','outline','coastNoiseM','coastWavelengthM','beachWidthM','shoreHeightM','lowlandHeightM','hillHeightM','cliffs'],'Terre');
    if(typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80)throw Error('Terre : nom requis');
    return {id:unique(id(raw.id,'Terre')),name:raw.name,outline:points(raw.outline,'Contour',3,ARCHIPELAGO_LIMITS.outline,world),coastNoiseM:num(raw.coastNoiseM,'irrégularité de côte',0,600),coastWavelengthM:num(raw.coastWavelengthM,'longueur d’onde de côte',50,5000),
      beachWidthM:num(raw.beachWidthM,'plage',2,400),shoreHeightM:num(raw.shoreHeightM,'rivage',.5,80),lowlandHeightM:num(raw.lowlandHeightM,'plaine',0,400),hillHeightM:num(raw.hillHeightM,'collines',0,300),cliffs:num(raw.cliffs,'falaises',0,1)};
  });
  const features:ReliefFeature[]=value.features.map(raw=>{
    if(!record(raw))throw Error('Forme invalide');const fid=unique(id(raw.id,'Forme'));
    const center=()=>({x:num(raw.x,'X',-world.width/2,world.width/2),z:num(raw.z,'Z',-world.length/2,world.length/2)});
    switch(raw.kind){
      case 'volcano':{only(raw,['id','kind','x','z','radiusM','heightM','craterRadiusM','craterDepthM'],'Volcan');const v={id:fid,kind:'volcano' as const,...center(),radiusM:num(raw.radiusM,'rayon',20,minor),heightM:num(raw.heightM,'hauteur',5,1400),craterRadiusM:num(raw.craterRadiusM,'cratère',0,2000),craterDepthM:num(raw.craterDepthM,'profondeur du cratère',0,600)};
        if(v.craterRadiusM>=v.radiusM)throw Error('Volcan : cratère trop large');if(v.craterDepthM>v.heightM)throw Error('Volcan : cratère trop profond');return v;}
      case 'mountain':case 'hill':only(raw,['id','kind','x','z','radiusM','heightM','roughness'],'Massif');return {id:fid,kind:raw.kind,...center(),radiusM:num(raw.radiusM,'rayon',10,minor),heightM:num(raw.heightM,'hauteur',1,1200),roughness:num(raw.roughness,'rugosité',0,1)};
      case 'basin':only(raw,['id','kind','x','z','radiusM','depthM'],'Cuvette');return {id:fid,kind:'basin',...center(),radiusM:num(raw.radiusM,'rayon',10,minor),depthM:num(raw.depthM,'profondeur',.5,300)};
      case 'plateau':only(raw,['id','kind','polygon','heightM','edgeM'],'Plateau');return {id:fid,kind:'plateau',polygon:points(raw.polygon,'Plateau',3,ARCHIPELAGO_LIMITS.outline,world),heightM:num(raw.heightM,'altitude',0,1200),edgeM:num(raw.edgeM,'bordure',2,600)};
      case 'ridge':only(raw,['id','kind','points','widthM','heightM'],'Crête');return {id:fid,kind:'ridge',points:points(raw.points,'Crête',2,ARCHIPELAGO_LIMITS.line,world),widthM:num(raw.widthM,'largeur',5,2000),heightM:num(raw.heightM,'hauteur',1,800)};
      case 'valley':only(raw,['id','kind','points','widthM','depthM'],'Vallée');return {id:fid,kind:'valley',points:points(raw.points,'Vallée',2,ARCHIPELAGO_LIMITS.line,world),widthM:num(raw.widthM,'largeur',5,2000),depthM:num(raw.depthM,'profondeur',.5,400)};
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
