/** E8 — paths and roads: pure, deterministic geometry and diagnostics (no Three.js; same
 * output in the Studio, « Jouer ici » and the published game). One drawing tool, four
 * profiles; geometry is cut per sector so an edit rebuilds only the sectors it touches. */
import type {PathDefinition,PathKind} from '../world-data.ts';
import {LinearColor} from '../render/linear-color.ts';

export interface PathProfile {label:string;base:number;alt:number;offset:number;maxSlope:number;rank:number}
/** Visual profiles. `offset` lifts the surface above the relief, `rank` orders overlapping
 * surfaces (junctions: the higher rank lies on top, never coplanar), `maxSlope` (rise/run)
 * is the steepest comfortable gradient before a diagnostic. Values are art/benchmark knobs. */
export const PATH_PROFILES:Record<PathKind,PathProfile>={
  trail:{label:'Sentier naturel',base:0xb7a273,alt:0x93925e,offset:.07,maxSlope:.6,rank:0},
  dirt:{label:'Chemin de terre',base:0xd3bd94,alt:0xb59b72,offset:.12,maxSlope:.45,rank:1},
  stone:{label:'Chemin de pierre / pavé',base:0xaaa69c,alt:0x86827a,offset:.15,maxSlope:.35,rank:2},
  wood:{label:'Passage en bois',base:0xa8794b,alt:0x7a5433,offset:.32,maxSlope:.25,rank:3},
};
export const PATH_KIND_IDS:PathKind[]=['trail','dirt','stone','wood'];
export const kindOf=(p:PathDefinition):PathKind=>p.kind??'dirt';
export interface Sample {x:number;z:number;d:number}
const STRAIGHT_STEP=3,CURVE_STEP=2;

/** Dense centre line with cumulative distance. Smooth paths use a centripetal Catmull-Rom
 * through the authored points (the curve passes through every point). */
export function centerline(path:PathDefinition):Sample[]{
  const pts=path.points,out:Sample[]=[];let d=0;
  const push=(x:number,z:number)=>{const last=out.at(-1);if(last){const l=Math.hypot(x-last.x,z-last.z);if(l<1e-6)return;d+=l;}out.push({x,z,d});};
  if(!path.smooth||pts.length<3){
    for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/STRAIGHT_STEP));for(let j=0;j<n;j++)push(a.x+(b.x-a.x)*j/n,a.z+(b.z-a.z)*j/n);}
    push(pts.at(-1)!.x,pts.at(-1)!.z);return out;
  }
  for(let i=0;i<pts.length-1;i++){
    const p0=pts[Math.max(0,i-1)],p1=pts[i],p2=pts[i+1],p3=pts[Math.min(pts.length-1,i+2)];
    const t=(a:{x:number;z:number},b:{x:number;z:number})=>Math.sqrt(Math.max(1e-4,Math.hypot(b.x-a.x,b.z-a.z)));
    const t1=t(p0,p1),t2=t1+t(p1,p2),t3=t2+t(p2,p3),n=Math.max(1,Math.ceil(Math.hypot(p2.x-p1.x,p2.z-p1.z)/CURVE_STEP));
    for(let j=0;j<n;j++){
      const u=t1+(t2-t1)*j/n,lerp=(a:{x:number;z:number},b:{x:number;z:number},ta:number,tb:number)=>({x:(tb-u)/(tb-ta||1)*a.x+(u-ta)/(tb-ta||1)*b.x,z:(tb-u)/(tb-ta||1)*a.z+(u-ta)/(tb-ta||1)*b.z});
      const a1=lerp(p0,p1,0,t1),a2=lerp(p1,p2,t1,t2),a3=lerp(p2,p3,t2,t3),b1=lerp(a1,a2,0,t2),b2=lerp(a2,a3,t1,t3),c=lerp(b1,b2,t1,t2);push(c.x,c.z);
    }
  }
  push(pts.at(-1)!.x,pts.at(-1)!.z);return out;
}
/** Deterministic tie-break between overlapping paths of the same rank (no z-fighting). */
function idHash(id:string){let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return (h>>>0)%997;}
export function surfaceOffset(path:PathDefinition):number{const p=PATH_PROFILES[kindOf(path)];return p.offset+p.rank*.012+idHash(path.id)*1.5e-6;}

