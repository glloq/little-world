/** Deterministic bounded placement search for rolling tracks on actual authored terrain.
 * No Three.js, DOM, physics singleton, wall clock or nondeterministic random. */
import {createRaceTrackSampler,trackDiagnostics,validateRaceTrack,type RaceTrack,type TrackFeature} from '../gameplay/race-track.ts';
import {makeTrackFeature} from '../gameplay/race-track-presets.ts';
import {sourceRaceKey} from './race-authoring.ts';
import type {RaceDefinition,RaceGate} from '../gameplay/races.ts';
import type {WorldDefinitionV3} from './types.ts';
export type PlacementStyle='downhill'|'flat';
export interface PointXZ {x:number;z:number}
export interface RaceTerrainEnvironment {
 bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
 seaLevel:number;
 height(x:number,z:number):number;
 water(x:number,z:number,height:number):number|null;
 /** Existing buildings, reserved zones, paths, source-owned tracks and author exclusions. */
 occupation(x:number,z:number):string;
}
export interface PlacementRequest {
 anchor:PointXZ;style:PlacementStyle;
 targetLength?:number;width?:number;radius?:number;maxResults?:number;seed?:number;
}
export type PlacementCode='OUTSIDE'|'WATER'|'OCCUPIED'|'STEEP'|'CROSS_SLOPE'|'RELIEF'|'TOO_FLAT'|'TOO_STEEP'|'LAUNCH'|'GEOMETRY';
export interface PlacementIssue {code:PlacementCode;distance:number;message:string}
export interface PlacementMetrics {lengthM:number;dropM:number;maxSlope:number;maxCrossSlope:number;meanSlope:number}
export interface PlacementCheck {valid:boolean;issues:PlacementIssue[];metrics:PlacementMetrics;score:number}
export interface PlacementCandidate {track:RaceTrack;style:PlacementStyle;score:number;metrics:PlacementMetrics;notes:string[];index:number}
export interface PlacementSearch {candidates:PlacementCandidate[];checked:number;rejected:Partial<Record<PlacementCode,number>>}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const rnd=(seed:number)=>{let s=seed>>>0;return()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};};
const dist=(a:PointXZ,b:PointXZ)=>Math.hypot(a.x-b.x,a.z-b.z);
const issue=(code:PlacementCode,distance:number,message:string):PlacementIssue=>({code,distance,message});
/** Corridor check includes edges and physical landing distances, never just line control points.
 * Restricting occupation to NONE is intentionally conservative: no implicit clearing of farms,
 * built plots, existing routes, or registered race tracks. */
