/** Lightweight, opt-in hamster motion calibration view for Studio.
 * The preview runs the same procedural rig/animator as the game but never drives physics,
 * edits a project, or installs a second rendering loop in the game viewport.
 * No network, GLB loader, texture requests or extra dependencies. */
import * as THREE from 'three';
import {buildHamster} from '../hamster/hamster.ts';
import type {Player,MotionMode} from '../player.ts';
import {node,button,field,select,numberInput} from './dom.ts';

const PRESETS=[
  ['idle','Repos'],['walk','Marche bipède'],['run','Course bipède'],
  ['turn','Demi-tour debout'],['roll','Roulade'],['skid','Roulade / dérapage'],
  ['roll-jump','Saut en boule / reprise'],['jump','Saut lancé / réception'],
  ['glide','Plané'],['glide-land','Plané / réception'],
  ['slope','Appuis sur pente'],['step','Pied sur une marche'],
] as const;

export function mountHamsterMotionLab(host:HTMLElement):{dispose():void}{
  const root=node('section','','hamster-motion-lab'),
    controls=node('div','','hamster-motion-controls'),
    stage=node('div','','hamster-motion-stage'),
    info=node('p','Aperçu local de la pose : aucun changement sur le monde ni sur les sauvegardes.','muted'),
    status=node('p','Initialisation de la prévisualisation','muted');
  root.append(node('div','PERSONNAGE · ANIMATION','kicker'),node('h2','Laboratoire de mouvements du hamster'),
    node('p','Visualisez les transitions sur le même rig que le jeu. Les réglages sont purement visuels et non enregistrés.','muted'));
  const chosen=select('walk',PRESETS,()=>{elapsed=0;character.group.position.set(0,0,0);});
  const speed=numberInput(8,()=>{},0,18,'0.5');
  const impact=numberInput(10,()=>{},0,20,'0.5');
  const tilt=numberInput(12,()=>{},-35,35,'1');
  const slip=numberInput(.75,()=>{},-1,1,'0.05');
  controls.append(field('Séquence',chosen),field('Vitesse (m/s)',speed),
    field('Impact (m/s)',impact),field('Pente (°)',tilt),field('Dérapage (-1…1)',slip));
  let playing=true,elapsed=0,orbit=.55,disposed=false,frame=0,last=0,accum=0;
  const pause=button('Pause',()=>{playing=!playing;pause.textContent=playing?'Pause':'Reprendre';});
  const restart=button('Recommencer',()=>{elapsed=0;});
  root.append(controls,stage,pause,restart,status,info);
  host.replaceChildren(root);

  const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'low-power',alpha:true});
  renderer.setPixelRatio(Math.min(1.25,window.devicePixelRatio||1));
  stage.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-label','Aperçu 3D du hamster');
  const scene=new THREE.Scene();
  scene.background=new THREE.Color(0xf4f5f7);
  scene.add(new THREE.HemisphereLight(0xffffff,0xb7a68e,2.4));
  const sunlight=new THREE.DirectionalLight(0xffffff,2.2);sunlight.position.set(-4,7,6);scene.add(sunlight);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshLambertMaterial({color:0xd8dbd2}));
  floor.rotation.x=-Math.PI/2;floor.position.y=-.015;scene.add(floor);
  const character=buildHamster();scene.add(character.group);
  const camera=new THREE.PerspectiveCamera(43,1,.1,80);
  const player:Player={position:new THREE.Vector3(),velocity:new THREE.Vector3(),mode:'ground',oxygen:90,glideReady:false};
  const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
  const numeric=(control:HTMLInputElement,fallback:number,min:number,max:number)=>clamp(Number.isFinite(control.valueAsNumber)?control.valueAsNumber:fallback,min,max);
  function resize(){
    const w=Math.max(280,Math.round(stage.clientWidth||600)),h=380;
    renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
  }
  resize();
  const observer=new ResizeObserver(resize);observer.observe(stage);
  let dragging=false,lastX=0;
  const canvas=renderer.domElement;
  canvas.style.touchAction='pan-y';
  canvas.onpointerdown=e=>{dragging=true;lastX=e.clientX;canvas.setPointerCapture(e.pointerId);};
  canvas.onpointermove=e=>{if(dragging){orbit+=clamp((e.clientX-lastX)*.01,-.25,.25);lastX=e.clientX;}};
  canvas.onpointerup=()=>{dragging=false;};
  canvas.onpointercancel=()=>{dragging=false;};

  function render(dt:number){
    const id=chosen.value,u=elapsed%3.2;
    const baseSpeed=numeric(speed,8,0,18),impactSpeed=numeric(impact,10,0,20);
    const slope=numeric(tilt,12,-35,35)*Math.PI/180;
    const skidding=numeric(slip,.75,-1,1);
    let mode:MotionMode='ground',horizontal=baseSpeed,vertical=0,height=0;
    let landingKind:Player['landingKind']=undefined,landingSlide=0,origin:Player['jumpOrigin']=undefined;
    player.intentYaw=undefined;
    player.footSupportLeft=undefined;player.footSupportRight=undefined;
    player.groundPitch=0;player.groundRoll=0;player.rollSlip=0;
    switch(id){
      case 'idle':horizontal=0;break;
      case 'walk':horizontal=Math.min(baseSpeed,4.65);break;
      case 'run':horizontal=Math.max(baseSpeed,6.5);break;
      case 'turn':horizontal=0;player.intentYaw=Math.sin(elapsed*1.8)*1.3;break;
      case 'roll':mode='roll';break;
      case 'skid':mode='roll';player.rollSlip=skidding;player.intentYaw=skidding*.65;break;
      case 'roll-jump':
        origin='roll';
        if(u<.65){mode='roll';}
        else if(u<1.8){mode='air';vertical=u<1.2?5:-4;height=.8+Math.sin((u-.65)/1.15*Math.PI)*.7;}
        else{mode='ground';landingKind='roll';landingSlide=Math.abs(skidding);horizontal=Math.min(baseSpeed,6);}
        break;
      case 'jump':
        origin='run';
        if(u<.6){mode='ground';}
        else if(u<1.8){mode='air';vertical=u<1.2?6:-6;height=Math.max(.04,Math.sin((u-.6)/1.2*Math.PI)*1.1);}
        else{mode='ground';landingKind='run';landingSlide=.6;horizontal=Math.min(baseSpeed,8);}
        break;
      case 'glide':mode='glide';vertical=-1.8;height=1.4;break;
      case 'glide-land':
        if(u<1.7){mode='glide';vertical=-2;height=1.3-u*.65;}
        else{mode='ground';landingKind='glide';landingSlide=.8;}
        break;
      case 'slope':horizontal=Math.min(baseSpeed,5);player.groundPitch=slope;player.groundRoll=slope*.4;break;
      case 'step':horizontal=Math.min(baseSpeed,3);player.footSupportLeft=-.22;player.footSupportRight=0;break;
    }
    player.mode=mode;player.jumpOrigin=origin;player.landingKind=landingKind;
    player.landingSlide=landingSlide;player.landingSpeed=impactSpeed;
    player.landingSeq=landingKind?Math.floor(elapsed/3.2)+1:Math.floor(elapsed/3.2);
    player.velocity.set(0,vertical,horizontal);
    // Physical displacement is simulated only as a visual reference for distance-synced gait.
    player.position.set(0,height,elapsed*horizontal*.33);
    character.group.position.copy(player.position);
    character.update(player,dt,elapsed);
    const targetZ=player.position.z;
    camera.position.set(Math.sin(orbit)*3.3,2.3,Math.cos(orbit)*3.3+targetZ);
    camera.lookAt(0,1+height*.35,targetZ);
    renderer.render(scene,camera);
    status.textContent='État : '+character.animationState+' · '+horizontal.toFixed(1)+' m/s · rendu limité à 30 FPS';
  }
  function loop(now:number){
    if(disposed)return;
    frame=requestAnimationFrame(loop);
    const dt=last?Math.min((now-last)/1000,.1):1/30;last=now;accum+=dt;
    if(accum<1/30)return;
    const step=Math.min(.1,accum);accum=0;
    if(playing)elapsed+=step;
    if(!document.hidden)render(playing?step:0);
  }
  frame=requestAnimationFrame(loop);
  return {dispose(){
    if(disposed)return;disposed=true;cancelAnimationFrame(frame);observer.disconnect();
    canvas.onpointerdown=null;canvas.onpointermove=null;canvas.onpointerup=null;canvas.onpointercancel=null;
    character.dispose();floor.geometry.dispose();(floor.material as THREE.Material).dispose();
    renderer.dispose();renderer.domElement.remove();
  }};
}
