/** Near-field faceted stone faces for authored rl-cliff-* ridges.
 * Surface geology stays in the heightfield: these meshes only supply visible rock
 * facets, not caves or overhangs. Terrain is the single collision authority.
 * Segments are streamed near the camera; no island-wide persistent geometry. */
import * as THREE from 'three';
import type {ReliefFeature,PointXZ} from '../geography/archipelago.ts';
import type {TerrainGeneratorDefinition} from '../terrain-generator.ts';

export const CLIFF_BUDGET={radius:250,hysteresis:30,maxMeshes:32,buildPerUpdate:3,segmentM:18} as const;
type Cliff=Extract<ReliefFeature,{kind:'ridge'}>;
interface Segment {key:string;feature:Cliff;a:PointXZ;b:PointXZ;mid:PointXZ;seed:number}
const distance=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
function hash(s:string):number{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return h>>>0;}
function unit(seed:number):number{let h=seed>>>0;h=Math.imul(h^(h>>>16),0x7feb352d);h=Math.imul(h^(h>>>15),0x846ca68b);return ((h^(h>>>16))>>>0)/4294967295;}
function cliffFeatures(def:TerrainGeneratorDefinition|undefined):Cliff[]{
 return def?.kind==='archipelago'?def.archipelago.features.filter((f):f is Cliff=>f.kind==='ridge'&&f.id.startsWith('rl-cliff-')):[];
}
function segmentList(def:TerrainGeneratorDefinition|undefined,worldSeed:number):Segment[]{
 const result:Segment[]=[];
 for(const f of cliffFeatures(def)){
  const seed=hash(f.id)^worldSeed;
  for(let edge=1;edge<f.points.length;edge++){
   const p=f.points[edge-1],q=f.points[edge],n=Math.min(256,Math.max(1,Math.ceil(distance(p,q)/CLIFF_BUDGET.segmentM)));
   for(let i=0;i<n;i++){
    const a={x:p.x+(q.x-p.x)*i/n,z:p.z+(q.z-p.z)*i/n};
    const b={x:p.x+(q.x-p.x)*(i+1)/n,z:p.z+(q.z-p.z)*(i+1)/n};
    result.push({key:f.id+':'+edge+':'+i,feature:f,a,b,mid:{x:(a.x+b.x)/2,z:(a.z+b.z)/2},seed:seed^Math.imul(edge*257+i,0x9e3779b1)});
   }
  }
 }
 return result;
}
/** Builds one bounded double-sided rock strip. Both sides follow the native ridge.
 * Vertical bands stand proud of the native hill but their foot touches the slope.
 * Non-indexed flat normals, deterministic facet colours and zero textures. */
export function buildCliffGeometry(segment:{a:PointXZ;b:PointXZ;widthM:number;seed:number},height:(x:number,z:number)=>number,lod:0|1=0):THREE.BufferGeometry{
 const {a,b,widthM,seed}=segment,len=distance(a,b);
 if(!(len>.01&&widthM>=5&&Number.isFinite(widthM)))throw Error('Tronçon de falaise invalide');
 const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
 const stations=lod===0?3:2,columns=lod===0?3:2;
 const positions:number[]=[],colors:number[]=[];
 const rock=[new THREE.Color(0x757b74),new THREE.Color(0x899086),new THREE.Color(0x626d68),new THREE.Color(0x9a9c90)];
 for(const side of [-1,1]){
  const grid:{x:number;y:number;z:number}[][]=[];
  for(let i=0;i<stations;i++){
   const t=i/(stations-1),cx=a.x+(b.x-a.x)*t,cz=a.z+(b.z-a.z)*t;
   const top=height(cx,cz),foot=height(cx+nx*side*widthM*1.25,cz+nz*side*widthM*1.25);
   const row:{x:number;y:number;z:number}[]=[];
   for(let j=0;j<columns;j++){
    const v=j/(columns-1),lateral=widthM*(.10+1.15*v);
    const random=unit(seed^Math.imul(i+1,1013)^Math.imul(j+1,6197)^Math.imul(side+2,691));
    const jitter=(i===0||i===stations-1||j===0||j===columns-1)?0:(random-.5)*widthM*.1;
    const x=cx+nx*side*(lateral+jitter),z=cz+nz*side*(lateral+jitter);
    // Lift the middle facet above the native ridge to create a real visible wall,
    // never a floating base; the native heightfield remains collision authority.
    const desired=top+(foot-top)*(v===0?0:v===1?1:.33);
    const y=Math.max(height(x,z)+.22,desired+.22);
    row.push({x,y,z});
   }
   grid.push(row);
  }
  function tri(p:{x:number;y:number;z:number},q:typeof p,r:typeof p,colour:THREE.Color){
   positions.push(p.x,p.y,p.z,q.x,q.y,q.z,r.x,r.y,r.z);
   for(let k=0;k<3;k++)colors.push(colour.r,colour.g,colour.b);
  }
  for(let i=0;i<stations-1;i++)for(let j=0;j<columns-1;j++){
   const p=grid[i][j],q=grid[i+1][j],r=grid[i+1][j+1],s=grid[i][j+1];
   const col=rock[Math.floor(unit(seed^Math.imul(i+3,713)^Math.imul(j+7,271)^Math.imul(side+2,4231))*rock.length)];
   // Each band uses two faceted triangles, no smoothing across geological joints.
   if(side===1){tri(p,q,r,col);tri(p,r,s,col);}else{tri(p,r,q,col);tri(p,s,r,col);}
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
 const release=(key:string)=>{const entry=active.get(key);if(!entry)return;entry.mesh.removeFromParent();entry.mesh.geometry.dispose();active.delete(key);stats.disposed++;};
 const refresh=(definition?:TerrainGeneratorDefinition)=>{
  if(disposed)return;
  for(const k of [...active.keys()])release(k);
  segments=segmentList(definition,seed);stats.available=segments.length;dirty=true;
 };
 const invalidate=()=>{if(disposed)return;for(const k of [...active.keys()])release(k);dirty=true;};
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
