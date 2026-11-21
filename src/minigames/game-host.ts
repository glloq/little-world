/**
 * Browser adapter between the solo game and the MiniGameManager (doc 107). Loaded by
 * main.ts only when the active island declares mini-games (or `?minigames=demo`).
 * - Proximity (every 15 ticks, hysteresis) prepares / releases instances and their views.
 * - One call per fixed 30 Hz tick: the local player becomes an actor, F is turned into
 *   join+start or a charged launch intention, the manager steps ACTIVE sessions only.
 * - Mouse slingshot (doc 107 §visée): press on the ball (or the throwing hand), drag back,
 *   release. Direction = opposite of the drag, power = drag length, wheel = height. The
 *   preview line is the simulation's own `predict` (same engine), refreshed at 30 Hz.
 * - Keys 1…9 choose the game mode before starting (variants with `modes`).
 * - Presentation (views, HUD) reads the simulation; nothing here changes the player physics.
 */
import type {Object3D} from 'three';
import type {WorldCollisionQuery} from '../physics/collision-world.ts';
import type {GameplayEvent} from '../gameplay/events.ts';
import {readPracticeBest,writePracticeBest,type RaceStorage} from '../gameplay/race-records.ts';
import {minigameRecord} from './records.ts';
import {MINIGAME_VARIANTS} from './catalog.ts';
import {createMiniGameManager,type MiniGameInstanceRecord} from './manager.ts';
import {worldToArea,type MiniGameInstanceV1} from './schema.ts';
import {sessionSeconds,type MiniGameEvent} from './session.ts';
import type {MiniGameActor,MiniGameAim,MiniGameAimLine,MiniGameEnvironment,MiniGameView} from './types.ts';

export interface HostPlayer {position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};mode:string;body?:{radius?:number}}
export interface MiniGameHostOptions {
  parent:Object3D;defs:readonly MiniGameInstanceV1[];
  collision:WorldCollisionQuery|null;height(x:number,z:number):number;water(x:number,z:number):number|null;
  showInfo(text:string,kind?:'info'|'success'|'warning'):void;
  emit?(event:GameplayEvent):void;
  hudHost?:HTMLElement|null;
  /** Local personal bests (same mechanism as race records); absent = none kept. */
  records?:RaceStorage;worldBuild?:string;
}
/** Picking ray in world space (camera origin, normalised direction). */
export interface AimRay {ox:number;oy:number;oz:number;dx:number;dy:number;dz:number}
export const LOCAL_PLAYER='local';
/** Slingshot tuning: press radius around the anchor (m), minimum power, loft step per wheel notch. */
export const SLINGSHOT={grab:.6,minPower:.05,loftStep:.1} as const;
const rayPlane=(r:AimRay,y:number)=>{if(Math.abs(r.dy)<1e-6)return null;const t=(y-r.oy)/r.dy;return t>0?{x:r.ox+r.dx*t,z:r.oz+r.dz*t}:null;};
const rayDistance=(r:AimRay,p:{x:number;y:number;z:number})=>{
  const vx=p.x-r.ox,vy=p.y-r.oy,vz=p.z-r.oz,t=Math.max(0,vx*r.dx+vy*r.dy+vz*r.dz);
  return Math.hypot(vx-r.dx*t,vy-r.dy*t,vz-r.dz*t);
};
const CHARGE={kick:.8,throw:1,putt:1.5} as const;

