import {MINE_MATERIALS} from './mine/mine-data.ts';
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
const action = document.querySelector<HTMLElement>('#action')!;
const message = document.querySelector<HTMLElement>('#message')!;
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
for (const item of definition.placements) addPlacement(world, item);
scene.add(world.root);
const player = spawnPlayer();
if(playable)player.position.set(playable.spawn.x,terrainHeight(playable.spawn.x,playable.spawn.z)+playable.spawn.y+.02,playable.spawn.z);
let audio:AudioController|null=null;
try{const {parseAudioDefinition}=await import('./audio/schema.ts');let definition=playable?.audio;if(!playable){const response=await fetch(import.meta.env.BASE_URL+'audio/default.json');if(response.ok)definition=parseAudioDefinition(await response.json());}if(definition){const {createAudioController}=await import('./audio/view.ts');audio=createAudioController(definition);}}catch{console.warn('Audio indisponible : le jeu reste silencieux.');}
let gameplay:GameplayView|null=null;
if(playable){
  const {createGameplayView}=await import('./gameplay/game-view.ts');
  gameplay=createGameplayView(playable.gameplay,{onSound:(id,p)=>audio?.playSound(id,p),collisions:playable.collisions,temporary:!!(studioTest||buildScope),saveScope:studioTest?.snapshotId??buildScope??undefined,getPosition:()=>({x:player.position.x,y:player.position.y,z:player.position.z}),objects:world.objects,showInfo,
    activities:playable.activities,getSpace:()=>player.space,
    setPosition:(p,space)=>{player.space=space??undefined;player.position.set(p.x,p.y,p.z);player.velocity.set(0,0,0);player.mode='air';player.oxygen=MAX_OXYGEN;player.glideReady=false;aboard=false;keySet.clear();jumpQueue=0;actionQueue=0;npcs.dialogue.close();previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);updateCamera(1);}
  });
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
let activityQueue=0,cropQueue=0;
world.update(0, player.position);
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
let infoUntil = 0;
let elapsed = 0;
// Generated worlds start on a coast: face the island centre rather than the open sea.
if(playable&&!isLegacyTerrain()){const yawParam=Number(searchParams.get('yaw'));yaw=searchParams.has('yaw')&&Number.isFinite(yawParam)?yawParam:Math.atan2(-player.position.x,-player.position.z);}
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
  if (customization.isOpen || npcs.dialogue.isOpen || gameplay?.isOpen)
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
  if(e.target instanceof Element&&e.target.closest('button,summary,a')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
  if(gameplay?.isOpen||e.target instanceof HTMLInputElement||e.target instanceof HTMLTextAreaElement||e.target instanceof HTMLSelectElement)return;
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
  if (e.code === 'KeyF') activityQueue++;
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
  if (!started || customization.isOpen || gameplay?.isOpen || npcs.dialogue.isOpen) return;
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
  yaw -= movement.dx * 0.00315;
  pitch = clamp(pitch - movement.dy * 0.0024, -0.12, 1.03);
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
  renderer.domElement.focus();
});
function showInfo(text: string) {
  infoUntil = elapsed + 3.3;
  message.textContent = text;
  message.classList.remove('hide');
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
/** F / C prompts of mines and farm plots (evaluated on consultation, not per plant). */
let lastActivityPrompt=0,activityText:string|null=null;
function activityPrompt():string|null{
  if(!gameplay)return null;if(elapsed-lastActivityPrompt<.25)return activityText;lastActivityPrompt=elapsed;const a=gameplay.activities;
  if(player.space){const t=a.mineTarget(player.position,player.space,{x:Math.sin(yaw),z:Math.cos(yaw)});activityText=t?`[F] Creuser : ${MINE_MATERIALS[t.material].name}`:null;return activityText;}
  const plot=a.farmNear(player.position);if(!plot){activityText=null;return null;}const intent=a.farmIntent(plot.zone.id);
  activityText=`${plot.zone.name} · [F] ${intent.label}${intent.type==='plant'?' · [C] changer de culture':''}`;return activityText;
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
  const canBoard =
    !aboard &&
    nearBoat(boat, player.position.x, player.position.y, player.position.z);
  const npcPrompt = !aboard ? (gameplay?.prompt(player.position) ?? npcs.prompt(player.position) ?? activityPrompt()) : null;
  action.classList.toggle('hide', !canBoard && !aboard && !npcPrompt);
  action.textContent =
    npcPrompt ??
    (aboard
      ? '[E] Quitter le bateau · Z/S avancer/reculer · Q/D tourner'
      : canBoard
        ? '[E] Embarquer dans le bateau'
        : '');
  if (elapsed >= infoUntil) message.classList.add('hide');
  // A submerged squirrel does NOT imply a submerged camera.
  document.body.classList.toggle(
    'underwater',
    cameraSubmerged(camera.position.x, camera.position.y, camera.position.z),
  );
}
function tick(dt: number) {
  if (!started) return;
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
  if(activityQueue>0&&gameplay&&!aboard){activityQueue=0;const a=gameplay.activities;
    if(player.space){const r=a.dig(player.position,player.space,{x:Math.sin(yaw),z:Math.cos(yaw)});showInfo(r.message);}
    else{const plot=a.farmNear(player.position);if(plot)showInfo(a.farmAct(plot.zone.id).message);}}
  if(cropQueue>0&&gameplay){cropQueue=0;const plot=gameplay.activities.farmNear(player.position,player.space);if(plot){const name=gameplay.activities.cycleCrop(plot.zone.id);if(name)showInfo('Culture choisie : '+name);}}
  if (actionQueue > 0) {
    if (aboard) {
      aboard = false;
      if (nearDock(boat)) {
        player.position.set(
          BOAT_DOCK.x + 1,
          getTerrainConfig().seaLevel + 1.3,
          BOAT_DOCK.z + 3,
        );
        player.mode = 'air';
      } else {
        const exit = waterDisembarkPoint(boat);
        player.position.set(exit.x, exit.y, exit.z);
        player.mode = 'swim';
      }
      player.velocity.set(0, 0, 0);
      player.glideReady = false;
      showInfo('Vous avez quitté le bateau');
    } else if (gameplay?.interact(player.position)) {
      showInfo('Interaction effectuée.');
    } else if (npcs.interact(player.position)) {
      keySet.clear();
      jumpQueue = 0;
      player.velocity.set(0, 0, 0);
      resetCameraDrag();
    } else if (
      nearBoat(boat, player.position.x, player.position.y, player.position.z)
    ) {
      aboard = true;
      player.velocity.set(0, 0, 0);
      player.glideReady = false;
      player.position.set(boat.x, boat.y + 1.02, boat.z);
      showInfo(
        'Bateau : Z/S pour naviguer, Q/D pour tourner, E pour descendre',
      );
    }
    actionQueue = 0;
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
  if(started&&audio){const env=climate.state(worldClock.time);audio.update(now,player.position,id=>gameplay?.runtime.getEntityPosition(id),{night:env.sunAltitude<0,rain:env.weather==='rain',water:waterSurface(player.position.x,player.position.z)!==null||(isLegacyTerrain()&&Math.abs(player.position.x-riverX(player.position.z))<16)},budget.level,player.mode==='ground'&&!aboard&&player.velocity.lengthSq()>.1,camera.getWorldDirection(audioForward));}
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
