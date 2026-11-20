import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {validateWorldActivities} from '../src/studio-core/world-activities.ts';
import {validateBirthPort} from '../src/studio-core/birth-port.ts';
import {acceptQuest,advanceQuest} from '../src/quests/progress.ts';
import {validateSettlements} from '../src/settlements/validation.ts';

import {beginRace,advanceRace} from '../src/gameplay/races.ts';
import {configureTerrain} from '../src/terrain.ts';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {classifyPoint} from '../src/geography/classify.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,spawnPlayer} from '../src/player.ts';
import {alpineJumpGates,launchSkiJump} from '../src/snow/ski-jumps.ts';

test('the published alpine island retains a usable port and the native downhill activities',()=>{
 const project=buildAlpineIsland();
 assert.equal(project.manifest.worldId,'little-world-alpine-island');
 assert.equal(project.libraries.alpine['composition-alpine'].lift,true);
 assert.equal(project.libraries.races['race:composition-downhill'].worldId,project.world.worldId);
 assert.equal(project.libraries.alpine['composition-alpine'].jumps,true);
 const ski=project.libraries.races['race:composition-ski'];
 assert.equal(ski.kind,'ski');
 assert.ok(ski.gates.length>=3&&ski.gates.every(gate=>gate.allowedModes.join()==='snow,air'));
 const {world}=project,{ctx}=projectGeography(project);
 configureTerrain({width:world.bounds.maxX-world.bounds.minX,length:world.bounds.maxZ-world.bounds.minZ,
  seed:world.seed,seaLevel:world.seaLevel,terrain:world.terrain});
 const collision=new WorldCollisionQuery(ctx.height,(x,z)=>ctx.water(x,z,ctx.height(x,z)));
 collision.setMaterialSampler((x,z)=>classifyPoint(ctx,x,z).material);
 const ramps=alpineJumpGates(ski),start=ski.gates[0];
 for(const equipment of ['skis','snowboard']){
  const actor=spawnPlayer();
  const x=start.center.x-3*start.normal.x,z=start.center.z-3*start.normal.z;
  actor.position.set(x,ctx.height(x,z),z);actor.mode='ground';
  const session=beginRace(ski,0);
  const input={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,
   cameraYaw:Math.atan2(start.normal.x,start.normal.z),snowEquipment:equipment,groomedSnow:true};
  let jumps=0;
  for(let tick=1;tick<=1800&&session.status==='running';tick++){
   const previous=actor.position.clone(),target=ski.gates[session.nextGate].center;
   const error=(actor.snowHeading??input.cameraYaw)-Math.atan2(target.x-previous.x,target.z-previous.z);
   input.right=session.started?Math.max(-1,Math.min(1,Math.atan2(Math.sin(error),Math.cos(error))*4)):0;
   input.groomedSnow=ctx.skiSurface(previous.x,previous.z);
   simulatePlayer(actor,input,1/30,collision);
   if(launchSkiJump(actor,ramps,previous))jumps++;
   advanceRace(session,{tick,previous,position:actor.position,mode:actor.mode,pulseSeq:0,
    snowAirborne:actor.snowAirborne});
  }
  assert.equal(session.status,'finished',equipment+' can complete the fixed run');
  assert.equal(jumps,2,equipment+' uses both kickers in the same run');
 }
 const offer=project.libraries.questCatalog['quest:cimes-premiere-descente'];
 assert.ok(project.entityIndex[offer.giverId]);
 const stationEntity=id=>project.chunks[project.entityIndex[id].ownerChunkId].entities[id];
 const chalet=stationEntity('station-cimes:chalet');
 assert.equal(chalet.components.Visual.assetId,'architecture.wooden_cabin');
 assert.ok(chalet.components.Collider);
 assert.equal(chalet.components.State.initial.shop,'ski');
 assert.ok(chalet.components.ShopAccess);
 assert.equal(project.libraries.alpine['composition-alpine'].groomed,true);
 assert.equal(stationEntity('station-cimes:panneau').components.State.initial.alpineStation,true);
 assert.ok(stationEntity('station-cimes:monitrice').components.DialogueActor);
 assert.ok(project.world.terrain.archipelago.features.some(f=>f.id==='station-cimes:terrasse'&&f.kind==='plateau'&&f.surface));
 const accepted=acceptQuest(offer,offer.questKey,3);
 const event={schemaVersion:1,eventId:'test:cimes:1',type:'race.finished',worldId:project.world.worldId,
  islandId:project.world.worldId,gameMinute:4,sequence:1,raceId:ski.id,measuredSeconds:27};
 assert.equal(advanceQuest(accepted,{...event,raceId:'race:composition-downhill'}).applied,false);
 assert.equal(advanceQuest(accepted,{...event,islandId:'other-island'}).applied,false);
 assert.equal(advanceQuest(accepted,event).instance.status,'ready');
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
 const offer=project.libraries.questCatalog['quest:moissons-premiere-recolte'];
 assert.ok(project.entityIndex[offer.giverId]);
 assert.ok(fields.some(field=>field.id===offer.bindings.farmPlotId&&
  field.farm.assignment==='player'&&field.farm.crops.includes('carrot')));
 const accepted=acceptQuest(offer,offer.questKey,3);
 const event={schemaVersion:1,eventId:'test:moissons:1',type:'farm.harvested',worldId:project.world.worldId,
  islandId:project.world.worldId,gameMinute:4,sequence:1,itemId:'farm:carrot',quantity:2};
 assert.equal(advanceQuest(accepted,{...event,type:'market.traded'}).applied,false);
 const harvested=advanceQuest(accepted,event).instance;
 assert.equal(harvested.stepIndex,1);
 const delivery={...event,eventId:'test:moissons:2',sequence:2,type:'quest.delivered',quantity:1,targetId:offer.giverId};
 assert.equal(advanceQuest(harvested,{...delivery,targetId:'other-host'}).applied,false);
 assert.equal(advanceQuest(harvested,delivery).instance.status,'ready');
 assert.deepEqual(validateBirthPort(project),[]);
 assert.deepEqual(validateWorldActivities(project),[]);
 assert.deepEqual(validateSettlements(project),[]);
});
