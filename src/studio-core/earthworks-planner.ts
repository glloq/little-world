/**
 * Earthworks planner (doc 104 §C4): choose a site that is "good enough", then
 * adapt the ground inside a cut/fill budget instead of rejecting the slope.
 * Writes analytic works into `world.terrain.archipelago.earthworks` with ids
 * prefixed by their owner, so regeneration replaces only its own grading and
 * manual relief edits are never touched.
 */
import type {ProjectDocument} from './types.ts';
import type {EarthworkV1,PointXZ} from '../geography/earthworks.ts';
import {compileEarthworks,terraceLevel} from '../geography/earthworks.ts';

export interface GradingOptions {
 /** Largest average slope that terraces may absorb (rise/run). */
 maxSlope?:number;
 /** Largest vertical change (m) allowed anywhere inside the footprint. */
 budgetM?:number;
 /** Terrace pitch along the slope (tread + riser). */
 depthM?:number;
 /** Steepest riser slope, kept walkable by the native path rules (0.35). */
 riserSlope?:number;
 talusM?:number;
 /** Below this average slope a single flat pad is used. */
 padSlope?:number;
}
export interface GradingReport {slope:number;maxCutM:number;maxFillM:number;meanChangeM:number;samples:number}
export type GradingResult={ok:true;work:EarthworkV1;report:GradingReport}|{ok:false;code:string;message:string;report?:GradingReport};

/** Regular polygon approximating a disc (deterministic, rounded to the cm). */
export function discPolygon(c:PointXZ,radius:number,count=24):PointXZ[]{
 return Array.from({length:count},(_,i)=>{const a=i/count*Math.PI*2;return {x:Math.round((c.x+Math.cos(a)*radius)*100)/100,z:Math.round((c.z+Math.sin(a)*radius)*100)/100};});
}
function samplesIn(c:PointXZ,radius:number,step:number):PointXZ[]{
 const out:PointXZ[]=[];for(let z=-radius;z<=radius;z+=step)for(let x=-radius;x<=radius;x+=step)if(x*x+z*z<=radius*radius)out.push({x:c.x+x,z:c.z+z});return out;
}
/** Least-squares plane h = a + b·dx + c·dz around the centre. */
export function fitPlane(height:(x:number,z:number)=>number,c:PointXZ,radius:number,step=4):{a:number;gx:number;gz:number}{
 let n=0,sx=0,sz=0,sh=0,sxx=0,szz=0,sxz=0,sxh=0,szh=0;
 for(const q of samplesIn(c,radius,step)){const dx=q.x-c.x,dz=q.z-c.z,h=height(q.x,q.z);n++;sx+=dx;sz+=dz;sh+=h;sxx+=dx*dx;szz+=dz*dz;sxz+=dx*dz;sxh+=dx*h;szh+=dz*h;}
 const mx=sx/n,mz=sz/n,mh=sh/n,cxx=sxx/n-mx*mx,czz=szz/n-mz*mz,cxz=sxz/n-mx*mz,cxh=sxh/n-mx*mh,czh=szh/n-mz*mh,det=cxx*czz-cxz*cxz||1;
 const gx=(cxh*czz-czh*cxz)/det,gz=(czh*cxx-cxh*cxz)/det;return {a:mh-gx*mx-gz*mz,gx,gz};
}

