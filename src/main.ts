import * as THREE from 'three';
import './style.css';
import { addPlacement, buildWorld, configureScene, type AssetId, type Placement, type WorldConfig } from './world';
import catalogue from '../assets/catalog.json';
import { buildSquirrel, MAX_OXYGEN, simulatePlayer, spawnPlayer, type Controls } from './player';
import { cameraSubmerged, clamp, terrainHeight } from './terrain';
import { nearBoat, nearDock, spawnBoat, updateBoat, waterDisembarkPoint, BOAT_DOCK } from './boat';

const viewport=document.querySelector<HTMLElement>('#viewport')!;
const status=document.querySelector<HTMLElement>('#status')!;
const coords=document.querySelector<HTMLElement>('#coords')!;
const fps=document.querySelector<HTMLElement>('#fps')!;
const renderMetrics=document.querySelector<HTMLElement>('#render-metrics')!;
const oxygen=document.querySelector<HTMLElement>('#oxygen')!;
const action=document.querySelector<HTMLElement>('#action')!;
const message=document.querySelector<HTMLElement>('#message')!;
const overlay=document.querySelector<HTMLElement>('#start-overlay')!;
const start=document.querySelector<HTMLButtonElement>('#start')!;
const scene=new THREE.Scene();
configureScene(scene);
const camera=new THREE.PerspectiveCamera(66,1,.1,750);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
const quality=document.querySelector<HTMLSelectElement>('#quality')!;
const qualityRatios={low:1,medium:1.35,high:2} as const;
type RenderQuality=keyof typeof qualityRatios;
const remembered=(()=>{try{return localStorage.getItem('little-world-quality')}catch{return null}})();
if(remembered && remembered in qualityRatios)quality.value=remembered;
function applyQuality(){
  const mode=quality.value as RenderQuality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,qualityRatios[mode] ?? 1.35));
  resize();
}
quality.addEventListener('change',()=>{
  try{localStorage.setItem('little-world-quality',quality.value)}catch{/* optional */}
  applyQuality();
});
applyQuality();
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
viewport.appendChild(renderer.domElement);
const isPreview=new URLSearchParams(window.location.search).get('preview')==='1';
let worldConfig:WorldConfig={seed:1284,density:1};
let previewPlacements:Placement[]=[];
if(isPreview){
  try{
    const raw=sessionStorage.getItem('little-world-preview');
    const d:unknown=raw?JSON.parse(raw):null;
    if(d && typeof d==='object'){
      const draft=d as {schemaVersion?:number;config?:WorldConfig;placements?:Placement[]};
      const validAssets=new Set(catalogue.assets.map(a=>a.id));
      if(draft.schemaVersion===1 && draft.config && Number.isInteger(draft.config.seed) &&
        draft.config.seed>=1 && draft.config.seed<=9999999 &&
        Number.isFinite(draft.config.density) && draft.config.density>=0 &&
        draft.config.density<=2 && Array.isArray(draft.placements) &&
        draft.placements.length<=2000 &&
        draft.placements.every(p=>typeof p.x==='number'&&typeof p.z==='number'&&
          Number.isFinite(p.x)&&Number.isFinite(p.z)&&Number.isFinite(p.rotation)&&
          validAssets.has(p.assetId as AssetId))){
        worldConfig=draft.config;
        previewPlacements=draft.placements;
        const subtitle=document.querySelector<HTMLElement>('.brand small');
        if(subtitle)subtitle.textContent='Prévisualisation locale de l’éditeur';
      }
    }
  }catch(e){console.warn('Prévisualisation invalide : carte par défaut utilisée',e);}
}
const world=buildWorld(worldConfig);
for(const item of previewPlacements)addPlacement(world,item);
scene.add(world.root);
const player=spawnPlayer();
const squirrel=buildSquirrel();
scene.add(squirrel.group);
const boat=spawnBoat();
let aboard=false;
world.boat.position.set(boat.x,boat.y,boat.z);
const keySet=new Set<string>();
let jumpQueue=0,actionQueue=0;
let yaw=0,pitch=.32,distance=13.8;
let started=false;
let infoUntil=0;
let last=performance.now(),accumulator=0,elapsed=0;
let frameCount=0,fpsTime=0;
const clockDt=1/60;

