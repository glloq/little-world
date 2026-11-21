/**
 * Activity floors (doc 107 §sols): flat decks laid just above the relief — a pitch, a bowling
 * lane and its gutters, mini-golf lanes with their own relief. One analytic sampler feeds the
 * balls (simulation height), the hamster (WorldCollisionQuery outdoor surface) and the view,
 * so physics, walking and rendering always agree. No terrain is modified here; Studio's
 * « Aplanir le terrain » adds an earthwork pad when the author wants no step at all.
 */
import type {FloorMaterial,FloorShape} from '../catalog.ts';
import {areaToWorld,worldToArea,type MiniGameInstanceV1} from '../schema.ts';
import type {MiniGameEnvironment} from '../types.ts';

/** Rectangle in the AREA frame (centre, half sizes, yaw relative to the area). */
export interface FloorSpec {id:string;x:number;z:number;halfWidth:number;halfLength:number;yaw?:number;
  material:FloorMaterial;shape?:FloorShape;slope?:number;
  /** Extra metres above the highest ground under the floor's GROUP. */raise:number;
  /** Regions of one group share their base level (lane + gutters). */group?:string;
  /** Offset below the group level (gutter channel). */drop?:number;}
export interface FloorRegion extends Required<Pick<FloorSpec,'id'|'x'|'z'|'halfWidth'|'halfLength'|'material'>> {
  yaw:number;cos:number;sin:number;shape:FloorShape;slope:number;level:number;drop:number;}
export interface Floors {
  regions:FloorRegion[];
  /** Deck height at a world point, or null outside every region. */
  sample(x:number,z:number):number|null;
  /** World XZ bounds (early-out for WorldCollisionQuery). */
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  /** Walking surface of the hamster: the deck, plus an access ramp (apron) of `FLOOR_APRON`
   * metres all around it down to the relief, so a deck raised above sloping ground is never
   * a wall. Balls use `sample` only. */
  walk(x:number,z:number):number|null;
  /** Bounds of `walk` (deck bounds + apron). */
  walkBounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  /** Relief the floors were laid on (rendering of the aprons). */
  ground(x:number,z:number):number;
  /** Width of the access ramp (m). */
  apron:number;
}
/** Minimum width of the access ramp around every floor (m); it widens up to `max` so the
 * ramp never exceeds `slope` (rise/run) where the deck stands high above the relief. */
export const FLOOR_APRON=1.5;
export const FLOOR_APRON_LIMITS={max:6,slope:.8} as const;
const clamp01=(t:number)=>t<0?0:t>1?1:t;
const smooth=(a:number,b:number,t:number)=>{const k=clamp01((t-a)/(b-a));return k*k*(3-2*k);};
/** Relief offset of a lane at lane-frame (u across, v along), half sizes hw/hl. The ends
 * (first and last 20–30 %) stay flat so tees and holes always sit on level ground:
 *  - ramp-up / ramp-down: a straight ramp of gradient `slope` in the middle half;
 *  - bank: a cross slope `slope` fading in and out along the lane;
 *  - bumps: three smooth humps of height `slope` metres. */
