import {createImpostorSectors} from './render/impostor-sectors.ts';
import {getTerrainConfig} from './terrain.ts';
import * as THREE from 'three';
import { buildSquirrel, CHARACTER_SCALE } from './squirrel.ts';
import { buildHamster } from './hamster/hamster.ts';
import {visualNPCSpecies} from './npc-life/species.ts';
import {residentGesture,shouldPlayResidentGesture} from './npc-life/gestures.ts';
import { createDialogue, type DialogueSession } from './dialogue.ts';
import {
  createNPCState,
  DEFAULT_NPCS,
  DEFAULT_NPC_OBSTACLES,
  updateNPC,
  canNPCWalk,
  npcActivity,
  npcVisualTier,
  npcInterpolationAlpha,
  validateNPCs,
  type NPCDefinition,
  type NPCPoint,
  type NPCState,
  type NavigationObstacle,
} from './npc.ts';
import type { Player } from './player.ts';
import {terrainHeight} from './terrain.ts';
import {createResidentRouter,type ResidentPath,type ResidentWalkable} from './npc-life/routes.ts';
import {residentHour,residentShift,residentPoseAt,residentRoute,positionOnResidentRoute,type ResidentPose,type ResidentRoute} from './npc-life/schedule.ts';
import {residentDialogue,residentContextForHour} from './npc-life/dialogue.ts';
import './npc.css';

