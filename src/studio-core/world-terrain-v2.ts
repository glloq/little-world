/** V2: broad geographic floors first, then lateral landforms and drainage valleys.
 * V1 is frozen so existing saved worlds regenerate without geometry changes. */
import {blobOutline,parseArchipelago} from '../geography/archipelago-params.ts';
import {archipelagoField,shapeSeed,polylineDistance,compilePolygon,type PointXZ,type ReliefFeature} from '../geography/archipelago.ts';
import {planLegacyWorldTerrain,randomStream} from './world-terrain-legacy.ts';
import {convexOutline,cutPolygon,provinceMosaic,polygonArea,type GeographicProvince} from './world-provinces.ts';
import type {MapRequirements} from './map-requirements.ts';
export {randomStream} from './world-terrain-legacy.ts';
export function landscapeOrder(r:MapRequirements){
 const order=['mountain','volcanic','hills','plateau','forest','plain','meadow','lake','marsh','coast'];
 return r.biomeMode==='custom'?r.sequence:[...r.landscapes.map(l=>l.kind)].sort((a,b)=>order.indexOf(a)-order.indexOf(b));
}
export function planWorldTerrainV2(r:MapRequirements,attempt=0){
 if((r.compositionVersion??1)===1)return {...planLegacyWorldTerrain(r,attempt),provinces:[] as GeographicProvince[],landAreaM2:0};
 const topology=randomStream(shapeSeed(r.seed,'topology-v2')),relief=randomStream(shapeSeed(r.seed,'relief-v2'));
 const angle=topology()*Math.PI*2,phase=topology()*Math.PI*2,family=['central-valley','winding-valley','split-plateau','multiple-massifs'][Math.floor(topology()*4)];
 const bend=(family==='winding-valley'?.12:family==='central-valley'?.04:.075)*r.diversity;
 const world=(u:number,v:number):PointXZ=>({x:(u*Math.cos(angle)-v*Math.sin(angle))*r.width,z:(u*Math.sin(angle)+v*Math.cos(angle))*r.length});
 const point=(t:number,side=0)=>world(-.29+t*.76,Math.sin(t*Math.PI*2+phase)*bend*Math.sin(t*Math.PI)+side);
 const axis=Array.from({length:90},(_,i)=>point(.16+i*.84/89));
 // Main terrain occupies the island footprint, not a narrow buffer around WATER.
 const outline=convexOutline(blobOutline(0,0,r.width*.365,r.length*.365,28,phase));
 const scale=r.relief==='gentle'?.55:r.relief==='rugged'?1.35:1;
 const land={id:'composition-land',name:'Terre principale',outline,coastNoiseM:Math.min(r.width,r.length)*.004,coastWavelengthM:700,beachWidthM:35,shoreHeightM:.5,lowlandHeightM:18,hillHeightM:0,cliffs:0};
 const features:ReliefFeature[]=[],head=(105+relief()*70)*scale,levels=r.terraces;
 for(let i=0;i<levels;i++){
  const lean=i?(.18+relief()*.25)*(i%2?1:-1):0;
  // Different oblique fronts interlock across the island; broad rounded coastlines
  // and varied edges replace repeated parallel rectangular stairs.
  const threshold=-.30+i*.59/levels;
  const normal={x:-(Math.cos(angle)-lean*Math.sin(angle))/r.width,z:-(Math.sin(angle)+lean*Math.cos(angle))/r.length};
  const footprint=outline.map(p=>{const scale=levels===1?.94:.72+i/(levels-1)*.22;return {x:p.x*scale,z:p.z*scale};});
  const polygon=i?cutPolygon(footprint,normal,-threshold):footprint;
  features.push({id:'composition-terrace-'+i,kind:'plateau',polygon,heightM:i===levels-1?24:head*(1-i/levels),edgeM:Math.max(3,Math.min(Math.min(r.width,r.length)*(.014+(1-r.cliffs)*.022),Math.min(r.width,r.length)*.035/Math.max(1,levels-1))*(1-attempt*.2))});
 }
 const count=family==='multiple-massifs'?4:2+Math.floor(relief()*2);
 for(let i=0;i<count;i++){
  const center=point(.10+i*.16,(i%2?1:-1)*(.19+relief()*.035));
  const clearance=Math.min(...axis.map(p=>Math.hypot(p.x-center.x,p.z-center.z)));
  const radius=Math.max(15,Math.min(Math.min(r.width,r.length)*(.075+relief()*.02),clearance*.65));
  if(r.landscapes.some(l=>l.kind==='mountain'||l.kind==='hills'))features.push({id:'composition-massif-'+i,kind:r.landscapes.some(l=>l.kind==='mountain')?'mountain':'hill',...center,radiusM:radius,heightM:(110+relief()*230)*scale,roughness:.35});
  if(i<2){features.push({id:'composition-lateral-'+i,kind:'plateau',polygon:blobOutline(center.x,center.z,radius*.8,radius*.65,14,phase+i),heightM:24+(head-24)*(.4+i*.2),edgeM:Math.max(8,Math.min(100,radius*(.3+(1-r.cliffs)*.3)))});}
 }
 // Secondary valleys cross terrace fronts, providing broad passes and varied slopes.
 for(const sign of [-1,1]){
  const points=[point(.18,sign*.13),point(.40,sign*.11),point(.67,sign*.075)];
  const clearance=Math.min(...axis.map(p=>polylineDistance(points,p.x,p.z)));
  const widthM=Math.max(5,Math.min(Math.min(r.width,r.length)*.06,clearance*.6));
  const uncut=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},{seabedDepthM:35,detailM:0,landmasses:[land],features});
  let floor=Infinity;
  for(let k=1;k<points.length;k++){
   const a=points[k-1],b=points[k],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
   for(let i=0;i<=12;i++)for(const side of [-1,-.5,0,.5,1]){
    const x=a.x+dx*i/12-dz/length*widthM*side,z=a.z+dz*i/12+dx/length*widthM*side;floor=Math.min(floor,uncut.height(x,z));
   }
  }
  for(const p of [points[0],points[points.length-1]])for(let i=0;i<16;i++)for(const radius of [.5,1]){const a=i*Math.PI/8;floor=Math.min(floor,uncut.height(p.x+Math.cos(a)*widthM*radius,p.z+Math.sin(a)*widthM*radius));}
  // A ravine must not turn a low plain into an accidental inland sea.
  const depthM=Math.min(12+scale*12,floor-3);
  if(depthM>=.5)features.push({id:'composition-valley-'+(sign+1),kind:'valley',points,widthM,depthM});
 }
 if(r.landscapes.some(l=>l.kind==='hills')){const p=point(.7,-.19);features.push({id:'composition-hills',kind:'hill',...p,radiusM:Math.min(r.width,r.length)*.05,heightM:28*scale,roughness:.3});}
 if(r.cliffs>.15&&levels>1)features.push({id:'rl-cliff-composition-0',kind:'ridge',points:[point(.2,.14),point(.32,.16),point(.43,.14)],widthM:Math.max(5,Math.min(r.width,r.length)*.004),heightM:12+r.cliffs*48});
 if(r.landscapes.some(l=>l.kind==='volcanic')){const p=point(.12,-.23),radius=Math.min(r.width,r.length)*.07;features.push({id:'composition-volcano',kind:'volcano',...p,radiusM:radius,heightM:180*scale,craterRadiusM:radius*.18,craterDepthM:25});}
 let lakeCenter:PointXZ|undefined;
 if(r.lakes||r.landscapes.some(l=>l.kind==='lake')){
  const mountains=features.filter(f=>f.kind==='mountain'||f.kind==='hill'||f.kind==='volcano');
  const clearance=(q:PointXZ)=>Math.min(...mountains.map(f=>'radiusM' in f?Math.hypot(q.x-f.x,q.z-f.z)/f.radiusM:Infinity));
  lakeCenter=[point(.72,.16),point(.72,-.16),point(.79,.13),point(.79,-.13)].sort((a,b)=>clearance(b)-clearance(a))[0];
  const radius=Math.min(70,Math.min(r.width,r.length)*.045);
  features.push({id:'composition-lake-bank',kind:'plateau',polygon:blobOutline(lakeCenter.x,lakeCenter.z,radius*1.5,radius*1.5,20,phase),heightM:22,edgeM:5},{id:'composition-lake-basin',kind:'basin',...lakeCenter,radiusM:radius,depthM:9});
 }
 const landmasses=[land];
 if(r.type==='archipelago')for(let i=0;i<2;i++){const a=angle+Math.PI/2+i*Math.PI;landmasses.push({...land,id:'composition-islet-'+i,name:'Îlot '+(i+1),outline:blobOutline(Math.cos(a)*r.width*.39,Math.sin(a)*r.length*.39,r.width*.05,r.length*.05,14,phase+i),coastNoiseM:2});}
 const order=landscapeOrder(r),inland=compilePolygon(outline);
 let lastLand=0;for(let i=0;i<axis.length;i++)if(inland(axis[i].x,axis[i].z)>10)lastLand=i;
 const coastT=.16+lastLand*.84/89-.01;
 const sites:{point:PointXZ;station?:number}[]=order.map((kind,i)=>{
  let t=.10+(i+.5)/order.length*.77;
  if(r.biomeMode==='automatic'&&kind==='marsh')t=Math.min(.76,coastT-.08);
  if(kind==='coast'&&(r.biomeMode==='automatic'||i===order.length-1))t=coastT;
  return {point:point(t),station:i};
 });
 // Peripheral sites produce real lateral provinces, not decorative circles beside a stripe.
 const sideCount=Math.min(8,16-sites.length);
 for(let i=0;i<sideCount;i++)sites.push({point:point(.08+Math.floor(i/2)/Math.max(1,Math.ceil(sideCount/2)-1)*.72,(i%2?1:-1)*(.19+topology()*.035))});
 if(!sites.length)sites.push({point:world(0,0)});
 const provinces=provinceMosaic(outline,sites);
 return {terrain:parseArchipelago({seabedDepthM:35,detailM:0,landmasses,features},{width:r.width,length:r.length}),axis,point,family,attempt,lakeCenter,provinces,landAreaM2:polygonArea(outline)};
}
