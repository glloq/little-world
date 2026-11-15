import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuidedWorld} from '../src/studio-core/world-start.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {regionCells,paintMask} from '../src/studio-core/geo-edits.ts';
import {MASK_GRID} from '../src/geography/layers.ts';
import {newRegion,previewRegion,applyRegion,removeRegion,regionAffectedChunks,
  validateRegionRecipe} from '../src/studio-core/region-recipes.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
const project=()=>createGuidedWorld({name:'A B régions',mode:'calm',width:1000,length:1000,seed:42,cliffs:.25,volcano:false});
const poly=(x=0,z=0)=>[{x:x-40,z:z-40},{x:x+40,z:z-40},{x:x+40,z:z+40},{x:x-40,z:z+40}];
const recipe=(p,options={})=>newRegion(p,{points:poly(),seed:42,coverage:100,transitionM:0,relief:'none',preset:'forest',...options});
const countMarks=(p,layer)=>Object.values(p.chunks).reduce((n,c)=>n+[...(c.layers?.[layer]??'')].filter(v=>v!=='.').length,0);

test('region A: editable polygon with bounded coordinates, reject crossed polygon',()=>{
 const p=project(),r=recipe(p);assert.doesNotThrow(()=>validateRegionRecipe(r,p.world.bounds));
 assert.throws(()=>validateRegionRecipe({...r,points:[{x:-30,z:-30},{x:30,z:30},{x:30,z:-30},{x:-30,z:30}]},p.world.bounds),/croisé|surface/);
 assert.throws(()=>validateRegionRecipe({...r,points:poly(900,0)},p.world.bounds),/hors carte/);
 assert.throws(()=>validateRegionRecipe({...r,points:poly(),coverage:120},p.world.bounds),/paramètres/);
});

test('region B: deterministic masks, no per-object vegetation, V3 source and ZIP preserved',()=>{
 const p=project(),r=recipe(p),bus=new CommandBus(p);
 const before=previewRegion(p,r);assert.ok(before.cells>0&&before.sectors>0);
 const ids=regionAffectedChunks(p,r);let report;
 editDocument(bus,'Create region',ids,d=>{report=applyRegion(d,r);});
 assert.ok(report.painted>0);
 assert.equal(Object.keys(p.entityIndex).length,0);
 assert.ok(countMarks(p,'biome')>0&&countMarks(p,'moisture')>0);
 assert.equal(p.libraries.regions[r.id].generated.revision,1);
 const first=structuredClone(p.libraries.regions[r.id].generated.masks);
 const redux=applyRegion(p,r);
 assert.deepEqual(p.libraries.regions[r.id].generated.masks,first);
 assert.ok(redux.painted>0);
 parseProject(structuredClone(p));
 const roundtrip=readProjectArchive(writeProjectArchive(p));
 assert.equal(roundtrip.libraries.regions[r.id].preset,'forest');
 assert.ok(countMarks(roundtrip,'biome')>0);
});

test('region B: author edits protected through regeneration, shrink, and removal',()=>{
 const p=project(),r=recipe(p),bus=new CommandBus(p);
 const cells=regionCells(p,{kind:'polygon',points:r.points}),[cid,indices]=[...cells.entries()][0],cell=indices[0];
 paintMask(p,'biome','n',new Map([[cid,[cell]]]));
 const regionIds=regionAffectedChunks(p,r);
 editDocument(bus,'First region',regionIds,d=>applyRegion(d,r));
 assert.equal(p.chunks[cid].layers.biome[cell],'n');
 const own=Object.entries(p.libraries.regions[r.id].generated.masks).find(([,layers])=>layers.biome?.includes('f'));
 assert.ok(own);const [ownChunk,owned]=own,ownedCell=owned.biome.indexOf('f');
 paintMask(p,'biome','v',new Map([[ownChunk,[ownedCell]]]));
 const move={...structuredClone(p.libraries.regions[r.id]),preset:'meadow',points:poly(110,0)};
 editDocument(bus,'Regenerate region',regionAffectedChunks(p,move),d=>applyRegion(d,move));
 assert.equal(p.chunks[cid].layers.biome[cell],'n');
 assert.equal(p.chunks[ownChunk].layers.biome[ownedCell],'v');
 assert.ok(p.libraries.regions[r.id].generated.revision===2);
 editDocument(bus,'Delete region',regionAffectedChunks(p,p.libraries.regions[r.id]),d=>removeRegion(d,r.id));
 assert.equal(p.libraries.regions[r.id],undefined);
 assert.equal(p.chunks[ownChunk].layers.biome[ownedCell],'v');
 assert.equal(p.chunks[cid].layers.biome[cell],'n');
 parseProject(structuredClone(p));
 bus.undo();assert.ok(p.libraries.regions[r.id]);
 bus.redo();assert.equal(p.libraries.regions[r.id],undefined);
});

test('region A: polygon plateau uses single native archipelago shape and survives undo/export',()=>{
 const p=project(),before=p.world.terrain.archipelago.features.length,region=recipe(p,{relief:'plateau',heightM:180,edgeM:20});
 const bus=new CommandBus(p);
 editDocument(bus,'Polygon plateau',regionAffectedChunks(p,region),d=>applyRegion(d,region));
 const f=p.world.terrain.archipelago.features.find(x=>x.id===region.id+'.plateau');
 assert.equal(f.kind,'plateau');assert.equal(f.polygon.length,4);
 assert.equal(p.world.terrain.archipelago.features.length,before+1);
 parseProject(structuredClone(p));bus.undo();
 assert.equal(p.world.terrain.archipelago.features.length,before);
 bus.redo();assert.equal(p.world.terrain.archipelago.features.length,before+1);
 const unchanged=structuredClone(p.libraries.regions[region.id]);
 unchanged.heightM=220;
 applyRegion(p,unchanged);
 assert.equal(p.world.terrain.archipelago.features.find(x=>x.id===region.id+'.plateau').heightM,220);
 removeRegion(p,region.id);assert.equal(p.world.terrain.archipelago.features.length,before);
 parseProject(structuredClone(p));
});

test('region B: 16x16 mask budget and region size hard-cap',()=>{
 const p=project(),r=recipe(p,{points:poly(),transitionM:30,coverage:55});
 const first=previewRegion(p,r),second=previewRegion(p,r);
 assert.deepEqual(first,second);
 applyRegion(p,r);
 for(const chunk of Object.values(p.chunks))for(const mask of Object.values(chunk.layers??{}))assert.equal(mask.length,MASK_GRID**2);
 assert.throws(()=>previewRegion(p,{...r,points:poly(),transitionM:-1}));
});
