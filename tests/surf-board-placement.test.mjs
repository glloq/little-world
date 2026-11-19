import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSurfBoardPlacement,boardOnWater,isSurfBoardWaterSafe,distanceToBoard} from '../src/surf/board-placement.ts';

const water=()=>0,floor=()=>-4;
const zone=(x,z)=>Math.abs(x)<5&&Math.abs(z)<5;
test('board placement snaps to water and can be mounted within reach',()=>{
 const board=boardOnWater(0,0,1.4,water);
 assert.ok(board);assert.equal(board.y,.03);
 assert.equal(distanceToBoard(board,1.5,0),1.5);
 assert.ok(isSurfBoardWaterSafe(board,water,floor,zone));
});
test('board cannot be placed in shallow water, on dry land or at edge of a wave zone',()=>{
 const a=boardOnWater(4.8,0,0,water);assert.ok(a);
 assert.equal(isSurfBoardWaterSafe(a,water,floor,zone),false);
 assert.equal(isSurfBoardWaterSafe(a,water,()=>-.3,zone),false);
 assert.equal(isSurfBoardWaterSafe(a,()=>null,floor,zone),false);
});
test('save parser accepts legacy missing board and rejects malformed or nonfinite coordinates',()=>{
 assert.equal(parseSurfBoardPlacement(undefined),null);
 assert.equal(parseSurfBoardPlacement(null),null);
 assert.deepEqual(parseSurfBoardPlacement({x:2,y:.03,z:-2,heading:0}),{x:2,y:.03,z:-2,heading:0});
 for(const value of [{x:NaN,y:0,z:0,heading:0},{x:0,y:0,z:Infinity,heading:0},{x:1e9,y:0,z:0,heading:0},[],{x:0,z:0,heading:0}])
   assert.throws(()=>parseSurfBoardPlacement(value));
});
import {boardRequest,findBoardSpotNear,BOARD_REACH} from '../src/surf/board-placement.ts';
// Sea for z < 0 inside a surf zone |x| < 100, beach for z ≥ 0.
const sea=(x,z)=>z<0?0:null,seabed=(x,z)=>z<0?-6:1,zoneAt=(x,z)=>Math.abs(x)<100&&z<0&&z>-200;
const swimmer=(x,z,inWater=true)=>({x,z,heading:0,inWater});
test('B near a floating board mounts it, far away it recalls the board next to the player',()=>{
 const placed={x:0,y:.03,z:-50,heading:0};
 const near=boardRequest(placed,swimmer(1,-50),sea,seabed,zoneAt);
 assert.equal(near.kind,'mount');assert.equal(near.board,placed);
 const far=boardRequest(placed,swimmer(60,-120),sea,seabed,zoneAt);
 assert.equal(far.kind,'recall');
 assert.ok(Math.hypot(far.board.x-60,far.board.z+120)<=BOARD_REACH,'recalled within reach of the player');
 assert.ok(Math.hypot(far.board.x-placed.x,far.board.z-placed.z)>50,'the board left its old place');
 assert.equal(boardRequest(far.board,swimmer(60,-120),sea,seabed,zoneAt).kind,'mount','second B mounts');
});
test('without surfable water around, a lost board is taken back in hand; deploy needs a surf zone',()=>{
 const placed={x:0,y:.03,z:-50,heading:0};
 assert.deepEqual(boardRequest(placed,swimmer(0,30,false),sea,seabed,zoneAt),{kind:'pickup'});
 assert.deepEqual(boardRequest(placed,swimmer(300,-50),sea,seabed,zoneAt),{kind:'pickup'},'outside every surf zone');
 const deploy=boardRequest(null,swimmer(10,-40),sea,seabed,zoneAt);
 assert.equal(deploy.kind,'deploy');
 assert.deepEqual(boardRequest(null,swimmer(10,30,false),sea,seabed,zoneAt),{kind:'none',reason:'no-water'});
 assert.deepEqual(boardRequest(placed,swimmer(.5,-50,false),sea,seabed,zoneAt),{kind:'none',reason:'not-in-water'});
});
test('the nearby spot search also looks to the sides and behind (shoreline, zone edge)',()=>{
 // Facing the beach right at the waterline: the spot is found behind, in the water.
 const spot=findBoardSpotNear(0,-.5,0,sea,seabed,zoneAt);
 assert.ok(spot&&spot.z<-.5,'found behind the swimmer');
 assert.ok(Math.hypot(spot.x,spot.z+.5)<=BOARD_REACH,'always mountable with the next B');
 assert.equal(boardRequest(spot,{x:0,z:-.5,heading:0,inWater:true},sea,seabed,zoneAt).kind,'mount');
});