/** Grade a disc for a settlement or activity: flat pad on gentle ground, terraces on slopes. */
export function planSiteGrading(id:string,height:(x:number,z:number)=>number,sea:number,center:PointXZ,radiusM:number,o:GradingOptions={}):GradingResult{
 const maxSlope=o.maxSlope??.22,budget=o.budgetM??4,depth=o.depthM??16,riserSlope=o.riserSlope??.3,talus=o.talusM??10,padSlope=o.padSlope??.035;
 const plane=fitPlane(height,center,radiusM),slope=Math.hypot(plane.gx,plane.gz),polygon=discPolygon(center,radiusM),level=Math.round((plane.a-sea)*100)/100;
 let work:EarthworkV1;
 if(slope<=padSlope)work={id,kind:'pad',polygon,levelM:level,talusM:talus};
 else{
  if(slope>maxSlope)return {ok:false,code:'GRADING_TOO_STEEP',message:`Pente moyenne ${Math.round(slope*100)} % : au-delà de ${Math.round(maxSlope*100)} % les terrasses ne restent pas praticables.`};
  const step=slope*depth,riser=Math.max(1,step/riserSlope);
  if(riser>depth*.6)return {ok:false,code:'GRADING_TOO_STEEP',message:'Les contremarches seraient plus larges que les terrasses : réduire la pente ou augmenter la profondeur.'};
  // Origin half a tread uphill so the centre sits mid-terrace.
  const dirX=-plane.gx/slope,dirZ=-plane.gz/slope,tread=depth-riser,origin={x:Math.round((center.x-dirX*tread/2)*100)/100,z:Math.round((center.z-dirZ*tread/2)*100)/100};
  // Tread at the plane height of the centre balances cut and fill over one pitch.
  work={id,kind:'terraces',polygon,origin,levelM:level,dirX:Math.round(dirX*1e6)/1e6,dirZ:Math.round(dirZ*1e6)/1e6,slope:Math.round(slope*1e4)/1e4,depthM:depth,riserM:Math.round(riser*100)/100,talusM:talus};
  // Renormalise after rounding so validation (unit direction) holds.
  const n=Math.hypot(work.dirX,work.dirZ);work.dirX/=n;work.dirZ/=n;
 }
 const report=gradingReport(work,height,sea,center,radiusM);
 if(Math.max(report.maxCutM,report.maxFillM)>budget)return {ok:false,code:'GRADING_BUDGET',message:`Terrassement de ${Math.round(Math.max(report.maxCutM,report.maxFillM)*10)/10} m : au-delà du budget de ${budget} m.`,report};
 return {ok:true,work,report};
}
export function gradingReport(w:EarthworkV1,height:(x:number,z:number)=>number,sea:number,center:PointXZ,radiusM:number):GradingReport{
 let cut=0,fill=0,sum=0,n=0;
 const target=(x:number,z:number)=>w.kind==='pad'?sea+w.levelM:w.kind==='terraces'?sea+terraceLevel(w,x,z):NaN;
 for(const q of samplesIn(center,radiusM,4)){const d=target(q.x,q.z)-height(q.x,q.z);if(!Number.isFinite(d))continue;n++;sum+=Math.abs(d);if(d>0)fill=Math.max(fill,d);else cut=Math.max(cut,-d);}
 const plane=fitPlane(height,center,radiusM);
 return {slope:Math.round(Math.hypot(plane.gx,plane.gz)*1e4)/1e4,maxCutM:Math.round(cut*100)/100,maxFillM:Math.round(fill*100)/100,meanChangeM:n?Math.round(sum/n*100)/100:0,samples:n};
}

/** Road/track bed following a polyline with a bounded grade (cut and fill). */
export function planCorridorGrading(id:string,height:(x:number,z:number)=>number,sea:number,points:readonly PointXZ[],widthM:number,o:{maxGrade?:number;talusM?:number}={}):EarthworkV1{
 const maxGrade=o.maxGrade??.12,raw=points.map(p=>height(p.x,p.z)-sea),levels=[...raw];
 // Two passes clamp the grade between consecutive points, then smooth lightly.
 for(let pass=0;pass<2;pass++){
  for(let i=1;i<levels.length;i++){const d=Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z)*maxGrade;levels[i]=Math.max(levels[i-1]-d,Math.min(levels[i-1]+d,levels[i]));}
  for(let i=levels.length-2;i>=0;i--){const d=Math.hypot(points[i].x-points[i+1].x,points[i].z-points[i+1].z)*maxGrade;levels[i]=Math.max(levels[i+1]-d,Math.min(levels[i+1]+d,levels[i]));}
 }
 return {id,kind:'corridor',points:points.map(p=>({x:Math.round(p.x*100)/100,z:Math.round(p.z*100)/100})),levels:levels.map(v=>Math.round(v*100)/100),widthM,talusM:o.talusM??Math.max(3,widthM)};
}

