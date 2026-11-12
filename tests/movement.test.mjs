import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnPlayer, simulatePlayer, MAX_OXYGEN } from '../src/player.ts';
import { riverLevel, riverX } from '../src/terrain.ts';

const empty={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
test('a held jump never opens the wings automatically',()=>{
 const p=spawnPlayer();
 simulatePlayer(p,{...empty,jumpPressed:true,spaceHeld:true},1/60);
 assert.equal(p.mode,'air');
 for(let n=0;n<4;n++)simulatePlayer(p,{...empty,spaceHeld:true},1/60);
 assert.equal(p.mode,'air');
 simulatePlayer(p,{...empty,jumpPressed:true,spaceHeld:true},1/60);
 assert.equal(p.mode,'glide');
 simulatePlayer(p,{...empty,jumpPressed:true,spaceHeld:true},1/60);
 assert.equal(p.mode,'air');
});
test('swimming, diving and ascent are local transitions',()=>{
 const p=spawnPlayer(),z=-120;
 p.position.set(riverX(z),riverLevel(z)+.1,z);
 p.velocity.set(0,0,0);p.mode='air';
 simulatePlayer(p,empty,1/60);
 assert.equal(p.mode,'swim');
 for(let i=0;i<90;i++)simulatePlayer(p,{...empty,dive:true},1/60);
 assert.equal(p.mode,'dive');
 assert.ok(p.oxygen<MAX_OXYGEN);
 for(let i=0;i<130;i++)simulatePlayer(p,{...empty,spaceHeld:true},1/60);
 assert.equal(p.mode,'swim');
});
