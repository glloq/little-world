/** Gameplay-only queries: no mesh, camera, LOD or renderer dependency. */
export interface Point3 {x:number;y:number;z:number;}
export interface MovementSpace {zoneId:string;levelId:string;}
export interface SurfaceLayer {id:string;zoneId:string;levelId:string;minX:number;maxX:number;minZ:number;maxZ:number;floorY:number;ceilingY:number;}
export interface SurfaceSample {floorY:number;ceilingY:number|null;space:MovementSpace|null;}
export interface CollisionBody {id:string;position:Point3;size:Point3;shape:'box'|'sphere';enabled:()=>boolean;}
interface Bounds {minX:number;maxX:number;minY:number;maxY:number;minZ:number;maxZ:number;}
const finite=(n:number)=>Number.isFinite(n)&&Math.abs(n)<=100000;
const validPoint=(p:Point3)=>p&&finite(p.x)&&finite(p.y)&&finite(p.z);
/** Sparse grid broadphase; axis-aligned boxes, sphere envelopes conservative in XZ. */
export class WorldCollisionQuery {
 private bodies=new Map<string,CollisionBody>();
 private cells=new Map<string,Set<string>>();
 private memberships=new Map<string,string[]>();
 private layers:SurfaceLayer[]=[];
 private terrain:(x:number,z:number)=>number;
 private water:(x:number,z:number)=>number|null;
 private large=new Set<string>();
 readonly cellSize=32;
 constructor(terrain:(x:number,z:number)=>number,water:(x:number,z:number)=>number|null){this.terrain=terrain;this.water=water;}
 private keys(bounds:Bounds){const keys:string[]=[];for(let x=Math.floor(bounds.minX/this.cellSize);x<=Math.floor(bounds.maxX/this.cellSize);x++)for(let z=Math.floor(bounds.minZ/this.cellSize);z<=Math.floor(bounds.maxZ/this.cellSize);z++)keys.push(x+':'+z);return keys;}
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
 surfaceAt(position:Point3,space?:MovementSpace):SurfaceSample {
  if(!validPoint(position))throw Error('Position de surface invalide');
  if(!space)return {floorY:this.terrain(position.x,position.z),ceilingY:null,space:null};
  const candidates=this.layers.filter(l=>l.zoneId===space.zoneId&&l.levelId===space.levelId&&position.x>=l.minX&&position.x<=l.maxX&&position.z>=l.minZ&&position.z<=l.maxZ);
  candidates.sort((a,b)=>b.floorY-a.floorY);const layer=candidates.find(l=>l.floorY<=position.y+.45)??candidates.at(-1);if(!layer)throw Error('Surface absente dans cet étage : '+space.zoneId+'/'+space.levelId);
  return {floorY:layer.floorY,ceilingY:layer.ceilingY,space:{...space}};
 }
 waterAt(position:Point3,space?:MovementSpace){if(!validPoint(position))throw Error('Position d’eau invalide');return space?null:this.water(position.x,position.z);}
 move(from:Point3,desired:Point3,radius=.4,height=1.8):{position:Point3;blockedX:boolean;blockedZ:boolean}{
  if(!validPoint(from)||!validPoint(desired)||!Number.isFinite(radius)||radius<=0||radius>5||!Number.isFinite(height)||height<=0||height>10)throw Error('Mouvement de collision invalide');
  const bounds={minX:Math.min(from.x,desired.x)-radius,maxX:Math.max(from.x,desired.x)+radius,minZ:Math.min(from.z,desired.z)-radius,maxZ:Math.max(from.z,desired.z)+radius,minY:desired.y,maxY:desired.y+height};
  if(bounds.maxX-bounds.minX>512||bounds.maxZ-bounds.minZ>512)throw Error('Utiliser une transition explicite pour téléporter le joueur');
  const ids=new Set([...this.large,...this.keys(bounds).flatMap(k=>[...(this.cells.get(k)??[])])]),solids=[...ids].sort().map(id=>this.bodies.get(id)!).filter(b=>b.enabled()).map(b=>this.bounds(b)).filter(b=>desired.y+height>b.minY+.001&&desired.y<b.maxY-.001);
  let x=desired.x,z=desired.z;
  for(const b of solids){if(from.z<=b.minZ-radius||from.z>=b.maxZ+radius)continue;const lo=b.minX-radius,hi=b.maxX+radius;if(from.x<=lo&&x>lo)x=Math.min(x,lo);else if(from.x>=hi&&x<hi)x=Math.max(x,hi);else if(from.x>lo&&from.x<hi&&x>lo&&x<hi)x=Math.abs(x-lo)<Math.abs(x-hi)?lo:hi;}
  for(const b of solids){if(x<=b.minX-radius||x>=b.maxX+radius)continue;const lo=b.minZ-radius,hi=b.maxZ+radius;if(from.z<=lo&&z>lo)z=Math.min(z,lo);else if(from.z>=hi&&z<hi)z=Math.max(z,hi);else if(from.z>lo&&from.z<hi&&z>lo&&z<hi)z=Math.abs(z-lo)<Math.abs(z-hi)?lo:hi;}
  return {position:{x,y:desired.y,z},blockedX:Math.abs(x-desired.x)>1e-9,blockedZ:Math.abs(z-desired.z)>1e-9};
 }
 get stats(){return {bodies:this.bodies.size,cells:this.cells.size,layers:this.layers.length};}
}
