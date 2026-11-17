/** Frozen V1 composition. Preserve its geometry for saved requirements without a compositionVersion. */
import {blobOutline,parseArchipelago} from '../geography/archipelago-params.ts';
import {shapeSeed,type PointXZ,type ReliefFeature} from '../geography/archipelago.ts';
import type {MapRequirements} from './map-requirements.ts';
export function randomStream(seed:number){
 let s=seed>>>0;
 return ()=>{s=(s+0x6d2b79f5)>>>0;let t=Math.imul(s^(s>>>15),s|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}
export function planLegacyWorldTerrain(r:MapRequirements,attempt=0){
 const topology=randomStream(shapeSeed(r.seed,'topology')),relief=randomStream(shapeSeed(r.seed,'relief'));
 const angle=topology()*Math.PI*2,phase=topology()*Math.PI*2;
 const family=['central-valley','winding-valley','split-plateau','multiple-massifs'][Math.floor(topology()*4)];
 const bend=(family==='winding-valley'?.12:family==='central-valley'?.035:family==='split-plateau'?.065:.08)*( .6+topology()*.4)*r.diversity;
 const point=(t:number,side=0):PointXZ=>{
  const u=-.29+t*.76,v=Math.sin(t*Math.PI*2+phase)*bend*Math.sin(t*Math.PI)+side;
  return {x:(u*Math.cos(angle)-v*Math.sin(angle))*r.width,z:(u*Math.sin(angle)+v*Math.cos(angle))*r.length};
 };
 const polygon=(start:number,end:number,width:number)=>{
  const count=12,a:PointXZ[]=[],b:PointXZ[]=[];
  for(let i=0;i<count;i++){const u=i/(count-1),t=start+(end-start)*u,taper=t>.72?Math.max(.16,1-(t-.72)*3):1,w=width*(.5+.5*Math.sqrt(Math.sin(u*Math.PI)))*(.9+.13*Math.sin(t*13+phase)+.06*Math.sin(t*29-phase))*taper;a.push(point(t,w));b.push(point(t,-w));}
  return [...a,...b.reverse()];
 };
 const scale=r.relief==='gentle'?.5:r.relief==='rugged'?1.4:1;
 const features:ReliefFeature[]=[];
 // Overlapping downstream terraces: last plateau wins natively, giving a coherent
 // descending thalweg. Wide feathered banks avoid rectangular slabs and repeated walls.
 const levels=r.terraces,head=90*scale+relief()*75*scale;
 for(let i=0;i<levels;i++)features.push({id:'composition-terrace-'+i,kind:'plateau',polygon:polygon(-.025+i*.82/levels,.86+(levels===1?1:i/(levels-1))*.12,.065+relief()*.018),heightM:i===levels-1?2:head*(1-i/(levels-1||1)),edgeM:Math.max(3,Math.min(r.width,r.length)*(.012+(1-r.cliffs)*.016)*(1-attempt*.2))});
 // Massifs and lateral shelves do not cross the planned drainage corridor.
 const count=family==='multiple-massifs'?4:2+Math.floor(relief()*2);
 for(let i=0;i<count;i++){
  const p=point(.06+i*.19,(i%2?1:-1)*(.19+relief()*.04));
  const radius=Math.min(r.width,r.length)*(.075+relief()*.025);
  if(r.landscapes.some(l=>l.kind==='mountain'||l.kind==='hills'))features.push({id:'composition-massif-'+i,kind:r.landscapes.some(l=>l.kind==='mountain')?'mountain':'hill',...p,radiusM:radius,heightM:(120+relief()*260)*scale,roughness:.35+relief()*.3});
  if(i<2&&r.landscapes.some(l=>l.kind==='plateau'))features.push({id:'composition-side-'+i,kind:'plateau',polygon:blobOutline(p.x,p.z,radius*.9,radius*.7,12,phase+i),heightM:head*(.6+i*.2),edgeM:Math.max(5,40*(1-r.cliffs))});
 }
 if(r.landscapes.some(l=>l.kind==='hills')&&r.landscapes.some(l=>l.kind==='mountain')){
  const p=point(.72,-.19);features.push({id:'composition-hills',kind:'hill',...p,radiusM:Math.min(r.width,r.length)*.07,heightM:35*scale,roughness:.3});
 }
 if(r.cliffs>.15&&r.terraces>1)features.push({id:'rl-cliff-composition-0',kind:'ridge',points:[point(.16,.135),point(.28,.15),point(.43,.14)],widthM:Math.max(5,Math.min(r.width,r.length)*.004),heightM:15+r.cliffs*65});
 if(r.landscapes.some(l=>l.kind==='volcanic')){const p=point(.17,-.22),radius=Math.min(r.width,r.length)*.09;features.push({id:'composition-volcano',kind:'volcano',...p,radiusM:radius,heightM:200*scale,craterRadiusM:radius*.18,craterDepthM:30});}
 let lakeCenter:PointXZ|undefined;
 if(r.lakes||r.landscapes.some(l=>l.kind==='lake')){
  const spots=[point(.67,.18),point(.67,-.18),point(.77,.16),point(.77,-.16)];
  const mountains=features.filter(f=>f.kind==='mountain'||f.kind==='hill'||f.kind==='volcano');
  const clearance=(q:PointXZ)=>Math.min(...mountains.map(f=>('radiusM' in f?Math.hypot(q.x-f.x,q.z-f.z)/f.radiusM:Infinity)));
  lakeCenter=spots.sort((a,b)=>clearance(b)-clearance(a))[0];const radius=Math.min(70,Math.min(r.width,r.length)*.045);
  features.push({id:'composition-lake-bank',kind:'plateau',polygon:blobOutline(lakeCenter.x,lakeCenter.z,radius*1.5,radius*1.5,20,phase),heightM:22,edgeM:5},
   {id:'composition-lake-basin',kind:'basin',...lakeCenter,radiusM:radius,depthM:9});
 }
 const land={id:'composition-land',name:'Terre principale',outline:blobOutline(0,0,r.width*.365,r.length*.365,24,phase),coastNoiseM:Math.min(r.width,r.length)*.008,coastWavelengthM:500,beachWidthM:30,shoreHeightM:1,lowlandHeightM:4,hillHeightM:0,cliffs:r.cliffs*.3};
 const landmasses=[land];
 if(r.type==='archipelago')for(let i=0;i<2;i++){const a=angle+Math.PI/2+i*Math.PI;landmasses.push({...land,id:'composition-islet-'+i,name:'Îlot '+(i+1),outline:blobOutline(Math.cos(a)*r.width*.37,Math.sin(a)*r.length*.37,r.width*.055,r.length*.055,12,phase+i),coastNoiseM:4});}
 return {terrain:parseArchipelago({seabedDepthM:35,detailM:0,landmasses,features},{width:r.width,length:r.length}),
  axis:Array.from({length:90},(_,i)=>point(.04+i*.96/89)),point,family,attempt,lakeCenter};
}
