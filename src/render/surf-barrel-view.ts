/** Low-poly curling lip at the shore break. A single dynamic vertex buffer draws
 * up to four wave crests; it never changes the logical water datum or surf movement.
 * No fluid simulation, render targets or new image assets. */
import * as THREE from 'three';
import type {SurfWaveField,SurfZone} from '../surf/wave-field.ts';
import {BARREL_CREST_PHASE,barrelCrestAlong,barrelEnabled,barrelPhaseOffset,barrelProfile} from '../surf/surf-barrel.ts';

const MAX_FRONTS=4;
const ALONG_SEGMENTS=30;
const CURL_SEGMENTS=10;
const VERTICES_PER_FRONT=(ALONG_SEGMENTS+1)*(CURL_SEGMENTS+1);
const TAU=2*Math.PI;
const smooth=(n:number)=>{const t=Math.max(0,Math.min(1,n));return t*t*(3-2*t);};

function projectedBounds(zone:SurfZone,ax:number,az:number){
 const corners=[[zone.minX,zone.minZ],[zone.minX,zone.maxZ],[zone.maxX,zone.minZ],[zone.maxX,zone.maxZ]];
 return {min:Math.min(...corners.map(c=>c[0]*ax+c[1]*az)),
   max:Math.max(...corners.map(c=>c[0]*ax+c[1]*az))};
}
/** Approximate the breaking band once. Terrain remains authoritative at every crest point. */
export function surfBarrelBand(zone:SurfZone,ground:(x:number,z:number)=>number){
 if(!barrelEnabled(zone))return null;
 const d=projectedBounds(zone,zone.dirX,zone.dirZ);
 const t=projectedBounds(zone,-zone.dirZ,zone.dirX);
 let min=Infinity,max=-Infinity;
 for(let a=0;a<=32;a++)for(let b=0;b<=14;b++){
  const along=d.min+(d.max-d.min)*a/32,across=t.min+(t.max-t.min)*b/14;
  const x=zone.dirX*along-zone.dirZ*across,z=zone.dirZ*along+zone.dirX*across;
  if(barrelProfile(zone,x,z,ground)){
   min=Math.min(min,along);max=Math.max(max,along);
  }
 }
 return min<Infinity?{min:min-zone.wavelength*.15,max:max+zone.wavelength*.15}:null;
}

