import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {SurfPerfRecorder,SURF_PERF_CHANNELS,instrumentGround,instrumentSurfField} from '../src/surf/surf-perf.ts';
import {surfDrawStats} from '../src/render/surf-render-stats.ts';

const zone={id:'surf:perf',minX:-60,maxX:60,minZ:-60,maxZ:60,dirX:0,dirZ:1,seaLevel:0,
 amplitude:1.2,wavelength:30,speed:6,seed:9,shoreFadeDepth:3,edgeFade:10,barrelStrength:.7};
const terrain=(x,z)=>-6+z*.04;

test('diagnostic decorators return bit-identical wave values and count terrain samples',()=>{
 const perf=new SurfPerfRecorder(8);
 const plain=createSurfWaveField(zone,terrain);
 const counted=instrumentSurfField(createSurfWaveField(zone,instrumentGround(terrain,perf)),perf);
 for(let tick=0;tick<60;tick+=7)for(let x=-50;x<=50;x+=17){
  assert.deepEqual(counted.sample(x,x*.5,tick),plain.sample(x,x*.5,tick));
  assert.equal(counted.height(x,-x,tick),plain.height(x,-x,tick));
 }
 perf.endFrame();
 const snap=perf.snapshot();
 assert.equal(snap.frames,1);
 assert.ok(snap.calls.ground.max>0,'ground samples are counted');
 assert.equal(snap.calls.waveSample.max,54);
 assert.equal(snap.gpu,'not-isolated');
 for(const c of SURF_PERF_CHANNELS){assert.ok(Number.isFinite(snap.cpuMs[c].p95));}
});
test('the recorder ring is bounded and resets per-frame accumulators',()=>{
 const perf=new SurfPerfRecorder(4);
 for(let f=0;f<10;f++){perf.add('tubeUpdate',1,2);perf.endFrame();}
 const snap=perf.snapshot();
 assert.equal(snap.frames,4);
 assert.equal(snap.cpuMs.tubeUpdate.max,1);assert.equal(snap.calls.tubeUpdate.p50,2);
});
test('surf draw stats count only visible meshes inside the frustum',()=>{
 const camera=new THREE.PerspectiveCamera(60,1,.1,1000);camera.position.set(0,5,20);camera.lookAt(0,0,0);
 camera.updateMatrixWorld();camera.updateProjectionMatrix();
 const visible=new THREE.Mesh(new THREE.PlaneGeometry(4,4),new THREE.MeshBasicMaterial());
 const hidden=visible.clone();hidden.visible=false;
 const behind=visible.clone();behind.position.set(0,0,200);
 for(const m of [visible,hidden,behind])m.updateMatrixWorld();
 const stats=surfDrawStats(camera,[visible,hidden,behind,null]);
 assert.deepEqual(stats,{drawCalls:1,vertices:4,triangles:2});
});
