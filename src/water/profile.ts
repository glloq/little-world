import type {WaterBody} from '../world-data.ts';
export type WaterProfile = {mode:'terrain';offset:number}|{mode:'manual';levels:number[]};
export interface HydroPoint {x:number;z:number;distance:number;ground:number;level:number}
export interface HydroDiagnostic {severity:'ERROR'|'WARNING';code:string;message:string}
export interface CompiledWater {id:string;width:number;depth:number;points:HydroPoint[];diagnostics:HydroDiagnostic[];
  /** Lake: constant level over a closed outline (points = polygon). Absent = river/stream. */kind?:'lake';polygon?:{x:number;z:number}[];
  /** Explicit waterfalls kept with their high and low levels. */falls?:{x:number;z:number;top:number;bottom:number}[]}
/** Network context: receiving lakes/rivers and the sea level bound the levels of a river. */
export interface WaterNetworkContext {lakes:Map<string,CompiledWater>;rivers:Map<string,CompiledWater>;seaLevel:number}
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
/** Optional network fields of a water body (V3 hydrography, all optional). */
export function validateWaterNetworkFields(w:WaterBody):void{
 const link=(l:unknown,label:string)=>{if(l===undefined)return;const v=l as Record<string,unknown>;if(!v||typeof v!=='object'||!['lake','river','sea'].includes(String(v.kind))||Object.keys(v).some(k=>k!=='kind'&&k!=='id'))throw Error(label+' : lien d’eau invalide');if(v.kind!=='sea'&&(typeof v.id!=='string'||!v.id||v.id.length>100))throw Error(label+' : identifiant du lac ou de la rivière requis');if(v.kind==='sea'&&v.id!==undefined)throw Error(label+' : la mer n’a pas d’identifiant');};
 if(w.kind!==undefined&&w.kind!=='lake'&&w.kind!=='river')throw Error('Type d’eau inconnu');
 if(w.kind==='lake'){if(w.points.length<3)throw Error('Lac : trois sommets au moins');if(w.profile!==undefined||w.from!==undefined||w.to!==undefined||w.falls!==undefined)throw Error('Lac : niveau constant, sans profil, lien ni cascade');return;}
 link(w.from,'Source');link(w.to,'Exutoire');if(w.from?.kind==='sea')throw Error('Une rivière ne peut pas sortir de la mer');
 if(w.falls!==undefined){if(!Array.isArray(w.falls)||w.falls.length>8)throw Error('Cascades invalides');for(const f of w.falls){if(!f||!Number.isInteger(f.at)||f.at<1||f.at>=w.points.length-1||!finite(f.top,-50,150)||!finite(f.bottom,-50,150)||f.top-f.bottom<1)throw Error('Cascade : point intermédiaire, niveau haut au moins 1 m au-dessus du bas');}
  if(new Set(w.falls.map(f=>f.at)).size!==w.falls.length)throw Error('Deux cascades au même point');}
}
/** Signed distance to a closed outline: positive inside. */
export function polygonSignedDistance(poly:{x:number;z:number}[],x:number,z:number):number{
 let inside=false,best=Infinity;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.z>z)!==(b.z>z)&&x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));best=Math.min(best,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));}
 return inside?best:-best;
}
function compileLake(w:WaterBody,source:(x:number,z:number)=>number):CompiledWater{
 const diagnostics:HydroDiagnostic[]=[],poly=w.points.map(p=>({x:p.x,z:p.z}));let dry=0;
 for(const p of poly)if(source(p.x,p.z)<w.level-.5)dry++;
 if(dry)diagnostics.push({severity:'WARNING',code:'LAKE_SPILL',message:`${dry} sommet(s) du rivage sous le niveau du lac : l’eau déborderait. Élever les berges ou baisser le niveau.`});
 return {id:w.id,width:w.width,depth:w.depth,points:poly.map((p,i)=>({x:p.x,z:p.z,distance:i,ground:source(p.x,p.z),level:w.level})),diagnostics,kind:'lake',polygon:poly};
}
/** Level of a compiled water at the point nearest to (x, z). */
function levelNear(c:CompiledWater,x:number,z:number){if(c.kind==='lake')return {level:c.points[0].level,distance:Math.max(0,-polygonSignedDistance(c.polygon!,x,z))};let best={level:c.points[0]?.level??0,distance:Infinity};for(const p of c.points){const d=Math.hypot(p.x-x,p.z-z);if(d<best.distance)best={level:p.level,distance:d};}return best;}
/** Derived once from the uncarved terrain. No world mutation or render dependency.
 * With a network context: a river leaving a lake starts at its level, a river ending in a
 * lake / river / the sea never goes below the receiving level, and links are diagnosed. */