/** All DOM content is written as text, including author-provided names and dialogue. */
function createDialoguePanel(factory?:(state:NPCState)=>DialogueSession|undefined) {
  const root = document.createElement('section');
  root.className = 'npc-dialogue';
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Conversation');
  const name = document.createElement('h2'),
    line = document.createElement('p'),
    choices = document.createElement('div'),
    close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Fermer · Échap';
  close.className = 'npc-dialogue-close';
  root.append(name, line, choices, close);
  document.body.append(root);
  let session: DialogueSession | null = null,
    npc: NPCState | null = null,
    previousFocus: HTMLElement | null = null;
  function dismiss() {
    if (npc) npc.phase = 'idle';
    session?.close();
    session = null;
    npc = null;
    root.hidden = true;
    previousFocus?.focus();
  }
  function render() {
    if (!session || session.closed) {
      dismiss();
      return;
    }
    line.textContent = session.line.text;
    choices.replaceChildren();
    for (const [i, choice] of session.choices.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = choice.text;
      const hint = session.hint?.(i);
      if (hint) { const tag = document.createElement('span'); tag.className = 'npc-choice-hint'; tag.textContent = hint === 'mission' ? 'mission' : 'objet'; tag.setAttribute('aria-hidden', 'true'); button.setAttribute('aria-description', hint === 'mission' ? 'Ce choix concerne une mission' : 'Ce choix donne ou demande un objet'); button.append(' ', tag); }
      button.addEventListener('click', () => {
        session?.choose(i);
        render();
      });
      choices.append(button);
    }
    for (const locked of session.locked ?? []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.disabled = true;
      button.className = 'npc-choice-locked';
      button.textContent = locked.text + ' (pas encore possible)';
      choices.append(button);
    }
    if (!session.choices.length && !(session.locked ?? []).length) close.textContent = 'Terminer · Échap';
    else close.textContent = 'Fermer · Échap';
    (choices.querySelector<HTMLButtonElement>('button:not([disabled])') ?? close).focus();
  }
  close.addEventListener('click', dismiss);
  const onKey = (e: KeyboardEvent) => {
    if (!session) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      dismiss();
      return;
    }
    if (e.key === 'Tab') {
      const buttons = [...root.querySelectorAll('button')];
      const current = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        (current + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next].focus();
      e.preventDefault();
    }
  };
  window.addEventListener('keydown', onKey);
  return {
    open(state: NPCState) {
      const selected=factory?.(state)??(state.definition.dialogue?createDialogue(state.definition.dialogue,state.flags):null);
      if(!selected)return;
      dismiss();
      previousFocus = document.activeElement as HTMLElement | null;
      npc = state;
      npc.phase = 'talk';
      session = selected;
      name.textContent = state.definition.name;
      root.hidden = false;
      render();
    },
    get isOpen() {
      return session !== null;
    },
    get npcId() {
      return npc?.definition.id ?? null;
    },
    get emotion() {
      return session?.line.emotion;
    },
    close: dismiss,
    dispose() {
      dismiss();
      root.remove();
      window.removeEventListener('keydown', onKey);
    },
  };
}
export interface NPCLifeOptions {
  worldTime:()=>number;
  dayLengthSeconds:number;
  initialDayPhase:number;
  paths:readonly ResidentPath[];
  /** Reuse the active world's collision broadphase for short path segments. */
  walkable?:ResidentWalkable;
  weather?:()=> 'clear'|'cloudy'|'rain';
}
export function createNPCSystem(
  scene: THREE.Scene,
  definitions: readonly NPCDefinition[] = DEFAULT_NPCS,
  obstacles: readonly NavigationObstacle[] = DEFAULT_NPC_OBSTACLES,
  dialogueFactory?:(state:NPCState)=>DialogueSession|undefined,
  lifeOptions?:NPCLifeOptions,
) {
  const bounds=getTerrainConfig();
  if (!validateNPCs(definitions,bounds)) throw new Error('Liste de PNJ invalide');
  const walkable=(x:number,z:number,fx:number,fz:number)=>canNPCWalk(x,z,fx,fz,obstacles)&&(!lifeOptions?.walkable||lifeOptions.walkable(x,z,fx,fz));
  const router=lifeOptions&&definitions.some(d=>d.routine)
    ?createResidentRouter(lifeOptions.paths,walkable):null;
  const dialogue=createDialoguePanel(state=>{
    const base=dialogueFactory?.(state)??(state.definition.dialogue?createDialogue(state.definition.dialogue,state.flags):undefined);
    const routine=state.definition.routine;
    if(!routine||!lifeOptions)return base;
    return residentDialogue(base,routine.role,()=>{
      const hour=residentHour(lifeOptions.worldTime(),lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase);
      const context=residentContextForHour(routine.role,hour);
      if(state.phase==='walk'){
        const [,end]=residentShift(routine.role);
        return {...context,weather:lifeOptions.weather?.(),phase:hour>=end?'to-home' as const:'to-work' as const};
      }
      return {...context,weather:lifeOptions.weather?.()};
    });
  });
  let disposed = false;
  // Original five-part low-poly silhouette. GPU resources belong to this system,
  // are shared by every distant actor, and are disposed once when it is retired.
  const proxyGeometry = new THREE.IcosahedronGeometry(1, 0);
  const proxyFur = new THREE.MeshLambertMaterial({
    color: 0x9d654f,
    flatShading: true,
  });
  const proxyLight = new THREE.MeshLambertMaterial({
    color: 0xb77d64,
    flatShading: true,
  });
  function silhouette(definition: NPCDefinition) {
    const root = new THREE.Group();
    root.name = 'NPC silhouette:' + definition.id;
    const part = (
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
    ) => {
      const mesh = new THREE.Mesh(proxyGeometry, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      root.add(mesh);
    };
    part(proxyFur, 0, 0.72, 0, 0.49, 0.62, 0.41);
    part(proxyLight, 0, 1.45, 0.23, 0.55, 0.51, 0.46);
    part(proxyLight, 0.42, 1.35, -0.62, 0.46, 0.85, 0.4);
    part(proxyFur, -0.42, 1.98, 0.24, 0.2, 0.29, 0.15);
    part(proxyFur, 0.42, 1.98, 0.24, 0.2, 0.29, 0.15);
    root.scale.setScalar((definition.kind === 'animal' ? 0.58 : 1) * (definition.scale??1) * CHARACTER_SCALE);
    root.visible = false;
    scene.add(root);
    return root;
  }
  const distant=createImpostorSectors(scene,'characters'),white=new THREE.Color(0xffffff);
  if(new URLSearchParams(location.search).get('impostors')==='all')distant.setEnabled(true);
  const entries = definitions.map((sourceDefinition) => {
    const definition={...sourceDefinition,kind:visualNPCSpecies(sourceDefinition.kind)};
    const state = createNPCState(definition,bounds),
      route=definition.routine&&router?router.route(definition.routine.home,definition.routine.work):null,
      life=route?{route,pose:null as ResidentPose|null,lastTime:-1,lastSample:-1,pausedSeconds:0,pauseFrom:null as number|null}:null,
      proxy = silhouette(definition);
    // Actual character rigs are allocated only when first seen nearby, not for
    // every citizen of the island. All hamsters share geometry/material caches.
    const hamster:null|ReturnType<typeof buildHamster>=null,
      model:null|ReturnType<typeof buildSquirrel>|ReturnType<typeof buildHamster>=null;
    const head:THREE.Object3D|null=null,arm:THREE.Object3D|null=null;
    const player: Player = {
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      mode: 'ground',
      oxygen: 90,
      glideReady: false,
    };
    return {
      state,
      life,
      model,
      hamster,
      player,
      proxy,
      head,
      arm,
      appliedEmotion: definition.appearance.emotion,
      lastWorkAt:-1,
      lastGreetAt:-1,
      scripted:null as null|{route:ResidentRoute;startAt:number;pausedFor:number;pauseFrom:number|null;arrivedAt:number|null},
    };
  });
  function nearest(player: NPCPoint) {
    let best: (typeof entries)[number] | null = null,
      distance = 5.5;
    for (const entry of entries) {
      if (!entry.state.definition.dialogue&&!entry.state.definition.routine) continue;
      const d = Math.hypot(player.x - entry.state.x, player.z - entry.state.z);
      if (d < distance) {
        distance = d;
        best = entry;
      }
    }
    return best;
  }
  function moveTo(id:string,target:{x:number;y:number;z:number}):boolean{
    const entry=entries.find(e=>e.state.definition.id===id);
    if(!entry||!lifeOptions||!Number.isFinite(target.x)||!Number.isFinite(target.z))return false;
    const from={x:entry.state.x,z:entry.state.z},to={x:target.x,z:target.z};
    if(Math.hypot(to.x-from.x,to.z-from.z)<.25)return true;
    let route=router?.route(from,to)??null;
    if(!route&&Math.hypot(to.x-from.x,to.z-from.z)<24){
      const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z));
      let ok=true,last=from;
      for(let i=1;i<=steps;i++){
        const t=i/steps,p={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t};
        if(!walkable(p.x,p.z,last.x,last.z)){ok=false;break;}last=p;
      }
      if(ok)route=residentRoute([from,to]);
    }
    if(!route)return false;
    entry.scripted={route,startAt:lifeOptions.worldTime(),pausedFor:0,pauseFrom:null,arrivedAt:null};
    return true;
  }
  function talkTo(id:string,playerPosition:NPCPoint):boolean{
    const entry=entries.find(e=>e.state.definition.id===id);
    if(!entry||dialogue.isOpen||Math.hypot(entry.state.x-playerPosition.x,entry.state.z-playerPosition.z)>5.5||
      !entry.state.definition.dialogue&&!entry.state.definition.routine)return false;
    dialogue.open(entry.state);
    return dialogue.isOpen;
  }
  return {
    dialogue,
    moveTo,
    talkTo,
    setLighting(color:THREE.Color|null){distant.setLighting(color);},
    states: entries.map((entry) => entry.state),
    get lifeStats(){return {assigned:entries.filter(e=>!!e.state.definition.routine).length,routed:entries.filter(e=>!!e.life).length,roadNodes:router?.nodes??0,roadTruncated:router?.truncated??false};},
    update(dt: number, time: number, position: NPCPoint,camera?:THREE.PerspectiveCamera) {
      if (disposed) return;
      distant.begin();distant.update(time);
      for (const entry of entries) {
        const { state, life, player, proxy } = entry;
        if(entry.scripted&&lifeOptions){
          const job=entry.scripted,now=lifeOptions.worldTime();
          if(now<job.startAt){entry.scripted=null;}
          else{
            const talking=dialogue.npcId===state.definition.id;
            state.activity=npcActivity(Math.hypot(position.x-state.x,position.z-state.z));
            state.previousX=state.x;state.previousY=state.y;state.previousZ=state.z;
            if(talking){
              if(job.pauseFrom===null)job.pauseFrom=now;
              state.phase='talk';state.vx=0;state.vz=0;
            }else{
              if(job.pauseFrom!==null){job.pausedFor+=now-job.pauseFrom;job.pauseFrom=null;}
              const distance=Math.max(0,Math.min(job.route.length,(now-job.startAt-job.pausedFor)*Math.max(.2,state.definition.speed)));
              const p=positionOnResidentRoute(job.route,distance);
              state.x=p.x;state.z=p.z;state.y=terrainHeight(p.x,p.z);
              state.vx=dt>0?(p.x-state.previousX)/dt:0;state.vz=dt>0?(p.z-state.previousZ)/dt:0;
              state.heading=Math.atan2(state.vx,state.vz);
              state.phase=distance>=job.route.length?'idle':'walk';
              if(distance>=job.route.length){
                state.vx=0;state.vz=0;
                if(job.arrivedAt===null)job.arrivedAt=now;
                if(now-job.arrivedAt>60&&Math.hypot(position.x-state.x,position.z-state.z)>40)entry.scripted=null;
              }
            }
          }
        }
        if(!entry.scripted&&life&&lifeOptions&&state.definition.routine){
          const now=lifeOptions.worldTime(),routine=state.definition.routine;
          if(now<life.lastTime){life.pausedSeconds=0;life.pauseFrom=null;life.lastSample=-1;}
          life.lastTime=now;
          const distance=Math.hypot(position.x-state.x,position.z-state.z);
          const talking=dialogue.npcId===state.definition.id,near=distance<2.5;
          state.activity=npcActivity(distance);
          if(talking||near){
            if(life.pauseFrom===null)life.pauseFrom=now;
            state.previousX=state.x;state.previousY=state.y;state.previousZ=state.z;
            state.vx=0;state.vz=0;state.phase=talking?'talk':'greet';
            state.heading=Math.atan2(position.x-state.x,position.z-state.z);
          }else{
            if(life.pauseFrom!==null){life.pausedSeconds+=Math.max(0,now-life.pauseFrom);life.pauseFrom=null;}
            // Distant residents have no pathfinding/tick loop; sample their absolute
            // position at most twice per logical second. Nearby motion is smooth.
            if(distance<160||now-life.lastSample>=.5||life.lastSample<0){
              try {
                const pose=residentPoseAt(routine,life.route,Math.max(0,now-life.pausedSeconds),
                  lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase,Math.max(.2,state.definition.speed));
                const oldX=state.x,oldZ=state.z;
                state.previousX=oldX;state.previousY=state.y;state.previousZ=oldZ;
                state.x=pose.position.x;state.z=pose.position.z;state.y=terrainHeight(state.x,state.z);
                state.vx=dt>0?(state.x-oldX)/dt:0;state.vz=dt>0?(state.z-oldZ)/dt:0;
                if(pose.phase==='to-work'||pose.phase==='to-home')state.heading=pose.heading;
                const busy=residentGesture(routine.role)!==null;
                state.phase=pose.phase==='work'?(busy?'work':routine.role==='child'&&Math.hypot(state.vx,state.vz)>.15?'walk':'idle'):
                  pose.phase==='to-work'||pose.phase==='to-home'?'walk':'idle';
                life.pose=pose;life.lastSample=now;
              }catch{
                // Invalid route/clock: preserve the source NPC's legacy fallback,
                // never jump to an unqualified work site.
                updateNPC(state,dt,position,obstacles);
              }
            }else{state.vx=0;state.vz=0;}
          }
        }else if(!entry.scripted)updateNPC(state,dt,position,obstacles);
        const tier = npcVisualTier(
          Math.hypot((camera?.position.x??position.x) - state.x, (camera?.position.z??position.z) - state.z),
          state.definition.kind,
        );
        if(tier==='rig'&&!entry.model){
          const hamster=state.definition.kind==='hamster'?buildHamster({npc:true}):null,
            model=hamster??buildSquirrel();
          model.setAppearance(state.definition.appearance);
          if(state.definition.kind==='animal')model.group.scale.setScalar(.58);
          if(state.definition.scale!==undefined)model.group.scale.multiplyScalar(state.definition.scale);
          model.group.name='NPC:'+state.definition.id;
          scene.add(model.group);
          entry.model=model;entry.hamster=hamster;
          entry.head=hamster?null:model.group.getObjectByName('HeadJoint');
          entry.arm=hamster?null:model.group.getObjectByName('ArmRight');
        }
        // Beyond the immediate player neighborhood, free whole animated rigs.
        // Impostors use pre-existing atlases and do not require model instances.
        if(tier!=='rig'&&entry.model&&Math.hypot(position.x-state.x,position.z-state.z)>32){
          entry.model.dispose();entry.model=null;entry.hamster=null;entry.head=null;entry.arm=null;
        }
        const {model,hamster,head,arm}=entry;
        if(model)model.group.visible=tier==='rig';
        proxy.visible=tier==='silhouette';
        if(tier==='hidden')continue;
        const alpha = life?1:npcInterpolationAlpha(state);
        const x = THREE.MathUtils.lerp(state.previousX, state.x, alpha),
          y = THREE.MathUtils.lerp(state.previousY, state.y, alpha),
          z = THREE.MathUtils.lerp(state.previousZ, state.z, alpha);
        if(state.definition.kind==='hamster'&&tier==='silhouette'&&distant.write('hamster.'+(state.phase==='work'||state.phase==='greet'?'action':Math.hypot(state.vx,state.vz)>.3?'walk':'idle'),x,y,z,1,state.heading,white)){proxy.visible=false;continue;}
        if (tier === 'silhouette') {
          proxy.position.set(x, y, z);
          proxy.rotation.y = state.heading;
          continue;
        }
        if(!model)continue;
        player.position.set(x, y, z);
        // The visual model faces its local +Z; its parent supplies world heading.
        player.velocity.set(0, 0, Math.hypot(state.vx, state.vz));
        model.group.position.copy(player.position);
        model.group.rotation.y = state.heading;
        model.update(player, dt, time);
        if (hamster) {
          if (state.phase === 'greet' && !hamster.action && (entry.lastGreetAt<0||time-entry.lastGreetAt>8)){
            if(hamster.play('INTERACT'))entry.lastGreetAt=time;
          }else if(state.phase === 'work'&&!hamster.action&&state.definition.routine){
            const gesture=residentGesture(state.definition.routine.role);
            if(gesture&&shouldPlayResidentGesture(time,entry.lastWorkAt,gesture)&&hamster.play(gesture.activity))
              entry.lastWorkAt=time;
          }
        } else if (state.phase === 'greet' || state.phase === 'work') {
          if (head) head.rotation.y = Math.sin(time * 1.7) * 0.12;
          if (arm) {
            arm.rotation.z = state.phase === 'greet' ? -1.6 : -0.45;
            arm.rotation.x =
              Math.sin(time * (state.phase === 'greet' ? 5 : 3)) * 0.25;
          }
        }
        const emotion =
          (dialogue.npcId === state.definition.id
            ? dialogue.emotion
            : undefined) ?? state.definition.appearance.emotion;
        if (emotion !== entry.appliedEmotion) {
          model.setAppearance({ ...state.definition.appearance, emotion });
          entry.appliedEmotion = emotion;
        }
      }
      distant.end();
    },
    interact(position: NPCPoint): boolean {
      if (disposed) return false;
      if (dialogue.isOpen) return true;
      const entry = nearest(position);
      if (!entry) return false;
      dialogue.open(entry.state);
      return true;
    },
    /** Inhabitant within talking distance (interaction target of the player interface). */
    talker(position: NPCPoint): { id: string; name: string } | null {
      if (disposed || dialogue.isOpen) return null;
      const entry = nearest(position);
      return entry ? { id: entry.state.definition.id, name: entry.state.definition.name } : null;
    },
    prompt(position: NPCPoint): string | null {
      if (disposed) return null;
      if (dialogue.isOpen) return null;
      const entry = nearest(position);
      return entry ? '[E] Parler avec ' + entry.state.definition.name : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      dialogue.dispose();distant.dispose();
      for (const { model, proxy } of entries) {
        model?.dispose();
        proxy.removeFromParent();
      }
      proxyGeometry.dispose();
      proxyFur.dispose();
      proxyLight.dispose();
    },
  };
}
