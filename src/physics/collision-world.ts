/** Gameplay-only queries: no mesh, camera, LOD or renderer dependency.
 * PHYS-1: swept kinematic motion (sub-steps ≤ 0.2 m), steppable obstacle tops, slope limit,
 * ceilings / headroom, push-out of moving obstacles, stacked spaces (rectangular layers or
 * space providers such as mine grids) and explicit transitions between spaces. */
export interface Point3 {x:number;y:number;z:number;}
export interface MovementSpace {zoneId:string;levelId:string;}
export interface SurfaceLayer {id:string;zoneId:string;levelId:string;minX:number;maxX:number;minZ:number;maxZ:number;floorY:number;ceilingY:number;}
export interface SurfaceSample {floorY:number;ceilingY:number|null;space:MovementSpace|null;}
export interface CollisionBody {id:string;position:Point3;size:Point3;shape:'box'|'sphere';enabled:()=>boolean;}
export interface Bounds {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;}
/** Compact underground space (e.g. a mine): answers per level from its own occupancy data,
 * so excavable walls never become thousands of collider objects. */
export interface SpaceProvider {
  /** Floor and ceiling of the open column at (x, z), or null when it is solid / outside. */
  column(levelId:string,x:number,z:number):{floorY:number;ceilingY:number}|null;
  /** Append the solid blocks overlapping the rectangle (full height for this level). */
  solids(levelId:string,minX:number,maxX:number,minZ:number,maxZ:number,out:Bounds[]):void;
  /** Reference floor of the level (used when the point is not in an open column). */
  floor(levelId:string):number;
}
/** Controlled connection between spaces (mine entrance, stairs, shaft). `from`/`to` null =
 * exterior surface. The arrival point must lie outside the reverse transition. */
