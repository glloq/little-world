import * as THREE from 'three';
import type {SurfWaveField,SurfZone} from '../surf/wave-field.ts';
import {createSurfWaterMaterial} from './surf-water-material.ts';

/** Terrain-sampled static envelopes, GPU-animated crests. Three pre-baked nested
 * meshes share one material: LOD switches never change the deterministic wave physics.
 * No per-frame terrain resampling, render target, texture or CPU vertex upload. */
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
/** Historical stateless thresholds (metres), kept as the centre of the hysteresis band. */
const TIER_DISTANCE=[150,400] as const;
/** ±18 %: a camera hovering near a threshold never alternates between two tessellations. */
export const SURF_LOD_HYSTERESIS=.18;
/** Finest spacing per wavelength (7 vertices on the 2nd harmonic) and its clamps. */
const SAMPLES_PER_WAVELENGTH=14,MIN_SPACING=1.25,MAX_SPACING=4,MAX_TIER0_VERTICES=26000;
export interface SurfWaterStats {tier:number;vertices:number;triangles:number;maxVertices:number;
 /** Wet quads kept / all quads of the finest grid (fully dry beach quads are not drawn). */
 wetRatio:number;tierChanges:number;}
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
 for(let j=0;j<=nz;j++){
  const z=zone.minZ+length*j/nz;
  for(let i=0;i<=nx;i++){
   const x=zone.minX+width*i/nx,index=j*(nx+1)+i,depth=zone.seaLevel-ground(x,z);
   const edge=Math.min(x-zone.minX,zone.maxX-x,z-zone.minZ,zone.maxZ-z);
   const isWet=Number.isFinite(depth)&&depth>.05;
   envelope[index]=isWet?smooth(depth/fadeDepth)*smooth(edge/edgeFade):0;
   wet[index]=isWet?1:0;
   // Same breaking value as SurfWaveField.sample (drives shoaling skew, colour and foam).
   shore[index*3]=isWet?1-smooth(depth/(fadeDepth*1.4)):1;
   shore[index*3+1]=isWet?Math.min(1,depth/(fadeDepth*4)):0;
   // Visual-only border fade (colour, foam): wider than the swell envelope so the zone
   // rectangle dissolves into NearSea; the physical envelope is unchanged.
   shore[index*3+2]=smooth(edge/(edgeFade*2.5));
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
function surfWaterGeometry(zone:SurfZone,lattice:SurfWaterLattice,step:1|2|4):THREE.BufferGeometry{
 const {nx:fx,nz:fz}=lattice,nx=fx/step,nz=fz/step;
 const positions=new Float32Array((nx+1)*(nz+1)*3),
   envelope=new Float32Array((nx+1)*(nz+1)),
   wet=new Float32Array((nx+1)*(nz+1)),
   shore=new Float32Array((nx+1)*(nz+1)*3),
   envelopeGradient=new Float32Array((nx+1)*(nz+1)*2);
 for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
  const index=j*(nx+1)+i,source=j*step*(fx+1)+i*step;
  positions[index*3]=zone.minX+(zone.maxX-zone.minX)*(i*step)/fx;
  positions[index*3+1]=zone.seaLevel+.02;
  positions[index*3+2]=zone.minZ+(zone.maxZ-zone.minZ)*(j*step)/fz;
  envelope[index]=lattice.envelope[source];
  wet[index]=lattice.wet[source];
  shore.set(lattice.shore.subarray(source*3,source*3+3),index*3);
  envelopeGradient.set(lattice.envelopeGradient.subarray(source*2,source*2+2),index*2);
 }
 // Only quads touching water are indexed: fully dry beach cells cost no triangle.
 let quads=0;
 const quadWet=(i:number,j:number)=>{
  for(let b=0;b<=step;b++)for(let a=0;a<=step;a++)
   if(lattice.wet[(j*step+b)*(fx+1)+i*step+a])return true;
  return false;
 };
 const keep=new Uint8Array(nx*nz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++)if(quadWet(i,j)){keep[j*nx+i]=1;quads++;}
 const vertexCount=(nx+1)*(nz+1);
 const indices=vertexCount>65535?new Uint32Array(quads*6):new Uint16Array(quads*6);
 let cursor=0;
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){
  if(!keep[j*nx+i])continue;
  const a=j*(nx+1)+i,b=a+nx+1;
  indices[cursor++]=a;indices[cursor++]=b;indices[cursor++]=a+1;
  indices[cursor++]=a+1;indices[cursor++]=b;indices[cursor++]=b+1;
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
 geo.setAttribute('aEnvelope',new THREE.BufferAttribute(envelope,1));
 geo.setAttribute('aWet',new THREE.BufferAttribute(wet,1));
 geo.setAttribute('aShore',new THREE.BufferAttribute(shore,3));
 geo.setAttribute('aEnvGrad',new THREE.BufferAttribute(envelopeGradient,2));
 geo.setIndex(new THREE.BufferAttribute(indices,1));
 geo.computeBoundingBox();
 if(geo.boundingBox){
  geo.boundingBox.min.y-=zone.amplitude*1.4;
  geo.boundingBox.max.y+=zone.amplitude*1.4;
 }
 geo.boundingSphere=new THREE.Sphere();geo.boundingBox?.getBoundingSphere(geo.boundingSphere);
 return geo;
}
export function createSurfWaterView(parent:THREE.Object3D,field:SurfWaveField,
 ground:(x:number,z:number)=>number){
 const z=field.zone;
 const lattice=surfWaterLattice(z,ground);
 const geometries=([1,2,4] as const).map(step=>surfWaterGeometry(z,lattice,step));
 const finestQuads=lattice.nx*lattice.nz;
 const water=createSurfWaterMaterial(z),material=water.material;
 const mesh=new THREE.Mesh(geometries[0],material);
 mesh.frustumCulled=true;mesh.renderOrder=3;mesh.name='SurfWaterPatch';
 const stats:SurfWaterStats={tier:0,vertices:geometries[0].attributes.position.count,
  triangles:(geometries[0].index?.count??0)/3,
  maxVertices:Math.max(...geometries.map(g=>g.attributes.position.count)),
  wetRatio:(geometries[0].index?.count??0)/6/finestQuads,tierChanges:0};
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
  /** focus: camera position when available (x,y,z), else the player (x,z). */
  setDetail(budgetLevel:number,focus:SurfViewPoint){
   const level=selectSurfWaterTier(z,focus,budgetLevel,stats.tier as 0|1|2);
   if(stats.tier===level)return;
   stats.tierChanges++;
   mesh.geometry=geometries[level];
   stats.tier=level;stats.vertices=mesh.geometry.attributes.position.count;
   stats.triangles=(mesh.geometry.index?.count??0)/3;
  },
  dispose(){mesh.removeFromParent();for(const g of geometries)g.dispose();material.dispose();}
 };
}
