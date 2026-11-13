import type {WaterBody} from '../world-data.ts';
export type WaterProfile = {mode:'terrain';offset:number}|{mode:'manual';levels:number[]};
export interface HydroPoint {x:number;z:number;distance:number;ground:number;level:number}
export interface HydroDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string}
export interface CompiledWater {id:string;width:number;depth:number;points:HydroPoint[];diagnostics:HydroDiagnostic[]}
const finite=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export function validateWaterProfile(value:unknown,count:number):void {
 if(value===undefined)return;
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Profil d’eau invalide');
 const p=value as Record<string,unknown>,allowed=p.mode==='terrain'?['mode','offset']:['mode','levels'];
 if(Object.keys(p).some(k=>!allowed.includes(k)))throw Error('Champ de profil d’eau inconnu');
 if(p.mode==='terrain'){if(!finite(p.offset,-10,10))throw Error('Décalage du profil d’eau invalide');}
 else if(p.mode==='manual'){
  if(!Array.isArray(p.levels)||p.levels.length!==count||!p.levels.every(v=>finite(v,-50,150)))throw Error('Une altitude finie par point est requise');
  if(p.levels.some((v,i,a)=>i>0&&v>a[i-1]+1e-6))throw Error('Le profil manuel doit descendre de l’amont vers l’aval');
 }else throw Error('Mode de profil d’eau inconnu');
}
/** Derived once from the uncarved terrain. No world mutation or render dependency. */
export function compileWaterBody(w:WaterBody,source:(x:number,z:number)=>number):CompiledWater {
 const points:HydroPoint[]=[],diagnostics:HydroDiagnostic[]=[];
 let distance=0,previous=Infinity,cut=0,maxSlope=0,correction=0;
 const length=w.points.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b.x-w.points[i].x,b.z-w.points[i].z),0);
 const spacing=Math.max(3,length/4000);
 if(length>12000)diagnostics.push({severity:'ERROR',code:'WATER_TOO_LONG',message:'Tracé supérieur à 12 km : découper le cours d’eau en tronçons.'});
 for(let i=1;i<w.points.length;i++){
  const a=w.points[i-1],b=w.points[i],len=Math.hypot(b.x-a.x,b.z-a.z);
  if(len<.01){diagnostics.push({severity:'ERROR',code:'WATER_DUPLICATE_POINT',message:`Points ${i} et ${i+1} confondus : supprimer un point.`});continue;}
  const steps=Math.max(1,Math.ceil(len/spacing));
  for(let j=i===1?0:1;j<=steps;j++){
   const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,ground=source(x,z);
   let level=w.level;
   if(w.profile?.mode==='terrain'){const proposed=ground+w.profile.offset;level=Math.min(previous,proposed);correction=Math.max(correction,proposed-level);}
   else if(w.profile?.mode==='manual')level=w.profile.levels[i-1]+(w.profile.levels[i]-w.profile.levels[i-1])*t;
   const p={x,z,distance:distance+len*t,ground,level},last=points.at(-1);
   if(last)maxSlope=Math.max(maxSlope,(last.level-level)/(p.distance-last.distance));
   points.push(p);previous=level;cut=Math.max(cut,ground-level);
  }
  distance+=len;
 }
 if(w.profile?.mode==='terrain'&&points.length){
  if(points.at(-1)!.ground>points[0].ground+.5)diagnostics.push({severity:'ERROR',code:'WATER_UPHILL',message:'L’arrivée est plus haute que la source. Inverser le tracé ou déplacer ses points.'});
  if(correction>.5)diagnostics.push({severity:'WARNING',code:'WATER_LOCAL_RISE',message:`Contre-pente locale : profil abaissé de ${correction.toFixed(1)} m. Vérifier le lit et les berges dans l’aperçu 3D.`});
  if(cut>Math.max(6,w.depth*3))diagnostics.push({severity:'ERROR',code:'WATER_DEEP_CUT',message:`Le tracé franchit un relief : ${cut.toFixed(1)} m de creusement supplémentaire. Déplacer les points ou choisir un profil manuel explicite.`});
 }
 if(w.profile)for(let i=1;i<w.points.length;i++)for(let j=i+2;j<w.points.length;j++){
  const a=w.points[i-1],b=w.points[i],c=w.points[j-1],d=w.points[j],dx=b.x-a.x,dz=b.z-a.z,ex=d.x-c.x,ez=d.z-c.z,det=dx*ez-dz*ex;
  if(Math.abs(det)<1e-8)continue;
  const t=((c.x-a.x)*ez-(c.z-a.z)*ex)/det,u=((c.x-a.x)*dz-(c.z-a.z)*dx)/det;
  if(t>0&&t<1&&u>0&&u<1)diagnostics.push({severity:'ERROR',code:'WATER_SELF_CROSS',message:'Le cours d’eau se croise : séparer les tronçons et résoudre leurs niveaux avant de créer une jonction.'});
 }
 if(w.profile&&maxSlope>.18)diagnostics.push({severity:'WARNING',code:'WATER_STEEP',message:'Forte pente : aperçu en rapide incliné ; aucune cascade verticale n’est créée automatiquement.'});
 return {id:w.id,width:w.width,depth:w.depth,points,diagnostics};
}
interface Segment {water:CompiledWater;order:number;a:HydroPoint;b:HydroPoint}
export interface WaterHit {water:CompiledWater;distance:number;level:number;flowX:number;flowZ:number}
/** Local segment grid shared by bed, swimming and surface queries. */
export class WaterSpatialIndex {
 private cells=new Map<string,Segment[]>();
 readonly bodies:CompiledWater[];
 constructor(waters:WaterBody[],source:(x:number,z:number)=>number){
  this.bodies=waters.map(w=>compileWaterBody(w,source));
  let segments=0;
  for(const [order,water] of this.bodies.entries())for(let i=1;i<water.points.length;i++){
   if(++segments>65536)throw Error('Réseau d’eau trop détaillé : plus de 65 536 segments.');
   const a=water.points[i-1],b=water.points[i],r=water.width/2+2,segment={water,order,a,b};
   for(let cx=Math.floor((Math.min(a.x,b.x)-r)/32);cx<=Math.floor((Math.max(a.x,b.x)+r)/32);cx++)
    for(let cz=Math.floor((Math.min(a.z,b.z)-r)/32);cz<=Math.floor((Math.max(a.z,b.z)+r)/32);cz++){
     const key=cx+','+cz,cell=this.cells.get(key)??[];cell.push(segment);this.cells.set(key,cell);
    }
  }
 }
 query(x:number,z:number,bank=0):WaterHit[]{
  const closest=new Map<number,WaterHit>();
  for(const {water,order,a,b} of this.cells.get(Math.floor(x/32)+','+Math.floor(z/32))??[]){
   const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(length*length)));
   const distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
   if(distance>water.width/2+bank||distance>=(closest.get(order)?.distance??Infinity))continue;
   closest.set(order,{water,distance,level:a.level+(b.level-a.level)*t,flowX:dx/length,flowZ:dz/length});
  }
  return [...closest].sort(([a],[b])=>b-a).map(([,hit])=>hit);
 }
}
