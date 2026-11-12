import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_APPEARANCE, normalizeAppearance, toggleAccessory, setEmotion, EMOTIONS,
} from '../src/character-style.ts';
import { buildSquirrel } from '../src/squirrel.ts';
import { spawnPlayer } from '../src/player.ts';

test('appearance is normalized against invalid browser data',()=>{
  assert.deepEqual(normalizeAppearance(null),DEFAULT_APPEARANCE);
  assert.deepEqual(normalizeAppearance({hat:true,backpack:'yes',neckwear:'unknown',emotion:'incorrect'}),{
    hat:true,backpack:false,neckwear:'none',emotion:'happy'
  });
  assert.deepEqual(normalizeAppearance({hat:true,backpack:true,neckwear:'scarf',emotion:'surprised'}),{
    hat:true,backpack:true,neckwear:'scarf',emotion:'surprised'
  });
});
test('accessory slots are independently toggleable, necklaces mutually exclusive',()=>{
  const original=normalizeAppearance(null);
  let next=toggleAccessory(original,'hat');
  next=toggleAccessory(next,'backpack');
  next=toggleAccessory(next,'pendant');
  assert.deepEqual({hat:next.hat,backpack:next.backpack,neckwear:next.neckwear},{
    hat:true,backpack:true,neckwear:'pendant'
  });
  next=toggleAccessory(next,'scarf');
  assert.equal(next.neckwear,'scarf');
  next=toggleAccessory(next,'scarf');
  assert.equal(next.neckwear,'none');
  assert.equal(original.hat,false,'appearance changes must be immutable');
});
test('every face emotion can be applied',()=>{
  let next=normalizeAppearance(null);
  for(const emotion of EMOTIONS){
    next=setEmotion(next,emotion);
    assert.equal(next.emotion,emotion);
  }
});
test('chibi model exposes facial emotion groups, accessories and a folded glider',()=>{
  const model=buildSquirrel();
  const named=(name)=>model.group.getObjectByName(name);
  for(const name of [
    'HeadJoint','TailJoint','ExplorerHat','ExplorerBackpack',
    'AcornPendant','CozyScarf','DeployableGlider',
    ...EMOTIONS.map(e=>'FaceEmotion_'+e)
  ]) assert.ok(named(name),'missing named model part '+name);
  const glider=named('DeployableGlider');
  assert.equal(glider.visible,false,'membrane hidden in everyday pose');
  model.setAppearance({hat:true,backpack:true,neckwear:'scarf',emotion:'joyful'});
  assert.equal(named('ExplorerHat').visible,true);
  assert.equal(named('ExplorerBackpack').visible,true);
  assert.equal(named('CozyScarf').visible,true);
  assert.equal(named('AcornPendant').visible,false);
  assert.equal(named('FaceEmotion_joyful').visible,true);
  assert.equal(named('FaceEmotion_happy').visible,false);
  const player=spawnPlayer();
  model.update(player,1/60,.25);
  assert.equal(glider.visible,false);
  player.mode='glide';
  model.update(player,1/60,.4);
  assert.equal(glider.visible,true);
  player.mode='ground';
  model.update(player,1/60,.6);
  assert.equal(glider.visible,false);
});
