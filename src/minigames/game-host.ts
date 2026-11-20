/**
 * Browser adapter between the solo game and the MiniGameManager (doc 107). Loaded by
 * main.ts only when the active island declares mini-games (or `?minigames=demo`).
 * - Proximity (every 15 ticks, hysteresis) prepares / releases instances and their views.
 * - One call per fixed 30 Hz tick: the local player becomes an actor, F is turned into
 *   join+start or a charged launch intention, the manager steps ACTIVE sessions only.
 * - Presentation (views, HUD) reads the simulation; nothing here changes the player physics.
 */
import type {Object3D} from 'three';
import type {WorldCollisionQuery} from '../physics/collision-world.ts';
import type {GameplayEvent} from '../gameplay/events.ts';
import {MINIGAME_VARIANTS} from './catalog.ts';
import {createMiniGameManager,type MiniGameInstanceRecord} from './manager.ts';
import {worldToArea,type MiniGameInstanceV1} from './schema.ts';
import {sessionSeconds,type MiniGameEvent} from './session.ts';
import type {MiniGameActor,MiniGameEnvironment,MiniGameView} from './types.ts';

export interface HostPlayer {position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};mode:string;body?:{radius?:number}}
export interface MiniGameHostOptions {
  parent:Object3D;defs:readonly MiniGameInstanceV1[];
  collision:WorldCollisionQuery|null;height(x:number,z:number):number;water(x:number,z:number):number|null;
  showInfo(text:string,kind?:'info'|'success'|'warning'):void;
  emit?(event:GameplayEvent):void;
  hudHost?:HTMLElement|null;
}
export const LOCAL_PLAYER='local';
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
    colliders:o.collision?{add:c=>o.collision!.add({id:c.id,shape:'box',position:c.position,size:c.size,enabled:()=>true}),remove:id=>o.collision!.remove(id)}:undefined,
    onError:(id,e)=>{console.warn('Mini-jeu désactivé',id,e);o.showInfo('Activité indisponible : '+(manager.records.get(id)?.def.name??id),'warning');}});
  const views=new Map<string,MiniGameView>(),loadingViews=new Set<string>();
  const actor:MiniGameActor={id:LOCAL_PLAYER,x:0,y:0,z:0,vx:0,vy:0,vz:0,radius:.4,height:1,mode:'ground'};
  const actors=[actor],none:MiniGameActor[]=[];
  let seq=0,held=0,charging=false,wasHeld=false,hintAt=-1e9,lastHint='',lastTick=0,disposed=false;
  const hud=o.hudHost?document.createElement('div'):null;
  if(hud){hud.className='minigame-hud';hud.hidden=true;hud.setAttribute('role','status');
    Object.assign(hud.style,{position:'fixed',left:'50%',top:'12px',transform:'translateX(-50%)',padding:'6px 12px',borderRadius:'8px',background:'rgba(20,24,30,.72)',color:'#fff',font:'14px system-ui,sans-serif',pointerEvents:'none',zIndex:'20',maxWidth:'90vw',textAlign:'center'});
    o.hudHost!.append(hud);}

  async function prepare(id:string){
    const r=await manager.prepare(id);
    if(disposed||r.state!=='READY'||!r.module||!r.sim||views.has(id)||loadingViews.has(id))return;
    loadingViews.add(id);
    try{const factory=await r.module.loadView();if(!disposed&&r.sim&&manager.records.get(id)?.sim===r.sim)views.set(id,factory.create(o.parent,r.sim,env));}
    finally{loadingViews.delete(id);}
  }
  function release(id:string){views.get(id)?.dispose();views.delete(id);manager.release(id);}
  const within=(r:MiniGameInstanceRecord,x:number,z:number,margin:number)=>{const l=worldToArea(r.def.area,x,z);return Math.abs(l.x)<=r.def.area.halfWidth+margin&&Math.abs(l.z)<=r.def.area.halfLength+margin;};
  /** Loaded instance whose area (plus a margin) contains the player. */
  function here(x:number,z:number,margin=1.5):MiniGameInstanceRecord|null{
    for(const r of manager.records.values())if(r.sim&&(r.state==='READY'||r.state==='ACTIVE')&&within(r,x,z,margin))return r;
    return null;
  }
  const playing=()=>{for(const r of manager.records.values())if(r.state==='ACTIVE'&&r.session?.players.some(p=>p.id===LOCAL_PLAYER))return r;return null;};
  const send=(r:MiniGameInstanceRecord,tick:number,body:{type:'join'|'start'|'abandon'}|{type:'launch';yaw:number;power:number})=>manager.submit({instanceId:r.def.id,playerId:LOCAL_PLAYER,tick,seq:++seq,...body});
  function describe(r:MiniGameInstanceRecord,e:MiniGameEvent){
    const teams=r.def.teams??[],name=(id:string)=>teams.find(t=>t.id===id)?.name??(id===LOCAL_PLAYER?'Vous':id);
    switch(e.type){
      case 'game:start':o.showInfo(r.def.name+' : c’est parti !','success');break;
      case 'target:hit':if(r.def.variant==='football')o.showInfo('BUT !','success');else if(r.def.variant==='minigolf'&&e.playerId===LOCAL_PLAYER)o.showInfo('Dans le trou !','success');break;
      case 'ball:out':o.showInfo(r.def.variant==='minigolf'?'Balle sortie : +1 coup de pénalité':'Balle sortie','warning');break;
      case 'game:reset':if(r.def.variant==='bowling')o.showInfo('Nouvelle manche : quilles relevées');break;
      case 'game:finish':{
        const won=e.winners.includes(LOCAL_PLAYER)||e.winners.some(w=>r.session?.players.find(p=>p.id===LOCAL_PLAYER)?.teamId===w);
        const scores=Object.entries(r.session?.scores??{}).map(([k,v])=>name(k)+' '+v).join(' · ');
        o.showInfo(`${r.def.name} terminé${e.winners.length?' · vainqueur : '+e.winners.map(name).join(', '):' · égalité'} (${scores})`,'success');
        o.emit?.({type:'minigame.finished',instanceId:r.def.id,variant:r.def.variant,seconds:r.session?sessionSeconds(r.session):0,won});break;
      }
      case 'game:abandon':o.showInfo(r.def.name+' : partie abandonnée');break;
    }
  }
  function updateHud(r:MiniGameInstanceRecord|null){
    if(!hud)return;
    let text='';
    if(r?.sim&&r.state==='ACTIVE'&&r.session){
      text=r.sim.hint(r.session,actor)??'';
      if(held>0){const style=MINIGAME_VARIANTS[r.def.variant].physics.command,p=Math.min(1,held/CHARGE[style]);text+=' · puissance '+'▮'.repeat(Math.round(p*10))+'▯'.repeat(10-Math.round(p*10));}
      if(r.def.rules.timeLimitSeconds)text+=' · '+Math.max(0,Math.ceil(r.def.rules.timeLimitSeconds-sessionSeconds(r.session)))+' s';
    }else if(r)text=`${r.def.name} · F : commencer (${r.def.playersMin>1&&r.def.rules.practice?'entraînement solo':'solo'})`;
    if(text!==lastHint){lastHint=text;hud.textContent=text;hud.hidden=!text;}
  }
  return {
    manager,env,
    /** True when F belongs to a mini-game (inside a loaded area): gathering/digging is skipped. */
    capturesAction(p:HostPlayer){return !!here(p.position.x,p.position.z);},
    tick(tickNo:number,dt:number,p:HostPlayer,actionHeld:boolean,aimYaw:number){
      if(disposed)return;
      lastTick=tickNo;
      actor.x=p.position.x;actor.y=p.position.y;actor.z=p.position.z;actor.vx=p.velocity.x;actor.vy=p.velocity.y;actor.vz=p.velocity.z;
      actor.mode=p.mode;actor.radius=p.body?.radius??.4;
      if(tickNo%15===0){const near=manager.proximity(actor.x,actor.z);for(const id of near.release)release(id);for(const id of near.prepare)void prepare(id);}
      let mine=playing();
      // Leaving the field of one's game abandons it (no simulation left running).
      if(mine&&!within(mine,actor.x,actor.z,25)){send(mine,tickNo,{type:'abandon'});mine=null;held=0;charging=false;}
      const inside=mine??here(actor.x,actor.z);
      if(inside){
        if(inside.state==='ACTIVE'&&mine===inside){
          // Only a press that BEGINS during the game charges a launch (not the one that started it).
          if(actionHeld&&!wasHeld){charging=true;held=0;}
          if(actionHeld&&charging)held+=dt;
          else if(!actionHeld&&charging){const style=MINIGAME_VARIANTS[inside.def.variant].physics.command,c=Math.min(1,held/CHARGE[style]);
            send(inside,tickNo,{type:'launch',yaw:aimYaw,power:style==='putt'?c:.3+.7*c});held=0;charging=false;}
        }else{charging=false;held=0;if(actionHeld&&!wasHeld&&inside.state==='READY'){send(inside,tickNo,{type:'join'});send(inside,tickNo,{type:'start'});}}
      }else{held=0;charging=false;}
      wasHeld=actionHeld;
      const result=manager.tick(tickNo,dt,inside||mine?actors:none);
      for(const e of result.events){const r=manager.records.get(e.sessionId.replace(/:s\d+$/,''));if(r)describe(r,e);}
      for(const f of result.refusals)if(f.playerId===LOCAL_PLAYER&&tickNo-hintAt>20){hintAt=tickNo;o.showInfo(f.reason,'warning');}
      updateHud(inside);
    },
    render(alpha:number){for(const v of views.values())v.update(alpha);},
    stats(){return {...manager.stats(),views:views.size,lastTick};},
    /** Test/metrics view (no references escape): states, sessions and area of each instance. */
    debug(){return {...manager.stats(),views:views.size,instances:[...manager.records.values()].map(r=>({id:r.def.id,variant:r.def.variant,state:r.state,area:{...r.def.area},
      session:r.session?{status:r.session.status,scores:{...r.session.scores},attempts:{...r.session.attempts},round:r.session.round,finished:[...r.session.finished],result:r.session.result}:null,
      snapshot:r.sim?r.sim.snapshot():null}))};},
    dispose(){if(disposed)return;disposed=true;for(const v of views.values())v.dispose();views.clear();manager.dispose();hud?.remove();},
  };
}
export type MiniGameHost=ReturnType<typeof createMiniGameHost>;
