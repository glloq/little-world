/**
 * Data-only catalogue of mini-game families and variants (doc 107). Read by the validator,
 * Studio and the runtime without importing any implementation: adding a variant is one entry
 * here plus a template and its rule hooks in the family module (`ball/`, `target/`).
 */
export type MiniGameFamilyId='ball'|'target';
export type MiniGameVariantId='football'|'bowling'|'minigolf'|'cans'|'bullseye';
export type MiniGameElementKind='goal'|'pin'|'tee'|'hole'|'obstacle'|'spawn'|'ball'|'target'|'lane';
/** Surface of an activity floor (rendering and nothing else: physics reads its shape). */
export type FloorMaterial='pitch'|'lane'|'gutter'|'green'|'sand';
/** Relief of a floor region (mini-golf lanes): offset added to its flat level. */
export type FloorShape='flat'|'ramp-up'|'ramp-down'|'bank'|'bumps';
export const FLOOR_SHAPES:readonly FloorShape[]=['flat','ramp-up','ramp-down','bank','bumps'];
/** Rule predicates composed by the session (see rules.ts). */
export type MiniGameRuleId='scoreTarget'|'timeLimit'|'attempts'|'allFinished'|'rounds';
/** Player command that launches the ball for this variant. */
export type BallCommandStyle='kick'|'throw'|'putt';

export interface BallVariantPhysics {
  ballRadius:number;ballMass:number;restitution:number;
  /** Rolling resistance multiplier over the ground material friction. */rolling:number;
  /** The walking / rolling hamster body pushes the ball on contact. */contactPush:boolean;
  /** Launch speed at full power (m/s), bounded by the shared push module. */launchSpeed:number;
  /** Upward speed added at full power (m/s): lobbed kicks and throws. */loft:number;
  command:BallCommandStyle;
  /** Perimeter walls of the area (or of each mini-golf lane): height above the floor and
   * whether they also block the hamster (registered as player colliders). */
  walls:false|{height:number;playerBlocking:boolean};
}
/** Mouse slingshot aiming (doc 107 §visée): drag back from the anchor (ball or throwing hand). */
export interface AimSpec {
  /** Pull (m on the ground) giving full power. */maxPull:number;
  /** Shots may be lofted with the mouse wheel; default loft 0…1. */loft:boolean;defaultLoft:number;
}
export interface MiniGameVariantSpec {
  family:MiniGameFamilyId;label:string;description:string;
  maxPlayers:number;teams:boolean;
  /** Winner: highest score (goals, pins) or lowest (strokes). */ranking:'highest'|'lowest';
  rules:readonly MiniGameRuleId[];
  requiredRules:readonly ('scoreTarget'|'timeLimitSeconds'|'attempts'|'rounds')[];
  /** Allowed element counts [min, max] by kind; unlisted kinds are refused. */
  elements:Partial<Record<MiniGameElementKind,[number,number]>>;
  /** Presentation hints read by the shared view (no variant id tests in the renderer). */
  visual?:{upright?:'pin'|'can';board?:boolean;ballColor?:number;/** One colour per player ball. */playerColors?:boolean};
  minHalfSize:{width:number;length:number};
  physics:BallVariantPhysics;
  /** Flat deck laid on the relief: material and height above the highest ground under it. */
  floor:{material:FloorMaterial;raise:number};
  aim:AimSpec;
  /** Game modes chosen when starting (default: rules.mode, else the first). */
  modes?:readonly {id:string;label:string}[];
  /** Elements carry a `stage` (mini-golf holes): one lane, tee and hole per stage. */
  stages?:boolean;
  /** Terrain suitability for site suggestions (max slope ratio over the area). */site:{maxSlope:number;nearSettlement:boolean};
}
export const MINIGAME_VARIANTS:Record<MiniGameVariantId,MiniGameVariantSpec>={
  football:{family:'ball',label:'Football',description:'Deux buts, une balle, score par équipe ; fin au score ou au temps.',
    maxPlayers:8,teams:true,ranking:'highest',rules:['scoreTarget','timeLimit'],requiredRules:['scoreTarget'],
    elements:{goal:[2,2],ball:[1,1],spawn:[0,8]},minHalfSize:{width:4,length:6},
    physics:{ballRadius:.35,ballMass:.6,restitution:.55,rolling:.9,contactPush:true,launchSpeed:12,loft:6,command:'kick',walls:{height:.8,playerBlocking:true}},
    floor:{material:'pitch',raise:.05},aim:{maxPull:3,loft:true,defaultLoft:0},
    visual:{ballColor:0xf6f3ea},
    site:{maxSlope:.08,nearSettlement:true}},
  bowling:{family:'ball',label:'Bowling',description:'Une piste, des quilles ; tentatives et manches configurables.',
    maxPlayers:4,teams:false,ranking:'highest',rules:['rounds'],requiredRules:['attempts','rounds'],
    elements:{tee:[1,1],pin:[1,10],obstacle:[0,8]},minHalfSize:{width:.8,length:4},
    physics:{ballRadius:.3,ballMass:2.5,restitution:.25,rolling:.35,contactPush:false,launchSpeed:11,loft:0,command:'throw',walls:{height:.3,playerBlocking:false}},
    floor:{material:'lane',raise:.05},aim:{maxPull:2.5,loft:false,defaultLoft:0},
    modes:[{id:'beginner',label:'Débutant (rigoles bloquées)'},{id:'normal',label:'Normal (avec rigoles)'}],
    visual:{upright:'pin',ballColor:0x3a4aa8},site:{maxSlope:.05,nearSettlement:true}},
  minigolf:{family:'ball',label:'Mini-golf',description:'Un parcours de plusieurs trous à bordures (rampes, dévers, bosses) ; total des coups.',
    maxPlayers:4,teams:false,ranking:'lowest',rules:['allFinished','timeLimit'],requiredRules:['attempts'],
    elements:{lane:[0,9],tee:[1,9],hole:[1,9],obstacle:[0,48]},minHalfSize:{width:1.5,length:3},stages:true,
    physics:{ballRadius:.12,ballMass:.05,restitution:.6,rolling:.6,contactPush:false,launchSpeed:9,loft:3,command:'putt',walls:{height:.15,playerBlocking:true}},
    floor:{material:'green',raise:.12},aim:{maxPull:2.5,loft:true,defaultLoft:0},
    visual:{playerColors:true},
    site:{maxSlope:.1,nearSettlement:false}},
  cans:{family:'target',label:'Chamboule-tout',description:'Renverser une pyramide de boîtes posée sur une table avec quelques balles.',
    maxPlayers:4,teams:false,ranking:'highest',rules:['rounds'],requiredRules:['attempts','rounds'],
    elements:{tee:[1,1],target:[1,15],obstacle:[1,4]},minHalfSize:{width:1,length:3},
    physics:{ballRadius:.1,ballMass:.3,restitution:.4,rolling:.8,contactPush:false,launchSpeed:14,loft:7,command:'throw',walls:false},
    floor:{material:'sand',raise:.04},aim:{maxPull:3,loft:true,defaultLoft:.8},
    visual:{upright:'can',ballColor:0xe25b45},site:{maxSlope:.1,nearSettlement:true}},
  bullseye:{family:'target',label:'Tir sur cible',description:'Lancer des balles sur une cible : plus c’est près du centre, plus ça rapporte.',
    maxPlayers:4,teams:false,ranking:'highest',rules:['rounds'],requiredRules:['attempts','rounds'],
    elements:{tee:[1,1],target:[1,3],obstacle:[0,4]},minHalfSize:{width:1,length:3},
    physics:{ballRadius:.1,ballMass:.3,restitution:.3,rolling:.8,contactPush:false,launchSpeed:15,loft:7,command:'throw',walls:false},
    floor:{material:'sand',raise:.04},aim:{maxPull:3,loft:true,defaultLoft:.9},
    visual:{board:true,ballColor:0xf2c94c},site:{maxSlope:.1,nearSettlement:true}},
};
export const MINIGAME_VARIANT_IDS=Object.keys(MINIGAME_VARIANTS) as MiniGameVariantId[];

