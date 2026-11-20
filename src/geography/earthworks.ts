/**
 * Earthworks (doc 104 §C4): the one terrain-grading primitive shared by
 * settlements, fields, roads and activity sites. Each work is analytic
 * (polygon/corridor + target level), applied LAST to the archipelago height in
 * a fixed order, so the Studio, the compiler, workers and the game all read
 * the same graded ground without baking a raster. Separate from the 64 relief
 * features: grading is local and numerous.
 *
 * Levels are metres above sea level. Talus is the blend band OUTSIDE the
 * footprint; inside the footprint the target level is reached exactly.
 */
import {compilePolygon} from './archipelago.ts';

export interface PointXZ {x:number;z:number}
export type EarthworkV1=
 /** Flat platform. */
 |{id:string;kind:'pad';polygon:PointXZ[];levelM:number;talusM:number}
 /** Stepped terraces falling along (dirX, dirZ): flat treads of `depthM - riserM`, smooth risers. */
 |{id:string;kind:'terraces';polygon:PointXZ[];origin:PointXZ;levelM:number;dirX:number;dirZ:number;slope:number;depthM:number;riserM:number;talusM:number}
 /** Road / track bed: level interpolated along the polyline (cut and fill). */
 |{id:string;kind:'corridor';points:PointXZ[];levels:number[];widthM:number;talusM:number};
export const EARTHWORK_LIMIT=256;

const smooth=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const num=(v:unknown,label:string,min:number,max:number)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Terrassement : '+label+' invalide');return v;};
const points=(v:unknown,label:string,min:number,max:number):PointXZ[]=>{if(!Array.isArray(v)||v.length<min||v.length>max)throw Error('Terrassement : '+label+' invalide');return v.map(q=>{if(!record(q)||Object.keys(q).some(k=>k!=='x'&&k!=='z'))throw Error('Terrassement : point invalide');return {x:num(q.x,'x',-1e5,1e5),z:num(q.z,'z',-1e5,1e5)};});};
const KEYS:Record<EarthworkV1['kind'],string[]>={
 pad:['id','kind','polygon','levelM','talusM'],
 terraces:['id','kind','polygon','origin','levelM','dirX','dirZ','slope','depthM','riserM','talusM'],
 corridor:['id','kind','points','levels','widthM','talusM'],
};
export function parseEarthworks(value:unknown):EarthworkV1[]{
 if(!Array.isArray(value)||value.length>EARTHWORK_LIMIT)throw Error(`Terrassements : ${EARTHWORK_LIMIT} au maximum`);
 const ids=new Set<string>();
 return value.map(raw=>{
  if(!record(raw)||typeof raw.kind!=='string'||!(raw.kind in KEYS))throw Error('Terrassement inconnu');
  const kind=raw.kind as EarthworkV1['kind'];if(Object.keys(raw).some(k=>!KEYS[kind].includes(k)))throw Error('Terrassement : champ inconnu');
  if(typeof raw.id!=='string'||!/^[a-zA-Z0-9_.:-]{1,96}$/.test(raw.id)||ids.has(raw.id))throw Error('Terrassement : identifiant invalide');ids.add(raw.id);
  const talusM=num(raw.talusM,'talus',.5,120);
  if(kind==='pad')return {id:raw.id,kind,polygon:points(raw.polygon,'contour',3,64),levelM:num(raw.levelM,'niveau',-200,1400),talusM};
  if(kind==='terraces'){
   const dirX=num(raw.dirX,'direction',-1,1),dirZ=num(raw.dirZ,'direction',-1,1);if(Math.abs(Math.hypot(dirX,dirZ)-1)>.01)throw Error('Terrassement : direction non unitaire');
   const depthM=num(raw.depthM,'profondeur',4,80),riserM=num(raw.riserM,'contremarche',.5,depthM*.6);
   const [origin]=points([raw.origin],'origine',1,1);
   return {id:raw.id,kind,polygon:points(raw.polygon,'contour',3,64),origin,levelM:num(raw.levelM,'niveau',-200,1400),dirX,dirZ,slope:num(raw.slope,'pente',0,.5),depthM,riserM,talusM};
  }
  const pts=points(raw.points,'tracé',2,200);if(!Array.isArray(raw.levels)||raw.levels.length!==pts.length)throw Error('Terrassement : un niveau par point');
  return {id:raw.id,kind,points:pts,levels:raw.levels.map(v=>num(v,'niveau',-200,1400)),widthM:num(raw.widthM,'largeur',1,60),talusM};
 });
}

