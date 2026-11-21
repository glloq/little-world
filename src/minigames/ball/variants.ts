/**
 * Ball variant rules (doc 107): each variant is a small table of hooks over the SAME
 * BallWorld, push module and session helpers. No physics here: goals, pins, holes, turns.
 * Shots are pure plans (`shot`) shared by the real launch and the trajectory preview.
 */
import type {MiniGameVariantId} from '../catalog.ts';
import {areaToWorld,insideLane,worldToArea,type MiniGameElementV1,type MiniGameInstanceV1} from '../schema.ts';
import {addScore,completeTurn,currentPlayer,emit,playerScoreKey,type MiniGameEvent,type MiniGameSessionState} from '../session.ts';
import type {StaticBox} from './ball-physics.ts';
import type {FloorSpec} from './floors.ts';
import {PUSH,reachTo} from './push.ts';
import {areaBox,defaultFloor,perimeterWalls,rectWalls,WALL_THICKNESS} from './simulation.ts';
import {angle,ballAnchor,ballSpec,el,home,launchVelocity,obj,type BallGame,type BallVariantLogic} from './kit.ts';

export type {BallGame,BallVariantLogic} from './kit.ts';

/* ---------------- Football: closed pitch, one ball, two goals, team score. ---------------- */
interface FootballState {lastToucher:string|null}
/** Gates in the middle of both touchlines (the hamster walks in and out there). */
export const FOOTBALL_GATE=1.4;
const football:BallVariantLogic={
  capacity:()=>1,
  initial:()=>({lastToucher:null} satisfies FootballState),
  parseState:raw=>{if(!obj(raw)||raw.lastToucher!==null&&typeof raw.lastToucher!=='string')throw Error('État football invalide');return {lastToucher:raw.lastToucher};},
  wallOpenings:def=>[
    ...el(def,'goal').map(g=>({side:(g.z>=0?'far':'near') as 'far'|'near',at:g.x,width:(g.width??4)+.12})),
    {side:'left',at:0,width:FOOTBALL_GATE},{side:'right',at:0,width:FOOTBALL_GATE},
  ],
  setup(g){
    g.world.add(ballSpec(g,'ball',home(g.def,el(g.def,'ball')[0])));
    for(const goal of el(g.def,'goal')){
      const w=goal.width??4,d=goal.depth??1,h=goal.height??1.6,sign=Math.sign(goal.z)||1,ground=g.env.height(home(g.def,goal).x,home(g.def,goal).z);
      // Ball-only frame: posts, crossbar, back and sides of the net.
      for(const side of [-1,1])g.baseBoxes.push(boxAt(g,goal.x+side*w/2,goal.z+sign*d/2,.12,d+.12,h,ground,false,'net'));
      g.baseBoxes.push(boxAt(g,goal.x,goal.z+sign*d,w+.12,.1,h,ground,false,'net'),boxAt(g,goal.x,goal.z,w,.1,.1,ground+h-.1,true,'post'));
      // Player-blocking posts and net (axis-aligned bounds), registered while loaded.
      for(const side of [-1,1]){const p=home(g.def,{x:goal.x+side*w/2,z:goal.z+sign*d/2});g.colliders.push({id:`${g.def.id}:${goal.id}:post${side}`,position:{x:p.x,y:ground-.2,z:p.z},size:{x:.18,y:h+.2,z:.18}});}
    }
  },
  reset(g){const b=home(g.def,el(g.def,'ball')[0]);g.world.place(0,b.x,undefined,b.z);(g.state as FootballState).lastToucher=null;},
  shot(g,_s,a,yaw,power,loft){
    if(reachTo(g.world,0,a)>PUSH.reach+.4)return 'Approchez-vous de la balle';
    return {ball:0,...launchVelocity(g,yaw,power,loft,3)};
  },
  launched(g,_s,a){(g.state as FootballState).lastToucher=a.id;},
  aim:(g,_s,a)=>reachTo(g.world,0,a)<=PUSH.reach+.4?ballAnchor(g,0):null,
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
    // Only a lob over the walls or a ball through a gate can leave the closed pitch.
    const {halfWidth:hw,halfLength:hl}=g.def.area;
    if(Math.abs(l.x)>hw+1||Math.abs(l.z)>hl+2.5||w.inWater[0]){
      emit(ctx.session,ctx.events,ctx.tick,{type:'ball:out',ballId:'ball'});
      const p=areaToWorld(g.def.area,Math.max(-hw+.6,Math.min(hw-.6,l.x)),Math.max(-hl+.6,Math.min(hl-.6,l.z)));w.place(0,p.x,undefined,p.z);
    }
  },
  describe(_g,_s,e){return e.type==='target:hit'?'BUT !':e.type==='ball:out'?'Balle sortie':null;},
  hint(g,s){
    const t=g.def.teams??[];if(s.status!=='active')return null;
    return `${t[0]?.name??''} ${s.scores[t[0]?.id]??0} – ${s.scores[t[1]?.id]??0} ${t[1]?.name??''} · poussez la balle ; près d’elle : clic sur la balle, tirez en arrière, relâchez (molette : hauteur)`;
  },
};
function boxAt(g:BallGame,x:number,z:number,width:number,depth:number,height:number,base:number,floating:boolean,tag:StaticBox['tag']):StaticBox{
  const c=home(g.def,{x,z}),h=g.def.area.heading;
  return {cx:c.x,cz:c.z,hx:width/2,hz:depth/2,minY:floating?base:base-1,maxY:floating?base+height:base+height,cos:Math.cos(h),sin:Math.sin(h),restitution:.5,tag};
}

