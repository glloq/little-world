import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {defaultMineSettings,validateMineSettings,geologyAt,MINE_CHUNK} from '../src/mine/mine-data.ts';
import {MineGrid,MineState,parseMineSave} from '../src/mine/mine-state.ts';
import {mineChunkGeometry,WALL_ROWS,MINE_RELIEF} from '../src/mine/mine-mesher.ts';
import {mineSpaceProvider,mineTransitions} from '../src/mine/mine-collision.ts';
import {WorldCollisionQuery} from '../src/physics/collision-world.ts';
import {simulatePlayer,MAX_OXYGEN} from '../src/player.ts';
import {mineHubLayout,mineHubCounterId,mineRequiredExcavations,mineLevelUnlocked,mineLevelResourceIcons,mineHubRoofRise,mineHubGalleryApproach} from '../src/mine/mine-hub.ts';
import {createMineHubView} from '../src/mine/mine-hub-view.ts';
import {createActivityRuntime} from '../src/gameplay/activity-runtime.ts';

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
  const border=new MineState(new MineGrid({id:'b',name:'b',polygon:[{x:20,z:0},{x:50,z:0},{x:50,z:30},{x:20,z:30}],mine:{...defaultMineSettings([{x:20,z:0},{x:50,z:0},{x:50,z:30},{x:20,z:30}],1,30),connectors:[],galleries:[{levelId:'level-1',minX:28,maxX:31,minZ:21,maxZ:25}]}}));
  const r=border.dig({requestId:'x',levelId:'level-1',ix:31,iz:23,from:{x:30.5,y:border.grid.levels[0].floorY,z:23.5}},()=>true);assert.equal(r.ok,true);assert.deepEqual(r.chunks.sort(),['0,0','1,0']);
});
test('persistence: only differences saved; excavations and exhausted ores survive reload and geology changes',()=>{
  const state=new MineState(new MineGrid(zone()));const dug=[];
  for(let i=0;i<12;i++){const w=wallCell(state,1);if(!w)break;const r=state.dig({requestId:'d'+i,levelId:'level-2',ix:w.ix,iz:w.iz,from:from(state,1,w.stand.ix,w.stand.iz)},()=>true);assert.equal(r.ok,true);dug.push(w);}
  const save=parseMineSave(JSON.parse(JSON.stringify(state.serialize())));assert.ok(JSON.stringify(save).length<600,'compact: '+JSON.stringify(save).length+' bytes');
  const back=new MineState(new MineGrid(zone()));assert.deepEqual(back.restore(save),[]);for(const w of dug)assert.equal(back.isOpen(1,w.ix,w.iz),true);assert.equal(back.excavatedCount,dug.length);
  assert.equal(back.dig({requestId:'d0',levelId:'level-2',ix:dug[0].ix,iz:dug[0].iz,from:from(back,1,dug[0].stand.ix,dug[0].stand.iz)},()=>{throw Error('regrant');}).ok,false,'replayed request is not granted again');
  const changed=new MineState(new MineGrid(zone(99)));const warnings=changed.restore(save);assert.equal(warnings.length,1);for(const w of dug)assert.equal(changed.isOpen(1,w.ix,w.iz),true,'dug cells never reappear');
});
test('mesher: exposed faces only, bounded organic geometry, border excavation updates the neighbour chunk',()=>{
  const state=new MineState(new MineGrid(zone()));let quads=0,open=0;
  const {cx0,cx1,cz0,cz1}=state.grid.chunkRange();for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++){const g=mineChunkGeometry(state,0,cx,cz);quads+=g.quads;assert.ok(g.positions.every(Number.isFinite));}
  for(let x=-25;x<25;x++)for(let z=-5;z<45;z++)if(state.isOpen(0,x,z))open++;
  // Floor + ceiling per cell, ≤ 3 wall rows per exposed face (a corridor exposes ~2 faces per cell).
  assert.ok(open>20&&quads<=open*(2+(WALL_ROWS.length-1)*2.2),`bounded geometry: ${quads} quads for ${open} open cells`);
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

test('mesher: organic relief is crack-free and never intrudes into the walkable space',()=>{
  const state=new MineState(new MineGrid(zone()));const L=state.grid.levels[0],seen=new Map();let displaced=0;
  const {cx0,cx1,cz0,cz1}=state.grid.chunkRange();
  for(let cx=cx0;cx<=cx1;cx++)for(let cz=cz0;cz<=cz1;cz++){const g=mineChunkGeometry(state,0,cx,cz);
    for(let i=0;i<g.positions.length;i+=3){const x=g.positions[i],y=g.positions[i+1],z=g.positions[i+2],gx=Math.round(x),gz=Math.round(z);
      // Each vertex is a displaced grid vertex: a small offset from its grid column.
      assert.ok(Math.abs(x-gx)<=MINE_RELIEF.wall+1e-6&&Math.abs(z-gz)<=MINE_RELIEF.wall+1e-6,'vertex near its grid column');
      if(Math.abs(x-gx)>.01||Math.abs(z-gz)>.01)displaced++;
      // Never below the floor undulation nor below the ceiling (headroom kept).
      assert.ok(y>=L.floorY-MINE_RELIEF.floor-1e-6&&y<=L.floorY+L.height+MINE_RELIEF.vault+1.11,'vertex within the level band');
      // Horizontal displacement goes away from the open cells around the column (into the rock).
      if(Math.abs(x-gx)>1e-6||Math.abs(z-gz)>1e-6){let ox=0,oz=0;for(const [a,b] of [[-1,-1],[0,-1],[-1,0],[0,0]])if(state.isOpen(0,gx+a,gz+b)){ox+=a+.5;oz+=b+.5;}assert.ok((x-gx)*ox+(z-gz)*oz<=1e-9,'displaced into the rock');}
      // Crack-free: the same grid vertex at the same height row has one position across faces/chunks.
      const key=gx+':'+gz+':'+Math.round((y-L.floorY)/L.height*100);const prev=seen.get(key);
      if(prev)assert.ok(Math.abs(prev[0]-x)<1e-6&&Math.abs(prev[1]-y)<1e-6&&Math.abs(prev[2]-z)<1e-6,'shared vertex '+key);else seen.set(key,[x,y,z]);}}
  assert.ok(displaced>50,'walls are not flat ('+displaced+' displaced vertices)');
});

test('MINE-HUB: identical three-floor reception layout, one shaft and stable shop IDs',()=>{
  const z=zone(),state=new MineState(new MineGrid(z));
  const hubs=z.mine.levels.map((_,i)=>mineHubLayout(z,i));
  assert.equal(new Set(hubs.map(h=>h.shaft.x+':'+h.shaft.z)).size,1,'vertical shaft aligned');
  assert.equal(new Set(hubs.map(h=>h.floorY)).size,3,'level-specific altitude');
  assert.equal(new Set(hubs.map(h=>mineHubCounterId(z.id,h.levelId))).size,3,'unique counter per floor');
  for(let l=0;l<hubs.length;l++){
    const h=hubs[l];
    assert.ok(state.isOpen(l,Math.floor(h.shaft.x),Math.floor(h.shaft.z)),'lift floor open');
    assert.ok(state.isOpen(l,Math.floor(h.counter.x),Math.floor(h.counter.z)),'counter floor open');
    assert.ok(state.isOpen(l,Math.floor(h.gallery.x),Math.floor(h.gallery.z)),'gallery remains walkable');
  }
});
test('MINE-HUB: progress gates are deterministic and stairs cannot bypass the runtime lift',()=>{
  assert.equal(mineRequiredExcavations(0),0);
  assert.equal(mineRequiredExcavations(1),12);
  assert.equal(mineRequiredExcavations(2),40);
  assert.equal(mineLevelUnlocked(2,39),false);
  assert.equal(mineLevelUnlocked(2,40),true);
  const z=zone(),q=new WorldCollisionQuery(()=>30,()=>null);
  const a=createActivityRuntime({mines:[z],farms:[]},{
    grant:()=>true,has:()=>true,time:()=>0,climate:{},
    collision:q,ground:()=>30,water:()=>null,
  });
  const hub=mineHubLayout(z,0),point={x:hub.counter.x,y:hub.floorY,z:hub.counter.z},
    space={zoneId:z.id,levelId:hub.levelId};
  assert.ok(a.mineHubNear(point,space,'shop'));
  const view=a.mineLiftView(point,space);assert.ok(view);
  assert.equal(view.stops.length,3);
  assert.equal(view.stops[0].unlocked,true);
  assert.equal(view.stops[1].unlocked,false);
  assert.equal(a.mineLiftTravel(point,space,z.mine.levels[1].id).ok,false,'cannot bypass gates');
  const connector=z.mine.connectors[0],stairPoint={x:connector.x,y:hub.floorY,z:connector.z};
  assert.equal(q.transitionAt(stairPoint,space),null,'no automatic stair transition');
  assert.ok(q.stats.transitions<=2,'only entrance and exit registered');
  const m=a.mines.get(z.id).state;
  for(let i=0;i<12;i++){const w=wallCell(m,0);assert.ok(w,'diggable wall '+i);
    assert.equal(m.dig({requestId:'hub-'+i,levelId:space.levelId,ix:w.ix,iz:w.iz,
      from:from(m,0,w.stand.ix,w.stand.iz)},()=>true).ok,true);}
  const result=a.mineLiftTravel(point,space,z.mine.levels[1].id);
  assert.equal(result.ok,true);
  if(result.ok){assert.equal(result.space.levelId,z.mine.levels[1].id);
    assert.equal(result.position.y,z.mine.levels[1].floorY);}
});
test('MINE-HUB: low-poly visuals merge geometry and remain detached from mine collisions',()=>{
  const hub=mineHubLayout(zone(),0),solid=new THREE.MeshLambertMaterial({vertexColors:true}),
    glow=new THREE.MeshBasicMaterial({vertexColors:true});
  const model=createMineHubView(hub,solid,glow);
  assert.equal(model.children.length,2,'only two draw submissions for the hub');
  assert.equal(model.userData.levelId,hub.levelId);
  for(const child of model.children){assert.ok(child.isMesh);
    assert.ok(child.geometry.getAttribute('color'));
    assert.ok(child.geometry.getAttribute('position').count>50);
    child.geometry.dispose();}
  solid.dispose();glow.dispose();
});

test('MINE-HUB V2: island exit is behind the gallery only on floor 1, connected without lift',()=>{
  const z=zone(),state=new MineState(new MineGrid(z)),entry=z.mine.entrance;
  const h0=mineHubLayout(z,0),h1=mineHubLayout(z,1),h2=mineHubLayout(z,2);
  assert.ok(h0.surfaceExit,'first level owns the rear exit');
  assert.equal(h1.surfaceExit,null);
  assert.equal(h2.surfaceExit,null);
  const axis={x:Math.sin(entry.heading),z:Math.cos(entry.heading)};
  const projection=(point)=>((point.x-h0.shaft.x)*axis.x+(point.z-h0.shaft.z)*axis.z);
  assert.ok(projection(h0.surfaceExit)<0&&projection(h0.gallery)>0,
    'surface exit is behind the hall, opposite the extraction gallery');
  assert.equal(h0.surfaceExit.y,undefined,'rear opening is a planar floor passage, not a stair');
  const dx=h0.surfaceExit.x-entry.x,dz=h0.surfaceExit.z-entry.z;
  // Validate a walkable 1 m cell route, not merely a decorative sign.
  const steps=Math.ceil(Math.hypot(dx,dz)*2);
  for(let i=0;i<=steps;i++){
    const t=i/steps,x=entry.x+dx*t,z=entry.z+dz*t;
    if(state.grid.inZone(Math.floor(x),Math.floor(z)))
      assert.ok(state.isOpen(0,Math.floor(x),Math.floor(z)),'rear corridor cell open '+i);
  }
  const q=new WorldCollisionQuery(()=>30,()=>null);
  const runtime=createActivityRuntime({mines:[z],farms:[]},{
    grant:()=>true,time:()=>0,has:()=>true,climate:{},collision:q,ground:()=>30,water:()=>null
  });
  assert.equal(q.stats.transitions,2,'only surface enter / exit transitions, no elevator auto trigger');
  assert.equal(q.transitionAt({x:entry.x,y:state.grid.levels[1].floorY,z:entry.z},
    {zoneId:z.id,levelId:h1.levelId}),null,'lower level cannot leave for the island');
  assert.ok(runtime.mineNavigation({x:h0.surfaceExit.x,y:h0.floorY,z:h0.surfaceExit.z},
    {zoneId:z.id,levelId:h0.levelId}));
});
test('MINE-HUB V2: same asset, level-specific ore pictograms and no exit below',()=>{
  const z=zone(),state=new MineState(new MineGrid(z));
  const materials=[new THREE.MeshLambertMaterial({vertexColors:true}),new THREE.MeshBasicMaterial({vertexColors:true})];
  const all=[0,1,2].map(l=>{
    const icons=mineLevelResourceIcons(state,l),hub=mineHubLayout(z,l),scene=createMineHubView(hub,...materials,icons);
    assert.ok(icons.every(v=>['stone','iron','crystal'].includes(v)));
    assert.deepEqual(scene.userData.resourceIcons,icons);
    assert.equal(scene.userData.hasRearExit,l===0);
    assert.equal(scene.children.length,2,'same merged, two-material art pipeline');
    scene.traverse(child=>{if(child.isMesh)child.geometry.dispose();});
    return icons;
  });
  assert.ok(all.some(icons=>icons.length>0),'mineral signs must not be empty everywhere');
  for(const material of materials)material.dispose();
});

test('MINE-HUB V2: each level entrance is joined to its authored remote gallery',()=>{
  const z=zone();
  z.mine.galleries=z.mine.galleries.filter(g=>g.levelId!=='level-3');
  z.mine.galleries.push({levelId:'level-3',minX:10,maxX:14,minZ:29,maxZ:34});
  const state=new MineState(new MineGrid(z)),hub=mineHubLayout(z,2);
  const approach=mineHubGalleryApproach(hub),target={x:10.5,z:29.5};
  // First a straight 5.8 m portal, then a wide bend to the existing authored gallery.
  for(const [start,end] of [[hub.gallery,approach],[approach,target]]){
    const dx=end.x-start.x,dz=end.z-start.z,n=Math.ceil(Math.hypot(dx,dz)*2);
    for(let i=0;i<=n;i++){
      const x=start.x+dx*i/n,z=start.z+dz*i/n;
      assert.ok(state.isOpen(2,Math.floor(x),Math.floor(z)),
        'level 3 tunnel is open at segment sample '+i);
    }
  }
});

test('MINE-HUB V3: reception has a wide clear aisle, with objects kept to the sides',()=>{
  const z=zone(),grid=new MineGrid(z),a=mineHubLayout(z,0),b=mineHubLayout(z,2);
  assert.ok(Math.hypot(a.counter.x-a.shaft.x,a.counter.z-a.shaft.z)>6,
    'minekeeper no longer obstructs the elevator');
  assert.ok(Math.hypot(a.counter.x-a.gallery.x,a.counter.z-a.gallery.z)>5,
    'counter is away from the gallery threshold');
  assert.ok(Math.hypot(a.surfaceExit.x-a.gallery.x,a.surfaceExit.z-a.gallery.z)>10,
    'front and rear openings have a spacious lobby between them');
  assert.equal(b.surfaceExit,null,'same open geometry below except island exit');
  for(let i=0;i<3;i++){
    const h=mineHubLayout(z,i);
    assert.ok(grid.initiallyOpen(i,Math.floor(h.counter.x),Math.floor(h.counter.z)),
      'shop frontage has enough cleared space at floor '+i);
    assert.ok(grid.initiallyOpen(i,Math.floor(h.keeper.x),Math.floor(h.keeper.z)),
      'minekeeper stays entirely inside the excavated reception');
    assert.ok(grid.initiallyOpen(i,Math.floor(h.shaft.x),Math.floor(h.shaft.z)),
      'lift landing on every floor');
  }
  for(const level of [0,1,2])for(const t of [-5,-3,-1,0,1,3,5]){
    // The 3.5 m-wide central path is clear from rear to extraction arch.
    const center=mineHubLayout(z,level);
    const x=center.gallery.x-Math.sin(center.heading)*(5.3-t),
      z=center.gallery.z-Math.cos(center.heading)*(5.3-t);
    assert.ok(grid.initiallyOpen(level,Math.floor(x),Math.floor(z)),
      'unobstructed central floor '+level+' at '+t);
  }
});
test('MINE-HUB V3: higher reception roof agrees with the physical ceiling and fades at edges',()=>{
  const z=zone(),state=new MineState(new MineGrid(z)),provider=mineSpaceProvider(state),hub=mineHubLayout(z,0);
  const x=hub.gallery.x,z=hub.shaft.z;
  const rise=mineHubRoofRise(hub,x,z);
  assert.ok(rise>.8,'centre of large hall has additional roof clearance');
  const column=provider.column(hub.levelId,x,z);
  assert.ok(column&&Math.abs(column.ceilingY-(hub.floorY+hub.height+rise))<1e-6);
  assert.equal(mineHubRoofRise(hub,hub.shaft.x+12,hub.shaft.z),0,
    'roof reverts to authored height outside the hall');
  const model=createMineHubView(hub,new THREE.MeshLambertMaterial({vertexColors:true}),
    new THREE.MeshBasicMaterial({vertexColors:true}),['stone','iron']);
  assert.equal(model.userData.visualVersion,3);
  assert.equal(model.userData.clearAisleWidth,3.5);
  assert.equal(model.scale.x,-1,'model is mirrored to keep shop visually left of the aisle');
  for(const mesh of model.children){mesh.geometry.dispose();mesh.material.dispose();}
});