export function compileWaterBody(w:WaterBody,source:(x:number,z:number)=>number,network?:WaterNetworkContext):CompiledWater {
 if(w.kind==='lake')return compileLake(w,source);
 const points:HydroPoint[]=[],diagnostics:HydroDiagnostic[]=[],falls:{x:number;z:number;top:number;bottom:number}[]=[];
 const fallAt=new Map((w.falls??[]).map(f=>[f.at,f]));
 const upstream=w.from&&network?(w.from.kind==='lake'?network.lakes.get(w.from.id!):network.rivers.get(w.from.id!)):undefined;
 const downstream=w.to&&network?(w.to.kind==='sea'?{level:network.seaLevel,distance:0}:(()=>{const t=w.to!.kind==='lake'?network.lakes.get(w.to!.id!):network.rivers.get(w.to!.id!);const end=w.points.at(-1)!;return t?levelNear(t,end.x,end.z):undefined;})()):undefined;
 if(w.from&&network&&!upstream)diagnostics.push({severity:'ERROR',code:'WATER_LINK_MISSING',message:'Source introuvable : '+w.from.id});
 if(w.to&&w.to.kind!=='sea'&&network&&!downstream)diagnostics.push({severity:'ERROR',code:'WATER_LINK_MISSING',message:'Exutoire introuvable : '+w.to.id});
 let distance=0,previous=upstream?levelNear(upstream,w.points[0].x,w.points[0].z).level:Infinity,cut=0,maxSlope=0,correction=0,raised=0;const floor=downstream?.level??-Infinity;
 const length=w.points.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b.x-w.points[i].x,b.z-w.points[i].z),0);
 const spacing=Math.max(3,length/4000);
 if(length>12000)diagnostics.push({severity:'ERROR',code:'WATER_TOO_LONG',message:'Tracé supérieur à 12 km : découper le cours d’eau en tronçons.'});
 for(let i=1;i<w.points.length;i++){
  const a=w.points[i-1],b=w.points[i],len=Math.hypot(b.x-a.x,b.z-a.z);
  if(len<.01){diagnostics.push({severity:'ERROR',code:'WATER_DUPLICATE_POINT',message:`Points ${i} et ${i+1} confondus : supprimer un point.`});continue;}
  const steps=Math.max(1,Math.ceil(len/spacing));
  for(let j=i===1?0:1;j<=steps;j++){
   const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,ground=source(x,z);
   let level=w.level;const before=fallAt.get(i-1);
   if(w.profile?.mode==='terrain'){const proposed=ground+w.profile.offset;level=Math.min(previous,proposed);correction=Math.max(correction,proposed-level);}
   else if(w.profile?.mode==='manual'){const start=before?before.bottom:w.profile.levels[i-1];level=start+(w.profile.levels[i]-start)*t;}
   if(upstream&&!points.length&&w.profile?.mode==='terrain')level=previous; // fed by its source: starts at its level
   if(level<floor){raised=Math.max(raised,floor-level);level=floor;}
   const fall=j===steps?fallAt.get(i):undefined;
   if(fall){if(level<fall.top-.01)diagnostics.push({severity:'ERROR',code:'WATER_FALL_TOP',message:`Cascade au point ${i+1} : le cours d’eau arrive à ${level.toFixed(1)} m, sous son niveau haut (${fall.top} m).`});level=Math.min(level,fall.top);if(ground<fall.bottom-.5)diagnostics.push({severity:'WARNING',code:'WATER_FALL_GROUND',message:`Cascade au point ${i+1} : le pied (${fall.bottom} m) est au-dessus du terrain ; vérifier le bassin.`});}
   const p={x,z,distance:distance+len*t,ground,level},last=points.at(-1);
   if(last&&!(before&&j===1&&last.level>level+.9))maxSlope=Math.max(maxSlope,(last.level-level)/(p.distance-last.distance));
   points.push(p);previous=level;cut=Math.max(cut,ground-level);
   // An explicit waterfall: a second point just downstream at the low level (vertical sheet).
   if(fall){const nx=w.points[i+1],dl=Math.hypot(nx.x-x,nx.z-z)||1,ox=(nx.x-x)/dl*.05,oz=(nx.z-z)/dl*.05;points.push({x:x+ox,z:z+oz,distance:p.distance+.05,ground,level:fall.bottom});falls.push({x,z,top:level,bottom:fall.bottom});previous=fall.bottom;}
  }
  distance+=len;
 }
 if(raised>1)diagnostics.push({severity:'WARNING',code:'WATER_LINK_BELOW',message:`Le lit descend ${raised.toFixed(1)} m sous le niveau de l’exutoire : l’eau est maintenue à ce niveau (berges à vérifier).`});
 if(upstream&&points.length){const near=levelNear(upstream,points[0].x,points[0].z);if(near.distance>3)diagnostics.push({severity:'ERROR',code:'WATER_LINK_GAP',message:`La rivière commence à ${near.distance.toFixed(0)} m de sa source : rapprocher le premier point.`});
  if(w.profile?.mode==='manual'&&w.profile.levels[0]>near.level+.05)diagnostics.push({severity:'ERROR',code:'WATER_LINK_RISE',message:`La rivière part ${(w.profile.levels[0]-near.level).toFixed(1)} m au-dessus de sa source : l’eau remonterait.`});}
 if(downstream&&points.length){const end=points.at(-1)!;if(w.to?.kind==='sea'){if(end.ground>network!.seaLevel+.5)diagnostics.push({severity:'ERROR',code:'WATER_SEA_GAP',message:'La rivière n’atteint pas la mer : prolonger le tracé jusqu’au rivage.'});}
  else{if(downstream.distance>3)diagnostics.push({severity:'ERROR',code:'WATER_LINK_GAP',message:`La rivière s’arrête à ${downstream.distance.toFixed(0)} m de son exutoire : rapprocher le dernier point.`});
   if(w.profile?.mode==='manual'&&w.profile.levels.at(-1)!<downstream.level-.1)diagnostics.push({severity:'ERROR',code:'WATER_LINK_UPHILL',message:'La rivière arrive sous le niveau de son exutoire : relever ses niveaux.'});}}
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
 return {id:w.id,width:w.width,depth:w.depth,points,diagnostics,...(falls.length?{falls}:{})};
}
/** Whole network: lakes first, then rivers from upstream to downstream (a river feeding
 * another is compiled after it). Cycles are reported, never looped. */
