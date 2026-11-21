import test from 'node:test';
import assert from 'node:assert/strict';
import {WaterSpatialIndex,polygonSignedDistance} from '../src/water/profile.ts';
import {waterRibbonData,lakeRenderData,lakeSurfaceData,FALL_SHEET_ROWS,LAKE_SHORE_BAND} from '../src/water/geometry.ts';
import {waterDetailFor} from '../src/render/water-look.ts';

// Doc 108: render-only water data. The logical water (levels, swimming) is never changed by it.
const fallRiver={id:'falls',points:[{x:0,z:0},{x:0,z:-30},{x:0,z:-60},{x:0,z:-90}],width:6,depth:1,level:0,
 profile:{mode:'manual',levels:[40,38,36,11]},falls:[{at:2,top:36,bottom:14}]};
const relief=(_x,z)=>z>-60?45:10;

test('a waterfall becomes a curved sheet between its high and low levels, the pool restarts below',()=>{
 const index=new WaterSpatialIndex([fallRiver],relief,0),c=index.bodies[0],data=waterRibbonData(c);
 const rows=data.positions.length/6;
 assert.equal(rows,c.points.length+FALL_SHEET_ROWS,'one row per point plus the sheet rows');
 assert.equal(data.flow.length,rows*8,'4 flow floats per vertex');
 // Sheet rows descend monotonically from the lip to the bottom level and are thrown downstream.
 const top=c.falls[0],lip=c.points.findIndex(p=>Math.abs(p.level-top.top)<1e-6&&Math.abs(p.z-top.z)<1e-6);
 let previous=data.positions[lip*6+1];
 for(let k=1;k<=FALL_SHEET_ROWS;k++){const y=data.positions[(lip+k)*6+1],z=(data.positions[(lip+k)*6+2]+data.positions[(lip+k)*6+5])/2;
  assert.ok(y<previous,'sheet descends');previous=y;assert.ok(z<top.z,'thrown downstream');
  assert.equal(data.flow[(lip+k)*8+2],1,'white water on the sheet');}
 assert.ok(Math.abs(previous-(top.bottom+.04))<1e-6,'sheet ends at the pool level');
 // Strips: (points-1) quads, +sheet quads, minus the skipped sheet→pool fold.
 assert.equal(data.indices.length,(c.points.length-1+FALL_SHEET_ROWS-1)*6);
 // Plunge pool foam right below the fall, fading downstream; along keeps increasing.
 const pool=lip+FALL_SHEET_ROWS+1;assert.ok(data.flow[pool*8+3]>.9);assert.ok(data.flow[(pool+8)*8+3]<data.flow[pool*8+3]);
 for(let r=1;r<rows;r++)assert.ok(data.flow[r*8]>=data.flow[(r-1)*8]-1e-6,'along never runs backwards');
 // Render data never changes the logical surface.
 assert.ok(Math.abs(index.query(0,-80)[0].level-c.points.find(p=>Math.abs(p.z+80)<1.6).level)<.2);
});

test('rush follows the water slope: calm reach < steep reach, banks marked -1/+1',()=>{
 const river={id:'r',points:[{x:0,z:0},{x:0,z:-100},{x:0,z:-130}],width:8,depth:1,level:0,profile:{mode:'manual',levels:[20,19.5,14]}};
 const c=new WaterSpatialIndex([river],()=>30,0).bodies[0],data=waterRibbonData(c);
 const rushAt=z=>{const i=c.points.findIndex(p=>Math.abs(p.z-z)<1.6);return data.flow[i*8+2];};
 assert.ok(rushAt(-50)<.1,'calm');assert.ok(rushAt(-115)>.9,'rapid');
 assert.equal(data.flow[1],-1);assert.equal(data.flow[5],1);
});

test('lake render surface keeps the outline area, faces up and grades the shore band',()=>{
 const poly=[{x:0,z:0},{x:60,z:0},{x:60,z:40},{x:30,z:15},{x:0,z:40}];
 const lake={id:'lake',kind:'lake',points:poly,width:4,depth:2,level:5};
 const c=new WaterSpatialIndex([lake],()=>9,0).bodies[0],data=lakeRenderData(c),coarse=lakeSurfaceData(c);
 const area=(p,ix)=>{let s=0;for(let i=0;i<ix.length;i+=3){const [a,b,d]=[0,1,2].map(k=>ix[i+k]*3);s+=(p[b+2]-p[a+2])*(p[d]-p[a])-(p[b]-p[a])*(p[d+2]-p[a+2]);}return s;};
 assert.ok(Math.abs(area(data.positions,data.indices)-area(coarse.positions,coarse.indices))<1e-6,'same area, same (upward) winding');
 assert.ok(data.indices.length>coarse.indices.length,'subdivided');
 for(let i=0;i<data.positions.length/3;i++){
  const x=data.positions[i*3],z=data.positions[i*3+2],d=polygonSignedDistance(poly,x,z),edge=data.flow[i*4+1];
  assert.equal(data.flow[i*4+2],-1,'lake flag');
  if(d<.01)assert.ok(edge>.99,'shore vertex');if(d>=LAKE_SHORE_BAND)assert.equal(edge,0,'open water');
 }
 const big={...lake,points:poly.map(p=>({x:p.x*40,z:p.z*40}))},bigData=lakeRenderData(new WaterSpatialIndex([big],()=>9,0).bodies[0]);
 assert.ok(bigData.indices.length/3<40000,'bounded triangle count on a large lake: '+bigData.indices.length/3);
});

test('water detail follows the presentation budget; economy keeps static colours only',()=>{
 assert.equal(waterDetailFor(0),1);assert.ok(waterDetailFor(1)<1&&waterDetailFor(1)>waterDetailFor(2));
 assert.equal(waterDetailFor(3),0);assert.equal(waterDetailFor(0,true),0);
});
