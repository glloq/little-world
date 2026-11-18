import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnPlayer,simulatePlayer} from '../src/player.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {createRaceTrackSampler} from '../src/gameplay/race-track.ts';

const track={
 width:8,material:'dirt',smooth:false,
 points:[{x:0,z:0},{x:0,z:130}],
 features:[{id:'feature:launch',kind:'ramp',at:70,length:9,height:2}]
};
const control={forward:1,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};

test('rolling over a physical ramp launches without a manual jump and preserves momentum',()=>{
 const sampler=createRaceTrackSampler(track,{height:()=>0});
 const collision=new WorldCollisionQuery(()=>0,()=>null);
 collision.setOutdoorCourseSurface((x,z)=>sampler.sample(x,z)?.y??null);
 const p=spawnPlayer();
 p.position.set(0,.10,68);p.velocity.set(0,0,9);
 p.mode='roll';p.rollHeading=0;p.rollByHold=false;
 let launched=false;let highest=0;
 for(let i=0;i<100;i++){
  simulatePlayer(p,control,1/30,collision);
  highest=Math.max(highest,p.position.y);
  if(p.mode==='air'){launched=true;break;}
 }
 assert.ok(launched,'falling away from ramp lip should switch to air');
 assert.ok(p.velocity.y>0,'ramp slope should provide a positive launch velocity');
 assert.ok(p.velocity.z>3,'takeoff should preserve horizontal momentum');
 assert.ok(highest>1,'rider should have reached the raised ramp');
});
