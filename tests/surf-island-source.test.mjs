import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSurfIsland,SURF_ISLAND} from '../tools/generate-surf-island.mjs';
import {validateSurfZone} from '../src/surf/wave-field.ts';
import {validateRace} from '../src/gameplay/races.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {acceptQuest,advanceQuest} from '../src/quests/progress.ts';
import {validateBirthPort} from '../src/studio-core/birth-port.ts';
test('dedicated surf island compiles a real N1 port and three disjoint A/B/C wave zones',()=>{
 const {project,port,plan,homes}=buildSurfIsland();
 assert.equal(project.world.worldId,SURF_ISLAND.worldId);
 assert.equal(plan.beaches.length,3,plan.warnings.join('; '));
 assert.ok(port.boat&&port.trade&&port.shore,'port uses real authored assets');
 assert.equal(validateBirthPort(project).length,0,'N1 authored port must survive source round-trip');
 const village=project.libraries.settlements['composition-welcome-village'];
 assert.ok(homes>=4);
 assert.equal(village.buildings.length,homes);
 assert.ok(Object.values(project.chunks).some(chunk=>Object.values(chunk.entities).some(entity=>entity.components.Resident)));
 assert.ok(project.libraries.objectives['composition-welcome-village-meet-neighbor']);
 assert.equal(Object.keys(project.libraries.surfZones??{}).length,3);
 assert.equal(Object.keys(project.libraries.races??{}).length,3);
 assert.ok(Object.keys(project.assets).some(id=>id.startsWith('maritime.')),'real port assets registered');
 assert.equal(parseProject(project).world.worldId,SURF_ISLAND.worldId);
 assert.equal(Object.values(project.entityIndex).filter(entity=>entity.kind==='prop'&&entity.id.startsWith('surf-shore:')).length,9);
 for(const b of plan.beaches){
  assert.equal(validateSurfZone(b.zone),b.zone);
  assert.equal(validateRace(b.gates,project.world.bounds),b.gates);
  assert.equal(b.gates.gates.length,4);
 }
 const offer=project.libraries.questCatalog['quest:trois-vagues-chronos'];
 assert.ok(project.entityIndex[offer.giverId]);
 assert.deepEqual(offer.steps.map(step=>step.raceId),plan.beaches.map(beach=>beach.gates.id));
 let quest=acceptQuest(offer,offer.questKey,3);
 const event={schemaVersion:1,eventId:'test:surf:1',type:'race.finished',worldId:project.world.worldId,
  islandId:project.world.worldId,gameMinute:4,sequence:1,raceId:offer.steps[0].raceId,measuredSeconds:27};
 assert.equal(advanceQuest(quest,{...event,raceId:offer.steps[2].raceId}).applied,false);
 for(const [index,step] of offer.steps.entries()){
  quest=advanceQuest(quest,{...event,raceId:step.raceId,eventId:'test:surf:'+index,sequence:index+1}).instance;
  assert.equal(quest.stepIndex,index+1);
 }
 assert.equal(quest.status,'ready');
 const [a,b,c]=plan.beaches;
 assert.equal(a.zone.barrelStrength,0);
 assert.ok(b.zone.barrelStrength>0);
 assert.ok(c.features.some(f=>f.kind==='boost'));
 assert.ok(c.features.some(f=>f.kind==='ramp'));
 for(let i=0;i<plan.beaches.length;i++)for(let j=i+1;j<plan.beaches.length;j++){
  const x=plan.beaches[i].zone,y=plan.beaches[j].zone;
  assert.ok(x.maxX<=y.minX||y.maxX<=x.minX||x.maxZ<=y.minZ||y.maxZ<=x.minZ,
   'beaches must never share a water-owned rectangle');
 }
 assert.ok(plan.beaches.every(b=>Math.hypot(b.start.x-port.boat.x,b.start.z-port.boat.z)>105),
  'calm harbour stays separated from breaking waves');
});

test('surf guide rewards beach exploration once, including after a save',async()=>{
 const {gameplayDataFromProject}=await import('../src/gameplay/project-adapter.ts');
 const {createGameplay}=await import('../src/gameplay/runtime.ts');
 const {gameplayDialogueSession}=await import('../src/gameplay/dialogue-session.ts');
 const data=gameplayDataFromProject(buildSurfIsland().project);
 const game=createGameplay(data),guide='surf-shore:guide',quest='surf-shore:survey';
 assert.equal(gameplayDialogueSession(game,guide).choose(0),true);
 assert.equal(game.state.objectives[quest],'active');
 const marks=data.entities.filter(entity=>entity.initialState.surfShoreMarker);
 assert.equal(marks.length,3);
 for(const mark of marks.slice(0,2))assert.equal(game.interact(mark.id,mark.position),true);
 assert.ok(!gameplayDialogueSession(game,guide).choices.some(choice=>choice.id==='claim'));
 const resumed=createGameplay(data);
 resumed.restore(game.save('slot-1',marks[1].position));
 assert.equal(resumed.interact(marks[2].id,marks[2].position),true);
 assert.equal(gameplayDialogueSession(resumed,guide).choose(0),true);
 assert.equal(resumed.state.objectives[quest],'complete');
 assert.equal(resumed.state.inventory.coin,30);
 assert.ok(!gameplayDialogueSession(resumed,guide).choices.some(choice=>choice.id==='claim'));
});
