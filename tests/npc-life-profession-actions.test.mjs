import test from 'node:test';
import assert from 'node:assert/strict';
import {residentProfessionalAction,residentProfessionalActionCatalog,availableResidentProfessionalActions} from '../src/npc-life/profession-actions.ts';

const job=(role,kind,id='source:1')=>({
 id,sourceId:id,role,kind,point:{x:4,z:8},
});
test('F04 profession actions are bound only to an existing matching job source',()=>{
 const action=residentProfessionalAction('farmer',job('farmer','farm'));
 assert.equal(action.service,'farming');
 assert.equal(action.presentation,'farm-water');
 assert.equal(residentProfessionalAction('farmer',null),null);
 assert.equal(residentProfessionalAction('farmer',job('miner','mine')),null);
 assert.equal(residentProfessionalAction('farmer',job('farmer','amenity')),null);
 assert.equal(residentProfessionalAction('miner',job('miner','mine')).service,'mining');
 assert.equal(residentProfessionalAction('fisher',job('fisher','amenity')).service,'fishing');
 assert.equal(residentProfessionalAction('miner',{...job('miner','mine'),sourceId:'missing'}),null);
 assert.equal(residentProfessionalAction('miner',{...job('miner','mine'),point:{x:Infinity,z:2}}),null);
 assert.equal(residentProfessionalAction('child',job('child','amenity')),null);
});
test('F04 catalog is stable, closed and read-only information for Studio',()=>{
 const a=residentProfessionalActionCatalog(),b=residentProfessionalActionCatalog();
 assert.deepEqual(a,b);
 assert.ok(a.length>=10);
 assert.equal(new Set(a.map(x=>x.id)).size,a.length);
 assert.ok(a.every(x=>x.id.startsWith('profession:')));
 assert.ok(a.every(x=>!('reward' in x)&&!('quantity' in x)&&!('execute' in x)));
});

test('F04 Studio capability projection is deterministic and skips unqualified jobs',()=>{
 const jobs=[job('fisher','amenity','dock:2'),job('farmer','farm','field:1'),
  job('farmer','amenity','bench:1'),job('miner','mine','mine:1')];
 const projections=availableResidentProfessionalActions(jobs);
 assert.deepEqual(projections.map(x=>x.jobId),['dock:2','field:1','mine:1']);
 assert.deepEqual(availableResidentProfessionalActions([...jobs].reverse()),projections);
 assert.deepEqual(projections.map(x=>x.action.service),['fishing','farming','mining']);
});
