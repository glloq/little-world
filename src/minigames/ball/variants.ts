/**
 * Ball variant rules (doc 107): each variant is a small table of hooks over the SAME
 * BallWorld, push module and session helpers. No physics here: goals, pins, holes, turns.
 */
import type {MiniGameVariantId} from '../catalog.ts';
import {areaToWorld,worldToArea} from '../schema.ts';
import {addScore,completeTurn,currentPlayer,emit,playerScoreKey} from '../session.ts';
import {PUSH,launchBall,reachTo} from './push.ts';
import {angle,ballSpec,el,home,launchSpeed,obj,type BallGame,type BallVariantLogic} from './kit.ts';

export type {BallGame,BallVariantLogic} from './kit.ts';

/* ---------------- Football: one ball, two goals, team score, reset after each goal. -------- */
interface FootballState {lastToucher:string|null}
const football:BallVariantLogic={
  capacity:()=>1,
  initial:()=>({lastToucher:null} satisfies FootballState),
  parseState:raw=>{if(!obj(raw)||raw.lastToucher!==null&&typeof raw.lastToucher!=='string')throw Error('État football invalide');return {lastToucher:raw.lastToucher};},
  setup(g){
    g.world.add(ballSpec(g,'ball',home(g.def,el(g.def,'ball')[0])));
    for(const goal of el(g.def,'goal')){
      const w=goal.width??4,d=goal.depth??1,h=goal.height??1.6,sign=Math.sign(goal.z)||1,ground=g.env.height(home(g.def,goal).x,home(g.def,goal).z);
      // Ball-only frame: posts, crossbar, back and sides of the net.
      for(const side of [-1,1])g.world.boxes.push(boxAt(g,goal.x+side*w/2,goal.z+sign*d/2,.12,d+.12,h,ground));
      g.world.boxes.push(boxAt(g,goal.x,goal.z+sign*d,w+.12,.1,h,ground),boxAt(g,goal.x,goal.z,w,.1,.1,ground+h-.1,true));
      // Player-blocking posts (axis-aligned bounds of thin posts), registered while loaded.
      for(const side of [-1,1]){const p=home(g.def,{x:goal.x+side*w/2,z:goal.z});g.colliders.push({id:`${g.def.id}:${goal.id}:post${side}`,position:{x:p.x,y:ground-.2,z:p.z},size:{x:.18,y:h+.2,z:.18}});}
    }
  },
  reset(g){g.world.place(0,home(g.def,el(g.def,'ball')[0]).x,undefined,home(g.def,el(g.def,'ball')[0]).z);(g.state as FootballState).lastToucher=null;},
  launch(g,s,a,yaw,power,tick,out){
    if(reachTo(g.world,0,a)>PUSH.reach)return 'Approchez-vous de la balle';
    launchBall(g.world,0,yaw,launchSpeed(g,power,3),power*g.spec.physics.loft);(g.state as FootballState).lastToucher=a.id;
    emit(s,out,tick,{type:'ball:hit',playerId:a.id,ballId:'ball',speed:Math.round(g.world.speed(0)*100)/100});return null;
  },
  touched(g,_i,playerId){(g.state as FootballState).lastToucher=playerId;},
  afterStep(g,ctx){
    const w=g.world,st=g.state as FootballState,l=worldToArea(g.def.area,w.px[0],w.pz[0]),ground=g.env.height(w.px[0],w.pz[0]);
    for(const goal of el(g.def,'goal')){
      const sign=Math.sign(goal.z)||1;
      if(l.z*sign>Math.abs(goal.z)&&Math.abs(l.x-goal.x)<(goal.width??4)/2&&w.py[0]-ground<(goal.height??1.6)){
        const scorer=(g.def.teams??[]).find(t=>t.id!==goal.teamId)?.id;
        emit(ctx.session,ctx.events,ctx.tick,{type:'target:hit',targetId:goal.id,...(st.lastToucher?{playerId:st.lastToucher}:{})});
        if(scorer)addScore(ctx.session,scorer,1,ctx.tick,ctx.events);
        this.reset(g,ctx.session,ctx.tick,ctx.events);return;
      }
    }
    const {halfWidth:hw,halfLength:hl}=g.def.area;
    if(Math.abs(l.x)>hw+1||Math.abs(l.z)>hl+2.5||w.inWater[0]){
      emit(ctx.session,ctx.events,ctx.tick,{type:'ball:out',ballId:'ball'});
      const p=areaToWorld(g.def.area,Math.max(-hw+.6,Math.min(hw-.6,l.x)),Math.max(-hl+.6,Math.min(hl-.6,l.z)));w.place(0,p.x,undefined,p.z);
    }
  },
  describe(_g,_s,e){return e.type==='target:hit'?'BUT !':e.type==='ball:out'?'Balle sortie':null;},
  hint(g,s){
    const t=g.def.teams??[];if(s.status!=='active')return null;
    return `${t[0]?.name??''} ${s.scores[t[0]?.id]??0} – ${s.scores[t[1]?.id]??0} ${t[1]?.name??''} · poussez la balle, F : tirer`;
  },
};
function boxAt(g:BallGame,x:number,z:number,width:number,depth:number,height:number,base:number,floating=false){
  const c=home(g.def,{x,z}),h=g.def.area.heading;
  return {cx:c.x,cz:c.z,hx:width/2,hz:depth/2,minY:floating?base:base-1,maxY:floating?base+height:base+height,cos:Math.cos(h),sin:Math.sin(h),restitution:.5};
}

