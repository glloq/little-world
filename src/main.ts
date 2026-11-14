import {MINE_MATERIALS} from './mine/mine-data.ts';
import type {GameUi} from './ui/app/game-ui.ts';
import {resolveTarget,objectTarget,npcTarget,boatTarget,mineWallTarget,farmPlotTarget,shopTarget,gatherTarget,fishingTarget,type TargetDescriptor} from './ui/interactions/targets.ts';
import {SHOPS,type ShopKind} from './gameplay/economy.ts';
import {geoContext} from './geography/engine.ts';
import {MATERIAL_BY_MINE_KEY} from './audio/context.ts';
import { geoWorkerPool } from './geography/geo-workers.ts';
import type {AudioController} from './audio/view.ts';
import * as THREE from 'three';
import {
  FrameClock,
  PresentationBudget,
  presentationPixelRatio,
} from './frame-clock';
import './style.css';
import {waterSurface,riverX,isLegacyTerrain} from './terrain.ts';
import type {PlayableWorld,StudioPlaytest} from './gameplay/playable.ts';
import {WorldClock} from './environment/clock.ts';
import {createClimate,defaultEnvironment} from './environment/climate.ts';
import type {GameplayView} from './gameplay/game-view.ts';
import { addPlacement, buildWorld, configureScene } from './world';
import { horizonFar } from './horizon-view';
import { defaultWorld, parseWorld } from './world-data';
import { createNPCSystem } from './npc-view';
import {
  MAX_OXYGEN,
  simulatePlayer,
  spawnPlayer,
  type Controls,
} from './player';
import { buildSquirrel } from './squirrel';
import { createCustomizationMenu } from './customization-menu';
import { MouseDragOrbit } from './camera-drag';
import {
  cameraSubmerged,
  getTerrainConfig,
  clamp,
  terrainHeight,
  waterDepth,
} from './terrain';
import {
  nearBoat,
  nearDock,
  spawnBoat,
  updateBoat,
  waterDisembarkPoint,
  BOAT_DOCK,
} from './boat';

const viewport = document.querySelector<HTMLElement>('#viewport')!;
const status = document.querySelector<HTMLElement>('#status')!;
const coords = document.querySelector<HTMLElement>('#coords')!;
const fps = document.querySelector<HTMLElement>('#fps')!;
const renderMetrics = document.querySelector<HTMLElement>('#render-metrics')!;
const oxygen = document.querySelector<HTMLElement>('#oxygen')!;
/** Player interface (src/ui): created once the world, gameplay and NPCs exist. */
let gameUi:GameUi|null=null;
const overlay = document.querySelector<HTMLElement>('#start-overlay')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const scene = new THREE.Scene();
const lighting=configureScene(scene);
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 750);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance',
});
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const presentation = new FrameClock(),
  budget = new PresentationBudget();
const qualityRatios = { low: 1, medium: 1.35, high: 2 } as const;
type RenderQuality = keyof typeof qualityRatios;
const remembered = (() => {
  try {
    return localStorage.getItem('little-world-quality');
  } catch {
    return null;
  }
})();
if (remembered && remembered in qualityRatios) quality.value = remembered;
function applyQuality() {
  const mode = quality.value as RenderQuality;
  renderer.setPixelRatio(
    presentationPixelRatio(
      window.devicePixelRatio,
      qualityRatios[mode] ?? 1.35,
      budget.level,
    ),
  );
  resize();
}
quality.addEventListener('change', () => {
  try {
    localStorage.setItem('little-world-quality', quality.value);
  } catch {
    /* optional */
  }
  applyQuality();
  world?.setDetail(budget.level, quality.value === 'low');
});
applyQuality();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.domElement.tabIndex=0;
viewport.appendChild(renderer.domElement);
const searchParams = new URLSearchParams(window.location.search);
const isPreview = searchParams.get('preview') === '1',
  metricsEnabled = searchParams.has('metrics');