export interface GeometryEnv {height(x:number,z:number):number;water?(x:number,z:number):number|null}
/** Walking surface of a path at a point (wood decks float above water). */
export function surfaceHeight(path:PathDefinition,x:number,z:number,env:GeometryEnv):number{const g=env.height(x,z);return (kindOf(path)==='wood'?Math.max(g,env.water?.(x,z)??-Infinity):g)+surfaceOffset(path);}
export interface SectorRect {minX:number;maxX:number;minZ:number;maxZ:number}
export interface PathGeometry {positions:Float32Array;colors:Float32Array;uvs:Float32Array;kinds:Float32Array;index:Uint32Array;paths:string[]}
/** Surface of every path crossing `rect`: segments whose midpoint lies in the rectangle (each
 * segment belongs to exactly one sector, consecutive sectors share their boundary samples).
 * LOD 0: crowned 3-vertex cross-section, round end caps, wood deck with side skirts;
 * LOD 1: one sample out of three, flat 2-vertex section, no caps. */
export function sectorGeometry(paths:readonly PathDefinition[],rect:SectorRect,env:GeometryEnv,lod:0|1=0,lines?:Map<string,Sample[]>):PathGeometry{
  const pos:number[]=[],col:number[]=[],uv:number[]=[],kinds:number[]=[],idx:number[]=[],used:string[]=[],color=new LinearColor(),alt=new LinearColor();
  const inRect=(x:number,z:number)=>x>=rect.minX&&x<rect.maxX&&z>=rect.minZ&&z<rect.maxZ;
  for(const path of paths){
    const all=lines?.get(path.id)??centerline(path),kind=kindOf(path),profile=PATH_PROFILES[kind],off=surfaceOffset(path),half=path.width/2;
    const line=lod===0?all:all.filter((_,i)=>i%3===0||i===all.length-1);if(line.length<2)continue;
    color.setHex(profile.base);alt.setHex(profile.alt);
    const surface=(x:number,z:number)=>surfaceHeight(path,x,z,env);void off;
    // Miter normal at each sample (average of the adjacent directions, width compensated).
    const normal=(i:number)=>{
      const a=line[Math.max(0,i-1)],b=line[Math.min(line.length-1,i+1)],c=line[i];
      const d1x=c.x-a.x,d1z=c.z-a.z,d2x=b.x-c.x,d2z=b.z-c.z,l1=Math.hypot(d1x,d1z)||1,l2=Math.hypot(d2x,d2z)||1;
      let tx=d1x/l1+d2x/l2,tz=d1z/l1+d2z/l2;const tl=Math.hypot(tx,tz)||1;tx/=tl;tz/=tl;
      const ref=i>0?{x:d1x/l1,z:d1z/l1}:{x:d2x/l2,z:d2z/l2},cos=Math.max(.5,tx*ref.x+tz*ref.z);return {nx:-tz/cos,nz:tx/cos};
    };
    let any=false,runStart=-1;
    const across=lod===0&&kind!=='wood'?[-1,0,1]:[-1,1];
    const emit=(from:number,to:number)=>{
      const base=pos.length/3,ring=across.length+(kind==='wood'&&lod===0?2:0);
      for(let i=from;i<=to;i++){
        const s=line[i],{nx,nz}=normal(i);
        const vary=.5+.5*Math.sin(s.d*.37+s.x*.11)*Math.cos(s.z*.13);
        for(const a of across){const x=s.x+nx*half*a,z=s.z+nz*half*a,y=surface(x,z)+(a===0?.03:0);pos.push(x,y,z);const k=kind==='trail'?Math.abs(a)*.6*vary:vary*.35;col.push(color.r+(alt.r-color.r)*k,color.g+(alt.g-color.g)*k,color.b+(alt.b-color.b)*k);uv.push(s.d,a);}
        if(kind==='wood'&&lod===0)for(const a of [-1,1]){const x=s.x+nx*half*a,z=s.z+nz*half*a;pos.push(x,surface(x,z)-.32,z);col.push(alt.r*.8,alt.g*.8,alt.b*.8);uv.push(s.d,a*1.2);}
      }
      const cols=across.length;
      for(let i=0;i<to-from;i++){
        const r0=base+i*ring,r1=r0+ring;
        for(let c=0;c<cols-1;c++)idx.push(r0+c,r1+c,r0+c+1,r0+c+1,r1+c,r1+c+1);
        if(ring>cols){const l0=r0+cols,l1=r1+cols,rr0=r0+cols+1,rr1=r1+cols+1;idx.push(l0,l1,r0,r0,l1,r1,r0+cols-1,r1+cols-1,rr0,rr0,r1+cols-1,rr1);}
      }
    };
    for(let i=0;i<line.length-1;i++){
      const mx=(line[i].x+line[i+1].x)/2,mz=(line[i].z+line[i+1].z)/2,inside=inRect(mx,mz);
      if(inside&&runStart<0)runStart=i;
      if((!inside||i===line.length-2)&&runStart>=0){emit(runStart,inside?i+1:i);runStart=-1;any=true;}
    }
    // Round caps at the ends (LOD 0): clean junctions where a path ends on another one.
    if(lod===0&&kind!=='wood')for(const end of [0,line.length-1]){
      const s=line[end];if(!inRect(s.x,s.z))continue;any=true;
      const o=line[end===0?1:end-1],dx=s.x-o.x,dz=s.z-o.z,l=Math.hypot(dx,dz)||1,ux=dx/l,uz=dz/l,centre=pos.length/3,n=6;
      pos.push(s.x,surface(s.x,s.z)+.02,s.z);col.push(color.r,color.g,color.b);uv.push(s.d,0);
      for(let k=0;k<=n;k++){const ang=-Math.PI/2+Math.PI*k/n,c=Math.cos(ang),sn=Math.sin(ang),x=s.x+(ux*c-uz*sn)*half,z=s.z+(uz*c+ux*sn)*half;pos.push(x,surface(x,z),z);col.push(color.r,color.g,color.b);uv.push(s.d,sn);}
      for(let k=0;k<n;k++)idx.push(centre,centre+1+k,centre+2+k);
    }
    for(let i=kinds.length;i<pos.length/3;i++)kinds.push(profile.rank);
    if(any)used.push(path.id);
  }
  for(let i=kinds.length;i<pos.length/3;i++)kinds.push(0);
  return {positions:new Float32Array(pos),colors:new Float32Array(col),uvs:new Float32Array(uv),kinds:new Float32Array(kinds),index:new Uint32Array(idx),paths:used};
}
/** Sector rectangles crossed by a path (its centre line, padded by the width). */
export function pathSectors(path:PathDefinition,size:number,line=centerline(path)):string[]{
  const out=new Set<string>(),pad=path.width/2+1;
  for(const s of line)for(const [dx,dz]of [[-pad,-pad],[pad,-pad],[-pad,pad],[pad,pad],[0,0]])out.add(Math.floor((s.x+dx)/size)+':'+Math.floor((s.z+dz)/size));
  return [...out];
}

