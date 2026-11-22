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
 // A hairpin turns through the fall line: the legs keep the capped gradient, and the turn is cut
 // into the flank (as the generator does), so the walked surface never climbs straight up.
 const a=auditRoads(paths(road),env),works=paths(road).flatMap(q=>planRoadGrading(q,{height:env.height,seaLevel:0,nearWater:()=>false},{budgetM:6}).works);
 const bed=compileEarthworks(works,0),after=auditRoads(paths(road),{...env,height:(x,z)=>bed(x,z,env.height(x,z))});
 assert.ok(a.totals.fallLineM<length(line)*.05&&a.totals.steepM<10,'legs: fall line '+a.totals.fallLineM+', steep '+a.totals.steepM);
 assert.ok(after.paths[0].maxGrade<=.34,'gradient on the bed '+after.paths[0].maxGrade);
 // Rounded hairpins: no corner turns more than 60° at a single vertex.
 for(let i=1;i<line.length-1;i++){const t1=Math.atan2(line[i].z-line[i-1].z,line[i].x-line[i-1].x),t2=Math.atan2(line[i+1].z-line[i].z,line[i+1].x-line[i].x);let d=Math.abs(t1-t2)%(2*Math.PI);if(d>Math.PI)d=2*Math.PI-d;assert.ok(d<1.05,'sharp corner '+d.toFixed(2)+' at '+i);}
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
 for(const r of routes){assert.equal(r.underwaterM,0,r.pathId+' sous l’eau');assert.ok(r.steepM<10,r.pathId+' trop raide : '+r.steepM);/* hairpin turns cross the fall line by nature: a few percent of the length at most */assert.ok(r.fallLineM<Math.max(30,r.lengthM*.04),r.pathId+' dans la pente : '+r.fallLineM);}
 assert.equal(audit.totals.unbridged,0);assert.equal(audit.totals.misalignedBridges,0);
 // Forded preset accesses are planned again: nothing is left under water, every crossing is square.
 assert.equal(audit.totals.underwaterM,0);assert.equal(audit.totals.skewedCrossings,0);assert.ok(audit.crossings.length>=5&&audit.crossings.every(c=>c.bridgeId));
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

// ---- Project links, composition and Studio entry point (doc 109 §6) ---------------------------
import {buildCirculationGraph,circulationReport} from '../src/studio-core/circulation.ts';
import {planRoadLinks,applyRoadLinks,ROAD_LINK_PREFIX,ROAD_BRIDGE_PREFIX} from '../src/studio-core/road-links.ts';
import {validateMapRequirements,newIslandRequirements} from '../src/studio-core/map-requirements.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {WORLD_BRIEFS,briefToRequirements} from '../src/studio-core/world-brief.ts';
import {terrainAccessContext} from '../src/studio-core/terrain-access.ts';
import {pathSupport} from '../src/settlements/bridge.ts';
import {inspectGroundSegment} from '../src/paths/terrain-route.ts';
import {WaterSpatialIndex} from '../src/water/profile.ts';
import {BRIDGE_CLEARANCE_M} from '../src/paths/road-planner.ts';
import {sectorGeometry,deckEnds} from '../src/paths/path-geometry.ts';

test('rendering: a road has no round cap where a bridge deck takes over', () => {
 const road={id:'r',points:[{x:-30,z:0},{x:0,z:0}],width:3},deck={id:'d',points:[{x:0,z:0},{x:8,z:0}],width:2,kind:'wood',supportId:'b'};
 const rect={minX:-100,maxX:100,minZ:-100,maxZ:100},env={height:()=>5},capped=sectorGeometry([road],rect,env),flat=sectorGeometry([road],rect,env,0,undefined,deckEnds([road,deck]));
 const maxX=g=>Math.max(...Array.from({length:g.positions.length/3},(_,i)=>g.positions[i*3]));
 assert.ok(maxX(capped)>1.4,'cap spills past the end');assert.ok(maxX(flat)<=1e-6,'no geometry past the abutment');
 assert.ok(flat.index.length<capped.index.length&&flat.index.length>0);
});

test('circulation: a footbridge joins the two road pieces cut at its abutments', () => {
 const bridge=(x)=>({id:'b',name:'Pont',components:{Transform:{position:{x,y:0,z:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{assetId:'structure.bridge_wooden_arch'}}});
 const project=(entities)=>({world:{bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},seaLevel:0},chunks:{c:{entities}},entityIndex:{},libraries:{paths:{l:{id:'l',points:[{x:-100,z:0},{x:-7.8,z:0},{x:-2.8,z:0}],width:3},r:{id:'r',points:[{x:2.8,z:0},{x:7.8,z:0},{x:100,z:0}],width:3}},water:{},zones:{}}});
 assert.equal(buildCirculationGraph(project({})).componentCount,2);
 assert.equal(buildCirculationGraph(project({b:bridge(0)})).componentCount,1);
 assert.equal(buildCirculationGraph(project({b:bridge(40)})).componentCount,2,'a bridge elsewhere joins nothing');
 assert.equal(buildCirculationGraph(project({}),undefined,[bridge(0)]).componentCount,1,'planned bridges count before they are committed');
});

test('requirements: planned roads are a composition 5 option', () => {
 assert.doesNotThrow(()=>validateMapRequirements({...newIslandRequirements(),roads:true}));
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),compositionVersion:4,roads:true}));
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),roads:'yes'}));
 assert.equal(briefToRequirements(WORLD_BRIEFS['harvest-valley']).roads,true,'themed generation plans roads');
});