let definition = defaultWorld();
let playable:PlayableWorld|null=null,studioTest:StudioPlaytest|null=null,buildScope:string|null=null;
function bootFailure(error:unknown):never{overlay.setAttribute('aria-busy','false');overlay.querySelector('h1')!.textContent='Impossible d’ouvrir cette partie';overlay.querySelector('p')!.textContent=String(error);start.disabled=true;throw error;}
if(searchParams.has('studioBuild')||searchParams.has('world')){
  // Compiled V3 reader: the same path for published worlds and Studio test builds.
  try{
    const {openCompiledWorld,playableFromCompiled,publishedManifestURL}=await import('./runtime/compiled-world.ts');
    if(searchParams.has('studioBuild')){
      const {loadTestBuild,buildFetcher,buildManifestURL}=await import('./runtime/build-store.ts');
      const build=await loadTestBuild(searchParams.get('studioBuild')!);
      playable=playableFromCompiled(await openCompiledWorld(buildManifestURL(build.buildId),buildFetcher(build)),build.spawn);buildScope=build.buildId;
    }else{
      // Optional control viewpoint (audit §6: sea→volcano, rim→coasts…) for reproducible checks.
      const view=(searchParams.get('spawn')??'').split(',').map(Number),spawn=view.length===2&&view.every(Number.isFinite)?{x:view[0],y:0,z:view[1]}:undefined;
      playable=playableFromCompiled(await openCompiledWorld(publishedManifestURL(import.meta.env.BASE_URL,searchParams.get('world')!)),spawn);
    }
    definition=playable.world;
    // Render tile size is a renderer parameter, distinct from authored sectors (benchmarks compare 64/128/256 m).
    const tile=Number(searchParams.get('tile'));if([32,64,128,256].includes(tile))definition.config.chunkSize=tile;
  }catch(error){bootFailure(error);}
}else if(searchParams.has('studioPreview')||searchParams.get('beta')==='1'){
  try{
    const {loadPlaytest,parsePlayableWorld}=await import('./gameplay/playable.ts');
    if(searchParams.has('studioPreview')){studioTest=loadPlaytest(searchParams.get('studioPreview')!);playable=studioTest.content;}
    else{const response=await fetch(import.meta.env.BASE_URL+'maps/beta.json');if(!response.ok)throw Error('Monde bêta indisponible');playable=parsePlayableWorld(await response.json());}
    definition=playable.world;
  }catch(error){overlay.setAttribute('aria-busy','false');overlay.querySelector('h1')!.textContent='Impossible d’ouvrir cette partie';overlay.querySelector('p')!.textContent=String(error);start.disabled=true;throw error;}
}else if (isPreview) {
  try {
    const raw = sessionStorage.getItem('little-world-preview');
    if (raw) definition = parseWorld(JSON.parse(raw));
  } catch (e) {
    console.warn('Prévisualisation invalide : carte par défaut utilisée', e);
  }
} else {
  try {
    const response = await fetch(
      import.meta.env.BASE_URL + 'maps/default.json',
    );
    if (response.ok) definition = parseWorld(await response.json());
  } catch (e) {
    console.warn('Carte publiée indisponible : vallée intégrée utilisée', e);
  }
}
const world = buildWorld(definition.config, definition);
world.setDetail(budget.level, quality.value === 'low');
// Far plane follows the project diagonal: silhouettes stay visible without fog (near plane unchanged).
camera.far=horizonFar(getTerrainConfig().width,getTerrainConfig().length);camera.updateProjectionMatrix();
// World Production: repeated structural modules share instanced batches; anything with gameplay
// state or an interaction keeps its own object (doors, collectibles…).
const statefulIds = new Set((playable?.gameplay.entities ?? []).filter((e) => e.interactable || Object.keys(e.initialState).length).map((e) => e.id));
for (const item of definition.placements) if (statefulIds.has(item.id) || !world.placed.add(item)) addPlacement(world, item);
scene.add(world.root);
const player = spawnPlayer();
if(playable)player.position.set(playable.spawn.x,terrainHeight(playable.spawn.x,playable.spawn.z)+playable.spawn.y+.02,playable.spawn.z);
let audio:AudioController|null=null;
// AUD-V2: the valley uses the V2 catalogue (static files loaded on demand); playable maps may still carry V1 audio (migrated in memory).
try{const {parseAnyAudioDefinition}=await import('./audio/migrate.ts');let definition=playable?.audio;if(!playable){for(const file of ['audio/catalog.json','audio/default.json']){const response=await fetch(import.meta.env.BASE_URL+file).catch(()=>null);if(response?.ok){definition=parseAnyAudioDefinition(await response.json());break;}}}if(definition){const {createAudioController}=await import('./audio/view.ts');audio=createAudioController(definition,{baseUrl:import.meta.env.BASE_URL});}}catch{console.warn('Audio indisponible : le jeu reste silencieux.');}
const {createGroundProbe}=await import('./audio/world-probe.ts'),groundProbe=createGroundProbe();
let gameplay:GameplayView|null=null;
if(playable){
  const {createGameplayView}=await import('./gameplay/game-view.ts');
  gameplay=createGameplayView(playable.gameplay,{onSound:(id,p)=>audio?.playSound(id,p),collisions:playable.collisions,temporary:!!(studioTest||buildScope),saveScope:studioTest?.snapshotId??buildScope??undefined,getPosition:()=>({x:player.position.x,y:player.position.y,z:player.position.z}),objects:world.objects,showInfo,
    activities:playable.activities,getSpace:()=>player.space,
    ...(isLegacyTerrain()?{}:{gathering:{ctx:geoContext,seed:definition.config.seed,inside:(x:number,z:number)=>Math.abs(x)<=(definition.config.width??200)/2&&Math.abs(z)<=(definition.config.length??600)/2}}),
    setPosition:(p,space)=>{player.space=space??undefined;player.position.set(p.x,p.y,p.z);player.velocity.set(0,0,0);player.mode='air';player.oxygen=MAX_OXYGEN;player.glideReady=false;aboard=false;keySet.clear();jumpQueue=0;actionQueue=0;npcs.dialogue.close();previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);updateCamera(1);}
  });
  if(metricsEnabled){const g=gameplay;Object.assign(window,{littleWorldDebug:{/** Developer/test hook (metrics mode only): give items. */grant:(itemId:string,quantity:number)=>g.runtime.grantItems([{itemId,quantity}])}});}
  if(gameplay.gathering){const gather=gameplay.gathering;world.setDressingFilter((cx,cz,kind,index)=>gather.hiddenAt(cx,cz,kind,index));gather.subscribe(()=>world.redrawDressing());}
}
const npcs = createNPCSystem(scene, definition.npcs,isLegacyTerrain()?undefined:[],gameplay?.dialogueSession);
gameplay?.attachNPCs(npcs.states);
const worldClock=gameplay?.runtime.clock??new WorldClock(),climate=gameplay?.runtime.climate??createClimate(defaultEnvironment(definition.config.seed));
const {createEnvironmentView}=await import('./environment/view.ts');
const environment=createEnvironmentView(scene,lighting,worldClock,climate);
// E10 — local lights: entity states switch « state » lights, NPC carriers move their lights.
const {nightFactor}=await import('./lighting/light-data.ts');
{
  const carriers=new Map(npcs.states.map(state=>[state.definition.id,state])),carried={x:0,y:0,z:0};
  world.lights.setLookups((id,key)=>{const value=gameplay?.runtime.state.entities[id]?.[key];return typeof value==='boolean'?value:undefined;},
    id=>{const state=carriers.get(id);if(!state)return undefined;carried.x=state.x;carried.y=state.y;carried.z=state.z;return carried;});
  // Benchmark scenarios (?lightBench=N&lightLayout=cluster|spread&night=1): sources only, same budget.
  const bench=Number(searchParams.get('lightBench'));
  if(Number.isInteger(bench)&&bench>=0&&bench<=5000&&searchParams.has('lightBench')){const {benchLights}=await import('./lighting/light-bench.ts');world.refreshLights(benchLights(bench,searchParams.get('lightLayout')==='spread'?'spread':'cluster',player.position.x,player.position.z));}
  if(searchParams.get('night')==='1')worldClock.restore((1-climate.definition.initialDayPhase)*climate.definition.dayLengthSeconds);
}
world.lights.setEnvironment(nightFactor(climate.state(worldClock.time).sunAltitude),0);
// Mines and farm plots: procedural stand-ins, lanterns join the E10 light pool.
const activityView=gameplay&&(gameplay.activities.mines.size||gameplay.activities.farms.size)?(await import('./activity-view.ts')).createActivityView(scene,gameplay.activities,terrainHeight):null;
if(activityView&&!searchParams.has('lightBench'))world.refreshLights([...(definition.lights??[]),...activityView.lights]);
let activityQueue=0,cropQueue=0,strikeTimer=0;
world.update(0, player.position);
{
  const {createGameUi}=await import('./ui/app/game-ui.ts'),c=getTerrainConfig();
  gameUi=createGameUi({gameplay,npcs,audio,quality:document.querySelector<HTMLSelectElement>('#quality'),temporary:!!(studioTest||buildScope),studioUrl:import.meta.env.BASE_URL+'studio/',
    world:{name:definition.name,buildVersion:gameplay?.runtime.data.buildVersion??'vallée',dayLength:climate.definition.dayLengthSeconds,bounds:{minX:-c.width/2,maxX:c.width/2,minZ:-c.length/2,maxZ:c.length/2},seaLevel:c.seaLevel,height:terrainHeight,water:waterSurface},
    player:()=>({x:player.position.x,y:player.position.y,z:player.position.z,yaw,space:player.space,mode:player.mode,oxygen:player.oxygen,maxOxygen:MAX_OXYGEN}),
    target:()=>currentTarget(),
    home:()=>{started=false;gameUi?.controller.close();keySet.clear();overlay.classList.remove('hide');start.focus();}});
}
const squirrel = buildSquirrel();
scene.add(squirrel.group);
const customization = createCustomizationMenu(
  document.querySelector<HTMLElement>('#appearance-menu')!,
  (appearance) => squirrel.setAppearance(appearance),
);
const boat = spawnBoat();
if(!isLegacyTerrain()){
  // Generated worlds have no hard-coded harbour: moor the boat in the first deep water seaward of the start.
  for(let d=6;d<600;d+=3){const x=player.position.x,z=player.position.z+d;if(waterDepth(x,z)>1.4){boat.x=x;boat.z=z;boat.y=getTerrainConfig().seaLevel-.15;break;}}
}
let aboard = false;
world.boat.position.set(boat.x, boat.y, boat.z);
const keySet = new Set<string>();
let jumpQueue = 0,
  actionQueue = 0;
