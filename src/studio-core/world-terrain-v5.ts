/** Composed silhouettes, using the existing V4 relief and native authoring primitives. */
import {planWorldTerrainV4} from './world-terrain-v4.ts';
import {archipelagoField,type PointXZ} from '../geography/archipelago.ts';
import {parseArchipelago} from '../geography/archipelago-params.ts';
import {roundOutline} from './organic-outlines.ts';
import {polygonArea} from './world-provinces.ts';
import type {MapRequirements} from './map-requirements.ts';
export const SILHOUETTES={natural:'Naturelle',crescent:'Croissant · baie ouverte',turtle:'Tortue · carapace et presqu’îles'} as const;
/** Outermost intersection of a ray with an oriented elliptical lobe. */
function lobe(a:number,cx:number,cz:number,rx:number,rz:number,angle=0):number{
 const ca=Math.cos(angle),sa=Math.sin(angle),dx=Math.cos(a)*ca+Math.sin(a)*sa,dz=-Math.cos(a)*sa+Math.sin(a)*ca,
  x=-cx*ca-cz*sa,z=cx*sa-cz*ca,A=dx*dx/(rx*rx)+dz*dz/(rz*rz),B=2*(x*dx/(rx*rx)+z*dz/(rz*rz)),C=x*x/(rx*rx)+z*z/(rz*rz)-1,D=B*B-4*A*C;
 return D<0?0:Math.max(0,(-B+Math.sqrt(D))/(2*A));
}
export function silhouetteOutline(kind:'crescent'|'turtle',phase:number,diversity=.65):PointXZ[]{
 if(kind==='crescent'){
  const points:PointXZ[]=[];
  for(const side of [1,-1])for(let i=0;i<32;i++){
   const t=side===1?i/31:1-i/31,a=Math.PI*(.24+1.52*t),radius=side===1?.395:.235;
   points.push({x:Math.sin(a)*radius*(1+.025*diversity/.65*Math.sin(3*a+phase)),z:Math.cos(a)*radius+.025});
  }
  return roundOutline(points,64,6);
 }
 const lobes=[[0,0,.225,.265,0],[0,-.325,.075,.105,0],[.235,-.145,.16,.065,-.55],[-.235,-.145,.16,.065,.55],
  [.225,.17,.13,.07,.65],[-.225,.17,.13,.07,-.65],[0,.31,.035,.105,0]];
 return roundOutline(Array.from({length:128},(_,i)=>{const a=i*Math.PI/64,radius=Math.max(...lobes.map(([x,z,rx,rz,angle])=>lobe(a,x,z,rx,rz,angle)))*(1+.012*diversity/.65*Math.sin(a*7+phase));return {x:Math.cos(a)*radius,z:Math.sin(a)*radius};}),64,2);
}
export function planWorldTerrainV5(r:MapRequirements,attempt=0){
 const base=planWorldTerrainV4(r,attempt),s=r.islandStyle!,kind=s.silhouette??'natural';if(kind==='natural')return base;
 const terrain=structuredClone(base.terrain),origin=base.point(.5),unitX=base.point(.5,1),unitZ=base.point(.5+1/.76),
  world=(u:number,v:number)=>({x:origin.x+(unitX.x-origin.x)*u/s.elongation+(unitZ.x-origin.x)*v,z:origin.z+(unitX.z-origin.z)*u/s.elongation+(unitZ.z-origin.z)*v});
 terrain.landmasses[0].outline=silhouetteOutline(kind,r.seed*.01,r.diversity).map(p=>world(p.x,p.z));
 terrain.landmasses[0].name=kind==='crescent'?'Île du croissant':'Île tortue';
 if(kind==='crescent'){
  terrain.features=terrain.features.filter(f=>f.kind!=='valley');let index=0,shelf=0;
  for(const f of terrain.features){
   if(f.kind==='plateau'){const center={x:f.polygon.reduce((v,q)=>v+q.x,0)/f.polygon.length,z:f.polygon.reduce((v,q)=>v+q.z,0)/f.polygon.length},target=world(shelf%2?.30:-.30,.03+Math.floor(shelf++/2)*.10);f.polygon=f.polygon.map(q=>({x:q.x+target.x-center.x,z:q.z+target.z-center.z}));}
   if('x'in f){const positions=[[-.12,-.24],[.14,-.24],[-.18,-.29],[-.28,-.08],[.27,-.10],[.22,-.22]],p=positions[Math.min(index++,positions.length-1)];Object.assign(f,world(p[0],p[1]));if('radiusM'in f)f.radiusM=Math.min(f.radiusM,Math.min(r.width,r.length)*.115);}
   if(f.kind==='ridge')f.points=[[-.28,.10],[-.29,-.13],[-.12,-.31],[.12,-.31],[.29,-.1],[.28,.1]].map(([x,z])=>world(x,z));
  }
 }
 for(let pass=0;pass<2;pass++){
  const field=archipelagoField({width:r.width,length:r.length,seed:r.seed,seaLevel:0},terrain);let max=0;
  for(let z=0;z<72;z++)for(let x=0;x<72;x++)max=Math.max(max,field.height((x/71-.5)*r.width,(z/71-.5)*r.length));
  for(const f of terrain.features)if('x'in f)max=Math.max(max,field.height(f.x,f.z));
  const scale=s.altitudeM/Math.max(1,max);for(const f of terrain.features){if('heightM'in f)f.heightM=Math.max(1,f.heightM*scale);if(f.kind==='volcano')f.craterDepthM*=scale;}
 }
 return {...base,terrain:parseArchipelago(terrain,r),family:kind,landAreaM2:terrain.landmasses.reduce((sum,l)=>sum+polygonArea(l.outline),0)};
}
