import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {defaultMineSettings,validateMineSettings,geologyAt,MINE_CHUNK} from '../src/mine/mine-data.ts';
import {MineGrid,MineState,parseMineSave} from '../src/mine/mine-state.ts';
import {mineChunkGeometry} from '../src/mine/mine-mesher.ts';
import {mineSpaceProvider,mineTransitions} from '../src/mine/mine-collision.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';

const polygon=[{x:-20,z:0},{x:20,z:0},{x:20,z:40},{x:-20,z:40}];
const zone=(seed=11)=>({id:'mine-a',name:'Mine',polygon,mine:defaultMineSettings(polygon,3,30,seed)});
const keys={forward:0,right:0,run:false,jumpPressed:false,spaceHeld:false,dive:false,cameraYaw:0};
const from=(state,level,ix,iz)=>({x:ix+.5,y:state.grid.levels[level].floorY,z:iz+.5});
/** First solid cell next to an open one on a level (a wall face the player can reach). */
function wallCell(state,level,pred=()=>true){for(let iz=state.grid.minZ;iz<state.grid.minZ+state.grid.depth;iz++)for(let ix=state.grid.minX;ix<state.grid.minX+state.grid.width;ix++){if(state.isOpen(level,ix,iz)||!state.grid.inZone(ix,iz)||!pred(state.material(level,ix,iz)))continue;for(const [dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]])if(state.isOpen(level,ix+dx,iz+dz))return {ix,iz,stand:{ix:ix+dx,iz:iz+dz}};}return null;}

