import test from 'node:test';
import assert from 'node:assert/strict';
import {CharacterAnimator} from '../src/character-animation.ts';
import {buildSquirrel} from '../src/squirrel.ts';
import {spawnPlayer} from '../src/player.ts';

const input=(mode='ground',speed=0,verticalSpeed=0)=>({mode,speed,verticalSpeed});
function advance(animator,value,seconds){
  for(let i=0;i<Math.ceil(seconds*60);i++)animator.update(value,1/60);
}
test('visual state follows jump, deployment, fold and landing without changing physics input',()=>{
  const animator=new CharacterAnimator();
  const jumping=input('air',4,7);
  animator.update(jumping,1/60);assert.equal(animator.state,'jump');
  assert.deepEqual(jumping,input('air',4,7));
  advance(animator,jumping,.2);assert.equal(animator.state,'rise');
  animator.update(input('air',4,-2),1/60);assert.equal(animator.state,'fall');
  animator.update(input('glide',10,-2),1/60);assert.equal(animator.state,'deploy');
  const opening=animator.pose.membrane;assert.ok(opening>0&&opening<1);
  advance(animator,input('glide',10,-2),.5);assert.equal(animator.state,'glide');
  assert.ok(animator.pose.membrane>.99);
  animator.update(input('air',10,-2),1/60);assert.equal(animator.state,'fold');
  assert.equal(animator.pose.membrane,0);
  animator.update(input('ground'),1/60);assert.equal(animator.state,'land');
  advance(animator,input('ground'),.3);assert.equal(animator.state,'idle');
});
test('walk/run and aquatic poses are distinct and transitions are interpolated',()=>{
  const animator=new CharacterAnimator();
  advance(animator,input('ground',4),.5);assert.equal(animator.state,'walk');
  const prior=animator.pose.armLZ;
  animator.update(input('glide',10,-2),1/60);
  assert.ok(animator.pose.armLZ>prior&&animator.pose.armLZ<.93,'joint interpolates instead of snapping');
  advance(animator,input('ground',8),.4);assert.equal(animator.state,'run');
  advance(animator,input('swim',3),.4);assert.equal(animator.state,'swim');
  assert.ok(animator.pose.bodyX>.4);
  advance(animator,input('dive',3,-1),.4);assert.equal(animator.state,'dive');
  assert.ok(animator.pose.bodyX>.7);
  advance(animator,input('dive',3,2),.4);assert.equal(animator.state,'ascend');
  assert.ok(animator.pose.bodyX<0);
});
test('rig exposes independent bones and sockets, preserving membrane and appearance',()=>{
  const model=buildSquirrel(),player=spawnPlayer();
  for(const name of ['SquirrelBody','HeadJoint','EarLeft','EarRight','ArmLeft','ArmRight',
    'LegLeft','LegRight','TailJoint','TailTipJoint','MembraneJoint','SocketHead','SocketBack','SocketNeck']){
    const node=model.group.getObjectByName(name);assert.ok(node?.isBone,name);
    assert.ok(model.skeleton.bones.includes(node));
  }
  assert.equal(model.group.getObjectByName('ExplorerHat').parent,model.sockets.head);
  assert.equal(model.group.getObjectByName('ExplorerBackpack').parent,model.sockets.back);
  assert.equal(model.group.getObjectByName('AcornPendant').parent,model.sockets.neck);
  const ear=model.group.getObjectByName('EarLeft');
  model.update(player,1/60,0);const prior=ear.rotation.z;
  for(let i=0;i<30;i++)model.update(player,1/60,i/60);
  assert.notEqual(ear.rotation.z,prior,'ear articulation is live');
  player.mode='glide';model.update(player,1/60,1);
  assert.equal(model.animationState,'deploy');
  assert.equal(model.group.getObjectByName('DeployableGlider').visible,true);
  player.mode='dive';model.update(player,1/60,1);
  assert.equal(model.group.getObjectByName('DeployableGlider').visible,false);
});
test('pose mixer reuses output and handles invalid or paused frame durations',()=>{
  const animator=new CharacterAnimator();
  const pose=animator.update(input(),1/60);
  const before={...pose};
  assert.equal(animator.update(input(),NaN),pose);
  assert.deepEqual(pose,before);
  animator.update(input('ground',NaN),-1);
  for(const value of Object.values(pose))assert.ok(Number.isFinite(value));
});
test('disposing one rig releases its own resources while preserving geometry used by other characters',()=>{
  const first=buildSquirrel(),second=buildSquirrel();
  const shared=first.group.getObjectByName('HeadJoint').children.find(node=>node.isMesh).geometry;
  const local=first.group.getObjectByName('DeployableGlider').geometry;
  let sharedDisposals=0,localDisposals=0;
  const sharedListener=()=>sharedDisposals++;
  shared.addEventListener('dispose',sharedListener);
  local.addEventListener('dispose',()=>localDisposals++);
  first.dispose();first.dispose();
  assert.equal(localDisposals,1,'owned resource disposed once');
  assert.equal(sharedDisposals,0,'shared geometry must survive');
  second.update(spawnPlayer(),1/60,0);
  assert.ok(second.group.getObjectByName('HeadJoint'));
  second.dispose();assert.equal(sharedDisposals,0);
  shared.removeEventListener('dispose',sharedListener);
});