function resize(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  renderer.setSize(w,h,false);
  camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();
}
window.addEventListener('resize',resize);
resize();
function codeHeld(...codes:string[]):boolean{return codes.some(c=>keySet.has(c));}
function input():Controls{
  return {
    forward:Number(codeHeld('KeyW','KeyZ','ArrowUp'))-Number(codeHeld('KeyS','ArrowDown')),
    right:Number(codeHeld('KeyD','ArrowRight'))-Number(codeHeld('KeyA','KeyQ','ArrowLeft')),
    run:codeHeld('ShiftLeft','ShiftRight'),
    jumpPressed:jumpQueue>0,spaceHeld:codeHeld('Space'),
    dive:codeHeld('ControlLeft','ControlRight'),
    cameraYaw:yaw
  };
}
window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  keySet.add(e.code);
  if(e.code==='Space')jumpQueue++;
  if(e.code==='KeyE')actionQueue++;
  if(e.code==='KeyR'&&started){
    const reset=spawnPlayer();player.position.copy(reset.position);player.velocity.set(0,0,0);
    aboard=false;player.mode='ground';player.oxygen=MAX_OXYGEN;player.glideReady=false;
    updateCamera(1); // Snap camera across long-distance debug teleports.
    showInfo('Retour au point de départ');
  }
  // Prototype navigation shortcut: reach the harbor without walking the full 600 m.
  if(e.code==='KeyP'&&started){
    aboard=false;player.position.set(-23,1.35,217);player.velocity.set(0,0,0);
    player.mode='air';player.glideReady=false;
    updateCamera(1);
    showInfo('Port : approchez du bateau et appuyez sur E');
  }
});
window.addEventListener('keyup',e=>keySet.delete(e.code));
window.addEventListener('blur',()=>{keySet.clear();jumpQueue=0;});
window.addEventListener('mousemove',e=>{
  if(document.pointerLockElement===renderer.domElement){
    yaw-=e.movementX*.00235;
    pitch=clamp(pitch-e.movementY*.00185,-.12,1.03);
  }
});
renderer.domElement.addEventListener('click',()=>{
  if(started&&document.pointerLockElement!==renderer.domElement)void renderer.domElement.requestPointerLock();
});
renderer.domElement.addEventListener('wheel',e=>{
  distance=clamp(distance+Math.sign(e.deltaY)*1.0,7,25);
},{passive:true});
start.addEventListener('click',()=>{
  started=true;
  overlay.classList.add('hide');
  void renderer.domElement.requestPointerLock();
});
function showInfo(text:string){
  infoUntil=elapsed+3.3;message.textContent=text;message.classList.remove('hide');
}
function updateCamera(dt:number){
  const target=player.position.clone().add(new THREE.Vector3(0,aboard?2.9:1.85,0));
  const cosPitch=Math.cos(pitch);
  const x=target.x-Math.sin(yaw)*cosPitch*distance;
  const z=target.z-Math.cos(yaw)*cosPitch*distance;
  const y=Math.max(target.y+Math.sin(pitch)*distance,terrainHeight(x,z)+1.8);
  const desired=new THREE.Vector3(x,y,z);
  camera.position.lerp(desired,Math.min(1,dt*6));
  camera.lookAt(target);
}
function updateHud(){
  const labels:Record<string,string>={ground:'Au sol',air:'En l’air',glide:'En planage',swim:'Nage',dive:'Plongée'};
  status.textContent=aboard?'Navigation en bateau':labels[player.mode];
  coords.textContent=`X ${player.position.x.toFixed(0)} m · Z ${player.position.z.toFixed(0)} m · H ${player.position.y.toFixed(1)} m`;
  oxygen.textContent=`Oxygène : ${Math.round(player.oxygen)} / ${MAX_OXYGEN} s`;
  oxygen.classList.toggle('hide',player.mode!=='dive'&&player.mode!=='swim');
  const canBoard=!aboard&&nearBoat(boat,player.position.x,player.position.y,player.position.z);
  action.classList.toggle('hide',!canBoard&&!aboard);
  action.textContent=aboard?'[E] Quitter le bateau · Z/S avancer/reculer · Q/D tourner':canBoard?'[E] Embarquer dans le bateau':'';
  if(elapsed>=infoUntil)message.classList.add('hide');
  // A submerged squirrel does NOT imply a submerged camera.
  document.body.classList.toggle('underwater',cameraSubmerged(camera.position.x,camera.position.y,camera.position.z));
}
function tick(dt:number){
  if(!started)return;
  const keys=input();
  if(aboard){
    updateBoat(boat,{throttle:keys.forward,steer:keys.right},dt);
    player.position.set(boat.x,boat.y+1.02,boat.z);
    player.velocity.set(0,0,0);
    player.mode='ground';
    jumpQueue=0;
  } else {
    simulatePlayer(player,keys,dt);
    if(keys.jumpPressed)jumpQueue=Math.max(0,jumpQueue-1);
  }
  if(actionQueue>0){
    if(aboard){
      aboard=false;
      if(nearDock(boat)){
        player.position.set(BOAT_DOCK.x+1,1.3,BOAT_DOCK.z+3);
        player.mode='air';
      } else {
        const exit=waterDisembarkPoint(boat);
        player.position.set(exit.x,exit.y,exit.z);
        player.mode='swim';
      }
      player.velocity.set(0,0,0);player.glideReady=false;
      showInfo('Vous avez quitté le bateau');
    }else if(nearBoat(boat,player.position.x,player.position.y,player.position.z)){
      aboard=true;
      player.velocity.set(0,0,0);player.glideReady=false;
      player.position.set(boat.x,boat.y+1.02,boat.z);
      showInfo('Bateau : Z/S pour naviguer, Q/D pour tourner, E pour descendre');
    }
    actionQueue=0;
  }
}
function draw(now:number){
  const delta=Math.min((now-last)/1000,.06);last=now;elapsed+=delta;
  accumulator+=delta;
  let iterations=0;
  while(accumulator>=clockDt&&iterations++<5){
    tick(clockDt);
    accumulator-=clockDt;
  }
  if(iterations>=5)accumulator=0;
  world.update(delta); // The river drives the mill: no manual on/off control.
  world.boat.position.set(boat.x,boat.y+Math.sin(elapsed*1.7)*.055,boat.z);
  world.boat.rotation.y=boat.heading;
  squirrel.group.position.copy(player.position);
  squirrel.update(player,delta,elapsed);
  updateCamera(delta);
  updateHud();
  fpsTime+=delta;frameCount++;
  renderer.render(scene,camera);
  if(fpsTime>=.8){
    fps.textContent=`FPS : ${Math.round(frameCount/fpsTime)}`;
    renderMetrics.textContent=`Rendu : ${renderer.info.render.calls} appels · ${Math.round(renderer.info.render.triangles/1000)}k triangles`;
    fpsTime=0;frameCount=0;
  }
  requestAnimationFrame(draw);
}
camera.position.set(player.position.x,player.position.y+13,player.position.z-24);
camera.lookAt(player.position);
requestAnimationFrame(draw);
