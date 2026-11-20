import * as THREE from 'three';
import {surfZoneMargin,type SurfWaveField,type SurfZone} from '../surf/wave-field.ts';
import {createSurfWaterMaterial} from './surf-water-material.ts';

/** Terrain-sampled static envelopes, GPU-animated crests. One mesh per zone split into LOD
 * tiles (nested steps 1/2/4 of one lattice, skirts between different steps); only the index
 * buffer changes, and only when a tile changes tier. LOD never changes the wave physics.
 * No per-frame terrain resampling, render target, texture or CPU vertex upload. */
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
/** Historical stateless thresholds (metres), kept as the centre of the hysteresis band. */
const TIER_DISTANCE=[150,400] as const;
/** ±18 %: a camera hovering near a threshold never alternates between two tessellations. */
export const SURF_LOD_HYSTERESIS=.18;
/** Finest spacing per wavelength (5 vertices on the 2nd harmonic; normals stay analytic). */
const SAMPLES_PER_WAVELENGTH=10,MIN_SPACING=1.25,MAX_SPACING=4,MAX_TIER0_VERTICES=20000;
export interface SurfWaterStats {
 /** Finest tier currently drawn by any tile (0 = full resolution). */
 tier:number;vertices:number;triangles:number;maxVertices:number;
 /** Wet quads kept / all quads of the finest grid (fully dry beach quads are not drawn). */
 wetRatio:number;tierChanges:number;tiles:number;}
export interface SurfViewPoint {x:number;z:number;y?:number}
/** 3D distance from a viewpoint (camera, or player when no camera) to the zone rectangle. */
export function surfZoneViewDistance(zone:SurfZone,view:SurfViewPoint):number{
 const dx=Math.max(zone.minX-view.x,0,view.x-zone.maxX);
 const dz=Math.max(zone.minZ-view.z,0,view.z-zone.maxZ);
 const dy=view.y===undefined?0:Math.max(0,view.y-zone.seaLevel);
 return Math.hypot(dx,dz,dy);
}
/** Stateless distance tier (historical contract). */
export function surfWaterTier(zone:SurfZone,focus:SurfViewPoint,budgetLevel:number):0|1|2 {
 return selectSurfWaterTier(zone,focus,budgetLevel,null);
}
/** Distance tier with hysteresis around the historical thresholds, floored by the budget. */
export function selectSurfWaterTier(zone:SurfZone,view:SurfViewPoint,budgetLevel:number,
 previous:0|1|2|null):0|1|2 {
 const distance=surfZoneViewDistance(zone,view);
 let tier:0|1|2=distance>TIER_DISTANCE[1]?2:distance>TIER_DISTANCE[0]?1:0;
 if(previous!==null&&previous!==tier){
  // Keep the previous tier until the distance leaves the band around the shared threshold.
  const threshold=TIER_DISTANCE[Math.min(previous,tier)];
  if(Math.abs(distance-threshold)<threshold*SURF_LOD_HYSTERESIS&&Math.abs(previous-tier)===1)tier=previous;
 }
 const floor=Number.isFinite(budgetLevel)?Math.max(0,Math.floor(budgetLevel)):0;
 return Math.min(2,Math.max(floor,tier)) as 0|1|2;
}
/** Static terrain samples of the finest grid, shared by the three nested tiers. */
export interface SurfWaterLattice {nx:number;nz:number;x0:number;z0:number;dx:number;dz:number;
 envelope:Float32Array;wet:Uint8Array;
 /** Per vertex: breaking 0..1, depth 0 (beach) .. 1 (≥ 4 × shoreFadeDepth), edge fade 0..1. */
 shore:Float32Array;
 /** Static envelope gradient (x,z) for the shader's analytic normal. */
 envelopeGradient:Float32Array}
