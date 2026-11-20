/** Versioned authored ski runs. No alternate race, terrain or lift engine.
 * `composition-alpine` is the main run (race, station); other runs are optional extras. */
import {validatePiste,type SkiPoint} from './snow-pistes.ts';
import type {LiftKind,PisteDifficulty} from './resort-planner.ts';
export interface SkiAreaV1 {version:1;id:string;name:string;points:SkiPoint[];widthM:number;snowLineM:number;equipment:'skis'|'snowboard';lift:boolean;groomed?:boolean;jumps?:boolean;
  /** Optional difficulty (piste colour); absent = historical prototype. */
  difficulty?:PisteDifficulty;
  /** Optional explicit lift line, base first, top last. Absent = legacy lift along the run. */
  liftPath?:SkiPoint[];liftKind?:LiftKind;liftName?:string}
export const MAIN_SKI_AREA_ID='composition-alpine';
const KEYS=['version','id','name','points','widthM','snowLineM','equipment','lift','groomed','jumps','difficulty','liftPath','liftKind','liftName'];
const inBounds=(q:SkiPoint,b:{minX:number;maxX:number;minZ:number;maxZ:number})=>!!q&&!Object.keys(q).some(k=>k!=='x'&&k!=='z')&&Number.isFinite(q.x)&&Number.isFinite(q.z)&&q.x>=b.minX&&q.x<=b.maxX&&q.z>=b.minZ&&q.z<=b.maxZ;
export function parseSkiArea(value:unknown,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):SkiAreaV1{
 const v=value as SkiAreaV1;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!KEYS.includes(k))||v.version!==1||typeof v.id!=='string'||!/^[a-z0-9][a-z0-9:_-]{0,79}$/.test(v.id)||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||!['skis','snowboard'].includes(v.equipment)||typeof v.lift!=='boolean'||(v.groomed!==undefined&&typeof v.groomed!=='boolean')||(v.jumps!==undefined&&typeof v.jumps!=='boolean')||!Number.isFinite(v.widthM)||v.widthM<4||v.widthM>30||!Number.isFinite(v.snowLineM)||v.snowLineM<0||v.snowLineM>1000||!Array.isArray(v.points)||v.points.length<2||v.points.length>400||v.points.some(q=>!inBounds(q,bounds)))throw Error('Zone alpine invalide');
 if(v.difficulty!==undefined&&!['green','blue','red','black'].includes(v.difficulty))throw Error('Zone alpine : difficulté invalide');
 if(v.liftKind!==undefined&&!['chairlift','gondola','draglift'].includes(v.liftKind))throw Error('Zone alpine : remontée invalide');
 if(v.liftName!==undefined&&(typeof v.liftName!=='string'||!v.liftName.trim()||v.liftName.length>100))throw Error('Zone alpine : nom de remontée invalide');
 if(v.liftPath!==undefined&&(!Array.isArray(v.liftPath)||v.liftPath.length<2||v.liftPath.length>40||v.liftPath.some(q=>!inBounds(q,bounds))))throw Error('Zone alpine : ligne de remontée invalide');
 return structuredClone(v);
}
/** Main run first, then the others in id order (deterministic for runtime and Studio). */
export function skiAreasOf(library:Record<string,SkiAreaV1>|undefined):SkiAreaV1[]{
 if(!library)return [];
 return Object.values(library).sort((a,b)=>a.id===MAIN_SKI_AREA_ID?-1:b.id===MAIN_SKI_AREA_ID?1:a.id<b.id?-1:a.id>b.id?1:0);
}
/** Geography inputs of the authored runs: main run, extra runs and the snow line. */
export function skiGeography(library:Record<string,SkiAreaV1>){
 const [main,...others]=skiAreasOf(library);
 return {snowLineM:main.snowLineM,ski:{points:main.points,widthM:main.widthM},
  ...(others.length?{skiRuns:others.map(a=>({points:a.points,widthM:a.widthM}))}:{})};
}
export function skiCorridorContains(area:Pick<SkiAreaV1,'points'|'widthM'>,x:number,z:number,margin=2){return area.points.slice(1).some((b,i)=>{const a=area.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<area.widthM/2+margin;});}
export function inspectSkiArea(area:SkiAreaV1,env:{height(x:number,z:number):number;water(x:number,z:number,h:number):number|null;occupation(x:number,z:number):string;seaLevel:number}){
 const report=validatePiste(area.points,area.widthM,env.height,{maxGrade:.7,maxCrossGrade:.3,minDrop:35});
 for(let i=1;i<area.points.length;i++){const a=area.points[i-1],b=area.points[i],d=Math.hypot(b.x-a.x,b.z-a.z);if(d<.5)continue;for(let j=0;j<=Math.ceil(d/2);j++){const t=j/Math.ceil(d/2);for(const side of [-1,0,1]){const x=a.x+(b.x-a.x)*t-(b.z-a.z)/d*side*(area.widthM/2+2),z=a.z+(b.z-a.z)*t+(b.x-a.x)/d*side*(area.widthM/2+2),h=env.height(x,z),water=env.water(x,z,h);if(!Number.isFinite(h)||h<area.snowLineM||h<=env.seaLevel+2||water!==null&&water>h+.08||env.occupation(x,z)!=='none')return {...report,ok:false,diagnostics:[...report.diagnostics,'Couloir humide ou occupé']};}}}
 return report;
}
