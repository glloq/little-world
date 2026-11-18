/** Course rolling surface and modular obstacles. Pure 2.5D design; no Three.js.
 * Uses the same smoothed centerline engine as normal Little World paths. */
import {centerline} from '../paths/path-geometry.ts';
export type TrackMaterial='dirt'|'stone'|'wood';
export type TrackFeatureKind='bank'|'ramp'|'bumps'|'bridge';
export interface TrackPoint {x:number;z:number}
export interface TrackFeature {
 id:string;kind:TrackFeatureKind;
 /** Metres from the start of the centreline; no absolute world placement. */
 at:number;length:number;
 /** Height (m) of the kicker, hump or bridge clearance above its interpolated deck. */
 height:number;
 /** Signed bank angle in degrees, only for bank elements. Positive raises the right edge. */
 bankDeg?:number;
}
export interface RaceTrack {
 width:number;material:TrackMaterial;smooth:boolean;
 points:readonly TrackPoint[];
 features:readonly TrackFeature[];
}
export interface TrackSample {x:number;y:number;z:number;along:number;lateral:number;bankDeg:number;feature:TrackFeatureKind|null}
export interface TrackEnvironment {height(x:number,z:number):number}
export interface TrackBounds {minX:number;maxX:number;minZ:number;maxZ:number}
const number=(v:number)=>typeof v==='number'&&Number.isFinite(v);
const limit=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const smooth=(u:number)=>{const t=limit(u,0,1);return t*t*(3-2*t);};
const cellSize=24;
export function trackLine(track:RaceTrack){return centerline({id:'race-track',width:track.width,points:[...track.points],kind:track.material,smooth:track.smooth});}
export function trackLength(track:RaceTrack){return trackLine(track).at(-1)?.d??0;}
export function validateRaceTrack(raw:RaceTrack,bounds?:TrackBounds):RaceTrack{
 if(!raw||!number(raw.width)||raw.width<3||raw.width>18||
  !['dirt','stone','wood'].includes(raw.material)||typeof raw.smooth!=='boolean'||
  !Array.isArray(raw.points)||raw.points.length<2||raw.points.length>64||
  !Array.isArray(raw.features)||raw.features.length>32)throw Error('Piste : paramètres invalides');
 for(const p of raw.points){
  if(!p||!number(p.x)||!number(p.z)||Math.abs(p.x)>100000||Math.abs(p.z)>100000||
   bounds&&(p.x<bounds.minX||p.x>bounds.maxX||p.z<bounds.minZ||p.z>bounds.maxZ))
   throw Error('Piste : point en dehors du monde');
  if(Object.keys(p).some(k=>k!=='x'&&k!=='z'))throw Error('Piste : champ de point inconnu');
 }
 for(let i=1;i<raw.points.length;i++)
  if(Math.hypot(raw.points[i].x-raw.points[i-1].x,raw.points[i].z-raw.points[i-1].z)<3)
    throw Error('Piste : points trop proches');
 const length=trackLength(raw);
 if(length<8||length>2500)throw Error('Piste : longueur hors limites');
 const ids=new Set<string>();
 for(const f of raw.features){
  if(!f||typeof f.id!=='string'||!/^feature:[a-zA-Z0-9_-]{1,100}$/.test(f.id)||
    ids.has(f.id)||!['bank','ramp','bumps','bridge'].includes(f.kind)||
    !number(f.at)||!number(f.length)||!number(f.height)||f.at<0||f.length<3||
    f.at+f.length>length+.01||f.length>120||
    Object.keys(f).some(k=>!['id','kind','at','length','height','bankDeg'].includes(k)))throw Error('Piste : module invalide');
  if(f.kind==='bank'){
    if(!number(f.bankDeg??NaN)||Math.abs(f.bankDeg!)>35||f.height!==0)throw Error('Piste : inclinaison invalide');
  }else if(f.bankDeg!==undefined)throw Error('Piste : inclinaison réservée aux virages');
  if(f.kind==='ramp'&&(f.height<.2||f.height>3)||f.kind==='bumps'&&(f.height<.1||f.height>1.5)||
    f.kind==='bridge'&&(f.height<0||f.height>8))throw Error('Piste : hauteur de module invalide');
  ids.add(f.id);
 }
 // Overlapping physical modifiers produce ambiguous floors: enforce one feature at a time.
 const ordered=[...raw.features].sort((a,b)=>a.at-b.at);
 for(let i=1;i<ordered.length;i++)if(ordered[i].at<ordered[i-1].at+ordered[i-1].length-.01)
  throw Error('Piste : modules superposés');
 return raw;
}
type Part={x:number;z:number;dx:number;dz:number;len:number;start:number};
export interface RaceTrackSampler {
 readonly length:number;
 readonly line:readonly {x:number;z:number;d:number}[];
 /** Null outside the roadbed; all callers use the same definition for visuals and collision. */
 sample(x:number,z:number):TrackSample|null;
 /** Samples a controlled station for mesh construction and preview, without 2D nearest lookup. */
 station(distance:number,lateral:number):TrackSample;
}
export function createRaceTrackSampler(track:RaceTrack,env:TrackEnvironment):RaceTrackSampler{
 validateRaceTrack(track);
 const line=trackLine(track),parts:Part[]=[],cells=new Map<string,number[]>();
 const key=(x:number,z:number)=>Math.floor(x/cellSize)+':'+Math.floor(z/cellSize);
 for(let i=0;i<line.length-1;i++){
  const a=line[i],b=line[i+1],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
  if(len<1e-6)continue;
  const part={x:a.x,z:a.z,dx:dx/len,dz:dz/len,len,start:a.d},index=parts.push(part)-1;
  const half=track.width/2+2;
  for(let cx=Math.floor((Math.min(a.x,b.x)-half)/cellSize);cx<=Math.floor((Math.max(a.x,b.x)+half)/cellSize);cx++)
  for(let cz=Math.floor((Math.min(a.z,b.z)-half)/cellSize);cz<=Math.floor((Math.max(a.z,b.z)+half)/cellSize);cz++){
   const k=cx+':'+cz;const list=cells.get(k)??[];list.push(index);cells.set(k,list);
  }
 }
 const total=line.at(-1)!.d;
 const surface=(x:number,z:number,along:number,lateral:number):TrackSample=>{
  let rise=0,bankDeg=0,feature:TrackFeatureKind|null=null;
  for(const f of track.features){
   if(along<f.at||along>f.at+f.length)continue;
   const u=(along-f.at)/f.length;
   if(f.kind==='bank'){
    const blend=smooth(Math.min(1,u*5,(1-u)*5));
    bankDeg=(f.bankDeg??0)*blend;
    // At the inner edge, surface stays at ground: tilt the outside upward.
    rise+=Math.tan(Math.abs(bankDeg)*Math.PI/180)*(track.width/2+Math.sign(bankDeg)*lateral)*blend;
   }else if(f.kind==='ramp'){
    // Rising kicker and an intentionally sharp release lip.
    rise+=f.height*Math.pow(u,1.35); // Positive lip slope launches a rolling ball when ground drops away.
   }else if(f.kind==='bumps'){
    rise+=f.height*Math.sin(2*Math.PI*u)**2;
   }else if(f.kind==='bridge'){
    // A flat interpolated deck spanning the valley; entry and exit join the relief.
    const bridgeStart=stationBase(f.at),bridgeEnd=stationBase(f.at+f.length);
    const deck=bridgeStart+(bridgeEnd-bridgeStart)*u+f.height*Math.sin(Math.PI*u)**2;
    rise+=deck-env.height(x,z);
   }
   feature=f.kind;break;
  }
  return {x,y:env.height(x,z)+rise+.10,z,along,lateral,bankDeg,feature};
 };
 const alongPoint=(distance:number)=>{
  const s=limit(distance,0,total);let lo=0,hi=parts.length-1;
  while(lo<hi){const mid=(lo+hi+1)>>1;if(parts[mid].start<=s)lo=mid;else hi=mid-1;}
  const p=parts[lo],t=limit((s-p.start)/p.len,0,1);
  return {x:p.x+p.dx*p.len*t,z:p.z+p.dz*p.len*t,dx:p.dx,dz:p.dz};
 };
 const stationBase=(s:number)=>{const p=alongPoint(s);return env.height(p.x,p.z);};
 const station=(s:number,lateral=0)=>{
  const p=alongPoint(s);const x=p.x+p.dz*lateral,z=p.z-p.dx*lateral;
  return surface(x,z,limit(s,0,total),lateral);
 };
 const sample=(x:number,z:number):TrackSample|null=>{
  let best=Infinity,closest:Part|null=null,bestT=0;
  for(const idx of cells.get(key(x,z))??[]){
   const p=parts[idx],t=limit(((x-p.x)*p.dx+(z-p.z)*p.dz)/p.len,0,1);
   const qx=p.x+p.dx*p.len*t,qz=p.z+p.dz*p.len*t,d=(x-qx)**2+(z-qz)**2;
   if(d<best){best=d;closest=p;bestT=t;}
  }
  if(!closest||best>(track.width/2)**2)return null;
  const lateral=(x-closest.x)*closest.dz-(z-closest.z)*closest.dx;
  return surface(x,z,closest.start+closest.len*bestT,lateral);
 };
 return {line,length:total,sample,station};
}
export interface TrackDiagnostic {severity:'WARNING'|'ERROR';code:string;message:string;distance:number}
export function trackDiagnostics(track:RaceTrack,env:TrackEnvironment):TrackDiagnostic[]{
 const s=createRaceTrackSampler(track,env),out:TrackDiagnostic[]=[];
 const line=s.line;
 // The authored bend is the reliable sharp-corner detector, even when its sampling
 // spacing aliases the short inside segment of a hairpin.
 for(let i=1;i<track.points.length-1;i++){
  const a=track.points[i-1],b=track.points[i],c=track.points[i+1];
  const ax=b.x-a.x,az=b.z-a.z,bx=c.x-b.x,bz=c.z-b.z;
  const lenA=Math.hypot(ax,az),lenB=Math.hypot(bx,bz);
  if(lenA<1e-5||lenB<1e-5)continue;
  const angle=Math.acos(limit((ax*bx+az*bz)/(lenA*lenB),-1,1));
  const radius=angle>1e-3?Math.min(lenA,lenB)/(2*Math.sin(angle/2)):Infinity;
  if(radius<track.width*.85){
   out.push({severity:'WARNING',code:'TRACK_TIGHT_TURN',message:'Virage trop serré pour une roulade rapide : élargir la courbe ou ajouter un relevé',distance:Math.round(line.at(-1)!.d*i/(track.points.length-1))});break;
  }
 }
 // In tight bends, classic flat wide roads may overlap: warn before placing a costly mesh.
 for(let i=3;i<line.length-3;i+=3){
  const a=line[i-3],b=line[i],c=line[i+3],ax=b.x-a.x,az=b.z-a.z,bx=c.x-b.x,bz=c.z-b.z;
  const angle=Math.abs(Math.atan2(ax*bz-az*bx,ax*bx+az*bz));
  const arc=Math.hypot(c.x-a.x,c.z-a.z)/2,radius=angle>1e-3?arc/angle:Infinity;
  if(radius<track.width*.85&&!out.some(d=>d.code==='TRACK_TIGHT_TURN')){out.push({severity:'WARNING',code:'TRACK_TIGHT_TURN',message:'Virage très serré : élargir la courbe ou ajouter un relevé',distance:b.d});break;}
 }
 for(let d=2;d<s.length;d+=3){
  const a=s.station(d-2,0),b=s.station(d,0),slope=Math.abs(b.y-a.y)/2;
  if(slope>1.05){out.push({severity:'ERROR',code:'TRACK_STEEP',message:'Pente trop raide pour la roulade',distance:d});break;}
 }
 return out;
}
