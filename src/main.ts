import * as THREE from 'three';
import './style.css';
import { buildWorld, configureScene } from './world';
import { buildSquirrel, MAX_OXYGEN, simulatePlayer, spawnPlayer, type Controls } from './player';
import { clamp, terrainHeight } from './terrain';

const viewport=document.querySelector<HTMLElement>('#viewport')!;
const status=document.querySelector<HTMLElement>('#status')!;
const coords=document.querySelector<HTMLElement>('#coords')!;
const fps=document.querySelector<HTMLElement>('#fps')!;
const oxygen=document.querySelector<HTMLElement>('#oxygen')!;
const action=document.querySelector<HTMLElement>('#action')!;
const message=document.querySelector<HTMLElement>('#message')!;
const overlay=document.querySelector<HTMLElement>('#start-overlay')!;
const start=document.querySelector<HTMLButtonElement>('#start')!;
const scene=new THREE.Scene();
configureScene(scene);
const camera=new THREE.PerspectiveCamera(66,1,.1,750);
const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.75));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.1;
viewport.appendChild(renderer.domElement);
const world=buildWorld({seed:1284,density:1});
scene.add(world.root);
const player=spawnPlayer();
const squirrel=buildSquirrel();
scene.add(squirrel.group);
const keySet=new Set<string>();
let jumpQueue=0,actionQueue=0;
let yaw=0,pitch=.32,distance=13.8;
let started=false,wheelOn=true;
let infoUntil=0,infoText='';
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
    player.mode='ground';player.oxygen=MAX_OXYGEN;player.glideReady=false;
    showInfo('Retour au point de départ');
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
  infoText=text;infoUntil=elapsed+3.3;message.textContent=text;message.classList.remove('hide');
}
function updateCamera(dt:number){
  const target=player.position.clone().add(new THREE.Vector3(0,1.85,0));
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
  status.textContent=labels[player.mode];
  coords.textContent=`X ${player.position.x.toFixed(0)} m · Z ${player.position.z.toFixed(0)} m · H ${player.position.y.toFixed(1)} m`;
  oxygen.textContent=`Oxygène : ${Math.round(player.oxygen)} / ${MAX_OXYGEN} s`;
  oxygen.classList.toggle('hide',player.mode!=='dive'&&player.mode!=='swim');
  const nearMill=player.position.distanceTo(world.millPosition)<15;
  action.classList.toggle('hide',!nearMill);
  action.textContent=nearMill?`[E] ${wheelOn?'Arrêter':'Démarrer'} la roue du moulin`:'';
  if(elapsed>=infoUntil)message.classList.add('hide');
  document.body.classList.toggle('underwater',player.mode==='dive');
}
function tick(dt:number){
  if(!started)return;
  const keys=input();
  simulatePlayer(player,keys,dt);
  if(keys.jumpPressed)jumpQueue=Math.max(0,jumpQueue-1);
  if(actionQueue>0){
    if(player.position.distanceTo(world.millPosition)<15){
      wheelOn=!wheelOn;showInfo(wheelOn?'La roue tourne de nouveau':'Roue du moulin arrêtée');
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
  if(wheelOn)world.update(delta);
  squirrel.group.position.copy(player.position);
  squirrel.update(player,delta,elapsed);
  updateCamera(delta);
  updateHud();
  fpsTime+=delta;frameCount++;
  if(fpsTime>=.8){fps.textContent=`FPS : ${Math.round(frameCount/fpsTime)}`;fpsTime=0;frameCount=0;}
  renderer.render(scene,camera);
  requestAnimationFrame(draw);
}
camera.position.set(player.position.x,player.position.y+13,player.position.z-24);
camera.lookAt(player.position);
requestAnimationFrame(draw);
