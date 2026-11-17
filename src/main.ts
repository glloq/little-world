import {PerfSampler,createGpuTimer} from './render/perf-sampler.ts';
import {advanceSpeedCamera,speedCameraState,createSpeedStreaks} from './render/speed-effects.ts';
import {createActorSimulator} from './render/remote-characters.ts';
import {captureMovement} from './physics/movement-state.ts';
import {createTouchControls,type TouchControls} from './input/touch-controls.ts';
import {isEditableGameTarget,shouldPreventGameplayKeyDefault,shouldSuppressGameplayContextMenu,flightBoostHeld} from './input/gameplay-input.ts';
import {createMobileLandscape,isPhoneTouchDevice} from './input/mobile-landscape.ts';
import './input/touch-controls.css';
import {classifyPoint} from './geography/classify.ts';
import {createMaterialSampler} from './physics/surface-material.ts';
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
import {createFleet} from './gameplay/fleet.ts';
import {worldAsset} from './world-production/registry.ts';
import type {PlayableWorld,StudioPlaytest} from './gameplay/playable.ts';
import {WorldClock} from './environment/clock.ts';
import {createClimate,defaultEnvironment} from './environment/climate.ts';
import type {GameplayView} from './gameplay/game-view.ts';
import { addPlacement, buildWorld, configureScene } from './world';
import { horizonFar } from './horizon-view';
import { defaultWorld } from './world-data';
import { createNPCSystem } from './npc-view';
import {
  MAX_OXYGEN,
  MAX_STAMINA,
  simulatePlayer,
  spawnPlayer,
  type Controls,
} from './player';
import { buildHamster } from './hamster/hamster.ts';
import { createImpactEffects, type ImpactKind } from './hamster/impact-effects.ts';
import {createGasEffects} from './hamster/gas-effects.ts';
import {GAS,gasLevel,gasCapacity,gasShots,gasMaxShots,refillGas} from './physics/gas-propulsion.ts';
import {newFlightProgress,advanceFlight,type FlightProgress} from './gameplay/flight-progress.ts';
import {foodGasValue} from './gameplay/food-effects.ts';
import { createLoadingScreen } from './ui/loading.ts';
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
  nearDock,
  spawnBoat,
  updateBoat,
  waterDisembarkPoint,
  BOAT_DOCK,
} from './boat';

const viewport = document.querySelector<HTMLElement>('#viewport')!;

const fps = document.querySelector<HTMLElement>('#fps')!;
const devSpeed = document.querySelector<HTMLElement>('#dev-speed')!;
const devMemory = document.querySelector<HTMLElement>('#memory')!;
/** Player interface (src/ui): created once the world, gameplay and NPCs exist. */
let gameUi:GameUi|null=null;
// Detect phone controls before the HUD is constructed, so its gas hint uses the Boost label.
const touchCapable=isPhoneTouchDevice();
if(touchCapable)document.body.classList.add('touch-mode');
let mobileTouch:TouchControls|null=null;
let mobileLandscape:ReturnType<typeof createMobileLandscape>|null=null;
const overlay = document.querySelector<HTMLElement>('#start-overlay')!;
const start = document.querySelector<HTMLButtonElement>('#start')!;
const loading = createLoadingScreen(start, start.parentElement!);
const scene = new THREE.Scene();
const lighting=configureScene(scene);
const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 750);
// Camera-attached speed streaks use one fixed instanced draw call, with no postprocessing.
scene.add(camera);
const speedCue=speedCameraState(),speedStreaks=createSpeedStreaks(camera);
const renderer = new THREE.WebGLRenderer({
  antialias: !touchCapable, // Avoid expensive MSAA on low-end mobile GPUs.
  powerPreference: 'high-performance',
});
const quality = document.querySelector<HTMLSelectElement>('#quality')!;
const renderTier=new URLSearchParams(location.search).get('renderTier');
const presentation = new FrameClock(),
  budget = new PresentationBudget(renderTier===null?undefined:Number(renderTier));
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
else if(touchCapable)quality.value='low'; // Safe first launch; explicit preferences always win.
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
const metricsEnabled = searchParams.has('metrics');
/** Home page: the published island (complete game). Test maps stay reachable with ?world= / ?beta=1. */
const DEFAULT_WORLD='maps/island/manifest.json';
const worldPath=searchParams.get('world')??(searchParams.has('studioPreview')||searchParams.has('studioBuild')||searchParams.get('beta')==='1'?null:DEFAULT_WORLD);
let definition = defaultWorld();
let playable:PlayableWorld|null=null,studioTest:StudioPlaytest|null=null,buildScope:string|null=null;
function bootFailure(error:unknown):never{overlay.setAttribute('aria-busy','false');overlay.querySelector('h1')!.textContent='Impossible d’ouvrir cette partie';overlay.querySelector('p')!.textContent=String(error);start.disabled=true;throw error;}
if(searchParams.has('studioBuild')||worldPath){
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
      loading.boot(.15);
      playable=playableFromCompiled(await openCompiledWorld(publishedManifestURL(import.meta.env.BASE_URL,worldPath!)),spawn);
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
}
loading.boot(.45,'Construction du relief…');
const world = buildWorld(definition.config, definition);
world.setImpostorLighting(lighting);
loading.boot(.7,'Habitants et objets…');
world.setDetail(budget.level, quality.value === 'low');
// Far plane follows the project diagonal: silhouettes stay visible without fog (near plane unchanged).
camera.far=horizonFar(getTerrainConfig().width,getTerrainConfig().length);camera.updateProjectionMatrix();
// World Production: repeated structural modules share instanced batches; anything with gameplay
// state or an interaction keeps its own object (doors, collectibles…).
const statefulIds = new Set((playable?.gameplay.entities ?? []).filter((e) => e.interactable || Object.keys(e.initialState).length).map((e) => e.id));
// Moored boats (`boat.*` placements) become usable boats of the fleet (see gameplay/fleet.ts).
const mooredBoats:{id:string;assetId:string;object:THREE.Object3D}[]=[];
for (const item of definition.placements) {
  if (item.naturalStructure) { world.natural.add(item); continue; }
  if (statefulIds.has(item.id) || !world.placed.add(item)) {
    const object = addPlacement(world, item);
    if (item.assetId.startsWith('boat.')) mooredBoats.push({ id: item.id, assetId: item.assetId, object });
  }
}
scene.add(world.root);
const player = spawnPlayer();
let flightProgress:FlightProgress=newFlightProgress();
// Smaller character (CHARACTER_SCALE): collision body scaled like the model.
player.body = { radius: .32, height: 1.35, step: .4 };
if(playable)player.position.set(playable.spawn.x,terrainHeight(playable.spawn.x,playable.spawn.z)+playable.spawn.y+.02,playable.spawn.z);
let audio:AudioController|null=null;
// AUD-V2: the valley uses the V2 catalogue (static files loaded on demand); playable maps may still carry V1 audio (migrated in memory).
try{
  const {parseAnyAudioDefinition,toAudioCatalog,mergeAudioCatalogs}=await import('./audio/migrate.ts');
  const baseAudio=await fetch(import.meta.env.BASE_URL+'audio/catalog.json').catch(()=>null);
  const builtin=baseAudio?.ok?parseAnyAudioDefinition(await baseAudio.json()):undefined;
  let definition=playable?.audio;
  // Keep authored audio and supplement global boost cues without overriding world assets.
  if(definition&&builtin)definition=mergeAudioCatalogs(toAudioCatalog(definition),toAudioCatalog(builtin));
  else definition??=builtin;
  if(definition){const {createAudioController}=await import('./audio/view.ts');audio=createAudioController(definition,{baseUrl:import.meta.env.BASE_URL});}
 }catch{console.warn('Audio indisponible : le jeu reste silencieux.');}
