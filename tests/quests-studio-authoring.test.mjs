import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';

const make=()=>{
 const p=createProject({name:'World quest editing test',seed:1284,
  projectId:'project:quests',worldId:'island:studio'});
 const quest={
  questKey:'quest:authored:1',templateId:'studio:authored',templateVersion:1,
  islandId:p.world.worldId,giverId:'npc:helper',bindings:{title:'Aller-retour au port'},
  steps:[
   {kind:'talk',npcId:'npc:helper'},
   {kind:'travel',fromIslandId:'island:studio',toIslandId:'island:forest'},
   {kind:'talk',npcId:'npc:forest:friend',islandId:'island:forest'},
   {kind:'travel',fromIslandId:'island:forest',toIslandId:'island:studio'},
  ],
  rewards:[{kind:'coins',quantity:8}],dependencies:['npc:helper'],
  catalogRevision:'studio-v1',proof:{capabilityIds:['npc:helper'],validatorVersion:'studio-author-v1'},
 };
 p.libraries.questCatalog={[quest.questKey]:quest};
 return {p,quest};
};
test('F07 author-owned cross-island quests survive complete Studio project validation',()=>{
 const {p,quest}=make();
 const original=JSON.stringify(p);
 const parsed=parseProject(p);
 assert.deepEqual(parsed.libraries.questCatalog[quest.questKey],quest);
 assert.equal(JSON.stringify(p),original,'project parsing must not mutate author data');
 const archived=JSON.parse(JSON.stringify(parsed));
 assert.deepEqual(parseProject(archived).libraries.questCatalog,p.libraries.questCatalog);
});
test('F07 project rejects alien-world quest ids, untrusted scripts and invalid ferry route',()=>{
 const {p,quest}=make();
 const wrong={...p,libraries:{...p.libraries,questCatalog:{
  [quest.questKey]:{...quest,islandId:'island:foreign'},
 }}};
 assert.throws(()=>parseProject(wrong),/monde incorrect/);
 const code={...quest,script:'eval(1)'};
 assert.throws(()=>parseProject({...p,libraries:{...p.libraries,questCatalog:{
  [quest.questKey]:code,
 }}}),/unknown field/);
 const invalid={...quest,steps:[{kind:'travel',fromIslandId:'island:studio',toIslandId:'island:studio'}]};
 assert.throws(()=>parseProject({...p,libraries:{...p.libraries,questCatalog:{
  [quest.questKey]:invalid,
 }}}),/Quest travel/);
});
