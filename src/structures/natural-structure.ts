/** Lightweight source/compiled natural structures. All dimensions are metres, Y up.
 * A local vaulted mesh forms the roof of a passage: the global terrain remains a heightfield.
 * Tunnel openings are made by reversible authored terrain strokes, never boolean CSG. */
export type NaturalKind='arch'|'bridge'|'tunnel';
export type NaturalForm='round'|'pointed'|'flat';
export interface NaturalStructureSpec {
  type:'NaturalStructure';kind:NaturalKind;form:NaturalForm;
  span:number;width:number;clearance:number;thickness:number;curvature:number;
  /** Auto-adapt longitudinal bank mismatch for arch/bridge; omitted in older projects. */
  bankRise?:number;
}
export interface PointXZ {x:number;z:number}
export interface NaturalBox {x:number;z:number;bottom:number;sx:number;sz:number;sy:number}
export const NATURAL_ASSET_ID='procedural.natural_structure';
export const NATURAL_LABELS:Record<NaturalKind,string>={arch:'Arche rocheuse',bridge:'Pont naturel',tunnel:'Tunnel traversant'};
export function validateNaturalStructure(s:NaturalStructureSpec):NaturalStructureSpec {
  if(s?.type!=='NaturalStructure'||!['arch','bridge','tunnel'].includes(s.kind)||!['round','pointed','flat'].includes(s.form))throw Error('Type de structure naturelle invalide');
  for(const [k,min,max] of [['span',3,40],['width',2.5,20],['clearance',2.3,12],['thickness',.6,5],['curvature',.2,2]] as const){
    const v=s[k];if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Structure naturelle : '+k+' hors limites');
  }
  if(s.bankRise!==undefined&&(!Number.isFinite(s.bankRise)||Math.abs(s.bankRise)>12))throw Error('Différence de niveau des appuis invalide');
  return {...s};
}
export function naturalProfile(spec:NaturalStructureSpec,t:number):number {
  const u=Math.min(1,Math.abs(t));
  if(spec.form==='flat')return u<.83?1:Math.max(0,(1-u)/.17);
  if(spec.form==='pointed')return Math.pow(Math.max(0,1-u),spec.curvature*.65);
  return Math.pow(Math.max(0,1-u*u),spec.curvature*.5);
}
/** Lower face of the vault: zero at the foundations, clearance at the middle.
 * Tunnel curvature is transverse (Z), while arch/bridge curvature is along X. */
export function vaultUnder(spec:NaturalStructureSpec,t:number):number {
  const edge=.3;
  return edge+(spec.clearance-edge)*naturalProfile(spec,t);
}
export function spanFromPoints(a:PointXZ,b:PointXZ):number{return Math.hypot(b.x-a.x,b.z-a.z);}
export function naturalPlan(a:PointXZ,b:PointXZ,kind:NaturalKind,options:{width:number;clearance:number;thickness:number;curvature:number;form:NaturalForm},height:(x:number,z:number)=>number){
  const span=spanFromPoints(a,b);
  const spec=validateNaturalStructure({type:'NaturalStructure',kind,span,...options});
  const h0=height(a.x,a.z),h1=height(b.x,b.z);
  if(!Number.isFinite(h0+h1)||Math.abs(h0-h1)>12)throw Error('Les deux appuis doivent être à moins de 12 m de dénivelé');
  if(kind!=='tunnel')spec.bankRise=h1-h0;
  const x=(a.x+b.x)/2,z=(a.z+b.z)/2,y=kind==='tunnel'?0:(h0+h1)/2-height(x,z)-spec.thickness-.3;
  return {x,z,y,yaw:-Math.atan2(b.z-a.z,b.x-a.x),spec,points:[{...a},{...b}] as [PointXZ,PointXZ]};
}
/** Collision decomposition, no single full-span box closing the natural opening.
 * At most 18 compact AABBs, tested independently from rendering; GPU LOD has no effect. */
export function naturalBoxes(spec:NaturalStructureSpec):NaturalBox[]{
  validateNaturalStructure(spec);
  const count=spec.kind==='tunnel'?16:16,out:NaturalBox[]=[];
  const half=(spec.kind==='tunnel'?spec.width:spec.span)/2,delta=2*half/count,depth=spec.kind==='tunnel'?spec.span:spec.width;
  for(let i=0;i<count;i++){
    const lo=-half+i*delta,hi=lo+delta,mid=(lo+hi)/2;
    // Conservatively cover the sloped upper and lower roof faces in a short segment.
    const u0=vaultUnder(spec,lo/half),u1=vaultUnder(spec,hi/half);
    const loRise=spec.kind==='tunnel'?0:(spec.bankRise??0)*lo/spec.span,
      hiRise=spec.kind==='tunnel'?0:(spec.bankRise??0)*hi/spec.span;
    const lower=Math.min(u0+loRise,u1+hiRise),upper=Math.max(u0+loRise,u1+hiRise)+spec.thickness;
    const tunnel=spec.kind==='tunnel';
    out.push({x:tunnel?0:mid,z:tunnel?mid:0,
      bottom:lower,sx:tunnel?depth:delta+.08,sz:tunnel?delta+.08:depth,sy:upper-lower});
  }
  return out;
}
/** A tunnel's heightfield passage: limited local flatten edits at 2–4 m spacing.
 * End banks remain accessible; the 3D roof supplies the missing overhead rock. */
export function tunnelExcavation(a:PointXZ,b:PointXZ,spec:NaturalStructureSpec,height:(x:number,z:number)=>number){
  if(spec.kind!=='tunnel')return [];
  const h0=height(a.x,a.z),h1=height(b.x,b.z),floor=Math.min(h0,h1)-.25;
  const samples=Math.max(2,Math.ceil(spec.span/Math.max(2,spec.width*.36)));
  if(samples>24)throw Error('Excavation trop dense');
  return Array.from({length:samples+1},(_,i)=>{
    const t=i/samples;
    return {x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t,radius:Math.min(15,Math.max(2,spec.width*.65)),
      strength:10,mode:'flatten' as const,height:floor};
  });
}
export function structureEndpoints(x:number,z:number,yaw:number,span:number):[PointXZ,PointXZ]{
  const dx=Math.cos(yaw)*span/2,dz=-Math.sin(yaw)*span/2;
  return [{x:x-dx,z:z-dz},{x:x+dx,z:z+dz}];
}
