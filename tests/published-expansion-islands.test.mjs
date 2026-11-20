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
import {skiAreasOf} from '../src/snow/ski-area.ts';
import {boardResortLift,resortLifts,stepResortRide} from '../src/snow/ski-resort.ts';

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
 // Complete ski domain: several marked runs, several lift types, every lift reaches its top.
 const areas=skiAreasOf(project.libraries.alpine);
 assert.ok(areas.length>=6,areas.length+' pistes');
 assert.deepEqual([...new Set(areas.map(a=>a.difficulty))].sort(),['black','blue','green','red']);
 const lifts=resortLifts(areas,ctx.height);
 assert.ok(lifts.length>=5,lifts.length+' remontées');
 for(const kind of ['gondola','chairlift','draglift'])assert.ok(lifts.some(l=>l.kind===kind),kind);
 for(const lift of lifts){
  const base=lift.lift.path[0],top=lift.lift.path.at(-1),ground=ctx.height(base.x,base.z);
  const ride=boardResortLift(lifts,{x:base.x,y:ground,z:base.z},ground,0);
  assert.equal(ride?.lift.id,lift.id);
  let arrived=null;for(let t=0;t<2000&&!arrived;t+=1/30){const step=stepResortRide(ride,t);if(step.kind==='arrived')arrived=step.top;}
  assert.ok(arrived&&Math.hypot(arrived.x-top.x,arrived.z-top.z)<.01,lift.name+' arrives at its top station');
  assert.ok(ctx.height(top.x,top.z)>ground+15,lift.name+' climbs');
  const area=areas.find(a=>a.id===lift.areaId);
  assert.ok(Math.hypot(top.x-area.points[0].x,top.z-area.points[0].z)<60,lift.name+' drops riders at its piste');
 }
 // Snow covers the upper mountain and every run, not only the main corridor.
 let summit={x:0,z:0,h:-Infinity};
 for(let x=-600;x<=600;x+=20)for(let z=-800;z<=500;z+=20){const h=ctx.height(x,z);if(h>summit.h)summit={x,z,h};}
 assert.equal(classifyPoint(ctx,summit.x,summit.z).material,'snow');
 for(const area of areas)for(const q of area.points.filter((_,i)=>i%5===0))assert.equal(classifyPoint(ctx,q.x,q.z).material,'snow',area.name);
 let high=0,snowy=0;
 for(let x=-600;x<=600;x+=25)for(let z=-800;z<=500;z+=25){const sample=classifyPoint(ctx,x,z);if(sample.height>area0Snow(areas)+20){high++;if(sample.material==='snow'||sample.material==='rock')snowy++;}}
 assert.ok(high>300&&snowy/high>.9,snowy+'/'+high+' high cells are snowy');
});
const area0Snow=areas=>areas[0].snowLineM;

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
