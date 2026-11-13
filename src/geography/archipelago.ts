/** Geography Engine — archipelago relief generator (version 1).
 * Shape-controlled, multi-scale and deterministic:
 *  1. land masses = closed outlines (control polygons) + reproducible coast noise;
 *  2. macro relief = authored features (volcano, mountain massif, hill, basin, plateau);
 *  3. intermediate formations = ridge and valley polylines;
 *  4. local irregularities = small seeded fbm;
 *  5. geological dressing is derived later (classification), never stored here.
 * Pure: same parameters + seed + sea level = same heights, whatever the load order or LOD.
 * The heightfield stays a heightfield: overhangs/caves remain separate 3D geometry. */
import {fbm,valueNoise,volcanoProfile} from './noise.ts';
export interface VolcanoParams {x:number;z:number;radiusM:number;heightM:number;craterRadiusM:number;craterDepthM:number}

export interface PointXZ {x:number;z:number}
export interface Landmass {
  id:string;name:string;
  /** Closed outline (control polygon) of the land, in world metres. */
  outline:PointXZ[];
  coastNoiseM:number;coastWavelengthM:number;
  beachWidthM:number;shoreHeightM:number;lowlandHeightM:number;hillHeightM:number;
  /** 0 = gentle beaches everywhere, 1 = cliffs everywhere; varies naturally along the coast. */
  cliffs:number;
  /** Local re-seed of the coast noise ("Varier"); absent = 0. */
  variant?:number;
}
export type ReliefFeature=WithVariant<
  |({id:string;kind:'volcano'}&VolcanoParams)
  |{id:string;kind:'mountain'|'hill';x:number;z:number;radiusM:number;heightM:number;roughness:number}
  |{id:string;kind:'basin';x:number;z:number;radiusM:number;depthM:number}
  |{id:string;kind:'plateau';polygon:PointXZ[];heightM:number;edgeM:number}
  |{id:string;kind:'ridge';points:PointXZ[];widthM:number;heightM:number}
  |{id:string;kind:'valley';points:PointXZ[];widthM:number;depthM:number}>;
export type FeatureKind=ReliefFeature['kind'];
/** Every feature may carry `variant` (local re-seed of its noise; absent = 0). */
export type WithVariant<T>=T&{variant?:number};
export interface ArchipelagoParams {seabedDepthM:number;detailM:number;landmasses:Landmass[];features:ReliefFeature[]}
export interface GeoWorld {seed:number;seaLevel:number;width:number;length:number}
/** Generator outputs shared by every consumer (terrain, classification, map, vegetation). */
export interface GeneratorField {
  height(x:number,z:number):number;
  /** Signed inland distance to the generated coast (m, negative offshore); null if undefined. */
  coast(x:number,z:number):number;
  /** 0..1 coastal steepness (beach → cliff) at the nearest coast. */
  cliff(x:number,z:number):number;
  /** 0..1 volcanic influence (basalt/ash geology). */
  volcanic(x:number,z:number):number;
  /** coast + cliff + volcanic in one evaluation (classification hot path). */
  site(x:number,z:number):GeoSite;
}
export interface GeoSite {coast:number;cliff:number;volcanic:number}
export const FEATURE_LABELS:Record<FeatureKind,string>={volcano:'Volcan',mountain:'Massif',hill:'Colline',basin:'Cuvette',plateau:'Plateau',ridge:'Crête',valley:'Vallée'};
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*clamp(t,0,1);
/** Seed of a shape: world seed, stable id and optional variant. */
export function shapeSeed(seed:number,id:string,variant=0):number{return (seed^hashString(id)^Math.imul(variant,0x9e3779b1))>>>0;}
export function hashString(text:string):number{let h=2166136261;for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);return h>>>0;}

/** Polygon pre-compiled into typed arrays: same arithmetic as polygonSignedDistance (edge
 * vectors and squared lengths computed once), for per-sample hot paths. */
