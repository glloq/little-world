/**
 * Target family (doc 107 §extensibilité): throwing games on the SAME BallWorld, push/launch
 * helpers and session rules as the ball family. Only throwing turns and target scoring live
 * here — no physics, no session, no lifecycle code.
 *  - cans: knock a pyramid of cans off a table (cans = sleeping spheres woken by contact,
 *    supported cans woken when what holds them moves);
 *  - bullseye: hit a vertical board, points by distance to the centre, the ball sticks.
 */
import type {MiniGameVariantId} from '../catalog.ts';
import {worldToArea,type MiniGameElementV1} from '../schema.ts';
import {addScore,completeTurn,currentPlayer,emit,playerScoreKey,type MiniGameSessionState} from '../session.ts';
import type {MiniGameActor,MiniGameStepContext} from '../types.ts';
import {areaBox} from '../ball/simulation.ts';
import {el,home,launchVelocity,obj,type BallGame,type BallVariantLogic,type ShotPlan} from '../ball/kit.ts';

interface ThrowState {phase:'aim'|'flying'|'settle';ticks:number;thrower:string|null;shot:number;knocked:number[];/** All targets down announced (once per round). */cleared?:boolean}
const CAN={radius:.12,mass:.15,restitution:.3,rolling:2};
/** Rings of a board, centre first (points 5…1). */
const RINGS=5,THROW_REACH=1.8,HAND_HEIGHT=1,FLIGHT_TICKS=150,SETTLE_TICKS=60;

const shots=(g:BallGame)=>g.def.rules.attempts??3;
const tee=(g:BallGame)=>home(g.def,el(g.def,'tee')[0]);
const elevation=(g:BallGame,e:MiniGameElementV1)=>{const p=home(g.def,e);return g.env.height(p.x,p.z)+(e.height??1);};

