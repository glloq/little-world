import type {SkiAreaV1} from '../snow/ski-area.ts';
import {authoredRaceFromTrace,sourceRaceKey} from './race-authoring.ts';
import type {WorldDefinitionV3} from './types.ts';

export const ALPINE_RACE_ID='race:composition-ski';

export function raceFromSkiArea(world:WorldDefinitionV3,area:SkiAreaV1,height:(x:number,z:number)=>number){
  const lengths=[0];
  for(let i=1;i<area.points.length;i++){
    const a=area.points[i-1],b=area.points[i];
    lengths.push(lengths[i-1]+Math.hypot(b.x-a.x,b.z-a.z));
  }
  const total=lengths.at(-1)!;
  if(total<20)throw Error('La descente est trop courte pour un chrono de ski.');
  const count=Math.min(18,Math.max(3,Math.round(total/28)));
  const points=Array.from({length:count},(_,i)=>{
    const target=4+(total-8)*i/(count-1);
    const end=lengths.findIndex(length=>length>=target);
    const a=area.points[end-1],b=area.points[end],t=(target-lengths[end-1])/(lengths[end]-lengths[end-1]);
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
  });
  const race=authoredRaceFromTrace(world,{id:ALPINE_RACE_ID,name:'Chrono des Cimes',kind:'ski',points,height});
  race.gates=race.gates.map(gate=>({...gate,width:area.widthM,height:5,
    allowedModes:area.jumps?['snow','air']:['snow']}));
  race.layoutKey=sourceRaceKey(race);
  return race;
}