export function surfWaterLattice(zone:SurfZone,ground:(x:number,z:number)=>number):SurfWaterLattice{
 const width=zone.maxX-zone.minX,length=zone.maxZ-zone.minZ;
 let spacing=Math.max(MIN_SPACING,Math.min(MAX_SPACING,zone.wavelength/SAMPLES_PER_WAVELENGTH));
 while((width/spacing+1)*(length/spacing+1)>MAX_TIER0_VERTICES)spacing*=1.1;
 // Multiples of 4: tier 1 and tier 2 keep every 2nd and 4th vertex of tier 0.
 const nx=Math.max(4,4*Math.ceil(width/spacing/4)),nz=Math.max(4,4*Math.ceil(length/spacing/4));
 const envelope=new Float32Array((nx+1)*(nz+1)),wet=new Uint8Array((nx+1)*(nz+1));
 const shore=new Float32Array((nx+1)*(nz+1)*3),envelopeGradient=new Float32Array((nx+1)*(nz+1)*2);
 const fadeDepth=zone.shoreFadeDepth??4,edgeFade=zone.edgeFade??12;
 // Visual-only border fade (colour, foam), wider than the swell envelope but bounded.
 const visualFade=Math.min(edgeFade*2.5,edgeFade+30),margin={margin:0,gx:0,gz:0};
 for(let j=0;j<=nz;j++){
  const z=zone.minZ+length*j/nz;
  for(let i=0;i<=nx;i++){
   const x=zone.minX+width*i/nx,index=j*(nx+1)+i,depth=zone.seaLevel-ground(x,z);
   const edge=surfZoneMargin(zone,x,z,margin).margin;
   const isWet=Number.isFinite(depth)&&depth>.05;
   envelope[index]=isWet?smooth(depth/fadeDepth)*smooth(edge/edgeFade):0;
   wet[index]=isWet?1:0;
   // Same breaking value as SurfWaveField.sample (drives shoaling skew, colour and foam).
   shore[index*3]=isWet?1-smooth(depth/(fadeDepth*1.4)):1;
   shore[index*3+1]=isWet?Math.min(1,depth/(fadeDepth*4)):0;
   // The zone outline dissolves into NearSea; the physical envelope is unchanged.
   shore[index*3+2]=smooth(edge/visualFade);
  }
 }
 const dx=width/nx,dz=length/nz;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const i0=Math.max(0,i-1),i1=Math.min(nx,i+1),j0=Math.max(0,j-1),j1=Math.min(nz,j+1),index=j*(nx+1)+i;
  envelopeGradient[index*2]=(envelope[j*(nx+1)+i1]-envelope[j*(nx+1)+i0])/((i1-i0)*dx);
  envelopeGradient[index*2+1]=(envelope[j1*(nx+1)+i]-envelope[j0*(nx+1)+i])/((j1-j0)*dz);
 }
 return {nx,nz,x0:zone.minX,z0:zone.minZ,dx,dz,envelope,wet,shore,envelopeGradient};
}
/** Fine cells per LOD tile (multiple of 4 so tiers 1/2 stay aligned across tiles). */
export const SURF_TILE_CELLS=16;
/** Camera distance thresholds of a tile (m): finest below the first, coarsest beyond the second. */
const TILE_DISTANCE=[70,260] as const;
const TILE_DISTANCE_SQUARED=TILE_DISTANCE.map(distance=>distance*distance);
const TILE_HYSTERESIS_SQUARED=TILE_DISTANCE.map(distance=>{
 const min=distance*(1-SURF_LOD_HYSTERESIS),max=distance*(1+SURF_LOD_HYSTERESIS);
 return {min:min*min,max:max*max};
});
interface Tile {i0:number;i1:number;j0:number;j1:number;minX:number;maxX:number;minZ:number;maxZ:number;tier:0|1|2}
/** One mesh per zone: all fine-lattice vertices (+ skirt copies on tile borders) and an index
 * buffer rebuilt only when a tile changes tier. Unreferenced vertices are never shaded. */
