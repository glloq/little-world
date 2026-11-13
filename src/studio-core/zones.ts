/** E6 — authoring data of activity zones (farm plots, mines): polygon boundaries only.
 * This is the source contract the future mine/agriculture systems will read (docs 24/25);
 * no simulation is implemented here. Optional library: projects without zones stay valid. */
import type {ActivityZoneV3,PointXZ,ProjectDocument,WorldDefinitionV3} from './types.ts';
export const ZONE_KINDS:Record<ActivityZoneV3['kind'],string>={'farm-plot':'Parcelle agricole',mine:'Mine'};
export function polygonArea(points:PointXZ[]):number{let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.z-q.x*p.z;}return Math.abs(a)/2;}
function cross(a:PointXZ,b:PointXZ,c:PointXZ){return (b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);}
function segmentsCross(a:PointXZ,b:PointXZ,c:PointXZ,d:PointXZ){const d1=cross(c,d,a),d2=cross(c,d,b),d3=cross(a,b,c),d4=cross(a,b,d);return d1*d2<0&&d3*d4<0;}
export function selfIntersects(points:PointXZ[]):boolean{
  const n=points.length;for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){if(Math.abs(i-j)<=1||(i===0&&j===n-1))continue;if(segmentsCross(points[i],points[(i+1)%n],points[j],points[(j+1)%n]))return true;}return false;
}
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateZone(value:unknown,world:WorldDefinitionV3):ActivityZoneV3{
  const z=value as ActivityZoneV3;
  if(!z||typeof z!=='object'||Array.isArray(z))throw Error('Zone invalide');
  for(const key of Object.keys(z))if(!['id','kind','name','polygon','levels'].includes(key))throw Error('Zone : champ inconnu '+key);
  if(typeof z.id!=='string'||!z.id.length||z.id.length>128)throw Error('Zone : identifiant invalide');
  if(!(z.kind in ZONE_KINDS))throw Error('Zone : type inconnu');
  if(typeof z.name!=='string'||!z.name.trim()||z.name.length>100)throw Error('Zone : nom requis');
  if(!Array.isArray(z.polygon)||z.polygon.length<3||z.polygon.length>64)throw Error('Zone : 3 à 64 sommets');
  const b=world.bounds;for(const p of z.polygon){if(!p||Object.keys(p).some(k=>k!=='x'&&k!=='z')||!finite(p.x,b.minX,b.maxX)||!finite(p.z,b.minZ,b.maxZ))throw Error('Zone : sommet hors du monde');}
  if(selfIntersects(z.polygon))throw Error('Zone : le contour se croise');
  if(polygonArea(z.polygon)<4)throw Error('Zone : surface inférieure à 4 m²');
  if(z.kind==='mine'){if(!(Number.isInteger(z.levels)&&finite(z.levels,1,8)))throw Error('Mine : 1 à 8 niveaux');}else if(z.levels!==undefined)throw Error('Zone : niveaux réservés aux mines');
  return z;
}
export function putZone(project:ProjectDocument,zone:ActivityZoneV3){validateZone(zone,project.world);project.libraries.zones={...(project.libraries.zones??{}),[zone.id]:structuredClone(zone)};}
export function removeZone(project:ProjectDocument,id:string){if(!project.libraries.zones?.[id])return;const next={...project.libraries.zones};delete next[id];project.libraries.zones=next;}
