import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {authoredRaceFromTrace,putAuthoredRace,removeAuthoredRace,validateAuthoredRace,sourceRaceKey} from '../src/studio-core/race-authoring.ts';
import {CommandBus} from '../src/studio-core/commands.ts';
import {editDocument} from '../src/studio-core/edit.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {beginRace,advanceRace,raceElapsedSeconds} from '../src/gameplay/races.ts';
function fixture(kind='roll'){
 const p=createProject({name:'Circuits',worldId:'races-world',width:400,length:400});
 const points=[{x:0,z:0},{x:0,z:30},{x:0,z:60}];
 return {p,race:authoredRaceFromTrace(p.world,{id:'race:test-1',name:'Piste du hamster',kind,points,height:()=>0})};
}
test('V3 fixed race: validated, optional, undoable, ZIP round-trip',()=>{
 const {p,race}=fixture(),bus=new CommandBus(p);
 assert.equal(p.libraries.races,undefined,'old projects stay valid');
 editDocument(bus,'Créer circuit',[],d=>putAuthoredRace(d,race));
 assert.equal(parseProject(p).libraries.races[race.id].gates.length,3);
 bus.undo();assert.equal(p.libraries.races,undefined);
 bus.redo();assert.equal(p.libraries.races[race.id].layoutKey,sourceRaceKey(race));
 const copy=parseProject(readProjectArchive(writeProjectArchive(p)));
 assert.deepEqual(copy.libraries.races,p.libraries.races);
 removeAuthoredRace(p,race.id);assert.equal(Object.keys(p.libraries.races).length,0);
});
test('editing gate position changes the layout key, renaming does not',()=>{
 const {p,race}=fixture(),original=race.layoutKey;
 putAuthoredRace(p,{...race,name:'Nouveau nom'});
 assert.equal(p.libraries.races[race.id].layoutKey,original);
 const copy=structuredClone(race);copy.gates[1].center.y+=2;
 putAuthoredRace(p,copy);assert.notEqual(p.libraries.races[race.id].layoutKey,original);
});
test('invalid circuits are refused at the project boundary',()=>{
 const {p,race}=fixture();
 assert.throws(()=>validateAuthoredRace({...race,layoutKey:'bad'},p.world),/empreinte/);
 assert.throws(()=>validateAuthoredRace({...race,worldId:'wrong'},p.world),/invalide/);
 assert.throws(()=>validateAuthoredRace({...race,script:'eval'},p.world),/champ inconnu/);
 assert.throws(()=>validateAuthoredRace({...race,gates:[{...race.gates[0],center:{x:999,y:0,z:0}},...race.gates.slice(1)]},p.world));
});
test('fixed start gate starts its clock only when crossed',()=>{
 const {race}=fixture(),s=beginRace(race,0);
 const at=z=>({x:0,y:1.6,z});
 const tick=(a,b,mode='roll')=>advanceRace(s,{tick:s.lastTick+1,previous:at(a),position:at(b),mode,pulseSeq:0});
 assert.equal(tick(-5,-3),null);assert.equal(raceElapsedSeconds(s),0);
 assert.equal(tick(-1,1).kind,'started');assert.equal(s.nextGate,1);
 assert.equal(tick(29,31).kind,'checkpoint');
 const finish=tick(59,61);assert.equal(finish.kind,'finish');
 assert.ok(Math.abs(finish.seconds-2/30)<1e-8);
});
test('fixed courses survive source compilation into a playable world',async()=>{
 const {p,race}=fixture('mixed');putAuthoredRace(p,race);
 const compiled=await compileProject(p,{resolveAsset:async()=>({hash:'0'.repeat(64),byteLength:100})});
 assert.equal(compiled.diagnostics.filter(d=>d.severity==='ERROR').length,0);
 const bundle=await openCompiledWorld('http://localhost/world/manifest.json',async url=>{
   const path=new URL(url).pathname.replace(/^\/world\//,'');
   return path in compiled.files?new Response(compiled.files[path]):new Response('',{status:404});
 });
 const play=playableFromCompiled(bundle);
 assert.equal(play.races.length,1);assert.deepEqual(play.races[0],race);
});