let yaw = 0,
  pitch = 0.32,
  distance = 13.8;
let started = false;
let elapsed = 0;
// Generated worlds start on a coast: face the island centre rather than the open sea.
if(playable&&!isLegacyTerrain()){const yawParam=Number(searchParams.get('yaw'));yaw=searchParams.has('yaw')&&Number.isFinite(yawParam)?yawParam:Math.atan2(-player.position.x,-player.position.z);}
// Reproducible control viewpoints (World Production captures): camera pitch and distance.
{const p=Number(searchParams.get('pitch')),d=Number(searchParams.get('dist'));if(searchParams.has('pitch')&&Number.isFinite(p))pitch=Math.max(-.3,Math.min(1.4,p));if(searchParams.has('dist')&&Number.isFinite(d))distance=Math.max(2,Math.min(600,d));}
const previousPlayerPosition = player.position.clone(),
  renderPosition = player.position.clone();
let presentedFrames = 0;
let lastPresented: number | null = null;
let frameCount = 0,
  fpsTime = 0;
const clockDt = presentation.step;

function resize() {
  const w = viewport.clientWidth,
    h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
function codeHeld(...codes: string[]): boolean {
  return codes.some((c) => keySet.has(c));
}
function input(): Controls {
  if (customization.isOpen || npcs.dialogue.isOpen || gameUi?.blocking)
    return {
      forward: 0,
      right: 0,
      run: false,
      jumpPressed: false,
      spaceHeld: false,
      dive: false,
      cameraYaw: yaw,
    };
  return {
    forward:
      Number(codeHeld('KeyW', 'KeyZ', 'ArrowUp')) -
      Number(codeHeld('KeyS', 'ArrowDown')),
    right:
      Number(codeHeld('KeyD', 'ArrowRight')) -
      Number(codeHeld('KeyA', 'KeyQ', 'ArrowLeft')),
    run: codeHeld('ShiftLeft', 'ShiftRight'),
    jumpPressed: jumpQueue > 0,
    spaceHeld: codeHeld('Space'),
    dive: codeHeld('ControlLeft', 'ControlRight'),
    cameraYaw: yaw,
  };
}
function isMenuKey(e: KeyboardEvent): boolean {
  return e.key.toLowerCase() === 'a' && !e.altKey && !e.ctrlKey && !e.metaKey;
}
const orbitDrag = new MouseDragOrbit();
function resetCameraDrag(): void {
  orbitDrag.cancel();
  renderer.domElement.classList.remove('dragging-camera');
}
window.addEventListener('keydown', (e) => {
  // Player interface first: panels, Escape (menu), I / J / M. Consumed keys never reach the game.
  if(gameUi?.handleKey(e,started&&!customization.isOpen))return;
  if(e.target instanceof Element&&e.target.closest('button,summary,a')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
  if(gameUi?.blocking||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
  // Read the typed character: AZERTY 'A' is physically KeyQ, QWERTY 'A' is KeyA.
  if (isMenuKey(e)) {
    e.preventDefault();
    if (started) {
      customization.open();
      resetCameraDrag();
      keySet.delete(e.code);
      jumpQueue = 0;
      actionQueue = 0;
    }
    return;
  }
  if (e.code === 'Escape') npcs.dialogue.close();
  if (npcs.dialogue.isOpen) return;
  if (customization.isOpen) return;
  if (
    ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
      e.code,
    )
  )
    e.preventDefault();
  if (e.repeat) return;
  keySet.add(e.code);
  if (e.code === 'Space') jumpQueue++;
  if (e.code === 'KeyE') actionQueue++;
  if (e.code === 'KeyF' && !e.repeat) activityQueue++;
  if (e.code === 'KeyC') cropQueue++;
  if (e.code === 'KeyR' && started) {
    const reset = spawnPlayer();
    player.space = undefined;
    if(playable)reset.position.set(playable.spawn.x,terrainHeight(playable.spawn.x,playable.spawn.z)+playable.spawn.y+.02,playable.spawn.z);
    player.position.copy(reset.position);
    player.velocity.set(0, 0, 0);
    aboard = false;
    player.mode = 'ground';
    player.oxygen = MAX_OXYGEN;
    player.glideReady = false;
    previousPlayerPosition.copy(player.position);
    renderPosition.copy(player.position);
    updateCamera(1);
    showInfo('Retour au point de départ');
  }
  if (e.code === 'KeyP' && started && isLegacyTerrain()) {
    aboard = false;
    player.position.set(-23, getTerrainConfig().seaLevel + 1.35, 217);
    player.velocity.set(0, 0, 0);
    player.mode = 'air';
    player.glideReady = false;
    previousPlayerPosition.copy(player.position);
    renderPosition.copy(player.position);
    updateCamera(1);
    showInfo('Port : approchez du bateau et appuyez sur E');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key.toLowerCase() === 'a') customization.close();
  keySet.delete(e.code);
});
window.addEventListener('blur', () => {
  keySet.clear();
  jumpQueue = 0;
  actionQueue = 0;
  customization.close();
  resetCameraDrag();
});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!started || customization.isOpen || gameUi?.blocking || npcs.dialogue.isOpen) return;
  if (!orbitDrag.begin(e.pointerId, e.button, e.clientX, e.clientY)) return;
  renderer.domElement.classList.add('dragging-camera');
  renderer.domElement.setPointerCapture(e.pointerId);
  e.preventDefault();
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const movement = orbitDrag.move(e.pointerId, e.buttons, e.clientX, e.clientY);
  if (!movement) {
    if (!orbitDrag.active) resetCameraDrag();
    return;
  }
  // Camera sensitivity / vertical inversion: player preferences (Paramètres › Contrôles).
  const prefs=gameUi?.preferences,k=prefs?.cameraSensitivity??1;
  yaw -= movement.dx * 0.00315 * k;
  pitch = clamp(pitch - movement.dy * 0.0024 * k * (prefs?.invertY ? -1 : 1), -0.12, 1.03);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  orbitDrag.end(e.pointerId);
  if (!orbitDrag.active) resetCameraDrag();
});
renderer.domElement.addEventListener('pointercancel', resetCameraDrag);
renderer.domElement.addEventListener('lostpointercapture', resetCameraDrag);
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    distance = clamp(distance + Math.sign(e.deltaY) * 1.0, 7, 25);
  },
  { passive: true },
);
start.addEventListener('click', () => {
  started = true;
  void audio?.start();
  overlay.classList.add('hide');
  gameUi?.started();
  renderer.domElement.focus();
});
/** Messages from gameplay effects and actions go through the single notification manager. */
function showInfo(text: string, kind:'info'|'success'|'warning'='info') {
  gameUi?.notify(kind,text);
}
const cameraTarget = new THREE.Vector3(),
  cameraDesired = new THREE.Vector3(),audioForward=new THREE.Vector3();
