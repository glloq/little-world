import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewHydroNetwork,planHydroLink} from '../src/studio-core/hydro-network-assistant.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
const slope=(x,z)=>10-x*.06;
const lake={id:'lake-receiver',kind:'lake',points:[{x:67,z:-8},{x:85,z:-8},{x:85,z:8},{x:67,z:8}],width:10,depth:2,level:4.8};
const river={id:'river-source',kind:'river',points:[{x:15,z:0},{x:35,z:0},{x:63,z:0}],width:5,depth:2,level:9,profile:{mode:'terrain',offset:-.35}};
test('A3 review finds nearby downstream lake without changing authored river',()=>{
 const original=structuredClone(river),waters=[river,lake];
 const report=reviewHydroNetwork(waters,slope,0);
 assert.equal(report.links.length,1);
 assert.equal(report.links[0].targetId,lake.id);
 assert.ok(report.links[0].distanceM<10);
 assert.deepEqual(river,original,'preview never mutates authored water');
});
test('A3 suggested downstream snap is a standard validated WaterBody',()=>{
 const waters=[river,lake],candidate=reviewHydroNetwork(waters,slope,0).links[0];
 const updated=planHydroLink(waters,candidate,slope,0);
 assert.deepEqual(updated.to,{kind:'lake',id:'lake-receiver'});
 assert.equal(updated.points.at(-1).x,67);
 const result=compileWaterNetwork([lake,updated],slope,0);
 assert.equal(result.flatMap(r=>r.diagnostics.filter(d=>d.severity==='ERROR')).length,0);
 assert.equal(river.to,undefined);
});
test('A3 rejects a connection already present and far away endpoints',()=>{
 const candidate=reviewHydroNetwork([river,lake],slope,0).links[0];
 assert.throws(()=>planHydroLink([{...river,to:{kind:'sea'}},lake],candidate,slope,0),/source|lien existant/);
 const far={...river,points:[{x:0,z:0},{x:20,z:0}]};
 assert.throws(()=>planHydroLink([far,lake],candidate,slope,0),/éloigné/);
});
test('A3 steep river segments are waterfall suggestions only, not silent geometry changes',()=>{
 const steep=(x,z)=>40-x*.6;
 const stream={...river,id:'steep-river',points:[{x:1,z:0},{x:11,z:0},{x:21,z:0},{x:31,z:0}]};
 const before=structuredClone(stream),report=reviewHydroNetwork([stream],steep,0);
 assert.ok(report.falls.length>=1);
 assert.ok(report.falls[0].dropM>=2.5);
 assert.deepEqual(stream,before);
});
