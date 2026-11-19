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