function updateCamera(dt: number) {
  const target = cameraTarget.copy(renderPosition);
  target.y += aboard ? 2.9 : 1.85;
  const cosPitch = Math.cos(pitch);
  const x = target.x - Math.sin(yaw) * cosPitch * distance;
  const z = target.z - Math.cos(yaw) * cosPitch * distance;
  let y = Math.max(
    target.y + Math.sin(pitch) * distance,
    terrainHeight(x, z) + 1.8,
  );
  const desired = cameraDesired.set(x, y, z);
  // In a gallery: stay inside the open cells and under the ceiling, never above the relief.
  if(player.space&&gameplay){const inside=gameplay.activities.cameraInMine(target,player.space,yaw,pitch,distance);if(inside){desired.set(inside.x,inside.y,inside.z);camera.position.copy(desired);camera.lookAt(target);return;}}
  camera.position.lerp(desired, Math.min(1, dt * 6));
  camera.lookAt(target);
}
/** Contextual target: the same ordered sources decide what the HUD shows and what E does
 * (boat → usable object → inhabitant → boat to board → mine wall → farm plot → unusable object). */
const forwardOf=()=>({x:Math.sin(yaw),z:Math.cos(yaw)});
const itemName=(id?:string)=>id?gameplay?.runtime.data.items.find(i=>i.id===id)?.name??id:undefined;
const WATER_NAMES:Record<string,string>={sea:'Mer',river:'Rivière',lake:'Lac'};
/** Shop counter entity near the player (entity state `shop` = kind of counter). */
function nearShop(facing=false):{id:string;kind:ShopKind}|null{
  if(!gameplay||player.space)return null;let best:{id:string;kind:ShopKind}|null=null,bd=3.2;const f=forwardOf();
  for(const e of gameplay.runtime.data.entities){const kind=e.initialState.shop;if(typeof kind!=='string'||!(kind in SHOPS)||!e.position)continue;const dx=e.position.x-player.position.x,dz=e.position.z-player.position.z,d=Math.hypot(dx,dz);
    if(facing&&d>.5&&(dx*f.x+dz*f.z)/d<.6)continue;if(d<bd){bd=d;best={id:e.id,kind:kind as ShopKind};}}
  return best;
}
/** Water surface 2.5–6 m in front of a standing player (sea, river or lake). */
function fishingSpot():{kind:'sea'|'river'|'lake';x:number;z:number}|null{
  if(player.mode!=='ground')return null;const f=forwardOf(),sea=getTerrainConfig().seaLevel;
  for(const d of [2.5,3.5,4.5,6]){const x=player.position.x+f.x*d,z=player.position.z+f.z*d,w=waterSurface(x,z),h=terrainHeight(x,z);if(w!==null&&w>h+.4)return {kind:Math.abs(w-sea)<.05&&h<sea?'sea':waterSurface(x,z)!==null&&isLakeAt(x,z)?'lake':'river',x,z};}
  return null;
}
function isLakeAt(x:number,z:number){return !!definition.water?.some(w=>w.kind==='lake'&&insidePolygonXZ(w.points,x,z));}
function insidePolygonXZ(pts:{x:number;z:number}[],x:number,z:number){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[i],b=pts[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
/** One gathering action (E/F): strike/pick, validated by the gathering rules. */
function runGather(){
  if(!gameplay?.gathering)return;const r=gameplay.gathering.act(player.position,forwardOf());
  if(!r.ok){showInfo(r.message,'warning');audio?.emit('ui.error',{source:'ui'});return;}
  if(!r.done)showInfo(r.message);
  audio?.emit(r.target?.rule.action==='fell'?'mine.tool.strike':'farm.harvest',{position:player.position,source:'player'});
}
/** Fishing: cast (E), wait for the bite, strike (E) in time. */
function runFishing(){
  if(!gameplay)return;const f=gameplay.fishing,now=elapsed;
  if(f.state.phase==='idle'){const spot=fishingSpot();if(!spot)return;if(!gameplay.has('tool:fishing-rod')){showInfo('Il faut une canne à pêche','warning');return;}f.cast(spot.kind,spot,now);showInfo('Ligne lancée… attendez que ça morde.');return;}
  const biting=f.state.phase==='bite',fish=f.strike();if(!fish){showInfo(biting?'Raté !':'Ligne relevée (trop tôt).','warning');return;}
  if(!gameplay.runtime.grantItems([{itemId:fish,quantity:1}]))showInfo('Sac plein','warning');
}
function updateFishing(){
  if(!gameplay)return;const f=gameplay.fishing;if(f.state.phase==='idle')return;
  if(f.state.castAt&&(Math.hypot(f.state.castAt.x-player.position.x,f.state.castAt.z-player.position.z)>8||player.mode!=='ground')){f.cancel();showInfo('Ligne relevée.');return;}
  const r=f.update(elapsed);if(r==='bite'){showInfo('Ça mord ! Appuyez sur E','success');audio?.emit('ui.confirm',{source:'ui'});}else if(r==='lost')showInfo('Le poisson s’est échappé…','warning');
}
function currentTarget():TargetDescriptor|null{
  if(!started)return null;
  let unusable:TargetDescriptor|null=null;
  return resolveTarget([
    ()=>aboard?boatTarget(true):null,
    ()=>{const o=gameplay?.describe(player.position);if(!o)return null;const t=objectTarget(o);if(!o.usable){unusable=t;return null;}return t;},
    // A counter the player faces wins over a shopkeeper standing next to it.
    ()=>{const s=nearShop(true);return s?shopTarget({entityId:s.id,name:SHOPS[s.kind].name}):null;},
    ()=>{const n=npcs.talker(player.position);return n?npcTarget(n):null;},
    ()=>nearBoat(boat,player.position.x,player.position.y,player.position.z)?boatTarget(false):null,
    ()=>{if(!gameplay||!player.space)return null;const p=gameplay.activities.digPreview(player.position,player.space,forwardOf());return p?mineWallTarget({...p,rewardName:itemName(p.reward?.itemId)}):null;},
    ()=>{const s=nearShop();return s?shopTarget({entityId:s.id,name:SHOPS[s.kind].name}):null;},
    ()=>{if(!gameplay||player.space||aboard)return null;const f=fishingSpot();if(!f&&gameplay.fishing.state.phase==='idle')return null;const has=gameplay.has('tool:fishing-rod');return fishingTarget({phase:gameplay.fishing.state.phase,water:f?WATER_NAMES[f.kind]:'',ok:has||gameplay.fishing.state.phase!=='idle',reason:'Il faut une canne à pêche (comptoir du port ou marché)'});},
    ()=>{if(!gameplay?.gathering||player.space||aboard)return null;const t=gameplay.gathering.target(player.position,forwardOf());if(!t)return null;const ok=!t.rule.tool||gameplay.has(t.rule.tool);
      return gatherTarget({key:t.key,label:t.rule.label,name:gameplay.itemName(t.rule.yields.itemId),ok,reason:'Il faut une hache (comptoir du bûcheron ou marché)',progress:t.rule.strikes>1&&t.hits?`${t.hits}/${t.rule.strikes}`:undefined});},
    ()=>{if(!gameplay||player.space)return null;const plot=gameplay.activities.farmNear(player.position);if(!plot)return null;const pv=gameplay.activities.farmPreview(plot.zone.id)!;return farmPlotTarget({zoneId:plot.zone.id,zoneName:plot.zone.name,intent:pv.intent,ok:pv.ok,reason:pv.reason,choices:plot.zone.farm.crops.length});},
    ()=>unusable,
  ]);
}
/** Digging the wall in front (F, or E when it is the target): validated by the mine. */
function runDig(){
  if(!gameplay||!player.space)return;const a=gameplay.activities,forward=forwardOf(),target=a.mineTarget(player.position,player.space,forward),r=a.dig(player.position,player.space,forward);
  // Audio follows the validated business result (never mesh changes).
  const material=target?MATERIAL_BY_MINE_KEY[MINE_MATERIALS[target.material]?.key]:undefined,context={material,tool:'pickaxe',place:'mine' as const};
  audio?.emit('mine.tool.strike',{context,position:player.position,source:'player'});
  if(r.ok){audio?.emit('mine.hit',{context,position:player.position,source:'player'});audio?.emit('mine.cell.excavated',{context,position:player.position,source:'player'});
    // A reward is announced by the inventory notification (« +1 Pierre », merged); otherwise say what happened.
    if(r.message.startsWith('+')/* dig() reports a reward as « +1 item » */){audio?.emit(material==='crystal'?'mine.resource.crystal':'mine.resource.collect',{context,source:'player'});if(material==='crystal')audio?.cue('discovery');}else showInfo(r.message,'success');}
  else{audio?.emit('mine.action.denied',{context,source:'player'});showInfo(r.message,'warning');}
}
/** Next action on the plot under the player (F, or E when it is the target): validated by AGRI. */
function runFarm(){
  if(!gameplay)return;const a=gameplay.activities,plot=a.farmNear(player.position);if(!plot)return;
  const intent=a.farmIntent(plot.zone.id),view=a.farmView(plot.zone.id),crop=view?.cropId??view?.selectedCrop,r=a.farmAct(plot.zone.id);
  // A harvest is announced by the inventory gain notification (one message per event).
  if(!(r.ok&&intent.type==='harvest'))showInfo(r.message,r.ok?'success':'warning');
  const farmEvent={plant:'farm.plant',water:'farm.water',harvest:'farm.harvest',clear:'farm.clear'}[intent.type]??'farm.plant';audio?.emit(r.ok?farmEvent:'ui.error',{context:{place:'farm',activity:'farming',objectKind:crop??undefined,state:intent.type},position:player.position,source:'player'});
}
function updateHud() {
  const labels: Record<string, string> = {
    ground: 'Au sol',
    air: 'En l’air',
    glide: 'En planage',
    swim: 'Nage',
    dive: 'Plongée',
  };
  status.textContent = aboard ? 'Navigation en bateau' : labels[player.mode];
  coords.textContent = `X ${player.position.x.toFixed(0)} m · Z ${player.position.z.toFixed(0)} m · H ${player.position.y.toFixed(1)} m`;
  oxygen.textContent = `Oxygène : ${Math.round(player.oxygen)} / ${MAX_OXYGEN} s`;
  oxygen.classList.toggle(
    'hide',
    player.mode !== 'dive' && player.mode !== 'swim',
  );
  // A submerged squirrel does NOT imply a submerged camera.
  document.body.classList.toggle(
    'underwater',
    cameraSubmerged(camera.position.x, camera.position.y, camera.position.z),
  );
}
function tick(dt: number) {
  // Menus (pause, parties, paramètres) pause the world simulation; the frame still renders.
  if (!started || gameUi?.paused) return;
  if(gameplay)gameplay.update(dt);else worldClock.advance(dt);
  const keys = input();
  if (aboard) {
    updateBoat(boat, { throttle: keys.forward, steer: keys.right }, dt);
    player.position.set(boat.x, boat.y + 1.02, boat.z);
    player.velocity.set(0, 0, 0);
    player.mode = 'ground';
    jumpQueue = 0;
  } else {
    simulatePlayer(player, keys, dt,gameplay?.collision);
    // Crossing a mine entrance / stairs: no interpolation through rock.
    if(player.transitioned){previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);}
    if (keys.jumpPressed) jumpQueue = Math.max(0, jumpQueue - 1);
  }
  // F: activity in front (dig, fell/pick, farm). Holding F repeats strikes (≈ 3.5 per second).
  if(gameplay&&!aboard&&keySet.has('KeyF')){strikeTimer-=dt;if(strikeTimer<=0){strikeTimer=.28;activityQueue=Math.max(activityQueue,1);}}else strikeTimer=0;
  if(activityQueue>0&&gameplay&&!aboard){activityQueue=0;if(player.space)runDig();else if(gameplay.activities.farmNear(player.position))runFarm();else runGather();}
  updateFishing();
  if(cropQueue>0&&gameplay){cropQueue=0;const plot=gameplay.activities.farmNear(player.position,player.space);if(plot){const name=gameplay.activities.cycleCrop(plot.zone.id);if(name){showInfo('Culture choisie : '+name);audio?.emit('farm.seedbag',{source:'player'});}}}
  if (actionQueue > 0) {
    actionQueue = 0;
    const target = currentTarget();
    if (target?.primaryAction && !target.primaryAction.enabled) {
      // The business system said no: tell why (never act on a disabled target).
      showInfo(target.primaryAction.disabledReason ?? 'Impossible pour le moment', 'warning');
      audio?.emit('ui.error', { source: 'ui' });
    } else if (target?.targetType === 'boat' && aboard) {
      aboard = false;
      if (nearDock(boat)) {
        player.position.set(BOAT_DOCK.x + 1, getTerrainConfig().seaLevel + 1.3, BOAT_DOCK.z + 3);
        player.mode = 'air';
      } else {
        const exit = waterDisembarkPoint(boat);
        player.position.set(exit.x, exit.y, exit.z);
        player.mode = 'swim';
      }
      player.velocity.set(0, 0, 0);
      player.glideReady = false;
      showInfo('Vous avez quitté le bateau');
    } else if (target?.targetType === 'object') {
      if (gameplay?.interact(player.position)) showInfo('Interaction effectuée.', 'success');
    } else if (target?.targetType === 'npc') {
      if (npcs.interact(player.position)) {
        audio?.emit('npc.vocalize',{context:{species:'squirrel'},position:player.position});
        keySet.clear();
        jumpQueue = 0;
        player.velocity.set(0, 0, 0);
        resetCameraDrag();
      }
    } else if (target?.targetType === 'boat') {
      aboard = true;
      player.velocity.set(0, 0, 0);
      player.glideReady = false;
      player.position.set(boat.x, boat.y + 1.02, boat.z);
      showInfo('Bateau : Z/S pour naviguer, Q/D pour tourner, E pour descendre');
    } else if (target?.targetType === 'mine-wall') runDig();
    else if (target?.targetType === 'farm-plot') runFarm();
    else if (target?.targetType === 'gather') runGather();
    else if (target?.targetType === 'fishing') runFishing();
    else if (target?.targetType === 'shop') { const s = nearShop(); if (s) gameUi?.openShop(s.kind); }
  }
}
function draw(now: number) {
  const frame = presentation.advance(now, !document.hidden);
  const simulationBegin = performance.now();
  for (let i = 0; i < frame.steps; i++) {
    previousPlayerPosition.copy(player.position);
    tick(clockDt);
    elapsed += clockDt;
    if (previousPlayerPosition.distanceToSquared(player.position) > 100)
      previousPlayerPosition.copy(player.position);
  }
  const simulationMs = performance.now() - simulationBegin;
  if (!frame.render) {
    requestAnimationFrame(draw);
    return;
  }
  const wallDrawDelta =
    lastPresented === null ? 0 : (now - lastPresented) / 1000;
  lastPresented = now;
  const begin = performance.now(),
    delta = frame.renderDelta;
  renderPosition.lerpVectors(
    previousPlayerPosition,
    player.position,
    frame.alpha,
  );
  environment.update(delta,player.position,budget.level,!!player.space);
  activityView?.update(delta,player.position,player.space);
  world.lights.setEnvironment(nightFactor(climate.state(worldClock.time).sunAltitude),now/1000);
  if(started&&audio){const env=climate.state(worldClock.time),ground=player.space?{}:groundProbe(player.position.x,player.position.z,now),farm=!player.space&&gameplay?.activities.farmNear(player.position);
    audio.update(now,{nowMs:now,player:{position:player.position,velocity:player.velocity,mode:player.mode,aboard,boatSpeed:Math.abs(boat.speed),space:player.space??null,surface:player.space?'stone':aboard?'wood':ground.surface},
      world:{time:env.sunAltitude<0?'night':'day',weather:env.weather,wind:env.wind,biome:ground.biome,place:farm?'farm':ground.place,activity:farm?'farming':undefined,submerged:cameraSubmerged(camera.position.x,camera.position.y,camera.position.z),nearWater:waterSurface(player.position.x,player.position.z)!==null||(isLegacyTerrain()&&Math.abs(player.position.x-riverX(player.position.z))<16)}},
      id=>gameplay?.runtime.getEntityPosition(id),budget.level,camera.getWorldDirection(audioForward));}
  world.update(delta, player.position, camera, renderer.domElement.height);
  npcs.update(delta, elapsed, player.position); // The river drives the mill: no manual on/off control.
  world.boat.position.set(
    boat.x,
    boat.y + Math.sin(elapsed * 1.7) * 0.055,
    boat.z,
  );
  world.boat.rotation.y = boat.heading;
  squirrel.group.position.copy(renderPosition);
  squirrel.update(player, delta, elapsed);
  updateCamera(delta);
  updateHud();
  gameUi?.frame(elapsed);
  fpsTime += wallDrawDelta;
  frameCount++;
  const renderBegin = performance.now();
  renderer.render(scene, camera);
  const renderSubmitMs = performance.now() - renderBegin;
  if (metricsEnabled)
    Object.assign(window, {
      littleWorldMetrics: {
        frameId: ++presentedFrames,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        chunks: { ...world.stats },
        horizon: { ...world.horizon },
        terrainWork: { ...world.terrainWork },
        dressing: world.dressing ? { ...world.dressing } : null,
        inventory: gameplay ? { ...gameplay.runtime.state.inventory } : null,
        target: currentTarget()?.primaryAction?.label ?? null,
        targetId: currentTarget()?.targetId ?? null,
        placed: { ...world.placed.stats },
        paths: { ...world.paths },
        lights: { ...world.lights.stats },
        activities: activityView&&gameplay ? { ...activityView.stats, space: player.space ?? null,
          excavated: [...gameplay.activities.mines.values()].reduce((n,m)=>n+m.state.excavatedCount,0),
          plots: Object.fromEntries([...gameplay.activities.farms.keys()].map(id=>{const v=gameplay!.activities.farmView(id)!;return [id,{crop:v.cropId,stage:v.stage,growth:+v.growth.toFixed(3),moisture:+v.moisture.toFixed(3)}];})) } : null,
        programs: renderer.info.programs?.length ?? 0,
        workers: geoWorkerPool()?.stats ? { ...geoWorkerPool()!.stats } : null,
        environment:environment.metrics,
        audio:audio?.engine.metrics??null,
        collisions:gameplay?.collision.stats??null,
        position: player.position.toArray(),
        camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov,aspect:camera.aspect,far:camera.far},
        legacyTerrain:isLegacyTerrain(),
        background:scene.background instanceof THREE.Color?scene.background.getHex(THREE.SRGBColorSpace):null,
        renderRate: budget.rate,
        qualityLevel: budget.level,
        simulationHz: 30,
        timings: {
          simulationMs,
          updateMs: renderBegin - begin,
          renderSubmitMs,
        },
      },
    });
  if (fpsTime >= 0.8) {
    fps.textContent = `FPS : ${Math.round(frameCount / fpsTime)}`;
    renderMetrics.textContent = `Rendu : ${renderer.info.render.calls} appels · ${Math.round(renderer.info.render.triangles / 1000)}k triangles · ${world.stats.active} secteurs`;
    fpsTime = 0;
    frameCount = 0;
  }
  const cost = performance.now() - begin;
  if (budget.observe(cost, wallDrawDelta)) {
    presentation.rate = budget.rate;
    world.setDetail(budget.level, quality.value === 'low');
    applyQuality();
  }
  requestAnimationFrame(draw);
}
window.addEventListener('pagehide',event=>{if(event.persisted)void audio?.engine.setHidden(true);else void audio?.dispose();});
window.addEventListener('pageshow',event=>{if(event.persisted&&started)void audio?.engine.setHidden(document.hidden);});
document.addEventListener('visibilitychange', () => {
  presentation.reset();
  lastPresented = null;
  fpsTime = 0;
  frameCount = 0;
  keySet.clear();
  jumpQueue = 0;
  actionQueue = 0;
  customization.close();
  resetCameraDrag();
  previousPlayerPosition.copy(player.position);
});
camera.position.set(
  player.position.x,
  player.position.y + 13,
  player.position.z - 24,
);
camera.lookAt(player.position);
// The visible start button must not accept a click before asynchronous boot has attached its listeners.
overlay.setAttribute('aria-busy','false');start.disabled=false;
requestAnimationFrame(draw);