export function compilePolygon(poly:PointXZ[]):(x:number,z:number)=>number{
  const n=poly.length,ax=new Float64Array(n),az=new Float64Array(n),bx=new Float64Array(n),bz=new Float64Array(n),dx=new Float64Array(n),dz=new Float64Array(n),len2=new Float64Array(n);
  const x0=new Float64Array(n),x1=new Float64Array(n),z0=new Float64Array(n),z1=new Float64Array(n);
  for(let i=0,j=n-1;i<n;j=i++){const a=poly[j],b=poly[i];ax[i]=a.x;az[i]=a.z;bx[i]=b.x;bz[i]=b.z;dx[i]=b.x-a.x;dz[i]=b.z-a.z;len2[i]=dx[i]*dx[i]+dz[i]*dz[i]||1;x0[i]=Math.min(a.x,b.x);x1[i]=Math.max(a.x,b.x);z0[i]=Math.min(a.z,b.z);z1[i]=Math.max(a.z,b.z);}
  return (x,z)=>{
    let best=Infinity,inside=false;
    for(let i=0;i<n;i++){
      if((az[i]>z)!==(bz[i]>z)&&x<ax[i]+(z-az[i])/(bz[i]-az[i])*(bx[i]-ax[i]))inside=!inside;
      // An edge whose bounding box is already farther than the best edge cannot win
      // (relative margin: rounding can never turn a skipped edge into the minimum).
      const lx=x<x0[i]?x0[i]-x:x>x1[i]?x-x1[i]:0,lz=z<z0[i]?z0[i]-z:z>z1[i]?z-z1[i]:0;
      if(lx*lx+lz*lz>best*(1+1e-9))continue;
      const t=clamp(((x-ax[i])*dx[i]+(z-az[i])*dz[i])/len2[i],0,1),ex=x-ax[i]-t*dx[i],ez=z-az[i]-t*dz[i],d2=ex*ex+ez*ez;if(d2<best)best=d2;
    }
    best=Math.sqrt(best);return inside?best:-best;
  };
}
/** Signed distance to a closed polygon, positive inside. */
export function polygonSignedDistance(poly:PointXZ[],x:number,z:number):number{
  let best=Infinity,inside=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const a=poly[j],b=poly[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
    const ex=x-a.x-t*dx,ez=z-a.z-t*dz,d2=ex*ex+ez*ez;if(d2<best)best=d2;
    if((a.z>z)!==(b.z>z)&&x<a.x+(z-a.z)/(b.z-a.z)*(b.x-a.x))inside=!inside;
  }
  best=Math.sqrt(best);return inside?best:-best;
}
export function polylineDistance(points:PointXZ[],x:number,z:number):number{
  let best=Infinity;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);const ex=x-a.x-t*dx,ez=z-a.z-t*dz,d2=ex*ex+ez*ez;if(d2<best)best=d2;}return best;
}
interface Box {minX:number;maxX:number;minZ:number;maxZ:number}
function boxOf(points:PointXZ[],pad:number):Box{let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;for(const p of points){minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}return {minX:minX-pad,maxX:maxX+pad,minZ:minZ-pad,maxZ:maxZ+pad};}
const inBox=(b:Box,x:number,z:number)=>x>=b.minX&&x<=b.maxX&&z>=b.minZ&&z<=b.maxZ;
/** Axis-aligned influence box of a feature (for early exits and local invalidation). */
export function featureBounds(f:ReliefFeature):Box{
  if(f.kind==='plateau')return boxOf(f.polygon,f.edgeM);
  if(f.kind==='ridge'||f.kind==='valley')return boxOf(f.points,f.widthM);
  return {minX:f.x-f.radiusM,maxX:f.x+f.radiusM,minZ:f.z-f.radiusM,maxZ:f.z+f.radiusM};
}
export function landmassBounds(l:Landmass,falloff=320):Box{return boxOf(l.outline,l.coastNoiseM+falloff);}
const bump=(t:number)=>t>=1?0:.5+.5*Math.cos(Math.PI*clamp(t,0,1));

