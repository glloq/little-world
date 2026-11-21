/** Doc 107 §Studio — mini-games as universal Studio elements (selection, gizmo moves, delete,
 * duplicate, list, inspector patches) and the extended terrain checks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../src/studio-core/schema.ts';
import {createMiniGame,putMiniGame} from '../src/studio-core/minigame-authoring.ts';
import {elementsAt,moveElements,deleteElements,duplicateElements,listElements,updateElement,elementLabel,elementAnchor,elementChunkIds,elementExists} from '../src/studio-core/elements.ts';
import {minigameElementId} from '../src/studio-core/minigame-elements.ts';
import {areaToWorld} from '../src/minigames/schema.ts';
import {inspectArea,areasOverlap} from '../src/minigames/sites.ts';

const project=()=>{const p=createProject({name:'Mini-game elements',width:640,length:640,seed:5,projectId:'mg-elements',worldId:'mg-elements'});
 putMiniGame(p,createMiniGame(p,'bowling',{x:20,z:10,heading:Math.PI/2}));return p;};
const id='minigame:bowling-1';

test('a click on the ground picks the element under it before the area',()=>{
 const p=project(),g=p.libraries.minigames[id],pin=g.elements.find(e=>e.kind==='pin'),w=areaToWorld(g.area,pin.x,pin.z);
 assert.deepEqual(elementsAt(p,w.x,w.z,.2)[0],{kind:'minigameElement',id:minigameElementId(id,pin.id)});
 const c=areaToWorld(g.area,0,0);assert.deepEqual(elementsAt(p,c.x,c.z,.1)[0],{kind:'minigame',id});
 assert.ok(elementExists(p,{kind:'minigame',id}));assert.match(elementLabel(p,{kind:'minigame',id}),/Bowling/);
 assert.ok(elementAnchor(p,{kind:'minigameElement',id:minigameElementId(id,pin.id)}));
 assert.deepEqual(elementChunkIds(p,[{kind:'minigame',id}]),[],'library-level: no sector to hydrate');
});
test('gizmo moves: an area moves in world metres, an element in its rotated area frame',()=>{
 const p=project();moveElements(p,[{kind:'minigame',id}],{x:3,z:-2});
 assert.equal(p.libraries.minigames[id].area.x,23);assert.equal(p.libraries.minigames[id].area.z,8);
 const ref={kind:'minigameElement',id:minigameElementId(id,'tee')},before=p.libraries.minigames[id].elements.find(e=>e.id==='tee');
 const w0=areaToWorld(p.libraries.minigames[id].area,before.x,before.z);
 moveElements(p,[ref],{x:0,z:.5}); // world +Z; heading 90° → along the area's −x
 const after=p.libraries.minigames[id].elements.find(e=>e.id==='tee'),w1=areaToWorld(p.libraries.minigames[id].area,after.x,after.z);
 assert.ok(Math.abs(w1.x-w0.x)<.02&&Math.abs(w1.z-w0.z-.5)<.02,'the element follows the gizmo in world space');
 assert.throws(()=>moveElements(p,[ref],{x:0,z:40}),/hors de la zone/,'validated like the panel');
});
test('delete keeps the activity valid; duplicate creates independent copies; inspector patches validate',()=>{
 const p=project(),pins=p.libraries.minigames[id].elements.filter(e=>e.kind==='pin');
 deleteElements(p,[{kind:'minigameElement',id:minigameElementId(id,pins[0].id)}]);
 assert.equal(p.libraries.minigames[id].elements.filter(e=>e.kind==='pin').length,pins.length-1);
 assert.throws(()=>deleteElements(p,[{kind:'minigameElement',id:minigameElementId(id,'tee')}]),/tee/,'the tee is required');
 const copy=duplicateElements(p,[{kind:'minigame',id}],{x:30,z:0});
 assert.equal(copy[0].kind,'minigame');assert.notEqual(copy[0].id,id);assert.equal(Object.keys(p.libraries.minigames).length,2);
 const pinCopy=duplicateElements(p,[{kind:'minigameElement',id:minigameElementId(id,pins[1].id)}],{x:1,z:0});
 assert.ok(p.libraries.minigames[id].elements.some(e=>minigameElementId(id,e.id)===pinCopy[0].id));
 updateElement(p,{kind:'minigame',id},{heading:1.2,name:'Piste du port'});assert.equal(p.libraries.minigames[id].area.heading,1.2);
 assert.throws(()=>updateElement(p,{kind:'minigameElement',id:minigameElementId(id,'tee')},{x:50}),/hors de la zone/);
 const listed=listElements(p,'',"minigame");assert.equal(listed.length,2);
 deleteElements(p,[{kind:'minigame',id},{kind:'minigame',id:copy[0].id}]);assert.equal(p.libraries.minigames,undefined);
});
test('terrain checks: overlap with another activity and access on foot',()=>{
 const a={x:0,z:0,heading:0,halfWidth:5,halfLength:8},flat={height:()=>0};
 assert.ok(areasOverlap(a,{...a,x:9}));assert.ok(!areasOverlap(a,{...a,x:11}));
 assert.ok(areasOverlap(a,{...a,x:11},2),'margin');assert.ok(!areasOverlap(a,{x:12,z:0,heading:Math.PI/4,halfWidth:2,halfLength:2}));
 assert.equal(inspectArea(a,'football',flat,{others:[{...a,x:9}]}).overlaps,1);
 const island={height:(x,z)=>Math.abs(x)<=6&&Math.abs(z)<=9?0:-3,water:(x,z)=>Math.abs(x)<=6&&Math.abs(z)<=9?null:0};
 const r=inspectArea(a,'football',island);assert.equal(r.accessible,false);assert.match(r.issues.join(),/accès/);
 assert.equal(inspectArea(a,'football',flat).accessible,true);
});
