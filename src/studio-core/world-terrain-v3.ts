/** Composition dispatch: saved V1/V2 geometry remains stable; V3 emphasizes
 * the stepped-island reference, with highlands, distinct floors and side districts. */
import type {MapRequirements} from './map-requirements.ts';
import {landscapeOrder as provinceOrder,planWorldTerrainV2} from './world-terrain-v2.ts';
import {archipelagoField,compilePolygon} from '../geography/archipelago.ts';
import {roundOutline,intersectOutline,curvedLine} from './organic-outlines.ts';
import {parseArchipelago} from '../geography/archipelago-params.ts';
export {randomStream} from './world-terrain-v2.ts';
export function landscapeOrder(r:MapRequirements){const order=provinceOrder(r);return r.compositionVersion===3&&r.biomeMode==='automatic'?order.filter(k=>k!=='volcanic'):order;}
export function planWorldTerrainV3(r:MapRequirements,attempt=0){
 if((r.compositionVersion??1)!==3)return planWorldTerrainV2(r,attempt);
 const hasVolcano=r.landscapes.some(l=>l.kind==='volcanic');
 const base=planWorldTerrainV2({...r,compositionVersion:2,terraces:Math.max(3,r.terraces),landscapes:r.biomeMode==='automatic'?r.landscapes.filter(l=>l.kind!=='volcanic'):r.landscapes},attempt);
 const terrain=structuredClone(base.terrain);for(const land of terrain.landmasses){land.cliffVariation=0;land.outline=roundOutline(land.outline);}
 const head=r.relief==='gentle'?440:r.relief==='rugged'?780:680;
 const origin=base.point(.5),side=base.point(.5,1),vx=(side.x-origin.x)/r.width,vz=(side.z-origin.z)/r.length;
 const world=(u:number,v:number)=>({x:(u*vz+v*vx)*r.width,z:(-u*vx+v*vz)*r.length});
 const floors=terrain.features.filter(f=>f.kind==='plateau'&&f.id.startsWith('composition-terrace-'));
 for(const [i,f]of floors.entries())if(f.kind==='plateau'){
  const boundary=terrain.landmasses[0].outline.map(p=>{const scale=.72+i/Math.max(1,floors.length-1)*.22;return {x:p.x*scale,z:p.z*scale};});
  if(!i)f.polygon=roundOutline(boundary);
  else{
   const start=-.30+i*.59/floors.length,end=.52,center=(start+end)/2,ru=(end-start)/2,rv=.28+.015*Math.sin(i*2.3+r.seed),phase=(r.seed%1000)*.01;
   const oval=Array.from({length:64},(_,k)=>{const a=k*Math.PI/32,jitter=1+.025*Math.cos(3*a+phase)+.012*Math.sin(5*a-phase);return world(center+Math.cos(a)*ru*jitter,Math.sin(a)*rv*jitter+.012*Math.sin(i*1.7+phase));});
   f.polygon=intersectOutline(oval,boundary);
  }
  f.heightM=floors.length===1?Math.min(180,head):24+(head-24)*Math.pow(1-i/(floors.length-1),1.5);
  // Broad shelves and short escarpments alternate; no continuous wall around every floor.
  f.edgeM=Math.max(3,f.edgeM*(i%2?.55:.85));
 }
 for(const f of terrain.features){if(f.kind==='ridge'||f.kind==='valley')f.points=curvedLine(f.points);if(f.kind==='plateau'&&!f.id.startsWith('composition-terrace-'))f.polygon=roundOutline(f.polygon);}
 const macro=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},{...terrain,features:floors});
 for(const f of terrain.features){
  if(f.kind==='mountain')f.heightM=Math.min(360,Math.max(230,f.heightM*1.5));
  if(f.kind==='plateau'&&f.id.startsWith('composition-lateral-')){
   const center={x:f.polygon.reduce((n,p)=>n+p.x,0)/f.polygon.length,z:f.polygon.reduce((n,p)=>n+p.z,0)/f.polygon.length};
   f.heightM=Math.max(24,Math.round(macro.height(center.x,center.z)/20)*20);
  }
  if(f.kind==='volcano'){f.heightM=Math.min(1200,head+350);f.craterDepthM=130;}
 }
 const summit=base.point(.17,.09);
 terrain.features.push({id:'composition-headwaters',kind:'mountain',...summit,radiusM:Math.max(15,Math.min(r.width,r.length)*.028),heightM:350,roughness:0});
 if(hasVolcano&&r.biomeMode==='automatic'){
  const center=base.point(.12,-.23),clearance=Math.min(...base.axis.map(p=>Math.hypot(p.x-center.x,p.z-center.z))),radius=Math.max(20,Math.min(Math.min(r.width,r.length)*.18,clearance*.72));
  terrain.features.push({id:'composition-volcano',kind:'volcano',...center,radiusM:radius,heightM:Math.min(1150,head+350),craterRadiusM:radius*.45,craterDepthM:130});
 }
 for(const f of terrain.features)if(f.kind==='valley'){
  const source=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},{...terrain,features:terrain.features.filter(q=>q!==f)});let floor=Infinity;
  for(let i=0;i<f.points.length;i++){
   const p=f.points[i];for(let k=0;k<16;k++){const a=k*Math.PI/8;floor=Math.min(floor,source.height(p.x+Math.cos(a)*f.widthM,p.z+Math.sin(a)*f.widthM));}
   floor=Math.min(floor,source.height(p.x,p.z));
  }
  f.depthM=Math.max(.5,Math.min(f.depthM,floor-3));
 }
 // The coastal biome is bounded by the actual rim, independent of relief amplification.
 const inland=compilePolygon(terrain.landmasses[0].outline);
 return {...base,terrain:parseArchipelago(terrain,{width:r.width,length:r.length}),
  provinces:base.provinces.filter(p=>inland(p.center.x,p.center.z)>=0)};
}
