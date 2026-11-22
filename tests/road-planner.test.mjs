import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planRoad,planRoadTiered,bridgeSites,nearestRoadPoint,ROAD_POLICIES} from '../src/paths/road-planner.ts';
import {auditRoads} from '../src/paths/road-audit.ts';
import {roadPaths,bridgePlacement,repairPath} from '../src/studio-core/road-network.ts';
import {auditProjectRoads} from '../src/studio-core/road-audit.ts';
import {parseProject} from '../src/studio-core/schema.ts';

const bounds={minX:-400,maxX:400,minZ:-400,maxZ:400};
/** Synthetic land: `height` plus an optional straight brook along x = 0 (2 m wide) and a round lake. */
const land=(height,{brook=false,lake=null}={})=>{
 const inBrook=(x,m=0)=>brook&&Math.abs(x)<=1+m,inLake=(x,z,m=0)=>lake&&Math.hypot(x-lake.x,z-lake.z)<=lake.r+m;
 const h=(x,z)=>height(x,z)-(inBrook(x)?.8:0);
 return {ctx:{bounds,height:h,seaLevel:0,blocked:(x,z,m)=>inBrook(x,m)||inLake(x,z,m),
   streams:brook?[{id:'brook',points:Array.from({length:81},(_,i)=>({x:0,z:-400+i*10,half:1,level:height(0,-400+i*10)-.3}))}]:[]},
  env:{height:h,seaLevel:0,bridges:[],water:(x,z)=>inBrook(x)?[{id:'brook',level:height(x,z)-.3,lake:false,flowX:0,flowZ:1}]:inLake(x,z)?[{id:'lake',level:height(x,z)+1,lake:true,flowX:0,flowZ:0}]:[]}};
};
const paths=(road,kind='dirt',width=3)=>roadPaths('r',road,{kind,width});
const length=pts=>pts.slice(1).reduce((n,q,i)=>n+Math.hypot(q.x-pts[i].x,q.z-pts[i].z),0);

test('flat ground: a road is close to the straight line and stays sound', () => {
 const {ctx,env}=land(()=>10),road=planRoad([{x:-300,z:-200},{x:300,z:150}],ctx,ROAD_POLICIES.road);
 assert.equal(road.pieces.length,1);assert.equal(road.bridges.length,0);
 assert.ok(road.lengthM<Math.hypot(600,350)*1.08,String(road.lengthM));
 const audit=auditRoads(paths(road),env).totals;
 assert.deepEqual([audit.underwaterM,audit.steepM,audit.fallLineM],[0,0,0]);
});

test('steep flank: the road climbs by traverses, never up the fall line', () => {
 // 40 % slope facing +x: the straight line would climb at 40 %.
 const {ctx,env}=land(x=>20+Math.max(0,x+200)*.4),from={x:-300,z:0},to={x:150,z:0};
 const road=planRoad([from,to],ctx,ROAD_POLICIES.road);
 assert.equal(road.pieces.length,1,road.reason);
 const line=road.pieces[0];
 assert.ok(length(line)>Math.hypot(450,140)*1.6,'longer than the direct climb: '+length(line));
 const a=auditRoads(paths(road),env);
 assert.ok(a.paths[0].maxGrade<=ROAD_POLICIES.road.maxGrade*1.6,'gradient '+a.paths[0].maxGrade);
 assert.ok(a.totals.fallLineM<10,'fall line '+a.totals.fallLineM);
 assert.deepEqual(line[0],from);assert.deepEqual(line.at(-1),to);
});

test('impossible slope fails with a reason; a steeper tier may succeed', () => {
 const {ctx}=land(x=>20+Math.max(0,x)*3);
 const none=planRoad([{x:-200,z:0},{x:200,z:0}],ctx,ROAD_POLICIES.road);
 assert.equal(none.pieces.length,0);assert.ok(none.reason);
 const gentle=land(x=>20+Math.max(0,x+100)*.28),tiered=planRoadTiered([{x:-200,z:0},{x:150,z:0}],gentle.ctx,[ROAD_POLICIES.road,ROAD_POLICIES.trail,ROAD_POLICIES.steep]);
 assert.ok(tiered.pieces.length&&tiered.policy);
});

