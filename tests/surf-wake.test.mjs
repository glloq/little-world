import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {createSurfWakeView} from '../src/render/surf-wake-view.ts';

const zone={id:'surf:wake',minX:-100,maxX:100,minZ:-100,maxZ:100,dirX:0,dirZ:1,seaLevel:0,
 amplitude:1.2,wavelength:30,speed:6,seed:3,shoreFadeDepth:3,edgeFade:10};
const field=createSurfWaveField(zone,()=>-10);
const rider=()=>({position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:8},mode:'surf',surfStage:'ride',surfHeading:0});
test('wake follows a riding board, stays on the swell and disappears out of surf',()=>{
 const root=new THREE.Group(),wake=createSurfWakeView(root),p=rider();
 const before=wake.mesh.geometry.getAttribute('position').array;
 for(let tick=1;tick<=40;tick++){
  p.position.z+=8/30;p.surfHeading=Math.sin(tick/4)*.8;
  wake.update(p,field,tick,p.position,1);
 }
 assert.equal(wake.mesh.visible,true);assert.equal(wake.stats.drawCalls,1);
 assert.ok(wake.stats.activeSamples>10);
 assert.ok(wake.stats.activeDrops>0,'hard carves throw spray');
 const pos=wake.mesh.geometry.getAttribute('position');
 for(let i=0;i<pos.count;i++)assert.ok(Number.isFinite(pos.getX(i))&&Number.isFinite(pos.getY(i)));
 assert.equal(wake.mesh.geometry.getAttribute('position').array,before,'buffers are reused');
 p.mode='swim';wake.update(p,field,41,p.position,1);
 assert.equal(wake.mesh.visible,false,'removed immediately when the rider leaves the board');
 wake.dispose();assert.equal(root.children.length,0);
});
test('low detail keeps a shorter trail and no spray',()=>{
 const root=new THREE.Group(),wake=createSurfWakeView(root),p=rider();
 wake.setDetail(0);
 for(let tick=1;tick<=40;tick++){p.position.z+=8/30;p.surfHeading=Math.sin(tick/4)*.8;wake.update(p,field,tick,p.position,1);}
 assert.equal(wake.stats.activeDrops,0);
 const low=wake.stats.activeSamples;
 const hq=createSurfWakeView(root),q=rider();hq.setDetail(2);
 for(let tick=1;tick<=40;tick++){q.position.z+=8/30;q.surfHeading=Math.sin(tick/4)*.8;hq.update(q,field,tick,q.position,1);}
 assert.ok(hq.stats.activeSamples>low);
 const r1=createSurfWakeView(root),r2=createSurfWakeView(root),a=rider(),b=rider();
 for(let tick=1;tick<=30;tick++){for(const [w,s] of [[r1,a],[r2,b]]){s.position.z+=8/30;s.surfHeading=Math.sin(tick/3);w.update(s,field,tick,s.position,1);}}
 assert.deepEqual(Array.from(r1.mesh.geometry.getAttribute('position').array),Array.from(r2.mesh.geometry.getAttribute('position').array),'deterministic spray');
});
