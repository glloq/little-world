/** Shared contract and helpers of every BallWorld-based family (ball, target…): a family
 * module brings a table of these hooks, never its own physics. */
import type {MiniGameVariantSpec} from '../catalog.ts';
import {areaToWorld,type MiniGameElementV1,type MiniGameInstanceV1} from '../schema.ts';
import type {MiniGameEvent,MiniGameSessionState} from '../session.ts';
import type {MiniGameActor,MiniGameEnvironment,MiniGameStaticCollider,MiniGameStepContext} from '../types.ts';
import type {BallWorld} from './ball-physics.ts';

export interface BallGame {def:MiniGameInstanceV1;env:MiniGameEnvironment;world:BallWorld;spec:MiniGameVariantSpec;state:unknown;colliders:MiniGameStaticCollider[]}
export interface BallVariantLogic {
  capacity(def:MiniGameInstanceV1):number;
  initial(def:MiniGameInstanceV1):unknown;
  parseState(raw:unknown,def:MiniGameInstanceV1):unknown;
  setup(g:BallGame):void;
  reset(g:BallGame,s:MiniGameSessionState,tick:number,out:MiniGameEvent[]):void;
  launch(g:BallGame,s:MiniGameSessionState,a:MiniGameActor,yaw:number,power:number,tick:number,out:MiniGameEvent[]):string|null;
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

