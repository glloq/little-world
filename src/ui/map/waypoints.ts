/** Local presentation-only waypoints, scoped by world and play/Studio preview.
 * They never modify authoring projects or GameSaveV2. */
export interface Waypoint {id:string;label:string;x:number;z:number}
export interface MapBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export const MAX_WAYPOINTS=24;
interface WaypointState {version:1;points:Waypoint[];activeId:string|null}
const valid=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function parseWaypointState(input:unknown,b:MapBounds):WaypointState{
  const empty:WaypointState={version:1,points:[],activeId:null};
  if(!valid(input)||input.version!==1||!Array.isArray(input.points))return empty;
  const ids=new Set<string>(),points:Waypoint[]=[];
  for(const raw of input.points.slice(0,MAX_WAYPOINTS)){
    if(!valid(raw)||typeof raw.id!=='string'||raw.id.length>80||!raw.id||ids.has(raw.id)||
      typeof raw.label!=='string'||!raw.label.trim()||raw.label.length>48||
      typeof raw.x!=='number'||!Number.isFinite(raw.x)||raw.x<b.minX||raw.x>b.maxX||
      typeof raw.z!=='number'||!Number.isFinite(raw.z)||raw.z<b.minZ||raw.z>b.maxZ)continue;
    ids.add(raw.id);points.push({id:raw.id,label:raw.label.trim(),x:raw.x,z:raw.z});
  }
  return {version:1,points,activeId:typeof input.activeId==='string'&&ids.has(input.activeId)?input.activeId:null};
}
function safeStorage():Pick<Storage,'getItem'|'setItem'>|null{try{return typeof localStorage==='undefined'?null:localStorage;}catch{return null;}}
export function createWaypointStore(worldId:string,b:MapBounds,temporary=false,storage:Pick<Storage,'getItem'|'setItem'>|null=safeStorage()){
  const key='little-world:waypoints:v1:'+(temporary?'preview:':'world:')+encodeURIComponent(worldId);
  let state:WaypointState={version:1,points:[],activeId:null},counter=0;
  try{state=parseWaypointState(JSON.parse(storage?.getItem(key)??'null'),b);}catch{/* Optional local preference. */}
  const persist=()=>{try{storage?.setItem(key,JSON.stringify(state));return !!storage;}catch{return false;}};
  return {
    key,
    get points():readonly Waypoint[]{return state.points;},
    get activeId(){return state.activeId;},
    get active():Waypoint|undefined{return state.points.find(p=>p.id===state.activeId);},
    add(label:string,x:number,z:number):Waypoint|null{
      const trimmed=label.trim().slice(0,48);
      if(!trimmed||!Number.isFinite(x)||!Number.isFinite(z)||x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ||state.points.length>=MAX_WAYPOINTS)return null;
      let id:string;do{id='custom:'+Date.now().toString(36)+':'+(counter++).toString(36);}while(state.points.some(p=>p.id===id));
      const point={id,label:trimmed,x,z};state={...state,points:[...state.points,point],activeId:id};persist();return point;
    },
    remove(id:string){if(!state.points.some(p=>p.id===id))return false;state={...state,points:state.points.filter(p=>p.id!==id),activeId:state.activeId===id?null:state.activeId};persist();return true;},
    activate(id:string|null){if(id!==null&&!state.points.some(p=>p.id===id))return false;state={...state,activeId:id};persist();return true;},
  };
}
export type WaypointStore=ReturnType<typeof createWaypointStore>;
