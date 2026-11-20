/**
 * Settlement poles (doc 104 §C6): several complementary villages per island,
 * each with a role (fishing, farming, mountain, forest, market, mine, resort),
 * a size and an architecture style. Sites are ranked by terrain fitness and
 * spacing, claimed in the land registry, planned with the native settlement
 * planner (optionally on graded terraces) and completed by a field belt for
 * farming roles. No new settlement engine: same recipes, locks and provenance.
 */
import type {ProjectDocument} from './types.ts';
import type {PlanDiagnostic} from './world-plan.ts';
import {ARCHITECTURE_STYLES,type ArchitectureStyleId,type PoleRole} from '../settlements/architecture.ts';
import {newSettlement,type SettlementRecipe} from '../settlements/schema.ts';
import {DEFAULT_SETTLEMENT_LAYOUT} from '../settlements/layout.ts';
import {planSettlement} from '../settlements/planner.ts';
import {applySettlement,previewSettlementProject} from '../settlements/authoring.ts';
import {validateSettlements} from '../settlements/validation.ts';
import {projectGeography} from './geo-context.ts';
import {classifyPoint} from '../geography/classify.ts';
import {terrainAccessContext} from './terrain-access.ts';
import {projectLandRegistry,type LandReservation} from './land-registry.ts';
import {discPolygon,fitPlane,putEarthworks,tryGradedPlan} from './earthworks-planner.ts';
import {defaultFarmSettings} from '../farm/farm-data.ts';
import {putZone} from './zones.ts';
import type {EarthworkV1} from '../geography/earthworks.ts';

export interface PoleRequest {role:PoleRole;size:'hamlet'|'village'|'town';architecture?:ArchitectureStyleId;name?:string}
export const POLE_SIZES={hamlet:{houses:8,radius:80,spacing:320},village:{houses:16,radius:115,spacing:420},town:{houses:28,radius:160,spacing:520}} as const;
const ACTIVITY:Record<PoleRole,SettlementRecipe['activity']>={port:'fishing',fishing:'fishing',farming:'agriculture',forest:'forest',mine:'mine',market:'commerce',mountain:'mixed',resort:'mixed'};
const NAMES:Record<PoleRole,string>={port:'Port',fishing:'Village de pêcheurs',farming:'Hameau agricole',forest:'Hameau forestier',mine:'Camp minier',market:'Bourg du marché',mountain:'Village de montagne',resort:'Station'};

interface Candidate {x:number;z:number;score:number}
/** Terrain fitness of a point for a role (higher is better, -Infinity = unusable). */
export function poleFitness(p:ProjectDocument,role:PoleRole,maxHeight:number){
 const geo=projectGeography(p).ctx,b=p.world.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2,diag=Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ);
 const mines=Object.values(p.libraries.zones??{}).filter(z=>z.kind==='mine').map(z=>({x:z.polygon.reduce((n,q)=>n+q.x,0)/z.polygon.length,z:z.polygon.reduce((n,q)=>n+q.z,0)/z.polygon.length}));
 const bases=Object.values(p.libraries.alpine??{}).map(a=>a.liftPath?.[0]??a.points[a.points.length-1]);
 return (x:number,z:number):number=>{
  const s=classifyPoint(geo,x,z);if(s.underwater||s.height<p.world.seaLevel+2||s.slope>.3)return -Infinity;
  const flat=1-s.slope/.3,rel=s.height/Math.max(1,maxHeight);
  switch(role){
   case 'fishing':case 'port':return s.coast>=25&&s.coast<=200&&s.height<35?2-s.coast/200+flat:-Infinity;
   case 'farming':return (s.biome==='meadow'||s.biome==='scrub'?1.5:s.biome==='forest'?.3:0)+flat*2-Math.max(0,rel-.35)*3+s.moisture*.5;
   case 'forest':return (s.biome==='forest'?2:0)+flat;
   case 'mountain':return rel>=.22?1+rel+flat:-Infinity;
   case 'market':return 2-Math.hypot(x-cx,z-cz)/diag*3+flat*1.5+(geo.riverDistance(x,z)<150?.8:0);
   case 'mine':return mines.length?3-Math.min(...mines.map(m=>Math.hypot(m.x-x,m.z-z)))/300+flat:rel>=.25?rel+flat+(s.geology==='rock'?.5:0):-Infinity;
   case 'resort':return bases.length?3-Math.min(...bases.map(q=>Math.hypot(q.x-x,q.z-z)))/250+flat:rel>=.35?rel+flat:-Infinity;
  }
 };
}

