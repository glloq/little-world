/** Reproducible opt-in authoring templates. These are *practice fixtures* for Studio,
 * not certified tracks on a specific island or global multiplayer leaderboards. */
import type {ProjectDocument} from './types.ts';
import type {RaceKind,RaceDefinition} from '../gameplay/races.ts';
import {authoredRaceFromTrace,putAuthoredRace} from './race-authoring.ts';
export const SHOWCASE_RACES=[
 {id:'race:showcase-roll',name:'Descente des noisettes',kind:'roll'},
 {id:'race:showcase-flight',name:'Anneaux des falaises',kind:'flight'},
 {id:'race:showcase-mixed',name:'Du sol aux nuages',kind:'mixed'}
] as const;
export function showcaseRaceDefinitions(project:ProjectDocument,anchor:{x:number;z:number},
 height:(x:number,z:number)=>number):RaceDefinition[]{
 const layouts:{kind:RaceKind;points:{x:number;z:number}[]}[]=[
  {kind:'roll',points:[[-60,-75],[-56,-48],[-66,-16],[-52,18],[-58,50]].map(([x,z])=>({x:anchor.x+x,z:anchor.z+z}))},
  {kind:'flight',points:[[60,-140],[75,-75],[50,-5],[72,65],[60,140]].map(([x,z])=>({x:anchor.x+x,z:anchor.z+z}))},
  {kind:'mixed',points:[[0,-110],[4,-70],[14,-25],[5,20],[0,65]].map(([x,z])=>({x:anchor.x+x,z:anchor.z+z}))}
 ];
 return SHOWCASE_RACES.map((demo,i)=>authoredRaceFromTrace(project.world,{
   id:demo.id,name:demo.name,kind:demo.kind,points:layouts[i].points,height
 }));
}
/** One CommandBus edit creates these 3 courses; existing author revisions are never overwritten. */
export function installShowcaseRaces(project:ProjectDocument,anchor:{x:number;z:number},
 height:(x:number,z:number)=>number):number{
 const available=showcaseRaceDefinitions(project,anchor,height).filter(r=>!project.libraries.races?.[r.id]);
 for(const race of available)putAuthoredRace(project,race);
 return available.length;
}