const {createGroundProbe}=await import('./audio/world-probe.ts'),groundProbe=createGroundProbe();
let gameplay:GameplayView|null=null;
if(playable){
  const {createGameplayView}=await import('./gameplay/game-view.ts');
  gameplay=createGameplayView(playable.gameplay,{onSound:(id,p)=>audio?.playSound(id,p),collisions:playable.collisions,temporary:!!(studioTest||buildScope),saveScope:studioTest?.snapshotId??buildScope??undefined,getPosition:()=>({x:player.position.x,y:player.position.y,z:player.position.z}),objects:world.objects,showInfo,
    activities:playable.activities,getSpace:()=>player.space,
    getGas:()=>gasLevel(player),
    getGasProgress:()=>structuredClone(flightProgress),
    setGasProgress:value=>{flightProgress=value;player.gasCapacityLevel=value.capacityLevel;player.gasPowerLevel=value.powerLevel;player.gasControlLevel=value.controlLevel;},
    setGas:value=>{player.gasReserve=value;player.gasBoosting=false;player.gasPulseClock=0;player.gasPulseSeq=0;player.gasThrust=0;player.gasPulseRemaining=0;player.gasCooldown=0;player.gasBoostHeld=false;player.gasRepeatArmed=false;},
    ...(isLegacyTerrain()?{}:{gathering:{ctx:geoContext,seed:definition.config.seed,inside:(x:number,z:number)=>Math.abs(x)<=(definition.config.width??200)/2&&Math.abs(z)<=(definition.config.length??600)/2}}),
    setPosition:(p,space)=>{player.space=space??undefined;player.position.set(p.x,p.y,p.z);player.velocity.set(0,0,0);player.mode='air';player.oxygen=MAX_OXYGEN;player.glideReady=false;player.coyoteLeft=0;player.jumpBufferLeft=0;aboard=false;keySet.clear();jumpQueue=0;actionQueue=0;npcs.dialogue.close();previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);updateCamera(1);}
  });
  if(metricsEnabled){const g=gameplay;Object.assign(window,{littleWorldDebug:{/** Developer/test hook (metrics mode only): give items. */grant:(itemId:string,quantity:number)=>g.runtime.grantItems([{itemId,quantity}]),
    /** Developer/test hook: move the player on the ground and turn the camera (heading in rad). */
    teleport:(x:number,z:number,heading:number,altitude=0)=>{player.space=undefined;player.mode=altitude>0?'air':'ground';player.glideReady=altitude>0;player.coyoteLeft=0;player.jumpBufferLeft=0;player.velocity.set(0,0,0);player.position.set(x,terrainHeight(x,z)+altitude,z);previousPlayerPosition.copy(player.position);yaw=heading;},
    /** Developer/test hook: natural dressing and placed objects drawn within r m of the player. */
    drawnNear:(r:number)=>world.drawnNear(player.position.x,player.position.z,r)}});}
  if(gameplay.gathering){const gather=gameplay.gathering;world.setDressingFilter((cx,cz,kind,index)=>gather.hiddenAt(cx,cz,kind,index));gather.subscribe(()=>world.redrawDressing());}
}
const npcs = createNPCSystem(scene, definition.npcs,isLegacyTerrain()?undefined:[],gameplay?.dialogueSession);
npcs.setLighting(world.atlasIllumination);
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
// Geography sampled on demand after 2 m, not every simulation tick or render frame.
if(gameplay)gameplay.collision.setMaterialSampler(createMaterialSampler((x,z)=>classifyPoint(geoContext(),x,z).material));
const activityView=gameplay&&(gameplay.activities.mines.size||gameplay.activities.farms.size)?(await import('./activity-view.ts')).createActivityView(scene,gameplay.activities,terrainHeight):null;
if(activityView&&!searchParams.has('lightBench'))world.refreshLights([...(definition.lights??[]),...activityView.lights]);
let activityQueue=0,cropQueue=0,strikeTimer=0;
world.update(0, player.position);
{
  const {createGameUi}=await import('./ui/app/game-ui.ts'),c=getTerrainConfig();
  const landmarks=[
    ...definition.biomes.filter(b=>b.biome==='village').slice(0,30).map((b,i)=>({id:'village:'+i,label:'Village',x:b.x,z:b.z})),
    ...definition.placements.filter(p=>/(lighthouse|harbor|port|market|inn|windmill|watermill|town|village)/i.test(p.assetId)).slice(0,50).map(p=>({
      id:'asset:'+p.id,label:/lighthouse/i.test(p.assetId)?'Phare':/(port|harbor)/i.test(p.assetId)?'Port':/inn/i.test(p.assetId)?'Auberge':/market/i.test(p.assetId)?'Marché':/windmill|watermill/i.test(p.assetId)?'Moulin':'Village',x:p.x,z:p.z,
    })),
  ];
  gameUi=createGameUi({gameplay,npcs,audio,focusGameplay:()=>{
    if(!started||!overlay.classList.contains('hide')||customization.isOpen||npcs.dialogue.isOpen)return false;
    renderer.domElement.focus({preventScroll:true});
    return document.activeElement===renderer.domElement;
  },environmentControls:environment.controls,environment:()=>{const state=climate.state(worldClock.time);return {weather:state.weather,dayPhase:state.dayPhase};},landmarks,applyDistantRendering:(value,initial)=>{if(!initial||!searchParams.has('impostors')){world.hybrid.setMode(value==='hybrid'?'trees':'off');if(value==='hybrid')world.hybrid.setSectors(false);}},quality:document.querySelector<HTMLSelectElement>('#quality'),temporary:!!(studioTest||buildScope),studioUrl:import.meta.env.BASE_URL+'studio/',
    world:{name:definition.name,buildVersion:gameplay?.runtime.data.buildVersion??'vallée',dayLength:climate.definition.dayLengthSeconds,bounds:{minX:-c.width/2,maxX:c.width/2,minZ:-c.length/2,maxZ:c.length/2},seaLevel:c.seaLevel,height:terrainHeight,water:waterSurface},
    eatFood:(itemId)=>{
      const points=foodGasValue(itemId);
      if(!gameplay||!points)return {ok:false,message:'Cet objet ne peut pas être mangé.'};
      if(player.mode!=='ground'||aboard)return {ok:false,message:'Mangez au sol avant de décoller.'};
      if(gasLevel(player)>=gasCapacity(player))return {ok:false,message:'La réserve de gaz est déjà pleine.'};
      if(!gameplay.purse.apply([{itemId,quantity:-1}]))return {ok:false,message:'Aliment indisponible.'};
      const gained=refillGas(player,points);
      return {ok:true,message:'+'+Math.round(gained)+' gaz !'};
    },
    player:()=>({gas:gasLevel(player),maxGas:gasCapacity(player),gasShots:gasShots(player),gasMaxShots:gasMaxShots(player),gasCooldown:player.gasCooldown??0,x:player.position.x,y:player.position.y,z:player.position.z,yaw,space:player.space,mode:player.mode,oxygen:player.oxygen,maxOxygen:MAX_OXYGEN,stamina:player.stamina??MAX_STAMINA,maxStamina:MAX_STAMINA,speed:player.velocity.length(),stalled:player.stalled}),
    target:()=>currentTarget(),
    home:()=>{started=false;mobileTouch?.setEnabled(false);mobileLandscape?.stop();gameUi?.controller.close();keySet.clear();overlay.classList.remove('hide');start.focus();}});
}
// The player is the hamster (doc 43); NPCs keep their own rigs.
const character = buildHamster();
scene.add(character.group);
const impacts = createImpactEffects(scene);
const gasEffects=createGasEffects(scene);const gasOrigin=new THREE.Vector3();let gasVisualSeq=0,boostWindActive=false;
const customization = createCustomizationMenu(
  document.querySelector<HTMLElement>('#appearance-menu')!,
  (appearance) => character.setAppearance(appearance),
);
let boat = spawnBoat();
if(!isLegacyTerrain()){
  // Generated worlds have no hard-coded harbour: moor the boat in the first deep water seaward of the start.
  for(let d=6;d<600;d+=3){const x=player.position.x,z=player.position.z+d;if(waterDepth(x,z)>1.4){boat.x=x;boat.z=z;boat.y=getTerrainConfig().seaLevel-.15;break;}}
}
let aboard = false;
world.boat.position.set(boat.x, boat.y, boat.z);
// Fleet: the player's boat first, then every boat moored in the ports (board any of them with E).
const fleet = createFleet(gameplay?.collision ?? null);
const playerBoat = fleet.add({ id: 'player-boat', assetId: 'boat.sailboat_small', state: boat, object: world.boat, yOffset: 0, hull: { beam: 2.6, length: 6.2, height: 1.6 } });
for (const m of mooredBoats) { const size = worldAsset(m.assetId)?.size ?? [2, 1.3, 5]; fleet.addMoored(m.id, m.assetId, m.object, waterSurface(m.object.position.x, m.object.position.z) ?? getTerrainConfig().seaLevel, size as [number, number, number]); }
const keySet = new Set<string>();
let rollQueue = 0;
let jumpQueue = 0,
  touchStrokeQueue = 0,
  actionQueue = 0;