export interface PolePlacement {id:string;role:PoleRole;houses:number;center:{x:number;z:number};graded:boolean}
export function planPoles(p:ProjectDocument,requests:readonly PoleRequest[],o:{architecture?:ArchitectureStyleId;earthworks?:boolean;fieldBelt?:boolean}={}):{placed:PolePlacement[];diagnostics:PlanDiagnostic[]}{
 const placed:PolePlacement[]=[],diagnostics:PlanDiagnostic[]=[],b=p.world.bounds,geo=projectGeography(p).ctx;
 let maxHeight=0;for(let j=0;j<24;j++)for(let i=0;i<24;i++)maxHeight=Math.max(maxHeight,geo.height(b.minX+(b.maxX-b.minX)*(i+.5)/24,b.minZ+(b.maxZ-b.minZ)*(j+.5)/24));
 requests.forEach((req,index)=>{
  const size=POLE_SIZES[req.size],architecture=req.architecture??o.architecture,fit=poleFitness(p,req.role,maxHeight);
  const others=[...Object.values(p.libraries.settlements??{}).map(s=>s.recipe.center),...Object.values(p.chunks).flatMap(c=>Object.values(c.entities)).filter(e=>e.components.State?.initial.portN1Authored===true).map(e=>e.components.Transform!.position)];
  const cands:Candidate[]=[];
  for(let j=1;j<28;j++)for(let i=1;i<28;i++){
   const x=b.minX+(b.maxX-b.minX)*i/28,z=b.minZ+(b.maxZ-b.minZ)*j/28;
   if(x-size.radius<b.minX||x+size.radius>b.maxX||z-size.radius<b.minZ||z+size.radius>b.maxZ)continue;
   if(others.some(q=>Math.hypot(q.x-x,q.z-z)<size.spacing))continue;
   const score=fit(x,z);if(Number.isFinite(score))cands.push({x,z,score});
  }
  cands.sort((a,c)=>c.score-a.score||a.x-c.x||a.z-c.z);
  const registry=projectLandRegistry(p),id='pole-'+req.role+'-'+index;
  let best:{plan:ReturnType<typeof planSettlement>;project:ProjectDocument;work?:EarthworkV1;center:{x:number;z:number}}|null=null;
  for(const cand of cands.slice(0,8)){
   const claim:LandReservation={id:'candidate:'+id,use:'settlement',shape:{kind:'polygon',points:discPolygon(cand,size.radius*.8)},owner:{kind:'settlement',id},priority:70,clearanceM:4};
   if(registry.conflictsWith(claim).length)continue;
   const pattern=architecture?ARCHITECTURE_STYLES[architecture].patterns[req.role]??'organic':req.role==='fishing'?'fishing':req.role==='mountain'?'mountain':'organic';
   const plane=fitPlane(geo.height,cand,size.radius*.6),orientation=Math.round(Math.atan2(plane.gx,plane.gz)*180/Math.PI);
   const r:SettlementRecipe={...newSettlement(p.world,id,{x:cand.x,z:cand.z}),name:req.name??NAMES[req.role],form:req.size,targetBuildings:size.houses,radius:size.radius,orientation,
    activity:ACTIVITY[req.role],services:true,localLife:true,residentRoutines:true,variedServices:true,cultivation:req.role==='farming'||req.size!=='hamlet',
    seed:(p.world.seed+index*7919)>>>0,role:req.role,...(architecture?{architecture}:{}),layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern}};
   const valid=(project:ProjectDocument,plan:ReturnType<typeof planSettlement>)=>!plan.diagnostics.some(d=>d.severity==='ERROR')&&!validateSettlements(previewSettlementProject(project,plan)).some(d=>d.severity==='ERROR');
   let plan=planSettlement(p,r),project=p,work:EarthworkV1|undefined;
   if(o.earthworks&&plan.buildings.length<r.targetBuildings){
    const c=terrainAccessContext(p),graded=tryGradedPlan(p,cand,r.radius*.8,r.id,c.source,q=>planSettlement(q,r),valid,c.wet,{budgetM:6,protectedPoints:Object.values(p.entityIndex).map(e=>e.position)});
    if(graded&&graded.plan.buildings.length>plan.buildings.length){plan=graded.plan;project=graded.project;work=graded.work;}
   }
   if(!valid(project,plan)||plan.buildings.length<4||best&&plan.buildings.length<=best.plan.buildings.length)continue;
   best={plan,project,work,center:{x:cand.x,z:cand.z}};if(plan.buildings.length===r.targetBuildings)break;
  }
  if(!best){diagnostics.push({severity:'WARNING',code:'POLE_MISSING',message:`${NAMES[req.role]} (${req.size}) : aucun site praticable et libre trouvé.`});return;}
  if(best.work)putEarthworks(p,[best.work]);
  applySettlement(p,best.plan);
  placed.push({id,role:req.role,houses:best.plan.buildings.length,center:best.center,graded:!!best.work});
  if(best.plan.buildings.length<size.houses)diagnostics.push({severity:'WARNING',code:'POLE_PARTIAL',message:`${NAMES[req.role]} : ${best.plan.buildings.length}/${size.houses} maisons.`});
  if(o.fieldBelt!==false&&req.role==='farming'){const belt=planFieldBelt(p,id,req.size==='hamlet'?3:req.size==='village'?5:7);if(belt.fields===0)diagnostics.push({severity:'WARNING',code:'POLE_FIELDS_MISSING',message:NAMES[req.role]+' : aucun champ de ceinture sur un terrain assez doux.'});}
 });
 return {placed,diagnostics};
}

