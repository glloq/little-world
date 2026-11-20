/** Near-field faceted stone faces for authored rl-cliff-* ridges.
 * Surface geology stays in the heightfield: these meshes only supply visible rock
 * facets, not caves or overhangs. Terrain is the single collision authority.
 * Segments are streamed near the camera; no island-wide persistent geometry. */
import * as THREE from 'three';
import {addRadialFade} from './radial-fade.ts';
import type {ReliefFeature,PointXZ} from '../geography/archipelago.ts';
import type {TerrainGeneratorDefinition} from '../terrain-generator.ts';

export const CLIFF_BUDGET={radius:250,hysteresis:30,maxMeshes:32,buildPerUpdate:3,segmentM:18} as const;
type Cliff=Extract<ReliefFeature,{kind:'ridge'}>;
interface Segment {key:string;feature:Cliff;a:PointXZ;b:PointXZ;mid:PointXZ;seed:number;startM:number;endM:number;normalA:PointXZ;normalB:PointXZ;capStart:boolean;capEnd:boolean}
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
      normalA:mix(i/n),normalB:mix((i+1)/n),capStart:edge===1&&i===0,capEnd:edge===f.points.length-1&&i===n-1});
   }
   cumulative+=len;
  }
 }
 return result;
}
export interface CliffSlice {a:PointXZ;b:PointXZ;widthM:number;seed:number;startM?:number;endM?:number;normalA?:PointXZ;normalB?:PointXZ;capStart?:boolean;capEnd?:boolean;volcanic?:boolean}
const ROCK_PALETTE=[0x929083,0x7c837e,0x8b887c].map(hex=>new THREE.Color(hex));
const BASALT_PALETTE=[0x505455,0x555753,0x4b5053].map(hex=>new THREE.Color(hex));
/** Deterministic global-space strata. Shared boundary stations have identical positions
 * independent of segment subdivision, LOD, load order and regeneration. */
