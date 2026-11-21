/** Ready-to-use layouts per variant (Studio templates, demos, composition suggestions).
 * Pure data in the area frame; validated by the same `validateMiniGame` as authored data. */
import {MINIGAME_VARIANTS,type MiniGameVariantId} from './catalog.ts';
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
function minigolf():Omit<MiniGameInstanceV1,'id'|'name'|'area'>&{size:[number,number]}{
  return {version:1,family:'ball',variant:'minigolf',playersMin:1,playersMax:4,size:[3,9],
    rules:{attempts:8,par:3,timeLimitSeconds:300,practice:true},
    elements:[{id:'tee',kind:'tee',x:0,z:-7.5},{id:'hole',kind:'hole',x:.6,z:7},
      {id:'block-a',kind:'obstacle',x:-1.1,z:-1.5,width:1.8,depth:.4,height:.35},
      {id:'block-b',kind:'obstacle',x:1.1,z:2.5,width:1.8,depth:.4,height:.35,yaw:.3}]};
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