function archipelago(p:ProjectDocument){if(p.world.terrain?.kind!=='archipelago')throw Error('Terrassement : relief archipel requis');return p.world.terrain.archipelago;}
export function projectEarthworks(p:ProjectDocument):EarthworkV1[]{return p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.earthworks??[]:[];}
/** Insert or replace works (by id), keeping the order of existing ones. */
export function putEarthworks(p:ProjectDocument,works:readonly EarthworkV1[]):void{
 const a=archipelago(p),list=[...(a.earthworks??[])];
 for(const w of works){const i=list.findIndex(x=>x.id===w.id);if(i>=0)list[i]=structuredClone(w);else list.push(structuredClone(w));}
 a.earthworks=list;
}
/** Remove the works owned by a prefix (e.g. 'settlement:composition-welcome-village:'). */
export function removeEarthworks(p:ProjectDocument,prefix:string):EarthworkV1[]{
 if(p.world.terrain?.kind!=='archipelago')return [];
 const a=p.world.terrain.archipelago,removed=(a.earthworks??[]).filter(w=>w.id.startsWith(prefix));
 if(removed.length){const kept=(a.earthworks??[]).filter(w=>!w.id.startsWith(prefix));if(kept.length)a.earthworks=kept;else delete a.earthworks;}
 return removed;
}
/** Graded height of a project's terrain from an ungraded height (preview without regenerating). */
export function gradedHeight(height:(x:number,z:number)=>number,sea:number,works:readonly EarthworkV1[]):(x:number,z:number)=>number{
 const earth=compileEarthworks(works,sea);return earth?(x,z)=>earth(x,z,height(x,z)):height;
}

/** Settlement site grading: plan as-is, and when houses are missing try again on graded terraces. */
export interface GradedSettlementPlan<P> {plan:P;work?:EarthworkV1;report?:GradingReport;diagnostic?:{code:string;message:string}}
export function settlementGradingId(settlementId:string){return 'settlement:'+settlementId+':site';}
export function tryGradedPlan<P extends {buildings:readonly unknown[];diagnostics:readonly {severity:string}[]}>(
 p:ProjectDocument,center:PointXZ,radiusM:number,settlementId:string,height:(x:number,z:number)=>number,
 plan:(project:ProjectDocument)=>P,accept:(project:ProjectDocument,plan:P)=>boolean,
 water:(x:number,z:number)=>boolean,o:GradingOptions&{protectedPoints?:readonly PointXZ[]}={}):GradedSettlementPlan<P>&{project:ProjectDocument}|null{
 const id=settlementGradingId(settlementId),sea=p.world.seaLevel;
 // Largest disc first; a smaller graded core still helps when the whole site exceeds the budget.
 for(const k of [1,.75,.55]){
  const radius=radiusM*k,r=planSiteGrading(id,height,sea,center,radius,o);if(!r.ok)continue;
  const reach=radius+(r.work.kind==='corridor'?0:r.work.talusM);
  // Never regrade river banks or lake shores: the water profile owns them.
  let blocked=false;
  for(let a=0;a<32&&!blocked;a++)for(const f of [.35,.7,1])if(water(center.x+Math.cos(a/32*Math.PI*2)*reach*f,center.z+Math.sin(a/32*Math.PI*2)*reach*f)){blocked=true;break;}
  // Never move the ground under objects that already exist (port, other villages, manual props).
  const graded=gradedHeight(height,sea,[r.work]);
  if(!blocked)for(const q of o.protectedPoints??[])if(Math.hypot(q.x-center.x,q.z-center.z)<=reach&&Math.abs(graded(q.x,q.z)-height(q.x,q.z))>.03){blocked=true;break;}
  if(blocked)continue;
  const project=structuredClone(p);removeEarthworks(project,id);putEarthworks(project,[r.work]);
  const candidate=plan(project);if(candidate.diagnostics.some(d=>d.severity==='ERROR')||!accept(project,candidate))continue;
  return {plan:candidate,work:r.work,report:r.report,project};
 }
 return null;
}
