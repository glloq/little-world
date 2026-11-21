/**
 * Shared simulation of every ball mini-game: ONE BallWorld, the shared push module, the area
 * frame and the activity floors; variants only add their rules (variants.ts, target/…).
 * No Three.js.
 */
import {MINIGAME_VARIANTS} from '../catalog.ts';
import {areaToWorld,type MiniGameInstanceV1,type MiniGameElementV1} from '../schema.ts';
import {emit,type MiniGameEvent,type MiniGameSessionState} from '../session.ts';
import type {MiniGameActor,MiniGameAim,MiniGameEnvironment,MiniGameSimulation,MiniGameStaticCollider,MiniGameStepContext} from '../types.ts';
import {BallWorld,BALL_LIMITS,orientedBox,type BallWorldSnapshot,type StaticBox,type StaticBoxTag} from './ball-physics.ts';
import {pushBalls} from './push.ts';
import {buildFloors,withFloors,type FloorSpec} from './floors.ts';
import {MINIGAME_PROPS,type MiniGamePropId} from '../themes.ts';
import type {BallGame,BallVariantLogic,ShotPlan,WallOpening} from './kit.ts';

/** Sampled ground range under a segment of the area (walls, goals). */
function groundRange(env:MiniGameEnvironment,a:{x:number;z:number},b:{x:number;z:number}){
  let lo=Infinity,hi=-Infinity;for(let k=0;k<=8;k++){const h=env.height(a.x+(b.x-a.x)*k/8,a.z+(b.z-a.z)*k/8);lo=Math.min(lo,h);hi=Math.max(hi,h);}return {lo,hi};
}
/** Oriented box from area-frame centre/size; height above the local ground (floors included). */
export function areaBox(def:MiniGameInstanceV1,env:MiniGameEnvironment,x:number,z:number,width:number,depth:number,height:number,yaw=0,restitution=.6,base?:number,tag:StaticBoxTag='obstacle'):StaticBox{
  const c=areaToWorld(def.area,x,z),cy=Math.cos(yaw),sy=Math.sin(yaw);
  // Sample the ground along the longer side (box axes rotated by `yaw` inside the area frame).
  const half=width>=depth?{x:width/2*cy,z:-width/2*sy}:{x:depth/2*sy,z:depth/2*cy};
  const g=groundRange(env,areaToWorld(def.area,x-half.x,z-half.z),areaToWorld(def.area,x+half.x,z+half.z));
  return {...orientedBox(c.x,c.z,width,depth,g.lo-1,(base??g.hi)+height,def.area.heading+yaw,restitution),tag};
}
export const WALL_THICKNESS=.2;
/** Segments of one side [from, to] minus the openings centred on it. */
function segments(from:number,to:number,cuts:readonly {at:number;width:number}[]){
  const out:[number,number][]=[];let a=from;
  for(const c of [...cuts].sort((p,q)=>p.at-q.at)){const s=c.at-c.width/2,e=c.at+c.width/2;if(s>a)out.push([a,Math.min(s,to)]);a=Math.max(a,e);}
  if(a<to)out.push([a,to]);return out.filter(([p,q])=>q-p>.05);
}
/** Perimeter walls just outside the area, with gaps (goal mouths, gates). */
export function perimeterWalls(def:MiniGameInstanceV1,env:MiniGameEnvironment,height:number,openings:readonly WallOpening[]=[]):StaticBox[]{
  const {halfWidth:w,halfLength:l}=def.area,t=WALL_THICKNESS,out:StaticBox[]=[];
  const on=(side:WallOpening['side'])=>openings.filter(o=>o.side===side);
  for(const [side,x] of [['left',-w-t/2],['right',w+t/2]] as const)for(const [a,b] of segments(-l-t,l+t,on(side)))out.push(areaBox(def,env,x,(a+b)/2,t,b-a,height,0,.6,undefined,'wall'));
  for(const [side,z] of [['near',-l-t/2],['far',l+t/2]] as const)for(const [a,b] of segments(-w,w,on(side)))out.push(areaBox(def,env,(a+b)/2,z,b-a,t,height,0,.6,undefined,'wall'));
  return out;
}
/** Walls around a rectangle of the area frame (mini-golf lane borders). Long sides are cut
 * into ≤ 1 m pieces so a border follows a ramp or a bank instead of towering over it. */
