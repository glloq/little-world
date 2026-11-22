/** Doc 107 §génération — optional mini-games in the island composer (activities stage). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {inspectMiniGame,areasOverlap} from '../src/minigames/sites.ts';
import {projectSiteQueries} from '../src/studio-core/minigame-composition.ts';

const gentle=()=>selectIslandStyle({...newIslandRequirements(),maritimePort:true,welcomeVillage:'village'},'gentle');
test('requested mini-games are placed on naturally suitable, free ground, deterministically',()=>{
 const r={...gentle(),activities:{races:'none',ski:false,music:'off',minigames:['football','minigolf','cans']}};
 validateMapRequirements(r);
 const a=composeWorld(r),b=composeWorld(r),p=a.project;parseProject(p);
 const games=Object.values(p.libraries.minigames??{});
 const missing=a.diagnostics.filter(d=>d.code==='ACTIVITY_MINIGAME_MISSING').length;
 assert.equal(games.length+missing,3,'each requested variant is placed or reported');
 assert.ok(games.length>=2,'at least two variants found ground: '+JSON.stringify(a.diagnostics.filter(d=>d.code==='ACTIVITY_MINIGAME_MISSING')));
 assert.deepEqual(b.project.libraries.minigames,p.libraries.minigames,'deterministic');
 const q=projectSiteQueries(p);
 for(const g of games){const rep=inspectMiniGame(g,q,{others:games.filter(o=>o.id!==g.id).map(o=>o.area)});assert.ok(rep.ok,g.id+': '+rep.issues.join(' · '));}
 for(let i=0;i<games.length;i++)for(let j=i+1;j<games.length;j++)assert.ok(!areasOverlap(games[i].area,games[j].area));
 assert.ok(!a.diagnostics.some(d=>d.severity==='ERROR'&&/MINIGAME/.test(d.code)),'a missing optional mini-game never blocks creation');
});
test('without the option nothing changes; invalid requests are refused',()=>{
 const r={...gentle(),activities:{races:'none',ski:false,music:'off'}};
 assert.equal(composeWorld(r).project.libraries.minigames,undefined);
 assert.throws(()=>validateMapRequirements({...r,activities:{...r.activities,minigames:['tennis']}}),/Mini-jeux/);
 assert.throws(()=>validateMapRequirements({...r,activities:{...r.activities,minigames:['football','football']}}),/Mini-jeux/);
});
test('composed mini-games get a smoothed, level ground: the platform lies a few centimetres above it',async()=>{
 const {createMiniGameManager}=await import('../src/minigames/manager.ts');
 const {MINIGAME_VARIANTS}=await import('../src/minigames/catalog.ts');
 const {areaToWorld}=await import('../src/minigames/schema.ts');
 const r={...gentle(),activities:{races:'none',ski:false,music:'off',minigames:['football','minigolf','cans']}};
 const p=composeWorld(r).project,games=Object.values(p.libraries.minigames??{}),works=p.world.terrain.archipelago.earthworks??[];
 const q=projectSiteQueries(p);
 for(const g of games){
  assert.ok(works.some(w=>w.id==='pad:'+g.id&&w.kind==='pad'),g.id+' graded');
  let lo=Infinity,hi=-Infinity;for(const [x,z] of [[-1,-1],[1,-1],[1,1],[-1,1],[0,0],[.5,-.5]]){const w=areaToWorld(g.area,x*g.area.halfWidth,z*g.area.halfLength),h=q.height(w.x,w.z);lo=Math.min(lo,h);hi=Math.max(hi,h);}
  assert.ok(hi-lo<.02,g.id+': level ground under the field ('+(hi-lo).toFixed(3)+' m)');
  const m=createMiniGameManager([g],{env:{height:q.height}});await m.prepare(g.id);
  const s=m.records.get(g.id).sim.floorSurface,c=areaToWorld(g.area,0,0),deck=s.sample(c.x,c.z);
  assert.ok(deck-q.height(c.x,c.z)<=MINIGAME_VARIANTS[g.variant].floor.raise+.011,g.id+': platform '+(deck-q.height(c.x,c.z)).toFixed(3)+' m above the ground');
  m.dispose();
 }
});
test('Studio grading: the pad follows its mini-game, is re-levelled on demand and leaves with it',async()=>{
 const {putMiniGame,removeMiniGame,miniGamePad}=await import('../src/studio-core/minigame-authoring.ts');
 const {gradeMiniGame}=await import('../src/studio-core/minigame-composition.ts');
 const r={...gentle(),activities:{races:'none',ski:false,music:'off',minigames:['football']}};
 const p=composeWorld(r).project,[g]=Object.values(p.libraries.minigames??{});assert.ok(g&&miniGamePad(p,g.id));
 const before=miniGamePad(p,g.id);
 putMiniGame(p,{...g,area:{...g.area,x:g.area.x+2}});const moved=miniGamePad(p,g.id);
 assert.equal(moved.levelM,before.levelM,'same level while moving');assert.ok(Math.abs(moved.polygon[0].x-before.polygon[0].x-2)<.02,'polygon follows the area');
 const again=gradeMiniGame(p,p.libraries.minigames[g.id]);assert.ok(again&&p.world.terrain.archipelago.earthworks.filter(w=>w.id==='pad:'+g.id).length===1,'re-levelled, not duplicated');
 removeMiniGame(p,g.id);assert.equal(miniGamePad(p,g.id),undefined,'pad removed with the mini-game');
});
