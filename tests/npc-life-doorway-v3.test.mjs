import test from 'node:test';
import assert from 'node:assert/strict';
import {residentDoorwayState} from '../src/npc-life/doorway.ts';
const routine={type:'Resident',version:1,role:'farmer',homeAnchorId:'house:1',
 home:{x:0,z:0},work:{x:10,z:0},workStartHour:6,workEndHour:17};
const pose=(phase,hour)=>({phase,hour,position:{x:0,z:0},heading:0,nextAtHour:18});
test('resident opens native home door while departing and returning, never all night',()=>{
 const at={x:0,z:0};
 const leaving=residentDoorwayState(routine,pose('to-work',6.02),at,1200);
 assert.deepEqual(leaving,{inside:false,requestOpen:true});
 const returning=residentDoorwayState(routine,pose('to-home',17.4),at,1200);
 assert.deepEqual(returning,{inside:false,requestOpen:true});
 const sleeping=residentDoorwayState(routine,pose('home',23),at,1200);
 assert.deepEqual(sleeping,{inside:true,requestOpen:false});
 const waking=residentDoorwayState(routine,pose('home',5.98),at,1200);
 assert.deepEqual(waking,{inside:false,requestOpen:true});
});
test('residents only disappear at a qualified exterior threshold',()=>{
 assert.deepEqual(residentDoorwayState(routine,pose('home',22),{x:4,z:0},1200),
   {inside:false,requestOpen:false});
 assert.deepEqual(residentDoorwayState({...routine,homeAnchorId:undefined},pose('home',22),{x:0,z:0},1200),
   {inside:false,requestOpen:false});
 assert.equal(residentDoorwayState(routine,pose('to-home',18),{x:2,z:0},1200).requestOpen,false);
 assert.equal(residentDoorwayState(routine,pose('to-home',18),{x:1,z:0},1200).requestOpen,true);
});
