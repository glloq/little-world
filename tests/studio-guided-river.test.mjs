import test from 'node:test';
import assert from 'node:assert/strict';
import {planGuidedRiver} from '../src/studio-core/guided-river.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
const config=(height,water=()=>null,existing=[])=>({
 height,water,existing,seaLevel:0,inWorld:(x,z)=>x>0&&x<220&&z>-120&&z<120
});
const options={id:'guided:river:1',width:6,depth:2,maxLengthM:260};
test('A river follows the descending terrain and uses the canonical WaterProfile/network',()=>{
 const h=(x,z)=>Math.max(-2,5-x*.06+Math.abs(z)*.01);
 const result=planGuidedRiver({x:15,z:0},{x:65,z:0},config(h),options);
 assert.ok(result.trace.points.length>=2);
 assert.ok(result.water.points.length<=90);
 assert.equal(result.water.profile.mode,'terrain');
 assert.equal(result.water.id,'guided:river:1');
 const profile=compileWaterNetwork([result.water],h,0)[0];
 assert.equal(profile.diagnostics.filter(d=>d.severity==='ERROR').length,0);
 assert.ok(result.water.points.at(-1).x>result.water.points[0].x);
});
test('A river connects to sea when it reaches below sea-level',()=>{
 const h=(x,z)=>5-x*.08;
 const result=planGuidedRiver({x:15,z:0},{x:50,z:0},config(h),{...options,maxLengthM:300});
 assert.equal(result.trace.end,'sea');
 assert.deepEqual(result.water.to,{kind:'sea'});
});
test('A guided river refuses invalid width, direction and excessive length',()=>{
 const h=(x,z)=>5-x*.05;
 assert.throws(()=>planGuidedRiver({x:5,z:0},{x:6,z:0},config(h),options),/direction/);
 assert.throws(()=>planGuidedRiver({x:5,z:0},{x:45,z:0},config(h),{...options,width:50}),/[Pp]aramètres/);
 assert.throws(()=>planGuidedRiver({x:5,z:0},{x:45,z:0},config(h),{...options,maxLengthM:5000}),/[Pp]aramètres/);
});
test('A disconnected river is not invented when no downhill path exists',()=>{
 const h=()=>5;
 assert.throws(()=>planGuidedRiver({x:15,z:0},{x:60,z:0},config(h),options),/Aucun cours d’eau|Rivière non applicable/);
});