export function rectWalls(def:MiniGameInstanceV1,env:MiniGameEnvironment,r:{x:number;z:number;width:number;depth:number;yaw:number},height:number):StaticBox[]{
  const t=WALL_THICKNESS,c=Math.cos(r.yaw),s=Math.sin(r.yaw),at=(u:number,v:number)=>({x:r.x+u*c+v*s,z:r.z-u*s+v*c});
  const hw=r.width/2,hl=r.depth/2,out:StaticBox[]=[],n=Math.max(1,Math.ceil((r.depth+2*t)/1)),step=(r.depth+2*t)/n;
  const piece=(u:number,v:number,wd:number,dp:number)=>{const p=at(u,v);out.push(areaBox(def,env,p.x,p.z,wd,dp,height,r.yaw,.6,undefined,'wall'));};
  for(const u of [-hw-t/2,hw+t/2])for(let k=0;k<n;k++)piece(u,-hl-t+step*(k+.5),t,step);
  piece(0,-hl-t/2,r.width,t);piece(0,hl+t/2,r.width,t);
  return out;
}
function obstacles(def:MiniGameInstanceV1,env:MiniGameEnvironment,elements:readonly MiniGameElementV1[]):StaticBox[]{
  const out=elements.filter(e=>e.kind==='obstacle').map(e=>areaBox(def,env,e.x,e.z,e.width??1,e.depth??.3,e.height??.35,e.yaw??0));
  // Decorative props with a declared footprint (windmill base…) also stop balls; the view
  // draws the prop itself, the box is the approximation of its collision.
  for(const e of elements){const solid=e.kind==='decor'&&e.prop?MINIGAME_PROPS[e.prop as MiniGamePropId]?.solid:undefined;
    if(solid)out.push(areaBox(def,env,e.x,e.z,solid.width,solid.depth,solid.height,e.yaw??0,.5,undefined,'prop'));}
  return out;
}
/** Player colliders covering a (possibly rotated) wall with axis-aligned boxes: one box when
 * the wall is axis-aligned, otherwise a chain whose bounds overhang the wall by ≤ 20 cm on each side. */
export function wallColliders(prefix:string,box:StaticBox,ground:number):MiniGameStaticCollider[]{
  const long=box.hx>=box.hz,len=2*Math.max(box.hx,box.hz),out:MiniGameStaticCollider[]=[];
  const ax=long?{x:box.cos,z:-box.sin}:{x:box.sin,z:box.cos},thick=2*Math.min(box.hx,box.hz);
  const n=Math.max(1,Math.ceil(len*Math.min(Math.abs(ax.x),Math.abs(ax.z))/.4)),step=len/n;
  for(let k=0;k<n;k++){
    const d=-len/2+step*(k+.5),cx=box.cx+ax.x*d,cz=box.cz+ax.z*d;
    const ex=Math.abs(ax.x)*step+Math.abs(ax.z)*thick,ez=Math.abs(ax.z)*step+Math.abs(ax.x)*thick;
    out.push({id:`${prefix}:${k}`,position:{x:cx,y:ground-.2,z:cz},size:{x:Math.max(.05,ex),y:box.maxY-ground+.2,z:Math.max(.05,ez)}});
  }
  return out;
}
/** Whole area (+40 cm) with the catalogue material. */
export const defaultFloor=(def:MiniGameInstanceV1):FloorSpec[]=>{
  const f=MINIGAME_VARIANTS[def.variant].floor;
  return [{id:'floor',x:0,z:0,halfWidth:def.area.halfWidth+.4,halfLength:def.area.halfLength+.4,material:f.material,raise:f.raise}];
};
/** Steps of the trajectory preview (1.5 s at 30 Hz). */
export const PREVIEW_TICKS=45;

/** One instance of any BallWorld-based family: `variants` is that family's table of rule
 * hooks (ball: football/bowling/mini-golf, target: cans/bullseye…). */