function resetField(g:BallGame,st:ThrowState){
  const w=g.world,n=shots(g);
  for(let i=0;i<n;i++){w.setEnabled(i,false);const t=tee(g);w.place(i,t.x,undefined,t.z);}
  for(let i=n;i<w.count;i++){const e=g.def.elements.find(x=>x.id===w.ids[i])!,p=home(g.def,e);w.setEnabled(i,true);w.place(i,p.x,elevation(g,e),p.z);}
  st.phase='aim';st.ticks=0;st.thrower=null;st.shot=0;st.knocked=[];st.cleared=false;
}
/** Throwing hand above the tee mark: the slingshot anchor and the ball's release point. */
const hand=(g:BallGame)=>{const t=tee(g);return {x:t.x,y:g.env.height(t.x,t.z)+HAND_HEIGHT,z:t.z};};
function throwPlan(g:BallGame,s:MiniGameSessionState,a:MiniGameActor,yaw:number,power:number,loft:number):ShotPlan|string{
  const st=g.state as ThrowState;
  if(st.phase!=='aim')return 'Attendez la fin du lancer';
  const turn=currentPlayer(s);if(turn!==a.id)return 'Au tour de '+turn;
  const t=tee(g);if(Math.hypot(a.x-t.x,a.z-t.z)>THROW_REACH)return 'Placez-vous sur la marque de lancer';
  const used=s.attempts[a.id]??0;if(used>=shots(g))return 'Plus de balle pour cette manche';
  const h=hand(g);
  return {ball:used,from:{x:h.x+Math.sin(yaw)*.4,y:h.y,z:h.z+Math.cos(yaw)*.4},...launchVelocity(g,yaw,power,loft,5)};
}
function thrown(g:BallGame,s:MiniGameSessionState,a:MiniGameActor,plan:ShotPlan){
  const st=g.state as ThrowState;s.attempts[a.id]=(s.attempts[a.id]??0)+1;st.phase='flying';st.ticks=0;st.thrower=a.id;st.shot=plan.ball;
}
/** Shared end of throw / end of round, with a settle delay so falling targets still count. */
function advance(g:BallGame,ctx:MiniGameStepContext,allDown:boolean){
  const st=g.state as ThrowState,w=g.world,i=st.shot;st.ticks++;
  if(st.phase==='flying'){
    const l=worldToArea(g.def.area,w.px[i],w.pz[i]);
    const gone=Math.abs(l.x)>g.def.area.halfWidth+3||Math.abs(l.z)>g.def.area.halfLength+3||w.inWater[i]===1;
    if(!(w.asleep[i]||gone||st.ticks>FLIGHT_TICKS))return;
    if(gone)w.setEnabled(i,false);
    const thrower=st.thrower!;
    st.phase=(ctx.session.attempts[thrower]??0)>=shots(g)||allDown?'settle':'aim';st.ticks=0;
    return;
  }
  if(st.phase==='settle'&&(w.awakeCount===0||st.ticks>SETTLE_TICKS)){
    const thrower=st.thrower!;resetField(g,st);completeTurn(ctx.session,thrower,ctx.tick,ctx.events);
  }
}
const base={
  capacity:(def:Parameters<BallVariantLogic['capacity']>[0])=>(def.rules.attempts??3)+def.elements.filter(e=>e.kind==='target').length,
  initial:():ThrowState=>({phase:'aim',ticks:0,thrower:null,shot:0,knocked:[]}),
  parseState(raw:unknown){
    if(!obj(raw)||!['aim','flying','settle'].includes(raw.phase as string)||!Number.isSafeInteger(raw.ticks)||!Number.isSafeInteger(raw.shot)||
       !Array.isArray(raw.knocked)||!raw.knocked.every(Number.isSafeInteger)||raw.thrower!==null&&typeof raw.thrower!=='string')throw Error('État de lancer invalide');
    return structuredClone(raw);
  },
  reset(g:BallGame){resetField(g,g.state as ThrowState);},
  shot:throwPlan,
  launched:thrown,
  aim(g:BallGame,s:MiniGameSessionState,a:MiniGameActor){
    const st=g.state as ThrowState,t=tee(g);
    return st.phase==='aim'&&currentPlayer(s)===a.id&&Math.hypot(a.x-t.x,a.z-t.z)<=THROW_REACH&&(s.attempts[a.id]??0)<shots(g)?hand(g):null;
  },
  hint(g:BallGame,s:MiniGameSessionState,a:MiniGameActor){
    if(s.status!=='active')return null;const st=g.state as ThrowState,who=currentPlayer(s);
    if(st.phase!=='aim')return 'En vol…';
    return `Manche ${Math.floor(s.round/Math.max(1,s.players.length))+1}/${g.def.rules.rounds} · ${who===a.id?'à vous':'au tour de '+who} : balle ${(s.attempts[who??'']??0)+1}/${shots(g)} · clic sur la marque, tirez en arrière, relâchez (molette : hauteur)`;
  },
};

const cans:BallVariantLogic={
  ...base,
  setup(g){
    const n=shots(g),t=tee(g);
    for(let k=0;k<n;k++){const i=g.world.add({id:'shot-'+(k+1),x:t.x,y:g.env.height(t.x,t.z)+.1,z:t.z,radius:g.spec.physics.ballRadius,mass:g.spec.physics.ballMass,restitution:g.spec.physics.restitution,rolling:g.spec.physics.rolling,asleep:true});g.world.setEnabled(i,false);}
    for(const e of el(g.def,'target')){const p=home(g.def,e);g.world.add({id:e.id,x:p.x,y:elevation(g,e),z:p.z,...CAN,asleep:true});}
  },
  afterStep(g,ctx){
    const st=g.state as ThrowState,w=g.world,n=shots(g);
    // Support: a sleeping can resting on something that moved wakes up (chain over ticks).
    for(let i=0;i<w.count;i++){
      if(!w.enabled[i]||w.asleep[i])continue;
      for(let j=n;j<w.count;j++){
        if(j===i||!w.asleep[j]||w.py[j]<=w.py[i])continue;
        const R=w.radius[i]+w.radius[j]+.03;
        if(Math.abs(w.px[j]-w.px[i])<R&&Math.abs(w.pz[j]-w.pz[i])<R&&w.py[j]-w.py[i]<R){w.asleep[j]=0;w.idle[j]=0;}
      }
    }
    for(let j=n;j<w.count;j++){
      if(st.knocked.includes(j))continue;
      const e=g.def.elements.find(x=>x.id===w.ids[j])!,p=home(g.def,e);
      if(Math.hypot(w.px[j]-p.x,w.py[j]-elevation(g,e),w.pz[j]-p.z)>.15){
        st.knocked.push(j);emit(ctx.session,ctx.events,ctx.tick,{type:'target:hit',targetId:w.ids[j],...(st.thrower?{playerId:st.thrower}:{})});
        if(st.thrower)addScore(ctx.session,playerScoreKey(ctx.session,st.thrower),1,ctx.tick,ctx.events);
      }
    }
    const all=st.knocked.length===w.count-n;
    if(all&&!st.cleared){st.cleared=true;emit(ctx.session,ctx.events,ctx.tick,{type:'highlight',kind:'clear',...(st.thrower?{playerId:st.thrower}:{})});}
    advance(g,ctx,all);
  },
  describe(_g,_s,e){return e.type==='highlight'?'Tout renversé !':e.type==='target:hit'?'Boîte renversée !':e.type==='game:reset'?'Nouvelle manche : boîtes remises en place':null;},
};

