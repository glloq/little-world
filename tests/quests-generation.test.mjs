import test from 'node:test';
import assert from 'node:assert/strict';
import {generateResidentSocialQuestOffers} from '../src/quests/generator.ts';
import {parseQuestCatalogEntry} from '../src/quests/validation.ts';
const npc=(id,x)=>({id,name:id,kind:'hamster',x,z:0,routine:{
 type:'Resident',version:1,role:'merchant',
 home:{x,z:0},work:{x,z:20},homeAnchorId:id+':home',workAnchorId:id+':job',
}});
const npcs=[npc('village-worker-0',0),npc('village-worker-1',20),npc('village-worker-2',40),
 npc('other-worker-0',400),npc('other-worker-1',420)];
const gameplay={
 entities:npcs.map(n=>({id:n.id,dialogueIds:[n.id+':dialogue']})),
 dialogues:npcs.map(n=>({id:n.id+':dialogue',actorId:n.id,start:'hello',
  lines:[{id:'hello',text:'Bonjour',choices:[{id:'bye',text:'Au revoir'}]}]})),
 objectives:[],items:[{id:'coin',name:'Coin',category:'currency',maxQuantity:9999}],
};
const route=(from,to)=>({length:Math.abs(to.x-from.x)});
test('Q7 deterministic social offers require reachable real NPC dialogues',()=>{
 const first=generateResidentSocialQuestOffers(npcs,gameplay,'island:1',route);
 const second=generateResidentSocialQuestOffers([...npcs].reverse(),
  {...gameplay,dialogues:[...gameplay.dialogues].reverse()},'island:1',route);
 assert.deepEqual(second,first,'no dependence on authoring array order');
 assert.ok(first.length>=2&&first.length<=4);
 assert.ok(first.every(o=>o.steps.length===1&&o.steps[0].kind==='talk'));
 for(const offer of first)assert.deepEqual(parseQuestCatalogEntry(offer),offer);
 const noDialogues=generateResidentSocialQuestOffers(npcs,{...gameplay,dialogues:[]},'island:1',route);
 assert.deepEqual(noDialogues,[]);
 assert.deepEqual(generateResidentSocialQuestOffers(npcs,gameplay,'island:1',()=>null),[]);
 assert.deepEqual(generateResidentSocialQuestOffers(npcs,gameplay,'island:1',()=>({length:500})),[]);
});
test('Q7 respects legacy social objectives and never fabricates rewards',()=>{
 const legacy={...gameplay,objectives:[{id:'village-meet-neighbor'}],items:[]};
 const result=generateResidentSocialQuestOffers(npcs,legacy,'island:1',route);
 assert.ok(result.length);
 assert.ok(result.filter(x=>x.giverId.startsWith('village')).every(x=>
  x.steps[0].npcId==='village-worker-2'));
 assert.ok(result.every(x=>x.rewards.length===0),'coins absent: no reward minted');
 assert.deepEqual(generateResidentSocialQuestOffers(npcs,legacy,'island:1',route,0),[]);
});
