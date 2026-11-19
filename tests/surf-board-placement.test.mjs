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
