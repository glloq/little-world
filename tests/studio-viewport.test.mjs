import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorCamera,poseFromContext,targetOf} from '../src/studio/viewport/camera-controller.ts';
import {checkPlacement} from '../src/studio/viewport/placement-rules.ts';
import {strokeDabs,localMean} from '../src/studio/viewport/brush-tool.ts';
import {eulerDegrees,quaternionFromDegrees} from '../src/studio/inspector.ts';
import {createProject,chunkAt} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';

const flat=()=>10,limits={minX:-1500,maxX:1500,minZ:-4000,maxZ:4000,ground:flat};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<e;
const cam=(mode='orbit')=>new EditorCamera(poseFromContext({x:30,y:60,z:40,mode,target:{x:0,y:10,z:0}},flat),mode,limits);
test('saved camera context round-trips (eye, target, mode, zoom)',()=>{
  const c=cam(),ctx=c.context();assert.ok(near(ctx.target.x,0,1e-6)&&near(ctx.target.y,10,1e-6)&&near(ctx.target.z,0,1e-6));
  const again=new EditorCamera(poseFromContext(ctx,flat),'orbit',limits).context();
  for(const k of ['x','y','z'])assert.ok(near(again[k],ctx[k])&&near(again.target[k],ctx.target[k]));
  const legacy=poseFromContext({x:5,y:150,z:7,mode:'map2d'},flat);const t=targetOf(legacy);assert.ok(near(t.x,5,1e-6)&&near(t.z,7,1e-6),'old contexts (no target) centre on their position');
});
test('orbit keeps the pivot, free look keeps the eye',()=>{
  const c=cam();c.rotate(80,-30);const t=c.target;assert.ok(near(t.x,0,1e-6)&&near(t.y,10,1e-6)&&near(t.z,0,1e-6));
  c.mode='free';const eye={...c.pose};c.rotate(-40,10);assert.ok(near(c.pose.x,eye.x)&&near(c.pose.y,eye.y)&&near(c.pose.z,eye.z));
});
test('wheel zooms towards the point under the cursor and is bounded',()=>{
  const c=cam(),before=c.pose.distance,point={x:40,y:10,z:-20},d0=Math.hypot(c.pose.x-point.x,c.pose.y-point.y,c.pose.z-point.z);
  c.zoomAt(point,-2);const d1=Math.hypot(c.pose.x-point.x,c.pose.y-point.y,c.pose.z-point.z);
  assert.ok(c.pose.distance<before&&d1<d0);
  for(let i=0;i<60;i++)c.zoomAt(point,-3);assert.ok(c.pose.distance>=2);
  for(let i=0;i<80;i++)c.zoomAt(null,3);assert.ok(c.pose.distance<=9000&&c.pose.y<=4000);
});
test('free flight crosses the island quickly, stays above ground and near the project',()=>{
  const c=cam();c.pose.pitch=0;let travelled=0;const x0=c.pose.x,z0=c.pose.z;
  for(let i=0;i<120;i++)c.fly(1/30,{forward:1,right:0,up:0,fast:true});travelled=Math.hypot(c.pose.x-x0,c.pose.z-z0);
  assert.equal(c.mode,'free');assert.ok(travelled>100,'4 s of fast flight covers several sectors: '+travelled);
  for(let i=0;i<200;i++)c.fly(.25,{forward:0,right:0,up:-1,fast:true});assert.ok(c.pose.y>=11.2,'never below ground');
  for(let i=0;i<2000;i++)c.fly(.25,{forward:0,right:1,up:0,fast:true});assert.ok(c.pose.x<=1500+1500&&c.pose.x>=-3000);
});
test('top view and focus use controlled transitions; persisted pose is the final one',()=>{
  const c=cam();c.toggleTop();assert.equal(c.context().mode,'top','context reports the destination while animating');
  while(c.update(.05));assert.equal(c.mode,'top');assert.ok(c.camera.isOrthographicCamera);
  const zoom=c.pose.zoom;c.zoomAt({x:20,y:10,z:20},-1);assert.ok(c.pose.zoom<zoom);
  c.pan(100,0,600);c.focus({x:100,y:10,z:100},2);const final=c.context();while(c.update(.05));
  assert.equal(c.mode,'orbit');for(const k of ['x','y','z'])assert.ok(near(c.context()[k],final[k],1e-6));
  assert.ok(near(c.target.x,100,1e-6)&&near(c.target.z,100,1e-6));
});
test('placement validity: bounds/deep water refuse, overlap/slope warn',()=>{
  const p=createProject({name:'Placement',width:400,length:400});
  putEntity(p,{id:'rock',name:'Rocher',kind:'prop',ownerChunkId:chunkAt(p.world,0,0),components:{Transform:{type:'Transform',position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'nature.rock'}}});
  const base={ground:()=>5,depth:()=>0,building:false,radius:1};
  assert.equal(checkPlacement(p,500,0,base).level,'invalid');
  assert.equal(checkPlacement(p,50,50,{...base,depth:()=>2}).level,'invalid');
  assert.equal(checkPlacement(p,.5,0,base).level,'warning');
  assert.equal(checkPlacement(p,50,50,{...base,ground:(x)=>x*2}).level,'warning');
  assert.equal(checkPlacement(p,50,50,base).level,'ok');
});
test('brush strokes resample the path; smoothing targets the local mean',()=>{
  const dabs=strokeDabs([{x:0,z:0},{x:10,z:0},{x:40,z:0}],10);assert.ok(dabs.length>=8&&dabs.every((d,i)=>!i||Math.hypot(d.x-dabs[i-1].x,d.z-dabs[i-1].z)<=9+1e-9));
  assert.equal(strokeDabs(Array.from({length:500},(_,i)=>({x:i*10,z:0})),2).length,96,'bounded number of dabs per stroke');
  assert.ok(near(localMean(()=>7,0,0,10),7));assert.ok(near(localMean((x)=>x,0,0,10),0,1e-9),'symmetric ramp averages to its centre');
});
test('inspector rotation in degrees round-trips through quaternions',()=>{
  const d={x:10,y:-35,z:5},q=quaternionFromDegrees(d),back=eulerDegrees(q);for(const k of ['x','y','z'])assert.ok(near(back[k],d[k],1e-6));
});
