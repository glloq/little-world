import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,chunkAt,affectedChunkIds} from '../src/studio-core/schema.ts';
import {putEntity,putPath,putTerrainEdit} from '../src/studio-core/source.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {regionReliefStrokes,protectedCells,regionCells,regionElements,paintMask} from '../src/studio-core/geo-edits.ts';
import {transactionTerrainAreas,terrainImpacts} from '../src/studio-core/terrain-impact.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {islandPreset} from '../src/terrain-generator.ts';

function project(){
  const p=createProject({name:'Cohérence',width:3000,length:8000,seed:4242,terrain:islandPreset(3000,8000)});
  putPath(p,{id:'path:village',points:[{x:-40,z:2000},{x:40,z:2000}],width:3,kind:'stone'});
  putEntity(p,{id:'house',name:'Maison',kind:'building',ownerChunkId:chunkAt(p.world,0,2030),components:{Transform:{type:'Transform',position:{x:0,y:0,z:2030},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:'architecture.cottage'}}});
  return p;
}
const env=p=>{const g=projectGeography(p).ctx;return {height:g.height,water:(x,z)=>g.water(x,z,g.height(x,z))};};
test('relief changes report the authored elements that became inconsistent',()=>{
  const p=project(),bus=new CommandBus(p);
  assert.equal(terrainImpacts(p,[{minX:-60,maxX:60,minZ:1980,maxZ:2050}],env(p)).items.length,0,'flat village: nothing to report');
  const bump={id:'hill',x:0,z:2010,radius:25,strength:10,mode:'raise',height:10};
  const t=editDocument(bus,'Colline',affectedChunkIds(p.world,bump.x,bump.z,bump.radius),d=>putTerrainEdit(d,bump));
  const areas=transactionTerrainAreas(t);assert.deepEqual(areas,[{minX:-25,maxX:25,minZ:1985,maxZ:2035}]);
  const impact=terrainImpacts(p,areas,env(p));
  assert.ok(impact.touched>=2,'path and house touched');assert.ok(impact.items.some(i=>i.ref.id==='path:village'&&/pente/.test(i.message)),'steep path reported');
  assert.ok(impact.items.some(i=>i.ref.id==='house'&&/pente/.test(i.message)),'house on a slope reported');
  bus.undo();const back=transactionTerrainAreas(bus.serialize().redo.at(-1));assert.equal(back.length,1,'undo reports the same area');
});
test('region relief strokes: bounded, mean-height flattening, protection of earlier retouches',()=>{
  const p=project(),r={kind:'polygon',points:[{x:-50,z:1950},{x:50,z:1950},{x:50,z:2050},{x:-50,z:2050}]},h=env(p).height;
  const flat=regionReliefStrokes(p,r,'flatten',0,h,false);assert.ok(flat.length>4&&flat.length<200);assert.ok(flat.every(s=>s.mode==='flatten'&&Math.abs(s.height-flat[0].height)<1e-9),'single target height');
  const raise=regionReliefStrokes(p,r,'raise',3,h,false);assert.ok(raise.every(s=>s.mode==='raise'&&s.height===3));
  putTerrainEdit(p,{id:'kept',x:0,z:2000,radius:20,strength:2,mode:'raise',height:2});
  const protectedOnes=regionReliefStrokes(p,r,'flatten',0,h,true);assert.ok(protectedOnes.length<flat.length,'discs inside earlier retouches skipped');
  assert.ok(protectedOnes.every(s=>(s.x)**2+(s.z-2000)**2>=400));
  assert.throws(()=>regionReliefStrokes(p,{kind:'polygon',points:[{x:-1400,z:-3900},{x:1400,z:-3900},{x:1400,z:3900},{x:-1400,z:3900}]},'raise',1,h,false),/trop grande/);
});
test('mask protection and region content selection',()=>{
  const p=project(),r={kind:'polygon',points:[{x:-50,z:1950},{x:50,z:1950},{x:50,z:2050},{x:-50,z:2050}]},cells=regionCells(p,r);
  const small=regionCells(p,{kind:'circle',x:0,z:2000,radius:8});paintMask(p,'material','r',small);
  const free=protectedCells(p,'material',cells),count=m=>[...m.values()].reduce((n,c)=>n+c.length,0);
  assert.equal(count(free),count(cells)-count(small),'earlier corrections excluded');paintMask(p,'material','s',free);
  const id=chunkAt(p.world,0,2000);assert.ok(p.chunks[id].layers.material.includes('r'),'protected cells kept their value');
  assert.deepEqual(regionElements(p,r).map(v=>v.id).sort(),['house','path:village']);
});
