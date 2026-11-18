import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {withFishingSounds} from '../src/gameplay/fishing-audio.ts';
import {parseAudioDefinitionV2,eventAvailability} from '../src/audio/catalog.ts';
import {createFishingEffects} from '../src/render/fishing-effects.ts';

const emptyCatalog=()=>({
  schemaVersion:2,meta:{catalogVersion:'fishing-test'},patchIds:['pluck'],
  assets:{},scores:{},events:{},music:{cues:{}},ambience:{},emitters:[],
});
test('runtime fishing audio uses valid original synth assets and shared engine events',()=>{
  const base=emptyCatalog();
  const result=parseAudioDefinitionV2(withFishingSounds(base));
  assert.deepEqual(Object.keys(result.events).sort(),['fishing.catch','fishing.escape','fishing.strain']);
  for(const name of Object.keys(result.events)){
    assert.equal(eventAvailability(result,name).playable,true,name);
    assert.equal(result.events[name].maxInstances,1);
    assert.equal(result.events[name].loop,false);
    assert.ok(result.events[name].cooldownMs>=300,'anti-spam event cooldown');
  }
  assert.deepEqual(base.assets,{},'authored input not modified');
  assert.deepEqual(base.events,{},'original event table not modified');
  const second=withFishingSounds(result);
  assert.equal(Object.keys(second.events).length,3,'extension idempotent');
});
test('author-provided fishing sounds keep priority over runtime defaults',()=>{
  const generated=withFishingSounds(emptyCatalog());
  const custom={...generated.events['fishing.catch'],gain:.11,description:'Custom victory take'};
  const result=withFishingSounds({...generated,events:{...generated.events,'fishing.catch':custom}});
  assert.equal(result.events['fishing.catch'],custom);
  assert.equal(result.events['fishing.catch'].gain,.11);
});
test('ripples and reeling line reuse a bounded pool, dispose cleanly, and stop when idle',()=>{
  const scene=new THREE.Group(),hamster=new THREE.Group();
  const originalGeometry=new THREE.BufferGeometry();
  originalGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,1,0,3,0,0],3));
  const original=new THREE.Line(originalGeometry,new THREE.LineBasicMaterial());original.name='FishingLine';hamster.add(original);
  const bobber=new THREE.Mesh(new THREE.IcosahedronGeometry(.07,0),new THREE.MeshBasicMaterial());
  bobber.name='FishingFloat';bobber.position.set(3,0,0);hamster.add(bobber);
  const effects=createFishingEffects(scene,hamster);
  try{
    assert.equal(scene.children.length,3,'only three rings allocated');
    assert.equal(hamster.children.length,4,'one extra line and one reusable catch model');
    effects.burst({x:3,y:0,z:0},'bite');
    const initial={phase:'reeling',castAt:{x:3,z:0},water:'lake',fish:'fish:perch',tension:.52,progress:.4};
    effects.update(initial,.25,1/30);
    assert.equal(original.visible,false,'old line temporarily hidden during reeling');
    assert.equal(hamster.getObjectByName('FishingReelLine').visible,true);
    assert.equal(scene.children.filter(o=>o.visible).length,2,'two ripples for bite');
    assert.ok(bobber.position.x<3,'float approaches shore slightly');
    // No mesh allocation while animating the fishing line.
    const line=hamster.getObjectByName('FishingReelLine');
    for(let i=0;i<100;i++){
      original.visible=true; // original character renderer restores the two-point line each frame
      effects.update(initial,.25+(i+1)/30,1/30);
    }
    assert.equal(hamster.getObjectByName('FishingReelLine'),line);
    assert.equal(scene.children.filter(o=>o.visible).length,0,'ripples fade without frame allocations');
    effects.displayCatch('fish:golden');
    const preview=hamster.getObjectByName('FishingCatchDisplay');
    assert.equal(preview.visible,true,'fish preview shown only after landing');
    assert.equal(preview.children.length,3,'small reusable model (body, tail, eye)');
    effects.update(null,8,1/30);
    assert.equal(preview.visible,true);
    effects.reset();assert.equal(line.visible,false);assert.equal(preview.visible,false);
    effects.update(null,9,1/30);assert.equal(line.visible,false);
  }finally{
    effects.dispose();originalGeometry.dispose();original.material.dispose();
    bobber.geometry.dispose();bobber.material.dispose();
  }
  assert.equal(scene.children.length,0,'pooled ring geometry removed');
  assert.equal(hamster.getObjectByName('FishingReelLine'),undefined,'line overlay removed');
  assert.equal(hamster.getObjectByName('FishingCatchDisplay'),undefined,'catch preview removed');
});
