import {organicCaldera} from './caldera-organic.ts';
/** Point highs and continuous slopes first; native editable geometry only. */
import {parseArchipelago} from '../geography/archipelago-params.ts';
import {archipelagoField,shapeSeed,type Landmass,type ReliefFeature,type PointXZ} from '../geography/archipelago.ts';
import {randomStream} from './world-terrain-legacy.ts';
import {roundOutline,curvedLine} from './organic-outlines.ts';
import {polygonArea,type GeographicProvince} from './world-provinces.ts';
import type {MapRequirements} from './map-requirements.ts';
export function planWorldTerrainV4(r:MapRequirements,attempt=0){
 const s=r.islandStyle!,random=randomStream(shapeSeed(r.seed,'island-v4-relief')),phase=random()*Math.PI*2,
  minor=Math.min(r.width,r.length),angle=s.orientation*Math.PI/180;
 const aspect=s.model==='caldera'?1:s.elongation,fit=Math.min(r.width/(Math.abs(Math.cos(angle))/aspect+Math.abs(Math.sin(angle))),r.length/(Math.abs(Math.sin(angle))/aspect+Math.abs(Math.cos(angle))));
 const world=(u:number,v:number):PointXZ=>({x:(u*Math.cos(angle)+v*Math.sin(angle))*fit,z:(-u*Math.sin(angle)+v*Math.cos(angle))*fit});
 const point=(t:number,side=0)=>world(side,(t-.5)*.76);
 const landmasses:Landmass[]=[],features:ReliefFeature[]=[];
 const makeLand=(outline:PointXZ[],i:number):Landmass=>({id:'composition-land-'+i,name:i?'Île '+(i+1):'Terre principale',outline,
  coastNoiseM:0,coastWavelengthM:Math.max(50,minor*.2),beachWidthM:Math.max(5,Math.min(65,minor*.018)),shoreHeightM:.5,
  lowlandHeightM:Math.min(12,s.altitudeM*.05),hillHeightM:0,cliffs:0,cliffVariation:0});
 const addMassif=(id:string,p:PointXZ,radius:number,height:number,kind:'hill'|'mountain'='mountain')=>features.push({id:'composition-'+id,kind,...p,radiusM:Math.max(10,radius),heightM:height,roughness:0});
 if(s.model==='caldera'&&s.calderaShape==='organic'&&r.compositionVersion===5){
  for(const [i,island]of organicCaldera(random,world,r.diversity).entries()){landmasses.push(makeLand(island.outline,i));addMassif('caldera-summit-'+i,island.center,minor*island.width*.7,s.altitudeM*island.height);features.push({id:'composition-caldera-rim-'+i,kind:'ridge',points:island.points,widthM:Math.max(5,minor*island.width*.4),heightM:s.altitudeM*island.height*.2});}
  if(r.maritimePort&&r.welcomeVillage&&r.welcomeVillage!=='none'){const broad=landmasses.map((l,i)=>({l,i,area:polygonArea(l.outline)})).sort((a,b)=>b.area-a.area)[0],peak=features.find(f=>f.id==='composition-caldera-summit-'+broad.i);if(peak&&'x'in peak){const n=Math.hypot(peak.x,peak.z)||1,offset=minor*.045,center={x:peak.x+peak.x/n*offset,z:peak.z+peak.z/n*offset},radius=minor*.024;features.push({id:'composition-caldera-coastal-plain',kind:'plateau',polygon:roundOutline(Array.from({length:32},(_,i)=>({x:center.x+Math.cos(i*Math.PI/16)*radius,z:center.z+Math.sin(i*Math.PI/16)*radius*.8}))),heightM:Math.max(3,Math.min(8,s.altitudeM*.03)),edgeM:radius*.8,surface:true});}}
 }else if(s.model==='caldera'){
  const count=5+Math.floor(random()*3),ring=.29;
  for(let i=0;i<count;i++){
   const a=phase+i*Math.PI*2/count,half=Math.PI/count*(.62+random()*.15),thickness=.048+random()*.018,outline:PointXZ[]=[];
   for(const side of [1,-1])for(let j=0;j<32;j++){
    const t=side===1?j/31:1-j/31,b=a-half+t*half*2,rad=ring+side*thickness*(1+.10*Math.sin(t*Math.PI*3+phase+i));
    outline.push(world(Math.cos(b)*rad,Math.sin(b)*rad));
   }
   landmasses.push(makeLand(roundOutline(outline),i));
   const p=world(Math.cos(a)*ring,Math.sin(a)*ring),radius=minor*thickness*.65;
   addMassif('caldera-summit-'+i,p,radius,s.altitudeM*(.55+random()*.4));
   const points=Array.from({length:12},(_,j)=>{const b=a-half*.6+j/11*half*1.2;return world(Math.cos(b)*ring,Math.sin(b)*ring);});
   features.push({id:'composition-caldera-rim-'+i,kind:'ridge',points,widthM:Math.max(5,minor*thickness*.55),heightM:s.altitudeM*.2});
  }
 }else{
  const outline=Array.from({length:64},(_,i)=>{
   const a=i*Math.PI/32,k=1+r.diversity*(.075*Math.sin(3*a+phase)+.045*Math.sin(5*a-phase));
   return world(Math.cos(a)*.39/s.elongation*k,Math.sin(a)*.40*k);
  });landmasses.push(makeLand(outline,0));
  addMassif('broad-upland',world(-.02,.025),Math.min(minor,fit*.44),s.altitudeM*.16,'hill');
  addMassif('foothills',world(-.09,.13),Math.min(minor,fit*.25),s.altitudeM*.075,'hill');
  if(s.model==='volcanic'){
   const p=world(.02,-.04),radius=minor*.30;
   features.push({id:'composition-volcano',kind:'volcano',...p,radiusM:radius,heightM:s.altitudeM,craterRadiusM:radius*.19,craterDepthM:s.altitudeM*.32});
  }else{
   const side=s.model==='side-massif'?.12:0,center=world(side,-.04),gentle=s.model==='gentle';
   addMassif('main-massif',center,minor*(gentle?.27:.245),s.altitudeM*.75,gentle?'hill':'mountain');
   for(let i=0;i<3;i++){
    const v=-.23+i*.18,u=side+(random()-.5)*.07,p=world(u,v),radius=minor*(.115+random()*.04);
    addMassif('secondary-'+i,p,radius,s.altitudeM*(.20+random()*.23),gentle?'hill':'mountain');
   }
   features.push({id:'composition-spine',kind:'ridge',points:curvedLine([world(side-.02,-.24),world(side+.015,-.09),world(side-.02,.12)]),
    widthM:Math.max(5,minor*.09),heightM:s.altitudeM*.12});
  }
  if(s.plateaus>0)for(let i=0;i<Math.ceil(s.plateaus*3);i++){
   const p=world((i%2?1:-1)*.13,.06+i*.075),radius=minor*(.035+s.plateaus*.055);
   features.push({id:'composition-local-shelf-'+i,kind:'plateau',polygon:roundOutline(Array.from({length:24},(_,j)=>({x:p.x+Math.cos(j*Math.PI/12)*radius,z:p.z+Math.sin(j*Math.PI/12)*radius*.7}))),
    heightM:s.altitudeM*(.10+i*.04),edgeM:Math.max(3,radius*(.4-r.cliffs*.25))});
  }
  if(s.valleys>0&&s.model!=='volcanic')for(const side of [-1,1]){
   const points=curvedLine([world(side*.035,-.01),world(side*.10,.06),world(side*.16,.16)]),widthM=Math.max(5,minor*.025);
   const field=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},{landmasses,features,seabedDepthM:35,detailM:0,coastalReliefFadeM:Math.max(5,Math.min(150,minor*.025))});
   const floor=Math.min(...points.flatMap(p=>Array.from({length:8},(_,j)=>field.height(p.x+Math.cos(j*Math.PI/4)*widthM,p.z+Math.sin(j*Math.PI/4)*widthM))));
   const depthM=Math.min(s.altitudeM*.035*s.valleys,floor-4);
   if(depthM>=.5)features.push({id:'composition-valley-'+(side+1),kind:'valley',points,widthM,depthM});
  }
  if(r.type==='archipelago')for(let i=0;i<2;i++){
   const p=world((i?1:-1)*.39,.24),radius=minor*.035;
   landmasses.push(makeLand(Array.from({length:32},(_,j)=>({x:p.x+Math.cos(j*Math.PI/16)*radius,z:p.z+Math.sin(j*Math.PI/16)*radius})),i+1));
  }
 }
 const params={landmasses,features,seabedDepthM:35,detailM:0,coastalReliefFadeM:Math.max(5,Math.min(150,minor*.025))};
 // Scale summed features to the actual maximum, not each peak independently.
 for(let pass=0;pass<2;pass++){
  const field=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},params);
  let max=0;for(let z=0;z<72;z++)for(let x=0;x<72;x++)max=Math.max(max,field.height((x/71-.5)*r.width,(z/71-.5)*r.length));
  for(const f of features)if('x' in f)max=Math.max(max,field.height(f.x,f.z));
  const factor=s.altitudeM/Math.max(1,max);
  for(const f of features){if('heightM'in f)f.heightM=Math.max(1,f.heightM*factor);if('depthM'in f)f.depthM=Math.max(.5,f.depthM*factor);if(f.kind==='volcano')f.craterDepthM*=factor;}
 }
 return {terrain:parseArchipelago(params,{width:r.width,length:r.length}),axis:[] as PointXZ[],point,family:s.model,attempt,
  lakeCenter:undefined as PointXZ|undefined,provinces:[] as GeographicProvince[],landAreaM2:landmasses.reduce((n,l)=>n+polygonArea(l.outline),0)};
}
