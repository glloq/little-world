import {proposeBasinLakes} from './basin-lakes.ts';
/** Reserve useful native platforms before WATER and access planning. */
import type {ProjectDocument} from './types.ts';
import type {TerrainPlanV1,TerrainSite} from './terrain-sites.ts';
import type {MapRequirements} from './map-requirements.ts';
import {archipelagoField,shapeSeed,compilePolygon,type PointXZ,type ReliefFeature} from '../geography/archipelago.ts';
import {roundOutline} from './organic-outlines.ts';
import {putWater,removeWater} from './source.ts';
export interface SiteDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string;targetId?:string}
export function planTerrainSites(p:ProjectDocument,r:MapRequirements):SiteDiagnostic[]{
 if(r.compositionVersion!==5||!r.layout||p.world.terrain?.kind!=='archipelago')return [];
 const terrain=p.world.terrain.archipelago,minor=Math.min(r.width,r.length),b=p.world.bounds,sites:TerrainSite[]=[],diagnostics:SiteDiagnostic[]=[],layout=r.layout;
 const plan:TerrainPlanV1={version:1,id:'composition-layout',sites,access:[]};
 const angle=r.islandStyle!.orientation*Math.PI/180,forward={x:Math.sin(angle),z:Math.cos(angle)},side={x:Math.cos(angle),z:-Math.sin(angle)},
  goal=r.islandStyle?.silhouette==='crescent'?{x:-forward.x*minor*.22,z:-forward.z*minor*.22}:{x:forward.x*minor*.3,z:forward.z*minor*.3};
 const field=()=>archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:p.world.seaLevel},terrain);
 const coastField=field();let inradius=0;for(let z=0;z<64;z++)for(let x=0;x<64;x++)inradius=Math.max(inradius,coastField.coast(b.minX+(x+.5)/64*r.width,b.minZ+(z+.5)/64*r.length));
 function propose(kind:TerrainSite['kind'],i:number):void{
  if(terrain.features.length+3>64){diagnostics.push({severity:'WARNING',code:'SITE_BUDGET',message:'Limite de formes atteinte pour les zones utiles.'});return;}
  const fade=terrain.coastalReliefFadeM??0,available=Math.max(0,inradius-fade-8),radius=Math.max(10,Math.min(85,minor*(kind==='harbor'?.018:kind==='lake'?.024:.03),available*(kind==='lake'?.5:.75))),edge=Math.max(8,Math.min(120,minor*.025)),f=field(),candidates:{x:number;z:number;h:number;score:number;shore?:PointXZ}[]=[];
  for(let iz=0;iz<56;iz++)for(let ix=0;ix<56;ix++){
   const x=b.minX+(ix+.5)/56*r.width,z=b.minZ+(iz+.5)/56*r.length,coast=f.coast(x,z),h=f.height(x,z);
   if(coast<radius*(kind==='lake'?1.65:1.08)+fade+5||h<3||h>r.islandStyle!.altitudeM*.62)continue;
   if(sites.some(q=>Math.hypot(q.entry.x-x,q.entry.z-z)<radius*3.8+edge))continue;
   const samples=Array.from({length:8},(_,j)=>{const a=j*Math.PI/4;return f.height(x+Math.cos(a)*(radius+edge*.5),z+Math.sin(a)*(radius+edge*.5));}),variation=Math.max(...samples)-Math.min(...samples);
   if(variation>(kind==='harbor'?35:45))continue;
   let shore:PointXZ|undefined;
   if(kind==='harbor'){
    if(coast>Math.max(260,minor*.14)||h>45)continue;
    const gx=f.coast(x+4,z)-f.coast(x-4,z),gz=f.coast(x,z+4)-f.coast(x,z-4),length=Math.hypot(gx,gz)||1;
    for(let d=coast;d<coast+350;d+=10){const q={x:x-gx/length*d,z:z-gz/length*d};if(q.x<b.minX||q.x>b.maxX||q.z<b.minZ||q.z>b.maxZ)break;if(f.height(q.x,q.z)<-3){shore=q;break;}}
    if(!shore)continue;
    // Prefer a bay-facing coast rather than the outside of a crescent.
    if(r.islandStyle?.silhouette==='crescent'&&((shore.x-x)*forward.x+(shore.z-z)*forward.z)<0)continue;
   }
   const distance=kind==='harbor'?Math.hypot(x-goal.x,z-goal.z):Math.hypot(x-side.x*minor*(i%2?.15:-.15),z-side.z*minor*(i%2?.15:-.15));
   candidates.push({x,z,h,shore,score:variation*20+h*(kind==='harbor'?6:1)+distance*(kind==='harbor'?.8:.09)+(kind==='lake'?coast*.015:0)});
  }
  candidates.sort((a,b)=>a.score-b.score||a.x-b.x||a.z-b.z);const best=candidates[0];
  if(!best){diagnostics.push({severity:'WARNING',code:'SITE_MISSING',message:(kind==='harbor'?'Port':kind==='lake'?'Lac':'Champ')+' : aucune emprise convenable. Réduire le relief ou choisir une autre variation.'});return;}
  const id='composition-site-'+kind+'-'+i,phase=(shapeSeed(r.seed,id)%1000)*.01,
   outline=(scale=1)=>roundOutline(Array.from({length:32},(_,j)=>{const a=j*Math.PI/16,k=1+.05*Math.sin(3*a+phase);return {x:best.x+Math.cos(a)*radius*scale*k,z:best.z+Math.sin(a)*radius*scale*.8*k};}),32,3),
   height=kind==='harbor'?Math.max(4,Math.min(9,Math.round(best.h/3)*3)):Math.max(8,Math.round(best.h/4)*4),featureId=id+'-platform';
  const added:ReliefFeature[]=[{id:featureId,kind:'plateau',polygon:outline(kind==='lake'?1.65:1),heightM:height+(kind==='lake'?2:0),edgeM:edge,surface:true}];
  let waterId:string|undefined;
  if(kind==='lake'){
   waterId=id+'-water';added.push({id:id+'-floor',kind:'plateau',polygon:outline(1.12),heightM:Math.max(.5,height-3),edgeM:Math.max(3,radius*.28),surface:true});
  }
  terrain.features.push(...added);
  if(waterId){
   const proposal=proposeBasinLakes([{kind:'pit',outlet:{x:best.x,z:best.z},spillLevelM:height+.6,bottomM:height-3,depthM:3.6,areaM2:Math.PI*radius*radius,cells:1}],{height:field().height,bounds:p.world.bounds,existing:Object.values(p.libraries.water),seaLevel:0},{maxLakes:1,idPrefix:id+'-water-'}).proposals[0];
   if(!proposal){terrain.features.splice(terrain.features.length-added.length);diagnostics.push({severity:'WARNING',code:'SITE_LAKE_INVALID',message:'Bassin du lac non validé.'});return;}
   waterId=proposal.water.id;putWater(p,proposal.water);
  }
  let entry={x:best.x,z:best.z,heading:angle};
  if(kind==='lake'){
   const platform=added[0];if(platform.kind!=='plateau')return;const inside=compilePolygon(platform.polygon),wet=compilePolygon(p.libraries.water[waterId!].points);
   const options=platform.polygon.map(q=>({x:best.x+(q.x-best.x)*.92,z:best.z+(q.z-best.z)*.92,heading:angle})).sort((a,b)=>(b.x-best.x)*side.x+(b.z-best.z)*side.z-((a.x-best.x)*side.x+(a.z-best.z)*side.z));
   const dry=options.find(q=>inside(q.x,q.z)>1&&wet(q.x,q.z)<-1.5&&field().height(q.x,q.z)>1);
   if(!dry){if(waterId)removeWater(p,waterId);terrain.features.splice(terrain.features.length-added.length);diagnostics.push({severity:'WARNING',code:'SITE_LAKE_ENTRY',message:'Lac : aucune berge sèche assez large pour un accès.'});return;}entry=dry;
  }
  sites.push({id,kind,name:kind==='harbor'?'Emplacement portuaire':kind==='lake'?'Lac latéral':'Champ '+(i+1),featureId,...(waterId?{waterId,supportFeatureIds:[id+'-floor']}:{}),entry,...(best.shore?{shore:best.shore}:{}),locked:false,clearWidthM:kind==='harbor'?6:3});
 }
 if(layout.harbor)propose('harbor',0);
 for(let i=0;i<layout.farms;i++)propose('farm',i);
 if(layout.lake)propose('lake',0);
 if(sites.length)p.libraries.terrainPlans={...(p.libraries.terrainPlans??{}),[plan.id]:plan};
 return diagnostics;
}
