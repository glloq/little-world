import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,chunkAt,parseComponents,parseProject} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {toRuntimeWorld} from '../src/studio-core/migration.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {lightFromPreset,runtimeLights,worldOffset,nightFactor,modeFactor,flickerAt,LIGHT_PRESET_IDS} from '../src/lighting/light-data.ts';
import {LightBudget} from '../src/lighting/light-budget.ts';
import {benchLights} from '../src/lighting/light-bench.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';

const T=(x,z,y=0,rotation={x:0,y:0,z:0,w:1})=>({type:'Transform',position:{x,y,z},rotation,scale:{x:1,y:1,z:1}});
const flat=()=>0;
test('Light component: presets are valid, invalid values are rejected',()=>{
  for(const preset of LIGHT_PRESET_IDS)parseComponents({Light:lightFromPreset(preset)});
  const ok=lightFromPreset('warm-lantern');
  assert.throws(()=>parseComponents({Light:{...ok,color:'orange'}}),/Couleur/);
  assert.throws(()=>parseComponents({Light:{...ok,kind:'spot'}}),/ponctuelles/);
  assert.throws(()=>parseComponents({Light:{...ok,mode:'state'}}),/État/);
  assert.throws(()=>parseComponents({Light:{...ok,range:500}}),/Portée/);
  assert.throws(()=>parseComponents({Light:{...ok,castShadow:true}}));
  parseComponents({Light:{...ok,mode:'state',stateKey:'allumee'}});
});
test('runtime projection: disabled lights dropped, local offset follows rotation, carriers flagged',()=>{
  const quarter={x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2};const o=worldOffset(T(0,0,0,quarter),{x:1,y:2,z:0});
  assert.ok(Math.abs(o.x)<1e-9&&Math.abs(o.y-2)<1e-9&&Math.abs(o.z+1)<1e-9,'90° about Y turns +X into -Z');
  const lights=runtimeLights([{id:'b',components:{Transform:T(10,5),Light:lightFromPreset('fixed-lamp')}},{id:'a',components:{Transform:T(0,0),Light:{...lightFromPreset('cold-light'),enabled:false}}},{id:'npc',components:{Transform:T(3,3),Light:lightFromPreset('warm-lantern'),Character:{}}}]);
  assert.deepEqual(lights.map(l=>l.id),['light:b','light:npc']);assert.equal(lights[1].follow,true);assert.equal(lights[0].y,2.4);
});
test('day/night and flicker curves are deterministic and bounded',()=>{
  assert.equal(nightFactor(1),0);assert.equal(nightFactor(-1),1);assert.ok(nightFactor(0)>.4&&nightFactor(0)<.6,'gradual at dusk');
  assert.equal(modeFactor('night',0),0);assert.equal(modeFactor('always',0),1);assert.equal(modeFactor('state',1,false),0);assert.equal(modeFactor('state',0,true),1);
  for(let t=0;t<20;t+=.37){const f=flickerAt(42,t,.35,1.6);assert.ok(f>=.65-1e-9&&f<=1);assert.equal(f,flickerAt(42,t,.35,1.6));}
  let jump=0;for(let t=0;t<10;t+=1/30)jump=Math.max(jump,Math.abs(flickerAt(9,t+1/30,.35,1.6)-flickerAt(9,t,.35,1.6)));assert.ok(jump<.06,'interpolated: no frame-to-frame jump '+jump);
});
test('budget: 500 sources never exceed the configured dynamic lights; slots stable; hysteresis',()=>{
  for(const layout of ['cluster','spread'])for(const count of [0,20,100,500]){
    const budget=new LightBudget({capacity:4});budget.setSources(benchLights(count,layout,0,0),flat);
    for(let f=0;f<300;f++){const x=Math.sin(f/40)*90,z=f*.8-120;budget.update(x,8,z,1,f/30);let active=0;for(let s=0;s<4;s++)if(budget.slots[s]>=0)active++;assert.ok(active<=4);assert.ok(budget.glowCount<=budget.glowCapacity);}
    if(count)assert.ok(budget.stats.reselections<300,'not every frame ('+budget.stats.reselections+')');
  }
  const budget=new LightBudget({capacity:4});budget.setSources(benchLights(500,'cluster',0,0),flat);
  budget.update(0,6,0,1,0);const version=budget.slotVersion,slots=[...budget.slots];
  for(let f=1;f<120;f++)budget.update(0,6,0,1,f/30);assert.deepEqual([...budget.slots],slots,'static camera: same lights in the same slots');
  assert.ok(budget.slotVersion===version,'no reassignment while static');
  budget.setBudget(2);budget.update(0,6,0,1,5);assert.ok([...budget.slots].filter(i=>i>=0).length<=2,'economy budget respected');
  // Hysteresis: two equal lamps, the camera oscillates around the midpoint.
  const pair=[{id:'light:a',entityId:'a',x:-6,y:2,z:0,offset:{x:0,y:2,z:0},color:'#ffffff',intensity:10,range:10,mode:'always',follow:false},{id:'light:b',entityId:'b',x:6,y:2,z:0,offset:{x:0,y:2,z:0},color:'#ffffff',intensity:10,range:10,mode:'always',follow:false}];
  const one=new LightBudget({capacity:1});one.setSources(pair,flat);let swaps=0,last=-2;
  for(let f=0;f<200;f++){one.update(Math.sin(f/5)*.4,2,0,1,f/30);if(one.slots[0]!==last){swaps++;last=one.slots[0];}}
  assert.equal(swaps,1,'no ping-pong between equivalent lights');
  const kept=one.slots[0];one.update(kept===0?5:-5,2,0,1,10);assert.notEqual(one.slots[0],kept,'a clearly closer light takes over');
  // Day: night lanterns off (no dynamic light, no halo); « always » lights stay.
  const day=new LightBudget({capacity:4});day.setSources(benchLights(100,'cluster',0,0).filter(l=>l.mode==='night'),flat);day.update(0,6,0,0,0);
  assert.equal([...day.slots].filter(i=>i>=0).length,0);assert.equal(day.glowCount,0);
  assert.equal(day.statusOf(day.sources[0].id),'off');
});
test('Studio preview and compiled runtime see the same lights (Jouer ici = runtime), archives keep them',async()=>{
  const p=createProject({name:'Lanternes',width:1000,length:1000});
  putEntity(p,{id:'lamp',name:'Lanterne',kind:'effect',ownerChunkId:chunkAt(p.world,4,6),components:{Transform:T(4,6),Light:lightFromPreset('warm-lantern')}});
  putEntity(p,{id:'fire',name:'Feu',kind:'prop',ownerChunkId:chunkAt(p.world,-20,6),components:{Transform:T(-20,6),Visual:{type:'Visual',assetId:'props.crate'},Light:{...lightFromPreset('flickering-fire'),mode:'state',stateKey:'allume'}}});
  const studio=toRuntimeWorld(p).lights;assert.equal(studio.length,2);
  const compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})}),files=compiled.files;
  const bundle=await openCompiledWorld('http://localhost/w/manifest.json',async url=>{const path=new URL(url).pathname.replace(/^\/w\//,'');return path in files?new Response(files[path]):new Response('',{status:404});});
  assert.deepEqual(playableFromCompiled(bundle).world.lights,studio);
  const back=parseProject(readProjectArchive(writeProjectArchive(p)));assert.deepEqual(toRuntimeWorld(back).lights,studio,'ZIP round trip');
});
test('renderer pool: fixed number of PointLights whatever the sources, budget or day/night',async()=>{
  const THREE=await import('three'),{createLightView}=await import('../src/lighting/light-view.ts');
  const root=new THREE.Group(),view=createLightView(root,()=>0,{capacity:4}),count=()=>{let n=0;root.traverse(o=>{if(o.isPointLight)n++;});return n;};
  assert.equal(count(),0,'no source: no light in shaders');
  view.setSources(benchLights(500,'cluster',0,0));view.setEnvironment(1,0);assert.equal(count(),4);
  for(let f=0;f<200;f++){view.update({x:Math.sin(f/9)*80,y:6,z:f-100});assert.equal(count(),4);assert.ok(view.stats.active<=4);}
  view.setBudget(2);view.update({x:0,y:6,z:0});assert.equal(count(),4,'overload: fewer lights fed, same shader count');let lit=0;root.traverse(o=>{if(o.isPointLight&&o.intensity>0)lit++;});assert.ok(lit<=2);
  view.setBudget(2,2);assert.equal(count(),2,'economy setting: smaller pool (one recompilation, user choice)');
  view.setEnvironment(0,1);view.setSources(benchLights(100,'cluster',0,0).filter(l=>l.mode==='night'));view.update({x:0,y:6,z:0});lit=0;root.traverse(o=>{if(o.isPointLight&&o.intensity>0)lit++;});assert.equal(lit,0,'day: night lanterns off');
  assert.ok(root.children[0].children.every(o=>!o.castShadow),'no shadow map for local lights');
  view.dispose();assert.equal(root.children.length,0,'released with the world');
});
