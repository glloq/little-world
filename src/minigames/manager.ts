/**
 * MiniGameManager (doc 107): activities declared by the ACTIVE island only.
 *   UNLOADED → (prepare: family module imported, simulation + static colliders) → READY
 *   READY → (join + start) → ACTIVE ⇄ SUSPENDED → (finish / abandon) → READY
 *   any → release → UNLOADED ; dispose → DISPOSED ; an exception → FAILED (isolated).
 * Only ACTIVE instances are ticked; READY ones hold a sleeping simulation and cost nothing
 * per tick. Specialised logic stays in the family modules; this file only coordinates.
 */
import {LocalMiniGameAuthority,type MiniGameCommand} from './authority.ts';
import {MiniGameRegistry} from './registry.ts';
import {finishReason} from './rules.ts';
import {areaRadius,type MiniGameInstanceV1} from './schema.ts';
import {abandonSession,canStart,createSession,finishSession,joinSession,leaveSession,resetRound,resumeSession,startSession,suspendSession,tickSession,type MiniGameEvent,type MiniGameSessionState} from './session.ts';
import type {MiniGameActor,MiniGameEnvironment,MiniGameFamilyModule,MiniGameSimulation,MiniGameStaticCollider,MiniGameSurface} from './types.ts';

export type MiniGameInstanceState='UNLOADED'|'LOADING'|'READY'|'ACTIVE'|'SUSPENDED'|'DISPOSED'|'FAILED';
export interface MiniGameInstanceRecord {
  readonly def:MiniGameInstanceV1;state:MiniGameInstanceState;
  module:MiniGameFamilyModule|null;sim:MiniGameSimulation|null;session:MiniGameSessionState|null;
  error:string|null;sessions:number;
}
export interface MiniGameRefusal {instanceId:string;playerId:string;reason:string}
export interface MiniGameTickResult {events:MiniGameEvent[];refusals:MiniGameRefusal[];stepped:number}
export interface MiniGameManagerDeps {
  env:MiniGameEnvironment;registry?:MiniGameRegistry;authority?:LocalMiniGameAuthority;
  /** Player-blocking static parts (e.g. WorldCollisionQuery add/remove). */
  colliders?:{add(c:MiniGameStaticCollider):void;remove(id:string):void};
  /** Walking surfaces (activity floors, e.g. WorldCollisionQuery.setOutdoorSurface). */
  surfaces?:{set(id:string,surface:MiniGameSurface|null):void};
  onError?(instanceId:string,error:unknown):void;
}
/** Discovery radii with hysteresis (metres beyond the area radius). */
export const MINIGAME_PROXIMITY={prepare:45,release:80} as const;

