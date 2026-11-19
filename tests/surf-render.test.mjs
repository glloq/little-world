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
/** JS port of SURF_WATER_GLSL vertexPosition, fed with the material's own uniforms. */
const fract=v=>v-Math.floor(v);
function shaderHeight(u,x,zz,env,breaking){
 const dir=u.uDirection.value,across=-dir.y*x+dir.x*zz,bd=u.uBend.value,c=across-bd.y;
 const along=dir.x*x+dir.y*zz+bd.x*c*c*.5+bd.z*Math.sin(bd.w*c+u.uBendSeed.value);
 const sh=u.uShape.value,md=u.uMod.value,cr=u.uCrest.value;
 const p=2*Math.PI*fract((along-u.uSpeed.value*u.uTime.value)/u.uWavelength.value)+u.uPhaseSeed.value;
 const a=sh.x+sh.z*breaking;
 const f=Math.sin(p)+a*Math.sin(2*p)-sh.y*Math.cos(2*p);
 const m=1+md.x*Math.sin(2*Math.PI*fract((along-u.uSpeed.value*u.uSetTime.value)/md.y)+cr.z)+
  md.z*Math.sin(2*Math.PI*fract(across/md.w)+cr.w);
 return u.uSeaLevel.value+.02+u.uAmplitude.value*env*m*f;
}
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
for(const [style,form] of [[undefined],['tubular'],['gentle'],['fast',{organic:true,curvature:.0015,meander:5,meanderLength:120}]]){
test('every LOD GPU vertex matches the fixed-tick CPU wave formula ('+(style??'classic')+(form?' organic':'')+')',()=>{
 const z={...zone,style,form,id:'surf:lod-'+(style??'classic')};
 const field=createSurfWaveField(z,terrain);
 const root=new THREE.Group(),view=createSurfWaterView(root,field,terrain);
 const u=view.uniforms;
 for(const level of [0,1,2]){
  view.setDetail(level,{x:0,z:0});
  const g=view.mesh.geometry,positions=g.getAttribute('position'),
   envelopes=g.getAttribute('aEnvelope'),wet=g.getAttribute('aWet'),shore=g.getAttribute('aShore');
  assert.equal(positions.count,envelopes.count);
  assert.equal(positions.count,wet.count);
  for(let i=0;i<positions.count;i+=Math.max(1,Math.floor(positions.count/90))){
   const x=positions.getX(i),pz=positions.getZ(i),e=envelopes.getX(i);
   if(!wet.getX(i))continue;
   for(const tick of [0,6,109,300,1_000_000]){
    view.update(tick+1,0);
    const cpu=field.height(x,pz,tick);
    assert.notEqual(cpu,null);
    const gpu=shaderHeight(u,x,pz,e,shore.getX(i));
    assert.ok(Math.abs(gpu-cpu-.02)<2e-5,
      'LOD '+level+' tick '+tick+' x '+x+' z '+pz+' discrepancy '+Math.abs(gpu-cpu-.02));
   }
  }
 }
 view.update(101,1);
 assert.ok(Math.abs(u.uTime.value-((101/30)%(z.wavelength/z.speed)))<1e-9);
 view.update(101,0);
 assert.ok(Math.abs(u.uTime.value-((100/30)%(z.wavelength/z.speed)))<1e-9);
 view.update(1_000_001,0);
 assert.ok(u.uTime.value<z.wavelength/z.speed&&u.uSetTime.value<u.uMod.value.y/z.speed,'wrapped phases');
 assert.equal(view.mesh.material.customProgramCacheKey(),'little-world-surf-water-v2');
 view.dispose();
});
}
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
import {barrelPeel} from '../src/surf/surf-barrel.ts';
test('shader whitewater uses the same crest index and peel break point as the CPU tube',()=>{
 const z={...zone,id:'surf:peel-foam',style:'tubular',minX:-120,maxX:120};
 const field=createSurfWaveField(z,terrain);
 const root=new THREE.Group(),view=createSurfWaterView(root,field,terrain),u=view.uniforms;
 const glslMod=(a,b)=>a-b*Math.floor(a/b);
 let checked=0;
 for(const tick of [30,3000,123457,2_000_001]){
  view.update(tick+1,0); // presentation time = tick
  for(let i=0;i<60;i++){
   const x=-110+i*3.7,pz=-100+((i*37)%200);
   const along=z.dirX*x+z.dirZ*pz,across=-z.dirZ*x+z.dirX*pz;
   const local=(along-u.uSpeed.value*u.uTime.value)/u.uWavelength.value-u.uWave.value.z;
   const n=Math.ceil(local),since=n-local;
   const shift=(()=>{const v=u.uWave.value.y+(n-u.uWave.value.x)*.381966;return (v-Math.floor(v))*u.uPeel.value.z;})();
   const elapsedTicks=since*z.wavelength/z.speed*30;
   const pos=u.uPeelSpan.value.w+shift-u.uPeel.value.y*elapsedTicks/30;
   const ahead=glslMod(u.uPeel.value.x*across-pos+u.uPeel.value.z*.5,u.uPeel.value.z)-u.uPeel.value.z*.5;
   // CPU: same crest index, evaluated at the (rounded) tick when that crest passed here.
   const passTick=Math.round(tick-elapsedTicks);if(passTick<0)continue;
   const nTrue=n-(u.uWave.value.x-Math.ceil((Math.min(z.minZ,z.maxZ)-z.speed*tick/30)/z.wavelength-u.uWave.value.z));
   const cpu=barrelPeel(z,x,pz,passTick,nTrue);
   const diff=Math.abs(glslMod(cpu.ahead-ahead+z.wavelength*0+u.uPeel.value.z/2,u.uPeel.value.z)-u.uPeel.value.z/2);
   assert.ok(diff<.25,'tick '+tick+' point '+i+' |Δahead| '+diff);
   checked++;
  }
 }
 assert.ok(checked>150,"checked "+checked);
 view.dispose();
});
