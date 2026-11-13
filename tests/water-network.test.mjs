import test from 'node:test';
import assert from 'node:assert/strict';
import {compileWaterNetwork,validateWaterNetworkFields,WaterSpatialIndex} from '../src/water/profile.ts';
import {lakeSurfaceData} from '../src/water/geometry.ts';
import {waterChunkIds} from '../src/water/sectors.ts';
import {configureTerrain,terrainHeight,waterSurface,getTerrainConfig} from '../src/terrain.ts';
import {createProject} from '../src/studio-core/schema.ts';
import {putWater} from '../src/studio-core/source.ts';
import {parseWorld,defaultWorld} from '../src/world-data.ts';

/** Valley sloping to the sea at z = 240, a basin for the lake around z = 0, a cliff at z = -80. */
const relief=(x,z)=>{const valley=z<=-80?30+(-80-z)*.05:z<-40?12+(-40-z)*.1:z<60?12:12-(z-60)*.07;return valley-Math.max(0,8-Math.hypot(x,z)/5)*(Math.abs(z)<40?1:0)+Math.abs(x)*.05;};
const lake={id:'lake',kind:'lake',points:[{x:-25,z:-30},{x:25,z:-30},{x:30,z:25},{x:0,z:10},{x:-30,z:25}],width:1,level:11.5,depth:3};
const upper={id:'upper',points:[{x:0,z:-180},{x:0,z:-80},{x:0,z:-60},{x:0,z:-30}],width:5,level:0,depth:1,profile:{mode:'terrain',offset:-.3},to:{kind:'lake',id:'lake'},falls:[{at:1,top:29.5,bottom:14}]};
const lower={id:'lower',points:[{x:0,z:12},{x:0,z:120},{x:0,z:250}],width:6,level:0,depth:1.2,profile:{mode:'terrain',offset:-.3},from:{kind:'lake',id:'lake'},to:{kind:'sea'}};
const bodies=()=>compileWaterNetwork([lower,lake,upper],relief,0);
test('source → river → waterfall → lake → river → sea compiles coherently',()=>{
  const [down,lk,up]=bodies();
  for(const c of [down,lk,up])assert.deepEqual(c.diagnostics.filter(d=>d.severity==='ERROR'),[],c.id+': '+JSON.stringify(c.diagnostics));
  for(const c of [up,down])for(let i=1;i<c.points.length;i++)assert.ok(c.points[i].level<=c.points[i-1].level+1e-9,c.id+' never flows uphill');
  assert.deepEqual(up.falls,[{x:0,z:-80,top:29.5,bottom:14}],'waterfall keeps its high and low levels');
  assert.ok(up.points.at(-1).level>=lake.level-1e-9,'arrives at or above the lake');
  assert.ok(Math.abs(down.points[0].level-lake.level)<1e-9,'leaves the lake at its level');assert.ok(down.points.at(-1).ground<=0.5,'reaches the sea');
  assert.ok(!up.diagnostics.some(d=>d.code==='WATER_STEEP'),'the authored waterfall is not a « steep » warning');
});
test('network diagnostics: uphill link, gaps, sea not reached, cycle, waterfall above the arriving level',()=>{
  const codes=list=>compileWaterNetwork(list,relief,0).flatMap(c=>c.diagnostics.map(d=>d.code));
  assert.ok(codes([lake,{...upper,falls:undefined,profile:{mode:'manual',levels:[30,20,12,10]}}]).includes('WATER_LINK_UPHILL'));
  assert.ok(codes([lake,{...lower,points:[{x:0,z:60},{x:0,z:250}]}]).includes('WATER_LINK_GAP'));
  assert.ok(codes([lake,{...lower,points:[{x:0,z:12},{x:0,z:100}]}]).includes('WATER_SEA_GAP'));
  const a={id:'a',points:[{x:0,z:0},{x:0,z:50}],width:3,level:5,depth:1,to:{kind:'river',id:'b'}},b={id:'b',points:[{x:0,z:50},{x:0,z:0}],width:3,level:5,depth:1,to:{kind:'river',id:'a'}};
  assert.ok(codes([a,b]).includes('WATER_LINK_CYCLE'));
  assert.ok(codes([lake,{...upper,falls:[{at:1,top:40,bottom:14}]}]).includes('WATER_FALL_TOP'));
  assert.throws(()=>validateWaterNetworkFields({...lake,profile:{mode:'terrain',offset:0}}),/niveau constant/);
  assert.throws(()=>validateWaterNetworkFields({...upper,falls:[{at:0,top:5,bottom:1}]}),/intermédiaire/);
  assert.throws(()=>validateWaterNetworkFields({...upper,to:{kind:'sea',id:'x'}}),/mer/);
});
test('logical volumes: swim in the lake and the rivers, basin carved below the level; render ≠ truth',()=>{
  const index=new WaterSpatialIndex([lower,lake,upper],relief,0);
  const inLake=index.query(0,-10);assert.equal(inLake[0].level,11.5);assert.equal(inLake[0].flowX,0);
  configureTerrain({...defaultWorld().config,width:400,length:600},[],[lower,lake,upper]);
  assert.equal(waterSurface(0,-10),11.5);assert.ok(terrainHeight(0,-10)<11.5-1,'basin carved: '+terrainHeight(0,-10));
  assert.ok(waterSurface(0,100)!==null,'lower river volume');assert.equal(waterSurface(80,-10),null,'dry land beside');
  const surface=lakeSurfaceData(index.bodies[1]);let area=0;for(let i=0;i<surface.indices.length;i+=3){const [a,b,c]=[0,1,2].map(k=>surface.indices[i+k]*3),p=surface.positions;area+=Math.abs((p[b]-p[a])*(p[c+2]-p[a+2])-(p[b+2]-p[a+2])*(p[c]-p[a]))/2;}
  const poly=lake.points;let exact=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];exact+=a.x*b.z-b.x*a.z;}assert.ok(Math.abs(area-Math.abs(exact)/2)<1e-6,'concave outline fully covered');
  for(let i=0;i<surface.indices.length;i+=3){const [a,b,c]=[0,1,2].map(k=>surface.indices[i+k]*3),p=surface.positions,ny=(p[b+2]-p[a+2])*(p[c]-p[a])-(p[b]-p[a])*(p[c+2]-p[a+2]);assert.ok(ny>0,'upward faces');}
  void getTerrainConfig;
});
test('stable ids, sectors of a lake basin, V2 files and V3 sources accept the network fields',()=>{
  const p=createProject({name:'Eau',width:1000,length:1000});putWater(p,{...lake,points:lake.points.map(q=>({x:q.x*4,z:q.z*4}))});
  const ids=waterChunkIds(p.world,p.libraries.water.lake);assert.ok(ids.length>=4,'interior sectors '+ids.length);
  putWater(p,{...upper,points:upper.points.map(q=>({x:q.x,z:q.z}))});assert.deepEqual(p.libraries.water.upper.falls,upper.falls);
  const v2={...defaultWorld(),water:[{id:'pond',kind:'lake',points:[{x:-10,z:0},{x:10,z:0},{x:0,z:15}],width:1,level:2,depth:1}]};assert.equal(parseWorld(v2).water[0].kind,'lake');
});