/** Broader activity catalogue: what each family reuses today. Only `ball` is a loadable
 * mini-game family; the others are served by mature systems that are NOT migrated. */
export const ACTIVITY_FAMILIES=[
  {id:'ball',label:'Balle',status:'implemented',reuses:'src/minigames (BallPhysics, session, rules)',variants:['football','bowling','minigolf','pétanque','golf','course de balle']},
  {id:'race',label:'Course',status:'existing',reuses:'src/gameplay/races.ts (roulade, vol, surf, ski)',variants:['roulade','vol','surf','ski','nage','barque']},
  {id:'target',label:'Cible',status:'implemented',reuses:'src/minigames/target (même BallWorld et simulation que ball)',variants:['chamboule-tout','tir sur cible','ricochets (prévu)']},
  {id:'cooperative',label:'Coopération',status:'planned',reuses:'interactions déclaratives + session',variants:['transport','énigmes','mécanismes']},
  {id:'exploration',label:'Exploration',status:'existing',reuses:'quêtes natives (location.visited, underwater.discovered)',variants:['chasse au trésor','orientation']},
  {id:'rhythm',label:'Rythme',status:'existing',reuses:'src/instruments + music.played',variants:['musique','imitation']},
  {id:'collection',label:'Collecte',status:'existing',reuses:'pêche, cueillette, livraisons de quêtes',variants:['pêche','récolte','livraison']},
] as const;
