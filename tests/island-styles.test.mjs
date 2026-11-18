import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_MAP_REQUIREMENTS,STEPPED_MAP_REQUIREMENTS,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {ISLAND_STYLES,selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {planWorldTerrain} from '../src/studio-core/world-terrain-planner.ts';
import {composeWorld,projectFromComposition} from '../src/studio-core/world-composition.ts';
import {archipelagoField,compilePolygon} from '../src/geography/archipelago.ts';
import {parseArchipelago,ARCHIPELAGO_LIMITS} from '../src/geography/archipelago-params.ts';
import {compileWaterNetwork} from '../src/water/profile.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {previewWorldRecomposition,applyWorldRecomposition} from '../src/studio-core/world-recomposition.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
const req=model=>selectIslandStyle(structuredClone(DEFAULT_MAP_REQUIREMENTS),model);
const plans=new Map();const plan=model=>{if(!plans.has(model))plans.set(model,composeWorld(req(model)));return plans.get(model);};
const field=r=>{const t=planWorldTerrain(r);return {t,f:archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},t.terrain)};};
test('style schema is explicit, strict and round-trippable; V3 defaults stay frozen',()=>{
 assert.equal(DEFAULT_MAP_REQUIREMENTS.compositionVersion,4);assert.equal(STEPPED_MAP_REQUIREMENTS.compositionVersion,3);assert.equal(STEPPED_MAP_REQUIREMENTS.islandStyle,undefined);
 const r=req('gentle');assert.deepEqual(validateMapRequirements(r),r);
 for(const override of [{altitudeM:Infinity},{elongation:.5},{orientation:360},{valleys:-1},{model:'unknown'},{version:2},{unexpected:1}])assert.throws(()=>validateMapRequirements({...r,islandStyle:{...r.islandStyle,...override}}));
 assert.throws(()=>validateMapRequirements({...r,islandStyle:undefined}));assert.throws(()=>validateMapRequirements({...r,compositionVersion:3}));
 const p=projectFromComposition(plan('gentle'),'Île douce');assert.deepEqual(readProjectArchive(writeProjectArchive(p)),p);
});
test('six distinct models produce actual relief, native WATER and environmental coverage',()=>{
 const signatures=new Set();
 for(const model of Object.keys(ISLAND_STYLES)){
  const p=plan(model);assert.ok(p.ready,JSON.stringify(p.diagnostics));const terrain=p.project.world.terrain.archipelago,q=p.metrics.natural;
  assert.ok(terrain.features.length<=ARCHIPELAGO_LIMITS.features);assert.ok(terrain.landmasses.length<=ARCHIPELAGO_LIMITS.landmasses);
  assert.ok(Math.abs(q.maxAltitudeM-req(model).islandStyle.altitudeM)<req(model).islandStyle.altitudeM*.08+3);
  assert.ok(p.metrics.coverage.biomeCoverage>.96);assert.equal(p.metrics.coverage.interiorSubseaSamples,0);
  assert.ok(Object.values(p.project.libraries.water).length>0,model+' has actual water');
  const source=projectGeography(p.project).source;
  for(const w of compileWaterNetwork(Object.values(p.project.libraries.water),source,0)){
   assert.ok(!w.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'),model+JSON.stringify(w.diagnostics));
   assert.ok(w.points.every((v,i)=>!i||v.level<=w.points[i-1].level+1e-6));
  }
  if(model!=='stepped')assert.ok(!terrain.features.some(f=>f.kind==='plateau'),'No systemic terraces: '+model);
  signatures.add(fingerprint(terrain));
 }
 assert.equal(signatures.size,6);assert.ok(plan('gentle').metrics.natural.maxAltitudeM<plan('central-massif').metrics.natural.maxAltitudeM*.4);
 assert.ok(plan('gentle').metrics.natural.gentleSlopeShare>.5);
});
test('caldera has a marine centre and open passes; high native features cannot fill its sea',()=>{
 const r=req('caldera'),{t,f}=field(r);assert.ok(t.terrain.landmasses.length>=5);assert.ok(f.height(0,0)<-.6);
 // Flood fill the real sampled ocean, checking that the central lagoon reaches the outer sea.
 const n=96,start=48*n+48,seen=new Set([start]),queue=[start];let border=false;
 for(let k=0;k<queue.length;k++){
  const i=queue[k],x=i%n,z=Math.floor(i/n);if(!x||!z||x===n-1||z===n-1)border=true;
  for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,nz=z+dz,j=nz*n+nx;if(nx<0||nz<0||nx>=n||nz>=n||seen.has(j))continue;
   if(f.height((nx+.5)/n*r.width-r.width/2,(nz+.5)/n*r.length-r.length/2)<-.6){seen.add(j);queue.push(j);}}
 }assert.ok(border,'Lagoon opens to the sea');
 for(let z=0;z<n;z++)for(let x=0;x<n;x++){const wx=(x+.5)/n*r.width-r.width/2,wz=(z+.5)/n*r.length-r.length/2;if(f.coast(wx,wz)<0)assert.ok(f.height(wx,wz)<0,'No off-coast ghost islands');}
});
test('physical allongement, orientation and side massif affect the actual geometry',()=>{
 const r=req('central-massif'),a=field(r).t.terrain.landmasses[0].outline,extent=(points,key)=>Math.max(...points.map(p=>p[key]))-Math.min(...points.map(p=>p[key]));
 assert.ok(extent(a,'z')/extent(a,'x')>1.3);
 const rotated=field({...r,islandStyle:{...r.islandStyle,orientation:90}}).t.terrain.landmasses[0].outline;assert.ok(extent(rotated,'x')/extent(rotated,'z')>1.3);
 const center=field(r).t.terrain.features.find(f=>f.id==='composition-main-massif'),side=field(req('side-massif')).t.terrain.features.find(f=>f.id==='composition-main-massif');assert.ok(side.x>center.x+200);
 assert.notEqual(fingerprint(field({...r,seed:100}).t.terrain),fingerprint(field({...r,seed:101}).t.terrain));
});
test('hydrology preferences report missing requests; explicit strict requests block creation',()=>{
 const r=req('gentle');r.rivers=0;r.tributaries=6;
 const preferred=composeWorld(r);assert.ok(preferred.ready);assert.ok(preferred.diagnostics.some(d=>d.code==='TRIBUTARIES_MISSING'&&d.severity==='WARNING'));
 const strict=composeWorld({...r,islandStyle:{...r.islandStyle,hydrology:'required'}});assert.equal(strict.ready,false);assert.throws(()=>projectFromComposition(strict,'Impossible'));
 const missing=composeWorld({...req('gentle'),landscapes:[{kind:'mountain',required:true},{kind:'coast',required:true}]});assert.ok(missing.diagnostics.some(d=>d.code==='LANDSCAPE_MISSING'&&d.severity==='ERROR'));
});
test('full and biome-only recomposition preserve ownership and reject stale previews',()=>{
 const p=structuredClone(plan('central-massif').project),id=Object.keys(p.chunks).find(id=>p.chunks[id].layers?.biome?.includes('f')),i=p.chunks[id].layers.biome.indexOf('f');
 p.chunks[id].layers.biome=p.chunks[id].layers.biome.slice(0,i)+'g'+p.chunks[id].layers.biome.slice(i+1);
 const geometry=fingerprint(p.world.terrain),water=fingerprint(p.libraries.water),next=selectIslandStyle(p.world.generation,'gentle'),refresh=previewWorldRecomposition(p,next,'biomes');
 assert.equal(refresh.project.chunks[id].layers.biome[i],'g');assert.equal(fingerprint(refresh.project.world.terrain),geometry);assert.equal(fingerprint(refresh.project.libraries.water),water);assert.deepEqual(refresh.project.world.generation,p.world.generation);
 const full=previewWorldRecomposition(p,next);assert.equal(full.project.world.generation.islandStyle.model,'gentle');assert.equal(full.project.chunks[id].layers.biome[i],'g');
 const changed=structuredClone(p);changed.manifest.name='Changed';assert.throws(()=>applyWorldRecomposition(changed,full));
 const recipe=Object.values(p.libraries.regions)[0];recipe.preset='meadow';const modified=previewWorldRecomposition(p,p.world.generation,'biomes');assert.equal(modified.project.libraries.regions[recipe.id].preset,'meadow');
});
test('extreme dimensions stay within native budgets and optional coastal fade preserves legacy parameters',()=>{
 for(const model of ['central-massif','volcanic','caldera','stepped'])for(const [width,length,orientation]of [[500,8000,35],[8000,500,90],[8000,8000,0]]){
  const r=req(model);r.width=width;r.length=length;r.islandStyle.orientation=orientation;
  const {t}=field(r);assert.deepEqual(parseArchipelago(t.terrain,r),t.terrain);
 }
 const legacy=field({...STEPPED_MAP_REQUIREMENTS}).t.terrain;assert.equal(legacy.coastalReliefFadeM,undefined);assert.deepEqual(parseArchipelago(legacy,STEPPED_MAP_REQUIREMENTS),legacy);
});
test('8 km creation batches more than sixteen ownership regions without exceeding per-region limits',()=>{
 const r=req('gentle');r.width=8000;r.length=8000;r.rivers=0;r.tributaries=0;
 const result=composeWorld(r);assert.ok(result.ready,JSON.stringify(result.diagnostics));const regions=Object.values(result.project.libraries.regions);
 assert.ok(regions.length>16);assert.ok(regions.every(r=>Object.keys(r.generated.masks).length<=256));assert.ok(result.metrics.coverage.biomeCoverage>.97);
});