export function shapeOffset(shape:FloorShape,slope:number,u:number,v:number,hw:number,hl:number):number{
  const L=2*hl,t=(v+hl)/L;
  switch(shape){
    case 'ramp-up':return slope*L*(clamp01((t-.25)/.5)*.5);
    case 'ramp-down':return slope*L*(.5-clamp01((t-.25)/.5)*.5);
    case 'bank':return slope*(u+hw)*smooth(.1,.3,t)*(1-smooth(.7,.9,t));
    case 'bumps':return t<.2||t>.8?0:slope*.5*(1-Math.cos((t-.2)/.6*Math.PI*6));
    default:return 0;
  }
}
export function buildFloors(def:MiniGameInstanceV1,env:MiniGameEnvironment,specs:readonly FloorSpec[]):Floors{
  // Base level per group: highest relief sampled over its regions (5×5 + corners).
  const top=new Map<string,number>();
  for(const s of specs){
    const g=s.group??s.id,yaw=s.yaw??0,c=Math.cos(yaw),sn=Math.sin(yaw);let hi=top.get(g)??-Infinity;
    for(let i=0;i<=4;i++)for(let j=0;j<=4;j++){
      const u=(i/2-1)*s.halfWidth,v=(j/2-1)*s.halfLength,ax=s.x+u*c+v*sn,az=s.z-u*sn+v*c,w=areaToWorld(def.area,ax,az);
      hi=Math.max(hi,env.height(w.x,w.z));
    }
    top.set(g,hi);
  }
  const regions:FloorRegion[]=specs.map(s=>{const yaw=s.yaw??0;return {id:s.id,x:s.x,z:s.z,halfWidth:s.halfWidth,halfLength:s.halfLength,material:s.material,
    yaw,cos:Math.cos(yaw),sin:Math.sin(yaw),shape:s.shape??'flat',slope:s.slope??0,level:Math.round(((top.get(s.group??s.id)??0)+s.raise)*1000)/1000,drop:s.drop??0};});
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const r of regions)for(const [u,v] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
    const ax=r.x+u*r.halfWidth*r.cos+v*r.halfLength*r.sin,az=r.z-u*r.halfWidth*r.sin+v*r.halfLength*r.cos,w=areaToWorld(def.area,ax,az);
    minX=Math.min(minX,w.x);maxX=Math.max(maxX,w.x);minZ=Math.min(minZ,w.z);maxZ=Math.max(maxZ,w.z);
  }
  const area=def.area;
  // `env.height` may be a collision world that already includes THIS walking surface: while
  // the bare relief is read, `walk` answers null (no recursion, the relief without the deck).
  let busy=false;
  const ground=(x:number,z:number)=>{if(busy)return env.height(x,z);busy=true;try{return env.height(x,z);}finally{busy=false;}};
  const sample=(x:number,z:number)=>{
    if(x<minX||x>maxX||z<minZ||z>maxZ)return null;
    const l=worldToArea(area,x,z);let best:number|null=null;
    for(const r of regions){
      const dx=l.x-r.x,dz=l.z-r.z,u=dx*r.cos-dz*r.sin,v=dx*r.sin+dz*r.cos;
      if(Math.abs(u)>r.halfWidth||Math.abs(v)>r.halfLength)continue;
      const h=r.level-r.drop+shapeOffset(r.shape,r.slope,u,v,r.halfWidth,r.halfLength);
      if(best===null||h>best)best=h;
    }
    return best;
  };
  // Apron width from the highest deck edge above the relief (sampled every metre).
  let drop=0;
  for(const r of regions)for(const [u0,v0,u1,v1] of [[-1,-1,1,-1],[1,-1,1,1],[1,1,-1,1],[-1,1,-1,-1]]){
    const n=Math.max(1,Math.ceil(2*Math.max(r.halfWidth,r.halfLength)));
    for(let k=0;k<=n;k++){const u=(u0+(u1-u0)*k/n)*r.halfWidth,v=(v0+(v1-v0)*k/n)*r.halfLength,ax=r.x+u*r.cos+v*r.sin,az=r.z-u*r.sin+v*r.cos,w=areaToWorld(area,ax,az);
      drop=Math.max(drop,r.level-r.drop+shapeOffset(r.shape,r.slope,u,v,r.halfWidth,r.halfLength)-env.height(w.x,w.z));}
  }
  const A=Math.min(FLOOR_APRON_LIMITS.max,Math.max(FLOOR_APRON,Math.round(drop/FLOOR_APRON_LIMITS.slope*10)/10));
  const walkBounds={minX:minX-A,maxX:maxX+A,minZ:minZ-A,maxZ:maxZ+A};
  return {regions,bounds:{minX,maxX,minZ,maxZ},sample,ground,walkBounds,apron:A,walk(x,z){
    if(busy)return null;
    const inside=sample(x,z);if(inside!==null||!regions.length)return inside;
    if(x<walkBounds.minX||x>walkBounds.maxX||z<walkBounds.minZ||z>walkBounds.maxZ)return null;
    const l=worldToArea(area,x,z);let best:number|null=null,g:number|null=null;
    for(const r of regions){
      const dx=l.x-r.x,dz=l.z-r.z,u=dx*r.cos-dz*r.sin,v=dx*r.sin+dz*r.cos;
      const d=Math.hypot(Math.max(0,Math.abs(u)-r.halfWidth),Math.max(0,Math.abs(v)-r.halfLength));
      if(d<=0||d>=A)continue;
      const uc=Math.max(-r.halfWidth,Math.min(r.halfWidth,u)),vc=Math.max(-r.halfLength,Math.min(r.halfLength,v));
      const edge=r.level-r.drop+shapeOffset(r.shape,r.slope,uc,vc,r.halfWidth,r.halfLength);g??=ground(x,z);
      if(edge<=g)continue;const h=edge+(g-edge)*d/A;if(best===null||h>best)best=h;
    }
    return best;
  }};
}
/** Simulation height: relief or deck, whichever is higher (idempotent with a collision world
 * that already registered the same deck). */
export function withFloors(env:MiniGameEnvironment,floors:Floors):MiniGameEnvironment{
  if(!floors.regions.length)return env;
  return {...env,height:(x,z)=>{const g=env.height(x,z),f=floors.sample(x,z);return f!==null&&f>g?f:g;}};
}
