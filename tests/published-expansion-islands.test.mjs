import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {validateWorldActivities} from '../src/studio-core/world-activities.ts';
import {validateBirthPort} from '../src/studio-core/birth-port.ts';
import {validateSettlements} from '../src/settlements/validation.ts';

test('the published alpine island retains a usable port and the native downhill activities',()=>{
 const project=buildAlpineIsland();
 assert.equal(project.manifest.worldId,'little-world-alpine-island');
 assert.equal(project.libraries.alpine['composition-alpine'].lift,true);
 assert.equal(project.libraries.races['race:composition-downhill'].worldId,project.world.worldId);
 const ski=project.libraries.races['race:composition-ski'];
 assert.equal(ski.kind,'ski');
 assert.ok(ski.gates.length>=3&&ski.gates.every(gate=>gate.allowedModes.join()==='snow'));
 const moved=structuredClone(project);
 moved.libraries.races[ski.id].gates[0].center.x=project.world.bounds.minX;
 assert.ok(validateWorldActivities(moved).some(d=>d.code==='ACTIVITY_SKI_RACE_OUTSIDE'));
 assert.deepEqual(validateBirthPort(project),[]);
 assert.deepEqual(validateWorldActivities(project),[]);
 assert.deepEqual(validateSettlements(project),[]);
});

test('the published harvest island combines reachable farm services and owned plots',()=>{
 const project=buildHarvestIsland();
 const village=project.libraries.settlements['composition-welcome-village'];
 assert.equal(village.recipe.activity,'agriculture');
 assert.ok(village.buildings.length>=10);
 assert.ok(village.amenities.some(amenity=>amenity.role==='mill'));
 assert.ok(Object.values(project.entityIndex).some(entity=>entity.logical?.initialState?.shop==='farm'));
 const fields=Object.values(project.libraries.zones).filter(zone=>zone.kind==='farm-plot');
 assert.ok(fields.some(field=>field.farm.assignment==='player'));
 assert.ok(fields.some(field=>field.farm.assignment==='npc'&&field.farm.initialCrop));
 assert.deepEqual(validateBirthPort(project),[]);
 assert.deepEqual(validateWorldActivities(project),[]);
 assert.deepEqual(validateSettlements(project),[]);
});