/* ---------------- Bowling: lane + gutters, two modes, pins, throws per frame. ------------- */
interface BowlingState {phase:'aim'|'rolling';rollTicks:number;knocked:number[];thrower:string|null;mode:string;gutter:boolean}
const PIN={radius:.14,mass:.45,restitution:.35,rolling:2.5};
/** Gutter width and depth below the lane (m); bumpers rise this high above the lane. */
export const BOWLING_GUTTER={width:.35,drop:.12,bumper:.24} as const;
const bumperCache=new WeakMap<BallGame,StaticBox[]>();
/** Beginner bumpers: one long box over each gutter (lazily built per game). */
function bumpers(g:BallGame){
  let b=bumperCache.get(g);if(b)return b;
  const {halfWidth:hw,halfLength:hl}=g.def.area,x=hw-BOWLING_GUTTER.width/2;
  b=[-x,x].map(cx=>areaBox(g.def,g.env,cx,0,BOWLING_GUTTER.width,2*hl,BOWLING_GUTTER.drop+BOWLING_GUTTER.bumper,0,.7,undefined,'bumper'));
  bumperCache.set(g,b);return b;
}
function bowlingBoxes(g:BallGame){g.world.boxes=[...g.baseBoxes,...((g.state as BowlingState).mode==='beginner'?bumpers(g):[])];}
const bowling:BallVariantLogic={
  capacity:def=>1+el(def,'pin').length,
  initial:()=>({phase:'aim',rollTicks:0,knocked:[],thrower:null,mode:'beginner',gutter:false} satisfies BowlingState),
  parseState(raw){
    if(!obj(raw)||!['aim','rolling'].includes(raw.phase as string)||!Number.isSafeInteger(raw.rollTicks)||!Array.isArray(raw.knocked)||!raw.knocked.every(Number.isSafeInteger)||
       raw.thrower!==null&&typeof raw.thrower!=='string'||!['beginner','normal'].includes(raw.mode as string)||typeof raw.gutter!=='boolean')throw Error('État bowling invalide');
    return structuredClone(raw);
  },
  floors(def):FloorSpec[]{
    const {halfWidth:hw,halfLength:hl}=def.area,G=BOWLING_GUTTER,raise=.05;
    // Lane, two gutters and the kerbs the side walls stand on, all at one level (group).
    const L=hl+WALL_THICKNESS,t=WALL_THICKNESS;
    return [{id:'lane',x:0,z:0,halfWidth:hw-G.width,halfLength:L,material:'lane',raise,group:'alley'},
      ...[-1,1].map(s=>({id:s<0?'gutter-left':'gutter-right',x:s*(hw-G.width/2),z:0,halfWidth:G.width/2,halfLength:hl,material:'gutter' as const,raise,group:'alley',drop:G.drop})),
      ...[-1,1].map(s=>({id:s<0?'kerb-left':'kerb-right',x:s*(hw+t/2),z:0,halfWidth:t/2,halfLength:L,material:'lane' as const,raise,group:'alley'}))];
  },
  setup(g){
    g.world.add(ballSpec(g,'ball',home(g.def,el(g.def,'tee')[0])));
    for(const pin of el(g.def,'pin')){const p=home(g.def,pin);g.world.add({id:pin.id,x:p.x,y:g.env.height(p.x,p.z)+PIN.radius,z:p.z,...PIN,asleep:true});}
  },
  reset(g,s){
    const st=g.state as BowlingState;resetPins(g);placeBall(g);
    Object.assign(st,{phase:'aim',rollTicks:0,knocked:[],thrower:null,gutter:false,mode:s.mode==='normal'?'normal':'beginner'});bowlingBoxes(g);
  },
  restored:bowlingBoxes,
  shot(g,s,a,yaw,power){
    const st=g.state as BowlingState;
    if(st.phase!=='aim')return 'Attendez la fin du lancer';
    const turn=currentPlayer(s);if(turn!==a.id)return 'Au tour de '+turn;
    if(reachTo(g.world,0,a)>PUSH.reach+.6)return 'Approchez-vous de la boule';
    // A bowling ball is rolled, never lofted, within ±17° of the lane axis.
    const aim=g.def.area.heading+Math.max(-.3,Math.min(.3,angle(yaw-g.def.area.heading)));
    return {ball:0,...launchVelocity(g,aim,power,0,3)};
  },
  launched(g,s,a){const st=g.state as BowlingState;st.phase='rolling';st.rollTicks=0;st.thrower=a.id;st.gutter=false;s.attempts[a.id]=(s.attempts[a.id]??0)+1;},
  aim(g,s,a){const st=g.state as BowlingState;return st.phase==='aim'&&currentPlayer(s)===a.id&&reachTo(g.world,0,a)<=PUSH.reach+.6?ballAnchor(g,0):null;},
  afterStep(g,ctx){
    const st=g.state as BowlingState,w=g.world;if(st.phase!=='rolling')return;
    st.rollTicks++;
    const {halfWidth:hw,halfLength:hl}=g.def.area,l=worldToArea(g.def.area,w.px[0],w.pz[0]);
    // Normal mode: a ball over a gutter drops in and rolls straight to the end of the lane.
    if(st.mode==='normal'&&Math.abs(l.x)>hw-BOWLING_GUTTER.width&&Math.abs(l.z)<hl){
      if(!st.gutter){st.gutter=true;emit(ctx.session,ctx.events,ctx.tick,{type:'ball:out',ballId:'ball'});}
      const h=g.def.area.heading,sx=Math.sin(h),cz=Math.cos(h),along=Math.max(1.5,w.vx[0]*sx+w.vz[0]*cz);
      const p=areaToWorld(g.def.area,Math.sign(l.x)*(hw-BOWLING_GUTTER.width/2),l.z);
      w.px[0]=p.x;w.pz[0]=p.z;w.vx[0]=sx*along;w.vz[0]=cz*along;
    }
    for(let i=1;i<w.count;i++){
      if(!w.enabled[i]||st.knocked.includes(i))continue;
      const pin=g.def.elements.find(e=>e.id===w.ids[i])!,p=home(g.def,pin);
      if(Math.hypot(w.px[i]-p.x,w.pz[i]-p.z)>.1||w.hitSpeed[i]>.6){
        st.knocked.push(i);emit(ctx.session,ctx.events,ctx.tick,{type:'target:hit',targetId:w.ids[i],...(st.thrower?{playerId:st.thrower}:{})});
        if(st.thrower)addScore(ctx.session,playerScoreKey(ctx.session,st.thrower),1,ctx.tick,ctx.events);
      }
    }
    const done=l.z>hl-.2||Math.abs(l.x)>hw+.5||w.inWater[0]||st.rollTicks>240||st.rollTicks>15&&w.awakeCount===0;
    if(!done)return;
    for(const i of st.knocked)w.setEnabled(i,false); // Fallen pins are cleared between throws.
    placeBall(g);st.phase='aim';st.gutter=false;
    const thrower=st.thrower;st.thrower=null;
    if(!thrower)return;
    if(st.knocked.length===w.count-1||(ctx.session.attempts[thrower]??0)>=(g.def.rules.attempts??2)){
      resetPins(g);st.knocked=[];completeTurn(ctx.session,thrower,ctx.tick,ctx.events);
    }
  },
  describe(_g,_s,e){return e.type==='game:reset'?'Nouvelle manche : quilles relevées':e.type==='ball:out'?'Rigole !':null;},
  hint(g,s,a){
    if(s.status!=='active')return null;const st=g.state as BowlingState,who=currentPlayer(s);
    if(st.phase==='rolling')return st.gutter?'Dans la rigole…':'La boule roule…';
    const mode=st.mode==='normal'?'Normal':'Débutant';
    return `${mode} · manche ${Math.floor(s.round/Math.max(1,s.players.length))+1}/${g.def.rules.rounds} · ${who===a.id?'à vous':'au tour de '+who} : lancer ${(s.attempts[who??'']??0)+1}/${g.def.rules.attempts} · clic sur la boule, tirez en arrière, relâchez`;
  },
};
function placeBall(g:BallGame){const t=home(g.def,el(g.def,'tee')[0]);g.world.place(0,t.x,undefined,t.z);}
function resetPins(g:BallGame){
  const w=g.world;for(let i=1;i<w.count;i++){const pin=g.def.elements.find(e=>e.id===w.ids[i])!,p=home(g.def,pin);w.setEnabled(i,true);w.place(i,p.x,undefined,p.z);}
}

