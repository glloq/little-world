/** Doc 107 §génération — optional mini-games in the island composer (activities stage). */
import test from 'node:test';
import assert from 'node:assert/strict';
import {composeWorld} from '../src/studio-core/world-composition.ts';
import {newIslandRequirements,validateMapRequirements} from '../src/studio-core/map-requirements.ts';
import {selectIslandStyle} from '../src/studio-core/island-styles.ts';
import {parseProject} from '../src/studio-core/schema.ts';
import {inspectMiniGame,areasOverlap} from '../src/minigames/sites.ts';
import {projectSiteQueries} from '../src/studio-core/minigame-authoring.ts';

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
