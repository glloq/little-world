import test from 'node:test';
import assert from 'node:assert/strict';
import {residentReassignmentConflict} from '../src/npc-life/authoring.ts';

const resident=(role,homeAnchorId,workAnchorId)=>({
 type:'Resident',version:1,role,
 home:{x:0,z:0},work:{x:5,z:0},homeAnchorId,workAnchorId,
});

test('Studio reassignment rejects fully occupied homes without mutating occupants',()=>{
 const existing=[resident('farmer','house:a','field:a'),resident('fisher','house:a','dock:a')];
 assert.match(residentReassignmentConflict(existing,'house:a','field:b','merchant'),/complet/);
 assert.equal(residentReassignmentConflict(existing,'house:b','field:b','merchant'),null);
 assert.equal(existing.length,2);
});

test('Studio reassignment keeps work stations exclusive and lets children share public play',()=>{
 const worker=resident('farmer','house:a','field:a');
 const child=resident('child','house:b','play:a');
 assert.match(residentReassignmentConflict([worker],'house:b','field:a','farmer'),/déjà attribué/);
 assert.match(residentReassignmentConflict([child],'house:c','play:a','farmer'),/déjà attribué/);
 assert.equal(residentReassignmentConflict([child],'house:c','play:a','child'),null);
 assert.equal(residentReassignmentConflict([child],'house:c','play:a','villager'),null);
});
