/**
 * Activity planners behind one contract (doc 104 §C6). Each planner reads the
 * real terrain, writes ordinary authored data (alpine areas, races, surf zones,
 * shore stops) and reports what it could not place. Island builders and the
 * generic composition call the same functions, so a theme can request any
 * activity without island-specific code.
 */
import type {ProjectDocument} from './types.ts';
type SkiPoint={x:number;z:number};
import type {PortN1Layout} from '../archipelago/port-n1-plan.ts';
import type {PlanDiagnostic} from './world-plan.ts';
import {projectGeography} from './geo-context.ts';
import {putAuthoredRace,authoredRaceFromTrace} from './race-authoring.ts';
import {raceFromSkiArea,ALPINE_RACE_ID} from './ski-race.ts';
import {addAlpineStation} from './alpine-station.ts';
import {planAlpineResort} from './alpine-resort.ts';
import {MASK_GRID} from '../geography/layers.ts';
import {projectRaceTerrainEnvironment} from './race-terrain-context.ts';
import {planThreeSurfBeaches} from '../surf/surf-island-planner.ts';
import {addSurfShoreStops} from './surf-shore.ts';
import {buildCirculationGraph} from './circulation.ts';

export interface SummitShapingSpec {fromM:number;rangeM:number;scale:number;power:number}
/** Default shaping for a requested resort: gentler slopes above ~30 % of the summit altitude. */
export function resortShaping(summitAltitudeM:number):SummitShapingSpec{
 return {fromM:Math.round(Math.max(60,summitAltitudeM*.29)),rangeM:Math.round(Math.max(120,summitAltitudeM*.71)),scale:.45,power:1};
}

/**
 * Complete ski domain: replaces a prototype run by several validated pistes and
 * lifts on a monotone reshaped massif, a timed race on the main piste and the
 * resort chalet. Material masks above the snow line return to generated snow.
 */
export function planSkiResortActivity(project:ProjectDocument,o:{toward?:SkiPoint;shaping:SummitShapingSpec}){
 delete project.libraries.alpine;
 if(project.libraries.races)delete project.libraries.races[ALPINE_RACE_ID];
 const terrain=project.world.terrain;
 if(terrain?.kind!=='archipelago')throw Error('Domaine skiable : relief insulaire requis.');
 terrain.archipelago.summitShaping={...o.shaping};
 const plan=planAlpineResort(project,{toward:o.toward,shelfM:o.shaping.fromM});
 project.libraries.alpine=Object.fromEntries(plan.areas.map(a=>[a.id,a]));
 const area=project.libraries.alpine['composition-alpine'];
 area.groomed=true;area.jumps=true;
 clearMaterialMasksAbove(project,plan.snowLineM-15);
 const race=raceFromSkiArea(project.world,area,projectGeography(project).ctx.height);
 putAuthoredRace(project,race);
 addAlpineStation(project,area);
 return {plan,area,race};
}

/** The composed regions paint generated materials everywhere; above the snow line the snow
 * classification must win, so those cells return to the generated value ('.'). */
export function clearMaterialMasksAbove(project:ProjectDocument,altitudeM:number){
 const {height}=projectGeography(project).ctx,size=project.world.chunkSizeM,b=project.world.bounds;
 for(const chunk of Object.values(project.chunks)){
  const mask=chunk.layers?.material;if(!mask)continue;
  const [cx,cz]=chunk.chunkId.split(':').map(Number),cells=mask.split('');let changed=false;
  for(let j=0;j<MASK_GRID;j++)for(let i=0;i<MASK_GRID;i++){
   const k=j*MASK_GRID+i;if(cells[k]==='.')continue;
   const x=b.minX+(cx+(i+.5)/MASK_GRID)*size,z=b.minZ+(cz+(j+.5)/MASK_GRID)*size;
   if(height(x,z)>=altitudeM){cells[k]='.';changed=true;}
  }
  if(changed)chunk.layers={...chunk.layers,material:cells.join('')};
 }
}

/** Three surf beaches (A/B/C) away from the port, with zones, features, timed races and shore stops. */
export function planSurfActivity(project:ProjectDocument,port:Pick<PortN1Layout,'shore'>,seed:number,shieldM=135){
 const env=projectRaceTerrainEnvironment(project),portShield=(x:number,z:number)=>
  Math.hypot(x-port.shore.x,z-port.shore.z)<shieldM?'port maritime réservé':env.occupation(x,z);
 const plan=planThreeSurfBeaches(env.height,project.world.bounds,project.world.seaLevel,seed,project.world.worldId,portShield);
 if(plan.beaches.length!==3)return {plan,giverId:null as string|null};
 project.libraries.surfZones=Object.fromEntries(plan.beaches.map(b=>[b.zone.id,b.zone]));
 project.libraries.surfFeatures=Object.fromEntries(plan.beaches.flatMap(b=>b.features.map(f=>[f.id,f])));
 for(const b of plan.beaches)putAuthoredRace(project,b.gates);
 const giverId=addSurfShoreStops(project,plan.beaches);
 return {plan,giverId};
}