let yaw = 0,
  pitch = 0.32,
  distance = 8;
let started = false;
let elapsed = 0;
// Mobile controls contribute directly to the existing deterministic player input.
if(touchCapable){
  mobileTouch=createTouchControls({jump:()=>{if(aboard)actionQueue++;else if(player.mode==='swim'||player.mode==='dive')touchStrokeQueue=1;else jumpQueue++;},action:()=>{actionQueue++;},alternate:()=>{if(player.mode==='ground'||player.mode==='roll')rollQueue++;else if(player.mode==='swim'||player.mode==='dive')jumpQueue++;}});
  const intro=overlay.querySelector<HTMLElement>('.start-card small');if(intro)intro.textContent='Téléphone : paysage conseillé · joystick gauche · Saut et Accélération à droite';
  // Restore touch controls immediately after the player accepts portrait or rotates back.
  // Do not wait for a simulation tick: that tick may still be paused by the orientation guide.
  mobileLandscape=createMobileLandscape(blocked=>{
    mobileTouch?.setEnabled(!blocked&&started&&!gameUi?.blocking&&!customization.isOpen&&!npcs.dialogue.isOpen);
  });
}
// Generated worlds start on a coast: face the island centre rather than the open sea.
if(playable&&!isLegacyTerrain()){const yawParam=Number(searchParams.get('yaw'));yaw=searchParams.has('yaw')&&Number.isFinite(yawParam)?yawParam:Math.atan2(-player.position.x,-player.position.z);}
// Reproducible control viewpoints (World Production captures): camera pitch and distance.
{const p=Number(searchParams.get('pitch')),d=Number(searchParams.get('dist'));if(searchParams.has('pitch')&&Number.isFinite(p))pitch=Math.max(-.3,Math.min(1.4,p));if(searchParams.has('dist')&&Number.isFinite(d))distance=Math.max(2,Math.min(600,d));}
const previousPlayerPosition = player.position.clone(),
  renderPosition = player.position.clone();