export function inspectRaceTerrain(track:RaceTrack,env:RaceTerrainEnvironment,style:PlacementStyle):PlacementCheck{
 const empty:PlacementMetrics={lengthM:0,dropM:0,maxSlope:0,maxCrossSlope:0,meanSlope:0};
 try{validateRaceTrack(track,env.bounds);}catch(e){
  return {valid:false,issues:[issue('GEOMETRY',0,String(e instanceof Error?e.message:e))],metrics:empty,score:0};
 }
 const sampler=createRaceTrackSampler(track,{height:env.height}),length=sampler.length;
 const issues:PlacementIssue[]=[],width=track.width,margin=2;
 let maxSlope=0,maxCross=0,sumSlope=0,prevHeight=NaN;
 const step=5,count=Math.ceil(length/step),edge=width/2+margin;
 let first=0,last=0;
 for(let i=0;i<=count;i++){
  const d=length*i/count,base=sampler.station(d,0),h=env.height(base.x,base.z);
  if(i===0)first=h;if(i===count)last=h;
  if(!Number.isFinite(h)){issues.push(issue('RELIEF',d,'Altitude du relief non définie'));break;}
  if(Number.isFinite(prevHeight)){
   const slope=Math.abs(h-prevHeight)/(length/count);
   maxSlope=Math.max(maxSlope,slope);sumSlope+=slope;
   if(slope>(style==='flat'?.31:.62)){issues.push(issue('STEEP',d,'Pente trop forte sur la trajectoire'));break;}
  }
  prevHeight=h;
  const left=sampler.station(d,-edge),right=sampler.station(d,edge);
  const cross=Math.abs(env.height(left.x,left.z)-env.height(right.x,right.z))/(2*edge);
  maxCross=Math.max(maxCross,cross);
  if(!Number.isFinite(cross)||cross>.36){issues.push(issue('CROSS_SLOPE',d,'Dévers naturel excessif à travers la piste'));break;}
  for(const q of [left,base,right]){
   if(q.x<env.bounds.minX+4||q.x>env.bounds.maxX-4||q.z<env.bounds.minZ+4||q.z>env.bounds.maxZ-4){
    issues.push(issue('OUTSIDE',d,'Emprise trop proche de la limite de l’île'));break;
   }
   const floor=env.height(q.x,q.z),water=env.water(q.x,q.z,floor);
   if(!Number.isFinite(floor)||floor<=env.seaLevel+.75||water!==null&&water>floor+.08){
    issues.push(issue('WATER',d,'Zone inondée, submergée ou trop proche du niveau marin'));break;
   }
   const occupancy=env.occupation(q.x,q.z);
   if(occupancy!=='none'){issues.push(issue('OCCUPIED',d,'Zone déjà réservée ou occupée : '+occupancy));break;}
  }
  if(issues.length)break;
 }
 const drop=first-last,meanSlope=sumSlope/Math.max(1,count),metrics={lengthM:length,dropM:drop,maxSlope,maxCrossSlope:maxCross,meanSlope};
 if(!issues.length){
  if(style==='downhill'&&drop<Math.max(5,length*.035))issues.push(issue('TOO_FLAT',length,'Dénivelé insuffisant pour une descente'));
  if(style==='flat'&&Math.abs(drop)>Math.max(9,length*.07))issues.push(issue('TOO_STEEP',length,'Trop de dénivelé pour une piste plate'));
 }
 if(!issues.length){
  for(const f of track.features)if(f.kind==='ramp'){
   if(f.at+f.length+18>length-4){issues.push(issue('LAUNCH',f.at,'Réception trop proche de la fin de piste'));break;}
   const before=sampler.station(f.at+f.length+4,0),after=sampler.station(f.at+f.length+18,0);
   if(Math.abs(after.y-before.y)>7){issues.push(issue('LAUNCH',f.at,'Réception trop irrégulière'));break;}
   // Nearest ground outside the modifier at the landing zone must remain walkable.
   for(let s=f.at+f.length+5;s<=f.at+f.length+18;s+=5){
    const q=sampler.station(s,0),terrain=env.height(q.x,q.z);
    if(terrain<env.seaLevel+.75||env.water(q.x,q.z,terrain)!==null&&env.water(q.x,q.z,terrain)!>terrain+.08){
     issues.push(issue('LAUNCH',s,'Réception sur l’eau'));break;
    }
   }
   if(issues.length)break;
  }
 }
 if(!issues.length&&trackDiagnostics(track,{height:env.height}).some(d=>d.severity==='ERROR'))
  issues.push(issue('STEEP',0,'Module ou terrain trop abrupt selon le diagnostic de piste'));
 const suitability=style==='downhill'?
  clamp((drop-5)/28,0,1):1-clamp(Math.abs(drop)/18,0,1);
 const score=clamp(Math.round(100*(.45*suitability+.22*(1-maxSlope/.62)+.2*(1-maxCross/.36)+.13*(1-meanSlope/.45))),0,100);
 return {valid:!issues.length,issues,metrics,score:issues.length?0:score};
}
function generateCoursePoints(origin:PointXZ,heading:number,length:number,phase:number):PointXZ[]{
 const count=6,dir={x:Math.sin(heading),z:Math.cos(heading)},side={x:dir.z,z:-dir.x};
 const points:PointXZ[]=[];
 for(let i=0;i<=count;i++){
  const d=length*i/count,offset=i===0||i===count?0:Math.sin(i*1.13+phase)*9.5;
  points.push({x:Math.round((origin.x+dir.x*d+side.x*offset)*100)/100,
               z:Math.round((origin.z+dir.z*d+side.z*offset)*100)/100});
 }
 return points;
}
function installSafeFeatures(base:RaceTrack,env:RaceTerrainEnvironment,style:PlacementStyle):{track:RaceTrack;notes:string[]}{
 const sampler=createRaceTrackSampler(base,{height:env.height}),length=sampler.length;
 const notes:string[]=[],features:TrackFeature[]=[];
 const use=(kind:TrackFeature['kind'],at:number,len:number,height:number,bankDeg?:number)=>{
  const feature=makeTrackFeature(kind,Math.round(at*100)/100,Math.round(len*100)/100,'feature:auto-'+features.length);
  const candidate={...feature,height,...(bankDeg!==undefined?{bankDeg}:{})};
  const proposed={...base,features:[...features,candidate]};
  if(!inspectRaceTerrain(proposed,env,style).valid)return false;
  features.push(candidate);return true;
 };
 // Bank only if a turn actually exists: no pointless inclinations on straight sections.
 let turn:{at:number;amount:number;sign:number}|null=null;
 for(let i=1;i<base.points.length-1;i++){
  const a=base.points[i-1],b=base.points[i],c=base.points[i+1],ax=b.x-a.x,az=b.z-a.z,bx=c.x-b.x,bz=c.z-b.z;
  const delta=Math.atan2(ax*bz-az*bx,ax*bx+az*bz),mag=Math.abs(delta);
  if(mag>.16&&(!turn||mag>turn.amount)){
   const nearest=sampler.line.reduce((best,q)=>dist(q,b)<dist(best,b)?q:best,sampler.line[0]);
   turn={at:nearest.d,amount:mag,sign:Math.sign(delta)};
  }
 }
 if(turn&&use('bank',clamp(turn.at-10,8,length-30),20,0,turn.sign*clamp(Math.round(turn.amount*40),12,24)))
  notes.push('Virage relevé placé sur la courbe principale');
 if(use('bumps',length*.28,12,style==='flat'?.55:.38))notes.push('Bosses progressives');
 // Deck only when it bridges a genuine dry hollow, never a sea crossing by assumption.
 let bridgeAt=-1,deepest=0;
 for(let d=34;d<length-35;d+=6){
  const before=sampler.station(d-9,0),after=sampler.station(d+9,0),middle=sampler.station(d,0);
  const trough=(env.height(before.x,before.z)+env.height(after.x,after.z))/2-env.height(middle.x,middle.z);
  if(trough>Math.max(1.3,deepest)){deepest=trough;bridgeAt=d-9;}
 }
 if(bridgeAt>=0&&use('bridge',bridgeAt,18,.7))notes.push('Passerelle au-dessus d’un creux sec');
 if(use('ramp',length*.68,10,style==='flat'?1.25:1.45))notes.push('Tremplin avec espace de réception vérifié');
 const track={...base,features};
 return {track,notes};
}
export function findRaceTerrainPlacements(env:RaceTerrainEnvironment,request:PlacementRequest):PlacementSearch{
 const anchor=request.anchor,style=request.style;
 if(!anchor||!Number.isFinite(anchor.x)||!Number.isFinite(anchor.z)||!['downhill','flat'].includes(style))
  throw Error('Recherche de circuits : paramètres invalides');
 const radius=clamp(request.radius??230,60,450),length=clamp(request.targetLength??210,90,360),
       width=clamp(request.width??8,5,12),results=clamp(Math.round(request.maxResults??3),1,5);
 const rand=rnd((request.seed??29371)>>>0);
 const proposed:PlacementCandidate[]=[],rejected:Partial<Record<PlacementCode,number>>={};
 let checked=0;
 for(let site=0;site<12;site++){
  const angle=site*2.399963229728653,offset=site===0?0:40+((site*37)%Math.max(50,radius-35));
  const origin={x:anchor.x+Math.sin(angle)*offset,z:anchor.z+Math.cos(angle)*offset};
  const sample=(x:number,z:number)=>env.height(x,z);
  const gx=(sample(origin.x+14,origin.z)-sample(origin.x-14,origin.z))/28;
  const gz=(sample(origin.x,origin.z+14)-sample(origin.x,origin.z-14))/28;
  if(!Number.isFinite(gx)||!Number.isFinite(gz))continue;
  const direction=style==='downhill'&&Math.hypot(gx,gz)>.025?Math.atan2(-gx,-gz):angle;
  for(const delta of [-.42,0,.42]){
   for(let variation=0;variation<2;variation++){
    checked++;
    const heading=direction+delta+(style==='flat'?variation*Math.PI/4:0),
          points=generateCoursePoints(origin,heading,length,(rand()-.5)*1.25+variation*.9),
          base:RaceTrack={width,material:'dirt',smooth:true,points,features:[]};
    const check=inspectRaceTerrain(base,env,style);
    if(!check.valid){const code=check.issues[0].code;rejected[code]=(rejected[code]??0)+1;continue;}
    const installed=installSafeFeatures(base,env,style),verified=inspectRaceTerrain(installed.track,env,style);
    if(!verified.valid)continue;
    const score=verified.score+(style==='downhill'?Math.min(8,check.metrics.dropM/5):0)+installed.track.features.length*2;
    proposed.push({style,track:installed.track,index:checked,score:Math.round(score),metrics:verified.metrics,notes:installed.notes});
   }
  }
 }
 proposed.sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected:PlacementCandidate[]=[];
 for(const c of proposed){
  const start=c.track.points[0];
  if(selected.some(p=>dist(start,p.track.points[0])<42&&dist(c.track.points.at(-1)!,p.track.points.at(-1)!)<72))continue;
  selected.push(c);if(selected.length>=results)break;
 }
 return {candidates:selected,checked,rejected};
}
/** Converts a preview to an immutable, versioned Studio race only on explicit user acceptance. */
export function raceFromTerrainPlacement(world:WorldDefinitionV3,id:string,name:string,proposal:PlacementCandidate,
 env:RaceTerrainEnvironment):RaceDefinition{
 const track=structuredClone(proposal.track),sampler=createRaceTrackSampler(track,{height:env.height}),length=sampler.length;
 const distances=[12,length*.26,length*.49,length*.74,length-12];
 const gates:RaceGate[]=distances.map((d,i)=>{
  const q=sampler.station(d,0),a=sampler.station(Math.max(0,d-3),0),b=sampler.station(Math.min(length,d+3),0);
  const dx=b.x-a.x,dz=b.z-a.z,m=Math.hypot(dx,dz);
  return {id:'gate-'+(i+1),center:{x:q.x,y:q.y+1.6,z:q.z},
    normal:{x:dx/m,y:0,z:dz/m},shape:'rectangle',width:track.width+1,height:4.8,
    allowedModes:['roll']};
 });
 const race:RaceDefinition={id,name,version:1,kind:'roll',classification:'practice',worldId:world.worldId,
  gates,track,maxTicks:30*180,startOnFirstGate:true,layoutKey:''};
 race.layoutKey=sourceRaceKey(race);
 return race;
}
