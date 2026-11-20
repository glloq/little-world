/**
 * Activity sites (doc 104 §C6): one contract for every activity laid on the
 * map — ski pistes and lifts, races (roll, flight, mixed, surf, ski), surf
 * breaks, fishing waters, mines, fields and dive sites. A site states where it
 * is, how it is reached, which land it reserves, which quest capabilities it
 * offers and which gameplay events it emits, so land use, circulation, NPC
 * hosts and quest generation all read the same description.
 *
 * Derived from the authored libraries: never a second source of truth.
 */
import type {ProjectDocument} from './types.ts';
import type {PointXZ} from '../settlements/footprint.ts';

export const ACTIVITY_KINDS=['ski','race-roll','race-flight','race-mixed','race-surf','race-ski','surf','fishing','mine','farm','dive'] as const;
export type ActivityKind=typeof ACTIVITY_KINDS[number];
/** Gameplay events an activity emits (doc 104 §C7; see gameplay/events.ts for payloads). */
export type ActivityEventType=
 |'race.finished'|'flight.completed'|'ski.piste-completed'|'ski.lift-ridden'|'surf.wave-ridden'|'surf.trick'
 |'fishing.caught'|'mine.extracted'|'farm.harvested'|'dive.depth-reached'|'underwater.discovered';
export interface ActivitySite {
 id:string;kind:ActivityKind;name:string;sourceId:string;
 /** Where a player starts the activity (on foot or at the shore). */
 access:PointXZ;
 /** Ground / water used by the activity. */
 footprint:{kind:'polygon';points:PointXZ[]}|{kind:'corridor';points:PointXZ[];widthM:number};
 /** Stable capability ids quests and NPC hosts can bind to (e.g. 'race:<id>', 'fishing:sea'). */
 capabilities:string[];
 events:ActivityEventType[];
 /** Equipment the player needs (bought or lent): quests must make it obtainable first. */
 equipment?:string[];
 difficulty?:'green'|'blue'|'red'|'black'|'easy'|'medium'|'hard';
 /** NPC role that naturally hosts this activity (instructor, fisher, miner…). */
 hostRole:'instructor'|'fisher'|'miner'|'farmer'|'sailor'|'guide';
}

const rect=(z:{minX:number;maxX:number;minZ:number;maxZ:number})=>[{x:z.minX,z:z.minZ},{x:z.maxX,z:z.minZ},{x:z.maxX,z:z.maxZ},{x:z.minX,z:z.maxZ}];
const centroid=(pts:readonly PointXZ[])=>({x:pts.reduce((n,q)=>n+q.x,0)/pts.length,z:pts.reduce((n,q)=>n+q.z,0)/pts.length});
const RACE_KIND:Record<string,ActivityKind>={roll:'race-roll',flight:'race-flight',mixed:'race-mixed',surf:'race-surf',ski:'race-ski'};
const RACE_EVENTS:Record<string,ActivityEventType[]>={roll:['race.finished'],flight:['race.finished','flight.completed'],mixed:['race.finished','flight.completed'],surf:['race.finished','surf.wave-ridden'],ski:['race.finished','ski.piste-completed']};

