import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidentNavigationRevisionTracker} from '../src/npc-life/navigation-revision.ts';
import {residentReplanDue,residentScriptedAdvance} from '../src/npc-life/dynamic-route.ts';
import {residentRoute} from '../src/npc-life/schedule.ts';

test('NPC route revision only changes on physical door state transition',()=>{
 const tracker=createResidentNavigationRevisionTracker();
 tracker.observe('hut-door',false);
 tracker.observe('market-door',true);
 assert.equal(tracker.revision,0,'first snapshot is not mutation');
 tracker.observe('hut-door',false);
 tracker.observe('market-door',true);
 assert.equal(tracker.revision,0);
 tracker.observe('hut-door',true);
 assert.equal(tracker.revision,1,'NPC temporary opening');
 tracker.observe('hut-door',true);
 assert.equal(tracker.revision,1,'renewing temporary opening does not replan');
 tracker.observe('hut-door',false);
 assert.equal(tracker.revision,2,'automatic close');
 tracker.observe('market-door',false);
 assert.equal(tracker.revision,3,'manual door close');
 tracker.clear();
 assert.equal(tracker.revision,0);
 tracker.observe('hut-door',true);
 assert.equal(tracker.revision,0,'new world snapshot does not invalidate');
});

test('door mutation invalidates planned route while live collision still blocks step',()=>{
 const tracker=createResidentNavigationRevisionTracker();
 const planned=residentRoute([{x:0,z:0},{x:5,z:0}]);
 tracker.observe('hut-door',true);
 const revisionAtPlan=tracker.revision;
 const walk=()=>true;
 assert.deepEqual(residentScriptedAdvance(planned,0,2,walk),{clear:true,safeDistance:2});
 tracker.observe('hut-door',false);
 assert.equal(residentReplanDue(0.1,0,tracker.revision,revisionAtPlan,1),true);
 assert.deepEqual(residentScriptedAdvance(planned,2,4,x=>x<3),{clear:false,safeDistance:2.5});
 assert.equal(residentReplanDue(0.2,0.1,tracker.revision,tracker.revision,1),false);
});

test('F01-D exterior door stops walkers and permits continuation after opening',()=>{
 const state={open:false};
 const tracker=createResidentNavigationRevisionTracker();
 tracker.observe('home-door',state.open);
 const route=residentRoute([{x:0,z:0},{x:10,z:0}]);
 const walk=(x)=>state.open||x<4||x>6;
 const blocked=residentScriptedAdvance(route,0,8,walk);
 assert.deepEqual(blocked,{clear:false,safeDistance:3.5});
 state.open=true;tracker.observe('home-door',true);
 assert.equal(tracker.revision,1);
 assert.equal(residentReplanDue(1,.9,tracker.revision,0),true);
 const resumed=residentScriptedAdvance(route,blocked.safeDistance,8,walk);
 assert.deepEqual(resumed,{clear:true,safeDistance:8});
 state.open=false;tracker.observe('home-door',false);
 assert.equal(tracker.revision,2);
 assert.deepEqual(residentScriptedAdvance(route,3.5,8,walk),
   {clear:false,safeDistance:3.5});
});
