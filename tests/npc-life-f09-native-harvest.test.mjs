import test from 'node:test';
import assert from 'node:assert/strict';
import {createActivityRuntime} from '../src/gameplay/activity-runtime.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {createClimate,defaultEnvironment} from '../src/environment/climate.ts';
import {defaultFarmSettings} from '../src/farm/farm-data.ts';
import {createNpcHarvestAccount} from '../src/npc-life/harvest-ledger.ts';
import {createNpcHarvestDriver} from '../src/npc-life/harvest-runtime.ts';
import {createFishPopulation} from '../src/npc-life/fish-population.ts';
const polygon=[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}];
const plot={id:'plot:1',name:'Champ PNJ',polygon,
 farm:{...defaultFarmSettings(polygon),assignment:'npc'}};
const climate=createClimate(defaultEnvironment(1284));
const limits={'farm:wheat':99,'farm:carrot':99,'farm:pumpkin':99,
 'wood:log':99,'fish:trout':99};
const farmer={definition:{id:'npc:farmer',routine:{role:'farmer',
 work:{x:5,z:5},workAnchorId:'plot:1'}},phase:'work',x:5,y:0,z:5};
test('F09-B farmer uses exact native climate/plot source and retains mature crop on stock refusal',()=>{
 let time=10;
 const activity=createActivityRuntime({mines:[],farms:[plot]},{
  grant:()=>{throw Error('NPC farm must not credit player bag');},time:()=>time,
  climate,collision:new WorldCollisionQuery(()=>0,()=>null),
  ground:()=>0,water:()=>null,
 });
 const ledger=createNpcHarvestAccount('npc:farmer','plot:1','farmer',limits);
 assert.equal(activity.farmAct('plot:1').ok,false,'player may not harvest NPC plot');
 let sequence=1;
 const action=()=>activity.npcFarmAct('plot:1','farm:act:'+sequence++,
  reward=>ledger.commitHarvest('harvest:receipt:'+sequence,
    reward.itemId,reward.quantity,Math.floor(time/climate.definition.dayLengthSeconds*1440)));
 assert.deepEqual(action().action,'plant');
 for(let day=0;day<9&&activity.farmView('plot:1').stage!=='mature';day++){
  time+=climate.definition.dayLengthSeconds;
  if(activity.farmView('plot:1').stage!=='mature')action();
 }
 assert.equal(activity.farmView('plot:1').stage,'mature');
 const denied=activity.npcFarmAct('plot:1','harvest:full',()=>false);
 assert.equal(denied.ok,false);
 assert.equal(activity.farmView('plot:1').stage,'mature');
 const harvested=action();
 assert.equal(harvested.ok,true);
 assert.ok(harvested.reward.quantity>=1);
 assert.equal(ledger.inventory()[harvested.reward.itemId],harvested.reward.quantity);
 assert.notEqual(activity.farmView('plot:1').stage,'mature');
 assert.equal(activity.npcFarmAct('plot:1','harvest:full',()=>true).ok,true,
  'failed request never falsely consumes source request ID');
});
test('F09 B/D driver refuses absent workplace, invented shore and wrong plot assignment',()=>{
 const activity=createActivityRuntime({mines:[],farms:[plot]},{
  grant:()=>false,time:()=>0,climate,
  collision:new WorldCollisionQuery(()=>0,()=>null),ground:()=>0,water:()=>null,
 });
 const opts={limits,activities:activity,zones:{mines:[],farms:[plot]},
  gathering:null,shore:()=>null,height:()=>0,
  anchor:id=>id==='plot:1'?{x:5,z:5}:null,fishPopulation:createFishPopulation()};
 const driver=createNpcHarvestDriver(opts);
 driver.install([farmer]);
 assert.equal(driver.size,1);
 assert.equal(driver.tick(5),0,'planting is not a resource reward');
 assert.equal(driver.account('npc:farmer').inventory()['farm:wheat'],undefined);
 const missing=createNpcHarvestDriver({...opts,anchor:()=>null});
 missing.install([farmer]);assert.equal(missing.size,0);
 const playerPlot=createNpcHarvestDriver({...opts,zones:{mines:[],farms:[{
  ...plot,farm:{...plot.farm,assignment:'player'}}]}});
 playerPlot.install([farmer]);assert.equal(playerPlot.size,0);
 const fisher={...farmer,definition:{id:'npc:fisher',routine:{
  role:'fisher',work:{x:5,z:5},workAnchorId:'plot:1'}}};
 driver.install([fisher]);
 assert.equal(driver.size,0,'no fish appears without an actual nearby wet habitat');
});
