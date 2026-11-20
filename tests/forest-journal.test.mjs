import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProductionReference} from '../tools/generate-production-reference.mjs';
import {projectGeography} from '../src/studio-core/geo-context.ts';
import {gameplayDataFromProject} from '../src/gameplay/project-adapter.ts';
import {createGameplay} from '../src/gameplay/runtime.ts';
import {gameplayDialogueSession} from '../src/gameplay/dialogue-session.ts';

test('the forest journal quest gates the cache and persists its reward and follow-up',()=>{
  const {project}=buildProductionReference();
  const guide='forest:cartographer',cache='forest:journal-cache',journal='forest:lost-journal';
  const {ctx}=projectGeography(project);
  for(const id of [guide,cache]){
    const {x,z}=project.entityIndex[id].position;
    assert.ok(ctx.height(x,z)>project.world.seaLevel,id+' is on dry land');
  }
  const data=gameplayDataFromProject(project);
  const game=createGameplay(data);
  const at=project.entityIndex[cache].position;
  assert.equal(game.interact(cache,at),false);
  const first=gameplayDialogueSession(game,guide);
  assert.equal(first.choose(0),true);
  assert.equal(first.choose(0),true);
  assert.equal(game.state.objectives[journal],'active');
  assert.equal(game.interact(cache,at),true);
  game.update(1/30);
  assert.equal(game.state.inventory['forest:journal-item'],1);
  const delivery=gameplayDialogueSession(game,guide);
  assert.equal(delivery.choose(0),true);
  assert.equal(game.state.inventory.coin,35);
  assert.equal(game.state.inventory['forest:journal-item']??0,0);
  const resumed=createGameplay(data);
  resumed.restore(game.save('slot-1',at));
  assert.equal(resumed.state.objectives[journal],'complete');
  assert.equal(resumed.state.entities[cache].opened,true);
  assert.equal(resumed.interact(cache,at),false);
  assert.match(gameplayDialogueSession(resumed,guide).choices[0].text,/cascade/);
});
