/** Contextual village spines. Native terrain/water remain authoritative; no earthworks. */
import type {ProjectDocument} from '../studio-core/types.ts';
import type {SettlementRecipe} from './schema.ts';
import type {PointXZ} from '../geography/archipelago.ts';
import {inspectGroundSegment,type GroundRouteContext} from '../paths/terrain-route.ts';
import {terrainAccessContext} from '../studio-core/terrain-access.ts';
import {layoutDimensions,layoutRandom,nearestOnRoad} from './layout.ts';
export const CORRIDOR_PATTERNS=['street','mountain','river','fishing'] as const;
export const isCorridor=(r:SettlementRecipe)=>CORRIDOR_PATTERNS.some(k=>k===r.layout?.pattern);
export function pointAlong(points:PointXZ[],fraction:number){
 const lengths=points.slice(1).map((b,i)=>Math.hypot(b.x-points[i].x,b.z-points[i].z)),total=lengths.reduce((a,b)=>a+b,0);let distance=total*Math.max(0,Math.min(1,fraction));
 for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1){const a=points[i],b=points[i+1],t=distance/(lengths[i]||1);return {point:{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},tangent:{x:(b.x-a.x)/(lengths[i]||1),z:(b.z-a.z)/(lengths[i]||1)}};}distance-=lengths[i];}return null;
}
export function corridorStreet(p:ProjectDocument,r:SettlementRecipe,c:GroundRouteContext,clear:(q:PointXZ[],width:number)=>boolean){
 const pattern=r.layout!.pattern,d=layoutDimensions(r),raw=terrainAccessContext(p),height=c.height(r.center.x,r.center.z),water=Object.values(p.libraries.water).filter(w=>pattern!=='river'||w.kind!=='lake'),shore:PointXZ[]=[];
 const isWater=(x:number,z:number)=>raw.wet(x,z)||raw.height(x,z)<=raw.seaLevel;
 // Shore samples are guidance only; complete native sweeps decide whether a path is usable.
 if(pattern==='fishing')for(let i=0;i<48;i++){const angle=i*Math.PI/24;for(let distance=4;distance<=Math.min(300,r.radius+64);distance+=4){const q={x:r.center.x+Math.cos(angle)*distance,z:r.center.z+Math.sin(angle)*distance};if(q.x<c.bounds.minX||q.x>c.bounds.maxX||q.z<c.bounds.minZ||q.z>c.bounds.maxZ)break;if(isWater(q.x,q.z)){shore.push(q);break;}}}
 const waterNear=(q:PointXZ)=>water.map(w=>{const n=nearestOnRoad(q,w.kind==='lake'?[...w.points,w.points[0]]:w.points);return n?{...n,distance:Math.max(0,n.distance-(w.kind==='lake'?0:w.width/2))}:null;}).filter((n):n is NonNullable<typeof n>=>!!n).sort((a,b)=>a.distance-b.distance)[0];
 const shoreNear=(q:PointXZ)=>shore.map(point=>({point,distance:Math.hypot(q.x-point.x,q.z-point.z)})).sort((a,b)=>a.distance-b.distance)[0];
 const near=pattern==='river'?waterNear(r.center):pattern==='fishing'?shoreNear(r.center):null;
 if((pattern==='river'||pattern==='fishing')&&(!near||near.distance>Math.min(90,r.radius*.7)))return {points:[],reason:pattern==='river'?'Placer le centre près d’une berge de rivière, ou utiliser « Chercher un emplacement ».':'Placer le centre sur un sol sec près d’un rivage, ou utiliser « Chercher un emplacement ».'};
 let axis=r.orientation*Math.PI/180;
 if(pattern==='river'){const n=waterNear(r.center)!;axis=Math.atan2(n.tangent.z,n.tangent.x)+r.orientation*Math.PI/180;}
 if(pattern==='fishing'&&near)axis=Math.atan2(near.point.z-r.center.z,near.point.x-r.center.x)+Math.PI/2+r.orientation*Math.PI/180;
 if(pattern==='mountain'){const gx=c.height(r.center.x+8,r.center.z)-c.height(r.center.x-8,r.center.z),gz=c.height(r.center.x,r.center.z+8)-c.height(r.center.x,r.center.z-8);if(Math.hypot(gx,gz)>.05)axis=Math.atan2(gx,-gz)+r.orientation*Math.PI/180;}
 const arms:PointXZ[][]=[];
 for(const sign of [-1,1]){const points=[r.center];let heading=axis+(sign<0?Math.PI:0);
  for(let i=0;i<Math.min(30,Math.floor((r.radius-20)/10));i++){const a=points.at(-1)!,choices=[];
   for(const turn of [0,-.18,.18,-.38,.38,-.65,.65,-.95,.95,-1.25,1.25,-1.5,1.5]){const angle=heading+turn,q={x:a.x+Math.cos(angle)*10,z:a.z+Math.sin(angle)*10};if(Math.hypot(q.x-r.center.x,q.z-r.center.z)>r.radius-15||points.slice(0,-3).some(v=>Math.hypot(q.x-v.x,q.z-v.z)<9)||!inspectGroundSegment(a,q,c,{maxSlope:.35,widthM:d.streetWidth}).valid||!clear([a,q],d.streetWidth))continue;
    const bank=pattern==='river'?waterNear(q)?.distance:pattern==='fishing'?shoreNear(q)?.distance:undefined;
    const bend=Math.sin(i*.35+layoutRandom(r,'corridor-bend')*6)*.12,preferred=axis+(sign<0?Math.PI:0),headingError=Math.abs(Math.atan2(Math.sin(angle-preferred),Math.cos(angle-preferred)));
    const score=Math.abs(turn-bend)*2+headingError*1.5+(pattern==='mountain'?Math.abs(c.height(q.x,q.z)-height)*5:bank!==undefined?Math.abs(bank-Math.max(18,near!.distance))*.22:Math.abs((q.x-r.center.x)*Math.sin(axis)-(q.z-r.center.z)*Math.cos(axis))*.01);
    choices.push({q,angle,score});}
   choices.sort((a,b)=>a.score-b.score);if(!choices.length)break;points.push(choices[0].q);heading=choices[0].angle;
  }arms.push(points);
 }
 const points=[...arms[0].slice(1).reverse(),...arms[1]];
 return {points,reason:points.length<5?'Pas de passage sec suffisamment long : déplacer ou tourner l’implantation.':undefined};
}
/** Uneven setbacks and longitudinal jitter, rather than a pair of aligned rows. */
export function corridorLots(r:SettlementRecipe,slot:number,points:PointXZ[]){
 const adjust=r.layout?.adjustments?.find(a=>a.slot===slot),jitter=layoutRandom(r,'corridor-lot-'+slot),t=(slot+.2+jitter*.6)/r.targetBuildings,side=slot%2?1:-1,d=layoutDimensions(r),setback=(8+layoutRandom(r,'corridor-setback-'+slot)*17)*(r.form==='fortified'?.83:r.form==='town'?.9:1)*d.factor,out:{pos:PointXZ;cost:number}[]=[];
 for(const shift of adjust?[0]:[0,-.025,.025,-.05,.05,-.085,.085])for(const offset of adjust?[0]:[0,4,-2,8,12]){const along=pointAlong(points,t+shift);if(!along)continue;const distance=setback+offset;out.push({pos:{x:along.point.x-along.tangent.z*side*distance+(adjust?.dx??0),z:along.point.z+along.tangent.x*side*distance+(adjust?.dz??0)},cost:Math.abs(shift)*20+Math.abs(offset)*.08});}
 return out;
}
/** Cheap preselection only; candidate plans still undergo full validation. */
export function contextSitePenalty(p:ProjectDocument,r:SettlementRecipe,q:PointXZ,c:GroundRouteContext){
 if(r.layout?.pattern==='river'){
  const distance=Math.min(Infinity,...Object.values(p.libraries.water).filter(w=>w.kind!=='lake').map(w=>Math.max(0,(nearestOnRoad(q,w.points)?.distance??Infinity)-w.width/2)));
  return distance<Math.min(90,r.radius*.7)?distance/20:Infinity;
 }
 if(r.layout?.pattern==='fishing'){
  let distance=Infinity;
  for(let i=0;i<12;i++)for(let step=12;step<=Math.min(90,r.radius*.7);step+=12){const x=q.x+Math.cos(i*Math.PI/6)*step,z=q.z+Math.sin(i*Math.PI/6)*step;if(x<c.bounds.minX||x>c.bounds.maxX||z<c.bounds.minZ||z>c.bounds.maxZ)break;if(c.height(x,z)<=c.seaLevel||c.wet(x,z)){distance=Math.min(distance,step);break;}}
  return distance/20;
 }
 return 0;
}