export function createMiniGameHost(o:MiniGameHostOptions){
  const point={x:0,y:0,z:0};
  const env:MiniGameEnvironment={
    height:o.collision?(x,z)=>o.collision!.reliefHeight(x,z):o.height,
    water:o.water,
    ...(o.collision?{material:(x:number,z:number)=>{point.x=x;point.z=z;return o.collision!.materialAt(point);},
      solids:(a:number,b:number,c:number,d:number)=>o.collision!.solidsNear(a,b,c,d)}:{}),
  };
  const manager=createMiniGameManager(o.defs,{env,
    surfaces:o.collision?{set:(id,surface)=>o.collision!.setOutdoorSurface(id,surface)}:undefined,
    colliders:o.collision?{add:c=>o.collision!.add({id:c.id,shape:'box',position:c.position,size:c.size,enabled:()=>true}),remove:id=>o.collision!.remove(id)}:undefined,
    onError:(id,e)=>{console.warn('Mini-jeu désactivé',id,e);o.showInfo('Activité indisponible : '+(manager.records.get(id)?.def.name??id),'warning');}});
  const views=new Map<string,MiniGameView>(),loadingViews=new Set<string>(),bests=new Map<string,number|null>();
  const actor:MiniGameActor={id:LOCAL_PLAYER,x:0,y:0,z:0,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
  const actors=[actor],none:MiniGameActor[]=[];
  let seq=0,held=0,charging=false,wasHeld=false,hintAt=-1e9,lastHint='',lastTick=0,disposed=false;
  /** Current slingshot gesture (local presentation state; only the release becomes an intention). */
  let aiming:{id:string;aim:MiniGameAim;drag:{x:number;z:number}|null;yaw:number;power:number;loft:number;dirty:boolean}|null=null;
  let pendingShot:{id:string;yaw:number;power:number;loft:number}|null=null,aimLine:MiniGameAimLine|null=null;
  const modeChoice=new Map<string,string>();
  let previewPoints=0;
  const hud=o.hudHost?document.createElement('div'):null;
  if(hud){hud.className='minigame-hud';hud.hidden=true;hud.setAttribute('role','status');
    Object.assign(hud.style,{position:'fixed',left:'50%',top:'12px',transform:'translateX(-50%)',padding:'6px 12px',borderRadius:'8px',background:'rgba(20,24,30,.72)',color:'#fff',font:'14px system-ui,sans-serif',pointerEvents:'none',zIndex:'20',maxWidth:'90vw',textAlign:'center'});
    o.hudHost!.append(hud);}

  async function prepare(id:string){
    const r=await manager.prepare(id);
    if(disposed||r.state!=='READY'||!r.module||!r.sim||views.has(id)||loadingViews.has(id))return;
    loadingViews.add(id);
    try{const factory=await r.module.loadView();if(!disposed&&r.sim&&manager.records.get(id)?.sim===r.sim){views.set(id,factory.create(o.parent,r.sim,env));if(!aimLine&&factory.createAimLine)aimLine=factory.createAimLine(o.parent);}}
    finally{loadingViews.delete(id);}
  }
  function release(id:string){if(aiming?.id===id)cancelAim();views.get(id)?.dispose();views.delete(id);manager.release(id);}
  function cancelAim(){aiming=null;previewPoints=0;aimLine?.set(null,0);}
  /** Refresh the anchor (it follows a rolling football) and the preview line, at most once a tick. */
  function updateAim(){
    if(!aiming)return;const r=manager.records.get(aiming.id);
    const aim=r?.sim&&r.session&&r.state==='ACTIVE'?r.sim.aim(r.session,actor):null;
    if(!aim||!r?.sim||!r.session){cancelAim();return;}
    const moved=Math.hypot(aim.anchor.x-aiming.aim.anchor.x,aim.anchor.z-aiming.aim.anchor.z)>1e-3;aiming.aim=aim;
    if(aiming.drag){const dx=aim.anchor.x-aiming.drag.x,dz=aim.anchor.z-aiming.drag.z,len=Math.hypot(dx,dz);
      aiming.power=Math.min(1,len/aim.maxPull);if(len>1e-4)aiming.yaw=Math.atan2(dx,dz);}
    if(!aiming.dirty&&!moved)return;aiming.dirty=false;
    const points=aiming.power>=SLINGSHOT.minPower?r.sim.predict(r.session,actor,aiming.yaw,aiming.power,aim.canLoft?aiming.loft:0):null;
    previewPoints=points?points.length/3:0;aimLine?.set(points,aiming.power);
  }
  const modesOf=(r:MiniGameInstanceRecord)=>MINIGAME_VARIANTS[r.def.variant].modes??[];
  const chosenMode=(r:MiniGameInstanceRecord)=>modeChoice.get(r.def.id)??r.def.rules.mode??modesOf(r)[0]?.id;
  const within=(r:MiniGameInstanceRecord,x:number,z:number,margin:number)=>{const l=worldToArea(r.def.area,x,z);return Math.abs(l.x)<=r.def.area.halfWidth+margin&&Math.abs(l.z)<=r.def.area.halfLength+margin;};
  /** Loaded instance whose area (plus a margin) contains the player. */
  function here(x:number,z:number,margin=1.5):MiniGameInstanceRecord|null{
    for(const r of manager.records.values())if(r.sim&&(r.state==='READY'||r.state==='ACTIVE')&&within(r,x,z,margin))return r;
    return null;
  }
  const playing=()=>{for(const r of manager.records.values())if(r.state==='ACTIVE'&&r.session?.players.some(p=>p.id===LOCAL_PLAYER))return r;return null;};
  const send=(r:MiniGameInstanceRecord,tick:number,body:{type:'join'|'abandon'}|{type:'start';mode?:string}|{type:'launch';yaw:number;power:number;loft?:number})=>manager.submit({instanceId:r.def.id,playerId:LOCAL_PLAYER,tick,seq:++seq,...body});
  function describe(r:MiniGameInstanceRecord,e:MiniGameEvent){
    const teams=r.def.teams??[],name=(id:string)=>teams.find(t=>t.id===id)?.name??(id===LOCAL_PLAYER?'Vous':id);
    switch(e.type){
      case 'game:start':o.showInfo(r.def.name+' : c’est parti !','success');break;
      case 'target:hit':case 'ball:out':case 'game:reset':case 'score:changed':{
        // Variant wording lives with the variant rules, not here.
        const text=r.sim&&r.session?r.sim.describe(r.session,e,LOCAL_PLAYER):null;
        if(text)o.showInfo(text,e.type==='ball:out'?'warning':e.type==='target:hit'?'success':'info');break;
      }
      case 'game:finish':{
        const won=e.winners.includes(LOCAL_PLAYER)||e.winners.some(w=>r.session?.players.find(p=>p.id===LOCAL_PLAYER)?.teamId===w);
        const scores=Object.entries(r.session?.scores??{}).map(([k,v])=>name(k)+' '+v).join(' · ');
        o.showInfo(`${r.def.name} terminé${e.winners.length?' · vainqueur : '+e.winners.map(name).join(', '):' · égalité'} (${scores})`,'success');
        o.emit?.({type:'minigame.finished',instanceId:r.def.id,variant:r.def.variant,seconds:r.session?sessionSeconds(r.session):0,won});
        const record=o.records?minigameRecord(r.def,o.worldBuild):null,mine=r.session?.scores[LOCAL_PLAYER];
        if(record&&mine!==undefined&&e.reason!=='abandon'&&writePracticeBest(o.records!,record,mine)){bests.delete(r.def.id);o.showInfo('Nouveau record personnel : '+mine,'success');}
        break;
      }
      case 'game:abandon':o.showInfo(r.def.name+' : partie abandonnée');break;
    }
  }
  function updateHud(r:MiniGameInstanceRecord|null){
    if(!hud)return;
    let text='';
    if(r?.sim&&r.state==='ACTIVE'&&r.session){
      text=r.sim.hint(r.session,actor)??'';
      if(aiming){const p=aiming.power;text='Puissance '+'▮'.repeat(Math.round(p*10))+'▯'.repeat(10-Math.round(p*10))+
        (aiming.aim.canLoft?` · hauteur ${Math.round(aiming.loft*100)} % (molette)`:'')+' · relâchez pour tirer, Échap : annuler';}
      else if(held>0){const style=MINIGAME_VARIANTS[r.def.variant].physics.command,p=Math.min(1,held/CHARGE[style]);text+=' · puissance '+'▮'.repeat(Math.round(p*10))+'▯'.repeat(10-Math.round(p*10));}
      if(r.def.rules.timeLimitSeconds)text+=' · '+Math.max(0,Math.ceil(r.def.rules.timeLimitSeconds-sessionSeconds(r.session)))+' s';
    }else if(r){
      if(!bests.has(r.def.id)){const record=o.records?minigameRecord(r.def,o.worldBuild):null;bests.set(r.def.id,record?readPracticeBest(o.records!,record):null);}
      const best=bests.get(r.def.id)??null;
      const modes=modesOf(r),mode=chosenMode(r);
      text=`${r.def.name} · F : commencer (${r.def.playersMin>1&&r.def.rules.practice?'entraînement solo':'solo'})${best!==null?' · record : '+best:''}`+
        (modes.length?' · '+modes.map((m,k)=>`${k+1} : ${m.id===mode?'[':''}${m.label}${m.id===mode?']':''}`).join(' · '):'');
    }
    if(text!==lastHint){lastHint=text;hud.textContent=text;hud.hidden=!text;}
  }
  return {
    manager,env,
    /** True when F belongs to a mini-game (inside a loaded area): gathering/digging is skipped. */
    capturesAction(p:HostPlayer){return !!here(p.position.x,p.position.z);},
    tick(tickNo:number,dt:number,p:HostPlayer,actionHeld:boolean,aimYaw:number){
      if(disposed)return;
      // Ticks without this call (lift ride, cut-scene): not counted as match time.
      const gap=tickNo-lastTick>1&&lastTick>0;lastTick=tickNo;
      if(gap)for(const r of manager.records.values())if(r.state==='ACTIVE'){manager.suspend(r.def.id);manager.resume(r.def.id,tickNo-1);}
      actor.x=p.position.x;actor.y=p.position.y;actor.z=p.position.z;actor.vx=p.velocity.x;actor.vy=p.velocity.y;actor.vz=p.velocity.z;
      actor.mode=p.mode;actor.radius=p.body?.radius??.4;
      if(tickNo%15===0){const near=manager.proximity(actor.x,actor.z);for(const id of near.release)release(id);for(const id of near.prepare)void prepare(id);}
      let mine=playing();
      // Leaving the field of one's game abandons it (no simulation left running).
      // Leaving the field, or walking into ANOTHER activity, abandons one's game (F then
      // belongs to the activity the player stands in).
      const there=here(actor.x,actor.z);
      if(mine&&(!within(mine,actor.x,actor.z,25)||there&&there!==mine&&!within(mine,actor.x,actor.z,1.5))){send(mine,tickNo,{type:'abandon'});mine=null;held=0;charging=false;cancelAim();pendingShot=null;}
      if(pendingShot){const r=manager.records.get(pendingShot.id);if(r&&r===mine)send(r,tickNo,{type:'launch',yaw:pendingShot.yaw,power:pendingShot.power,loft:pendingShot.loft});pendingShot=null;}
      const inside=mine??there;
      if(inside){
        if(inside.state==='ACTIVE'&&mine===inside){
          // Only a press that BEGINS during the game charges a launch (not the one that started it).
          if(actionHeld&&!wasHeld){charging=true;held=0;}
          if(actionHeld&&charging)held+=dt;
          else if(!actionHeld&&charging){const style=MINIGAME_VARIANTS[inside.def.variant].physics.command,c=Math.min(1,held/CHARGE[style]);
            send(inside,tickNo,{type:'launch',yaw:aimYaw,power:style==='putt'?c:.3+.7*c});held=0;charging=false;}
        }else{charging=false;held=0;if(actionHeld&&!wasHeld&&inside.state==='READY'){send(inside,tickNo,{type:'join'});send(inside,tickNo,{type:'start',mode:chosenMode(inside)});}}
      }else{held=0;charging=false;}
      wasHeld=actionHeld;
      const result=manager.tick(tickNo,dt,inside||mine?actors:none);
      for(const e of result.events){const r=manager.records.get(e.sessionId.replace(/:s\d+$/,''));if(r)describe(r,e);}
      for(const f of result.refusals)if(f.playerId===LOCAL_PLAYER&&tickNo-hintAt>20){hintAt=tickNo;o.showInfo(f.reason,'warning');}
      updateAim();updateHud(inside);
    },
    /** Left press on the canvas: true when it grabs the slingshot (the camera must not orbit). */
    pointerDown(ray:AimRay):boolean{
      const r=playing();if(disposed||!r?.sim||!r.session)return false;
      const aim=r.sim.aim(r.session,actor);if(!aim||rayDistance(ray,aim.anchor)>SLINGSHOT.grab)return false;
      aiming={id:r.def.id,aim,drag:null,yaw:0,power:0,loft:aim.defaultLoft,dirty:true};return true;
    },
    /** Drag point on the horizontal plane of the anchor. */
    pointerMove(ray:AimRay){if(!aiming)return;const p=rayPlane(ray,aiming.aim.anchor.y);if(p){aiming.drag=p;aiming.dirty=true;}},
    /** Release: a pull long enough becomes ONE launch intention at the next fixed tick. */
    pointerUp(){if(!aiming)return;updateAim();if(aiming&&aiming.power>=SLINGSHOT.minPower)pendingShot={id:aiming.id,yaw:aiming.yaw,power:aiming.power,loft:aiming.aim.canLoft?aiming.loft:0};cancelAim();},
    /** Wheel while aiming changes the shot height; true = consumed (no camera zoom). */
    wheel(deltaY:number):boolean{
      if(!aiming)return false;if(!aiming.aim.canLoft)return true;
      aiming.loft=Math.max(0,Math.min(1,Math.round((aiming.loft-Math.sign(deltaY)*SLINGSHOT.loftStep)*10)/10));aiming.dirty=true;return true;
    },
    cancelAim,
    get aiming(){return !!aiming;},
    /** Points of the current trajectory preview (0 = hidden). */
    get previewPoints(){return previewPoints;},
    /** Digit keys choose the mode of the game the player stands in (before starting). */
    key(code:string):boolean{
      const m=/^(?:Digit|Numpad)([1-9])$/.exec(code);if(!m||disposed)return false;
      const r=here(actor.x,actor.z),modes=r?modesOf(r):[];
      if(!r||r.state!=='READY'||!modes.length)return false;
      const mode=modes[Number(m[1])-1];if(!mode)return true;
      modeChoice.set(r.def.id,mode.id);o.showInfo(r.def.name+' : mode '+mode.label);lastHint='';return true;
    },
    render(alpha:number){for(const v of views.values())v.update(alpha);},
    stats(){return {...manager.stats(),views:views.size,lastTick};},
    /** Test/metrics view (no references escape): states, sessions and area of each instance. */
    debug(){return {...manager.stats(),views:views.size,instances:[...manager.records.values()].map(r=>({id:r.def.id,variant:r.def.variant,state:r.state,area:{...r.def.area},
      session:r.session?{status:r.session.status,scores:{...r.session.scores},attempts:{...r.session.attempts},round:r.session.round,finished:[...r.session.finished],result:r.session.result}:null,
      snapshot:r.sim?r.sim.snapshot():null}))};},
    dispose(){if(disposed)return;disposed=true;aiming=null;pendingShot=null;aimLine?.dispose();aimLine=null;for(const v of views.values())v.dispose();views.clear();manager.dispose();hud?.remove();},
  };
}
export type MiniGameHost=ReturnType<typeof createMiniGameHost>;