/* ---------------- Bowling: one ball, pins, throws per frame, frames per player. ------------ */
interface BowlingState {phase:'aim'|'rolling';rollTicks:number;knocked:number[];thrower:string|null}
const PIN={radius:.14,mass:.45,restitution:.35,rolling:2.5};
const bowling:BallVariantLogic={
  capacity:def=>1+el(def,'pin').length,
  initial:()=>({phase:'aim',rollTicks:0,knocked:[],thrower:null} satisfies BowlingState),
  parseState(raw){
    if(!obj(raw)||!['aim','rolling'].includes(raw.phase as string)||!Number.isSafeInteger(raw.rollTicks)||!Array.isArray(raw.knocked)||!raw.knocked.every(Number.isSafeInteger)||raw.thrower!==null&&typeof raw.thrower!=='string')throw Error('État bowling invalide');
    return structuredClone(raw);
  },
  setup(g){
    g.world.add(ballSpec(g,'ball',home(g.def,el(g.def,'tee')[0])));
    for(const pin of el(g.def,'pin')){const p=home(g.def,pin);g.world.add({id:pin.id,x:p.x,y:g.env.height(p.x,p.z)+PIN.radius,z:p.z,...PIN,asleep:true});}
  },
  reset(g){const st=g.state as BowlingState;resetPins(g);placeBall(g);st.phase='aim';st.rollTicks=0;st.knocked=[];st.thrower=null;},
  launch(g,s,a,yaw,power,tick,out){
    const st=g.state as BowlingState;
    if(st.phase!=='aim')return 'Attendez la fin du lancer';
    const turn=currentPlayer(s);if(turn!==a.id)return 'Au tour de '+turn;
    if(reachTo(g.world,0,a)>PUSH.reach+.6)return 'Approchez-vous de la boule';
    const aim=g.def.area.heading+Math.max(-.3,Math.min(.3,angle(yaw-g.def.area.heading)));
    launchBall(g.world,0,aim,launchSpeed(g,power,3));
    st.phase='rolling';st.rollTicks=0;st.thrower=a.id;s.attempts[a.id]=(s.attempts[a.id]??0)+1;
    emit(s,out,tick,{type:'ball:hit',playerId:a.id,ballId:'ball',speed:Math.round(g.world.speed(0)*100)/100});return null;
  },
  afterStep(g,ctx){
    const st=g.state as BowlingState,w=g.world;if(st.phase!=='rolling')return;
    st.rollTicks++;
    for(let i=1;i<w.count;i++){
      if(!w.enabled[i]||st.knocked.includes(i))continue;
      const pin=g.def.elements.find(e=>e.id===w.ids[i])!,p=home(g.def,pin);
      if(Math.hypot(w.px[i]-p.x,w.pz[i]-p.z)>.1||w.hitSpeed[i]>.6){
        st.knocked.push(i);emit(ctx.session,ctx.events,ctx.tick,{type:'target:hit',targetId:w.ids[i],...(st.thrower?{playerId:st.thrower}:{})});
        if(st.thrower)addScore(ctx.session,playerScoreKey(ctx.session,st.thrower),1,ctx.tick,ctx.events);
      }
    }
    const l=worldToArea(g.def.area,w.px[0],w.pz[0]),{halfWidth:hw,halfLength:hl}=g.def.area;
    const done=l.z>hl-.2||Math.abs(l.x)>hw+.5||w.inWater[0]||st.rollTicks>240||st.rollTicks>15&&w.awakeCount===0;
    if(!done)return;
    for(const i of st.knocked)w.setEnabled(i,false); // Fallen pins are cleared between throws.
    placeBall(g);st.phase='aim';
    const thrower=st.thrower;st.thrower=null;
    if(!thrower)return;
    if(st.knocked.length===w.count-1||(ctx.session.attempts[thrower]??0)>=(g.def.rules.attempts??2)){
      resetPins(g);st.knocked=[];completeTurn(ctx.session,thrower,ctx.tick,ctx.events);
    }
  },
  describe(_g,_s,e){return e.type==='game:reset'?'Nouvelle manche : quilles relevées':null;},
  hint(g,s,a){
    if(s.status!=='active')return null;const st=g.state as BowlingState,who=currentPlayer(s);
    return st.phase==='rolling'?'La boule roule…':`Manche ${Math.floor(s.round/Math.max(1,s.players.length))+1}/${g.def.rules.rounds} · ${who===a.id?'à vous':'au tour de '+who} : lancer ${(s.attempts[who??'']??0)+1}/${g.def.rules.attempts} · maintenir F puis relâcher`;
  },
};
function placeBall(g:BallGame){const t=home(g.def,el(g.def,'tee')[0]);g.world.place(0,t.x,undefined,t.z);}
function resetPins(g:BallGame){
  const w=g.world;for(let i=1;i<w.count;i++){const pin=g.def.elements.find(e=>e.id===w.ids[i])!,p=home(g.def,pin);w.setEnabled(i,true);w.place(i,p.x,undefined,p.z);}
}

