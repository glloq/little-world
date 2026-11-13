import * as THREE from 'three';
import {
  FrameClock,
  PresentationBudget,
  presentationPixelRatio,
} from './frame-clock';
import './style.css';
import type {PlayableWorld,StudioPlaytest} from './gameplay/playable.ts';
import {WorldClock} from './environment/clock.ts';
import {createClimate,defaultEnvironment} from './environment/climate.ts';
import type {GameplayView} from './gameplay/game-view.ts';
import { addPlacement, buildWorld, configureScene } from './world';
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
});
applyQuality();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
viewport.appendChild(renderer.domElement);
const searchParams = new URLSearchParams(window.location.search);
const isPreview = searchParams.get('preview') === '1',
  metricsEnabled = searchParams.has('metrics');
let definition = defaultWorld();
let playable:PlayableWorld|null=null,studioTest:StudioPlaytest|null=null;
if(searchParams.has('studioPreview')||searchParams.get('beta')==='1'){
  try{
    const {loadPlaytest,parsePlayableWorld}=await import('./gameplay/playable.ts');
    if(searchParams.has('studioPreview')){studioTest=loadPlaytest(searchParams.get('studioPreview')!);playable=studioTest.content;}
    else{const response=await fetch(import.meta.env.BASE_URL+'maps/beta.json');if(!response.ok)throw Error('Monde bêta indisponible');playable=parsePlayableWorld(await response.json());}
    definition=playable.world;
  }catch(error){overlay.querySelector('h1')!.textContent='Impossible d’ouvrir cette partie';overlay.querySelector('p')!.textContent=String(error);start.disabled=true;throw error;}
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
for (const item of definition.placements) addPlacement(world, item);
scene.add(world.root);
const player = spawnPlayer();
if(playable)player.position.set(playable.spawn.x,terrainHeight(playable.spawn.x,playable.spawn.z)+playable.spawn.y+.02,playable.spawn.z);
let gameplay:GameplayView|null=null;
if(playable){
  const {createGameplayView}=await import('./gameplay/game-view.ts');
  gameplay=createGameplayView(playable.gameplay,{collisions:playable.collisions,temporary:!!studioTest,saveScope:studioTest?.snapshotId,getPosition:()=>({x:player.position.x,y:player.position.y,z:player.position.z}),objects:world.objects,showInfo,
    setPosition:p=>{player.position.set(p.x,p.y,p.z);player.velocity.set(0,0,0);player.mode='air';player.oxygen=MAX_OXYGEN;player.glideReady=false;aboard=false;keySet.clear();jumpQueue=0;actionQueue=0;npcs.dialogue.close();previousPlayerPosition.copy(player.position);renderPosition.copy(player.position);updateCamera(1);}
  });
}
const npcs = createNPCSystem(scene, definition.npcs,undefined,gameplay?.dialogueSession);
gameplay?.attachNPCs(npcs.states);
const worldClock=gameplay?.runtime.clock??new WorldClock(),climate=gameplay?.runtime.climate??createClimate(defaultEnvironment(definition.config.seed));
const {createEnvironmentView}=await import('./environment/view.ts');
const environment=createEnvironmentView(scene,lighting,worldClock,climate);
world.update(0, player.position);
const squirrel = buildSquirrel();
scene.add(squirrel.group);
const customization = createCustomizationMenu(
  document.querySelector<HTMLElement>('#appearance-menu')!,
  (appearance) => squirrel.setAppearance(appearance),
);
const boat = spawnBoat();
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
  if (e.code === 'KeyR' && started) {
    const reset = spawnPlayer();
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
  if (e.code === 'KeyP' && started) {
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
  overlay.classList.add('hide');
});
function showInfo(text: string) {
  infoUntil = elapsed + 3.3;
  message.textContent = text;
  message.classList.remove('hide');
}
const cameraTarget = new THREE.Vector3(),
  cameraDesired = new THREE.Vector3();
function updateCamera(dt: number) {
  const target = cameraTarget.copy(renderPosition);
  target.y += aboard ? 2.9 : 1.85;
  const cosPitch = Math.cos(pitch);
  const x = target.x - Math.sin(yaw) * cosPitch * distance;
  const z = target.z - Math.cos(yaw) * cosPitch * distance;
  const y = Math.max(
    target.y + Math.sin(pitch) * distance,
    terrainHeight(x, z) + 1.8,
  );
  const desired = cameraDesired.set(x, y, z);
  camera.position.lerp(desired, Math.min(1, dt * 6));
  camera.lookAt(target);
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
  const npcPrompt = !aboard ? (gameplay?.prompt(player.position) ?? npcs.prompt(player.position)) : null;
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
    if (keys.jumpPressed) jumpQueue = Math.max(0, jumpQueue - 1);
  }
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
  environment.update(delta,player.position,budget.level);
  world.update(delta, player.position);
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
        environment:environment.metrics,
        collisions:gameplay?.collision.stats??null,
        position: player.position.toArray(),
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
    world.setDetail(budget.level);
    applyQuality();
  }
  requestAnimationFrame(draw);
}
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
requestAnimationFrame(draw);