let presentedFrames = 0;
let lastPresented: number | null = null;
let pendingSimulationMs=0;
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
  if (customization.isOpen || npcs.dialogue.isOpen || gameUi?.blocking){
    return {
      forward: 0,
      right: 0,
      run: false,
      jumpPressed: false,
      spaceHeld: false,
      dive: false,
      cameraYaw: yaw,
      boostHeld:false,
      swimStrokePressed:false,
    };
  }
  // In mobile glide, joystick deflection changes camera yaw/pitch, not forward/brake.
  const mobileGliding=!!mobileTouch&&player.mode==='glide';
  const shiftHeld=codeHeld('ShiftLeft','ShiftRight'),touchAccelerateHeld=!!mobileTouch?.accelerateHeld;
  return {
    forward: clamp(
      Number(codeHeld('KeyW', 'KeyZ', 'ArrowUp')) - Number(codeHeld('KeyS', 'ArrowDown')) + (mobileGliding?0:mobileTouch?.axis.forward??0),-1,1),
    right: clamp(
      Number(codeHeld('KeyD', 'ArrowRight')) - Number(codeHeld('KeyA', 'KeyQ', 'ArrowLeft')) - (mobileGliding?0:mobileTouch?.axis.right??0),-1,1),
    run:shiftHeld||touchAccelerateHeld,
    autoRun: true,
    jumpAssist: true,
    jumpPressed: jumpQueue > 0,
    rollPressed: rollQueue > 0,
    rollHeld:shiftHeld,
    spaceHeld: codeHeld('Space')||!!mobileTouch?.jumpHeld,
    dive: codeHeld('ControlLeft', 'ControlRight'),
    cameraYaw: yaw,
    // Underwater, moving forward follows the camera tilt (looking down dives down), from the default view.
    cameraPitch: pitch - 0.32,
    boostHeld:flightBoostHeld(player.mode,shiftHeld,touchAccelerateHeld),
    swimStrokePressed:touchStrokeQueue>0,
  };
}
function gameplayInputActive():boolean{
  return started&&!gameUi?.blocking&&!customization.isOpen&&!npcs.dialogue.isOpen&&!mobileLandscape?.blocked;
}
function isMenuKey(e: KeyboardEvent): boolean {
  return e.key.toLowerCase() === 'a' && !e.altKey && !e.ctrlKey && !e.metaKey;
}
const orbitDrag = new MouseDragOrbit();
function resetCameraDrag(): void {
  orbitDrag.cancel();
  renderer.domElement.classList.remove('dragging-camera');
}
function clearGameplayInput():void{
  keySet.clear();
  rollQueue=0;jumpQueue=0;touchStrokeQueue=0;actionQueue=0;activityQueue=0;cropQueue=0;
  mobileTouch?.reset();resetCameraDrag();
}
// Switching to any UI panel releases held movement and boost keys immediately.
gameUi?.controller.onChange(id=>{if(id)clearGameplayInput();});
window.addEventListener('keydown', (e) => {
  // Player interface first: panels, Escape (menu), I / J / M. Consumed keys never reach the game.
  if(gameUi?.handleKey(e,started&&!customization.isOpen))return;
  if(gameUi?.blocking||isEditableGameTarget(e.target)||!started||mobileLandscape?.blocked)return;
  // Space remains the gameplay action even if a HUD button still has focus.
  // Enter and arrow-key navigation on focused controls stay available.
  if(e.target instanceof Element&&e.target.closest('button,summary,a')&&['Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
  // Read the typed character: AZERTY 'A' is physically KeyQ, QWERTY 'A' is KeyA.
  if (isMenuKey(e)) {
    e.preventDefault();
    if (started) {
      customization.open();
      clearGameplayInput();
    }
    return;
  }
  if (e.code === 'Escape') npcs.dialogue.close();
  if (npcs.dialogue.isOpen) return;
  if (customization.isOpen) return;
  if(shouldPreventGameplayKeyDefault(e.code,gameplayInputActive(),false))e.preventDefault();
  if (e.repeat) return;
  keySet.add(e.code);
  if (e.code === 'Space') jumpQueue++;
  if (e.code === 'KeyX') rollQueue++;
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
    touchStrokeQueue=0;
    player.gasReserve=GAS.initial;player.gasBoosting=false;player.gasPulseClock=0;player.gasPulseSeq=0;player.gasThrust=0;
    player.gasPulseRemaining=0;player.gasCooldown=0;player.gasBoostHeld=false;player.gasRepeatArmed=false;gasVisualSeq=0;
    player.coyoteLeft=0;player.jumpBufferLeft=0;
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
    player.coyoteLeft=0;player.jumpBufferLeft=0;
    previousPlayerPosition.copy(player.position);
    renderPosition.copy(player.position);
    updateCamera(1);
    showInfo('Port : approchez du bateau et appuyez sur E');
  }
});
window.addEventListener('keyup', (e) => {
  if(shouldPreventGameplayKeyDefault(e.code,gameplayInputActive(),isEditableGameTarget(e.target)))e.preventDefault();
  if (e.key.toLowerCase() === 'a') customization.close();
  keySet.delete(e.code);
});
window.addEventListener('blur', () => {
  clearGameplayInput();
  customization.close();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)clearGameplayInput();});
