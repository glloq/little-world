import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_RESIDENT_DAILY_STOPS,residentRoute,positionOnResidentRoute,validResidentRoutine} from '../src/npc-life/schedule.ts';
import {residentAgendaPoseAt,validateResidentAgendaRoutes} from '../src/npc-life/agenda.ts';
import {residentSocialPairs,residentSocialEncounterActive} from '../src/npc-life/social.ts';
import {createResidentLayeredRouter} from '../src/npc-life/layered-routes.ts';
import {withVillageActivities} from '../src/npc-life/generation-agenda.ts';
import {createResidentAssignmentPlanner} from '../src/npc-life/assignments.ts';

const clock=(h)=>(((h/24-.36)%1+1)%1)*1200;
const worker={type:'Resident',version:1,role:'farmer',home:{x:0,z:0},work:{x:0,z:12},
  activities:[{kind:'social',anchorId:'bench:1',point:{x:2,z:12},startHour:12,endHour:12.75}]};
const routes={work:residentRoute([{x:0,z:0},{x:0,z:12}]),activities:[{
  to:residentRoute([{x:0,z:12},{x:2,z:12}]),
  back:residentRoute([{x:2,z:12},{x:0,z:12}]),
}]};
const at=h=>residentAgendaPoseAt(worker,routes,clock(h),1200,.36,1);
test('multi-stop schedules stay declarative and reject overlapping visits and unsafe input',()=>{
 assert.equal(validResidentRoutine(worker),true);
 assert.equal(validResidentRoutine({...worker,activities:[...worker.activities,...worker.activities]}),false);
 assert.equal(validResidentRoutine({...worker,activities:[{...worker.activities[0],anchorId:'<script>'}]}),false);
 assert.equal(validResidentRoutine({...worker,activities:[{...worker.activities[0],startHour:5}]}),false);
});
test('agenda moves along certified legs, visits public place, and resumes the original job',()=>{
 assert.equal(at(5).phase,'home');
 assert.equal(at(6.12).phase,'to-work');
 assert.equal(at(11.98).phase,'to-activity');
 assert.equal(at(12.3).phase,'activity');
 assert.equal(at(12.3).activityKind,'social');
 assert.equal(at(12.3).position.x,2);
 assert.equal(at(12.77).phase,'to-activity');
 assert.equal(at(13).phase,'work');
 assert.equal(at(17.12).phase,'to-home');
 assert.equal(at(19).phase,'home');
 assert.deepEqual(at(13),at(13));
 assert.throws(()=>residentAgendaPoseAt(worker,{work:routes.work,activities:[]},clock(12),1200,.36,1),/incomplet/);
});
test('generation only proposes daily pauses on native public anchors with safe return paths',()=>{
 const terrain={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},height:()=>10,wet:()=>false,seaLevel:0};
 const planner=createResidentAssignmentPlanner([{points:[{x:0,z:0},{x:0,z:12},{x:2,z:12}]}],terrain);
 const safe=withVillageActivities({...worker,activities:undefined},[{id:'bench:1',role:'child',point:{x:2,z:12},sourceId:'bench:1',kind:'amenity'}],planner,routes.work);
 assert.ok(safe.activities?.some(s=>s.kind==='meal'||s.kind==='social'));
 assert.equal(validResidentRoutine(safe),true);
 const none=withVillageActivities({...worker,activities:undefined},[{id:'unreachable',role:'child',point:{x:150,z:150},sourceId:'unreachable',kind:'amenity'}],planner,routes.work);
 assert.equal(none.activities,undefined);
});
test('social pairing uses nearby known residents only and never pairs an actor twice',()=>{
 const crowd=[
  {id:'a',x:0,z:0,role:'farmer',phase:'activity',kind:'social'},
  {id:'b',x:1,z:0,role:'merchant',phase:'activity',kind:'social'},
  {id:'c',x:2,z:0,role:'child',phase:'work'},
  {id:'d',x:40,z:40,role:'child',phase:'work'},
  {id:'e',x:42,z:40,role:'child',phase:'work'},
 ];
 const pairs=residentSocialPairs(crowd);
 assert.equal(pairs.get('a'),'b');
 assert.equal(pairs.get('b'),'a');
 assert.equal(pairs.get('d'),'e');
 assert.equal(pairs.get('e'),'d');
 assert.equal(pairs.has('c'),false);
 assert.deepEqual([...residentSocialPairs(crowd)], [...pairs]);
});
test('layered routing crosses real elevated deck but rejects water or XZ-only intersections',()=>{
 const walk=(x)=>x<=-5||x>=5;
 const surfaces={groundHeight:()=>10,supportHeight:(id,x,z)=>{
  if(id!=='bridge:1'||x < -5||x>5||Math.abs(z)>.15)return null;
  return 10+2*(1-Math.abs(x)/5);
 }};
 const paths=[{points:[{x:-20,z:0},{x:-5,z:0}]},
   {supportId:'bridge:1',points:[{x:-5,z:0},{x:5,z:0}]},
   {points:[{x:5,z:0},{x:20,z:0}]}];
 const result=createResidentLayeredRouter(paths,walk,surfaces).route({x:-18,z:0},{x:18,z:0});
 assert.ok(result,'Physical bridge landings must connect');
 assert.ok(result.points.some(p=>p.y>11),'Bridge altitude must reach the actor');
 const blocked=createResidentLayeredRouter(paths,walk,{...surfaces,supportHeight:()=>null});
 assert.equal(blocked.route({x:-18,z:0},{x:18,z:0}),null);
 const duplicatePaths=[{points:[{x:0,z:-35},{x:0,z:35}]},
    {supportId:'upper',points:[{x:-35,z:0},{x:35,z:0}]}];
 const crossing=createResidentLayeredRouter(duplicatePaths,()=>true,
   {groundHeight:()=>10,supportHeight:(id)=>id==='upper'?20:null});
 assert.equal(crossing.route({x:0,z:-30},{x:30,z:0}),null);
 const heights=residentRoute([{x:0,z:0,y:10},{x:10,z:0,y:12}]);
 assert.ok(Math.abs(positionOnResidentRoute(heights,5).y-11)<1e-6);
});

