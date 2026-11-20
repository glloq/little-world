import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionProfile,runStages,diagnosticsByStage} from '../src/studio-core/world-plan.ts';
import {composeWorld,COMPOSITION_STAGES} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements} from '../src/studio-core/map-requirements.ts';

test('stage runner keeps order, timings and per-stage diagnostics', () => {
 let t=0;const ctx={diagnostics:[],stages:[],trace:[]};
 runStages([
  {id:'a',label:'A',run:c=>{c.trace.push('a');c.diagnostics.push({severity:'WARNING',code:'W',message:'w'});}},
  {id:'b',label:'B',run:c=>{c.trace.push('b');}},
 ],ctx,()=>t++);
 assert.deepEqual(ctx.trace,['a','b']);
 assert.deepEqual(ctx.stages.map(s=>[s.id,s.diagnostics]),[['a',1],['b',0]]);
 assert.deepEqual(diagnosticsByStage(ctx).map(s=>s.diagnostics.length),[1,0]);
 assert.throws(()=>runStages([{id:'x',label:'',run(){}},{id:'x',label:'',run(){}}],{diagnostics:[],stages:[]}),/dupliquée/);
});

test('composition profile freezes legacy versions behind explicit switches', () => {
 assert.deepEqual(compositionProfile({}),{version:1,terraceRetry:true,provinces:false,natural:false,complete:false});
 assert.deepEqual(compositionProfile({compositionVersion:5}),{version:5,terraceRetry:false,provinces:true,natural:true,complete:true});
});

test('composeWorld reports every pipeline stage in order', () => {
 const r=newIslandRequirements();r.width=1600;r.length=1200;
 const c=composeWorld(r,'Plan',{projectId:'plan-p',worldId:'plan-w'});
 assert.deepEqual(c.stages.map(s=>s.id),COMPOSITION_STAGES.map(s=>s.id));
 assert.equal(c.stages.reduce((n,s)=>n+s.diagnostics,0),c.diagnostics.length);
});
