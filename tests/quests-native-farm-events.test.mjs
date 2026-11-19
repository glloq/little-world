import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityRuntime} from '../src/gameplay/activity-runtime.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {createClimate,defaultEnvironment} from '../src/environment/climate.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';

test('Q2 farm event is emitted only after a successful real harvest credit',()=>{
 const polygon=[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}];
 const climate=createClimate(defaultEnvironment(1284)),day=climate.definition.dayLengthSeconds;
 let time=10,allowGrant=false;
 const events=[],inventory={};
 const plots=[{id:'plot:1',name:'Champ',polygon,
   farm:{...defaultFarmSettings(polygon),assignment:'player'}}];
 const system=createActivityRuntime({mines:[],farms:plots},{
   grant:changes=>{
    if(!allowGrant)return false;
    for(const r of changes)inventory[r.itemId]=(inventory[r.itemId]??0)+r.quantity;
    return true;
   },onReward:(kind,item)=>events.push({kind,...item}),
   time:()=>time,climate,collision:new WorldCollisionQuery(()=>0,()=>null),
   ground:()=>0,water:()=>null,
 });
 assert.equal(system.farmAct('plot:1').ok,true,'plant on real plot');
 assert.deepEqual(events,[],'planting never pretends to harvest');
 time+=30;
 assert.equal(system.farmAct('plot:1').ok,true,'watering');
 for(let d=0;d<8&&system.farmView('plot:1').stage!=='mature';d++){
  time+=day;
  if(system.farmView('plot:1').stage!=='mature')system.farmAct('plot:1');
 }
 const view=system.farmView('plot:1');
 assert.equal(view.stage,'mature','crop is ready to harvest after real climate growth');
 assert.equal(system.farmAct('plot:1').ok,false,'inventory rejection leaves crop mature');
 assert.deepEqual(events,[]);
 allowGrant=true;
 const result=system.farmAct('plot:1');
 assert.equal(result.ok,true);
 assert.equal(events.length,1);
 assert.equal(events[0].kind,'farm');
 assert.ok(events[0].quantity>=1);
 assert.equal(inventory[events[0].itemId],events[0].quantity);
 assert.notEqual(system.farmView('plot:1').stage,'mature','same plot cannot mint same harvest again');
 assert.equal(events.length,1);
});