test('mine settings: stable level ids, explicit altitudes, no overlapping levels, adjacent stairs',()=>{
  const z=zone();assert.equal(validateMineSettings(z.mine,polygon,3).levels.length,3);
  assert.throws(()=>validateMineSettings({...z.mine,levels:z.mine.levels.map((l,i)=>({...l,floorY:30-i*2}))},polygon,3),/1,5 m sous/);
  assert.throws(()=>validateMineSettings({...z.mine,connectors:[{id:'x',upper:'level-1',lower:'level-3',x:0,z:10}]},polygon,3),/voisins/);
  assert.throws(()=>validateMineSettings(z.mine,polygon,2),/2 niveau/);
});
test('geology: deterministic per seed/version, veins over several cells, crystals, harder deep',()=>{
  const sample=(seed,level)=>{const out=[];for(let x=0;x<64;x++)for(let z=0;z<64;z++)out.push(geologyAt(seed,level,x,z));return out;};
  assert.deepEqual(sample(5,0),sample(5,0));assert.notDeepEqual(sample(5,0),sample(6,0));
  const top=sample(5,0),deep=sample(5,2),count=(v,m)=>v.filter(x=>x===m).length;
  assert.ok(count(top,4)>20&&count(top,5)>3,'iron and crystals present');assert.ok(count(deep,3)>count(top,3),'harder rock deeper');
  let linked=0;for(let x=1;x<63;x++)for(let z=1;z<63;z++)if(geologyAt(5,0,x,z)===4&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>geologyAt(5,0,x+a,z+b)===4))linked++;
  assert.ok(linked>count(top,4)*.6,'veins span several cells');
});
test('dig: accessibility, reach, reward granted once, inventory full, protected rock, border chunks',()=>{
  const state=new MineState(new MineGrid(zone()));const w=wallCell(state,0,m=>m===2||m===3);assert.ok(w,'a reachable rock wall');
  const inner=wallCell(state,0);assert.equal(state.dig({requestId:'far',levelId:'level-1',ix:w.ix,iz:w.iz,from:{x:w.ix+9,y:state.grid.levels[0].floorY,z:w.iz}},()=>true).ok,false);
  let granted=0;const ok=state.dig({requestId:'r1',levelId:'level-1',ix:w.ix,iz:w.iz,from:from(state,0,w.stand.ix,w.stand.iz)},()=>{granted++;return true;});
  assert.equal(ok.ok,true);assert.deepEqual(ok.reward,{itemId:'mine:stone',quantity:1});assert.equal(granted,1);
  assert.deepEqual(state.dig({requestId:'r1',levelId:'level-1',ix:w.ix,iz:w.iz,from:from(state,0,w.stand.ix,w.stand.iz)},()=>{granted++;return true;}),ok,'same request: same result');
  assert.equal(granted,1,'never granted twice');assert.equal(state.dig({requestId:'r2',levelId:'level-1',ix:w.ix,iz:w.iz,from:from(state,0,w.stand.ix,w.stand.iz)},()=>true).reason,'Déjà creusé');
  const next=wallCell(state,0,m=>m>=2&&m<=5),before=state.revision;
  assert.equal(state.dig({requestId:'r3',levelId:'level-1',ix:next.ix,iz:next.iz,from:from(state,0,next.stand.ix,next.stand.iz)},()=>false).reason,'Inventaire plein');
  assert.equal(state.revision,before,'nothing committed when the reward is refused');assert.equal(state.isOpen(0,next.ix,next.iz),false);
  const blind=[...Array(20)].map((_,i)=>({ix:-5+i,iz:30})).find(c=>!state.isOpen(0,c.ix,c.iz)&&![[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>state.isOpen(0,c.ix+a,c.iz+b)));
  assert.equal(state.dig({requestId:'blind',levelId:'level-1',ix:blind.ix,iz:blind.iz,from:{x:blind.ix,y:state.grid.levels[0].floorY,z:blind.iz}},()=>true).reason,'Paroi inaccessible');
  // Outside the polygon = protected bedrock.
  const edge=new MineState(new MineGrid({...zone(),mine:{...zone().mine,galleries:[{levelId:'level-1',minX:-20,maxX:-18,minZ:5,maxZ:8}]}}));
  assert.match(edge.dig({requestId:'b',levelId:'level-1',ix:-21,iz:6,from:{x:-19.5,y:edge.grid.levels[0].floorY,z:6.5}},()=>true).reason,/protégée/);
  // Chunk border: digging x = 31 (last column of chunk 0) also dirties chunk 1.
  const border=new MineState(new MineGrid({id:'b',name:'b',polygon:[{x:20,z:0},{x:50,z:0},{x:50,z:20},{x:20,z:20}],mine:{...defaultMineSettings([{x:20,z:0},{x:50,z:0},{x:50,z:20},{x:20,z:20}],1,30),connectors:[],galleries:[{levelId:'level-1',minX:28,maxX:31,minZ:5,maxZ:8}]}}));
  const r=border.dig({requestId:'x',levelId:'level-1',ix:31,iz:6,from:{x:30.5,y:border.grid.levels[0].floorY,z:6.5}},()=>true);assert.equal(r.ok,true);assert.deepEqual(r.chunks.sort(),['0,0','1,0']);
});
test('persistence: only differences saved; excavations and exhausted ores survive reload and geology changes',()=>{
  const state=new MineState(new MineGrid(zone()));const dug=[];
  for(let i=0;i<12;i++){const w=wallCell(state,1);if(!w)break;const r=state.dig({requestId:'d'+i,levelId:'level-2',ix:w.ix,iz:w.iz,from:from(state,1,w.stand.ix,w.stand.iz)},()=>true);assert.equal(r.ok,true);dug.push(w);}
  const save=parseMineSave(JSON.parse(JSON.stringify(state.serialize())));assert.ok(JSON.stringify(save).length<600,'compact: '+JSON.stringify(save).length+' bytes');
  const back=new MineState(new MineGrid(zone()));assert.deepEqual(back.restore(save),[]);for(const w of dug)assert.equal(back.isOpen(1,w.ix,w.iz),true);assert.equal(back.excavatedCount,dug.length);
  assert.equal(back.dig({requestId:'d0',levelId:'level-2',ix:dug[0].ix,iz:dug[0].iz,from:from(back,1,dug[0].stand.ix,dug[0].stand.iz)},()=>{throw Error('regrant');}).ok,false,'replayed request is not granted again');
  const changed=new MineState(new MineGrid(zone(99)));const warnings=changed.restore(save);assert.equal(warnings.length,1);for(const w of dug)assert.equal(changed.isOpen(1,w.ix,w.iz),true,'dug cells never reappear');
});
test('mesher: exposed faces only, merged runs, border excavation updates the neighbour chunk',()=>{
  const state=new MineState(new MineGrid(zone()));let quads=0,open=0;
  const {cx0,cx1,cz0,cz1}=state.grid.chunkRange();for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++){const g=mineChunkGeometry(state,0,cx,cz);quads+=g.quads;assert.ok(g.positions.every(Number.isFinite));}
  for(let x=-25;x<25;x++)for(let z=-5;z<45;z++)if(state.isOpen(0,x,z))open++;
  assert.ok(open>20&&quads<open*6*.6,`merged geometry: ${quads} quads for ${open} open cells`);
  const solid=mineChunkGeometry(state,0,10,10);assert.equal(solid.quads,0,'no geometry for untouched rock');
});
test('player enters the mine, digs, takes the stairs, never snaps to the surface, comes back out',()=>{
  const ground=()=>30,state=new MineState(new MineGrid(zone())),q=new WorldCollisionQuery(ground,()=>null);
  q.setSpaceProvider('mine-a',mineSpaceProvider(state));for(const t of mineTransitions(state,ground))q.addTransition(t);
  const e=state.grid.zone.mine.entrance,p={position:new THREE.Vector3(e.x,30,e.z-4),velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false};
  const crossed=[],step=(f,n)=>{for(let i=0;i<n;i++){simulatePlayer(p,{...keys,forward:f},1/30,q);if(p.transitioned)crossed.push(p.transitioned.split(':').slice(2).join(':'));}};
  step(1,30);assert.deepEqual(p.space,{zoneId:'mine-a',levelId:'level-1'});assert.equal(p.position.y,state.grid.levels[0].floorY);
  for(let i=0;i<300&&p.space.levelId==='level-1';i++)step(1,1);assert.ok(crossed.includes('stairs-1:down'),'went down: '+crossed);
  assert.equal(p.space.levelId,'level-2');
  for(let i=0;i<20;i++){simulatePlayer(p,{...keys,right:i<10?1:-1},1/30,q);assert.equal(p.position.y,state.grid.levels[1].floorY,'never snapped to the surface or another level');}
  // A freshly dug cell becomes walkable through the same provider (landing is 3 cells wide).
  const iz=Math.floor(p.position.z);let edge=Math.floor(p.position.x);while(state.isOpen(1,edge-1,iz))edge--;
  p.position.x=edge+.5;assert.equal(state.dig({requestId:'walk',levelId:'level-2',ix:edge-1,iz,from:{x:p.position.x,y:p.position.y,z:p.position.z}},()=>true).ok,true);
  for(let i=0;i<15;i++)simulatePlayer(p,{...keys,right:1},1/30,q);assert.ok(p.position.x<edge,'walked into the dug cell: '+p.position.x);
  for(let i=0;i<15;i++)simulatePlayer(p,{...keys,right:-1},1/30,q);p.position.x=Math.floor(state.grid.zone.mine.connectors[0].x)+.5;
  step(-1,400);assert.equal(p.space,undefined,'back outside after '+crossed.join(' > '));assert.equal(p.position.y,30);
});
