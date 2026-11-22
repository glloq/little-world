/** Ready-to-use layouts per variant (Studio templates, demos, composition suggestions).
 * Pure data in the area frame; validated by the same `validateMiniGame` as authored data. */
import {MINIGAME_VARIANTS,type FloorShape,type MiniGameVariantId} from './catalog.ts';
import {validateMiniGame,type MiniGameElementV1,type MiniGameInstanceV1} from './schema.ts';

export interface MiniGamePlacement {id:string;name?:string;x:number;z:number;heading?:number}
const TEAMS=[{id:'blue',name:'Bleus',color:0x3f7fd8},{id:'red',name:'Rouges',color:0xd8503f}];

function football():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  return {version:1,family:'ball',variant:'football',playersMin:2,playersMax:6,size:[9,14],teams:TEAMS.map(t=>({...t})),
    rules:{scoreTarget:3,timeLimitSeconds:180,practice:true},
    elements:[{id:'goal-blue',kind:'goal',x:0,z:-14,width:4,depth:1,height:1.6,teamId:'blue'},
      {id:'goal-red',kind:'goal',x:0,z:14,width:4,depth:1,height:1.6,teamId:'red'},
      {id:'ball',kind:'ball',x:0,z:0},
      {id:'spawn-blue',kind:'spawn',x:0,z:-5,teamId:'blue'},{id:'spawn-red',kind:'spawn',x:0,z:5,teamId:'red'}]};
}
function bowling():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  const pins:MiniGameElementV1[]=[];let n=0;
  // Classic 1-2-3-4 triangle, 0.55 m spacing, apex towards the thrower.
  for(let row=0;row<4;row++)for(let i=0;i<=row;i++)pins.push({id:'pin-'+(++n),kind:'pin',x:(i-row/2)*.55,z:6.6+row*.48});
  return {version:1,family:'ball',variant:'bowling',playersMin:1,playersMax:4,size:[1.6,9],
    rules:{attempts:2,rounds:3,practice:true},elements:[{id:'tee',kind:'tee',x:0,z:-7.5},...pins]};
}
/** Six-hole course (doc 107 §mini-golf): two rows of three bordered lanes played in a
 * serpentine — straight with blocks, ramp up, ramp down, bank, bumps, chicane. */
export const MINIGOLF_COURSE:readonly {name:string;shape:FloorShape;slope:number}[]=[
  {name:'Ligne droite',shape:'flat',slope:0},{name:'Montée',shape:'ramp-up',slope:.1},{name:'Descente',shape:'ramp-down',slope:.1},
  {name:'Dévers',shape:'bank',slope:.12},{name:'Bosses',shape:'bumps',slope:.12},{name:'Chicane',shape:'flat',slope:0},
];
/** Lane size of the template and the offsets of its tee / hole along the lane (m). */
export const MINIGOLF_LANE={width:1.6,depth:7,tee:-2.7,hole:2.6} as const;
/** Elements of hole `k` (0-based) of a lane centred on (x, z), yaw 0 (+z) or π (−z). */
export function minigolfHole(k:number,x:number,z:number,yaw:number,shape:FloorShape,slope:number):MiniGameElementV1[]{
  const L=MINIGOLF_LANE,c=Math.cos(yaw),s=Math.sin(yaw),r=(v:number)=>Math.round(v*1000)/1000+0; // +0: no -0 (JSON round trip)
  const at=(u:number,v:number)=>({x:r(x+u*c+v*s),z:r(z-u*s+v*c)});
  return [{id:'lane-'+(k+1),kind:'lane',stage:k,x,z,width:L.width,depth:L.depth,...(yaw?{yaw:r(yaw)}:{}),...(shape!=='flat'?{shape,slope}:{})},
    {id:'tee-'+(k+1),kind:'tee',stage:k,...at(0,L.tee)},{id:'hole-'+(k+1),kind:'hole',stage:k,...at(k%2?-.3:.3,L.hole)}];
}
function minigolf():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  const elements:MiniGameElementV1[]=[],xs=[-2.8,0,2.8];
  MINIGOLF_COURSE.forEach((h,k)=>{
    const row=k<3?0:1,col=row?2-(k-3):k,yaw=(row?k-3:k)%2?Math.PI:0;
    elements.push(...minigolfHole(k,xs[col],row?4.4:-4.4,yaw,h.shape,h.slope));
  });
  // Hole 1: two staggered blocks; hole 6: a chicane of two baffles.
  elements.push({id:'block-a',kind:'obstacle',stage:0,x:-3.15,z:-5.2,width:.9,depth:.2,height:.3},
    {id:'block-b',kind:'obstacle',stage:0,x:-2.45,z:-3.6,width:.9,depth:.2,height:.3},
    {id:'baffle-a',kind:'obstacle',stage:5,x:-3.1,z:3.4,width:1,depth:.2,height:.3},
    {id:'baffle-b',kind:'obstacle',stage:5,x:-2.5,z:5.4,width:1,depth:.2,height:.3},
    // Decoration (doc 107 §décors): start / finish arches, a tunnel over hole 6 and a windmill
    // between the rows — placed off the lanes so the course plays exactly as before.
    {id:'arch-start',kind:'decor',prop:'arch-start',x:-2.8,z:-7.75},{id:'arch-finish',kind:'decor',prop:'arch-finish',x:-2.8,z:8.3},
    {id:'tunnel-6',kind:'decor',prop:'tunnel',x:-2.8,z:2.6},{id:'windmill',kind:'decor',prop:'windmill',x:-1.4,z:0});
  return {version:1,family:'ball',variant:'minigolf',playersMin:1,playersMax:4,size:[4.2,8.6],
    rules:{attempts:6,par:14,timeLimitSeconds:900,practice:true},elements};
}
function cans():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  // 3-2-1 pyramid of 12 cm cans on a 0.8 m table; rows rest in the gaps of the row below.
  const rows=[[-.25,0,.25],[-.125,.125],[0]],targets:MiniGameElementV1[]=[];let n=0;
  rows.forEach((xs,row)=>xs.forEach(x=>targets.push({id:'can-'+(++n),kind:'target',x,z:3.5,height:Math.round((.92+row*.205)*1000)/1000})));
  return {version:1,family:'target',variant:'cans',playersMin:1,playersMax:4,size:[1.5,5],
    rules:{attempts:3,rounds:3,practice:true},
    elements:[{id:'tee',kind:'tee',x:0,z:-4.2},{id:'table',kind:'obstacle',x:0,z:3.5,width:1.6,depth:.5,height:.8},...targets]};
}
function bullseye():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  return {version:1,family:'target',variant:'bullseye',playersMin:1,playersMax:4,size:[1.5,6],
    rules:{attempts:3,rounds:3,practice:true},
    elements:[{id:'tee',kind:'tee',x:0,z:-5.2},{id:'board',kind:'target',x:0,z:5.5,width:1.2,height:1.1}]};
}
const TEMPLATES:Record<MiniGameVariantId,()=>ReturnType<typeof football>>={football,bowling,minigolf,cans,bullseye};

/** Validated instance of a variant template at a world position. */
export function defaultMiniGame(variant:MiniGameVariantId,place:MiniGamePlacement):MiniGameInstanceV1{
  const t=TEMPLATES[variant]?.();if(!t)throw Error('Variante de mini-jeu inconnue');
  const {size,...rest}=t;
  return validateMiniGame({...rest,id:place.id,name:place.name??MINIGAME_VARIANTS[variant].label,
    area:{x:place.x,z:place.z,heading:place.heading??0,halfWidth:size[0],halfLength:size[1]}});
}