test('brook: crossed once, square, on a bridge laid along the road; no surface in the water', () => {
 const {ctx,env}=land(()=>10,{brook:true}),sites=bridgeSites(ctx,ROAD_POLICIES.road);
 assert.ok(sites.length>20);assert.ok(sites.every(s=>Math.abs(s.axisZ)<1e-9&&s.spanM>=5.6));
 // A diagonal request: the road must still cross at a right angle.
 const road=planRoad([{x:-250,z:-200},{x:250,z:200}],ctx,ROAD_POLICIES.road);
 assert.equal(road.bridges.length,1);assert.equal(road.pieces.length,2);
 const site=road.bridges[0],b=bridgePlacement(site,ctx.height),[left,right]=road.pieces;
 // Pieces stop at the two bridge ends, with a straight stub in the bridge axis.
 const ends=[left.at(-1),right[0]].sort((p,q)=>p.x-q.x),banks=[site.a,site.b].sort((p,q)=>p.x-q.x);
 for(let i=0;i<2;i++)assert.ok(Math.hypot(ends[i].x-banks[i].x,ends[i].z-banks[i].z)<.02);
 assert.ok(Math.abs(left.at(-2).z-left.at(-1).z)<.02&&Math.abs(right[1].z-right[0].z)<.02,'stubs along the deck');
 assert.ok(Math.abs(Math.sin(b.yaw))<1e-9,'deck along x');assert.ok(b.stretch>=1);
 const audit=auditRoads(paths(road),{...env,bridges:[{id:'b',x:b.x,z:b.z,axisX:site.axisX,axisZ:site.axisZ,lengthM:site.spanM}]}).totals;
 assert.equal(audit.underwaterM,0);assert.equal(audit.orphanBridges,0);
});

test('lake and sea are never crossed', () => {
 const {ctx,env}=land(()=>10,{lake:{x:0,z:0,r:120}}),road=planRoad([{x:-250,z:0},{x:250,z:0}],ctx,ROAD_POLICIES.road);
 assert.equal(road.bridges.length,0);assert.equal(auditRoads(paths(road),env).totals.underwaterM,0);
 assert.ok(road.pieces[0].every(q=>Math.hypot(q.x,q.z)>121));
 assert.equal(nearestRoadPoint(ctx,{x:0,z:0},3,60),null);
 const moved=nearestRoadPoint(ctx,{x:110,z:0},3,60);assert.ok(moved&&Math.hypot(moved.x,moved.z)>123);
});

test('a branch follows the existing road and leaves it where it diverges', () => {
 const {ctx}=land(()=>10),trunk=planRoad([{x:-300,z:0},{x:300,z:0}],ctx,ROAD_POLICIES.road);
 const branch=planRoad([{x:-300,z:0},{x:150,z:250}],{...ctx,network:trunk.pieces},ROAD_POLICIES.road);
 assert.equal(branch.pieces.length,1);
 const [start]=branch.pieces[0];
 const trunkZ=trunk.pieces[0][Math.floor(trunk.pieces[0].length/2)].z;
 assert.ok(Math.abs(start.z-trunkZ)<.5&&start.x>-250,'starts on the trunk, away from the shared origin: '+JSON.stringify(start));
 assert.ok(branch.lengthM<Math.hypot(450,250),'only the new part is created');
});

test('same input, same road', () => {
 const {ctx}=land((x,z)=>20+Math.sin(x/60)*8+Math.cos(z/45)*6,{brook:true}),run=()=>JSON.stringify(planRoad([{x:-300,z:-250},{x:280,z:220}],ctx,ROAD_POLICIES.trail));
 assert.equal(run(),run());
});

test('repair: a drowned access is cut back, a sound one is left alone', () => {
 const {ctx,env}=land(x=>x>100?-4:10);
 assert.equal(repairPath({id:'ok',points:[{x:-200,z:0},{x:50,z:0}],width:2},ctx,env,[ROAD_POLICIES.trail]),null);
 const fix=repairPath({id:'wet',points:[{x:-200,z:0},{x:300,z:0}],width:2},ctx,env,[ROAD_POLICIES.trail]);
 assert.ok(fix&&fix.action!=='kept');
 assert.equal(auditRoads(fix.paths,env).totals.underwaterM,0);
 assert.ok(fix.paths[0].points.at(-1).x<=100);
});

test('Volcan: generated roads have no flagrant defect (doc 109)', () => {
 const audit=auditProjectRoads(parseProject(JSON.parse(readFileSync(new URL('../maps/island.project.json',import.meta.url),'utf8'))));
 const routes=audit.paths.filter(p=>p.pathId.startsWith('route-'));
 assert.ok(routes.length>=9);
 for(const r of routes){assert.equal(r.underwaterM,0,r.pathId+' sous l’eau');assert.ok(r.steepM<10,r.pathId+' trop raide : '+r.steepM);assert.ok(r.fallLineM<60,r.pathId+' dans la pente : '+r.fallLineM);}
 assert.equal(audit.totals.unbridged,0);assert.equal(audit.totals.misalignedBridges,0);
 // Only the ribbon under the footbridges of three preset paths remains.
 assert.ok(audit.totals.underwaterM<=25,String(audit.totals.underwaterM));
 assert.ok(audit.crossings.filter(c=>c.pathId.startsWith('route-')).every(c=>c.skewDeg<=10));
});

