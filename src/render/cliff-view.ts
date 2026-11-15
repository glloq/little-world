/** Near-field faceted stone faces for authored rl-cliff-* ridges.
 * Surface geology stays in the heightfield: these meshes only supply visible rock
 * facets, not caves or overhangs. Terrain is the single collision authority.
 * Segments are streamed near the camera; no island-wide persistent geometry. */
import * as THREE from 'three';
import type {ReliefFeature,PointXZ} from '../geography/archipelago.ts';
import type {TerrainGeneratorDefinition} from '../terrain-generator.ts';

export const CLIFF_BUDGET={radius:250,hysteresis:30,maxMeshes:32,buildPerUpdate:3,segmentM:18} as const;
type Cliff=Extract<ReliefFeature,{kind:'ridge'}>;
interface Segment {key:string;feature:Cliff;a:PointXZ;b:PointXZ;mid:PointXZ;seed:number;startM:number;endM:number;normalA:PointXZ;normalB:PointXZ}
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
function hash(s:string):number{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
function unit(seed:number):number{let h=seed>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return ((h^(h>>>16))>>>0)/4294967295;}
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const normal=(a:PointXZ,b:PointXZ):PointXZ=>{const d=distance(a,b)||1;return {x:-(b.z-a.z)/d,z:(b.x-a.x)/d};};
function tangentNormal(points:PointXZ[],index:number):PointXZ{
 const before=points[Math.max(0,index-1)],after=points[Math.min(points.length-1,index+1)];
 return normal(before,after);
}
function cliffFeatures(def:TerrainGeneratorDefinition|undefined):Cliff[]{
 return def?.kind==='archipelago'?def.archipelago.features.filter((f):f is Cliff=>f.kind==='ridge'&&f.id.startsWith('rl-cliff-')):[];
}
function segmentList(def:TerrainGeneratorDefinition|undefined,worldSeed:number):Segment[]{
 const result:Segment[]=[];
 for(const f of cliffFeatures(def)){
  const seed=hash(f.id)^worldSeed;
  let cumulative=0;
  for(let edge=1;edge<f.points.length;edge++){
   const p=f.points[edge-1],q=f.points[edge],len=distance(p,q);
   if(len<.01)continue;
   const n=Math.min(256,Math.max(1,Math.ceil(len/CLIFF_BUDGET.segmentM)));
   const na=tangentNormal(f.points,edge-1),nb=tangentNormal(f.points,edge);
   for(let i=0;i<n;i++){
    const a={x:lerp(p.x,q.x,i/n),z:lerp(p.z,q.z,i/n)};
    const b={x:lerp(p.x,q.x,(i+1)/n),z:lerp(p.z,q.z,(i+1)/n)};
    const mix=(t:number):PointXZ=>{const x=lerp(na.x,nb.x,t),z=lerp(na.z,nb.z,t),d=Math.hypot(x,z)||1;return {x:x/d,z:z/d};};
    result.push({key:f.id+':'+edge+':'+i,feature:f,a,b,mid:{x:(a.x+b.x)/2,z:(a.z+b.z)/2},
      seed,startM:cumulative+len*i/n,endM:cumulative+len*(i+1)/n,
      normalA:mix(i/n),normalB:mix((i+1)/n)});
   }
   cumulative+=len;
  }
 }
 return result;
}
export interface CliffSlice {a:PointXZ;b:PointXZ;widthM:number;seed:number;startM?:number;endM?:number;normalA?:PointXZ;normalB?:PointXZ}
const ROCK_PALETTE=[0x797f78,0x92958a,0x626e67,0x9da093,0x77766c].map(hex=>new THREE.Color(hex));
/** Deterministic global-space strata. Shared boundary stations have identical positions
 * independent of segment subdivision, LOD, load order and regeneration. */
export function buildCliffGeometry(s:CliffSlice,height:(x:number,z:number)=>number,lod:0|1=0):THREE.BufferGeometry{
 const len=distance(s.a,s.b),width=s.widthM;
 if(!(len>.01&&Number.isFinite(len)&&width>=5&&Number.isFinite(width)))throw Error('Tronçon de falaise invalide');
 const sta=lod===0?3:2,bands=lod===0?7:4;
 const na=s.normalA??normal(s.a,s.b),nb=s.normalB??normal(s.a,s.b);
 const start=s.startM??0,end=s.endM??len;
 const positions:number[]=[],colors:number[]=[];
 const pick=(t:number,v:number,side:number,part:number)=>unit(s.seed^Math.imul(Math.round(t*3)+19,7963)^Math.imul(Math.round(v*53)+11,1543)^Math.imul(side+3,997)^Math.imul(part+1,4591));
 function vertex(t:number,v:number,side:number):{x:number;y:number;z:number}{
  const u=lerp(start,end,t),cx=lerp(s.a.x,s.b.x,t),cz=lerp(s.a.z,s.b.z,t);
  const dx=lerp(na.x,nb.x,t),dz=lerp(na.z,nb.z,t),scale=1/(Math.hypot(dx,dz)||1);
  const interior=v>0&&v<1&&t>0&&t<1;
  const rough=interior?(pick(u,v,side,1)-.5)*width*.22:0;
  const lateral=width*(.11+1.14*v)+rough;
  const x=cx+dx*scale*side*lateral,z=cz+dz*scale*side*lateral;
  const centerH=height(cx,cz),native=height(x,z);
  const footX=cx+dx*scale*side*width*1.25,footZ=cz+dz*scale*side*width*1.25;
  const footH=height(footX,footZ);
  // Raise interior geological ribs only where a real native slope exists.
  const relief=Math.max(0,centerH-footH),rib=interior?relief*(.025+.09*pick(u,v,side,2))*Math.sin(Math.PI*v):0;
  const desired=lerp(centerH,footH,v===0?0:v===1?1:v*.72)+rib;
  return {x,y:Math.max(native+.24,desired+.24),z};
 }
 function tri(p:{x:number;y:number;z:number},q:typeof p,r:typeof p,color:THREE.Color){
  positions.push(p.x,p.y,p.z,q.x,q.y,q.z,r.x,r.y,r.z);
  for(let k=0;k<3;k++)colors.push(color.r,color.g,color.b);
 }
 for(const side of [-1,1]){
  const grid=Array.from({length:sta},(_,i)=>Array.from({length:bands},(_,j)=>vertex(i/(sta-1),j/(bands-1),side)));
  for(let i=0;i<sta-1;i++)for(let j=0;j<bands-1;j++){
   const p=grid[i][j],q=grid[i+1][j],r=grid[i+1][j+1],b=grid[i][j+1];
   // Strata alternate across bands; small colour noise varies faceted rock without a texture.
   const depth=j/(bands-1),layer=Math.floor(depth*5);
   const index=(layer+Math.floor(pick(lerp(start,end,(i+.5)/(sta-1)),depth,side,3)*3))%ROCK_PALETTE.length;
   const base=ROCK_PALETTE[index],shade=.86+.25*pick(lerp(start,end,(i+.5)/(sta-1)),depth,side,4);
   const color=base.clone().multiplyScalar(shade);
   if(side===1){tri(p,q,r,color);tri(p,r,b,color);}else{tri(p,r,q,color);tri(p,b,r,color);}
  }
  // Integrated scree apron: a few low-poly shards rooted in the native slope.
  // No individual draw calls, colliders or vegetation entities.
  const rocks=lod===0?3:1;
  for(let i=0;i<rocks;i++){
   const t=(i+.5)/rocks,u=lerp(start,end,t),cx=lerp(s.a.x,s.b.x,t),cz=lerp(s.a.z,s.b.z,t);
   const dx=lerp(na.x,nb.x,t),dz=lerp(na.z,nb.z,t),inv=1/(Math.hypot(dx,dz)||1);
   const radius=width*(1.32+.16*pick(u,0,side,5));
   const rx=cx+dx*inv*side*radius,rz=cz+dz*inv*side*radius;
   const size=width*(.09+.10*pick(u,0,side,6));
   const y=height(rx,rz)+.17,crest=y+size*(.3+.25*pick(u,0,side,7));
   const tangentX=(s.b.x-s.a.x)/len,tangentZ=(s.b.z-s.a.z)/len;
   const left={x:rx-tangentX*size,y:height(rx-tangentX*size,rz-tangentZ*size)+.13,z:rz-tangentZ*size};
   const right={x:rx+tangentX*size,y:height(rx+tangentX*size,rz+tangentZ*size)+.13,z:rz+tangentZ*size};
   const back={x:rx+dx*inv*side*size*.85,y:height(rx+dx*inv*side*size*.85,rz+dz*inv*side*size*.85)+.13,z:rz+dz*inv*side*size*.85};
   const peak={x:rx,y:crest,z:rz},colour=ROCK_PALETTE[Math.floor(pick(u,0,side,8)*ROCK_PALETTE.length)];
   tri(left,right,peak,colour);tri(right,back,peak,colour);tri(back,left,peak,colour);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
 return geometry;
}
export interface CliffStats {available:number;visible:number;built:number;disposed:number;triangles:number}
export function createCliffView(parent:THREE.Object3D,height:(x:number,z:number)=>number,seed:number,terrain?:TerrainGeneratorDefinition){
 const root=new THREE.Group();root.name='StreamedRockFaces';parent.add(root);
 const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
 const stats:CliffStats={available:0,visible:0,built:0,disposed:0,triangles:0};
 const active=new Map<string,{mesh:THREE.Mesh;lod:0|1}>();
 let segments=segmentList(terrain,seed),disposed=false,lastX=Infinity,lastZ=Infinity,dirty=true;
 stats.available=segments.length;
 const release=(key:string)=>{const entry=active.get(key);if(!entry)return;entry.mesh.removeFromParent();entry.mesh.geometry.dispose();active.delete(key);stats.disposed++;stats.visible=active.size;};
 const refresh=(definition?:TerrainGeneratorDefinition)=>{
  if(disposed)return;
  for(const k of [...active.keys()])release(k);
  segments=segmentList(definition,seed);stats.available=segments.length;stats.triangles=0;dirty=true;
 };
 const invalidate=()=>{if(disposed)return;for(const k of [...active.keys()])release(k);stats.triangles=0;dirty=true;};
 const update=(x:number,z:number)=>{
  if(disposed||!Number.isFinite(x)||!Number.isFinite(z))return;
  if(!dirty&&Math.hypot(x-lastX,z-lastZ)<12)return;
  dirty=false;lastX=x;lastZ=z;
  const nearby=segments.map(s=>({s,d:distance(s.mid,{x,z})})).filter(e=>e.d<CLIFF_BUDGET.radius+CLIFF_BUDGET.hysteresis)
    .sort((a,b)=>a.d-b.d).slice(0,CLIFF_BUDGET.maxMeshes);
  const wanted=new Map(nearby.map(v=>[v.s.key,v]));
  for(const key of [...active.keys()])if(!wanted.has(key))release(key);
  let built=0;
  for(const {s,d} of nearby){
   const lod:0|1=d>105?1:0,previous=active.get(s.key);
   if(previous?.lod===lod)continue;
   if(built>=CLIFF_BUDGET.buildPerUpdate){dirty=true;continue;}
   if(previous)release(s.key);
   const geometry=buildCliffGeometry({...s,widthM:s.feature.widthM},height,lod);
   const mesh=new THREE.Mesh(geometry,material);mesh.name='RockFace:'+s.key;mesh.frustumCulled=true;
   mesh.userData.cliffId=s.feature.id;root.add(mesh);active.set(s.key,{mesh,lod});built++;stats.built++;
  }
  stats.visible=active.size;
  stats.triangles=[...active.values()].reduce((n,e)=>n+e.mesh.geometry.getAttribute('position').count/3,0);
 };
 return {root,stats,refresh,invalidate,update,dispose(){
  if(disposed)return;disposed=true;for(const key of [...active.keys()])release(key);
  material.dispose();root.removeFromParent();segments=[];stats.available=stats.visible=stats.triangles=0;
 }};
}
export type CliffView=ReturnType<typeof createCliffView>;
