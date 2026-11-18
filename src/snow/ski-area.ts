/** Versioned authored alpine prototype. No alternate race, terrain or lift engine. */
import {validatePiste,type SkiPoint} from './snow-pistes.ts';
export interface SkiAreaV1 {version:1;id:string;name:string;points:SkiPoint[];widthM:number;snowLineM:number;equipment:'skis'|'snowboard';lift:boolean}
export function parseSkiArea(value:unknown,bounds:{minX:number;maxX:number;minZ:number;maxZ:number}):SkiAreaV1{
 const v=value as SkiAreaV1;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['version','id','name','points','widthM','snowLineM','equipment','lift'].includes(k))||v.version!==1||v.id!=='composition-alpine'||typeof v.name!=='string'||!v.name.trim()||v.name.length>100||!['skis','snowboard'].includes(v.equipment)||typeof v.lift!=='boolean'||!Number.isFinite(v.widthM)||v.widthM<4||v.widthM>30||!Number.isFinite(v.snowLineM)||v.snowLineM<0||v.snowLineM>1000||!Array.isArray(v.points)||v.points.length<2||v.points.length>400||v.points.some(q=>!q||Object.keys(q).some(k=>k!=='x'&&k!=='z')||!Number.isFinite(q.x)||!Number.isFinite(q.z)||q.x<bounds.minX||q.x>bounds.maxX||q.z<bounds.minZ||q.z>bounds.maxZ))throw Error('Zone alpine invalide');
 return structuredClone(v);
}
export function skiCorridorContains(area:SkiAreaV1,x:number,z:number,margin=2){return area.points.slice(1).some((b,i)=>{const a=area.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t)<area.widthM/2+margin;});}
export function inspectSkiArea(area:SkiAreaV1,env:{height(x:number,z:number):number;water(x:number,z:number,h:number):number|null;occupation(x:number,z:number):string;seaLevel:number}){
 const report=validatePiste(area.points,area.widthM,env.height,{maxGrade:.7,maxCrossGrade:.3,minDrop:35});
 for(let i=1;i<area.points.length;i++){const a=area.points[i-1],b=area.points[i],d=Math.hypot(b.x-a.x,b.z-a.z);if(d<.5)continue;for(let j=0;j<=Math.ceil(d/2);j++){const t=j/Math.ceil(d/2);for(const side of [-1,0,1]){const x=a.x+(b.x-a.x)*t-(b.z-a.z)/d*side*(area.widthM/2+2),z=a.z+(b.z-a.z)*t+(b.x-a.x)/d*side*(area.widthM/2+2),h=env.height(x,z),water=env.water(x,z,h);if(!Number.isFinite(h)||h<area.snowLineM||h<=env.seaLevel+2||water!==null&&water>h+.08||env.occupation(x,z)!=='none')return {...report,ok:false,diagnostics:[...report.diagnostics,'Couloir humide ou occupé']};}}}
 return report;
}
