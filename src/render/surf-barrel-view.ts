/** Low-poly curling lip at the shore break (visual only: surf-barrel.ts owns the volume).
 * One dynamic vertex buffer draws up to four crests with one lit, flat-shaded material.
 * Between CPU rebuilds the vertex shader translates the lip with the swell, so it stays glued
 * to the crest at any frame rate while rebuilds run at 7.5–30 Hz depending on distance.
 * Terrain is sampled once into a compact cache over the breaking band (bilinear, visual only).
 * No fluid simulation, render target, texture or per-crest Mesh. */
import * as THREE from 'three';
import {SURF_TICK_HZ,surfCrestBend,surfSwellCoefficients,surfZoneMargin,type SurfBend,type SurfWaveField,
 type SurfZone} from '../surf/wave-field.ts';
import {barrelCrestAlong,barrelCrestPhase,barrelEnabled,barrelModulation,barrelPeelInto,
 barrelPeelParameters,barrelPhaseOffset,barrelProfile,type BarrelPeelSample} from '../surf/surf-barrel.ts';
import {boxInCameraView} from './surf-render-stats.ts';

const MAX_FRONTS=4;
const ALONG_SEGMENTS=72;
/** Length of crest drawn around the focus (m): the whole visible breaking line. */
const CREST_WINDOW=260;
const CURL_SEGMENTS=10;
const VERTICES_PER_FRONT=(ALONG_SEGMENTS+1)*(CURL_SEGMENTS+1);
const INDICES_PER_FRONT=ALONG_SEGMENTS*CURL_SEGMENTS*6;
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
/** Visual-only bathymetry cache of the breaking band: intensity, opening, swell envelope.
 * Spatially bounded (band × zone width), built once, rebuilt by invalidate(). */
export interface SurfBarrelCache {
 sample(along:number,across:number,out:{intensity:number;opening:number;envelope:number;breaking:number}):void;
 readonly nodes:number;
}
export function createSurfBarrelCache(zone:SurfZone,ground:(x:number,z:number)=>number,
 band:{min:number;max:number}):SurfBarrelCache{
 const t=projectedBounds(zone,-zone.dirZ,zone.dirX);
 const stepA=1.25,stepC=2;
 const na=Math.max(1,Math.ceil((band.max-band.min)/stepA)),nc=Math.max(1,Math.ceil((t.max-t.min)/stepC));
 const data=new Float32Array((na+1)*(nc+1)*4),marginScratch={margin:0,gx:0,gz:0};
 const fade=zone.shoreFadeDepth??3,edge=zone.edgeFade??12;
 for(let i=0;i<=na;i++)for(let j=0;j<=nc;j++){
  const along=band.min+(band.max-band.min)*i/na,across=t.min+(t.max-t.min)*j/nc;
  const x=zone.dirX*along-zone.dirZ*across,z=zone.dirZ*along+zone.dirX*across;
  const p=barrelProfile(zone,x,z,ground),o=(i*(nc+1)+j)*4;
  const margin=surfZoneMargin(zone,x,z,marginScratch).margin;
  const depth=zone.seaLevel-ground(x,z);
  data[o]=p?.intensity??0;data[o+1]=p?.opening??0;
  data[o+2]=Number.isFinite(depth)&&depth>.05&&margin>0?smooth(depth/fade)*smooth(margin/edge):0;
  data[o+3]=Number.isFinite(depth)?1-smooth(depth/(fade*1.4)):1;
 }
 return {nodes:(na+1)*(nc+1),sample(along,across,out){
  const u=Math.max(0,Math.min(na,(along-band.min)/(band.max-band.min)*na));
  const v=Math.max(0,Math.min(nc,(across-t.min)/(t.max-t.min)*nc));
  const i=Math.min(na-1,Math.floor(u)),j=Math.min(nc-1,Math.floor(v)),fu=u-i,fv=v-j;
  const o00=(i*(nc+1)+j)*4,o01=o00+4,o10=o00+(nc+1)*4,o11=o10+4;
  const mix=(k:number)=>(data[o00+k]*(1-fv)+data[o01+k]*fv)*(1-fu)+(data[o10+k]*(1-fv)+data[o11+k]*fv)*fu;
  // Outside the band nothing breaks (no extrapolation).
  const inside=along>=band.min&&along<=band.max;
  out.intensity=inside?mix(0):0;out.opening=inside?mix(1):0;out.envelope=mix(2);out.breaking=mix(3);
 }};
}

