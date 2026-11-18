import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {planWorldTerrain} from '../src/studio-core/world-terrain-planner.ts';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {STEPPED_MAP_REQUIREMENTS as defaults} from '../src/studio-core/map-requirements.ts';
import {compileWaterNetwork,WaterSpatialIndex} from '../src/water/profile.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {polylineDistance} from '../src/geography/archipelago.ts';
import {generatorField} from '../src/terrain-generator.ts';
import {maskCell,cellCenter} from '../src/geography/layers.ts';
import {fingerprint} from '../src/world-production/landscape-schema.ts';
import {previewWorldRecomposition} from '../src/studio-core/world-recomposition.ts';
import {readProjectArchive,writeProjectArchive} from '../src/studio-core/archive.ts';
const req=(overrides={})=>({...structuredClone(defaults),...overrides});
test('reference identity: highlands, five descending floors, connected streams and explicit cascades',()=>{
 const plan=composeWorld(req());assert.equal(plan.ready,true,JSON.stringify(plan.diagnostics));
 const p=plan.project,floors=p.world.terrain.archipelago.features.filter(f=>f.id.startsWith('composition-terrace-'));
 assert.equal(floors.length,5);assert.ok(floors[0].heightM>600);assert.equal(floors.at(-1).heightM,24);
 assert.ok(floors.every((f,i)=>!i||f.heightM<floors[i-1].heightM));
 const waters=Object.values(p.libraries.water),main=waters.find(w=>w.to?.kind==='sea'),branches=waters.filter(w=>w.to?.kind==='river');
 assert.equal(branches.length,2);assert.ok(branches.every(w=>w.to.id===main.id));
 const compiled=compileWaterNetwork(waters,projectGeography(p).source,0);
 assert.ok(compiled.reduce((n,w)=>n+(w.falls?.length??0),0)>=3);
 for(const water of compiled){
  assert.equal(water.diagnostics.some(d=>d.severity==='ERROR'||d.code==='WATER_LOCAL_RISE'),false);
  assert.ok(water.points.every((q,i)=>!i||q.level<=water.points[i-1].level+1e-6));
 }
 const index=new WaterSpatialIndex(waters,projectGeography(p).source,0);
 for(const branch of branches){const p=branch.points[Math.floor(branch.points.length/2)];assert.ok(index.query(p.x,p.z).some(h=>h.water.id===branch.id),'Streams create actual WATER volumes');}
 assert.deepEqual(readProjectArchive(writeProjectArchive(p)),p);
});
test('biome separations follow actual altitude and water, not only province polygons',()=>{
 const plan=composeWorld(req()),p=plan.project,g=projectGeography(p),b=p.world.bounds,grid=g.sources.grid;
 let high=0,middle=0,wet=0,wideWet=0;
 for(const chunk of Object.values(p.chunks))for(let i=0;i<256;i+=3){
  const q=cellCenter(grid,chunk.chunkId,i),h=g.source(q.x,q.z),code=chunk.layers?.biome?.[i];
  if(!code||code==='.')continue;
  if(h>500){assert.equal(code,'n');high++;}
  if(code==='f'){assert.ok(h>150);middle++;}
  if(code==='w'){assert.ok(h<40);wet++;if(Object.values(p.libraries.water).every(w=>polylineDistance(w.points,q.x,q.z)>150))wideWet++;}
 }
 assert.ok(high>100&&middle>100&&wet>30);assert.ok(wideWet>30,'The wetland district is a floodplain, not only a thin water buffer');
 const at=maskCell(grid,(b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2);assert.ok(at);
 assert.equal(plan.metrics.coverage.interiorSubseaSamples,0);
});
test('a requested volcano is a separate caldera district; the main ecological sequence stays intact',()=>{
 const r=req({landscapes:[...defaults.landscapes,{kind:'volcanic',required:true}]}),plan=composeWorld(r);assert.equal(plan.ready,true);
 const p=plan.project,volcano=p.world.terrain.archipelago.features.find(f=>f.kind==='volcano');assert.ok(volcano);
 assert.ok(volcano.craterRadiusM>=volcano.radiusM*.4);
 assert.ok(Object.values(p.libraries.regions).some(r=>r.name==='Volcan'&&r.preset==='volcanic'));
 assert.deepEqual(Object.values(p.libraries.regions).filter(r=>r.id.startsWith('composition-region-')).map(r=>r.preset),['mountain','forest','meadow','marsh','coast']);
 const field=generatorField(p.world.terrain,{...r,seaLevel:0},()=>0);
 let maximum=0;for(let z=0;z<48;z++)for(let x=0;x<64;x++)maximum=Math.max(maximum,field.height(-2000+(x+.5)/64*4000,-1500+(z+.5)/48*3000));
 for(const feature of p.world.terrain.archipelago.features)if('x' in feature)maximum=Math.max(maximum,field.height(feature.x,feature.z));
 assert.ok(maximum>800&&maximum<=1500);
});
test('V2 archived requirements reproduce unchanged terrain and defaults below three floors are rejected explicitly',async()=>{
 const report=JSON.parse(await readFile(new URL('../docs/captures/provinces-v2/report.json',import.meta.url),'utf8'));
 for(const row of report.rows.slice(0,3))assert.equal(fingerprint(composeWorld(row.requirements).project.world.terrain),row.signature);
 const invalid=composeWorld(req({terraces:1}));assert.equal(invalid.ready,false);assert.ok(invalid.diagnostics.some(d=>d.code==='TERRACE_LEVELS_REQUIRED'));
});
test('boundary regeneration preserves hand-painted cells and manually changed region recipes',()=>{
 const p=composeWorld(req()).project,region=p.libraries.regions['composition-region-1'];
 const [id,layers]=Object.entries(region.generated.masks).find(([,v])=>v.biome?.includes('f')),
  i=layers.biome.indexOf('f');
 p.chunks[id].layers.biome=p.chunks[id].layers.biome.slice(0,i)+'w'+p.chunks[id].layers.biome.slice(i+1);
 const before=fingerprint(p),preview=previewWorldRecomposition(p,p.world.generation,'biomes');
 assert.equal(fingerprint(p),before);assert.equal(preview.project.chunks[id].layers.biome[i],'w');
 region.name='Région personnalisée';region.preset='scrub';
 const next=previewWorldRecomposition(p,p.world.generation,'biomes');
 assert.equal(next.project.libraries.regions[region.id].preset,'scrub');assert.equal(next.project.libraries.regions[region.id].name,region.name);
});

test('organic shelves have rounded contours without the old diagonal cut corners',()=>{
 const plan=planWorldTerrain(req());
 for(const shelf of plan.terrain.features.filter(f=>f.kind==='plateau')){
  assert.equal(shelf.polygon.length,64);
  for(let i=0;i<shelf.polygon.length;i++){
   const a=shelf.polygon[i],b=shelf.polygon[(i+1)%64],c=shelf.polygon[(i+2)%64],dx=b.x-a.x,dz=b.z-a.z,ex=c.x-b.x,ez=c.z-b.z;
   const turn=Math.abs(Math.atan2(dx*ez-dz*ex,dx*ex+dz*ez));
   assert.ok(turn<Math.PI/4,'No sharp zigzag or clipped tip on the reference-sized map');
   assert.ok(Math.hypot(dx,dz)<150,'Curves are described by short native edges, not kilometre-long diagonal fronts');
  }
 }
 for(const line of plan.terrain.features.filter(f=>f.kind==='ridge'||f.kind==='valley'))assert.equal(line.points.length,24);
});
