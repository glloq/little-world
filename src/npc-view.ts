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
import {createResidentLayeredRouter,type ResidentSurfaces} from './npc-life/layered-routes.ts';
import {residentRouteAheadClear,residentScriptedAdvance,residentReplanDue,residentRoutineStepClear,residentRecoveryNeedsRetarget,residentRecoverySpeed} from './npc-life/dynamic-route.ts';
import {residentHour,residentShift,residentPoseAt,residentRoute,positionOnResidentRoute,type ResidentRoute} from './npc-life/schedule.ts';
import {residentDialogue,residentContextForHour} from './npc-life/dialogue.ts';
import {residentAgendaPoseAt,validateResidentAgendaRoutes,type ResidentAgendaPose,type ResidentDailyRoutes,type ResidentActivityLegs} from './npc-life/agenda.ts';
import {residentSocialPairs,residentSocialEncounterActive} from './npc-life/social.ts';
import {residentDoorwayState} from './npc-life/doorway.ts';
import {selectNPCRigs} from './npc-life/rig-budget.ts';
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
  surfaces?:ResidentSurfaces;
  /** Concurrent animated rigs, bounded for old 4–8GB integrated GPUs. */
  rigBudget?:number;
  weather?:()=> 'clear'|'cloudy'|'rain';
  /** Increment when pedestrian paths, terrain or door topology changes. */
  navigationRevision?:()=>number;
  /** Only existing exterior settlement doors can be requested. */
  homeDoor?:(homeAnchorId:string)=>string|null;
  openHomeDoor?:(doorId:string)=>void;
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
    ?lifeOptions.surfaces&&lifeOptions.paths.some(p=>p.supportId)?createResidentLayeredRouter(lifeOptions.paths,walkable,lifeOptions.surfaces):createResidentRouter(lifeOptions.paths,walkable):null;
  const dialogue=createDialoguePanel(state=>{
    const base=dialogueFactory?.(state)??(state.definition.dialogue?createDialogue(state.definition.dialogue,state.flags):undefined);
    const routine=state.definition.routine;
    if(!routine||!lifeOptions)return base;
    return residentDialogue(base,routine.role,()=>{
      const hour=residentHour(lifeOptions.worldTime(),lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase);
      const living=entries.find(e=>e.state===state)?.life?.pose;
      if(living)return {phase:living.phase,hour,weather:lifeOptions.weather?.()};
      const context=residentContextForHour(routine.role,hour,routine);
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
      agenda:ResidentDailyRoutes|null=route&&router&&definition.routine?.activities?.length?(()=>{
        const legs:ResidentActivityLegs[]=[];
        for(const stop of definition.routine.activities??[]){
          const to=router.route(definition.routine!.work,stop.point),back=router.route(stop.point,definition.routine!.work);
          if(!to||!back)return null;
          legs.push({to,back});
        }
        const candidate={work:route,activities:legs};
        return validateResidentAgendaRoutes(definition.routine!,candidate,
          lifeOptions!.dayLengthSeconds,Math.max(.2,definition.speed))?null:candidate;
      })():null,
      life=route?{route,agenda,pose:null as ResidentAgendaPose|null,lastTime:-1,lastSample:-1,pausedSeconds:0,pauseFrom:null as number|null,lastRecoveryAt:-Infinity,lastDoorAt:-Infinity,indoors:false}:null,
      proxy = silhouette(definition);
    // Actual character rigs are allocated only when first seen nearby, not for
    // every citizen of the island. All hamsters share geometry/material caches.
    let hamster:ReturnType<typeof buildHamster>|null=null;
    let model:ReturnType<typeof buildSquirrel>|ReturnType<typeof buildHamster>|null=null;
    let head:THREE.Object3D|null=null,arm:THREE.Object3D|null=null;
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
      // Explicit widening: TS narrows locals to null at object construction,
      // even though entry fields are later assigned on first LOD entry.
      model: model as ReturnType<typeof buildSquirrel>|ReturnType<typeof buildHamster>|null,
      hamster: hamster as ReturnType<typeof buildHamster>|null,
      player,
      proxy,
      head: head as THREE.Object3D|null,
      arm: arm as THREE.Object3D|null,
      appliedEmotion: definition.appearance.emotion,
      lastWorkAt:-1,
      lastGreetAt:-1,
      lastRigAt:-1000,
      scripted:null as null|{route:ResidentRoute;goal:{x:number;z:number};startAt:number;pausedFor:number;pauseFrom:number|null;arrivedAt:number|null;lastCheckedAt:number;lastDistance:number;replans:number;recovery:boolean;lastReplanAt:number;plannedRevision:number},
    };
  });
  const byId=new Map(entries.map(entry=>[entry.state.definition.id,entry]));
  const navigationRevision=()=>{const revision=lifeOptions?.navigationRevision?.()??0;return Number.isFinite(revision)?revision:0;};
  let socialPartners=new Map<string,string>(),lastSocialScan=-1;
  let rigIds=new Set<string>(),lastRigSample=-1;
  let scriptedReplans=0,scriptedBlocked=0,scriptedCompleted=0,routineRecoveries=0,routineBlocked=0;
  function nearest(player: NPCPoint) {
    let best: (typeof entries)[number] | null = null,
      distance = 5.5;
    for (const entry of entries) {
      if (entry.life?.indoors)continue;
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
    entry.scripted={route,goal:to,startAt:lifeOptions.worldTime(),pausedFor:0,pauseFrom:null,arrivedAt:null,lastCheckedAt:-1,lastDistance:0,replans:0,recovery:false,lastReplanAt:-Infinity,plannedRevision:navigationRevision()};
    return true;
  }
  function talkTo(id:string,playerPosition:NPCPoint):boolean{
    const entry=entries.find(e=>e.state.definition.id===id);
    if(!entry||entry.life?.indoors||dialogue.isOpen||Math.hypot(entry.state.x-playerPosition.x,entry.state.z-playerPosition.z)>5.5||
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
    get lifeStats(){return {assigned:entries.filter(e=>!!e.state.definition.routine).length,routed:entries.filter(e=>!!e.life).length,agendas:entries.filter(e=>!!e.life?.agenda).length,unqualifiedAgendas:entries.filter(e=>e.state.definition.routine?.activities?.length&&!e.life?.agenda).length,socialPairs:socialPartners.size/2,animatedRigs:entries.filter(e=>!!e.model).length,rigBudget:lifeOptions?.rigBudget??12,scriptedReplans,scriptedBlocked,scriptedCompleted,routineRecoveries,routineBlocked,navigationRevision:navigationRevision(),roadNodes:router?.nodes??0,roadTruncated:router?.truncated??false};},
    update(dt: number, time: number, position: NPCPoint,camera?:THREE.PerspectiveCamera) {
      if (disposed) return;
      distant.begin();distant.update(time);
      if(time<lastRigSample||time-lastRigSample>=.5){
        const focus={x:camera?.position.x??position.x,z:camera?.position.z??position.z};
        rigIds=selectNPCRigs(entries.map(e=>({id:e.state.definition.id,kind:e.state.definition.kind,
          x:e.state.x,z:e.state.z})),focus,lifeOptions?.rigBudget??12,dialogue.npcId??undefined);
        lastRigSample=time;
      }
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
              // Recoveries follow the current shift/visit, including after a
              // conversation or a changed day phase. Re-route at most every 2s.
              if(job.recovery&&life&&state.definition.routine&&
                (now<life.lastRecoveryAt||now-life.lastRecoveryAt>=2)){
                life.lastRecoveryAt=now;
                try{
                  const r=state.definition.routine,speed=Math.max(.2,state.definition.speed);
                  const target=life.agenda
                    ?residentAgendaPoseAt(r,life.agenda,Math.max(0,now-life.pausedSeconds),
                        lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase,speed)
                    :residentPoseAt(r,life.route,Math.max(0,now-life.pausedSeconds),
                        lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase,speed);
                  if(residentRecoveryNeedsRetarget(job.goal,target.position,now,job.lastCheckedAt,2,.35)){
                    const newGoal={x:target.position.x,z:target.position.z};
                    const updated=router?.route({x:state.x,z:state.z},newGoal)??null;
                    if(updated&&residentRouteAheadClear(updated,0,walkable,3)){
                      job.route=updated;job.goal=newGoal;job.startAt=now;
                      job.pausedFor=0;job.lastDistance=0;job.arrivedAt=null;job.lastCheckedAt=now;
                      job.plannedRevision=navigationRevision();
                      routineRecoveries++;
                    }else{
                      entry.scripted=null;routineBlocked++;
                      state.vx=0;state.vz=0;state.phase='idle';
                    }
                  }
                }catch{
                  entry.scripted=null;routineBlocked++;
                }
              }
              let distance=Math.max(0,Math.min(job.route.length,(now-job.startAt-job.pausedFor)*(job.recovery?residentRecoverySpeed(state.definition.speed):Math.max(.2,state.definition.speed))));
              // Live world checks are bounded and throttled; only scripted moves
              // may replan. The routine clock never performs A* during frames.
              const checkAhead=job.lastCheckedAt<0||now<job.lastCheckedAt||now-job.lastCheckedAt>=.35;
              // Check EVERY interval actually traversed, even if a browser tab
              // was paused and the absolute-clock target skipped several metres.
              // A suspended browser frame cannot skip metres of unchecked ground.
              // Accept partial movement only on the actual polyline before impact.
              const clearance=residentScriptedAdvance(job.route,job.lastDistance,distance,walkable);
              distance=clearance.safeDistance;
              // Commit the last certified point before planning a detour.
              // This prevents stale-position replans and corner cutting.
              const advance=positionOnResidentRoute(job.route,distance);
              const changed=job.plannedRevision!==navigationRevision();
              const clearAhead=(!checkAhead&&!changed)||residentRouteAheadClear(job.route,distance,walkable,3);
              if(checkAhead)job.lastCheckedAt=now;
              // Door changes elsewhere in the village are not a reason to run
              // A* for every walker: accept the revision when this path remains
              // physically clear. Live step sampling still guards actual motion.
              if(changed&&clearAhead&&clearance.clear)job.plannedRevision=navigationRevision();
              if(entry.scripted&&(!clearance.clear||!clearAhead)){
                state.x=advance.x;state.z=advance.z;
                state.y=advance.y??terrainHeight(advance.x,advance.z);
                job.lastDistance=distance;
                const due=residentReplanDue(now,job.lastReplanAt,navigationRevision(),job.plannedRevision,1);
                const alternative=due&&job.replans<3?router?.route({x:state.x,z:state.z},job.goal)??null:null;
                if(due){
                  job.lastReplanAt=now;
                  job.plannedRevision=navigationRevision();
                  job.replans++;
                }
                if(alternative&&residentRouteAheadClear(alternative,0,walkable,Math.min(8,alternative.length))){
                  job.route=alternative;job.startAt=now;job.pausedFor=0;
                  job.lastDistance=0;job.lastCheckedAt=now;job.replans=0;
                  job.plannedRevision=navigationRevision();
                  scriptedReplans++;distance=0;
                }else if(job.replans>=3){
                  entry.scripted=null;scriptedBlocked++;
                  state.vx=0;state.vz=0;state.phase='idle';
                }else{
                  // Keep the actor stopped and freeze its scripted clock until
                  // another bounded replan attempt; never accumulate a catch-up jump.
                  const speed=job.recovery?residentRecoverySpeed(state.definition.speed):Math.max(.2,state.definition.speed);
                  job.startAt=now-job.pausedFor-distance/speed;
                  state.vx=0;state.vz=0;state.phase='idle';
                }
              }
              if(entry.scripted){
              job.lastDistance=distance;
              const p=positionOnResidentRoute(job.route,distance);
              state.x=p.x;state.z=p.z;state.y=p.y??terrainHeight(p.x,p.z);
              state.vx=dt>0?(p.x-state.previousX)/dt:0;state.vz=dt>0?(p.z-state.previousZ)/dt:0;
              state.heading=Math.atan2(state.vx,state.vz);
              state.phase=distance>=job.route.length?'idle':'walk';
              if(distance>=job.route.length){
                state.vx=0;state.vz=0;
                if(job.arrivedAt===null){job.arrivedAt=now;if(job.recovery)entry.scripted=null;else scriptedCompleted++;}
                if(now-job.arrivedAt>60&&Math.hypot(position.x-state.x,position.z-state.z)>40)entry.scripted=null;
              }
              }
            }
          }
        }
        if(!entry.scripted&&life&&lifeOptions&&state.definition.routine){
          const now=lifeOptions.worldTime(),routine=state.definition.routine;
          if(now<life.lastTime){life.pausedSeconds=0;life.pauseFrom=null;life.lastSample=-1;life.lastRecoveryAt=-Infinity;}
          life.lastTime=now;
          const distance=Math.hypot(position.x-state.x,position.z-state.z);
          const talking=dialogue.npcId===state.definition.id;
          state.activity=npcActivity(distance);
          if(talking){
            if(life.pauseFrom===null)life.pauseFrom=now;
            state.previousX=state.x;state.previousY=state.y;state.previousZ=state.z;
            state.vx=0;state.vz=0;state.phase=talking?'talk':'greet';
            state.heading=Math.atan2(position.x-state.x,position.z-state.z);
          }else{
            if(life.pauseFrom!==null){life.pausedSeconds+=Math.max(0,now-life.pauseFrom);life.pauseFrom=null;}
            // Conversations freeze an actor only while speaking. Gradually regain
            // missed world time instead of offsetting its daily timetable forever.
            life.pausedSeconds=Math.max(0,life.pausedSeconds-Math.max(0,dt)*2);
            // Distant residents have no pathfinding/tick loop; sample their absolute
            // position at most twice per logical second. Nearby motion is smooth.
            if(distance<160||now-life.lastSample>=.5||life.lastSample<0){
              try {
                const pose:ResidentAgendaPose=life.agenda
                  ?residentAgendaPoseAt(routine,life.agenda,Math.max(0,now-life.pausedSeconds),
                    lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase,Math.max(.2,state.definition.speed))
                  :residentPoseAt(routine,life.route,Math.max(0,now-life.pausedSeconds),
                    lifeOptions.dayLengthSeconds,lifeOptions.initialDayPhase,Math.max(.2,state.definition.speed));
                life.pose=pose; // Dialogue context follows the schedule even while physically recovering.
                const oldX=state.x,oldZ=state.z;
                // Close residents must physically catch up to the daily schedule.
                // No teleport through a wall when the world clock jumps or an
                // authored road changes after routes were initially compiled.
                const near=distance<80;
                const blocked=near&&!residentRoutineStepClear(
                  {x:oldX,z:oldZ},pose.position,walkable,Math.max(.25,Math.max(0,dt)*Math.max(.2,state.definition.speed)*2));
                if(blocked){
                  state.previousX=oldX;state.previousY=state.y;state.previousZ=oldZ;
                  state.vx=0;state.vz=0;state.phase='idle';
                  if(now<life.lastRecoveryAt||now-life.lastRecoveryAt>=2){
                    life.lastRecoveryAt=now;
                    const detour=router?.route({x:oldX,z:oldZ},pose.position)??null;
                    if(detour&&detour.length>.05&&residentRouteAheadClear(detour,0,walkable,3)){
                      entry.scripted={route:detour,goal:{x:pose.position.x,z:pose.position.z},
                        startAt:now,pausedFor:0,pauseFrom:null,arrivedAt:null,
                        lastCheckedAt:-1,lastDistance:0,replans:0,recovery:true,lastReplanAt:-Infinity,plannedRevision:navigationRevision()};
                      routineRecoveries++;
                    }else routineBlocked++;
                  }
                  life.lastSample=now;
                }else{
                  state.previousX=oldX;state.previousY=state.y;state.previousZ=oldZ;
                  state.x=pose.position.x;state.z=pose.position.z;state.y=pose.position.y??terrainHeight(state.x,state.z);
                  state.vx=dt>0?(state.x-oldX)/dt:0;state.vz=dt>0?(state.z-oldZ)/dt:0;
                  if(pose.phase==='to-work'||pose.phase==='to-home'||pose.phase==='to-activity')state.heading=pose.heading;
                  const busy=residentGesture(routine.role)!==null;
                  state.phase=pose.phase==='activity'?(pose.activityKind==='social'?'greet':'idle'):
                    pose.phase==='work'?(busy?'work':routine.role==='child'&&Math.hypot(state.vx,state.vz)>.15?'walk':'idle'):
                    pose.phase==='to-work'||pose.phase==='to-home'||pose.phase==='to-activity'?'walk':'idle';
                  life.lastSample=now;
                }
              }catch{
                // Invalid route/clock: preserve the source NPC's legacy fallback,
                // never jump to an unqualified work site.
                updateNPC(state,dt,position,obstacles);
              }
            }else{state.vx=0;state.vz=0;}
          }
        }else if(!entry.scripted)updateNPC(state,dt,position,obstacles);
        // Visually enter the home at its exterior threshold, no fictional room.
        // The native door component remains the single authority for manual
        // player opening and the temporary request is never persisted.
        if(life&&state.definition.routine?.homeAnchorId&&lifeOptions?.homeDoor){
          const doorId=lifeOptions.homeDoor(state.definition.routine.homeAnchorId);
          const pose=life.pose;
          if(doorId&&pose){
            const doorway=residentDoorwayState(state.definition.routine,pose,
              {x:state.x,z:state.z},lifeOptions.dayLengthSeconds,Math.max(.2,state.definition.speed));
            life.indoors=doorway.inside&&!entry.scripted&&dialogue.npcId!==state.definition.id;
            const now=lifeOptions.worldTime();
            if(doorway.requestOpen&&(now<life.lastDoorAt||now-life.lastDoorAt>=1)){
              life.lastDoorAt=now;lifeOptions.openHomeDoor?.(doorId);
            }
          }else life.indoors=false;
        }
        const partnerId=socialPartners.get(state.definition.id),partner=partnerId?byId.get(partnerId):null;
        if(partner&&dialogue.npcId!==state.definition.id&&dialogue.npcId!==partner.state.definition.id&&
          !entry.scripted&&!partner.scripted&&life?.pose&&
          (life.pose.phase==='activity'&&life.pose.activityKind==='social'||
            life.pose.phase==='work'&&state.definition.routine?.role==='child')&&
          residentSocialEncounterActive(state.definition.id,partnerId!,time)&&
          Math.hypot(partner.state.x-state.x,partner.state.z-state.z)<=5.5){
          state.phase='greet';
          state.heading=Math.atan2(partner.state.x-state.x,partner.state.z-state.z);
        }
        const candidateTier = npcVisualTier(
          Math.hypot((camera?.position.x??position.x) - state.x, (camera?.position.z??position.z) - state.z),
          state.definition.kind,
        );
        const tier=life?.indoors?'hidden':candidateTier==='rig'&&!rigIds.has(state.definition.id)?'silhouette':candidateTier;
        if(tier==='rig')entry.lastRigAt=time;
        if(tier==='rig'&&!entry.model){
          const hamster=state.definition.kind==='hamster'?buildHamster():null,
            model=hamster??buildSquirrel();
          model.setAppearance(state.definition.appearance);
          if(state.definition.kind==='animal')model.group.scale.setScalar(.58);
          if(state.definition.scale!==undefined)model.group.scale.multiplyScalar(state.definition.scale);
          model.group.name='NPC:'+state.definition.id;
          scene.add(model.group);
          entry.model=model;entry.hamster=hamster;
          entry.head=hamster?null:(model.group.getObjectByName('HeadJoint')??null);
          entry.arm=hamster?null:(model.group.getObjectByName('ArmRight')??null);
        }
        // Beyond the immediate player neighborhood, free whole animated rigs.
        // Impostors use pre-existing atlases and do not require model instances.
        if(tier!=='rig'&&entry.model&&(time-entry.lastRigAt>3||
          Math.hypot(position.x-state.x,position.z-state.z)>32)){
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
      // Spatially budgeted social scan, independent of display/physics LOD.
      if(time<lastSocialScan||time-lastSocialScan>=2){
        socialPartners=residentSocialPairs(entries.map(e=>({
          id:e.state.definition.id,x:e.state.x,z:e.state.z,
          role:e.state.definition.routine?.role??'villager',
          phase:e.life?.pose?.phase,kind:e.life?.pose?.activityKind,
          busy:e.scripted!==null||dialogue.npcId===e.state.definition.id,
        })));
        lastSocialScan=time;
      }
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