export function collectActivitySites(p:ProjectDocument):ActivitySite[]{
 const out:ActivitySite[]=[],L=p.libraries;
 for(const a of Object.values(L.alpine??{})){
  const base=a.liftPath?.[0]??a.points[a.points.length-1];
  out.push({id:'ski:'+a.id,kind:'ski',name:a.name,sourceId:a.id,access:{x:base.x,z:base.z},footprint:{kind:'corridor',points:a.points.map(q=>({x:q.x,z:q.z})),widthM:a.widthM},
   capabilities:['ski:piste:'+a.id,'ski:any',...(a.difficulty?['ski:'+a.difficulty]:[]),...(a.lift?['ski:lift:'+a.id]:[])],events:['ski.piste-completed',...(a.lift?['ski.lift-ridden' as const]:[])],
   equipment:[a.equipment],...(a.difficulty?{difficulty:a.difficulty}:{}),hostRole:'instructor'});
 }
 for(const r of Object.values(L.races??{})){
  const start=r.track?.points[0]??r.gates[0]?.center;if(!start)continue;
  const line=r.track?.points??r.gates.map(g=>g.center);
  out.push({id:'race:'+r.id,kind:RACE_KIND[r.kind],name:r.name,sourceId:r.id,access:{x:start.x,z:start.z},
   footprint:{kind:'corridor',points:line.map(q=>({x:q.x,z:q.z})),widthM:r.track?.width??Math.max(...r.gates.map(g=>g.width))},
   capabilities:['race:'+r.id,'race:'+r.kind],events:RACE_EVENTS[r.kind],
   ...(r.kind==='surf'?{equipment:['surfboard']}:r.kind==='ski'?{equipment:['skis']}:r.kind==='flight'||r.kind==='mixed'?{equipment:['glider']}:{}),
   hostRole:r.kind==='surf'?'sailor':'instructor'});
 }
 for(const z of Object.values(L.surfZones??{})){
  // Player-facing name: the surf race laid in this zone, else the zone id.
  const race=Object.values(L.races??{}).find(r=>r.kind==='surf'&&r.gates.some(g=>g.center.x>=z.minX&&g.center.x<=z.maxX&&g.center.z>=z.minZ&&g.center.z<=z.maxZ));
  const pts=rect(z);out.push({id:'surf:'+z.id,kind:'surf',name:race?race.name.replace(/\s*·.*$/,''):z.id,sourceId:z.id,access:centroid(pts),footprint:{kind:'polygon',points:pts},capabilities:['surf:zone:'+z.id,'surf:any'],events:['surf.wave-ridden','surf.trick'],equipment:['surfboard'],hostRole:'sailor'});
 }
 for(const z of Object.values(L.zones??{})){
  if(z.polygon.length<3)continue;const pts=z.polygon.map(q=>({x:q.x,z:q.z}));
  if(z.kind==='mine')out.push({id:'mine:'+z.id,kind:'mine',name:z.name,sourceId:z.id,access:centroid(pts),footprint:{kind:'polygon',points:pts},capabilities:['mine:'+z.id,'mine:any'],events:['mine.extracted'],equipment:['pickaxe'],hostRole:'miner'});
  else out.push({id:'farm:'+z.id,kind:'farm',name:z.name,sourceId:z.id,access:centroid(pts),footprint:{kind:'polygon',points:pts},capabilities:['farm:'+z.id,'farm:any'],events:['farm.harvested'],hostRole:'farmer'});
 }
 // Fishing: each authored water body (river/lake) plus the sea around any port.
 for(const w of Object.values(L.water)){
  if(w.points.length<2)continue;const kind=w.kind==='lake'?'lake':'river';
  out.push({id:'fishing:'+w.id,kind:'fishing',name:(kind==='lake'?'Lac ':'Rivière ')+w.id,sourceId:w.id,access:{x:w.points[0].x,z:w.points[0].z},
   footprint:kind==='lake'&&w.points.length>=3?{kind:'polygon',points:w.points.map(q=>({x:q.x,z:q.z}))}:{kind:'corridor',points:w.points.map(q=>({x:q.x,z:q.z})),widthM:w.width},
   capabilities:['fishing:'+kind,'fishing:any','fishing:water:'+w.id],events:['fishing.caught'],equipment:['fishing-rod'],hostRole:'fisher'});
 }
 for(const c of Object.values(p.chunks))for(const e of Object.values(c.entities)){
  const q=e.components.Transform?.position;if(!q||e.components.State?.initial.portN1Authored!==true)continue;
  out.push({id:'fishing:sea:'+e.id,kind:'fishing',name:'Mer · '+e.name,sourceId:e.id,access:{x:q.x,z:q.z},footprint:{kind:'polygon',points:[{x:q.x-40,z:q.z-40},{x:q.x+40,z:q.z-40},{x:q.x+40,z:q.z+40},{x:q.x-40,z:q.z+40}]},
   capabilities:['fishing:sea','fishing:any'],events:['fishing.caught'],equipment:['fishing-rod'],hostRole:'fisher'});
 }
 for(const d of Object.values(L.diveSites??{})){
  out.push({id:'dive:'+d.id,kind:'dive',name:d.name,sourceId:d.id,access:{x:d.entry.x,z:d.entry.z},footprint:{kind:'polygon',points:d.polygon.map(q=>({x:q.x,z:q.z}))},
   capabilities:['dive:'+d.id,'dive:any','dive:depth:'+(d.depthM>=25?'deep':d.depthM>=10?'medium':'shallow')],events:['dive.depth-reached','underwater.discovered'],hostRole:'guide',
   difficulty:d.depthM>=25?'hard':d.depthM>=10?'medium':'easy'});
 }
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}

/** Capability index (doc 94 IslandCapabilityIndexV1): capability id → activity site ids. */
export function activityCapabilityIndex(sites:readonly ActivitySite[]):Map<string,string[]>{
 const index=new Map<string,string[]>();for(const s of sites)for(const c of s.capabilities){const l=index.get(c)??[];l.push(s.id);index.set(c,l);}return index;
}