export interface SurfBarrelStats {vertices:number;triangles:number;activeFronts:number;activeSections:number;
 uploadBytes:number;rebuilds:number;drawnTriangles:number;cacheNodes:number;maxFronts:number}
export interface SurfBarrelUpdateOptions {alpha?:number;camera?:THREE.Camera}
export interface SurfBarrelView {
 readonly mesh:THREE.Mesh;
 readonly stats:SurfBarrelStats;
 update(tick:number,focus:{x:number;z:number},options?:SurfBarrelUpdateOptions):void;
 /** Quality profile: number of crests drawn (1 Low, 2 Medium, 4 HQ). */
 setMaxFronts(count:number):void;
 /** Rebuild the bathymetry cache after an authoring edit of the terrain. */
 invalidate(ground?:(x:number,z:number)=>number):void;
 dispose():void;
}
/** Lip palette along the curl (0 back base → 0.5 crest → 1 thrown tip), linear working space:
 * deep back, bright crest foam where the lip pitches, translucent turquoise curtain. */
const RING_STOPS:readonly [number,number][]=[[0,0x1f7487],[.3,0x2f9aa6],[.44,0x9fdcd4],[.54,0xf2fbf7],
 [.66,0x9ad9d1],[.82,0x4cb8b6],[1,0x3aa6ac]];
