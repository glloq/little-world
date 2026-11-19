import test from 'node:test';
import assert from 'node:assert/strict';
import {archipelagoPreset} from '../src/geography/archipelago-params.ts';
import {archipelagoField} from '../src/geography/archipelago.ts';
import {createGeoContext} from '../src/geography/engine.ts';
import {ITEM_STRIDE,generateDressingCell} from '../src/geography/dressing.ts';
import {createGathering} from '../src/gameplay/gathering.ts';
import {createNpcHarvestAccount} from '../src/npc-life/harvest-ledger.ts';

test('F09-C NPC and player share real tree depletion and regrowth state',()=>{
 const width=3000,length=8000,seed=4242,field=archipelagoField(
  {width,length,seaLevel:0,seed},archipelagoPreset(width,length));
 const ctx=createGeoContext(null,{seaLevel:0,height:field.height,site:field.site,
  water:(x,z,h)=>h<0?0:null,pathDistance:()=>Infinity,waterDistance:()=>Infinity});
 const inside=(x,z)=>Math.abs(x)<=width/2&&Math.abs(z)<=length/2;
 let tree=null;
 for(let z=-45;z<50&&!tree;z+=7)for(let x=-10;x<11&&!tree;x+=5){
  const cell=generateDressingCell(ctx,seed,x,z,inside);
  for(const kind of ['pine','oak','deadwood']){
   const items=cell.items[kind];
   for(let i=0;i<items.length;i+=ITEM_STRIDE){
    if(items[i+6]<0)continue;
    tree={x:items[i],y:items[i+1],z:items[i+2]};
    break;
   }
   if(tree)break;
  }
 }
 assert.ok(tree,'fixture must contain physical forestry resources');
 let time=0,playerCredits=0;
 const gather=createGathering({ctx:()=>ctx,seed,inside,time:()=>time,
  grant:changes=>{playerCredits+=changes[0].quantity;return true;},
  has:item=>item==='tool:axe'});
 const ledger=createNpcHarvestAccount('npc:logger','forest:site','woodcutter',{'wood:log':99});
 const p={x:tree.x,y:tree.y,z:tree.z},forward={x:0,z:1};
 let hit=null;
 for(let i=0;i<10;i++){
  hit=gather.npcAct(p,forward,changes=>ledger.commitHarvest('tree:1',
   changes[0].itemId,changes[0].quantity,0),item=>item==='tool:axe');
  if(hit.done)break;
 }
 assert.ok(hit?.done,'worker should eventually complete multi-strike native cut');
 assert.equal(playerCredits,0,'NPC harvest must never alter player inventory');
 assert.ok((ledger.inventory()['wood:log']??0)>0);
 const player=gather.act(p,forward);
 assert.equal(player.done,true===false,'felled tree cannot be instantly recut');
 assert.equal(playerCredits,0);
 time=4000;
 const grown=gather.target(p,forward);
 assert.ok(grown,'native source has regrown on the shared clock');
});