export function compileWaterNetwork(waters:WaterBody[],source:(x:number,z:number)=>number,seaLevel=0):CompiledWater[]{
 const network:WaterNetworkContext={lakes:new Map(),rivers:new Map(),seaLevel},byId=new Map(waters.map(w=>[w.id,w])),out=new Map<string,CompiledWater>();
 for(const w of waters)if(w.kind==='lake'){const c=compileLake(w,source);network.lakes.set(w.id,c);out.set(w.id,c);}
 const visiting=new Set<string>(),cyclic=new Set<string>();
 const visit=(w:WaterBody):CompiledWater=>{
  const done=out.get(w.id);if(done)return done;
  if(visiting.has(w.id)){cyclic.add(w.id);return compileWaterBody(w,source);}
  visiting.add(w.id);
  // Receiving river first (its levels bound ours), upstream source first (its level starts ours).
  for(const link of [w.to,w.from])if(link?.kind==='river'){const t=byId.get(link.id!);if(t&&t.kind!=='lake')visit(t);}
  const c=compileWaterBody(w,source,network);visiting.delete(w.id);
  if(cyclic.has(w.id))c.diagnostics.push({severity:'ERROR',code:'WATER_LINK_CYCLE',message:'Boucle dans le réseau hydrographique : une rivière se jette dans son propre amont.'});
  if(!out.has(w.id)){out.set(w.id,c);network.rivers.set(w.id,c);}return out.get(w.id)!;
 };
 for(const w of waters)if(w.kind!=='lake')visit(w);
 return waters.map(w=>out.get(w.id)!);
}
export interface HydroVertex {x:number;z:number;level:number}
export function waterSections(water:CompiledWater):{left:HydroVertex;right:HydroVertex}[]{
 const p=water.points;
 return p.map((v,i)=>{
  const before=p[Math.max(0,i-1)],after=p[Math.min(p.length-1,i+1)],dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1;
  return {left:{x:v.x-dz/len*water.width/2,z:v.z+dx/len*water.width/2,level:v.level},right:{x:v.x+dz/len*water.width/2,z:v.z-dx/len*water.width/2,level:v.level}};
 });
}
interface Segment {water:CompiledWater;order:number;a:HydroPoint;b:HydroPoint;leftA:HydroVertex;rightA:HydroVertex;leftB:HydroVertex;rightB:HydroVertex}
function triangleLevel(x:number,z:number,a:HydroVertex,b:HydroVertex,c:HydroVertex):number|null {
 const dx=b.x-a.x,dz=b.z-a.z,ex=c.x-a.x,ez=c.z-a.z,det=dx*ez-dz*ex;
 if(Math.abs(det)<1e-10)return null;
 const u=((x-a.x)*ez-(z-a.z)*ex)/det,v=(dx*(z-a.z)-dz*(x-a.x))/det;
 return u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7?a.level+u*(b.level-a.level)+v*(c.level-a.level):null;
}
export interface WaterHit {water:CompiledWater;distance:number;level:number;flowX:number;flowZ:number;inside:boolean}
/** Local segment grid shared by bed, swimming and surface queries. */
const EMPTY_HITS:readonly WaterHit[]=Object.freeze([]);
/** Unique numeric key of a 32 m cell (|cell| < 2^20 covers any world up to ±33 000 km). */
const cellKey=(cx:number,cz:number)=>(cx+1048576)*2097152+(cz+1048576);
export class WaterSpatialIndex {
 private cells=new Map<number,Segment[]>();
 readonly bodies:CompiledWater[];
 private lakeCells=new Map<number,{water:CompiledWater;order:number}[]>();
 constructor(waters:WaterBody[],source:(x:number,z:number)=>number,seaLevel=0){
  this.bodies=compileWaterNetwork(waters,source,seaLevel);
  let segments=0;
  for(const [order,water] of this.bodies.entries()){
   if(water.kind==='lake'){const xs=water.polygon!.map(p=>p.x),zs=water.polygon!.map(p=>p.z);
    for(let cx=Math.floor((Math.min(...xs)-4)/32);cx<=Math.floor((Math.max(...xs)+4)/32);cx++)for(let cz=Math.floor((Math.min(...zs)-4)/32);cz<=Math.floor((Math.max(...zs)+4)/32);cz++){const key=cellKey(cx,cz),cell=this.lakeCells.get(key)??[];cell.push({water,order});this.lakeCells.set(key,cell);}
    continue;}
   const sections=waterSections(water);
   for(let i=1;i<water.points.length;i++){
   if(++segments>65536)throw Error('Réseau d’eau trop détaillé : plus de 65 536 segments.');
   const a=water.points[i-1],b=water.points[i],r=water.width/2+2,segment={water,order,a,b,leftA:sections[i-1].left,rightA:sections[i-1].right,leftB:sections[i].left,rightB:sections[i].right};
   for(let cx=Math.floor((Math.min(a.x,b.x)-r)/32);cx<=Math.floor((Math.max(a.x,b.x)+r)/32);cx++)
    for(let cz=Math.floor((Math.min(a.z,b.z)-r)/32);cz<=Math.floor((Math.max(a.z,b.z)+r)/32);cz++){
     const key=cellKey(cx,cz),cell=this.cells.get(key)??[];cell.push(segment);this.cells.set(key,cell);
    }
   }
  }
 }
 query(x:number,z:number,bank=0):readonly WaterHit[]{
  const key=cellKey(Math.floor(x/32),Math.floor(z/32)),candidates=this.cells.get(key),lakes=this.lakeCells.get(key);if(!candidates&&!lakes)return EMPTY_HITS;
  const closest=new Map<number,WaterHit>();
  // Lakes: constant level, no current; `distance` = metres outside the shore (0 inside).
  for(const {water,order} of lakes??[]){const d=polygonSignedDistance(water.polygon!,x,z);if(d<-bank||d<0&&bank===0)continue;closest.set(order,{water,distance:Math.max(0,-d),level:water.points[0].level,flowX:0,flowZ:0,inside:d>=0});}
  if(!candidates)return [...closest].sort(([a],[b])=>b-a).map(([,hit])=>hit);
  for(const {water,order,a,b,leftA,rightA,leftB,rightB} of candidates){
   const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(length*length)));
   const distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz);
   if(distance>water.width/2+bank)continue;
   const first=triangleLevel(x,z,leftA,leftB,rightA),second=triangleLevel(x,z,rightA,leftB,rightB),inside=first!==null||second!==null;
   if(!inside&&bank===0)continue;
   const level=inside?Math.max(first??-Infinity,second??-Infinity):a.level+(b.level-a.level)*t,previous=closest.get(order);
   // Upper surface wins if a very tight bend overlaps its own strip. Bank-only
   // projections must never replace an actual water volume.
   if(previous&&(previous.inside&&!inside||previous.inside===inside&&(inside?level<=previous.level:distance>=previous.distance)))continue;
   closest.set(order,{water,distance,level,flowX:dx/length,flowZ:dz/length,inside});
  }
  return [...closest].sort(([a],[b])=>b-a).map(([,hit])=>hit);
 }
}