/* ---------------- Mini-golf: one ball per player, strokes, penalties, hole. ---------------- */
interface GolfState {owners:Record<string,number>;lastRest:Record<string,{x:number;z:number}>}
const HOLE_RADIUS=.22;
/** Maximum capture speed (m/s) at the rim and through the centre of the cup. */
export const HOLE_CAPTURE={rim:.9,centre:2.6} as const;
const minigolf:BallVariantLogic={
  capacity:def=>def.playersMax,
  initial:()=>({owners:{},lastRest:{}} satisfies GolfState),
  parseState(raw,def){
    if(!obj(raw)||!obj(raw.owners)||!obj(raw.lastRest)||!Object.values(raw.owners).every(v=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<def.playersMax))throw Error('État mini-golf invalide');
    return structuredClone(raw);
  },
  setup(g){const t=home(g.def,el(g.def,'tee')[0]);for(let k=0;k<g.def.playersMax;k++){const i=g.world.add(ballSpec(g,'ball-'+(k+1),t));g.world.setEnabled(i,false);}},
  reset(g,s){
    const st=g.state as GolfState;st.owners={};st.lastRest={};
    for(let i=0;i<g.world.count;i++)g.world.setEnabled(i,false);
    s.players.forEach((p,k)=>assignBall(g,p.id,k));
  },
  launch(g,s,a,yaw,power,tick,out){
    const st=g.state as GolfState;
    if(s.finished.includes(a.id))return 'Balle déjà au trou';
    let i=st.owners[a.id];if(i===undefined){const k=Object.keys(st.owners).length;if(k>=g.world.count)return 'Plus de balle disponible';i=assignBall(g,a.id,k);}
    if(!g.world.asleep[i])return 'Attendez que la balle s’arrête';
    if((s.attempts[a.id]??0)>=(g.def.rules.attempts??8))return 'Coups épuisés';
    if(reachTo(g.world,i,a)>PUSH.reach+.3)return 'Approchez-vous de votre balle';
    st.lastRest[a.id]={x:g.world.px[i],z:g.world.pz[i]};
    s.attempts[a.id]=(s.attempts[a.id]??0)+1;addScore(s,a.id,1,tick,out);
    launchBall(g.world,i,yaw,launchSpeed(g,power,.4));
    emit(s,out,tick,{type:'ball:hit',playerId:a.id,ballId:g.world.ids[i],speed:Math.round(g.world.speed(i)*100)/100});return null;
  },
  afterStep(g,ctx){
    const st=g.state as GolfState,w=g.world,s=ctx.session,hole=home(g.def,el(g.def,'hole')[0]),{halfWidth:hw,halfLength:hl}=g.def.area;
    for(const [player,i] of Object.entries(st.owners)){
      if(s.finished.includes(player)||!w.enabled[i])continue;
      // Capture speed depends on how centred the ball crosses the cup: a fast ball only
      // drops when it runs through the middle, never by grazing the rim.
      const off=Math.hypot(w.px[i]-hole.x,w.pz[i]-hole.z);
      if(off<HOLE_RADIUS&&w.speed(i)<HOLE_CAPTURE.rim+(HOLE_CAPTURE.centre-HOLE_CAPTURE.rim)*(1-off/HOLE_RADIUS)){
        w.setEnabled(i,false);s.finished.push(player);
        emit(s,ctx.events,ctx.tick,{type:'target:hit',targetId:el(g.def,'hole')[0].id,playerId:player});continue;
      }
      const l=worldToArea(g.def.area,w.px[i],w.pz[i]);
      if(Math.abs(l.x)>hw+.4||Math.abs(l.z)>hl+.4||w.inWater[i]||w.py[i]<g.env.height(w.px[i],w.pz[i])-2){
        // Out of bounds: one penalty stroke, back to the last rest position.
        emit(s,ctx.events,ctx.tick,{type:'ball:out',ballId:w.ids[i]});
        s.attempts[player]=(s.attempts[player]??0)+1;addScore(s,player,1,ctx.tick,ctx.events);
        const r=st.lastRest[player]??home(g.def,el(g.def,'tee')[0]);w.place(i,r.x,undefined,r.z);
      }
      if(w.asleep[i]&&(s.attempts[player]??0)>=(g.def.rules.attempts??8)&&!s.finished.includes(player)){
        s.finished.push(player);addScore(s,player,1,ctx.tick,ctx.events); // Not holed: +1.
      }
    }
  },
  describe(_g,_s,e,local){return e.type==='target:hit'&&e.playerId===local?'Dans le trou !':e.type==='ball:out'?'Balle sortie : +1 coup de pénalité':null;},
  hint(g,s,a){
    if(s.status!=='active')return null;
    if(s.finished.includes(a.id))return 'Au trou ! En attente des autres joueurs';
    return `Coups ${s.attempts[a.id]??0}/${g.def.rules.attempts} · par ${g.def.rules.par??'–'} · maintenir F pour doser, relâcher pour putter`;
  },
};
function assignBall(g:BallGame,player:string,k:number){
  const st=g.state as GolfState,tee=el(g.def,'tee')[0],n=g.world.count,p=areaToWorld(g.def.area,tee.x+(k-(n-1)/2)*.4,tee.z);
  st.owners[player]=k;g.world.setEnabled(k,true);g.world.place(k,p.x,undefined,p.z);st.lastRest[player]={x:p.x,z:p.z};return k;
}

export const BALL_VARIANTS:Partial<Record<MiniGameVariantId,BallVariantLogic>>={football,bowling,minigolf};