/* ---------------- Mini-golf: a course of staged holes, one ball per player, strokes. ------- */
interface GolfState {owners:Record<string,number>;lastRest:Record<string,{x:number;z:number}>;
  /** Current hole of each player (0-based) and strokes played on each finished hole. */
  stage:Record<string,number>;cards:Record<string,number[]>}
const HOLE_RADIUS=.22;
/** Maximum capture speed (m/s) at the rim and through the centre of the cup. */
export const HOLE_CAPTURE={rim:.9,centre:2.6} as const;
/** One hole of a course: its lane (null = historical single hole over the whole area). */
export interface GolfStage {index:number;lane:MiniGameElementV1|null;tee:MiniGameElementV1;hole:MiniGameElementV1}
export function golfCourse(def:MiniGameInstanceV1):GolfStage[]{
  const lanes=el(def,'lane');
  if(!lanes.length)return [{index:0,lane:null,tee:el(def,'tee')[0],hole:el(def,'hole')[0]}];
  return lanes.map((_,k)=>({index:k,lane:lanes.find(l=>l.stage===k)!,tee:def.elements.find(e=>e.kind==='tee'&&e.stage===k)!,hole:def.elements.find(e=>e.kind==='hole'&&e.stage===k)!}));
}
const laneRect=(l:MiniGameElementV1)=>({x:l.x,z:l.z,width:l.width??2,depth:l.depth??6,yaw:l.yaw??0});
const stageOf=(g:BallGame,player:string)=>golfCourse(g.def)[(g.state as GolfState).stage[player]??0];
/** Strokes allowed per hole before the ball is picked up (+1). */
const maxStrokes=(def:MiniGameInstanceV1)=>def.rules.attempts??8;
const minigolf:BallVariantLogic={
  capacity:def=>def.playersMax,
  initial:()=>({owners:{},lastRest:{},stage:{},cards:{}} satisfies GolfState),
  parseState(raw,def){
    const n=golfCourse(def).length;
    if(!obj(raw)||!obj(raw.owners)||!obj(raw.lastRest)||!Object.values(raw.owners).every(v=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<def.playersMax))throw Error('État mini-golf invalide');
    const stage=obj(raw.stage)?raw.stage:{},cards=obj(raw.cards)?raw.cards:{}; // Older snapshots: single hole.
    if(!Object.values(stage).every(v=>Number.isSafeInteger(v)&&(v as number)>=0&&(v as number)<n)||!Object.values(cards).every(c=>Array.isArray(c)&&c.every(Number.isSafeInteger)))throw Error('État mini-golf invalide');
    return structuredClone({...raw,stage,cards});
  },
  floors(def):FloorSpec[]{
    const lanes=el(def,'lane');if(!lanes.length)return defaultFloor(def);
    // The deck runs under the borders so they stand on it (and follow its ramps).
    return lanes.map(l=>({id:l.id,x:l.x,z:l.z,halfWidth:(l.width??2)/2+WALL_THICKNESS,halfLength:(l.depth??6)/2+WALL_THICKNESS,yaw:l.yaw??0,material:'green' as const,shape:l.shape??'flat',slope:l.slope??0,raise:.12}));
  },
  walls(g){
    const h=g.spec.physics.walls?g.spec.physics.walls.height:.15,lanes=el(g.def,'lane');
    return lanes.length?lanes.flatMap(l=>rectWalls(g.def,g.env,laneRect(l),h)):perimeterWalls(g.def,g.env,h);
  },
  setup(g){const t=home(g.def,golfCourse(g.def)[0].tee);for(let k=0;k<g.def.playersMax;k++){const i=g.world.add(ballSpec(g,'ball-'+(k+1),t));g.world.setEnabled(i,false);}},
  reset(g,s){
    const st=g.state as GolfState;st.owners={};st.lastRest={};st.stage={};st.cards={};
    for(let i=0;i<g.world.count;i++)g.world.setEnabled(i,false);
    s.players.forEach((p,k)=>assignBall(g,p.id,k));
  },
  shot(g,s,a,yaw,power,loft){
    const st=g.state as GolfState;
    if(s.finished.includes(a.id))return 'Parcours terminé';
    const i=st.owners[a.id];if(i===undefined)return 'Balle pas encore posée'; // Late joiners get one next tick.
    if(!g.world.asleep[i])return 'Attendez que la balle s’arrête';
    if((s.attempts[a.id]??0)>=maxStrokes(g.def))return 'Coups épuisés';
    if(reachTo(g.world,i,a)>PUSH.reach+.3)return 'Approchez-vous de votre balle';
    return {ball:i,...launchVelocity(g,yaw,power,loft,.4)};
  },
  launched(g,s,a,plan,tick,out){
    const st=g.state as GolfState,i=plan.ball;
    st.lastRest[a.id]={x:g.world.px[i],z:g.world.pz[i]};
    s.attempts[a.id]=(s.attempts[a.id]??0)+1;addScore(s,a.id,1,tick,out);
  },
  aim(g,s,a){
    const st=g.state as GolfState;if(s.finished.includes(a.id))return null;
    const i=st.owners[a.id];if(i===undefined)return null;
    return g.world.enabled[i]&&g.world.asleep[i]&&(s.attempts[a.id]??0)<maxStrokes(g.def)&&reachTo(g.world,i,a)<=PUSH.reach+.3?ballAnchor(g,i):null;
  },
  afterStep(g,ctx){
    const st=g.state as GolfState,w=g.world,s=ctx.session,{halfWidth:hw,halfLength:hl}=g.def.area;
    for(const p of s.players)if(st.owners[p.id]===undefined){const k=Object.keys(st.owners).length;if(k<w.count)assignBall(g,p.id,k);} // Late joiners.
    for(const [player,i] of Object.entries(st.owners)){
      if(s.finished.includes(player)||!w.enabled[i])continue;
      const stage=stageOf(g,player),hole=home(g.def,stage.hole);
      // Capture speed depends on how centred the ball crosses the cup: a fast ball only
      // drops when it runs through the middle, never by grazing the rim.
      const off=Math.hypot(w.px[i]-hole.x,w.pz[i]-hole.z);
      if(off<HOLE_RADIUS&&w.speed(i)<HOLE_CAPTURE.rim+(HOLE_CAPTURE.centre-HOLE_CAPTURE.rim)*(1-off/HOLE_RADIUS)){
        emit(s,ctx.events,ctx.tick,{type:'target:hit',targetId:stage.hole.id,playerId:player});
        nextHole(g,s,player,ctx.tick,ctx.events);continue;
      }
      const l=worldToArea(g.def.area,w.px[i],w.pz[i]);
      const out=stage.lane?!insideLane(stage.lane,l.x,l.z,.3):Math.abs(l.x)>hw+.4||Math.abs(l.z)>hl+.4;
      if(out||w.inWater[i]||w.py[i]<g.env.height(w.px[i],w.pz[i])-2){
        // Out of bounds: one penalty stroke, back to the last rest position.
        emit(s,ctx.events,ctx.tick,{type:'ball:out',ballId:w.ids[i]});
        s.attempts[player]=(s.attempts[player]??0)+1;addScore(s,player,1,ctx.tick,ctx.events);
        const r=st.lastRest[player]??home(g.def,stage.tee);w.place(i,r.x,undefined,r.z);
      }
      if(w.asleep[i]&&(s.attempts[player]??0)>=maxStrokes(g.def)){
        addScore(s,player,1,ctx.tick,ctx.events); // Not holed: +1, ball picked up.
        nextHole(g,s,player,ctx.tick,ctx.events);
      }
    }
  },
  describe(g,_s,e,local){
    if(e.type==='target:hit'&&e.playerId===local)return 'Dans le trou !';
    if(e.type==='checkpoint:passed'&&e.playerId===local)return `Trou ${((g.state as GolfState).stage[local]??0)+1} : en route !`;
    return e.type==='ball:out'?'Balle sortie : +1 coup de pénalité':null;
  },
  hint(g,s,a){
    if(s.status!=='active')return null;
    const st=g.state as GolfState,n=golfCourse(g.def).length,total=s.scores[a.id]??0;
    if(s.finished.includes(a.id))return `Parcours terminé en ${total} coups ! En attente des autres joueurs`;
    const k=st.stage[a.id]??0,hole=n>1?`Trou ${k+1}/${n} · `:'';
    return `${hole}coups ${s.attempts[a.id]??0}/${maxStrokes(g.def)} · total ${total}${g.def.rules.par?' · par '+g.def.rules.par:''} · clic sur la balle, tirez en arrière, relâchez (molette : hauteur)`;
  },
};
/** Hole finished (holed or picked up): next tee, or the end of the course. */
function nextHole(g:BallGame,s:MiniGameSessionState,player:string,tick:number,out:MiniGameEvent[]){
  const st=g.state as GolfState,course=golfCourse(g.def),k=st.stage[player]??0,i=st.owners[player];
  (st.cards[player]??=[]).push(s.attempts[player]??0);s.attempts[player]=0;
  if(k+1>=course.length){g.world.setEnabled(i,false);s.finished.push(player);return;}
  st.stage[player]=k+1;placeOnTee(g,player,i);
  emit(s,out,tick,{type:'checkpoint:passed',playerId:player,checkpointId:course[k].hole.id});
}
function placeOnTee(g:BallGame,player:string,k:number){
  const st=g.state as GolfState,stage=stageOf(g,player),n=g.world.count,off=(k-(n-1)/2)*.3,yaw=stage.lane?.yaw??0;
  const p=areaToWorld(g.def.area,stage.tee.x+off*Math.cos(yaw),stage.tee.z-off*Math.sin(yaw));
  g.world.setEnabled(k,true);g.world.place(k,p.x,undefined,p.z);st.lastRest[player]={x:p.x,z:p.z};
}
function assignBall(g:BallGame,player:string,k:number){
  const st=g.state as GolfState;st.owners[player]=k;st.stage[player]??=0;placeOnTee(g,player,k);return k;
}

export const BALL_VARIANTS:Partial<Record<MiniGameVariantId,BallVariantLogic>>={football,bowling,minigolf};
