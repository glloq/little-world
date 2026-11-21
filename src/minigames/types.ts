/** Contracts between the mini-game manager and lazily loaded family modules (doc 107).
 * Type-only module: importing it never pulls an implementation, Three.js or Studio. */
import type {Bounds} from '../physics/collision-world.ts';
import type {GroundMaterial} from '../physics/motion.ts';
import type {MiniGameInstanceV1} from './schema.ts';
import type {MiniGameEvent,MiniGameSessionState} from './session.ts';

/** Read-only world queries shared with the player physics (WorldCollisionQuery adapters). */
export interface MiniGameEnvironment {
  height(x:number,z:number):number;
  water?(x:number,z:number):number|null;
  material?(x:number,z:number):GroundMaterial;
  /** Shared static colliders near a rectangle (same broadphase as the player). */
  solids?(minX:number,maxX:number,minZ:number,maxZ:number):readonly Bounds[];
}
/** Fixed-step snapshot of a participant body (local player, future remote players, bots). */
export interface MiniGameActor {id:string;x:number;y:number;z:number;vx:number;vy:number;vz:number;radius:number;height:number;mode:string}
export interface MiniGameStepContext {
  tick:number;dt:number;actors:readonly MiniGameActor[];
  session:MiniGameSessionState;events:MiniGameEvent[];
}
export interface MiniGameAim {anchor:{x:number;y:number;z:number};maxPull:number;canLoft:boolean;defaultLoft:number}
/** Deck sampler with its world bounds (WorldCollisionQuery.setOutdoorSurface). */
export interface MiniGameSurface {sample(x:number,z:number):number|null;minX:number;maxX:number;minZ:number;maxZ:number}
/** Player-blocking static part of an activity (goal posts), registered while loaded. */
export interface MiniGameStaticCollider {id:string;position:{x:number;y:number;z:number};size:{x:number;y:number;z:number}}
export interface MiniGameSimulation {
  readonly def:MiniGameInstanceV1;
  /** Place the field for a new session or round. */
  reset(session:MiniGameSessionState,tick:number,events:MiniGameEvent[]):void;
  /** Validated launch intention (kick / throw / putt); `loft` 0…1 (undefined = variant default).
   * Returns a refusal reason or null. */
  launch(session:MiniGameSessionState,actor:MiniGameActor,yaw:number,power:number,loft:number|undefined,tick:number,events:MiniGameEvent[]):string|null;
  /** Aiming available to this actor now: anchor (ball / hand) and the variant's aim settings. */
  aim(session:MiniGameSessionState,actor:MiniGameActor):MiniGameAim|null;
  /** Predicted path of that launch (flat xyz list, presentation only), or null if refused. */
  predict(session:MiniGameSessionState,actor:MiniGameActor,yaw:number,power:number,loft:number|undefined,ticks?:number):Float32Array|null;
  /** Activity floor as an outdoor walking surface for the player (absent = none). */
  readonly floorSurface?:MiniGameSurface;
  /** One fixed tick while the session is active. */
  step(ctx:MiniGameStepContext):void;
  readonly staticColliders:readonly MiniGameStaticCollider[];
  /** Short contextual hint for the local player (HUD), or null. */
  hint(session:MiniGameSessionState,actor:MiniGameActor):string|null;
  /** Variant wording of a session event for the local HUD (generic events are worded by the host). */
  describe(session:MiniGameSessionState,event:MiniGameEvent,localPlayer:string):string|null;
  snapshot():unknown;
  restore(snapshot:unknown):void;
  dispose():void;
}
/** Trajectory preview line: points (flat xyz) or null to hide; power 0…1 tints it. */
export interface MiniGameAimLine {set(points:Float32Array|null,power:number):void;dispose():void}
/** Presentation of one instance; created only in the browser, after the simulation. */
export interface MiniGameView {update(alpha:number):void;dispose():void}
export interface MiniGameViewFactory {
  /** `parent` is a THREE.Object3D; typed loosely so this contract stays Three-free. */
  create(parent:unknown,sim:MiniGameSimulation,env:MiniGameEnvironment):MiniGameView;
  /** Shared aiming line (slingshot preview); one per host. */
  createAimLine?(parent:unknown):MiniGameAimLine;
}
export interface MiniGameFamilyModule {
  family:string;
  createSimulation(def:MiniGameInstanceV1,env:MiniGameEnvironment):MiniGameSimulation;
  /** Separate chunk: headless/server code never loads the renderer. */
  loadView():Promise<MiniGameViewFactory>;
}
