import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parsePlayableWorld,loadPlaytest,savePlaytest} from '../src/gameplay/playable.ts';
import {createGameplay} from '../src/gameplay/runtime.ts';
import {gameplayDialogueSession} from '../src/gameplay/dialogue-session.ts';
import {scopedSaveStorage,createGameSaveStore} from '../src/gameplay/save.ts';
const bundle=JSON.parse(await readFile(new URL('../public/maps/beta.json',import.meta.url),'utf8'));
function storage(){const values=new Map();return {get length(){return values.size;},key(i){return [...values.keys()][i]??null;},getItem(k){return values.get(k)??null;},setItem(k,v){values.set(k,v);},removeItem(k){values.delete(k);}};}
test('reference playable content supports choice, collection, delivery and ordered puzzle, then save/resume',()=>{
 const content=parsePlayableWorld(bundle),r=createGameplay(content.gameplay),talk=gameplayDialogueSession(r,'woodland-animal');assert.match(talk.line.text,/gland/);assert.equal(talk.choose(0),true);assert.equal(r.state.objectives.delivery,'active');
 assert.equal(r.interact('beta-panel',{x:-20,y:0,z:-175}),false);assert.equal(r.interact('beta-acorn',{x:-24,y:0,z:-180}),true);assert.equal(r.state.inventory.acorn,1);assert.equal(r.interact('woodland-animal',{x:-30,y:0,z:-180}),true);assert.equal(r.state.objectives.delivery,'complete');
 assert.equal(r.interact('beta-lever',{x:-20,y:0,z:-180}),true);assert.equal(r.interact('beta-panel',{x:-20,y:0,z:-175}),true);assert.equal(r.state.entities['beta-gate'].open,true);
 const next=createGameplay(content.gameplay);next.restore(r.save('one'));assert.equal(next.interact('beta-acorn',{x:-24,y:0,z:-180}),false);assert.equal(next.state.entities['beta-gate'].open,true);assert.equal(next.state.objectives.delivery,'complete');
});
test('playtest snapshots are independent, capped and reject missing or mismatched copies',()=>{
 const s=storage(),before=structuredClone(bundle);const a=savePlaytest({projectId:'studio',content:bundle},s);assert.deepEqual(bundle,before);a.content.world.name='changed';assert.notEqual(loadPlaytest(a.snapshotId,s).content.world.name,'changed');
 for(let i=0;i<8;i++)savePlaytest({projectId:'studio',content:bundle},s);assert.equal(s.length,5);assert.throws(()=>loadPlaytest(a.snapshotId,s));
 const last=savePlaytest({projectId:'studio',content:bundle},s);const raw=JSON.parse(s.getItem('little-world:studio-playtest:v1:'+last.snapshotId));raw.snapshotId='wrong';s.setItem('little-world:studio-playtest:v1:'+last.snapshotId,JSON.stringify(raw));assert.throws(()=>loadPlaytest(last.snapshotId,s));
});
test('two disposable tests and real game slots never read or overwrite each other',async()=>{
 const s=storage(),real=createGameSaveStore(s),a=createGameSaveStore(scopedSaveStorage(s,'snapshot-a')),b=createGameSaveStore(scopedSaveStorage(s,'snapshot-b')),r=createGameplay(bundle.gameplay),save=r.save('slot-1');await real.save(save);r.state.inventory.acorn=3;await a.save(r.save('slot-1'));
 assert.equal((await real.load(save.worldId,'slot-1')).inventory.acorn,undefined);assert.equal((await a.load(save.worldId,'slot-1')).inventory.acorn,3);assert.equal(await b.load(save.worldId,'slot-1'),null);assert.equal((await b.list(save.worldId)).length,0);
});
test('runtime content rejects invisible interactive entities and source version errors',()=>{const bad=structuredClone(bundle);bad.gameplay.entities.find(e=>e.id==='beta-acorn').id='invisible';assert.throws(()=>parsePlayableWorld(bad));const outside=structuredClone(bundle);outside.spawn.x=99999;assert.throws(()=>parsePlayableWorld(outside));});
