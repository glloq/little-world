/**
 * Data-only catalogue of mini-game families and variants (doc 107). Read by the validator,
 * Studio and the runtime without importing any implementation: adding a ball variant is one
 * entry here plus, when needed, one small goal/turn rule in `ball/variants.ts`.
 */
export type MiniGameFamilyId='ball';
export type MiniGameVariantId='football'|'bowling'|'minigolf';
/** Rule predicates composed by the session (see rules.ts). */
export type MiniGameRuleId='scoreTarget'|'timeLimit'|'attempts'|'allFinished'|'rounds';
/** Player command that launches the ball for this variant. */
export type BallCommandStyle='kick'|'throw'|'putt';

export interface BallVariantPhysics {
  ballRadius:number;ballMass:number;restitution:number;
  /** Rolling resistance multiplier over the ground material friction. */rolling:number;
  /** The walking / rolling hamster body pushes the ball on contact. */contactPush:boolean;
  /** Launch speed at full power (m/s), bounded by the shared push module. */launchSpeed:number;
  command:BallCommandStyle;
  /** Low perimeter walls generated from the area (mini-golf). */walls:boolean;
}
export interface MiniGameVariantSpec {
  family:MiniGameFamilyId;label:string;description:string;
  maxPlayers:number;teams:boolean;
  /** Winner: highest score (goals, pins) or lowest (strokes). */ranking:'highest'|'lowest';
  rules:readonly MiniGameRuleId[];
  requiredRules:readonly ('scoreTarget'|'timeLimitSeconds'|'attempts'|'rounds')[];
  /** Allowed element counts [min, max] by kind; unlisted kinds are refused. */
  elements:Partial<Record<'goal'|'pin'|'tee'|'hole'|'obstacle'|'spawn'|'ball',[number,number]>>;
  minHalfSize:{width:number;length:number};
  physics:BallVariantPhysics;
  /** Terrain suitability for site suggestions (max slope ratio over the area). */site:{maxSlope:number;nearSettlement:boolean};
}
export const MINIGAME_VARIANTS:Record<MiniGameVariantId,MiniGameVariantSpec>={
  football:{family:'ball',label:'Football',description:'Deux buts, une balle, score par équipe ; fin au score ou au temps.',
    maxPlayers:8,teams:true,ranking:'highest',rules:['scoreTarget','timeLimit'],requiredRules:['scoreTarget'],
    elements:{goal:[2,2],ball:[1,1],spawn:[0,8]},minHalfSize:{width:4,length:6},
    physics:{ballRadius:.35,ballMass:.6,restitution:.55,rolling:.9,contactPush:true,launchSpeed:12,command:'kick',walls:false},
    site:{maxSlope:.08,nearSettlement:true}},
  bowling:{family:'ball',label:'Bowling',description:'Une piste, des quilles ; tentatives et manches configurables.',
    maxPlayers:4,teams:false,ranking:'highest',rules:['rounds'],requiredRules:['attempts','rounds'],
    elements:{tee:[1,1],pin:[1,10],obstacle:[0,8]},minHalfSize:{width:.8,length:4},
    physics:{ballRadius:.3,ballMass:2.5,restitution:.25,rolling:.35,contactPush:false,launchSpeed:11,command:'throw',walls:true},
    site:{maxSlope:.05,nearSettlement:true}},
  minigolf:{family:'ball',label:'Mini-golf',description:'Un départ, un trou, des obstacles ; comptage des coups et sorties.',
    maxPlayers:4,teams:false,ranking:'lowest',rules:['allFinished','timeLimit'],requiredRules:['attempts'],
    elements:{tee:[1,1],hole:[1,1],obstacle:[0,24]},minHalfSize:{width:1.5,length:3},
    physics:{ballRadius:.12,ballMass:.05,restitution:.6,rolling:.6,contactPush:false,launchSpeed:9,command:'putt',walls:true},
    site:{maxSlope:.18,nearSettlement:false}},
};
export const MINIGAME_VARIANT_IDS=Object.keys(MINIGAME_VARIANTS) as MiniGameVariantId[];

/** Broader activity catalogue: what each family reuses today. Only `ball` is a loadable
 * mini-game family; the others are served by mature systems that are NOT migrated. */
export const ACTIVITY_FAMILIES=[
  {id:'ball',label:'Balle',status:'implemented',reuses:'src/minigames (BallPhysics, session, rules)',variants:['football','bowling','minigolf','pétanque','golf','course de balle']},
  {id:'race',label:'Course',status:'existing',reuses:'src/gameplay/races.ts (roulade, vol, surf, ski)',variants:['roulade','vol','surf','ski','nage','barque']},
  {id:'target',label:'Cible',status:'planned',reuses:'src/minigames ball family + target elements',variants:['lancer','ricochets','chamboule-tout']},
  {id:'cooperative',label:'Coopération',status:'planned',reuses:'interactions déclaratives + session',variants:['transport','énigmes','mécanismes']},
  {id:'exploration',label:'Exploration',status:'existing',reuses:'quêtes natives (location.visited, underwater.discovered)',variants:['chasse au trésor','orientation']},
  {id:'rhythm',label:'Rythme',status:'existing',reuses:'src/instruments + music.played',variants:['musique','imitation']},
  {id:'collection',label:'Collecte',status:'existing',reuses:'pêche, cueillette, livraisons de quêtes',variants:['pêche','récolte','livraison']},
] as const;
