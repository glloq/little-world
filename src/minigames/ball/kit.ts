/** Shared contract and helpers of every BallWorld-based family (ball, target…): a family
 * module brings a table of these hooks, never its own physics. */
import type {MiniGameVariantSpec} from '../catalog.ts';
import {areaToWorld,type MiniGameElementV1,type MiniGameInstanceV1} from '../schema.ts';
import type {MiniGameEvent,MiniGameSessionState} from '../session.ts';
import type {MiniGameActor,MiniGameEnvironment,MiniGameStaticCollider,MiniGameStepContext} from '../types.ts';
import type {BallWorld,StaticBox} from './ball-physics.ts';
import type {FloorSpec,Floors} from './floors.ts';

export interface BallGame {def:MiniGameInstanceV1;
  /** Relief + activity floors (the height every ball and placement uses). */env:MiniGameEnvironment;
  world:BallWorld;spec:MiniGameVariantSpec;state:unknown;colliders:MiniGameStaticCollider[];floors:Floors;
  /** Static boxes always present (walls, obstacles…); variants may add mode-dependent ones. */baseBoxes:StaticBox[];}
/** Pure launch plan (no side effect): shared by the real shot and the trajectory preview. */
export interface ShotPlan {ball:number;from?:{x:number;y?:number;z:number};vx:number;vy:number;vz:number}
/** Gap in a perimeter wall: side of the area and centre / width along that side (area frame). */
export interface WallOpening {side:'left'|'right'|'near'|'far';at:number;width:number}
export interface BallVariantLogic {
  capacity(def:MiniGameInstanceV1):number;
  initial(def:MiniGameInstanceV1):unknown;
  parseState(raw:unknown,def:MiniGameInstanceV1):unknown;
  setup(g:BallGame):void;
  reset(g:BallGame,s:MiniGameSessionState,tick:number,out:MiniGameEvent[]):void;
  /** Validated plan of a launch (pure) or the refusal reason. `loft` 0…1. */
  shot(g:BallGame,s:MiniGameSessionState,a:MiniGameActor,yaw:number,power:number,loft:number):ShotPlan|string;
  /** Bookkeeping after the plan was applied (attempts, turn, owner…). */
  launched?(g:BallGame,s:MiniGameSessionState,a:MiniGameActor,plan:ShotPlan,tick:number,out:MiniGameEvent[]):void;
  /** Where the local player can aim from (ball or throwing hand), or null (not now / too far). */
  aim(g:BallGame,s:MiniGameSessionState,a:MiniGameActor):{x:number;y:number;z:number}|null;
  /** Floors of the activity (default: the whole area with the catalogue material). */
  floors?(def:MiniGameInstanceV1):FloorSpec[];
  /** Perimeter wall gaps (football goal mouths and gates). */
  wallOpenings?(def:MiniGameInstanceV1):WallOpening[];
  /** Custom static walls replacing the perimeter (mini-golf lane borders). */
  walls?(g:BallGame):StaticBox[];
  /** After `restore` (rebuild derived, non-serialised data such as mode boxes). */
  restored?(g:BallGame):void;
  afterStep(g:BallGame,ctx:MiniGameStepContext):void;
  hint(g:BallGame,s:MiniGameSessionState,a:MiniGameActor):string|null;
  pushable?(g:BallGame,i:number):boolean;
  touched?(g:BallGame,i:number,playerId:string):void;
  /** Short HUD message for a session event of this variant (null = nothing to say). */
  describe?(g:BallGame,s:MiniGameSessionState,e:MiniGameEvent,localPlayer:string):string|null;
}
export const el=(def:MiniGameInstanceV1,kind:MiniGameElementV1['kind'])=>def.elements.filter(e=>e.kind===kind);
export const home=(def:MiniGameInstanceV1,e:{x:number;z:number})=>areaToWorld(def.area,e.x,e.z);
export const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const ballSpec=(g:BallGame,id:string,p:{x:number;z:number})=>({id,x:p.x,y:g.env.height(p.x,p.z)+g.spec.physics.ballRadius,z:p.z,
  radius:g.spec.physics.ballRadius,mass:g.spec.physics.ballMass,restitution:g.spec.physics.restitution,rolling:g.spec.physics.rolling,asleep:true});
export const launchSpeed=(g:BallGame,power:number,min:number)=>min+Math.max(0,Math.min(1,power))*(g.spec.physics.launchSpeed-min);

/** Velocity of a launch along `yaw` (0 = +Z): power maps [min, launchSpeed], loft maps
 * [0, physics.loft] upwards. One mapping for every variant, the shot and its preview. */
export function launchVelocity(g:BallGame,yaw:number,power:number,loft:number,min:number){
  const s=launchSpeed(g,power,min),up=Math.max(0,Math.min(1,loft))*g.spec.physics.loft;
  return {vx:Math.sin(yaw)*s,vy:up,vz:Math.cos(yaw)*s};
}
/** Ball position as an aim anchor. */
export const ballAnchor=(g:BallGame,i:number)=>({x:g.world.px[i],y:g.world.py[i],z:g.world.pz[i]});
