import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import catalog from '../assets/character-catalog.json' with {type:'json'};
import {createSquirrelAnimationClips} from '../src/character-clips.ts';
import {buildSquirrel} from '../src/squirrel.ts';
import {AnimationMixer} from 'three';

test('squirrel GLB contains real named joint hierarchy, local geometry and advertised animation clips',async()=>{
  const asset=catalog.characters[0];
  const bytes=await readFile(new URL('../public/'+asset.file,import.meta.url));
  assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const nodes=new Map(gltf.nodes.map((node,i)=>[node.name,{...node,index:i}]));
  for(const name of ['SquirrelBody','HeadJoint','TailJoint','TailTipJoint','EarLeft','EarRight',...asset.accessorySockets]){
    assert.ok(nodes.has(name),'missing joint '+name);
  }
  assert.ok(nodes.get('TailJoint').children.includes(nodes.get('TailTipJoint').index));
  assert.ok(nodes.get('HeadJoint').children.includes(nodes.get('EarLeft').index));
  assert.deepEqual(gltf.animations.map(clip=>clip.name),asset.animations);
  for(const clip of gltf.animations){
    assert.equal(clip.channels.length,12);
    for(const channel of clip.channels)assert.ok(gltf.nodes[channel.target.node]);
  }
  for(const buffer of gltf.buffers)assert.equal(buffer.uri,undefined,'all buffers are embedded');
  assert.equal(gltf.textures,undefined,'no external texture dependency');
});
test('exportable clips bind to the runtime rig and an AnimationMixer changes joints',()=>{
  const model=buildSquirrel(),mixer=new AnimationMixer(model.group);
  const clips=createSquirrelAnimationClips();
  assert.equal(clips.length,13);
  for(const clip of clips)assert.ok(clip.validate(),clip.name);
  const arm=model.group.getObjectByName('ArmLeft');
  const before=arm.quaternion.clone();
  mixer.clipAction(clips.find(c=>c.name==='swim')).play();mixer.update(.3);
  assert.ok(arm.quaternion.angleTo(before)>.05,'swim clip actually moves arm');
  mixer.stopAllAction();mixer.uncacheRoot(model.group);
});