export interface TransitionVolume {id:string;from:MovementSpace|null;to:MovementSpace|null;minX:number;maxX:number;minZ:number;maxZ:number;minY:number;maxY:number;arrival:Point3;label?:string}
export interface BodyDimensions {radius:number;height:number;step:number;maxSlope:number}
/** Default walker: 0.4 m radius, 1.8 m tall, 0.45 m step, slope up to tan 50°. */
export const DEFAULT_BODY:BodyDimensions={radius:.4,height:1.8,step:.45,maxSlope:Math.tan(50*Math.PI/180)};
export interface MoveOptions {space?:MovementSpace;body?:Partial<BodyDimensions>;grounded?:boolean;fromY?:number}
export interface MoveResult {position:Point3;blockedX:boolean;blockedZ:boolean;floorY:number;ceilingY:number|null;pushed:boolean}
const finite=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=100000;
const validPoint=(p:Point3)=>p&&finite(p.x)&&finite(p.y)&&finite(p.z);
const sameSpace=(a:MovementSpace|null|undefined,b:MovementSpace|null|undefined)=>!a&&!b||!!a&&!!b&&a.zoneId===b.zoneId&&a.levelId===b.levelId;
const SUBSTEP=.2;
/** Sparse grid broadphase; axis-aligned boxes, sphere envelopes conservative in XZ. */
export class WorldCollisionQuery {
 private bodies=new Map<string,CollisionBody>();
 private cells=new Map<string,Set<string>>();
 private memberships=new Map<string,string[]>();
 private layers:SurfaceLayer[]=[];
 private providers=new Map<string,SpaceProvider>();
 private transitions:TransitionVolume[]=[];
 private terrain:(x:number,z:number)=>number;
 private water:(x:number,z:number)=>number|null;
 private large=new Set<string>();
 private scratch:Bounds[]=[];
 readonly cellSize=32;
 constructor(terrain:(x:number,z:number)=>number,water:(x:number,z:number)=>number|null){this.terrain=terrain;this.water=water;}
 private keys(bounds:{minX:number;maxX:number;minZ:number;maxZ:number}){const keys:string[]=[];for(let x=Math.floor(bounds.minX/this.cellSize);x<=Math.floor(bounds.maxX/this.cellSize);x++)for(let z=Math.floor(bounds.minZ/this.cellSize);z<=Math.floor(bounds.maxZ/this.cellSize);z++)keys.push(x+':'+z);return keys;}
 private bounds(body:CollisionBody):Bounds {const p=body.position,s=body.size;return {minX:p.x-s.x/2,maxX:p.x+s.x/2,minZ:p.z-s.z/2,maxZ:p.z+s.z/2,minY:p.y,maxY:p.y+s.y};}
 add(body:CollisionBody){
  if(!body.id||!validPoint(body.position)||!validPoint(body.size)||[body.size.x,body.size.y,body.size.z].some(n=>n<=0||n>100000)||!['box','sphere'].includes(body.shape)||typeof body.enabled!=='function')throw Error('Collider logique invalide');
  this.remove(body.id);const copy={...body,position:{...body.position},size:{...body.size}},bounds=this.bounds(copy),cellCount=(Math.floor(bounds.maxX/this.cellSize)-Math.floor(bounds.minX/this.cellSize)+1)*(Math.floor(bounds.maxZ/this.cellSize)-Math.floor(bounds.minZ/this.cellSize)+1),keys=cellCount>1024?[]:this.keys(bounds);if(cellCount>1024)this.large.add(body.id);this.bodies.set(body.id,copy);this.memberships.set(body.id,keys);for(const key of keys){const cell=this.cells.get(key)??new Set<string>();cell.add(body.id);this.cells.set(key,cell);}
 }
 remove(id:string){this.large.delete(id);for(const key of this.memberships.get(id)??[]){const cell=this.cells.get(key);cell?.delete(id);if(!cell?.size)this.cells.delete(key);}this.memberships.delete(id);this.bodies.delete(id);}
 moveBody(id:string,position:Point3){const body=this.bodies.get(id);if(body)this.add({...body,position});}
 addLayer(layer:SurfaceLayer){
  if(!layer.id||!layer.zoneId||!layer.levelId||![layer.minX,layer.maxX,layer.minZ,layer.maxZ,layer.floorY,layer.ceilingY].every(finite)||layer.minX>=layer.maxX||layer.minZ>=layer.maxZ||layer.ceilingY-layer.floorY<1)throw Error('Surface superposée invalide');
  this.layers=this.layers.filter(l=>l.id!==layer.id);this.layers.push({...layer});
 }
 /** One provider per zone (mine): its levels answer floor, ceiling and solid rock. */
 setSpaceProvider(zoneId:string,provider:SpaceProvider|null){if(provider)this.providers.set(zoneId,provider);else this.providers.delete(zoneId);}
 addTransition(t:TransitionVolume){
  if(!t.id||![t.minX,t.maxX,t.minZ,t.maxZ,t.minY,t.maxY].every(finite)||t.minX>=t.maxX||t.minZ>=t.maxZ||t.minY>=t.maxY||!validPoint(t.arrival)||sameSpace(t.from,t.to))throw Error('Transition invalide');
  this.transitions=this.transitions.filter(v=>v.id!==t.id);this.transitions.push({...t,arrival:{...t.arrival}});
 }
 removeTransitions(prefix:string){this.transitions=this.transitions.filter(t=>!t.id.startsWith(prefix));}
 /** Transition whose volume contains the point, from the current space. */
 transitionAt(position:Point3,space?:MovementSpace|null):TransitionVolume|null{
  for(const t of this.transitions)if(sameSpace(t.from,space)&&position.x>=t.minX&&position.x<=t.maxX&&position.z>=t.minZ&&position.z<=t.maxZ&&position.y>=t.minY&&position.y<=t.maxY)return t;
  return null;
 }
 /** Base floor/ceiling of the space (terrain outside, layer or provider column underground). */
 private base(x:number,z:number,y:number,space?:MovementSpace|null):{floorY:number;ceilingY:number|null}{
  if(!space)return {floorY:this.terrain(x,z),ceilingY:null};
  const provider=this.providers.get(space.zoneId);
  if(provider){const c=provider.column(space.levelId,x,z);return c??{floorY:provider.floor(space.levelId),ceilingY:provider.floor(space.levelId)};}
  let best:SurfaceLayer|undefined,lowest:SurfaceLayer|undefined;
  for(const l of this.layers){if(l.zoneId!==space.zoneId||l.levelId!==space.levelId||x<l.minX||x>l.maxX||z<l.minZ||z>l.maxZ)continue;if(l.floorY<=y+.45&&(!best||l.floorY>best.floorY))best=l;if(!lowest||l.floorY<lowest.floorY)lowest=l;}
  const layer=best??lowest;if(!layer)throw Error('Surface absente dans cet étage : '+space.zoneId+'/'+space.levelId);
  return {floorY:layer.floorY,ceilingY:layer.ceilingY};
 }
 private gather(minX:number,maxX:number,minZ:number,maxZ:number,space?:MovementSpace|null):Bounds[]{
  const out=this.scratch;out.length=0;const area={minX,maxX,minZ,maxZ};
  const ids=new Set<string>(this.large);for(const k of this.keys(area))for(const id of this.cells.get(k)??[])ids.add(id);
  for(const id of [...ids].sort()){const b=this.bodies.get(id)!;if(b.enabled())out.push(this.bounds(b));}
  const provider=space?this.providers.get(space.zoneId):undefined;if(provider&&space)provider.solids(space.levelId,minX,maxX,minZ,maxZ,out);
  return out;
 }
 /** Floor under a footprint: base floor plus steppable obstacle tops (≤ max(y, fromY) + step). */
 surfaceAt(position:Point3,space?:MovementSpace,radius=0,options:{step?:number;fromY?:number}={}):SurfaceSample {
  if(!validPoint(position))throw Error('Position de surface invalide');
  const base=this.base(position.x,position.z,position.y,space);let floorY=base.floorY,ceilingY=base.ceilingY;
  if(radius>0||this.bodies.size){
   const step=options.step??DEFAULT_BODY.step,reach=Math.max(position.y,options.fromY??position.y)+step,r=Math.max(radius,1e-3);
   for(const b of this.gather(position.x-r,position.x+r,position.z-r,position.z+r,null)){
    if(position.x+r<=b.minX||position.x-r>=b.maxX||position.z+r<=b.minZ||position.z-r>=b.maxZ)continue;
    if(b.maxY<=reach+1e-6){if(b.maxY>floorY)floorY=b.maxY;}
    else if(b.minY>=position.y+step&&(ceilingY===null||b.minY<ceilingY))ceilingY=b.minY;
   }
  }
  return {floorY,ceilingY,space:space?{...space}:null};
 }
 waterAt(position:Point3,space?:MovementSpace){if(!validPoint(position))throw Error('Position d’eau invalide');return space?null:this.water(position.x,position.z);}
 /** Swept horizontal motion: axis-separated contact clamp per sub-step (exact contact with
  * walls), obstacle tops below the step height are walkable, the base relief cannot be
  * climbed faster than the body's max slope, and low passages need the body's headroom. */
 move(from:Point3,desired:Point3,radius=.4,height=1.8,options:MoveOptions={}):MoveResult{
  if(!validPoint(from)||!validPoint(desired)||!Number.isFinite(radius)||radius<=0||radius>5||!Number.isFinite(height)||height<=0||height>10)throw Error('Mouvement de collision invalide');
  if(Math.abs(desired.x-from.x)+2*radius>512||Math.abs(desired.z-from.z)+2*radius>512)throw Error('Utiliser une transition explicite pour téléporter le joueur');
  const body={...DEFAULT_BODY,...options.body,radius,height},space=options.space??null,feet=desired.y,step=body.step;
  let x=from.x,z=from.z,blockedX=false,blockedZ=false,pushed=false;
  const blocking=(b:Bounds)=>b.maxY>feet+step+1e-6&&b.minY<feet+height-1e-3;
  // Moving obstacles may have entered the body: push out along the shallowest axis first.
  for(const b of this.gather(x-radius,x+radius,z-radius,z+radius,space)){
   if(!blocking(b)||x+radius<=b.minX||x-radius>=b.maxX||z+radius<=b.minZ||z-radius>=b.maxZ)continue;
   const px=Math.min(x+radius-b.minX,b.maxX-(x-radius)),pz=Math.min(z+radius-b.minZ,b.maxZ-(z-radius));
   if(px<pz)x=x-b.minX<b.maxX-x?b.minX-radius:b.maxX+radius;else z=z-b.minZ<b.maxZ-z?b.minZ-radius:b.maxZ+radius;pushed=true;
  }
  const dx=desired.x-from.x,dz=desired.z-from.z,steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/SUBSTEP));
  let currentBase=this.base(x,z,feet,space).floorY;
  for(let i=1;i<=steps;i++){
   const tx=from.x+dx*i/steps,tz=from.z+dz*i/steps;
   const solids=this.gather(Math.min(x,tx)-radius,Math.max(x,tx)+radius,Math.min(z,tz)-radius,Math.max(z,tz)+radius,space);
   let nx=tx;
   for(const b of solids){if(!blocking(b)||z<=b.minZ-radius||z>=b.maxZ+radius)continue;const lo=b.minX-radius,hi=b.maxX+radius;if(x<=lo&&nx>lo)nx=Math.min(nx,lo);else if(x>=hi&&nx<hi)nx=Math.max(nx,hi);else if(x>lo&&x<hi&&nx>lo&&nx<hi)nx=Math.abs(nx-lo)<Math.abs(nx-hi)?lo:hi;}
   if(nx!==x&&!this.passable(nx,z,x,z,currentBase,feet,body,space))nx=x;
   if(Math.abs(nx-tx)>1e-9)blockedX=true;
   if(nx!==x){currentBase=this.base(nx,z,feet,space).floorY;x=nx;}
   let nz=tz;
   for(const b of solids){if(!blocking(b)||x<=b.minX-radius||x>=b.maxX+radius)continue;const lo=b.minZ-radius,hi=b.maxZ+radius;if(z<=lo&&nz>lo)nz=Math.min(nz,lo);else if(z>=hi&&nz<hi)nz=Math.max(nz,hi);else if(z>lo&&z<hi&&nz>lo&&nz<hi)nz=Math.abs(nz-lo)<Math.abs(nz-hi)?lo:hi;}
   if(nz!==z&&!this.passable(x,nz,x,z,currentBase,feet,body,space))nz=z;
   if(Math.abs(nz-tz)>1e-9)blockedZ=true;
   if(nz!==z){currentBase=this.base(x,nz,feet,space).floorY;z=nz;}
   if(blockedX&&blockedZ&&x===from.x&&z===from.z)break;
  }
  const s=this.surfaceAt({x,y:feet,z},space??undefined,radius,{step,fromY:options.fromY});
  return {position:{x,y:desired.y,z},blockedX,blockedZ,floorY:s.floorY,ceilingY:s.ceilingY,pushed};
 }
 /** Relief slope (grounded only) and headroom of the destination of one sub-step. */
 private passable(x:number,z:number,fx:number,fz:number,currentBase:number,feet:number,body:BodyDimensions,space:MovementSpace|null){
  const next=this.base(x,z,feet,space);
  if(next.ceilingY!==null&&next.ceilingY-Math.max(next.floorY,feet)<body.height-1e-6)return false;
  const run=Math.hypot(x-fx,z-fz);
  return !(next.floorY-currentBase>body.maxSlope*run+.02&&next.floorY>feet+.02);
 }
 get stats(){return {bodies:this.bodies.size,cells:this.cells.size,layers:this.layers.length,providers:this.providers.size,transitions:this.transitions.length};}
}
