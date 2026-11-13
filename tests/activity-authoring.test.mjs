import test from 'node:test';
import assert from 'node:assert/strict';
import {CommandBus} from '../src/studio-core/commands.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {putZone,validateZone} from '../src/studio-core/zones.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {updateElement} from '../src/studio-core/elements.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {defaultMineSettings,withLevelCount,validateMineSettings} from '../src/mine/mine-data.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {buildB1Project} from '../tools/generate-b1-demo.mjs';

const polygon=[{x:-30,z:-10},{x:30,z:-10},{x:30,z:60},{x:-30,z:60}];
test('zone settings: validated, undoable, kept by archives; level count changes stay coherent',()=>{
  const p=createProject({name:'Activités',width:1000,length:1000}),bus=new CommandBus(p);
  const zone={id:'mine',kind:'mine',name:'Mine',polygon,levels:2,mine:defaultMineSettings(polygon,2,40,5)};
  editDocument(bus,'Mine',[],d=>putZone(d,zone));
  editDocument(bus,'Graine',[],d=>updateElement(d,{kind:'zone',id:'mine'},{mine:{...zone.mine,seed:9}}));assert.equal(p.libraries.zones.mine.mine.seed,9);
  bus.undo();assert.equal(p.libraries.zones.mine.mine.seed,5);bus.redo();
  assert.throws(()=>putZone(p,{...zone,levels:3}),/3 niveau/,'level count and settings must agree');
  const four=withLevelCount(zone.mine,4);assert.equal(four.levels.length,4);validateMineSettings(four,polygon,4);
  assert.deepEqual(four.connectors.map(c=>[c.upper,c.lower]),[['level-1','level-2'],['level-2','level-3'],['level-3','level-4']]);
  const one=withLevelCount(four,1);assert.equal(one.connectors.length,0);assert.ok(one.galleries.every(g=>g.levelId==='level-1'));
  putZone(p,{id:'plot',kind:'farm-plot',name:'Champ',polygon:[{x:50,z:0},{x:60,z:0},{x:60,z:10},{x:50,z:10}],farm:{...defaultFarmSettings(polygon),initialCrop:'wheat'}});
  assert.throws(()=>validateZone({...p.libraries.zones.plot,mine:zone.mine},p.world),/mine sur une parcelle/);
  const back=parseProject(readProjectArchive(writeProjectArchive(p)));assert.deepEqual(back.libraries.zones,p.libraries.zones,'ZIP round trip');
});
test('the B1 demonstration source compiles; « Jouer ici » gets its mine, plots, lake and waterfall',async()=>{
  const p=buildB1Project(),compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})}),files=compiled.files;
  assert.ok(!compiled.diagnostics?.some?.(d=>d.severity==='ERROR'),JSON.stringify(compiled.diagnostics?.filter?.(d=>d.severity==='ERROR')));
  const bundle=await openCompiledWorld('http://localhost/w/manifest.json',async url=>{const path=new URL(url).pathname.replace(/^\/w\//,'');return path in files?new Response(files[path]):new Response('',{status:404});});
  const play=playableFromCompiled(bundle);
  assert.equal(play.activities.mines.length,1);assert.equal(play.activities.mines[0].mine.levels.length,3);assert.equal(play.activities.farms.length,2);
  assert.ok(play.gameplay.items.some(i=>i.id==='mine:iron')&&play.gameplay.items.some(i=>i.id==='farm:carrot'),'system items registered');
  const water=play.world.water;assert.ok(water.some(w=>w.kind==='lake'));assert.ok(water.some(w=>w.falls?.length===1));assert.ok(water.some(w=>w.to?.kind==='sea'));
});