function createTiledWater(zone:SurfZone,lattice:SurfWaterLattice){
 const {nx,nz}=lattice,row=nx+1,count=(nx+1)*(nz+1);
 const onBorderX=(i:number)=>i>0&&i<nx&&i%SURF_TILE_CELLS===0;
 const onBorderZ=(j:number)=>j>0&&j<nz&&j%SURF_TILE_CELLS===0;
 // Skirt copy index for every vertex lying on an internal tile border line.
 const skirtOf=new Int32Array(count).fill(-1);let skirts=0;
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++)if(onBorderX(i)||onBorderZ(j))skirtOf[j*row+i]=count+skirts++;
 const total=count+skirts;
 const positions=new Float32Array(total*3),envelope=new Float32Array(total),wet=new Float32Array(total),
  shore=new Float32Array(total*3),gradient=new Float32Array(total*2),skirt=new Float32Array(total);
 const put=(target:number,source:number)=>{
  const i=source%row,j=Math.floor(source/row);
  positions[target*3]=zone.minX+(zone.maxX-zone.minX)*i/nx;
  positions[target*3+1]=zone.seaLevel+.02;
  positions[target*3+2]=zone.minZ+(zone.maxZ-zone.minZ)*j/nz;
  envelope[target]=lattice.envelope[source];wet[target]=lattice.wet[source];
  shore.set(lattice.shore.subarray(source*3,source*3+3),target*3);
  gradient.set(lattice.envelopeGradient.subarray(source*2,source*2+2),target*2);
 };
 for(let v=0;v<count;v++){put(v,v);if(skirtOf[v]>=0){put(skirtOf[v],v);skirt[skirtOf[v]]=1;}}
 const tiles:Tile[]=[];
 for(let j0=0;j0<nz;j0+=SURF_TILE_CELLS)for(let i0=0;i0<nx;i0+=SURF_TILE_CELLS){
  const i1=Math.min(nx,i0+SURF_TILE_CELLS),j1=Math.min(nz,j0+SURF_TILE_CELLS);
  tiles.push({i0,i1,j0,j1,minX:zone.minX+(zone.maxX-zone.minX)*i0/nx,maxX:zone.minX+(zone.maxX-zone.minX)*i1/nx,
   minZ:zone.minZ+(zone.maxZ-zone.minZ)*j0/nz,maxZ:zone.minZ+(zone.maxZ-zone.minZ)*j1/nz,tier:0});
 }
 const tilesX=Math.ceil(nx/SURF_TILE_CELLS),tilesZ=Math.ceil(nz/SURF_TILE_CELLS);
 const blockWet=(i:number,j:number,step:number)=>{
  for(let b=0;b<=step;b++)for(let a=0;a<=step;a++)
   if(lattice.wet[Math.min(nz,j+b)*row+Math.min(nx,i+a)])return true;
  return false;
 };
 // Worst case: every quad at full resolution plus skirts on both sides of every border segment.
 const capacity=nx*nz*6+skirts*12;
 const indices=total>65535?new Uint32Array(capacity):new Uint16Array(capacity);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geometry.setAttribute('aEnvelope',new THREE.BufferAttribute(envelope,1));
 geometry.setAttribute('aWet',new THREE.BufferAttribute(wet,1));
 geometry.setAttribute('aShore',new THREE.BufferAttribute(shore,3));
 geometry.setAttribute('aEnvGrad',new THREE.BufferAttribute(gradient,2));
 geometry.setAttribute('aSkirt',new THREE.BufferAttribute(skirt,1));
 const index=new THREE.BufferAttribute(indices,1).setUsage(THREE.DynamicDrawUsage);
 geometry.setIndex(index);
 geometry.boundingBox=new THREE.Box3(new THREE.Vector3(zone.minX,zone.seaLevel-zone.amplitude*1.4-1.5,zone.minZ),
  new THREE.Vector3(zone.maxX,zone.seaLevel+zone.amplitude*1.4+.1,zone.maxZ));
 geometry.boundingSphere=geometry.boundingBox.getBoundingSphere(new THREE.Sphere());
 let cursor=0;
 // Front faces up (same winding as the historical grid), whatever the vertex order given.
 const tri=(a:number,b:number,c:number)=>{
  const ax=positions[a*3],az=positions[a*3+2];
  const ny=(positions[b*3+2]-az)*(positions[c*3]-ax)-(positions[b*3]-ax)*(positions[c*3+2]-az);
  if(ny>=0){indices[cursor++]=a;indices[cursor++]=b;indices[cursor++]=c;}
  else{indices[cursor++]=a;indices[cursor++]=c;indices[cursor++]=b;}
 };
 const vertex=(i:number,j:number)=>j*row+i;
 let wetQuads=0,fineQuads=0;
 function rebuild(){
  cursor=0;
  for(const t of tiles){
   const step=1<<t.tier;
   for(let j=t.j0;j<t.j1;j+=step)for(let i=t.i0;i<t.i1;i+=step){
    if(!blockWet(i,j,step))continue;
    const a=vertex(i,j),b=vertex(i,Math.min(nz,j+step)),c=vertex(Math.min(nx,i+step),j),d=vertex(Math.min(nx,i+step),Math.min(nz,j+step));
    indices[cursor++]=a;indices[cursor++]=b;indices[cursor++]=c;
    indices[cursor++]=c;indices[cursor++]=b;indices[cursor++]=d;
   }
  }
  // Skirts on borders between two different tessellations (both sides, each at its own step).
  for(let tj=0;tj<tilesZ;tj++)for(let ti=0;ti<tilesX;ti++){
   const t=tiles[tj*tilesX+ti],step=1<<t.tier;
   const right=ti+1<tilesX?tiles[tj*tilesX+ti+1]:null,top=tj+1<tilesZ?tiles[(tj+1)*tilesX+ti]:null;
   const left=ti>0?tiles[tj*tilesX+ti-1]:null,bottom=tj>0?tiles[(tj-1)*tilesX+ti]:null;
   const edge=(fixed:number,from:number,to:number,vertical:boolean)=>{
    for(let k=from;k<to;k+=step){
     const k2=Math.min(to,k+step);
     const p=vertical?vertex(fixed,k):vertex(k,fixed),q=vertical?vertex(fixed,k2):vertex(k2,fixed);
     if(!lattice.wet[p]&&!lattice.wet[q])continue;
     const ps=skirtOf[p],qs=skirtOf[q];if(ps<0||qs<0)continue;
     tri(p,q,ps);tri(q,qs,ps);
    }
   };
   if(right&&right.tier!==t.tier)edge(t.i1,t.j0,t.j1,true);
   if(left&&left.tier!==t.tier)edge(t.i0,t.j0,t.j1,true);
   if(top&&top.tier!==t.tier)edge(t.j1,t.i0,t.i1,false);
   if(bottom&&bottom.tier!==t.tier)edge(t.j0,t.i0,t.i1,false);
  }
  index.clearUpdateRanges();index.addUpdateRange(0,cursor);index.needsUpdate=true;
  geometry.setDrawRange(0,cursor);
 }
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){fineQuads++;if(blockWet(i,j,1))wetQuads++;}
 rebuild();
 const next=new Uint8Array(tiles.length);
 /** Per-tile tiers from the camera with hysteresis, floored; neighbours differ by ≤ 1 tier. */
 let lastX=NaN,lastY=NaN,lastZ=NaN,lastFloor=-1;
 function update(view:SurfViewPoint,floor:number):boolean{
  const dy=Math.max(0,(view.y??zone.seaLevel)-zone.seaLevel);
  if(lastX===view.x&&lastY===dy&&lastZ===view.z&&lastFloor===floor)return false;
  lastX=view.x;lastY=dy;lastZ=view.z;lastFloor=floor;
  const dySquared=dy*dy;
  for(let k=0;k<tiles.length;k++){
   const t=tiles[k];
   const dx=Math.max(t.minX-view.x,0,view.x-t.maxX),dz=Math.max(t.minZ-view.z,0,view.z-t.maxZ);
   const distance=dx*dx+dz*dz+dySquared;
   let tier=distance>TILE_DISTANCE_SQUARED[1]?2:distance>TILE_DISTANCE_SQUARED[0]?1:0;
   if(tier!==t.tier&&Math.abs(tier-t.tier)===1){
    const band=TILE_HYSTERESIS_SQUARED[Math.min(tier,t.tier)];
    if(distance>band.min&&distance<band.max)tier=t.tier;
   }
   next[k]=Math.min(2,Math.max(floor,tier));
  }
  // Relax: a tile is at most one tier coarser than any neighbour (only refines, never coarsens).
  for(let pass=0;pass<2;pass++)for(let tj=0;tj<tilesZ;tj++)for(let ti=0;ti<tilesX;ti++){
   const k=tj*tilesX+ti;let m=next[k];
   if(ti>0)m=Math.min(m,next[k-1]+1);if(ti+1<tilesX)m=Math.min(m,next[k+1]+1);
   if(tj>0)m=Math.min(m,next[k-tilesX]+1);if(tj+1<tilesZ)m=Math.min(m,next[k+tilesX]+1);
   next[k]=Math.max(Math.min(2,floor),m);
  }
  let changed=false;
  for(let k=0;k<tiles.length;k++)if(tiles[k].tier!==next[k]){tiles[k].tier=next[k] as 0|1|2;changed=true;}
  if(changed){lastFloor=-1;rebuild();}
  return changed;
 }
 return {geometry,tiles,update,get triangles(){return cursor/3;},wetRatio:wetQuads/fineQuads,vertices:total};
}
export function createSurfWaterView(parent:THREE.Object3D,field:SurfWaveField,
 ground:(x:number,z:number)=>number){
 const z=field.zone;
 const lattice=surfWaterLattice(z,ground);
 const tiled=createTiledWater(z,lattice);
 const water=createSurfWaterMaterial(z),material=water.material;
 const mesh=new THREE.Mesh(tiled.geometry,material);
 mesh.frustumCulled=true;mesh.renderOrder=3;mesh.name='SurfWaterPatch';
 const stats:SurfWaterStats={tier:0,vertices:tiled.vertices,triangles:tiled.triangles,
  maxVertices:tiled.vertices,wetRatio:tiled.wetRatio,tierChanges:0,tiles:tiled.tiles.length};
 parent.add(mesh);
 return {
  mesh,stats,
  uniforms:water.uniforms,
  update(tick:number,alpha=0){
   // Render interpolates the previous and current fixed-tick wave exactly as the
   // hamster's renderPosition does; a new water physics sample uses integer tick.
   // Each periodic term wraps on its exact period (float32 safety on long sessions).
   water.setTime(tick,alpha);
  },
  setFoamDetail:water.setFoamDetail,
  /** budgetLevel floors every tile; focus: camera position (x,y,z), else the player (x,z). */
  setDetail(budgetLevel:number,focus:SurfViewPoint){
   const floor=Number.isFinite(budgetLevel)?Math.max(0,Math.min(2,Math.floor(budgetLevel))):0;
   if(!tiled.update(focus,floor))return;
   stats.tierChanges++;
   stats.tier=Math.min(...tiled.tiles.map(t=>t.tier));
   stats.triangles=tiled.triangles;
  },
  dispose(){mesh.removeFromParent();tiled.geometry.dispose();material.dispose();}
 };
}
