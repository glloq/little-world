import test from 'node:test';
import assert from 'node:assert/strict';
import {createClimate,defaultEnvironment} from '../src/environment/climate.ts';
import {CROPS,defaultFarmSettings,validateFarmSettings} from '../src/farm/farm-data.ts';
import {newPlotState,evaluate,act,publicView,parsePlotState,sliceSeconds} from '../src/farm/farm-sim.ts';

const polygon=[{x:0,z:0},{x:10,z:0},{x:10,z:8},{x:0,z:8}];
const settings=validateFarmSettings(defaultFarmSettings(polygon)),climate=createClimate(defaultEnvironment(1284)),DAY=climate.definition.dayLengthSeconds;
const yes=()=>true;
test('farm settings: known crops, allowed initial crop, soil and irrigation validated',()=>{
  assert.throws(()=>validateFarmSettings({...settings,crops:['rice']}),/inconnues/);
  assert.throws(()=>validateFarmSettings({...settings,crops:['wheat'],initialCrop:'carrot'}),/non autorisée/);
  assert.throws(()=>validateFarmSettings({...settings,soil:{fertility:2,drainage:0}}),/sol/);
  assert.equal(newPlotState('p',{...settings,initialCrop:'carrot'}).crop.cropId,'carrot');
});
test('B1 loop: plant, water, time passes, mature, harvest once, inventory full keeps the crop',()=>{
  const s=newPlotState('plot-1',settings);let t=10;
  assert.equal(act(s,settings,climate,{requestId:'w0',type:'water',time:t,waterAvailable:false},yes).reason,'Aucune eau d’irrigation à portée');
  assert.equal(act(s,settings,climate,{requestId:'p1',type:'plant',cropId:'wheat',time:t},yes).ok,true);
  assert.equal(act(s,settings,climate,{requestId:'w1',type:'water',time:t+30,waterAvailable:true},yes).ok,true);
  for(let d=0;d<8&&publicView(evaluate(s,settings,climate,t+d*DAY)).stage!=='mature';d++)act(s,settings,climate,{requestId:'water-'+d,type:'water',time:t+d*DAY+40,waterAvailable:true},yes);
  t+=8*DAY;const view=publicView(evaluate(s,settings,climate,t));assert.equal(view.stage,'mature','after 8 watered game days: '+JSON.stringify(view));
  assert.equal(act(s,settings,climate,{requestId:'h-full',type:'harvest',time:t},()=>false).reason,'Inventaire plein');assert.equal(s.crop.stage,'mature','refused reward keeps the crop');
  const inv={};const grant=r=>{inv[r.itemId]=(inv[r.itemId]??0)+r.quantity;return true;};
  const h=act(s,settings,climate,{requestId:'h1',type:'harvest',time:t},grant);assert.equal(h.ok,true);assert.ok(inv['farm:wheat']>=3,JSON.stringify(inv));
  const again=act(s,settings,climate,{requestId:'h1',type:'harvest',time:t},grant);assert.equal(again.reason,'Demande déjà traitée');
  assert.equal(act(s,settings,climate,{requestId:'h2',type:'harvest',time:t},grant).reason,'Rien à récolter');assert.equal(inv['farm:wheat'],h.reward.quantity,'granted exactly once');
});
test('deferred = continuous: same actions and climate give bit-identical states, even across a save',()=>{
  const actions=[{requestId:'a',type:'plant',cropId:'pumpkin',time:100},{requestId:'b',type:'water',time:900,waterAvailable:true},{requestId:'c',type:'water',time:2.5*DAY,waterAvailable:true},{requestId:'d',type:'water',time:5*DAY+7,waterAvailable:true}];
  const end=10*DAY+333,continuous=newPlotState('p',settings);let next=0;
  for(let t=0;t<=end;t+=7){while(next<actions.length&&actions[next].time<=t){act(continuous,settings,climate,{...actions[next],time:actions[next].time},yes);next++;}evaluate(continuous,settings,climate,t);}
  evaluate(continuous,settings,climate,end);
  let deferred=newPlotState('p',settings);act(deferred,settings,climate,actions[0],yes);act(deferred,settings,climate,actions[1],yes);
  deferred=parsePlotState(JSON.parse(JSON.stringify(deferred)));act(deferred,settings,climate,actions[2],yes);act(deferred,settings,climate,actions[3],yes);evaluate(deferred,settings,climate,end);
  assert.deepEqual(deferred,continuous);assert.equal(deferred.evaluatedAt%sliceSeconds(climate),0);
});
test('climate of the interval: rain wets the soil, a dry spell withers an unwatered crop',()=>{
  // A window of 6 slices (150 s) inside one weather period (180 s) of the given kind.
  const P=sliceSeconds(climate),W=climate.definition.weatherPeriodSeconds,find=kind=>{for(let m=0;m<64;m++)if(climate.state(m*W+1).weather===kind)return Math.ceil(m*W/P)*P;throw Error('no '+kind);};
  const wet=newPlotState('w',settings),dry=newPlotState('d',settings),r=find('rain'),c=find('clear');
  wet.evaluatedAt=r;dry.evaluatedAt=c;evaluate(wet,settings,climate,r+6*P);evaluate(dry,settings,climate,c+6*P);
  assert.ok(wet.moisture>.5&&dry.moisture<.5,`rain ${wet.moisture} / clear ${dry.moisture}`);
  const s=newPlotState('x',settings);act(s,settings,climate,{requestId:'p',type:'plant',cropId:'carrot',time:0},yes);s.moisture=0;
  evaluate(s,settings,climate,30*DAY);const v=publicView(s);assert.ok(v.stage==='failed'||v.stage==='mature',v.stage);
  const never=newPlotState('n',{...settings,soil:{fertility:.5,drainage:1}});act(never,settings,climate,{requestId:'p',type:'plant',cropId:'pumpkin',time:0},yes);never.moisture=0;
  const watered=structuredClone(never);for(let d=0;d<6;d++)act(watered,settings,climate,{requestId:'w'+d,type:'water',time:d*DAY+1,waterAvailable:true},yes);
  evaluate(never,settings,climate,6*DAY);evaluate(watered,settings,climate,6*DAY);assert.ok(watered.crop.progress>never.crop.progress,'watering speeds growth');
});
test('cost: ten game years of absence evaluated in bounded time',()=>{
  const s=newPlotState('long',settings);act(s,settings,climate,{requestId:'p',type:'plant',cropId:'wheat',time:0},yes);
  const t0=performance.now();evaluate(s,settings,climate,3650*DAY);const ms=performance.now()-t0;assert.ok(ms<1500,ms+' ms');
  assert.throws(()=>evaluate(newPlotState('x',settings),settings,climate,5000*DAY*2),/trop longue/);
  void CROPS;
});