export interface SurfBarrelView {
 readonly mesh:THREE.Mesh;
 readonly stats:{vertices:number;triangles:number;activeFronts:number;activeSections:number};
 update(tick:number,focus:{x:number;z:number}):void;
 dispose():void;
}
export function createSurfBarrelView(parent:THREE.Object3D,
 field:SurfWaveField,ground:(x:number,z:number)=>number):SurfBarrelView {
 const zone=field.zone;
 const band=surfBarrelBand(zone,ground);
 const positions=new Float32Array(MAX_FRONTS*VERTICES_PER_FRONT*3);
 const colors=new Float32Array(positions.length);
 const indices=new Uint16Array(MAX_FRONTS*ALONG_SEGMENTS*CURL_SEGMENTS*6);
 let cursor=0;
 for(let front=0;front<MAX_FRONTS;front++)
  for(let j=0;j<ALONG_SEGMENTS;j++)for(let k=0;k<CURL_SEGMENTS;k++){
   const a=front*VERTICES_PER_FRONT+j*(CURL_SEGMENTS+1)+k;
   const b=a+CURL_SEGMENTS+1;
   indices.set([a,b,a+1,b,b+1,a+1],cursor);cursor+=6;
  }
 const foam=new THREE.Color(0xd6f5ee),deep=new THREE.Color(0x187a91);
 for(let front=0;front<MAX_FRONTS;front++)
  for(let j=0;j<=ALONG_SEGMENTS;j++)for(let k=0;k<=CURL_SEGMENTS;k++){
   const index=front*VERTICES_PER_FRONT+j*(CURL_SEGMENTS+1)+k;
   const color=deep.clone().lerp(foam,smooth((k/CURL_SEGMENTS-.72)/.24));
   color.toArray(colors,index*3);
  }
 const geometry=new THREE.BufferGeometry();
 const positionAttribute=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('position',positionAttribute);
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 geometry.setIndex(new THREE.BufferAttribute(indices,1));
 const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,depthWrite:true});
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='SurfBarrelLip';mesh.frustumCulled=false;mesh.renderOrder=4;mesh.visible=false;
 parent.add(mesh);
 const stats={vertices:positions.length/3,triangles:indices.length/3,activeFronts:0,activeSections:0};
 let lastTick=-1;
 function update(tick:number,focus:{x:number;z:number}):void{
  if(tick===lastTick)return;
  if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick maillage de tube invalide');
  lastTick=tick;
  stats.activeFronts=0;stats.activeSections=0;
  if(!band){mesh.visible=false;return;}
  const focusAlong=zone.dirX*focus.x+zone.dirZ*focus.z;
  const focusAcross=-zone.dirZ*focus.x+zone.dirX*focus.z;
  const base=zone.speed*tick/30+zone.wavelength*barrelPhaseOffset(zone);
  const n0=Math.ceil((band.min-base)/zone.wavelength);
  const n1=Math.floor((band.max-base)/zone.wavelength);
  const fronts:number[]=[];
  for(let n=n0;n<=n1;n++)fronts.push(n);
  fronts.sort((a,b)=>Math.abs(barrelCrestAlong(zone,tick,a)-focusAlong)-
                      Math.abs(barrelCrestAlong(zone,tick,b)-focusAlong));
  fronts.length=Math.min(fronts.length,MAX_FRONTS);
  const crossWindow=Math.min(145,Math.max(40,Math.hypot(zone.maxX-zone.minX,zone.maxZ-zone.minZ)));
  const tangent=projectedBounds(zone,-zone.dirZ,zone.dirX);
  const center=Math.max(tangent.min+crossWindow*.5,Math.min(tangent.max-crossWindow*.5,focusAcross));
  for(let f=0;f<MAX_FRONTS;f++){
   const frontS=f<fronts.length?barrelCrestAlong(zone,tick,fronts[f]):0;
   let visibleSegments=0;
   for(let j=0;j<=ALONG_SEGMENTS;j++){
    const across=center+crossWindow*(j/ALONG_SEGMENTS-.5);
    const centerX=zone.dirX*frontS-zone.dirZ*across;
    const centerZ=zone.dirZ*frontS+zone.dirX*across;
    const profile=f<fronts.length?barrelProfile(zone,centerX,centerZ,ground):null;
    const margin=profile?Math.min(centerX-zone.minX,zone.maxX-centerX,
      centerZ-zone.minZ,zone.maxZ-centerZ):0;
    const depth=profile?.depth??0;
    const envelope=smooth(depth/(zone.shoreFadeDepth??3))*smooth(margin/(zone.edgeFade??12));
    const sideFade=smooth(Math.min(j,ALONG_SEGMENTS-j)/2.5);
    const radius=(profile?.radius??0)*sideFade;
    const height=(profile?.height??0)*sideFade;
    if(height>.2)visibleSegments++;
    for(let k=0;k<=CURL_SEGMENTS;k++){
     const u=k/CURL_SEGMENTS,angle=Math.PI*(1-u);
     const advance=radius*Math.cos(angle)+radius*.23*u*u*u*(1-(profile?.opening??0));
     const x=centerX+zone.dirX*advance,z=centerZ+zone.dirZ*advance;
     const phase=BARREL_CREST_PHASE+TAU*advance/zone.wavelength;
     const baseY=zone.seaLevel+zone.amplitude*envelope*(Math.sin(phase)+.22*Math.sin(2*phase))+.025;
     const y=baseY+height*Math.sin(angle);
     const index=(f*VERTICES_PER_FRONT+j*(CURL_SEGMENTS+1)+k)*3;
     positions[index]=x;positions[index+1]=y;positions[index+2]=z;
    }
   }
   if(visibleSegments>0){stats.activeFronts++;stats.activeSections+=visibleSegments;}
  }
  positionAttribute.needsUpdate=true;
  mesh.visible=stats.activeFronts>0;
 }
 return {mesh,stats,update,dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