export function createBallSimulation(def:MiniGameInstanceV1,env:MiniGameEnvironment,variants:Readonly<Partial<Record<string,BallVariantLogic>>>):MiniGameSimulation{
  const spec=MINIGAME_VARIANTS[def.variant],logic=variants[def.variant];
  if(!logic)throw Error('Variante non prise en charge par cette famille : '+def.variant);
  const floors=buildFloors(def,env,logic.floors?.(def)??defaultFloor(def)),floorEnv=withFloors(env,floors);
  const world=new BallWorld(floorEnv,logic.capacity(def));
  const game:BallGame={def,env:floorEnv,world,spec,state:logic.initial(def),colliders:[],floors,baseBoxes:[]};
  const walls=logic.walls?logic.walls(game):spec.physics.walls?perimeterWalls(def,floorEnv,spec.physics.walls.height,logic.wallOpenings?.(def)):[];
  game.baseBoxes=[...walls,...obstacles(def,floorEnv,def.elements)];
  world.boxes=[...game.baseBoxes];
  // Boxes reach 1 m below the lowest ground under them: the collider starts at that ground.
  if(spec.physics.walls&&spec.physics.walls.playerBlocking)walls.forEach((b,k)=>game.colliders.push(...wallColliders(`${def.id}:wall${k}`,b,b.minY+1)));
  logic.setup(game);
  world.boxes=[...game.baseBoxes];
  const pushed={speed:new Float64Array(world.capacity),by:new Array<string|null>(world.capacity).fill(null)};
  let disposed=false,scratch:BallWorld|null=null;
  const joined=(s:MiniGameSessionState,a:MiniGameActor)=>s.status==='active'&&s.players.some(p=>p.id===a.id);
  const loftOf=(loft:number|undefined)=>spec.aim.loft?Math.max(0,Math.min(1,loft??spec.aim.defaultLoft)):0;
  /** Apply a plan to ball `plan.ball` of `w` (real world or preview scratch). */
  const apply=(w:BallWorld,plan:ShotPlan,i:number)=>{
    if(plan.from){w.setEnabled(i,true);w.place(i,plan.from.x,plan.from.y,plan.from.z);}
    w.vx[i]=w.vy[i]=w.vz[i]=0;w.addVelocity(i,plan.vx,plan.vy,plan.vz);
  };
  const sim:MiniGameSimulation={
    def,
    get staticColliders():readonly MiniGameStaticCollider[]{return game.colliders;},
    floorSurface:floors.regions.length?{sample:floors.walk,...floors.walkBounds}:undefined,
    reset(session:MiniGameSessionState,tick:number,events:MiniGameEvent[]){logic.reset(game,session,tick,events);},
    launch(session,actor,yaw,power,loft,tick,events){
      if(session.status!=='active')return 'Partie non commencée';
      if(!session.players.some(p=>p.id===actor.id))return 'Rejoignez la partie';
      const plan=logic.shot(game,session,actor,yaw,power,loftOf(loft));if(typeof plan==='string')return plan;
      apply(world,plan,plan.ball);logic.launched?.(game,session,actor,plan,tick,events);
      emit(session,events,tick,{type:'ball:hit',playerId:actor.id,ballId:world.ids[plan.ball],speed:Math.round(world.speed(plan.ball)*100)/100});
      return null;
    },
    aim(session,actor):MiniGameAim|null{
      if(!joined(session,actor))return null;const anchor=logic.aim(game,session,actor);if(!anchor)return null;
      return {anchor,maxPull:spec.aim.maxPull,canLoft:spec.aim.loft,defaultLoft:spec.aim.defaultLoft};
    },
    predict(session,actor,yaw,power,loft,ticks=PREVIEW_TICKS){
      if(!joined(session,actor))return null;
      const plan=logic.shot(game,session,actor,yaw,power,loftOf(loft));if(typeof plan==='string')return null;
      // Same engine, same static boxes, one ball: the preview obeys the real physics (other
      // balls and pins are ignored on purpose).
      if(!scratch)scratch=new BallWorld(floorEnv,1);
      const s=scratch,i=plan.ball;s.count=0;s.ids.length=0;s.boxes=world.boxes;
      s.add({id:'preview',x:world.px[i],y:world.py[i],z:world.pz[i],radius:world.radius[i],mass:1/world.invMass[i],restitution:world.restitution[i],rolling:world.rolling[i]});
      apply(s,plan,0);
      const n=Math.max(1,Math.min(150,ticks)),out=new Float32Array((n+1)*3);let k=0;
      out[k++]=s.px[0];out[k++]=s.py[0];out[k++]=s.pz[0];
      for(let t=0;t<n&&!s.asleep[0];t++){s.step(1/30);out[k++]=s.px[0];out[k++]=s.py[0];out[k++]=s.pz[0];}
      return out.subarray(0,k);
    },
    focus(session,actor){
      if(!joined(session,actor))return null;
      // The fastest moving ball within 25 m, else where the player can aim from.
      let best=-1,speed=.6;
      for(let i=0;i<world.count;i++){if(!world.enabled[i]||world.asleep[i])continue;const v=world.speed(i);
        if(v>speed&&Math.hypot(world.px[i]-actor.x,world.pz[i]-actor.z)<25){speed=v;best=i;}}
      if(best>=0)return {x:world.px[best],y:world.py[best],z:world.pz[best]};
      return logic.aim(game,session,actor);
    },
    step(ctx:MiniGameStepContext){
      if(disposed)throw Error('Simulation libérée');
      if(spec.physics.contactPush&&ctx.actors.length){
        pushBalls(world,ctx.actors,pushed,logic.pushable?i=>logic.pushable!(game,i):undefined);
        for(let i=0;i<world.count;i++)if(pushed.by[i]&&pushed.speed[i]>.5){
          logic.touched?.(game,i,pushed.by[i]!);
          emit(ctx.session,ctx.events,ctx.tick,{type:'ball:hit',playerId:pushed.by[i]!,ballId:world.ids[i],speed:Math.round(pushed.speed[i]*100)/100});
        }
      }
      world.step(ctx.dt);
      logic.afterStep(game,ctx);
    },
    hint:(session,actor:MiniGameActor)=>logic.hint(game,session,actor),
    describe:(session,event,localPlayer)=>logic.describe?.(game,session,event,localPlayer)??null,
    snapshot:()=>({world:world.snapshot(),state:structuredClone(game.state)}),
    restore(raw:unknown){
      const s=raw as {world:BallWorldSnapshot;state:unknown};if(!s||typeof s!=='object')throw Error('Instantané invalide');
      world.restore(s.world);game.state=logic.parseState(s.state,def);logic.restored?.(game);
    },
    dispose(){disposed=true;world.boxes=[];game.colliders=[];scratch=null;},
  };
  void BALL_LIMITS;
  return Object.assign(sim,{world,game});
}
/** The ball world of a simulation created here (renderers, tests, benchmarks). */
export const ballWorldOf=(sim:MiniGameSimulation)=>(sim as MiniGameSimulation&{world:BallWorld}).world;
export const ballGameOf=(sim:MiniGameSimulation)=>(sim as MiniGameSimulation&{game:BallGame}).game;