/** Target level of terraces at a point: flat treads, smoothstep risers. Exported for tests/planners. */
export function terraceLevel(w:Extract<EarthworkV1,{kind:'terraces'}>,x:number,z:number):number{
 const t=(x-w.origin.x)*w.dirX+(z-w.origin.z)*w.dirZ,step=w.slope*w.depthM,k=Math.floor(t/w.depthM),frac=t-k*w.depthM;
 const tread=w.depthM-w.riserM,base=w.levelM-step*k;
 return frac<=tread?base:base-step*smooth(tread,w.depthM,frac);
}
function corridorTarget(w:Extract<EarthworkV1,{kind:'corridor'}>,x:number,z:number):{d:number;level:number}{
 let best=Infinity,level=w.levels[0];
 for(let i=1;i<w.points.length;i++){const a=w.points[i-1],b=w.points[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1))),ex=x-a.x-t*dx,ez=z-a.z-t*dz,d=ex*ex+ez*ez;if(d<best){best=d;level=lerp(w.levels[i-1],w.levels[i],t);}}
 return {d:Math.sqrt(best),level};
}
interface Compiled {box:{minX:number;maxX:number;minZ:number;maxZ:number};weight(x:number,z:number):number;target(x:number,z:number):number}
function compileOne(w:EarthworkV1,sea:number):Compiled{
 if(w.kind==='corridor'){
  const xs=w.points.map(p=>p.x),zs=w.points.map(p=>p.z),pad=w.widthM/2+w.talusM;
  let last={x:NaN,z:NaN,r:{d:0,level:0}};const at=(x:number,z:number)=>{if(x!==last.x||z!==last.z)last={x,z,r:corridorTarget(w,x,z)};return last.r;};
  return {box:{minX:Math.min(...xs)-pad,maxX:Math.max(...xs)+pad,minZ:Math.min(...zs)-pad,maxZ:Math.max(...zs)+pad},
   weight:(x,z)=>{const d=at(x,z).d;return d<=w.widthM/2?1:1-smooth(w.widthM/2,w.widthM/2+w.talusM,d);},target:(x,z)=>sea+at(x,z).level};
 }
 const sdf=compilePolygon(w.polygon),xs=w.polygon.map(p=>p.x),zs=w.polygon.map(p=>p.z);
 return {box:{minX:Math.min(...xs)-w.talusM,maxX:Math.max(...xs)+w.talusM,minZ:Math.min(...zs)-w.talusM,maxZ:Math.max(...zs)+w.talusM},
  weight:(x,z)=>smooth(-w.talusM,0,sdf(x,z)),target:w.kind==='pad'?()=>sea+w.levelM:(x,z)=>sea+terraceLevel(w,x,z)};
}
/** Height post-process for a list of earthworks, or null when there are none. */
export function compileEarthworks(list:readonly EarthworkV1[]|undefined,sea:number):((x:number,z:number,h:number)=>number)|null{
 if(!list?.length)return null;
 const works=list.map(w=>compileOne(w,sea));
 return (x,z,h)=>{
  for(const w of works){const b=w.box;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)continue;const k=w.weight(x,z);if(k>0)h=lerp(h,w.target(x,z),k);}
  return h;
 };
}
/** Footprint of a work for land reservations (polygon, or the corridor polyline). */
export function earthworkFootprint(w:EarthworkV1):{kind:'polygon';points:PointXZ[]}|{kind:'corridor';points:PointXZ[];widthM:number}{
 return w.kind==='corridor'?{kind:'corridor',points:w.points,widthM:w.widthM+2*w.talusM}:{kind:'polygon',points:w.polygon};
}
/** Axis-aligned bounds including the talus (change areas, culling). */
export function earthworkBounds(w:EarthworkV1):{minX:number;maxX:number;minZ:number;maxZ:number}{
 const pts=w.kind==='corridor'?w.points:w.polygon,pad=w.talusM+(w.kind==='corridor'?w.widthM/2:0),xs=pts.map(p=>p.x),zs=pts.map(p=>p.z);
 return {minX:Math.min(...xs)-pad,maxX:Math.max(...xs)+pad,minZ:Math.min(...zs)-pad,maxZ:Math.max(...zs)+pad};
}