// The whole running game is non-editable except form fields: overlays may live outside #app.
// Firefox deliberately shows its native context menu for Shift+right-click even when
// contextmenu is cancelled; avoid binding the right button to a gameplay action.
document.addEventListener('contextmenu',e=>{
  if(shouldSuppressGameplayContextMenu(started,isEditableGameTarget(e.target)))e.preventDefault();
},{capture:true});
// Also cancel the ordinary secondary-button default at pointer/auxclick stage.
// Do not stop propagation, so existing HUD and browser text-entry semantics remain intact.
document.addEventListener('pointerdown',e=>{
  if(e.button===2&&shouldSuppressGameplayContextMenu(started,isEditableGameTarget(e.target)))e.preventDefault();
},{capture:true});
document.addEventListener('auxclick',e=>{
  if(e.button===2&&shouldSuppressGameplayContextMenu(started,isEditableGameTarget(e.target)))e.preventDefault();
},{capture:true});
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (!started || customization.isOpen || gameUi?.blocking || npcs.dialogue.isOpen) return;
  renderer.domElement.focus({preventScroll:true});
  if(e.button===2){e.preventDefault();return;}
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
  // Touch drag rotates the camera toward the finger. Preserve desktop mouse orbit.
  yaw += movement.dx * 0.00315 * k * (touchCapable?1:-1);
  pitch = clamp(pitch - movement.dy * 0.0024 * k * (prefs?.invertY ? -1 : 1), player.mode==='glide'?-.45:-.12, player.mode==='glide'?1.3:1.03);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  // Right-button release must not cancel an active left-button camera drag.
  if(e.button!==0)return;
  orbitDrag.end(e.pointerId);
  if (!orbitDrag.active) resetCameraDrag();
});
renderer.domElement.addEventListener('pointercancel',resetCameraDrag);
renderer.domElement.addEventListener('lostpointercapture', resetCameraDrag);
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    distance = clamp(distance + Math.sign(e.deltaY) * 1.0, 4, 22);
  },
  { passive: true },
);
start.addEventListener('click', () => {
  started = true;
  void audio?.start();
  overlay.classList.add('hide');
  gameUi?.started();
  mobileLandscape?.start();
  mobileTouch?.setEnabled(!mobileLandscape?.blocked);
  renderer.domElement.focus();
});
/** Messages from gameplay effects and actions go through the single notification manager. */
function showInfo(text: string, kind:'info'|'success'|'warning'='info') {
  gameUi?.notify(kind,text);
}
const cameraTarget = new THREE.Vector3(),
  cameraDesired = new THREE.Vector3(),audioForward=new THREE.Vector3();
