import type {WelcomeActivity} from './map-requirements.ts';
import type {EarthworkV1} from '../geography/earthworks.ts';
import {putEarthworks,tryGradedPlan} from './earthworks-planner.ts';
import {terrainAccessContext} from './terrain-access.ts';
import type {ProjectDocument} from './types.ts';import type {PortN1Layout} from '../archipelago/port-n1-plan.ts';import {newSettlement} from '../settlements/schema.ts';import {DEFAULT_SETTLEMENT_LAYOUT} from '../settlements/layout.ts';import {planSettlement} from '../settlements/planner.ts';import {applySettlement,previewSettlementProject} from '../settlements/authoring.ts';import {validateSettlements} from '../settlements/validation.ts';
/** `grading`: when the ground is too uneven, terrace the site within a cut/fill budget (doc 104 §C4). */
export function generateWelcomeVillage(p:ProjectDocument,port:PortN1Layout,size:'hamlet'|'village',activity:WelcomeActivity='fishing',grading=false){
 const co=Math.cos(port.heading),si=Math.sin(port.heading);let best:ReturnType<typeof planSettlement>|null=null,bestWork:EarthworkV1|undefined;
 search:for(const inland of [35,60,90,125,160])for(const side of [0,-35,35]){const center={x:port.shore.x+side*co-inland*si,z:port.shore.z-side*si-inland*co},r={...newSettlement(p.world,'composition-welcome-village',center),form:size,targetBuildings:size==='hamlet'?12:24,radius:size==='hamlet'?95:135,routeToPath:'composition-port-approach',cultivation:true,waterfront:true,services:true,localLife:true,residentRoutines:true,variedServices:true,activity,layout:{...DEFAULT_SETTLEMENT_LAYOUT,pattern:'network' as const}};
  if(center.x<p.world.bounds.minX||center.x>p.world.bounds.maxX||center.z<p.world.bounds.minZ||center.z>p.world.bounds.maxZ)continue;
  const valid=(project:ProjectDocument,plan:ReturnType<typeof planSettlement>)=>!plan.diagnostics.some(d=>d.severity==='ERROR')&&!validateSettlements(previewSettlementProject(project,plan)).some(d=>d.severity==='ERROR');
  let plan=planSettlement(p,r),project=p,work:EarthworkV1|undefined;
  if(grading&&plan.buildings.length<r.targetBuildings){
   const c=terrainAccessContext(p),graded=tryGradedPlan(p,center,r.radius*.8,r.id,c.source,q=>planSettlement(q,r),valid,c.wet,{budgetM:6,protectedPoints:Object.values(p.entityIndex).map(e=>e.position)});
   if(graded&&graded.plan.buildings.length>plan.buildings.length){plan=graded.plan;project=graded.project;work=graded.work;}
  }
  if(best&&plan.buildings.length<=best.buildings.length||!valid(project,plan))continue;best=plan;bestWork=work;if(plan.buildings.length===r.targetBuildings)break search;
 }if(best&&best.buildings.length>=4){if(bestWork)putEarthworks(p,[bestWork]);applySettlement(p,best);return best.buildings.length;}return 0;
}
