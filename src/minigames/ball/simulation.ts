/**
 * Shared simulation of every ball mini-game: ONE BallWorld, the shared push module and the
 * area frame; variants only add their goal / turn rules (variants.ts). No Three.js.
 */
import {MINIGAME_VARIANTS} from '../catalog.ts';
import {areaToWorld,type MiniGameInstanceV1,type MiniGameElementV1} from '../schema.ts';
import {emit,type MiniGameEvent,type MiniGameSessionState} from '../session.ts';
import type {MiniGameActor,MiniGameEnvironment,MiniGameSimulation,MiniGameStaticCollider,MiniGameStepContext} from '../types.ts';
import {BallWorld,orientedBox,type BallWorldSnapshot,type StaticBox} from './ball-physics.ts';
import {pushBalls} from './push.ts';
import type {BallGame,BallVariantLogic} from './kit.ts';

/** Sampled ground range under a segment of the area (walls, goals). */
function groundRange(env:MiniGameEnvironment,a:{x:number;z:number},b:{x:number;z:number}){
  let lo=Infinity,hi=-Infinity;for(let k=0;k<=8;k++){const h=env.height(a.x+(b.x-a.x)*k/8,a.z+(b.z-a.z)*k/8);lo=Math.min(lo,h);hi=Math.max(hi,h);}return {lo,hi};
}
/** Oriented box from area-frame centre/size; height above the local ground. */
export function areaBox(def:MiniGameInstanceV1,env:MiniGameEnvironment,x:number,z:number,width:number,depth:number,height:number,yaw=0,restitution=.6,base?:number):StaticBox{
  const c=areaToWorld(def.area,x,z),cy=Math.cos(yaw),sy=Math.sin(yaw);
  // Sample the ground along the longer side (box axes rotated by `yaw` inside the area frame).
  const half=width>=depth?{x:width/2*cy,z:-width/2*sy}:{x:depth/2*sy,z:depth/2*cy};
  const g=groundRange(env,areaToWorld(def.area,x-half.x,z-half.z),areaToWorld(def.area,x+half.x,z+half.z));
  return orientedBox(c.x,c.z,width,depth,g.lo-1,(base??g.hi)+height,def.area.heading+yaw,restitution);
}
function walls(def:MiniGameInstanceV1,env:MiniGameEnvironment):StaticBox[]{
  const {halfWidth:w,halfLength:l}=def.area,t=.2,h=.3;
  return [areaBox(def,env,-w-t/2,0,t,2*l+2*t,h),areaBox(def,env,w+t/2,0,t,2*l+2*t,h),
    areaBox(def,env,0,-l-t/2,2*w,t,h),areaBox(def,env,0,l+t/2,2*w,t,h)];
}
function obstacles(def:MiniGameInstanceV1,env:MiniGameEnvironment,elements:readonly MiniGameElementV1[]):StaticBox[]{
  return elements.filter(e=>e.kind==='obstacle').map(e=>areaBox(def,env,e.x,e.z,e.width??1,e.depth??.3,e.height??.35,e.yaw??0));
}

/** One instance of any BallWorld-based family: `variants` is that family's table of rule
 * hooks (ball: football/bowling/mini-golf, target: cans/bullseye…). */
export function createBallSimulation(def:MiniGameInstanceV1,env:MiniGameEnvironment,variants:Readonly<Partial<Record<string,BallVariantLogic>>>):MiniGameSimulation{
  const spec=MINIGAME_VARIANTS[def.variant],logic=variants[def.variant];
  if(!logic)throw Error('Variante non prise en charge par cette famille : '+def.variant);
  const world=new BallWorld(env,logic.capacity(def));
  world.boxes=[...(spec.physics.walls?walls(def,env):[]),...obstacles(def,env,def.elements)];
  const game:BallGame={def,env,world,spec,state:logic.initial(def),colliders:[]};
  logic.setup(game);
  const pushed={speed:new Float64Array(world.capacity),by:new Array<string|null>(world.capacity).fill(null)};
  let disposed=false;
  const sim:MiniGameSimulation={
    def,
    get idle(){return world.awakeCount===0;},
    get staticColliders():readonly MiniGameStaticCollider[]{return game.colliders;},
    reset(session:MiniGameSessionState,tick:number,events:MiniGameEvent[]){logic.reset(game,session,tick,events);},
    launch(session,actor,yaw,power,tick,events){
      if(session.status!=='active')return 'Partie non commencée';
      if(!session.players.some(p=>p.id===actor.id))return 'Rejoignez la partie';
      return logic.launch(game,session,actor,yaw,power,tick,events);
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
      world.restore(s.world);game.state=logic.parseState(s.state,def);
    },
    dispose(){disposed=true;world.boxes=[];game.colliders=[];},
  };
  return Object.assign(sim,{world,game});
}
/** The ball world of a simulation created here (renderers, tests, benchmarks). */
export const ballWorldOf=(sim:MiniGameSimulation)=>(sim as MiniGameSimulation&{world:BallWorld}).world;
export const ballGameOf=(sim:MiniGameSimulation)=>(sim as MiniGameSimulation&{game:BallGame}).game;
