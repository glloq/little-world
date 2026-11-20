import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPisteGrid,groomedProfile,liftCablePath,polylineLength,routePiste,PISTE_GRADES} from '../src/snow/resort-planner.ts';
import {boardResortLift,resortLifts,stepResortRide} from '../src/snow/ski-resort.ts';
import {parseSkiArea,skiAreasOf,skiGeography} from '../src/snow/ski-area.ts';
import {archipelagoField,summitShapingCurve} from '../src/geography/archipelago.ts';
import {parseArchipelago} from '../src/geography/archipelago-params.ts';
import {validatePiste} from '../src/snow/snow-pistes.ts';

const bounds={minX:-1000,maxX:1000,minZ:-1000,maxZ:1000};
// A cone: steep near the top, like the Cimes summit before reshaping.
const cone=(x,z)=>Math.max(0,400-Math.hypot(x,z)*.55);
const env={bounds,height:cone,blocked:()=>false};

test('routed pistes descend within the grade of their difficulty and avoid each other',()=>{
 const grid=buildPisteGrid(env,{minX:-700,maxX:700,minZ:-700,maxZ:700});
 const red=routePiste(grid,{x:0,z:-60},{difficulty:'red',widthM:16,stopAltitude:150});
 assert.ok(red&&red.length>20);
 for(let i=1;i<red.length;i++)assert.ok(cone(red[i].x,red[i].z)<=cone(red[i-1].x,red[i-1].z)+.6,'never climbs');
 const blue=routePiste(grid,{x:0,z:60},{difficulty:'blue',widthM:18,stopAltitude:150,avoid:[red]});
 assert.ok(blue&&polylineLength(blue)>polylineLength(red),'a gentler piste needs a longer traverse');
 const profile=groomedProfile(blue,cone,10);
 for(let i=1;i<profile.length;i++){
  const d=Math.hypot(blue[i].x-blue[i-1].x,blue[i].z-blue[i-1].z);
  assert.ok(profile[i]<profile[i-1],'groomed profile strictly descends');
  assert.ok((profile[i-1]-profile[i])/d<PISTE_GRADES.blue.max+.25);
 }
});
test('groomed piste relief is continuous, follows its levels and summit shaping is monotone',()=>{
 const shaping=summitShapingCurve({fromM:100,rangeM:300,scale:.45,power:1});
 let previous=-Infinity;for(let h=0;h<900;h+=5){const v=shaping(h);assert.ok(v>=previous);previous=v;}
 assert.equal(shaping(80),80);
 const world={seed:3,seaLevel:0,width:2000,length:2000};
 const base={seabedDepthM:20,detailM:0,summitShaping:{fromM:60,rangeM:200,scale:.5,power:1},
  landmasses:[{id:'l',name:'Île',outline:[{x:-800,z:-800},{x:800,z:-800},{x:800,z:800},{x:-800,z:800}],coastNoiseM:0,coastWavelengthM:400,beachWidthM:20,shoreHeightM:2,lowlandHeightM:10,hillHeightM:0,cliffs:0}],
  features:[{id:'m',kind:'mountain',x:0,z:-300,radiusM:700,heightM:250,roughness:0}]};
 const raw=archipelagoField(world,parseArchipelago(base,world));
 // Sparse, bent authoring (a Studio edit): the compiled run is densified and blended.
 const points=[{x:0,z:-200},{x:20,z:-120},{x:0,z:-40},{x:-30,z:40},{x:0,z:120}];
 const levels=groomedProfile(points,raw.height,10);
 const field=archipelagoField(world,parseArchipelago({...base,features:[...base.features,{id:'piste:test',kind:'piste',points,levels,widthM:20,edgeM:10}]},world));
 assert.ok(Math.abs(field.height(20,-120)-levels[1])<1.5,'centre line follows the authored level');
 // A discontinuity shows as a jump at any resolution; cut banks stay below 1:1.6.
 let worst=0;for(let x=-60;x<60;x+=.25)for(let z=-200;z<120;z+=.25)
  worst=Math.max(worst,Math.abs(field.height(x+.25,z)-field.height(x,z)),Math.abs(field.height(x,z+.25)-field.height(x,z)));
 assert.ok(worst<.45,'no step in the groomed surface: '+worst);
});
test('lift cables keep clearance above the snow and stations stay low',()=>{
 const line=[{x:0,z:-600},{x:0,z:-80}];
 for(const kind of ['gondola','chairlift']){
  const path=liftCablePath(kind,line,cone);
  assert.ok(path[0].y-cone(0,-600)<2&&path.at(-1).y-cone(0,-80)<2,'low boarding and arrival');
  for(let i=1;i<path.length;i++)for(let t=.1;t<1;t+=.1){
   const x=path[i-1].x+(path[i].x-path[i-1].x)*t,z=path[i-1].z+(path[i].z-path[i-1].z)*t,y=path[i-1].y+(path[i].y-path[i-1].y)*t;
   const s=Math.hypot(x-line[0].x,z-line[0].z);if(s<8||s>512)continue;
   assert.ok(y-1.1>cone(x,z)+1.5,kind+' carrier clears the snow at '+s.toFixed(0)+' m');
  }
 }
 const drag=liftCablePath('draglift',line,cone);
 assert.ok(drag.every(p=>Math.abs(p.y-1.1-cone(p.x,p.z))<.01),'draglift riders stay on the snow');
});
test('every authored lift carries its rider from the boarding area to the top station',()=>{
 const area=(id,kind,liftPath)=>({version:1,id,name:id,points:[{x:5,z:-80},{x:5,z:-600}],widthM:12,snowLineM:0,equipment:'skis',lift:true,difficulty:'red',liftKind:kind,liftName:id,liftPath});
 const lifts=resortLifts([area('a','gondola',[{x:0,z:-600},{x:0,z:-90}]),area('b','chairlift',[{x:40,z:-500},{x:40,z:-150}]),area('c','draglift',[{x:-40,z:-500},{x:-40,z:-300}])],cone);
 assert.deepEqual(lifts.map(l=>l.kind),['gondola','chairlift','draglift']);
 for(const lift of lifts){
  const base=lift.lift.path[0],top=lift.lift.path.at(-1);
  const active=boardResortLift(lifts,{x:base.x+1,y:cone(base.x+1,base.z),z:base.z},cone(base.x+1,base.z),10);
  assert.ok(active&&active.lift.id===lift.id,'boards the nearest lift');
  let arrived=null,highest=-Infinity;
  for(let t=10;t<10+3600&&!arrived;t+=1/30){
   const step=stepResortRide(active,t);
   if(step.kind==='riding')highest=Math.max(highest,step.pose.y);
   if(step.kind==='arrived')arrived=step.top;
  }
  assert.ok(arrived,'ride finishes');
  assert.ok(Math.hypot(arrived.x-top.x,arrived.z-top.z)<.01,'dropped at the top station');
  assert.ok(highest>cone(top.x,top.z)-3,lift.kind+' rides up to the top');
 }
 assert.equal(boardResortLift(lifts,{x:300,y:0,z:0},0,1),null);
});
test('ski areas: optional difficulty and lift line, main run first, extra runs in geography',()=>{
 const main=parseSkiArea({version:1,id:'composition-alpine',name:'Main',points:[{x:0,z:0},{x:0,z:50}],widthM:10,snowLineM:10,equipment:'skis',lift:true},bounds);
 const extra=parseSkiArea({version:1,id:'alpine:b',name:'B',points:[{x:10,z:0},{x:10,z:50}],widthM:10,snowLineM:10,equipment:'skis',lift:true,difficulty:'black',liftKind:'draglift',liftPath:[{x:12,z:50},{x:12,z:0}]},bounds);
 assert.throws(()=>parseSkiArea({...extra,difficulty:'purple'},bounds));
 assert.throws(()=>parseSkiArea({...extra,liftPath:[{x:0,z:0}]},bounds));
 assert.deepEqual(skiAreasOf({[extra.id]:extra,[main.id]:main}).map(a=>a.id),['composition-alpine','alpine:b']);
 const geo=skiGeography({[extra.id]:extra,[main.id]:main});
 assert.equal(geo.ski.points,main.points);assert.equal(geo.skiRuns.length,1);
 const v=validatePiste(extra.points,10,(x,z)=>100-z*.2,{minDrop:5});assert.ok(v.ok,v.diagnostics.join());
});