const RING_COLORS=RING_STOPS.map(([,c])=>new THREE.Color(c));
function ringColor(u:number,out:THREE.Color){
 const x=Math.max(0,Math.min(1,u));let i=0;
 while(i<RING_STOPS.length-2&&x>RING_STOPS[i+1][0])i++;
 const t=(x-RING_STOPS[i][0])/(RING_STOPS[i+1][0]-RING_STOPS[i][0]);
 return out.copy(RING_COLORS[i]).lerp(RING_COLORS[i+1],smooth(t));
}
export function createSurfBarrelView(parent:THREE.Object3D,
 field:SurfWaveField,ground:(x:number,z:number)=>number):SurfBarrelView {
 const zone=field.zone,q=surfSwellCoefficients(zone),peel=barrelPeelParameters(zone);
 const band=surfBarrelBand(zone,ground);
 let cache=band?createSurfBarrelCache(zone,ground,band):null;
 const positions=new Float32Array(MAX_FRONTS*VERTICES_PER_FRONT*3);
 const colors=new Float32Array(positions.length);
 const indices=new Uint16Array(MAX_FRONTS*INDICES_PER_FRONT);
 let cursor=0;
 for(let front=0;front<MAX_FRONTS;front++)
  for(let j=0;j<ALONG_SEGMENTS;j++)for(let k=0;k<CURL_SEGMENTS;k++){
   const a=front*VERTICES_PER_FRONT+j*(CURL_SEGMENTS+1)+k;
   const b=a+CURL_SEGMENTS+1;
   indices.set([a,b,a+1,b,b+1,a+1],cursor);cursor+=6;
  }
 const scratch=new THREE.Color();
 for(let front=0;front<MAX_FRONTS;front++)
  for(let j=0;j<=ALONG_SEGMENTS;j++)for(let k=0;k<=CURL_SEGMENTS;k++)
   ringColor(k/CURL_SEGMENTS,scratch).toArray(colors,(front*VERTICES_PER_FRONT+j*(CURL_SEGMENTS+1)+k)*3);
 const geometry=new THREE.BufferGeometry();
 const positionAttribute=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
 geometry.setAttribute('position',positionAttribute);
 geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
 geometry.setIndex(new THREE.BufferAttribute(indices,1));
 geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1);
 geometry.setDrawRange(0,0);
 const advance={value:new THREE.Vector2()};
 const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide,flatShading:true});
 material.name='SurfBarrelMaterial';
 material.onBeforeCompile=shader=>{
  shader.uniforms.uLipAdvance=advance;
  shader.vertexShader='uniform vec2 uLipAdvance;\n'+shader.vertexShader.replace('#include <begin_vertex>',
   '#include <begin_vertex>\ntransformed.xz+=uLipAdvance;');
  // Thin lip: light passing through it (cheap translucency, strongest on the cavity side).
  shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',
   '#include <emissivemap_fragment>\ntotalEmissiveRadiance+=diffuseColor.rgb*(gl_FrontFacing?.12:.55);');
 };
 material.customProgramCacheKey=()=>'little-world-surf-lip-v2';
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='SurfBarrelLip';mesh.frustumCulled=true;mesh.renderOrder=4;mesh.visible=false;
 parent.add(mesh);
 const stats:SurfBarrelStats={vertices:positions.length/3,triangles:indices.length/3,activeFronts:0,activeSections:0,
  uploadBytes:0,rebuilds:0,drawnTriangles:0,cacheNodes:cache?.nodes??0,maxFronts:MAX_FRONTS};
 // Static culling box of the breaking band only (band × zone width × lip height).
 const bandBox=new THREE.Box3();
 if(band){
  const top=zone.seaLevel+(2+1.65*zone.amplitude)*1.5+zone.amplitude,bottom=zone.seaLevel-zone.amplitude*1.5;
  const t=projectedBounds(zone,-zone.dirZ,zone.dirX),corner=new THREE.Vector3();
  for(const along of [band.min,band.max])for(const across of [t.min,t.max])for(const y of [bottom,top])
   bandBox.expandByPoint(corner.set(zone.dirX*along-zone.dirZ*across,y,zone.dirZ*along+zone.dirX*across));
  bandBox.intersect(new THREE.Box3(new THREE.Vector3(zone.minX,bottom,zone.minZ),new THREE.Vector3(zone.maxX,top,zone.maxZ)));
 }
 let builtTick=-1,maxFronts=MAX_FRONTS;
 const cell={intensity:0,opening:0,envelope:0,breaking:0};
 const tangent=projectedBounds(zone,-zone.dirZ,zone.dirX);
 // Range of the static crest bend over the zone (swell-space margin when picking crests).
 const bent=!!zone.form&&(!!zone.form.curvature||!!zone.form.meander),bendScratch:SurfBend={offset:0,slope:0};
 let bendMin=0,bendMax=0;
 if(bent)for(let i=0;i<=64;i++){const o=surfCrestBend(zone,tangent.min+(tangent.max-tangent.min)*i/64,bendScratch).offset;
  bendMin=Math.min(bendMin,o);bendMax=Math.max(bendMax,o);}
 const probe:BarrelPeelSample={factor:1,state:'none',ahead:0,sign:1,speed:0},column:BarrelPeelSample={...probe};
 const frontIndex=new Float64Array(MAX_FRONTS),frontDistance=new Float64Array(MAX_FRONTS);
 const box=new THREE.Box3(),point=new THREE.Vector3();
 const shapeAt=(phase:number,breaking:number)=>{
  const a=q.skew+q.shoal*breaking;
  return Math.sin(phase)+a*Math.sin(2*phase)-q.sharpness*Math.cos(2*phase);
 };
 const crestPhase=barrelCrestPhase(zone);
 /** Rebuild cadence in ticks: close lips every tick, distant ones at 7.5 Hz. */
 const cadence=(distance:number)=>distance<45?1:distance<110?2:4;
 function rebuild(tick:number,focus:{x:number;z:number}){
  stats.rebuilds++;
  const focusAlong=zone.dirX*focus.x+zone.dirZ*focus.z;
  const focusAcross=-zone.dirZ*focus.x+zone.dirX*focus.z;
  const base=zone.speed*tick/SURF_TICK_HZ+zone.wavelength*barrelPhaseOffset(zone);
  const n0=Math.ceil((band!.min+bendMin-base)/zone.wavelength);
  const n1=Math.floor((band!.max+bendMax-base)/zone.wavelength);
  // Nearest crests to the focus, kept in a fixed scratch list (insertion, no allocation).
  let frontCount=0;
  for(let n=n0;n<=n1;n++){
   const d=Math.abs(barrelCrestAlong(zone,tick,n)-focusAlong);
   let i=Math.min(frontCount,maxFronts);
   if(i===maxFronts&&d>=frontDistance[maxFronts-1])continue;
   while(i>0&&frontDistance[i-1]>d){if(i<maxFronts){frontIndex[i]=frontIndex[i-1];frontDistance[i]=frontDistance[i-1];}i--;}
   if(i<maxFronts){frontIndex[i]=n;frontDistance[i]=d;frontCount=Math.min(maxFronts,frontCount+1);}
  }
  const fullWindow=Math.min(CREST_WINDOW,Math.max(40,tangent.max-tangent.min));
  box.makeEmpty();
  let written=0;
  stats.activeFronts=0;stats.activeSections=0;
  for(let f=0;f<frontCount;f++){
   const n=frontIndex[f],frontS=barrelCrestAlong(zone,tick,n);
   // The whole visible crest line: every peeling section along it, not only the nearest one.
   const center=Math.max(tangent.min+fullWindow*.5,Math.min(tangent.max-fullWindow*.5,focusAcross));
   const from=Math.max(center-fullWindow/2,tangent.min),to=Math.min(center+fullWindow/2,tangent.max);
   if(to-from<2)continue;
   let visibleSegments=0;const offset=written*VERTICES_PER_FRONT;
   for(let j=0;j<=ALONG_SEGMENTS;j++){
    const across=from+(to-from)*j/ALONG_SEGMENTS;
    // Curved crests: the crest line sits at swell position frontS, i.e. world along frontS − bend.
    const crestAlong=bent?frontS-surfCrestBend(zone,across,bendScratch).offset:frontS;
    const cx=zone.dirX*crestAlong-zone.dirZ*across,cz=zone.dirZ*crestAlong+zone.dirX*across;
    cache!.sample(crestAlong,across,cell);
    const intensity=cell.intensity;
    const peelState=peel?barrelPeelInto(zone,cx,cz,tick,n,column):null;
    const ends=smooth(Math.min(j,ALONG_SEGMENTS-j)/4);
    const pf=(peelState?peelState.factor:1)*ends;
    const m=barrelModulation(zone,cx,cz,tick);
    const height=(2+1.65*zone.amplitude)*intensity*m*pf;
    const radius=(.85+.9*zone.amplitude)*Math.sqrt(intensity)*(.55+.45*pf);
    // Life cycle: forming (shoulder) → open throw → collapsing lip falling forward.
    const opening=cell.opening*(peelState?.state==='collapse'?.35+.65*pf:1);
    const collapse=peelState?.state==='collapse'?1-pf:0;
    const breaking=cell.breaking;
    if(height>.2)visibleSegments++;
    const degenerate=height<.05||radius<.05;
    // Lip throw: on the shoulder the crest is only a steep face (the arch stops at its top and
    // drops vertically); in the open section the lip is thrown forward down to the trough.
    const throwAmount=peelState?(peelState.state==='shoulder'?peelState.factor:1)*ends:ends;
    const endAngle=Math.PI*.5*(1-throwAmount);
    const archRings=Math.max(2,Math.round(CURL_SEGMENTS*(.5+.5*throwAmount)));
    let tipX=0,tipY=0,tipZ=0;
    for(let k=0;k<=CURL_SEGMENTS;k++){
     const index=(offset+j*(CURL_SEGMENTS+1)+k)*3;
     if(k>archRings){
      // Not thrown yet: the lip ends as a hook at its tip (the steep face below is the swell's
      // own face). Collapsed rings cost no area and keep the tube mouth visible from the side.
      positions[index]=tipX;positions[index+1]=tipY;positions[index+2]=tipZ;
      continue;
     }
     const u=k/archRings,angle=Math.PI-(Math.PI-endAngle)*u;
     const throwFront=Math.max(0,Math.cos(angle));
     const adv=degenerate?0:radius*Math.cos(angle)+radius*(.3*opening*throwFront*throwFront+.23*u*u*u*(1-opening))+
      radius*.6*collapse*u;
     const phase=crestPhase+TAU*adv/zone.wavelength;
     const baseY=zone.seaLevel+zone.amplitude*cell.envelope*m*shapeAt(phase,breaking)+.025;
     // Fuller arch while open; the tip sinks back to the water as the section collapses.
     const lift=degenerate?0:height*Math.pow(Math.max(0,Math.sin(angle)),.8)*(1-.55*collapse*u);
     positions[index]=cx+zone.dirX*adv;positions[index+1]=baseY+lift;positions[index+2]=cz+zone.dirZ*adv;
     tipX=positions[index];tipY=positions[index+1];tipZ=positions[index+2];
     point.set(tipX,tipY,tipZ);box.expandByPoint(point);
    }
   }
   if(visibleSegments===0)continue;
   written++;stats.activeFronts++;stats.activeSections+=visibleSegments;
  }
  builtTick=tick;
  geometry.setDrawRange(0,written*INDICES_PER_FRONT);
  stats.drawnTriangles=written*INDICES_PER_FRONT/3;
  if(written>0){
   positionAttribute.clearUpdateRanges();
   positionAttribute.addUpdateRange(0,written*VERTICES_PER_FRONT*3);
   positionAttribute.needsUpdate=true;
   stats.uploadBytes=written*VERTICES_PER_FRONT*3*4;
   box.getBoundingSphere(geometry.boundingSphere!);
   // Room for the GPU translation until the next rebuild.
   geometry.boundingSphere!.radius+=zone.speed*4/SURF_TICK_HZ+1;
  }
  mesh.visible=written>0;
 }
 function update(tick:number,focus:{x:number;z:number},options:SurfBarrelUpdateOptions={}):void{
  if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick maillage de tube invalide');
  stats.uploadBytes=0;
  if(!band||!cache){mesh.visible=false;return;}
  const view=options.camera?.position??focus;
  const dx=Math.max(zone.minX-view.x,0,view.x-zone.maxX),dz=Math.max(zone.minZ-view.z,0,view.z-zone.maxZ);
  const distance=Math.hypot(dx,dz);
  // Breaking lips are drawn only around the shore and when the band can be on screen.
  if(distance>280||(options.camera&&!boxInCameraView(options.camera,bandBox))){mesh.visible=false;builtTick=-1;return;}
  if(builtTick<0||tick<builtTick||tick-builtTick>=cadence(distance))rebuild(tick,focus);
  // Continuous presentation: translate the last build with the swell (render alpha included).
  const renderTicks=Math.max(0,tick-1)+Math.max(0,Math.min(1,options.alpha??1));
  const shift=zone.speed*(renderTicks-builtTick)/SURF_TICK_HZ;
  advance.value.set(zone.dirX*shift,zone.dirZ*shift);
 }
 return {mesh,stats,update,
  setMaxFronts(count:number){maxFronts=Math.max(1,Math.min(MAX_FRONTS,Math.floor(count)));stats.maxFronts=maxFronts;builtTick=-1;},
  invalidate(next?:(x:number,z:number)=>number){if(next)ground=next;cache=band?createSurfBarrelCache(zone,ground,band):null;
   stats.cacheNodes=cache?.nodes??0;builtTick=-1;},
  dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();}};
}