export function buildCliffGeometry(s:CliffSlice,height:(x:number,z:number)=>number,lod:0|1=0):THREE.BufferGeometry{
 const len=distance(s.a,s.b),width=s.widthM;
 if(!(len>.01&&Number.isFinite(len)&&width>=5&&Number.isFinite(width)))throw Error('Tronçon de falaise invalide');
 // Same boundary ring at both LODs prevents T-junctions on curved/native terrain.
 const sta=lod===0?3:2,bands=7,palette=s.volcanic?BASALT_PALETTE:ROCK_PALETTE;
 const na=s.normalA??normal(s.a,s.b),nb=s.normalB??normal(s.a,s.b);
 const start=s.startM??0,end=s.endM??len;
 const positions:number[]=[],colors:number[]=[];
 const pick=(t:number,v:number,side:number,part:number)=>unit(s.seed^Math.imul(Math.round(t*3)+19,7963)^Math.imul(Math.round(v*53)+11,1543)^Math.imul(side+3,997)^Math.imul(part+1,4591));
 type RockPoint={x:number;y:number;z:number;color?:THREE.Color};
 const phase=unit(s.seed)*Math.PI*2;
 // Geological columns follow the whole polyline, including shared stations and both LODs.
 const fracture=(u:number,side:number)=>(Math.sin(u*.44+phase+side*.7)+.35*Math.sin(u*.91+phase*1.7))/1.35;
 function stoneColor(p:RockPoint,u:number,v:number,side:number):THREE.Color{
  // World-height layers replace the per-quad lottery: no checkerboard at segment joins.
  const warp=.55*Math.sin(p.x*.018+p.z*.012+phase);
  const layer=(p.y+warp)/(s.volcanic?7:4.8)+phase;
  const vein=Math.max(0,1-Math.abs(Math.sin(layer*Math.PI))/.18);
  const column=fracture(u,side),foot=v*v*.10;
  // Intrinsic cavity shading only, not a baked sun direction: compatible with day/night.
  const cavity=Math.max(0,-column)*Math.sin(Math.PI*v)*.17;
  const shade=1-foot-cavity-vein*(s.volcanic ? .035 : .08)+Math.max(0,column)*.025;
  return palette[0].clone().lerp(palette[1],.5+.5*Math.sin(layer*Math.PI)).multiplyScalar(shade);
 }
 function vertex(t:number,v:number,side:number):RockPoint{
  const u=lerp(start,end,t),cx=lerp(s.a.x,s.b.x,t),cz=lerp(s.a.z,s.b.z,t);
  const dx=lerp(na.x,nb.x,t),dz=lerp(na.z,nb.z,t),scale=1/(Math.hypot(dx,dz)||1);
  const column=fracture(u,side),envelope=Math.sin(Math.PI*v);
  // Reposition existing vertices into long vertical ribs instead of random band bumps.
  // Boundaries use the same global u; do not zero the relief at every segment end.
  const rough=column*width*(s.volcanic ? .28 : .22)*envelope;
  const lateral=width*(.11+1.14*v)+rough;
  const x=cx+dx*scale*side*lateral,z=cz+dz*scale*side*lateral;
  const centerH=height(cx,cz),native=height(x,z);
  const footX=cx+dx*scale*side*width*1.25,footZ=cz+dz*scale*side*width*1.25;
  const footH=height(footX,footZ);
  // Raise interior geological ribs only where a real native slope exists.
  const relief=Math.max(0,centerH-footH),rib=relief*(.025+(s.volcanic ? .18 : .12)*Math.max(0,column))*envelope;
  const desired=lerp(centerH,footH,v===0?0:v===1?1:v*.88)+rib;
  // Blend open ends into native relief; internal stations retain the shared ring.
  const openEnd=t===0&&s.capStart||t===1&&s.capEnd;
  const p:RockPoint={x,y:openEnd?native+.08:Math.max(native+.24,desired+.24),z};
  p.color=stoneColor(p,u,v,side);return p;
 }
 function tri(p:RockPoint,q:RockPoint,r:RockPoint,color?:THREE.Color){
  for(const point of [p,q,r]){
   positions.push(point.x,point.y,point.z);
   const c=color??point.color!;colors.push(c.r,c.g,c.b);
  }
 }
 for(const side of [-1,1]){
  const grid=Array.from({length:sta},(_,i)=>Array.from({length:bands},(_,j)=>vertex(i/(sta-1),j/(bands-1),side)));
  for(let i=0;i<sta-1;i++)for(let j=0;j<bands-1;j++){
   const p=grid[i][j],q=grid[i+1][j],r=grid[i+1][j+1],b=grid[i][j+1];
   if(side===1){tri(p,q,r);tri(p,r,b);}else{tri(p,r,q);tri(p,b,r);}
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
   const peak={x:rx,y:crest,z:rz},colour=palette[Math.floor(pick(u,0,side,8)*palette.length)];
   tri(left,right,peak,colour);tri(right,back,peak,colour);tri(back,left,peak,colour);
  }
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.computeVertexNormals();geometry.computeBoundingSphere();geometry.computeBoundingBox();
 return geometry;
}
export interface CliffStats {available:number;visible:number;built:number;disposed:number;triangles:number;lod0:number;lod1:number;pending:number}
export function createCliffView(parent:THREE.Object3D,height:(x:number,z:number)=>number,seed:number,terrain?:TerrainGeneratorDefinition){
 const root=new THREE.Group();root.name='StreamedRockFaces';parent.add(root);
 const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
 // Rock faces fade over the outer 40 m of their radius (per vertex: meshes are in world
 // coordinates) instead of appearing whole at 250 m (doc 106, SEAM-7).
 const fade={center:{value:new THREE.Vector3()},radius:{value:CLIFF_BUDGET.radius},band:{value:40}};addRadialFade(material,fade,true);
 // Geometries leaving the radius (or replaced by the other LOD) are kept a while: coming
 // back or crossing the LOD distance again reuses them instead of rebuilding (HITCH-6).
 const kept=new Map<string,THREE.BufferGeometry>(),KEPT_MAX=48;
 const keep=(key:string,geometry:THREE.BufferGeometry)=>{kept.delete(key);kept.set(key,geometry);while(kept.size>KEPT_MAX){const [k,g]=kept.entries().next().value!;kept.delete(k);g.dispose();}};
 const stats:CliffStats={available:0,visible:0,built:0,disposed:0,triangles:0,lod0:0,lod1:0,pending:0};
 let volcanoes=terrain?.kind==='archipelago'?terrain.archipelago.features.filter(f=>f.kind==='volcano'):[];
 const active=new Map<string,{mesh:THREE.Mesh;lod:0|1}>();
 let segments=segmentList(terrain,seed),disposed=false,lastX=Infinity,lastZ=Infinity,dirty=true;
 stats.available=segments.length;
 const release=(key:string,cache=false)=>{const entry=active.get(key);if(!entry)return;entry.mesh.removeFromParent();if(cache)keep(key+'/'+entry.lod,entry.mesh.geometry);else entry.mesh.geometry.dispose();active.delete(key);stats.disposed++;stats.visible=active.size;};
 const forget=()=>{for(const g of kept.values())g.dispose();kept.clear();};
 const refresh=(definition?:TerrainGeneratorDefinition)=>{
  if(disposed)return;
  for(const k of [...active.keys()])release(k);forget();
  segments=segmentList(definition,seed);volcanoes=definition?.kind==='archipelago'?definition.archipelago.features.filter(f=>f.kind==='volcano'):[];
  stats.available=segments.length;stats.triangles=stats.lod0=stats.lod1=0;stats.pending=segments.length;dirty=true;
 };
 const invalidate=()=>{if(disposed)return;for(const k of [...active.keys()])release(k);forget();stats.triangles=stats.lod0=stats.lod1=0;stats.pending=segments.length;dirty=true;};
 const update=(x:number,z:number)=>{
  if(disposed||!Number.isFinite(x)||!Number.isFinite(z))return;
  fade.center.value.set(x,0,z);
  if(!dirty&&Math.hypot(x-lastX,z-lastZ)<12)return;
  dirty=false;lastX=x;lastZ=z;
  const nearby=segments.map(s=>({s,d:distance(s.mid,{x,z})})).filter(e=>e.d<CLIFF_BUDGET.radius+CLIFF_BUDGET.hysteresis)
    .sort((a,b)=>a.d-b.d).slice(0,CLIFF_BUDGET.maxMeshes);
  const wanted=new Map(nearby.map(v=>[v.s.key,v]));
  for(const key of [...active.keys()])if(!wanted.has(key))release(key,true);
  let built=0;stats.pending=0;
  for(const {s,d} of nearby){
   // ±10 m hysteresis around the LOD distance: no rebuild back and forth on the threshold.
   const previous=active.get(s.key),lod:0|1=previous&&Math.abs(d-105)<10?previous.lod:d>105?1:0;
   if(previous?.lod===lod)continue;
   const reused=kept.get(s.key+'/'+lod);
   if(!reused&&built>=CLIFF_BUDGET.buildPerUpdate){dirty=true;stats.pending++;continue;}
   if(previous)release(s.key,true);
   let geometry=reused;
   if(geometry)kept.delete(s.key+'/'+lod);
   else{
    // Reuse the authored volcano footprint, without adding a source schema or material.
    const volcanic=volcanoes.some(f=>Math.hypot(s.mid.x-f.x,s.mid.z-f.z)<f.radiusM*.65);
    geometry=buildCliffGeometry({...s,widthM:s.feature.widthM,volcanic},height,lod);built++;stats.built++;
   }
   const mesh=new THREE.Mesh(geometry,material);mesh.name='RockFace:'+s.key;mesh.frustumCulled=true;
   mesh.userData.cliffId=s.feature.id;mesh.matrixAutoUpdate=false;root.add(mesh);active.set(s.key,{mesh,lod});
  }
  stats.visible=active.size;
  stats.lod0=[...active.values()].filter(e=>e.lod===0).length;stats.lod1=active.size-stats.lod0;
  stats.triangles=[...active.values()].reduce((n,e)=>n+e.mesh.geometry.getAttribute('position').count/3,0);
 };
 return {root,stats,refresh,invalidate,update,dispose(){
  if(disposed)return;disposed=true;for(const key of [...active.keys()])release(key);forget();
  material.dispose();root.removeFromParent();segments=[];stats.available=stats.visible=stats.triangles=stats.lod0=stats.lod1=stats.pending=0;
 }};
}
export type CliffView=ReturnType<typeof createCliffView>;
