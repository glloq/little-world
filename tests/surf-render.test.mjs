import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSurfWaveField} from '../src/surf/wave-field.ts';
import {createSurfWaterView,surfWaterTier} from '../src/render/surf-water-view.ts';

const zone={id:'surf:lod-test',minX:-120,maxX:120,minZ:-120,maxZ:120,
 dirX:0,dirZ:1,seaLevel:0,amplitude:1.25,wavelength:31,speed:6.2,seed:19,
 shoreFadeDepth:3,edgeFade:9,barrelStrength:.8};
const terrain=(x,z)=>-5+Math.sin(x/80)*.6+Math.sin(z/55)*.3;
const wave=createSurfWaveField(zone,terrain);
const rgba=(p,e,z,time)=>z.seaLevel+.02+z.amplitude*e*
 (Math.sin(2*Math.PI*(((p[0]*z.dirX+p[2]*z.dirZ-z.speed*time)/z.wavelength)%1)+
   (z.seed%4093)/4093*2*Math.PI)+
 .22*Math.sin(4*Math.PI*(((p[0]*z.dirX+p[2]*z.dirZ-z.speed*time)/z.wavelength)%1)+
   2*(z.seed%4093)/4093*2*Math.PI));
test('three surf tessellation tiers preserve material and keep a bounded vertex budget',()=>{
 const root=new THREE.Group(),view=createSurfWaterView(root,wave,terrain);
 assert.equal(view.stats.tier,0);
 const initialGeometry=view.mesh.geometry,material=view.mesh.material;
 const high=view.stats.triangles;
 view.setDetail(1,{x:0,z:0});
 assert.equal(view.stats.tier,1);
 assert.ok(view.stats.triangles<high);
 view.setDetail(2,{x:0,z:0});
 assert.equal(view.stats.tier,2);
 const low=view.stats.triangles;
 assert.ok(low<high*.15);
 assert.ok(view.stats.maxVertices<=26000);
 assert.equal(view.mesh.material,material);
 view.setDetail(0,{x:0,z:0});
 assert.equal(view.mesh.geometry,initialGeometry);
 view.dispose();assert.equal(root.children.length,0);
});
test('distance-adaptive tier selection is clamped and never alters wave state',()=>{
 assert.equal(surfWaterTier(zone,{x:0,z:0},0),0);
 assert.equal(surfWaterTier(zone,{x:200,z:0},0),0);
 assert.equal(surfWaterTier(zone,{x:300,z:0},0),1);
 assert.equal(surfWaterTier(zone,{x:580,z:0},0),2);
 assert.equal(surfWaterTier(zone,{x:0,z:0},2),2);
 assert.equal(surfWaterTier(zone,{x:0,z:0},5),2);
 const h=wave.height(0,0,100);
 const root=new THREE.Group(),view=createSurfWaterView(root,wave,terrain);
 for(const level of [0,1,2,1,0])view.setDetail(level,{x:0,z:0});
 assert.equal(wave.height(0,0,100),h);
 view.dispose();
});
test('every LOD GPU vertex matches the fixed-tick CPU wave formula within float32 precision',()=>{
 const root=new THREE.Group(),view=createSurfWaterView(root,wave,terrain);
 for(const level of [0,1,2]){
  view.setDetail(level,{x:0,z:0});
  const g=view.mesh.geometry,positions=g.getAttribute('position'),
   envelopes=g.getAttribute('aEnvelope'),wet=g.getAttribute('aWet');
  assert.equal(positions.count,envelopes.count);
  assert.equal(positions.count,wet.count);
  for(let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/90))){
   const x=positions.getX(i),z=positions.getZ(i),e=envelopes.getX(i);
   if(!wet.getX(i))continue;
   for(const tick of [0,6,109,300]){
    const p=[x,positions.getY(i),z],shaderHeight=rgba(p,e,zone,tick/30);
    const cpu=wave.height(x,z,tick);
    assert.notEqual(cpu,null);
    assert.ok(Math.abs(shaderHeight-cpu-.02)<.00001,
      'LOD '+level+' tick '+tick+' x '+x+' z '+z+' discrepancy '+Math.abs(shaderHeight-cpu-.02));
   }
  }
 }
 view.update(101,1);
 const shader=view.mesh.material;
 assert.ok(shader instanceof THREE.ShaderMaterial);
 assert.ok(Math.abs(shader.uniforms.uTime.value-101/30)<1e-9);
 view.update(101,0);
 assert.ok(Math.abs(shader.uniforms.uTime.value-100/30)<1e-9);
 view.update(1_000_000,1);
 const cycle=zone.wavelength/zone.speed;
 const expectedWrapped=(1_000_000/30)%cycle;
 assert.ok(Math.abs(shader.uniforms.uTime.value-expectedWrapped)<1e-9);
 const point={x:0,z:0};
 const original=wave.height(point.x,point.z,1_000_000);
 const phaseWrapped=rgba([point.x,0,point.z],1,zone,expectedWrapped)-.02;
 assert.ok(Math.abs(original-phaseWrapped)<.00001,'long-session CPU/GPU phases remain aligned');
 view.dispose();
});
import {selectSurfWaterTier,surfZoneViewDistance,surfWaterLattice,SURF_LOD_HYSTERESIS} from '../src/render/surf-water-view.ts';
test('LOD hysteresis keeps the current tier inside the band around each threshold',()=>{
 const at=d=>({x:zone.maxX+d,z:0});
 let tier=0;const path=[100,140,160,170,160,140,120,100,175,190,175,150,130,124,100];
 const seen=[];
 for(const d of path){tier=selectSurfWaterTier(zone,at(d),0,tier);seen.push(tier);}
 // 150 m ±18 %: switch up only beyond 177 m, back down only below 123 m.
 assert.deepEqual(seen,[0,0,0,0,0,0,0,0,0,1,1,1,1,1,0]);
 assert.equal(selectSurfWaterTier(zone,at(380),0,2),2,'tier 2 kept above 328 m');
 assert.equal(selectSurfWaterTier(zone,at(320),0,2),1);
 assert.equal(selectSurfWaterTier(zone,at(40),2,0),2,'budget floor still wins');
 assert.ok(SURF_LOD_HYSTERESIS>0&&SURF_LOD_HYSTERESIS<.5);
 // Camera altitude counts: a high overview camera is far from the wave detail.
 assert.ok(surfZoneViewDistance(zone,{x:0,z:0,y:300})>=300-zone.seaLevel);
 assert.equal(surfZoneViewDistance(zone,{x:0,z:0}),0);
});
test('nested LOD grids share terrain samples and coarse vertices are fine vertices',()=>{
 let calls=0;const counted=(x,z)=>{calls++;return terrain(x,z);};
 const lattice=surfWaterLattice(zone,counted);
 assert.equal(calls,(lattice.nx+1)*(lattice.nz+1),'one terrain pass for all tiers');
 assert.equal(lattice.nx%4,0);assert.equal(lattice.nz%4,0);
 const root=new THREE.Group(),view=createSurfWaterView(root,wave,terrain);
 const fine=new Map();
 const g0=view.mesh.geometry,p0=g0.getAttribute('position'),e0=g0.getAttribute('aEnvelope');
 for(let i=0;i<p0.count;i++)fine.set(p0.getX(i).toFixed(4)+':'+p0.getZ(i).toFixed(4),e0.getX(i));
 for(const level of [1,2]){
  view.setDetail(level,{x:0,z:0});
  const g=view.mesh.geometry,p=g.getAttribute('position'),e=g.getAttribute('aEnvelope');
  for(let i=0;i<p.count;i++)
   assert.equal(fine.get(p.getX(i).toFixed(4)+':'+p.getZ(i).toFixed(4)),e.getX(i),'tier '+level+' vertex '+i);
 }
 view.dispose();
});
test('fully dry beach quads are not indexed, wet water keeps full coverage',()=>{
 const beachZone={...zone,id:'surf:lod-beach'};
 const beach=(x,z)=>z>40?2:-5+Math.max(0,z+120)*.03;
 const root=new THREE.Group(),view=createSurfWaterView(root,createSurfWaveField(beachZone,beach),beach);
 assert.ok(view.stats.wetRatio<.9&&view.stats.wetRatio>.5,'wet ratio '+view.stats.wetRatio);
 const g=view.mesh.geometry,p=g.getAttribute('position'),idx=g.index;
 for(let t=0;t<idx.count;t+=3){
  const zs=[idx.getX(t),idx.getX(t+1),idx.getX(t+2)].map(i=>p.getZ(i));
  assert.ok(Math.min(...zs)<=40+1e-6,'a drawn triangle touches water');
 }
 view.dispose();
});