export function createMiniGameManager(defs:readonly MiniGameInstanceV1[],deps:MiniGameManagerDeps){
  const registry=deps.registry??new MiniGameRegistry(),authority=deps.authority??new LocalMiniGameAuthority();
  const records=new Map<string,MiniGameInstanceRecord>(),active=new Set<string>(),listeners=new Set<(r:MiniGameTickResult)=>void>();
  for(const def of [...defs].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)){
    if(records.has(def.id))throw Error('Mini-jeu en double : '+def.id);
    records.set(def.id,{def,state:'UNLOADED',module:null,sim:null,session:null,error:null,sessions:0});
  }
  let disposed=false,lastTick=-1;
  const alive=()=>{if(disposed)throw Error('Gestionnaire de mini-jeux libéré');};
  function freeSim(r:MiniGameInstanceRecord){
    if(r.sim){for(const c of r.sim.staticColliders)deps.colliders?.remove(c.id);if(r.sim.floorSurface)deps.surfaces?.set(r.def.id,null);try{r.sim.dispose();}catch{/* already failing */}}
    r.sim=null;r.session=null;active.delete(r.def.id);authority.forget(r.def.id);
  }
  function fail(r:MiniGameInstanceRecord,error:unknown){
    freeSim(r);r.state='FAILED';r.error=error instanceof Error?error.message:String(error);deps.onError?.(r.def.id,error);
  }
  async function prepare(id:string):Promise<MiniGameInstanceRecord>{
    alive();const r=records.get(id);if(!r)throw Error('Mini-jeu inconnu : '+id);
    if(r.state!=='UNLOADED'&&r.state!=='FAILED')return r;
    r.state='LOADING';r.error=null;
    try{
      const module=await registry.load(r.def.family);
      if(disposed||r.state!=='LOADING')return r; // Released or disposed while loading.
      r.module=module;r.sim=module.createSimulation(r.def,deps.env);
      for(const c of r.sim.staticColliders)deps.colliders?.add(c);
      if(r.sim.floorSurface)deps.surfaces?.set(r.def.id,r.sim.floorSurface);
      r.state='READY';
    }catch(e){fail(r,e);}
    return r;
  }
  /** Drop the simulation and its exclusive resources; the family code stays cached. */
  function release(id:string){
    const r=records.get(id);if(!r||r.state==='DISPOSED')return;
    freeSim(r);r.module=null;r.state='UNLOADED';
  }
  /** Ids to prepare / release around a position (cheap: ≤ 64 distance checks). */
  function proximity(x:number,z:number){
    const prepareIds:string[]=[],releaseIds:string[]=[];
    for(const r of records.values()){
      const d=Math.hypot(x-r.def.area.x,z-r.def.area.z)-areaRadius(r.def.area);
      if(r.state==='UNLOADED'&&d<MINIGAME_PROXIMITY.prepare)prepareIds.push(r.def.id);
      else if((r.state==='READY'||r.state==='FAILED')&&d>MINIGAME_PROXIMITY.release)releaseIds.push(r.def.id);
    }
    return {prepare:prepareIds,release:releaseIds};
  }
  function apply(r:MiniGameInstanceRecord,c:MiniGameCommand,actors:readonly MiniGameActor[],out:MiniGameTickResult){
    const refuse=(reason:string)=>{out.refusals.push({instanceId:r.def.id,playerId:c.playerId,reason});};
    if(!r.sim||r.state==='UNLOADED'||r.state==='LOADING')return refuse('Activité non chargée');
    const terminal=!r.session||r.session.status==='finished'||r.session.status==='abandoned';
    switch(c.type){
      case 'join':{
        if(terminal){r.session=createSession(r.def,`${r.def.id}:s${++r.sessions}`);}
        if(!joinSession(r.session!,r.def,c.playerId,c.tick,out.events,c.teamId))refuse('Impossible de rejoindre');return;
      }
      case 'start':{
        if(!r.session)return refuse('Aucun joueur');
        const why=canStart(r.session,r.def);if(why)return refuse(why);
        startSession(r.session,r.def,c.tick,out.events,c.mode);r.sim.reset(r.session,c.tick,out.events);
        r.state='ACTIVE';active.add(r.def.id);return;
      }
      case 'leave':if(!r.session||!leaveSession(r.session,c.playerId,c.tick,out.events))refuse('Pas dans la partie');break;
      case 'abandon':if(!r.session)return refuse('Aucune partie');abandonSession(r.session,c.tick,out.events,c.playerId);break;
      case 'reset':
        if(r.session?.status!=='active')return refuse('Aucune partie en cours');
        r.sim.reset(r.session,c.tick,out.events);resetRound(r.session,c.tick,out.events,false);return;
      case 'launch':{
        if(r.state!=='ACTIVE'||!r.session)return refuse('Partie non commencée');
        const actor=actors.find(a=>a.id===c.playerId);if(!actor)return refuse('Joueur absent');
        const why=r.sim.launch(r.session,actor,c.yaw,c.power,c.loft,c.tick,out.events);if(why)refuse(why);return;
      }
    }
    if(r.session&&r.session.status!=='active'&&r.session.status!=='suspended'&&r.state==='ACTIVE'){r.state='READY';active.delete(r.def.id);}
  }
  /** One fixed simulation tick (30 Hz), called from the game's single fixed-step loop. */
  function tick(tickNo:number,dt:number,actors:readonly MiniGameActor[]):MiniGameTickResult{
    alive();
    if(!Number.isSafeInteger(tickNo)||tickNo<=lastTick)throw Error('Tick de mini-jeu non croissant');
    lastTick=tickNo;
    const out:MiniGameTickResult={events:[],refusals:[],stepped:0};
    for(const c of authority.drain(tickNo)){
      const r=records.get(c.instanceId);if(!r){out.refusals.push({instanceId:c.instanceId,playerId:c.playerId,reason:'Mini-jeu inconnu'});continue;}
      try{apply(r,c,actors,out);}catch(e){fail(r,e);}
    }
    for(const id of [...active]){
      const r=records.get(id)!;if(r.state!=='ACTIVE'||!r.session||!r.sim||r.session.lastTick>=tickNo)continue; // Started this tick: first step next tick.
      try{
        tickSession(r.session,tickNo);r.sim.step({tick:tickNo,dt,actors,session:r.session,events:out.events});out.stepped++;
        const reason=finishReason(r.session,r.def);
        if(reason)finishSession(r.session,r.def,reason,tickNo,out.events);
        if(r.session.status!=='active'){r.state='READY';active.delete(id);}
      }catch(e){fail(r,e);}
    }
    if(out.events.length||out.refusals.length)for(const l of listeners)l(out);
    return out;
  }
  function suspend(id:string){const r=records.get(id);if(r?.state==='ACTIVE'&&r.session){suspendSession(r.session);r.state='SUSPENDED';active.delete(id);}}
  function resume(id:string,tickNo:number){const r=records.get(id);if(r?.state==='SUSPENDED'&&r.session){resumeSession(r.session,tickNo);r.state='ACTIVE';active.add(id);}}
  /** Serialisable state of one instance (session + simulation), e.g. for a future server. */
  function snapshot(id:string){const r=records.get(id);if(!r?.sim)return null;return {instanceId:id,state:r.state,session:r.session?structuredClone(r.session):null,sim:r.sim.snapshot()};}
  /** `atTick`: tick of THIS manager at which the snapshot resumes (another authority or a
   * reloaded page counts ticks differently); the session's elapsed time is preserved. */
  function restore(id:string,snap:{session:MiniGameSessionState|null;sim:unknown;state:MiniGameInstanceState},atTick?:number){
    const r=records.get(id);if(!r?.sim)throw Error('Mini-jeu non chargé');
    r.sim.restore(snap.sim);r.session=snap.session?structuredClone(snap.session):null;
    if(r.session&&atTick!==undefined){if(!Number.isSafeInteger(atTick)||atTick<0)throw Error('Tick de reprise invalide');r.session.lastTick=atTick;}
    r.state=snap.state==='ACTIVE'||snap.state==='SUSPENDED'?snap.state:'READY';
    if(r.state==='ACTIVE')active.add(id);else active.delete(id);
  }
  function dispose(){
    if(disposed)return;
    for(const r of records.values()){freeSim(r);r.module=null;r.state='DISPOSED';}
    active.clear();listeners.clear();disposed=true;
  }
  return {records:records as ReadonlyMap<string,MiniGameInstanceRecord>,registry,authority,prepare,release,proximity,tick,suspend,resume,snapshot,restore,dispose,
    submit:(c:MiniGameCommand)=>!disposed&&authority.submit(c),
    subscribe(l:(r:MiniGameTickResult)=>void){listeners.add(l);return ()=>{listeners.delete(l);};},
    stats:()=>({instances:records.size,active:active.size,loaded:[...records.values()].filter(r=>r.sim).length,families:registry.loaded(),listeners:listeners.size,pendingCommands:authority.pending,disposed}),
  };
}
export type MiniGameManager=ReturnType<typeof createMiniGameManager>;