export function archipelagoField(world:GeoWorld,p:ArchipelagoParams):GeneratorField{
  const sea=world.seaLevel,seed=world.seed>>>0,falloff=320;
  const masses=p.landmasses.map((l,index)=>({l,index,sdf:compilePolygon(l.outline),box:landmassBounds(l,falloff),seed:shapeSeed(seed,l.id,l.variant),freq:1/l.coastWavelengthM,hill:1/Math.max(80,l.coastWavelengthM*.45)}));
  // Features grouped by composition stage once (no per-sample filtering/allocation).
  const stage=(kinds:FeatureKind[])=>p.features.filter(f=>kinds.includes(f.kind)).map(f=>({f,box:featureBounds(f),seed:shapeSeed(seed,f.id,f.variant),sdf:f.kind==='plateau'?compilePolygon(f.polygon):null}));
  const plateaus=stage(['plateau']),raises=stage(['mountain','hill','ridge']),cuts=stage(['basin','valley']),volcanoes=stage(['volcano']);
  /** Best coast value and the land mass providing it. */
  // Direct-mapped cache of exact results: height() then site() at the same point (tile and
  // horizon colouring, map pixels, dressing) reuse the coast instead of recomputing it.
  const CACHE=4096,cx=new Float64Array(CACHE).fill(NaN),cz=new Float64Array(CACHE).fill(NaN),cc=new Float64Array(CACHE),cm=new Int16Array(CACHE);
  const memo:{coast:number;mass:typeof masses[number]|null}={coast:-falloff-1,mass:null};
  function coastOf(x:number,z:number){
    const slot=(Math.imul(Math.floor(x*4),0x27d4eb2d)^Math.imul(Math.floor(z*4),0x165667b1))>>>20;
    if(cx[slot]===x&&cz[slot]===z){memo.coast=cc[slot];memo.mass=cm[slot]<0?null:masses[cm[slot]];return memo;}
    let best=-falloff-1,mass:typeof masses[number]|null=null;
    for(const m of masses){if(!inBox(m.box,x,z))continue;const c=m.sdf(x,z)+fbm(m.seed^0x51ed,x*m.freq,z*m.freq,3)*m.l.coastNoiseM;if(c>best){best=c;mass=m;}}
    cx[slot]=x;cz[slot]=z;cc[slot]=best;cm[slot]=mass?mass.index:-1;memo.coast=best;memo.mass=mass;return memo;
  }
  const cliffOf=(m:typeof masses[number],x:number,z:number)=>clamp(m.l.cliffs+.6*valueNoise(m.seed^0xc11f,x/650,z/650),0,1);
  function height(x:number,z:number):number{
    const {coast,mass}=coastOf(x,z);let h:number,inland=0;
    if(coast<0||!mass)h=sea-1-p.seabedDepthM*smooth(0,falloff,-coast);
    else{
      const l=mass.l,cliff=cliffOf(mass,x,z),ramp=lerp(l.beachWidthM,5,cliff),shore=l.shoreHeightM+cliff*28;inland=smooth(ramp,ramp+500,coast);
      h=sea-1+(shore+1)*smooth(0,ramp,coast)+(Math.max(l.lowlandHeightM,shore)-shore)*inland+(inland>0?fbm(mass.seed^0x1f3d,x*mass.hill,z*mass.hill,2)*l.hillHeightM*inland:0);
    }
    const land=smooth(-60,40,coast);
    // Macro then intermediate features, in a fixed order (deterministic composition).
    for(const {f,box,sdf}of plateaus){if(f.kind!=='plateau'||!inBox(box,x,z))continue;const s=sdf!(x,z);h=lerp(h,sea+f.heightM,smooth(-f.edgeM,0,s));}
    for(const {f,box,seed:fs}of raises){
      if(!inBox(box,x,z))continue;
      if(f.kind==='mountain'||f.kind==='hill'){const d=Math.sqrt((x-f.x)*(x-f.x)+(z-f.z)*(z-f.z))/f.radiusM;if(d<1){const shape=f.kind==='mountain'?Math.pow(1-d,1.35)*(1-d*.2):bump(d),rough=f.roughness?1+f.roughness*(Math.abs(fbm(fs,x/140,z/140,3))*2-.5)*smooth(0,.5,1-d):1;h+=f.heightM*shape*rough*Math.max(land,.4);}}
      else if(f.kind==='ridge'){const d=polylineDistance(f.points,x,z);if(d<f.widthM)h+=f.heightM*bump(d/f.widthM)*Math.max(land,.3);}
    }
    for(const {f,box}of cuts){
      if(!inBox(box,x,z))continue;
      if(f.kind==='basin'){const d=Math.sqrt((x-f.x)*(x-f.x)+(z-f.z)*(z-f.z))/f.radiusM;if(d<1)h-=f.depthM*bump(d);}
      else if(f.kind==='valley'){const d=polylineDistance(f.points,x,z);if(d<f.widthM)h-=f.depthM*bump(d/f.widthM)*land;}
    }
    for(const {f,box,seed:fs}of volcanoes){
      if(f.kind!=='volcano'||!inBox(box,x,z))continue;const dv=Math.sqrt((x-f.x)*(x-f.x)+(z-f.z)*(z-f.z));if(dv>=f.radiusM)continue;
      const angle=Math.atan2(z-f.z,x-f.x),gully=1-.12*Math.abs(valueNoise(fs,angle*7+3,dv*.004))*smooth(f.craterRadiusM,f.radiusM*.6,dv);
      const cone=volcanoProfile(f,dv)*gully,merge=smooth(f.radiusM,f.radiusM*.55,dv);h=Math.max(h,lerp(h,sea-1+cone+(coast<0?0:(h-sea+1)*.35),merge));
    }
    return inland>0&&p.detailM?h+p.detailM*fbm(seed^0xd37a,x/38,z/38,2)*inland:h;
  }
  const volcanic=(x:number,z:number)=>{let v=0;for(const {f,box}of volcanoes)if(f.kind==='volcano'&&inBox(box,x,z))v=Math.max(v,smooth(f.radiusM,f.radiusM*.35,Math.sqrt((x-f.x)*(x-f.x)+(z-f.z)*(z-f.z))));return v;};
  return {height,volcanic,
    site:(x,z)=>{const {coast,mass}=coastOf(x,z);return {coast,cliff:mass?cliffOf(mass,x,z):0,volcanic:volcanic(x,z)};},
    coast:(x,z)=>coastOf(x,z).coast,
    cliff:(x,z)=>{const {mass}=coastOf(x,z);return mass?cliffOf(mass,x,z):0;},
  };
}
