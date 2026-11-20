import test from 'node:test';
import assert from 'node:assert/strict';
import {compileEarthworks,parseEarthworks,terraceLevel,earthworkBounds} from '../src/geography/earthworks.ts';
import {planSiteGrading,planCorridorGrading,fitPlane,putEarthworks,removeEarthworks,gradedHeight} from '../src/studio-core/earthworks-planner.ts';
import {parseArchipelago} from '../src/geography/archipelago-params.ts';
import {terrainImpacts} from '../src/studio-core/terrain-impact.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {collectLandReservations} from '../src/studio-core/land-registry.ts';

const square=(c,h)=>[{x:c.x-h,z:c.z-h},{x:c.x+h,z:c.z-h},{x:c.x+h,z:c.z+h},{x:c.x-h,z:c.z+h}];

test('pad reaches its level inside and blends over the talus', () => {
 const f=compileEarthworks([{id:'p',kind:'pad',polygon:square({x:0,z:0},10),levelM:5,talusM:8}],0);
 assert.equal(f(0,0,20),5);assert.equal(f(9.9,0,20),5);
 const mid=f(14,0,20);assert.ok(mid>5&&mid<20);assert.equal(f(30,0,20),20);
});

test('terraces: flat treads, bounded risers, monotone along the slope', () => {
 const w={id:'t',kind:'terraces',polygon:square({x:0,z:0},50),origin:{x:0,z:0},levelM:10,dirX:1,dirZ:0,slope:.1,depthM:16,riserM:6,talusM:5};
 assert.equal(terraceLevel(w,1,0),10);assert.equal(terraceLevel(w,9.9,0),10);assert.equal(terraceLevel(w,17,0),8.4);
 let prev=terraceLevel(w,0,0),steep=0;for(let x=.25;x<48;x+=.25){const h=terraceLevel(w,x,0);assert.ok(h<=prev+1e-9);steep=Math.max(steep,(prev-h)/.25);prev=h;}
 assert.ok(steep<.45,String(steep));
});

test('corridor grading clamps the grade of a road bed', () => {
 const height=(x)=>x<50?0:20;
 const w=planCorridorGrading('r',height,0,[{x:0,z:0},{x:25,z:0},{x:50,z:0},{x:75,z:0},{x:100,z:0}],4,{maxGrade:.1});
 for(let i=1;i<w.levels.length;i++)assert.ok(Math.abs(w.levels[i]-w.levels[i-1])<=2.5+1e-6);
 assert.deepEqual(parseEarthworks([w]),[w]);
});

test('site grading: pad on flat ground, terraces on a slope, refusal when too steep', () => {
 const flat=planSiteGrading('a',(x,z)=>3+.01*x,0,{x:0,z:0},40);assert.ok(flat.ok);assert.equal(flat.work.kind,'pad');
 const slope=planSiteGrading('b',(x,z)=>20-.12*z+Math.sin(x/7),0,{x:0,z:0},40,{budgetM:6});
 assert.ok(slope.ok,JSON.stringify(slope));assert.equal(slope.work.kind,'terraces');assert.ok(slope.work.dirZ>.99);
 const plane=fitPlane((x,z)=>2+.2*x-.1*z,{x:0,z:0},30);assert.ok(Math.abs(plane.gx-.2)<1e-6&&Math.abs(plane.gz+.1)<1e-6);
 assert.equal(planSiteGrading('c',(x,z)=>.6*x,0,{x:0,z:0},40).code,'GRADING_TOO_STEEP');
 assert.equal(planSiteGrading('d',(x,z)=>.12*z+3*Math.sin(x/9),0,{x:0,z:0},60,{budgetM:.5}).code,'GRADING_BUDGET');
 parseEarthworks([slope.work]);
});

test('archipelago terrain applies earthworks last; project round-trips and reservations follow', () => {
 const r=newIslandRequirements();r.width=1600;r.length=1200;r.welcomeVillage='none';r.maritimePort=false;
 const p=composeWorld(r,'Grade',{projectId:'gp',worldId:'gw'}).project,geo=projectGeography(p),c={x:0,z:0};
 let land=null;for(let z=-300;z<=300&&!land;z+=50)for(let x=-400;x<=400;x+=50)if(geo.ctx.height(x,z)>10){land={x,z};break;}
 assert.ok(land);
 const work={id:'test:pad',kind:'pad',polygon:square(land,12),levelM:Math.round(geo.ctx.height(land.x,land.z)+3),talusM:6};
 putEarthworks(p,[work]);const back=parseProject(JSON.parse(JSON.stringify(p)));
 assert.deepEqual(back.world.terrain.archipelago.earthworks,[work]);
 assert.ok(Math.abs(projectGeography(back).ctx.height(land.x,land.z)-work.levelM)<.6);
 assert.ok(collectLandReservations(back).some(x=>x.id==='grading:test:pad'));
 assert.deepEqual(removeEarthworks(back,'test:').map(w=>w.id),['test:pad']);assert.equal(back.world.terrain.archipelago.earthworks,undefined);
 assert.throws(()=>parseArchipelago({...p.world.terrain.archipelago,earthworks:[{...work,id:'x',kind:'moat'}]}));
 assert.ok(earthworkBounds(work).minX<land.x-12);void c;
});

test('graded welcome village: more houses on the same seed, port untouched, world ready', () => {
 assert.throws(()=>validateMapRequirements({...newIslandRequirements(),compositionVersion:4,earthworks:true}));
 const base=newIslandRequirements();base.seed=17;base.welcomeVillage='village';
 const plain=composeWorld(structuredClone(base),'A',{projectId:'a',worldId:'a'});
 const graded=composeWorld({...structuredClone(base),earthworks:true},'B',{projectId:'b',worldId:'b'});
 assert.ok(graded.ready,JSON.stringify(graded.diagnostics.filter(d=>d.severity==='ERROR')));
 const n=c=>c.project.libraries.settlements['composition-welcome-village'].buildings.length;
 assert.ok(n(graded)>n(plain),`${n(graded)} > ${n(plain)}`);
 const works=graded.project.world.terrain.archipelago.earthworks;assert.equal(works.length,1);assert.match(works[0].id,/^settlement:composition-welcome-village:/);
 assert.equal(plain.project.world.terrain.archipelago.earthworks,undefined);
});

test('relief edits revalidate races, pistes and surf zones', () => {
 const p={world:{seaLevel:0},libraries:{paths:{},water:{},zones:{},
  races:{r:{id:'r',name:'Roulade',kind:'roll',gates:[{id:'g',center:{x:50,y:1,z:0},normal:{x:1,y:0,z:0},width:6,height:4}],track:{width:6,points:[{x:0,z:0},{x:50,z:0},{x:100,z:0}]}}},
  alpine:{a:{id:'a',name:'Rouge',widthM:12,points:[{x:0,z:100},{x:50,z:100}]}},
  surfZones:{s:{id:'s',minX:-20,maxX:20,minZ:180,maxZ:220}}},entityIndex:{}};
 const env={height:(x,z)=>z>150?5:x>40&&x<60?30:z>50?x*.1:0};
 const items=terrainImpacts(p,[{minX:-50,maxX:150,minZ:-50,maxZ:250}],env).items;
 assert.ok(items.some(i=>i.activity?.kind==='race'&&/pente/.test(i.message)));
 assert.ok(items.some(i=>i.activity?.kind==='race'&&/enterrée/.test(i.message)));
 assert.ok(items.some(i=>i.activity?.kind==='alpine'));
 assert.ok(items.some(i=>i.activity?.kind==='surf'));
 const ok=gradedHeight(()=>0,0,[]);assert.equal(ok(1,1),0);
});