function updateCamera(dt: number) {
  const effects=gameUi?.preferences.speedEffects!==false&&!gameUi?.preferences.reduceMotion;
  advanceSpeedCamera(speedCue,{speed:player.velocity.length(),mode:player.mode,boosting:!!player.gasBoosting,turnRate:player.glideTurnRate??0,enabled:effects},dt);
  const target = cameraTarget.copy(renderPosition);
  target.y += aboard ? 2.9 : 1.35;
  const followDistance=distance+speedCue.extraDistance;
  const cosPitch = Math.cos(pitch);
  const x = target.x - Math.sin(yaw) * cosPitch * followDistance;
  const z = target.z - Math.cos(yaw) * cosPitch * followDistance;
  let y = Math.max(
    target.y + Math.sin(pitch) * followDistance,
    terrainHeight(x, z) + 1.8,
  );
  const desired = cameraDesired.set(x, y, z);
  // In a gallery: stay inside the open cells and under the ceiling, never above the relief.
  if(player.space&&gameplay){const inside=gameplay.activities.cameraInMine(target,player.space,yaw,pitch,distance);if(inside){desired.set(inside.x,inside.y,inside.z);camera.position.copy(desired);camera.lookAt(target);return;}}
  camera.position.lerp(desired, Math.min(1, dt * 6));
  camera.lookAt(target);
  camera.rotateZ(speedCue.bank);
  if(Math.abs(camera.fov-speedCue.fov)>.005){camera.fov=speedCue.fov;camera.updateProjectionMatrix();}
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
/** Sound/effect of the next tool impact: played on the animation event (impact/grab), so that
 * what is heard and seen matches the swing; flushed at once when no animation can play. */
let pendingImpact:{sound:string;kind:ImpactKind;context?:Record<string,unknown>;extra?:string[];count?:number}|null=null;
/** Nearest dry ground or dock deck within reach of a boat (generated worlds): the collision floor
 * (terrain + dock colliders) above the water line, no higher than a step out of the boat. */
function dryLanding(b:{x:number;y:number;z:number;heading:number}):{x:number;y:number;z:number}|null{
  const c=gameplay?.collision,sea=b.y+.15;let best:{x:number;y:number;z:number}|null=null,bd=Infinity;
  for(let r=2;r<=7;r+=.5)for(let k=0;k<24;k++){const a=k/24*Math.PI*2,x=b.x+Math.sin(a)*r,z=b.z+Math.cos(a)*r;
    const floor=c?c.surfaceAt({x,y:sea+2.6,z},undefined,.3,{fromY:sea+2.6}).floorY:terrainHeight(x,z),water=waterSurface(x,z);
    if(floor<sea+.1||floor>sea+2.4||(water!==null&&water>floor+.05))continue;if(r<bd){bd=r;best={x,y:floor,z};}}
  return best;
}
/** Visible meshes of an object (metrics: the hamster draws ONE skinned mesh + its ground shadow). */
function visibleMeshCount(root:THREE.Object3D){let n=0;root.traverseVisible(o=>{if((o as THREE.Mesh).isMesh||(o as THREE.Line).isLine)n++;});return n;}
function onImpact(i:NonNullable<typeof pendingImpact>){flushImpact();pendingImpact=i;}
function flushImpact(at?:{x:number;y:number;z:number}){
  const i=pendingImpact;if(!i)return;pendingImpact=null;const position=at??player.position;
  for(const id of [i.sound,...(i.extra??[])])audio?.emit(id,{...(i.context?{context:i.context}:{}),position,source:'player'});
  if(at)impacts.spawn(at,i.kind,i.count??7);
}
character.onEvent((e)=>{
  if(e.name==='impact'||e.name==='grab')flushImpact(e.position);
  else if(e.name==='release'){audio?.emit('fishing.cast',{position:player.position,source:'player'});setTimeout(()=>audio?.emit('fishing.float',{position:player.position,source:'player'}),450);}
  else if(e.name==='reel')audio?.emit('fishing.reel',{position:player.position,source:'player'});
  else if(e.name==='roll-start')audio?.emit('player.roll.start',{position:player.position,source:'player'});
  else if(e.name==='roll-stop')audio?.emit('player.roll.stop',{position:player.position,source:'player'});
  else if(e.name==='equip'||e.name==='unequip')audio?.emit('tool.equip',{position:player.position,source:'player'});
  else if(e.name==='pour')impacts.spawn(e.position,'water',5);
});
function runGather(){
  if(!gameplay?.gathering)return;const r=gameplay.gathering.act(player.position,forwardOf());
  if(!r.ok){showInfo(r.message,'warning');audio?.emit('ui.error',{source:'ui'});return;}
  if(!r.done)showInfo(r.message);
  // The animation carries the sound and the chips (impact / grab events), not the key press.
  const fell=r.target?.rule.action==='fell';onImpact(fell?{sound:'tool.chop',kind:'wood'}:{sound:'farm.pick',kind:'leaf',count:3});
  if(!character.play(fell?'fell':'pick'))flushImpact();
}
/** Fishing: cast (E), wait for the bite, strike (E) in time. */
function runFishing(){
  if(!gameplay)return;const f=gameplay.fishing,now=elapsed;
  if(f.state.phase==='idle'){const spot=fishingSpot();if(!spot)return;if(!gameplay.has('tool:fishing-rod')){showInfo('Il faut une canne à pêche','warning');return;}character.play('fish-cast');f.cast(spot.kind,spot,now);showInfo('Ligne lancée… attendez que ça morde.');return;}
  const biting=f.state.phase==='bite',fish=f.strike();character.play('fish-reel');if(!fish){showInfo(biting?'Raté !':'Ligne relevée (trop tôt).','warning');return;}
  if(!gameplay.runtime.grantItems([{itemId:fish,quantity:1}]))showInfo('Sac plein','warning');
}
function updateFishing(){
  if(!gameplay)return;const f=gameplay.fishing;if(f.state.phase==='idle')return;
  if(f.state.castAt&&(Math.hypot(f.state.castAt.x-player.position.x,f.state.castAt.z-player.position.z)>8||player.mode!=='ground')){f.cancel();showInfo('Ligne relevée.');return;}
  const r=f.update(elapsed);if(r==='bite'){showInfo('Ça mord ! Appuyez sur E','success');audio?.emit('fishing.bite',{position:player.position,source:'player'});}else if(r==='lost')showInfo('Le poisson s’est échappé…','warning');
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
    ()=>fleet.nearest(player.position.x,player.position.y,player.position.z)?boatTarget(false):null,
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
  const tool=gameplay.has('tool:pickaxe-steel')?'pickaxe-steel':gameplay.has('tool:pickaxe')?'pickaxe':null;
  onImpact({sound:'mine.tool.strike',context,kind:target?.material===5?'crystal':target?.material===4?'iron':material==='soil'?'soil':'stone',extra:r.ok?['mine.hit']:[]});
  if(!character.play('mine',tool))flushImpact();
  if(r.ok){audio?.emit('mine.cell.excavated',{context,position:player.position,source:'player'});
    // A reward is announced by the inventory notification (« +1 Pierre », merged); otherwise say what happened.
    if(r.message.startsWith('+')/* dig() reports a reward as « +1 item » */){audio?.emit(material==='crystal'?'mine.resource.crystal':'mine.resource.collect',{context,source:'player'});if(material==='crystal')audio?.cue('discovery');}else showInfo(r.message,'success');}
  else{audio?.emit('mine.action.denied',{context,source:'player'});showInfo(r.message,'warning');}
}
/** Next action on the plot under the player (F, or E when it is the target): validated by AGRI. */
function runFarm(){
  if(!gameplay)return;const a=gameplay.activities,plot=a.farmNear(player.position);if(!plot)return;
  const intent=a.farmIntent(plot.zone.id),view=a.farmView(plot.zone.id),crop=view?.cropId??view?.selectedCrop,r=a.farmAct(plot.zone.id);
  if(r.ok)character.play('farm-'+intent.type);
  // A harvest is announced by the inventory gain notification (one message per event).
  if(!(r.ok&&intent.type==='harvest'))showInfo(r.message,r.ok?'success':'warning');
  const farmEvent={plant:'farm.plant',water:'farm.water',harvest:'farm.harvest',clear:'farm.clear'}[intent.type]??'farm.plant';audio?.emit(r.ok?farmEvent:'ui.error',{context:{place:'farm',activity:'farming',objectKind:crop??undefined,state:intent.type},position:player.position,source:'player'});
}
function updateHud() {
  if(document.body.classList.contains('developer')){
    const speed=Math.round(player.velocity.length()*3.6);
    const label='Vitesse : '+speed+' km/h';
    if(devSpeed.textContent!==label)devSpeed.textContent=label;
  }
  // A submerged hamster does not imply a submerged camera.
  document.body.classList.toggle('underwater',cameraSubmerged(camera.position.x,camera.position.y,camera.position.z));
}
let boatSteer=0,motionTick=0,nextTouchTargetAt=0,lastFlightPulseSeq=0;
function tick(dt: number) {
  // Mobile input: immediately release controls when a menu opens or the boost stops being valid.
  mobileTouch?.setEnabled(started&&!gameUi?.blocking&&!customization.isOpen&&!npcs.dialogue.isOpen&&!mobileLandscape?.blocked);
  mobileTouch?.setMode(player.mode,aboard,gasShots(player)>0);
  // Interaction may change without changing movement mode. Throttle target queries
  // to 8 Hz; the action itself still resolves the target again when pressed.
  if(mobileTouch&&elapsed>=nextTouchTargetAt){
    const target=aboard?null:currentTarget();
    mobileTouch.setInteractTarget(target?.primaryAction??null);
    nextTouchTargetAt=elapsed+.125;
  }
  // Menus (pause, parties, paramètres) pause the world simulation; the frame still renders.
  if (!started || gameUi?.paused||mobileLandscape?.blocked) return;
  if(gameplay)gameplay.update(dt);else worldClock.advance(dt);
  // Glide camera steering from the left thumb leaves the right thumb free for boost/jump.
  if(mobileTouch&&player.mode==='glide'&&!gameUi?.blocking&&!customization.isOpen&&!npcs.dialogue.isOpen){
    // Match mobile right/left direction with the on-screen touch controls.
    yaw-=mobileTouch.axis.right*1.2*dt;
    pitch=clamp(pitch-mobileTouch.axis.forward*.95*dt,-.45,1.3);
  }
  const keys = input();
  if (aboard) {
    updateBoat(boat, { throttle: mobileTouch?.accelerateHeld?Math.max(1,keys.forward):keys.forward, steer: keys.right }, dt);boatSteer=keys.right;
    player.position.set(boat.x, boat.y + 1.02, boat.z);
    player.velocity.set(0, 0, 0);
    player.mode = 'ground';
    jumpQueue = 0;
  } else {
    gameplay?.trees?.update(player.position,player.space);
    simulatePlayer(player, keys, dt,gameplay?.collision);motionTick++;
    const seq=player.gasPulseSeq??0;
    const newPulse=seq!==lastFlightPulseSeq&&seq>0;
    lastFlightPulseSeq=seq;
    const unlock=advanceFlight(flightProgress,{gliding:player.mode==='glide',distance:player.position.distanceTo(previousPlayerPosition),speed:player.velocity.length(),pulse:newPulse,time:elapsed});
    player.gasCapacityLevel=flightProgress.capacityLevel;player.gasPowerLevel=flightProgress.powerLevel;player.gasControlLevel=flightProgress.controlLevel;
    if(unlock)showInfo(unlock,'success');
    // Crossing a mine entrance / stairs: no interpolation through rock.
    if(player.transitioned){previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);}
    if (keys.jumpPressed) jumpQueue = Math.max(0, jumpQueue - 1);
    if(keys.swimStrokePressed)touchStrokeQueue=0;
    rollQueue = 0;
  }
  // F: activity in front (dig, fell/pick, farm). Holding F repeats strikes (≈ 3.5 per second).
  if(gameplay&&!aboard&&keySet.has('KeyF')){strikeTimer-=dt;if(strikeTimer<=0){strikeTimer=.28;activityQueue=Math.max(activityQueue,1);}}else strikeTimer=0;
  if(activityQueue>0&&gameplay&&!aboard&&player.mode!=='roll'){activityQueue=0;if(player.space)runDig();else if(gameplay.activities.farmNear(player.position))runFarm();else runGather();}
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
      aboard = false;fleet.leave();
      const dock = isLegacyTerrain() ? null : dryLanding(boat);
      if (isLegacyTerrain() && nearDock(boat)) {
        player.position.set(BOAT_DOCK.x + 1, getTerrainConfig().seaLevel + 1.3, BOAT_DOCK.z + 3);
        player.mode = 'air';
      } else if (dock) {
        // A dock or the shore within reach: step onto it.
        player.position.set(dock.x, dock.y + .05, dock.z);
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
      if (gameplay?.interact(player.position)) {showInfo('Interaction effectuée.', 'success');character.play('interact');}
    } else if (target?.targetType === 'npc') {
      if (npcs.interact(player.position)) {
        character.play('talk');
        audio?.emit('npc.vocalize',{context:{species:'squirrel'},position:player.position});
        keySet.clear();
        jumpQueue = 0;
        player.velocity.set(0, 0, 0);
        resetCameraDrag();
      }
    } else if (target?.targetType === 'boat') {
      const ride = fleet.nearest(player.position.x, player.position.y, player.position.z);
      if (ride) { boat = ride.state; fleet.board(ride); }
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
const perfSampler=new PerfSampler(),gpuTimer=createGpuTimer(renderer,metricsEnabled);
const actorCount=Number(searchParams.get('remoteActors')??0);
const remoteActors=[10,50,100].includes(actorCount)?createActorSimulator(scene,actorCount,player.position,terrainHeight,world.isOccluded):null;
remoteActors?.renderer.setLighting(world.atlasIllumination);
const grassActors:import('./render/grass.ts').GrassActor[]=[];
world.setGrassActors(grassActors);
function draw(now: number) {
  const frame = presentation.advance(now, !document.hidden);
  const simulationBegin = performance.now();
  for (let i = 0; i < frame.steps; i++) {
    previousPlayerPosition.copy(player.position);
    tick(clockDt);
    elapsed += clockDt;
    remoteActors?.tick(elapsed);
    if (previousPlayerPosition.distanceToSquared(player.position) > 100)
      previousPlayerPosition.copy(player.position);
  }
  pendingSimulationMs += performance.now() - simulationBegin;
  if (!frame.render) {
    requestAnimationFrame(draw);
    return;
  }
  const simulationMs=pendingSimulationMs;pendingSimulationMs=0;
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
  // Finalize the current view before LOD/culling and lighting consume it.
  updateCamera(delta);
  speedStreaks.update(player.velocity.length(),player.mode==='glide',started&&!gameUi?.paused&&gameUi?.preferences.speedEffects!==false&&!gameUi?.preferences.reduceMotion,delta);
  environment.update(delta,player.position,budget.level,!!player.space);
  activityView?.update(delta,player.position,player.space);
  {const climateNow=climate.state(worldClock.time),night=nightFactor(climateNow.sunAltitude);world.lights.setEnvironment(night,now/1000);world.setNight(night);world.setWind(.25+.8*climateNow.wind);}
  world.animateBoat(aboard&&fleet.current===playerBoat?boat.speed:0,aboard&&fleet.current===playerBoat?boatSteer:0,delta);
  if(started&&audio){const env=climate.state(worldClock.time),ground=player.space?{}:groundProbe(player.position.x,player.position.z,now),farm=!player.space&&gameplay?.activities.farmNear(player.position);
    audio.update(now,{nowMs:now,player:{position:player.position,velocity:player.velocity,mode:player.mode,aboard,boatSpeed:Math.abs(boat.speed),space:player.space??null,surface:player.space?'stone':aboard?'wood':ground.surface},
      world:{time:env.sunAltitude<0?'night':'day',weather:env.weather,wind:env.wind,biome:ground.biome,place:farm?'farm':ground.place,activity:farm?'farming':undefined,submerged:cameraSubmerged(camera.position.x,camera.position.y,camera.position.z),nearWater:waterSurface(player.position.x,player.position.z)!==null||(isLegacyTerrain()&&Math.abs(player.position.x-riverX(player.position.z))<16)}},
      id=>gameplay?.runtime.getEntityPosition(id),budget.level,camera.getWorldDirection(audioForward));}
  grassActors.length=0;
  for(const state of npcs.states)if(Math.hypot(state.x-player.position.x,state.z-player.position.z)<44)grassActors.push(state);
  remoteActors?.renderer.collectGrassActors(grassActors,player.position);
  world.update(delta, player.position, camera, renderer.domElement.height, player.velocity);
  if(!loading.ready)loading.update({terrainPending:world.stats.pending,dressingPending:world.dressing?.nearPending??0,speciesState:world.dressing?.species.state??'none'});
  remoteActors?.update(delta,elapsed,camera,renderer.domElement.height,budget.level);
  npcs.update(delta, elapsed, player.position,camera); // The river drives the mill: no manual on/off control.
  // Boats follow their state (the one in use moves; the player's own boat bobs at its mooring).
  playerBoat&&fleet.sync(playerBoat,elapsed);if(fleet.current&&fleet.current!==playerBoat)fleet.sync(fleet.current,elapsed);
  character.group.position.copy(renderPosition);
  character.setAboard(aboard);
  if(gameplay){const f=gameplay.fishing.state;character.setFishing(f.phase!=='idle'&&f.castAt?{x:f.castAt.x,y:waterSurface(f.castAt.x,f.castAt.z)??getTerrainConfig().seaLevel,z:f.castAt.z,biting:f.phase==='bite'}:null);}
  character.update(player, delta, elapsed);
  // Hero-only pose overlay. Does not change the authoritative rig animation,
  // procedural GLB, other players or distant impostor hashes.
  if(player.mode==='glide'&&player.gasBoosting){
    const joints=character.rig.joints;
    joints.HamsterBody.scale.y*=.95+Math.sin(elapsed*30)*.012;
    joints.HamsterBody.rotation.x-=.07;
    joints.Head.rotation.x+=.055;
    joints.EarLeft.rotation.z-=.13;
    joints.EarRight.rotation.z+=.13;
    joints.Tail.rotation.x+=.2;
  }
  if(started&&player.gasPulseSeq!==gasVisualSeq){
    character.rig.joints.Tail.getWorldPosition(gasOrigin);
    gasEffects.spawn(gasOrigin,player.velocity,6,flightProgress.selectedSkin);
    // Exactly one sound and VFX per accepted simulation pulse, not per key or frame.
    audio?.emit('player.boost.pulse',{position:player.position,source:'player',context:{state:flightProgress.selectedSound,intensity:player.velocity.length()>35?'heavy':'medium'}});
    if(flightProgress.currentCombo>=3)audio?.emit('player.boost.combo',{source:'player'});
  }
  gasVisualSeq=player.gasPulseSeq??0;
  const flightFast=started&&player.mode==='glide'&&player.velocity.length()>40;
  if(flightFast&&!boostWindActive){audio?.emit('player.boost.wind',{source:'player'});boostWindActive=true;}
  else if(!flightFast&&player.velocity.length()<30)boostWindActive=false;
  gasEffects.update(delta);
  impacts.update(delta);
  updateHud();
  gameUi?.frame(elapsed);
  fpsTime += wallDrawDelta;
  frameCount++;
  const renderBegin = performance.now();
  gpuTimer.begin();
  renderer.render(scene, camera);
  gpuTimer.end();
  const renderSubmitMs = performance.now() - renderBegin;
  if(metricsEnabled)perfSampler.record(wallDrawDelta*1000,simulationMs,renderBegin-begin,renderSubmitMs);
  if (metricsEnabled)
    Object.assign(window, {
      littleWorldMetrics: {
        frameId: ++presentedFrames,
        framebuffer:{width:renderer.domElement.width,height:renderer.domElement.height,pixelRatio:renderer.getPixelRatio()},
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        chunks: { ...world.stats },
        cliffs: { ...world.cliffs.stats },
        hybrid:world.hybrid.stats,
        remoteActors:remoteActors?.stats??null,
        perf:presentedFrames%30===0?perfSampler.snapshot():(window as unknown as {littleWorldMetrics?:{perf:unknown}}).littleWorldMetrics?.perf,
        gpu:{...gpuTimer.stats},
        horizon: { ...world.horizon },
        terrainWork: { ...world.terrainWork },
        dressing: world.dressing ? { ...world.dressing } : null,
        grass: world.grass ? { ...world.grass } : null,
        inventory: gameplay ? { ...gameplay.runtime.state.inventory } : null,
        target: currentTarget()?.primaryAction?.label ?? null,
        targetId: currentTarget()?.targetId ?? null,
        placed: { ...world.placed.stats },
        objectCulling:{...world.objectCulling},
        animated: { ...world.animated },
        occlusion: world.occlusion,
        boatModel: world.boat.getObjectByName('Sailboat') ? 'sailboat' : 'procedural',
        boatPosition: [boat.x, boat.y, boat.z],
        boats: { count: fleet.boats.length, aboard, current: fleet.current?.id ?? null },
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
        mode: player.mode,
        movement:captureMovement(player,motionTick),velocity:player.velocity.toArray(),flight:{heading:player.glideHeading,pitch:player.glidePitch,turnRate:player.glideTurnRate,stalled:player.stalled},
        swim: { water: player.space ? null : waterSurface(player.position.x, player.position.z), diving: !!player.diving, oxygen: player.oxygen, pitch },
        character: { state: character.animationState, action: character.action, tool: character.tool, fishingLine: !!character.group.getObjectByName('FishingLine')?.visible, meshes: visibleMeshCount(character.group) },
        stamina: player.stamina ?? MAX_STAMINA,
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
    const heap=(performance as Performance & {memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize;
    devMemory.textContent=heap===undefined?'Mémoire : non disponible':'Mémoire : '+(heap/1048576).toFixed(1)+' Mio';
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
window.addEventListener('pagehide',event=>{if(event.persisted)void audio?.engine.setHidden(true);else {remoteActors?.dispose();gasEffects.dispose();speedStreaks.dispose();gpuTimer.dispose();void audio?.dispose();}});
window.addEventListener('pageshow',event=>{if(event.persisted&&started)void audio?.engine.setHidden(document.hidden);});
document.addEventListener('visibilitychange', () => {
  presentation.reset();
  lastPresented = null;pendingSimulationMs=0;
  fpsTime = 0;
  frameCount = 0;
  keySet.clear();
  mobileTouch?.reset();
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
overlay.setAttribute('aria-busy','false');loading.boot(1);
requestAnimationFrame(draw);
