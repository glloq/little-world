import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {compileProject} from '../src/world-compiler/compile.ts';
import {openCompiledWorld,playableFromCompiled} from '../src/runtime/compiled-world.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
import {parsePlayableWorld} from '../src/gameplay/playable.ts';
import {createMiniGame,putMiniGame,removeMiniGame,resetMiniGameLayout} from '../src/studio-core/minigame-authoring.ts';
import {minigameGeoZones,validateMiniGame} from '../src/minigames/schema.ts';
import {inspectArea,suggestMiniGameSites} from '../src/minigames/sites.ts';
import {demoMiniGames} from '../src/minigames/demo.ts';
import {GAMEPLAY_EVENT_TYPES,questFields} from '../src/gameplay/events.ts';

const resolver=async()=>({hash:'0'.repeat(64),byteLength:100});
const fetcher=files=>async url=>{const path=new URL(url).pathname.replace(/^\/mg\//,'');return Object.hasOwn(files,path)?new Response(files[path]):new Response('',{status:404});};
const project=()=>createProject({name:'Mini-games fixture',width:640,length:640,seed:77,projectId:'minigames-fixture',worldId:'minigames-world'});

test('Studio authoring: several independent instances of a variant, validated, removable',()=>{
 const p=project();
 const a=createMiniGame(p,'football',{x:-60,z:0});putMiniGame(p,a);
 const b=createMiniGame(p,'football',{x:60,z:0,heading:1});putMiniGame(p,b);
 assert.deepEqual(Object.keys(p.libraries.minigames),['minigame:football-1','minigame:football-2']);
 assert.throws(()=>putMiniGame(p,{...a,area:{...a.area,x:315}}),/hors de la carte/);
 const resized=resetMiniGameLayout({...b,area:{...b.area,halfLength:20}});
 assert.equal(resized.elements.find(e=>e.id==='goal-red').z,20);validateMiniGame(resized);
 removeMiniGame(p,a.id);removeMiniGame(p,b.id);assert.equal(p.libraries.minigames,undefined,'empty library removed: project identical to before');
});
test('mini-games survive project parse, archive, compilation and playable load; geography reserves their ground',async()=>{
 const p=project();for(const [v,x] of [['football',-80],['bowling',0],['minigolf',80]])putMiniGame(p,createMiniGame(p,v,{x,z:20}));
 const parsed=parseProject(p),archived=readProjectArchive(writeProjectArchive(parsed));
 assert.deepEqual(archived.libraries.minigames,p.libraries.minigames);
 const compiled=await compileProject(archived,{resolveAsset:resolver});
 const playable=playableFromCompiled(await openCompiledWorld('http://localhost/mg/manifest.json',fetcher(compiled.files)));
 assert.deepEqual(playable.minigames.map(g=>g.id),['minigame:bowling-1','minigame:football-1','minigame:minigolf-1']);
 assert.equal(playable.world.geography.zones.filter(z=>z.kind==='minigame').length,3,'no generated trees on the pitches');
 // Legacy playable JSON path (studioPreview): same validation of the optional field.
 const legacy=JSON.parse(JSON.stringify(playable));delete legacy.world.config.terrain;
 assert.deepEqual(parsePlayableWorld(legacy).minigames,playable.minigames);
 assert.throws(()=>parsePlayableWorld({...legacy,minigames:[legacy.minigames[0],legacy.minigames[0]]}),/double/);
});
test('projects without mini-games compile exactly as before (no field, no zone)',async()=>{
 const p=project(),compiled=await compileProject(parseProject(p),{resolveAsset:resolver});
 const playable=playableFromCompiled(await openCompiledWorld('http://localhost/mg/manifest.json',fetcher(compiled.files)));
 assert.equal('minigames' in playable,false);
 assert.equal((playable.world.geography?.zones??[]).some(z=>z.kind==='minigame'),false);
 assert.deepEqual(minigameGeoZones(undefined),[]);
});
test('site inspection and suggestions: slope, water and existing obstacles; deterministic demo placement',()=>{
 const flat={height:()=>0},bounds={minX:-500,maxX:500,minZ:-500,maxZ:500};
 const area={x:0,z:0,heading:0,halfWidth:9,halfLength:14};
 assert.equal(inspectArea(area,'football',flat).ok,true);
 assert.match(inspectArea(area,'football',{height:(x,z)=>z*.2}).issues[0],/Pente/);
 assert.match(inspectArea(area,'football',{height:()=>0,water:()=>1}).issues.join(),/Eau/);
 assert.equal(inspectArea(area,'football',{height:()=>0,obstacles:()=>[{x:3,z:2,r:1}]}).obstacles,1);
 assert.equal(inspectArea(area,'minigolf',{height:(x,z)=>z*.1}).ok,true,'mini-golf accepts moderate relief');
 // Hill to the east: the football pitch is suggested on flat ground only.
 const q={height:(x,z)=>Math.max(0,x-20)*.3};
 const [s]=suggestMiniGameSites('football',q,{anchors:[{x:0,z:0}],bounds});
 assert.ok(s&&inspectArea(s,'football',q).ok);
 const a=demoMiniGames({x:0,z:0},q,bounds),b=demoMiniGames({x:0,z:0},q,bounds);
 assert.deepEqual(a,b);assert.equal(a.length,3);
 for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++)assert.ok(Math.hypot(a[i].area.x-a[j].area.x,a[i].area.z-a[j].area.z)>10,'no overlap');
});
test('gameplay event registry declares minigame.finished for quests',()=>{
 assert.ok(GAMEPLAY_EVENT_TYPES.includes('minigame.finished'));
 assert.deepEqual(questFields({type:'minigame.finished',instanceId:'minigame:football-1',variant:'football',seconds:61.26,won:true}),{targetId:'minigame:football-1',source:'football:won',measuredSeconds:61.3});
});
