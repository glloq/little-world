/** Deterministic search for real coastal surf on the full authored/generated island.
 * A surfDemo never creates synthetic land or shifts the sea datum: it must find
 * a land -> sea crossing and enough genuinely wet water to paddle safely.
 * Unlike the original three centre transects this works on large 4x3km islands
 * with offset coves, volcanic cliffs and several separated coastlines. */
import type {SurfZone} from './wave-field.ts';
export interface SurfBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface SurfDemoSite {
 zone:SurfZone;
 start:{x:number;z:number};
 heading:number;
 /** Last detected dry-to-wet shoreline point, for coast-aware Studio planning. */
 shore?:{x:number;z:number};
}
const DIRS=[{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}] as const;
const finite=(x:number)=>Number.isFinite(x);
const inside=(b:SurfBounds,x:number,z:number,margin=10)=>
 x>=b.minX+margin&&x<=b.maxX-margin&&z>=b.minZ+margin&&z<=b.maxZ-margin;
const axisLimits=(b:SurfBounds,x:number,z:number)=>{
 const corners=[[b.minX,b.minZ],[b.minX,b.maxZ],[b.maxX,b.minZ],[b.maxX,b.maxZ]];
 return {min:Math.min(...corners.map(c=>c[0]*x+c[1]*z)),
  max:Math.max(...corners.map(c=>c[0]*x+c[1]*z))};
};
const rectsOverlap=(a:SurfZone,b:SurfZone,gap=0)=>
 a.minX<b.maxX+gap&&a.maxX>b.minX-gap&&a.minZ<b.maxZ+gap&&a.maxZ>b.minZ-gap;
/** Ordered candidate sites, independently verified in real bathymetry.
 * Bounded grid search: around 40k initial height queries on a 4x3km island
 * only when authoring or when ?surfDemo=1 is explicitly requested. */
export function findCoastalSurfSites(height:(x:number,z:number)=>number,
 bounds:SurfBounds,seaLevel:number,seed=1,maxResults=24):SurfDemoSite[]{
 if(!Number.isSafeInteger(seed)||seed<0||!finite(seaLevel)||maxResults<1)return [];
 const sites:{site:SurfDemoSite;score:number}[]=[];
 const sample=(d:{x:number;z:number},along:number,across:number)=>{
  const x=d.x*along-d.z*across,z=d.z*along+d.x*across;
  return {x,z,h:height(x,z)};
 };
 for(const d of DIRS){
  const along=axisLimits(bounds,d.x,d.z),cross=axisLimits(bounds,-d.z,d.x);
  const halfCross=(cross.min+cross.max)/2;
  const offsets=[0];
  for(let i=1;i<=Math.ceil((cross.max-cross.min)/170);i++)offsets.push(i*85,-i*85);
  for(const shift of offsets){
   const across=halfCross+shift;
   if(across<cross.min+42||across>cross.max-42)continue;
   let wasLand=false;
   const start=along.min+22,end=along.max-22;
   for(let s=start;s<=end;s+=20){
    const p=sample(d,s,across);
    if(!inside(bounds,p.x,p.z,22)||!finite(p.h)){wasLand=false;continue;}
    if(p.h>seaLevel+.22){wasLand=true;continue;}
    if(!wasLand||p.h>=seaLevel-.16)continue;
    // Refine the shoreline crossing to 2.5 m without depending on a source raster.
    let coast=s;
    for(let q=s-20;q<=s;q+=2.5){
     const near=sample(d,q,across);
     if(near.h<seaLevel-.12){coast=q;break;}
    }
    wasLand=false;
    const near=sample(d,coast-8,across);
    if(!finite(near.h)||near.h<seaLevel+.15)continue;
    // Adapt to narrow inlets as well as broad ocean. Require >=110m
    // of water along the actual travel direction, otherwise reject.
    for(const length of [205,165,125]){
     let chosenWidth=0,depthSum=0;
     for(const width of [98,76,54]){
      let ok=true;depthSum=0;
      for(const offshore of [12,36,72,Math.min(112,length-13),length-10])
       for(const side of [-width*.38,0,width*.38]){
        const p=sample(d,coast+offshore,across+side);
        const depth=seaLevel-p.h;
        if(!inside(bounds,p.x,p.z,14)||!finite(depth)||
         depth<(offshore<=12?.15:.65)){ok=false;break;}
        depthSum+=Math.min(25,depth);
       }
      if(ok){chosenWidth=width;break;}
     }
     if(!chosenWidth)continue;
     // Avoid using the beach itself as part of the water mesh; leaving 7 m
     // of near-shore sea ensures the barrel disappears before the sand.
     const nearAlong=coast+7,farAlong=coast+length;
     const first=sample(d,nearAlong,across),last=sample(d,farAlong,across);
     const tx=-d.z,tz=d.x;
     const zone:SurfZone={
      id:'surf:demo',minX:Math.min(first.x,last.x)-Math.abs(tx)*chosenWidth/2,
      maxX:Math.max(first.x,last.x)+Math.abs(tx)*chosenWidth/2,
      minZ:Math.min(first.z,last.z)-Math.abs(tz)*chosenWidth/2,
      maxZ:Math.max(first.z,last.z)+Math.abs(tz)*chosenWidth/2,
      dirX:-d.x,dirZ:-d.z,seaLevel,amplitude:1.25,wavelength:31,speed:6.2,
      seed,shoreFadeDepth:3,edgeFade:9,barrelStrength:1
     };
     if(!inside(bounds,zone.minX,zone.minZ,2)||
        !inside(bounds,zone.maxX,zone.maxZ,2))continue;
     // Start at least 35 m offshore, leaving room for the demo's waves and
     // four checkpoint gates. Preview is never teleported onto dry land.
     const st=sample(d,coast+Math.min(length-18,Math.max(85,length*.65)),across);
     const shoreline=sample(d,coast,across);
     const score=depthSum/15+length*.1+chosenWidth*.08-
      Math.abs(shift)*.0015-Math.abs(coast-(along.min+along.max)/2)*.0002;
     sites.push({site:{zone,start:{x:st.x,z:st.z},
      heading:Math.atan2(-d.x,-d.z),shore:{x:shoreline.x,z:shoreline.z}},score});
     break;
    }
   }
  }
 }
 sites.sort((a,b)=>b.score-a.score||
  a.site.zone.minX-b.site.zone.minX||a.site.zone.minZ-b.site.zone.minZ);
 const result:SurfDemoSite[]=[];
 for(const item of sites){
  if(result.some(previous=>rectsOverlap(previous.zone,item.site.zone,12)))continue;
  result.push(item.site);
  if(result.length>=Math.min(64,maxResults))break;
 }
 return result;
}
export function findDemoSurfSite(height:(x:number,z:number)=>number,
 bounds:SurfBounds,seaLevel:number,seed=1):SurfDemoSite|null{
 return findCoastalSurfSites(height,bounds,seaLevel,seed,1)[0]??null;
}
