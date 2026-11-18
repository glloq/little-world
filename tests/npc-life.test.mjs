import test from 'node:test';
import assert from 'node:assert/strict';
import {validResidentRoutine,residentHour,residentShift,residentRoute,positionOnResidentRoute,residentPoseAt} from '../src/npc-life/schedule.ts';
import {createResidentRouter} from '../src/npc-life/routes.ts';
import {residentDialogue} from '../src/npc-life/dialogue.ts';
import {createDialogue} from '../src/dialogue.ts';

const farmer={type:'Resident',version:1,role:'farmer',home:{x:0,z:0},work:{x:0,z:12},homeAnchorId:'house:1',workAnchorId:'farm:1'};
const timeAtHour=(h)=>(((h/24-.36)%1+1)%1)*1200;

test('resident profiles are strictly declarative and versioned',()=>{
  assert.equal(validResidentRoutine(farmer),true);
  assert.equal(validResidentRoutine({...farmer,role:'dragon'}),false);
  assert.equal(validResidentRoutine({...farmer,script:'eval(...)'}),false);
  assert.equal(validResidentRoutine({...farmer,work:{x:Infinity,z:3}}),false);
  assert.equal(validResidentRoutine({...farmer,homeAnchorId:'<broken>'}),false);
  assert.deepEqual(residentShift('farmer'),[6,17]);
});

test('simulated day phase gives stable deterministic home/work/commute positions',()=>{
  const route=residentRoute([farmer.home,{x:0,z:6},farmer.work]);
  assert.ok(Math.abs(residentHour(0,1200,.36)-8.64)<1e-10);
  const at=h=>residentPoseAt(farmer,route,timeAtHour(h),1200,.36,1);
  assert.equal(at(4).phase,'home');
  assert.equal(at(4).position.z,0);
  assert.equal(at(6.12).phase,'to-work');
  assert.ok(Math.abs(at(6.12).position.z-6)<1e-6);
  assert.equal(at(12).phase,'work');
  assert.equal(at(12).position.z,12);
  assert.equal(at(17.12).phase,'to-home');
  assert.ok(Math.abs(at(17.12).position.z-6)<1e-6);
  assert.equal(at(22).phase,'home');
  assert.equal(at(22).position.z,0);
});

test('sleeping and absent NPCs project to the right place without ticking individual actors',()=>{
  const route=residentRoute([farmer.home,{x:10,z:0},{x:10,z:12},farmer.work]);
  const t=timeAtHour(13);
  const a=residentPoseAt(farmer,route,t,1200,.36,1.1);
  const b=residentPoseAt(farmer,route,t,1200,.36,1.1);
  assert.deepEqual(a,b);
  assert.deepEqual(a.position,farmer.work);
  assert.deepEqual(positionOnResidentRoute(route,route.length),farmer.work);
  assert.throws(()=>residentPoseAt(farmer,residentRoute([{x:0,z:0},{x:2000,z:0}]),t,1200,.36,1),/trop long/);
});

test('pedestrian graph follows authored turns and avoids disconnected routes',()=>{
  const walk=()=>true;
  const router=createResidentRouter([{points:[{x:0,z:0},{x:0,z:30},{x:30,z:30}]}],walk);
  const route=router.route({x:0,z:-3},{x:34,z:30});
  assert.ok(router.nodes>=8);
  assert.equal(router.truncated,false);
  assert.ok(route&&route.length>60&&route.length<75);
  assert.deepEqual(route.points[0],{x:0,z:-3});
  assert.deepEqual(route.points.at(-1),{x:34,z:30});
  assert.equal(createResidentRouter([],walk).route({x:0,z:0},{x:100,z:0}),null);
});

test('pedestrian graph rejects blocked connectors and road surfaces',()=>{
  const router=createResidentRouter([{points:[{x:0,z:0},{x:0,z:30},{x:30,z:30}]}],(x)=>x<15);
  assert.equal(router.route({x:0,z:0},{x:34,z:30}),null);
});

test('contextual conversations preserve existing author choices, actions and close semantics',()=>{
  const flags={};
  const base=createDialogue({start:'hello',lines:[{id:'hello',text:'Bonjour',choices:[{text:'Un cadeau',action:{flag:'gift',value:true}},{text:'Au revoir'}]}]},flags);
  const session=residentDialogue(base,'farmer',()=>({phase:'work',hour:11}));
  assert.equal(session.line.text,'Bonjour');
  assert.equal(session.choices.length,3);
  assert.equal(session.choose(2),true);
  assert.match(session.line.text,/champs/);
  assert.equal(session.choose(0),true);
  assert.equal(session.line.text,'Bonjour');
  assert.equal(session.choose(0),true);
  assert.equal(flags.gift,true);
  assert.equal(session.closed,true);
});

test('children play along an already-qualified home-to-square route without random wandering',()=>{
  const child={...farmer,role:'child'};
  const route=residentRoute([child.home,{x:0,z:6},child.work]);
  const a=residentPoseAt(child,route,timeAtHour(11),1200,.36,1);
  const b=residentPoseAt(child,route,timeAtHour(11.1),1200,.36,1);
  assert.equal(a.phase,'work');
  assert.equal(b.phase,'work');
  assert.ok(a.position.z>=4&&a.position.z<=12);
  assert.ok(b.position.z>=4&&b.position.z<=12);
  assert.notEqual(a.position.z,b.position.z);
});

test('pedestrian router does not invent junctions on unqualified bridge decks',()=>{
  const router=createResidentRouter([{supportId:'bridge-1',points:[{x:0,z:0},{x:0,z:50}]}],()=>true);
  assert.equal(router.nodes,0);
  assert.equal(router.route({x:0,z:-3},{x:0,z:52}),null);
});

test('spatial hash resolves distant negative-coordinate footpaths',()=>{
  const router=createResidentRouter([{points:[{x:-240,z:-130},{x:-240,z:-80},{x:-180,z:-80}]}],()=>true);
  const route=router.route({x:-240,z:-135},{x:-175,z:-80});
  assert.ok(route&&route.length>105&&route.length<125);
});

test('every historic squirrel villager maps to the existing player hamster rig; wildlife remains wildlife',async()=>{
  const {visualNPCSpecies,isHumanoidNPC}=await import('../src/npc-life/species.ts');
  assert.equal(visualNPCSpecies('squirrel'),'hamster');
  assert.equal(visualNPCSpecies('hamster'),'hamster');
  assert.equal(visualNPCSpecies('animal'),'animal');
  assert.equal(isHumanoidNPC('squirrel'),true);
  assert.equal(isHumanoidNPC('animal'),false);
  const {DEFAULT_NPCS}=await import('../src/npc.ts');
  assert.ok(DEFAULT_NPCS.every(n=>n.kind!=='squirrel'));
  assert.ok(DEFAULT_NPCS.some(n=>n.kind==='hamster'));
});

test('profession gestures are deterministic and only triggered at sparse intervals',async()=>{
  const {residentGesture,shouldPlayResidentGesture}=await import('../src/npc-life/gestures.ts');
  assert.equal(residentGesture('farmer').activity,'farm-water');
  assert.equal(residentGesture('fisher').activity,'fish-cast');
  assert.equal(residentGesture('woodcutter').activity,'fell');
  assert.equal(residentGesture('child'),null);
  const g=residentGesture('farmer');
  assert.ok(shouldPlayResidentGesture(0,-1,g));
  assert.equal(shouldPlayResidentGesture(2,0,g),false);
  assert.equal(shouldPlayResidentGesture(7.1,0,g),true);
});