// ---- Authoring helpers -------------------------------------------------------------------
export interface Snap {x:number;z:number;pathId:string;vertex:boolean}
/** Snap a point to the nearest vertex (preferred) or segment of another path. */
export function snapToPaths(paths:readonly PathDefinition[],q:{x:number;z:number},radius:number,excludeId?:string):Snap|null{
  let best:Snap|null=null,bd=radius;
  for(const p of paths){if(p.id===excludeId)continue;for(const v of p.points){const d=Math.hypot(v.x-q.x,v.z-q.z);if(d<bd*1.4&&(!best||!best.vertex||d<bd)){bd=Math.min(bd,d);best={x:v.x,z:v.z,pathId:p.id,vertex:true};}}}
  if(best)return best;
  for(const p of paths){if(p.id===excludeId)continue;const line=centerline(p);for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((q.x-a.x)*dx+(q.z-a.z)*dz)/(dx*dx+dz*dz||1))),x=a.x+t*dx,z=a.z+t*dz,d=Math.hypot(x-q.x,z-q.z);if(d<bd){bd=d;best={x,z,pathId:p.id,vertex:false};}}}
  return best;
}
export interface PathDiagnostic {pathId:string;severity:'WARNING'|'ERROR';code:'PATH_STEEP'|'PATH_JUNCTION_GAP'|'PATH_JUNCTION_HEIGHT'|'PATH_DUPLICATE'|'PATH_UNDERWATER';message:string;x:number;z:number}
const pct=(v:number)=>Math.round(v*100)+' %';
/** Slopes beyond the profile, ends that almost (but not) reach another path, junctions whose
 * surfaces are too far apart vertically, duplicated tracks and non-wood paths under water. */