/**
 * Field belt around a farming pole: large NPC fields (≈26 × 34 m) outside the
 * village footprint, oriented along the contour, on gentle ground, never on
 * roads, water, pistes or other zones. Fields are ordinary farm-plot zones.
 */
export function planFieldBelt(p:ProjectDocument,settlementId:string,count:number):{fields:number}{
 const s=p.libraries.settlements?.[settlementId];if(!s)return {fields:0};
 const geo=projectGeography(p).ctx,c=terrainAccessContext(p),registry=projectLandRegistry(p),paths=Object.values(p.libraries.paths);
 const crops=['wheat','carrot','pumpkin'] as const;let fields=0;
 const halfW=13,halfD=17;
 for(let ring=0;ring<3&&fields<count;ring++)for(let k=0;k<24&&fields<count;k++){
  const a=k/24*Math.PI*2+ring*.13,d=s.recipe.radius*(1+ring*.35)+halfD+8,center={x:s.recipe.center.x+Math.cos(a)*d,z:s.recipe.center.z+Math.sin(a)*d};
  const plane=fitPlane(geo.height,center,halfD,4),slope=Math.hypot(plane.gx,plane.gz);if(slope>.1)continue;
  // Long side along the contour (rows follow the slope lines like real terraces).
  const yaw=slope>1e-4?Math.atan2(plane.gz,plane.gx):a,cs=Math.cos(yaw),sn=Math.sin(yaw);
  const polygon=[[-halfD,-halfW],[halfD,-halfW],[halfD,halfW],[-halfD,halfW]].map(([u,v])=>({x:Math.round((center.x+u*-sn+v*cs)*100)/100,z:Math.round((center.z+u*cs+v*sn)*100)/100}));
  const b=p.world.bounds;if(polygon.some(q=>q.x<b.minX+2||q.x>b.maxX-2||q.z<b.minZ+2||q.z>b.maxZ-2))continue;
  if([center,...polygon].some(q=>c.wet(q.x,q.z)||geo.height(q.x,q.z)<p.world.seaLevel+1.5))continue;
  const id=settlementId+'-belt-'+fields,claim:LandReservation={id:'zone:'+id,use:'farm',shape:{kind:'polygon',points:polygon},owner:{kind:'zone',id},priority:60,clearanceM:3};
  if(registry.conflictsWith(claim).some(x=>x.useB!=='settlement'))continue;
  if(Object.values(p.libraries.zones??{}).some(z=>z.polygon.some(q=>Math.hypot(q.x-center.x,q.z-center.z)<halfD+6)))continue;
  if(paths.some(path=>path.points.some((q,i)=>{if(!i)return Math.hypot(q.x-center.x,q.z-center.z)<halfD+path.width;const a2=path.points[i-1],dx=q.x-a2.x,dz=q.z-a2.z,t=Math.max(0,Math.min(1,((center.x-a2.x)*dx+(center.z-a2.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(a2.x+dx*t-center.x,a2.z+dz*t-center.z)<halfD+path.width/2+2;})))continue;
  const crop=crops[fields%crops.length];
  putZone(p,{id,kind:'farm-plot',name:'Champ de la ceinture '+(fields+1),polygon,farm:{...defaultFarmSettings(polygon),assignment:'npc',initialCrop:crop,rowAngle:yaw}});
  registry.add(claim);fields++;
 }
 return {fields};
}