test('agenda preflight qualifies valid activity visits and rejects impossible itineraries',()=>{
 assert.equal(validateResidentAgendaRoutes(worker,routes,1200,1),null);
 const impossible={...worker,activities:[{...worker.activities[0],startHour:6.1,endHour:6.5}]};
 assert.match(validateResidentAgendaRoutes(impossible,routes,1200,1),/inaccessible/);
 assert.equal(validateResidentAgendaRoutes(worker,{work:routes.work,activities:[]},1200,1),'Agenda résident incomplet');
 assert.equal(validateResidentAgendaRoutes(worker,routes,0,1),'Agenda résident incomplet');
 assert.equal(validateResidentAgendaRoutes(worker,routes,1200,0),'Agenda résident incomplet');
});

test('social greetings are symmetric, deterministic, time-bounded and never include a player conversation',()=>{
 const active=[0,1,2,3,4,5,6,7,8,9,10,11].filter(t=>residentSocialEncounterActive('a','b',t));
 assert.ok(active.length>=3&&active.length<=5);
 for(let t=0;t<24;t++){
  assert.equal(residentSocialEncounterActive('a','b',t),residentSocialEncounterActive('b','a',t));
  assert.equal(residentSocialEncounterActive('a','b',t),residentSocialEncounterActive('a','b',t+12));
 }
 assert.equal(residentSocialEncounterActive('a','a',4),false);
 const actors=[
  {id:'a',x:0,z:0,role:'child',phase:'work'},
  {id:'b',x:1,z:0,role:'child',phase:'work',busy:true},
  {id:'c',x:2,z:0,role:'child',phase:'work'},
 ];
 const pairing=residentSocialPairs(actors);
 assert.equal(pairing.get('a'),'c');
 assert.equal(pairing.has('b'),false);
});

test('F02 validates five ordered visits without unbounded schedule evaluation',()=>{
 assert.equal(MAX_RESIDENT_DAILY_STOPS,5);
 const stops=Array.from({length:5},(_,i)=>({
   kind:i%2===0?'social':'rest',
   anchorId:'bench:'+i,point:{x:2,z:12},
   startHour:8+i*1.5,endHour:8.5+i*1.5,
 }));
 const extended={...worker,activities:stops};
 assert.equal(validResidentRoutine(extended),true);
 assert.equal(validResidentRoutine({...extended,activities:[...stops,{
   kind:'social',anchorId:'bench:6',point:{x:2,z:12},
   startHour:16,endHour:16.5,
 }]}),false,'six visits exceed bounded contract');
 const legs=stops.map(()=>({
   to:residentRoute([{x:0,z:12},{x:2,z:12}]),
   back:residentRoute([{x:2,z:12},{x:0,z:12}]),
 }));
 assert.equal(validateResidentAgendaRoutes(extended,{work:routes.work,activities:legs},1200,1),null);
 const pose=residentAgendaPoseAt(extended,{work:routes.work,activities:legs},clock(14.25),1200,.36,1);
 assert.equal(pose.phase,'activity');
 assert.equal(pose.position.x,2);
});

test('F02 early-shift fishers get visits during their real working day',()=>{
 const terrain={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},height:()=>10,wet:()=>false,seaLevel:0};
 const planner=createResidentAssignmentPlanner(
   [{points:[{x:0,z:0},{x:0,z:12},{x:2,z:12}]}],terrain);
 const fisher={...worker,role:'fisher',activities:undefined};
 const stops=withVillageActivities(fisher,
   [{id:'bench:1',role:'child',point:{x:2,z:12},sourceId:'bench:1',kind:'amenity'}],
   planner,routes.work,1200,1.1);
 assert.ok(stops.activities?.length);
 assert.ok(stops.activities.every(s=>s.startHour>=5&&s.endHour<=15),
   'early shifts must not inherit late afternoon meeting windows');
 assert.ok(stops.activities.some(s=>s.kind==='social'),
   'the social pause should fit before fisher closes the shift');
 assert.equal(validResidentRoutine(stops),true);
});

test('F01-D a removed bridge invalidates the existing layered path before the NPC crosses',()=>{
 let hasBridge=true;
 const paths=[
  {points:[{x:-20,z:0},{x:-5,z:0}]},
  {supportId:'bridge:dynamic',points:[{x:-5,z:0},{x:5,z:0}]},
  {points:[{x:5,z:0},{x:20,z:0}]},
 ];
 const walk=(x)=>x<=-5||x>=5;
 const surfaces={
  groundHeight:()=>10,
  supportHeight:(id,x,z)=>id==='bridge:dynamic'&&hasBridge&&x>=-5&&x<=5&&Math.abs(z)<.2
    ?10+2*(1-Math.abs(x)/5):null,
 };
 const router=createResidentLayeredRouter(paths,walk,surfaces);
 const before=router.route({x:-18,z:0},{x:18,z:0});
 assert.ok(before&&before.points.some(p=>p.y>11));
 hasBridge=false;
 assert.equal(router.route({x:-18,z:0},{x:18,z:0}),null);
 hasBridge=true;
 assert.ok(router.route({x:-18,z:0},{x:18,z:0}),
  'restored bridge becomes usable without fabricating another surface');
});