export function pathDiagnostics(paths:readonly PathDefinition[],env:GeometryEnv):PathDiagnostic[]{
  const out:PathDiagnostic[]=[],lines=new Map(paths.map(p=>[p.id,centerline(p)]));
  for(const p of paths){
    const kind=kindOf(p),profile=PATH_PROFILES[kind],line=lines.get(p.id)!;let worst=0,at=line[0];
    for(let i=4;i<line.length;i+=4){const a=line[i-4],b=line[i],run=b.d-a.d;if(run<=0)continue;const slope=Math.abs(env.height(b.x,b.z)-env.height(a.x,a.z))/run;if(slope>worst){worst=slope;at=b;}}
    if(worst>profile.maxSlope)out.push({pathId:p.id,severity:worst>profile.maxSlope*1.6?'ERROR':'WARNING',code:'PATH_STEEP',message:`${profile.label} : pente de ${pct(worst)} (au-delà de ${pct(profile.maxSlope)} conseillés)`,x:at.x,z:at.z});
    if(kind!=='wood'){const wet=line.find(s=>{const w=env.water?.(s.x,s.z);return w!=null&&w>env.height(s.x,s.z)+.3;});if(wet)out.push({pathId:p.id,severity:'WARNING',code:'PATH_UNDERWATER',message:`${profile.label} sous l’eau : utiliser un passage en bois ou dévier le tracé`,x:wet.x,z:wet.z});}
    for(const end of [p.points[0],p.points.at(-1)!]){
      const snap=snapToPaths(paths,end,Math.max(3,p.width*1.5),p.id);if(!snap)continue;const gap=Math.hypot(snap.x-end.x,snap.z-end.z),other=paths.find(o=>o.id===snap.pathId)!;
      if(gap>.25&&gap<Math.max(3,p.width*1.5)-1e-6)out.push({pathId:p.id,severity:'WARNING',code:'PATH_JUNCTION_GAP',message:`Extrémité à ${gap.toFixed(1)} m d’un autre chemin : raccord incomplet`,x:end.x,z:end.z});
      else if(gap<=.25){
        const diff=Math.abs(surfaceHeight(p,end.x,end.z,env)-surfaceHeight(other,end.x,end.z,env));
        if(diff>.6)out.push({pathId:p.id,severity:'ERROR',code:'PATH_JUNCTION_HEIGHT',message:`Raccord impossible : ${diff.toFixed(1)} m de dénivelé entre les deux surfaces`,x:end.x,z:end.z});
      }
    }
  }
  // Duplicates: most of a path lies within the width of another one.
  for(let i=0;i<paths.length;i++)for(let j=i+1;j<paths.length;j++){
    const a=lines.get(paths[i].id)!,b=lines.get(paths[j].id)!,tol=Math.max(paths[i].width,paths[j].width)/2;let near=0;
    for(const s of a){let d=Infinity;for(let k=1;k<b.length;k++){const p=b[k-1],q=b[k],dx=q.x-p.x,dz=q.z-p.z,t=Math.max(0,Math.min(1,((s.x-p.x)*dx+(s.z-p.z)*dz)/(dx*dx+dz*dz||1)));d=Math.min(d,Math.hypot(s.x-p.x-t*dx,s.z-p.z-t*dz));if(d<tol)break;}if(d<tol)near++;}
    if(near>a.length*.7&&a.length>3)out.push({pathId:paths[i].id,severity:'WARNING',code:'PATH_DUPLICATE',message:'Chemin dédoublé : ce tracé recouvre presque entièrement un autre chemin',x:a[0].x,z:a[0].z});
  }
  return out;
}
/** Ribbon used for distances (vegetation exclusion, road occupation, picking): the actual
 * drawn centre line, so curved paths keep their verge free of trees. */
export function pathRibbon(path:PathDefinition):{points:{x:number;z:number}[];width:number}{return path.smooth?{points:centerline(path),width:path.width}:path;}
