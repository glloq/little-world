import test from 'node:test';
import assert from 'node:assert/strict';
import {createResidentDoorOpenings} from '../src/gameplay/resident-door-openings.ts';

test('resident auto-opening expires without changing the persistent player door state',()=>{
 let now=0;
 const door=createResidentDoorOpenings(()=>now),playerState={open:false};
 assert.equal(door.request('village:door',2),true);
 assert.equal(door.isOpen('village:door'),true);
 now=1;
 assert.equal(door.request('village:door',2),false,'refresh does not trigger a second animation');
 assert.equal(door.expire(),false);
 now=2.5;assert.equal(door.isOpen('village:door'),true);
 now=3;assert.equal(door.expire(),true);
 assert.equal(door.isOpen('village:door'),false);
 assert.deepEqual(playerState,{open:false},'transient opening never edits save state');
});
test('temporary doors reset on save restore and reject invalid requests',()=>{
 let t=10;
 const doors=createResidentDoorOpenings(()=>t);
 assert.equal(doors.request('house:door'),true);
 doors.clear();
 assert.equal(doors.isOpen('house:door'),false);
 assert.equal(doors.request('',2),false);
 assert.equal(doors.request('house:door',Infinity),false);
 assert.equal(doors.request('house:door',6),false);
 assert.equal(doors.request('house:door',2),true);
 t=20;assert.equal(doors.expire(),true);
});