// ---- Grading (doc 109 §5) -----------------------------------------------------------------
import {planRoadGrading} from '../src/paths/road-grading.ts';
import {compileEarthworks,parseEarthworks} from '../src/geography/earthworks.ts';
const graded=(height,works)=>{const earth=compileEarthworks(works,0);return earth?(x,z)=>earth(x,z,height(x,z)):height;};

test('grading: a traverse on a flank gets a level bed, flat ground gets none', () => {
 const slope=(x,z)=>50+z*.4,path={id:'r',points:[{x:-200,z:0},{x:200,z:20}],width:3},env={height:slope,seaLevel:0,nearWater:()=>false};
 assert.equal(planRoadGrading({...path,id:'flat'},{...env,height:()=>10}).works.length,0);
 const plan=planRoadGrading(path,env);
 assert.ok(plan.works.length>=2&&plan.gradedM>380,JSON.stringify([plan.works.length,plan.gradedM]));
 assert.doesNotThrow(()=>parseEarthworks(plan.works));
 assert.ok(plan.works.every(w=>w.id.startsWith('road:r:')&&w.points.length<=20));
 const after=graded(slope,plan.works),audit=h=>auditRoads([path],{height:h,seaLevel:0,bridges:[],water:()=>[]}).paths[0];
 assert.ok(audit(slope).tiltedM>380);assert.ok(audit(after).tiltedM<15,'tilt left: '+audit(after).tiltedM);
 // Cut uphill, fill downhill, the axis barely moves; the ground is untouched away from the road.
 assert.ok(Math.abs(after(0,10)-slope(0,10))<.3);assert.ok(after(0,11.5)<slope(0,11.5)&&after(0,8.5)>slope(0,8.5));
 assert.equal(after(0,40),slope(0,40));
 assert.ok(plan.maxCutM<1&&plan.maxFillM<1);
 assert.equal(JSON.stringify(planRoadGrading(path,env)),JSON.stringify(plan));
});

test('grading: bumps are evened, water sides and deep cuts are left natural', () => {
 const bumpy=(x,z)=>20+(Math.abs(x)<4?1.2:0),path={id:'b',points:[{x:-80,z:0},{x:80,z:0}],width:3},env={height:bumpy,seaLevel:0,nearWater:()=>false};
 const plan=planRoadGrading(path,env);assert.ok(plan.works.length>=1);
 assert.ok(graded(bumpy,plan.works)(0,0)<bumpy(0,0)-.4);
 const slope=(x,z)=>50+z*.4,side={id:'s',points:[{x:-200,z:0},{x:200,z:0}],width:3};
 assert.equal(planRoadGrading(side,{height:slope,seaLevel:0,nearWater:()=>true}).works.length,0);
 const partly=planRoadGrading(side,{height:slope,seaLevel:0,nearWater:x=>x>0});
 assert.ok(partly.works.length&&partly.works.every(w=>w.points.every(q=>q.x<=0)));
 const cliff=(x,z)=>20+(x>0?30:0);
 assert.ok(planRoadGrading({id:'c',points:[{x:-60,z:0},{x:60,z:0}],width:3},{height:cliff,seaLevel:0,nearWater:()=>false},{budgetM:2.5}).works.every(w=>w.points.every((q,i)=>Math.abs(w.levels[i]-cliff(q.x,q.z))<=2.5)));
 assert.equal(planRoadGrading({id:'w',points:[{x:-60,z:0},{x:60,z:0}],width:2,kind:'wood'},{height:slope,seaLevel:0,nearWater:()=>false}).works.length,0);
});

test('Volcan: the ground is fitted to the planned roads (doc 109 §5)', () => {
 const project=parseProject(JSON.parse(readFileSync(new URL('../maps/island.project.json',import.meta.url),'utf8'))),works=project.world.terrain.archipelago.earthworks??[];
 assert.ok(works.length>20&&works.length<=256&&works.every(w=>w.id.startsWith('road:')&&w.kind==='corridor'));
 const routes=auditProjectRoads(project).paths.filter(p=>p.pathId.startsWith('route-')),length=routes.reduce((n,r)=>n+r.lengthM,0),tilted=routes.reduce((n,r)=>n+r.tiltedM,0);
 assert.ok(tilted<length*.05,`dévers ${Math.round(tilted)} m sur ${Math.round(length)} m`);
});