export interface FlightCourseOptions {id?:string;name?:string;gates?:number;stepM?:number;glideRatio?:number;clearanceM?:number;accessM?:number}
/**
 * Terrain-guided glide course: launch from a high point reachable on foot,
 * then follow the descending relief (valleys, slopes toward the sea) with
 * rings on a glide line that keeps a clearance above the ground. Returns null
 * with a diagnostic when no launch keeps the clearance.
 */
export function planFlightCourse(project:ProjectDocument,o:FlightCourseOptions={}):{raceId:string;launch:{x:number;z:number;y:number};lengthM:number}|PlanDiagnostic{
 const h=projectGeography(project).ctx.height,b=project.world.bounds,sea=project.world.seaLevel;
 const gates=o.gates??8,step=o.stepM??70,ratio=o.glideRatio??6,clearance=o.clearanceM??10,accessM=o.accessM??260;
 const g=buildCirculationGraph(project),near=(x:number,z:number)=>g.nodes.some(q=>Math.hypot(q.x-x,q.z-z)<=accessM);
 const candidates:{x:number;z:number;y:number}[]=[];
 for(let j=1;j<24;j++)for(let i=1;i<24;i++){const x=b.minX+(b.maxX-b.minX)*i/24,z=b.minZ+(b.maxZ-b.minZ)*j/24,y=h(x,z);if(y>sea+30)candidates.push({x,z,y});}
 candidates.sort((a,c)=>c.y-a.y||a.x-c.x||a.z-c.z);
 const accessible=candidates.filter(c=>near(c.x,c.z)),ordered=[...accessible,...candidates.filter(c=>!near(c.x,c.z))].slice(0,40);
 const downhill=(x:number,z:number,r:number)=>{const gx=h(x+r,z)-h(x-r,z),gz=h(x,z+r)-h(x,z-r),n=Math.hypot(gx,gz);return n<1e-6?null:{x:-gx/n,z:-gz/n};};
 for(const launch of ordered){
  let dir=downhill(launch.x,launch.z,60);if(!dir)continue;
  const pts=[{x:launch.x,z:launch.z}];let x=launch.x,z=launch.z;
  for(let k=1;k<gates;k++){
   const d=downhill(x,z,50)??dir,turn=Math.atan2(dir.x*d.z-dir.z*d.x,dir.x*d.x+dir.z*d.z),limit=Math.PI*35/180,a=Math.max(-limit,Math.min(limit,turn)),c=Math.cos(a),s=Math.sin(a);
   dir={x:dir.x*c-dir.z*s,z:dir.x*s+dir.z*c};x+=dir.x*step;z+=dir.z*step;
   if(x<b.minX+20||x>b.maxX-20||z<b.minZ+20||z>b.maxZ-20)break;pts.push({x,z});
  }
  if(pts.length<5)continue;
  // Glide line from 8 m above the launch, raised where the ground needs clearance.
  const ys=pts.map((_,i)=>launch.y+8-i*step/ratio);
  let ok=true;for(let i=0;i<pts.length;i++)ys[i]=Math.max(ys[i],Math.max(h(pts[i].x,pts[i].z),sea)+clearance);
  for(let i=1;i<pts.length&&ok;i++)for(let t=.1;t<1;t+=.1){const qx=pts[i-1].x+(pts[i].x-pts[i-1].x)*t,qz=pts[i-1].z+(pts[i].z-pts[i-1].z)*t,qy=ys[i-1]+(ys[i]-ys[i-1])*t;if(qy<Math.max(h(qx,qz),sea)+clearance*.5){ok=false;break;}}
  // A glide course must keep descending overall: reject courses that need sustained climbs.
  if(!ok||ys[ys.length-1]>ys[0]-10)continue;
  const id=o.id??'race:composition-flight';
  const race=authoredRaceFromTrace(project.world,{id,name:o.name??'Vol du belvédère',kind:'flight',points:pts,height:h});
  const placed={...race,gates:race.gates.map((gate,i)=>({...gate,center:{...gate.center,y:Math.round(ys[i]*100)/100}}))};
  putAuthoredRace(project,placed);
  let length=0;for(let i=1;i<pts.length;i++)length+=Math.hypot(pts[i].x-pts[i-1].x,pts[i].z-pts[i-1].z);
  return {raceId:id,launch,lengthM:Math.round(length)};
 }
 return {severity:'ERROR',code:'ACTIVITY_FLIGHT_MISSING',message:'Aucun point de départ en hauteur ne permet une descente planée dégagée : augmenter le relief ou ajouter un belvédère accessible.'};
}