test('composition: a themed island is linked by planned roads, bridged and graded; without the option nothing changes', () => {
 const base={...briefToRequirements(WORLD_BRIEFS['harvest-valley']),rivers:4,tributaries:4},ids={projectId:'t',worldId:'t'};
 const plain=composeWorld({...structuredClone(base),roads:undefined,circulation:false},'T',ids).project,linked=composeWorld(structuredClone(base),'T',ids);
 const count=(p,prefix)=>[...Object.keys(p.libraries.paths),...Object.keys(p.entityIndex)].filter(id=>id.startsWith(prefix)).length;
 assert.equal(count(plain,ROAD_LINK_PREFIX)+count(plain,ROAD_BRIDGE_PREFIX),0);assert.ok(!(plain.world.terrain.archipelago.earthworks??[]).some(w=>w.id.startsWith('road:')));
 const p=linked.project;assert.ok(linked.ready);
 assert.ok(count(p,ROAD_LINK_PREFIX)>=6,'links');assert.ok(count(p,ROAD_BRIDGE_PREFIX)>=1,'a river is bridged');
 assert.ok(p.world.terrain.archipelago.earthworks.some(w=>w.id.startsWith('road:'+ROAD_LINK_PREFIX)),'graded beds');
 const report=circulationReport(buildCirculationGraph(p));assert.equal(report.reachable,report.destinations.length);
 const audit=auditProjectRoads(p),roads=audit.paths.filter(q=>q.pathId.startsWith(ROAD_LINK_PREFIX));
 assert.equal(audit.totals.unbridged,0);assert.equal(audit.totals.misalignedBridges,0);assert.equal(audit.totals.orphanBridges,0);
 for(const r of roads){assert.equal(r.underwaterM,0,r.pathId);assert.ok(r.steepM<5&&r.fallLineM<30,r.pathId);}
 // Planning again finds nothing left to link: the Studio button is idempotent.
 const again=planRoadLinks(p);assert.equal(again.paths.length,0);assert.equal(again.failed.length,0);
 // Crossings are native supported decks: walked by the player and the residents, clear of the water,
 // level with both ramped abutments.
 const c=terrainAccessContext(p),decks=Object.values(p.libraries.paths).filter(q=>q.supportId?.startsWith(ROAD_BRIDGE_PREFIX));
 assert.ok(decks.length>=1);
 for(const deck of decks){
  const ref=p.entityIndex[deck.supportId],entity=p.chunks[ref.ownerChunkId].entities[deck.supportId];
  assert.ok(entity.components.Bridge&&entity.components.Visual.assetId==='settlement.bridge'&&!entity.components.Collider);
  const support=pathSupport(p,deck,c),[a,b]=deck.points,y=support.height((a.x+b.x)/2,(a.z+b.z)/2),site=audit.crossings.find(x=>x.pathId===deck.id);
  assert.ok(site&&site.bridgeId===deck.supportId&&site.bridgeYawErrorDeg<=1&&site.skewDeg<=10,JSON.stringify(site));
  assert.ok(inspectGroundSegment(a,b,support,{maxSlope:.35,widthM:deck.width}).valid,'deck walkable');
  for(const end of [a,b])assert.ok(Math.abs(c.height(end.x,end.z)-y)<.08,'abutment level with the deck: '+(c.height(end.x,end.z)-y));
  const water=new WaterSpatialIndex(Object.values(p.libraries.water),c.source,p.world.seaLevel).query((a.x+b.x)/2,(a.z+b.z)/2);
  assert.ok(water.length&&water.every(h=>y-h.level>=BRIDGE_CLEARANCE_M-.02),'deck above the water');
  assert.ok(Object.values(p.libraries.paths).some(q=>!q.supportId&&q.points.some(v=>Math.hypot(v.x-a.x,v.z-a.z)<.02)),'road ends on the abutment');
 }
 // Plan, then apply: the plan alone writes nothing.
 const fresh=structuredClone(plain),before=JSON.stringify(fresh),plan=planRoadLinks(fresh);assert.equal(JSON.stringify(fresh),before);
 assert.ok(plan.paths.length&&plan.links.every(l=>l.lengthM>0));applyRoadLinks(fresh,plan);
 assert.ok(count(fresh,ROAD_LINK_PREFIX)>=plan.links.length);
});