const bullseye:BallVariantLogic={
  ...base,
  setup(g){
    const n=shots(g),t=tee(g);
    for(let k=0;k<n;k++){const i=g.world.add({id:'shot-'+(k+1),x:t.x,y:g.env.height(t.x,t.z)+.1,z:t.z,radius:g.spec.physics.ballRadius,mass:g.spec.physics.ballMass,restitution:g.spec.physics.restitution,rolling:g.spec.physics.rolling,asleep:true});g.world.setEnabled(i,false);}
    // Each board is a thin static box facing the thrower: ball collisions come from the shared engine.
    for(const e of el(g.def,'target')){const w=e.width??1.2,bottom=elevation(g,e)-w/2,box=areaBox(g.def,g.env,e.x,e.z,w,.1,w,0,.1,bottom,'board');box.minY=bottom;g.baseBoxes.push(box);}
  },
  afterStep(g,ctx){
    const st=g.state as ThrowState,w=g.world,i=st.shot;
    if(st.phase==='flying'&&w.enabled[i]&&!w.asleep[i]){
      const l=worldToArea(g.def.area,w.px[i],w.pz[i]),r=w.radius[i];
      for(const e of el(g.def,'target')){
        const half=(e.width??1.2)/2,dy=w.py[i]-elevation(g,e),dx=l.x-e.x;
        if(Math.abs(l.z-(e.z-.05))>r+.06||Math.abs(dx)>half+r||Math.abs(dy)>half+r)continue;
        const d=Math.hypot(dx,dy),points=d<=half?RINGS-Math.min(RINGS-1,Math.floor(d/half*RINGS)):0;
        // The ball sticks to the board (scored once), like a dart.
        w.vx[i]=w.vy[i]=w.vz[i]=0;w.asleep[i]=1;
        if(points>0){emit(ctx.session,ctx.events,ctx.tick,{type:'target:hit',targetId:e.id,...(st.thrower?{playerId:st.thrower}:{})});
          if(points===RINGS)emit(ctx.session,ctx.events,ctx.tick,{type:'highlight',kind:'bullseye',targetId:e.id,...(st.thrower?{playerId:st.thrower}:{})});
          if(st.thrower)addScore(ctx.session,playerScoreKey(ctx.session,st.thrower),points,ctx.tick,ctx.events);}
        break;
      }
    }
    advance(g,ctx,false);
  },
  describe(_g,_s,e,local){
    if(e.type==='highlight')return 'En plein centre !';
    if(e.type==='score:changed'&&e.key===local)return 'Cible touchée · total '+e.score;
    return e.type==='game:reset'?'Nouvelle manche':null;
  },
};
export const TARGET_VARIANTS:Partial<Record<MiniGameVariantId,BallVariantLogic>>={cans,bullseye};
