import test from 'node:test';
import assert from 'node:assert/strict';
import {createNpcEconomyDriver} from '../src/npc-life/economy-runtime.ts';
const resident={definition:{id:'npc:miller',routine:{type:'Resident',version:1,
  role:'miller',home:{x:0,z:0},work:{x:8,z:2},
  homeAnchorId:'house:1',workAnchorId:'mill:1'}},
  x:8,y:0,z:2,phase:'work'};
const limits={'farm:wheat':99,'material:flour':99,coin:9999};
const make=()=>createNpcEconomyDriver(limits,
  id=>id==='mill:1'?{x:8,z:2}:null);
test('F04 world-minute driver produces only from real worker stock, not a visual animation',()=>{
 const driver=make();
 driver.install([resident]);
 assert.equal(driver.size,1);
 driver.tick(10);
 assert.equal(driver.account('npc:miller').jobs().length,0,
  'animation without ingredients must not mint an economic result');
 assert.equal(driver.account('npc:miller').receive('farm:wheat',3),true);
 assert.equal(driver.account('npc:miller').receive('coin',1),true);
 assert.equal(driver.tick(11),1);
 assert.equal(driver.account('npc:miller').jobs()[0].status,'running');
 const persisted=driver.serialize(),second=make();
 second.restore(persisted);
 second.install([resident]);
 assert.equal(second.account('npc:miller').jobs().length,1);
 second.tick(16);
 assert.equal(second.account('npc:miller').inventory()['material:flour'],1);
 assert.equal(second.account('npc:miller').inventory()['farm:wheat'],0);
 assert.equal(second.account('npc:miller').jobs()[0].status,'collected');
 second.tick(16);
 assert.equal(second.account('npc:miller').inventory()['material:flour'],1);
});
test('F04 missing or moved work source never creates a fake NPC production account',()=>{
 const missing=createNpcEconomyDriver(limits,()=>null);
 missing.install([resident]);assert.equal(missing.size,0);
 const moved=createNpcEconomyDriver(limits,()=>({x:90,z:50}));
 moved.install([resident]);assert.equal(moved.size,0);
 const inactive={...resident,phase:'idle'};
 const idle=make();idle.install([inactive]);idle.account('npc:miller').receive('farm:wheat',3);
 idle.account('npc:miller').receive('coin',1);
 assert.equal(idle.tick(10),0,'worker must be at work, not on an imaginary shift');
});
