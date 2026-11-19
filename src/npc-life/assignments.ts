/** Deterministic and bounded placement of residents into qualified homes/jobs.
 * Shares one graph and caches routes by source anchor, never A* per actor frame.
 */
import type {GroundRouteContext} from '../paths/terrain-route.ts';
import type {ResidentPath,ResidentRouter} from './routes.ts';
import {createResidentRouter} from './routes.ts';
import {createResidentLayeredRouter,type ResidentSurfaces} from './layered-routes.ts';
import {residentShift,type ResidentRole,type ResidentRoute,type ResidentPoint} from './schedule.ts';
import type {LifeHome,LifeJob} from './capabilities.ts';

export interface ResidentAssignment {
  home:LifeHome;job:LifeJob;route:ResidentRoute;
}
export interface ResidentAssignmentPlanner {
  readonly graphNodes:number;readonly truncated:boolean;
  allocate(job:LifeJob,homes:readonly LifeHome[],role:ResidentRole,preferredHomeId?:string):ResidentAssignment|null;
  reserve(homeId:string):void;
  route(home:LifeHome,job:LifeJob):ResidentRoute|null;
  routeBetween(from:ResidentPoint,to:ResidentPoint):ResidentRoute|null;
  occupancy(homeId:string):number;
  jobOccupancy(jobId:string):number;
  reserveJob(jobId:string):void;
}
const hypot=(a:ResidentPoint,b:ResidentPoint)=>Math.hypot(a.x-b.x,a.z-b.z);
export function createResidentAssignmentPlanner(
  paths:readonly ResidentPath[],terrain:GroundRouteContext,
  options:{maxOccupantsPerHome?:number;maxNodes?:number;maxRouteM?:number;dayLengthSeconds?:number;residentSpeed?:number;surfaces?:ResidentSurfaces;blocked?:(x:number,z:number)=>boolean}={},
):ResidentAssignmentPlanner{
  const occupancy=new Map<string,number>(),jobOccupants=new Map<string,number>(),cache=new Map<string,ResidentRoute|null>();
  const homeLimit=Math.max(1,Math.min(6,Math.floor(options.maxOccupantsPerHome??2)));
  const maxRouteM=Math.max(40,Math.min(1200,options.maxRouteM??650));
  const bounds=terrain.bounds;
  const safe=(x:number,z:number,fromX:number,fromZ:number)=>{
    if(x<bounds.minX||x>bounds.maxX||z<bounds.minZ||z>bounds.maxZ||terrain.wet(x,z))return false;
    const height=terrain.height(x,z),previous=terrain.height(fromX,fromZ),d=Math.hypot(x-fromX,z-fromZ);
    return Number.isFinite(height)&&Number.isFinite(previous)&&height>terrain.seaLevel+1&&
      (d<.001||Math.abs(height-previous)/d<=.4)&&!options.blocked?.(x,z);
  };
  const router:ResidentRouter=options.surfaces&&paths.some(path=>path.supportId)?createResidentLayeredRouter(paths,safe,options.surfaces,options.maxNodes??16000):createResidentRouter(paths,safe,options.maxNodes??16000);
  function route(home:LifeHome,job:LifeJob):ResidentRoute|null{
    const key=home.id+'|'+job.id;
    if(!cache.has(key)){
      const direct=hypot(home.point,job.point);
      const result=direct>maxRouteM?null:router.route(home.point,job.point);
      cache.set(key,result&&result.length<=maxRouteM?result:null);
    }
    return cache.get(key)??null;
  }
  return {
    get graphNodes(){return router.nodes;},
    get truncated(){return router.truncated;},
    occupancy(homeId){return occupancy.get(homeId)??0;},
    jobOccupancy(jobId){return jobOccupants.get(jobId)??0;},
    reserveJob(jobId){jobOccupants.set(jobId,(jobOccupants.get(jobId)??0)+1);},
    reserve(homeId){occupancy.set(homeId,(occupancy.get(homeId)??0)+1);},
    route,
    routeBetween(from,to){
      if(hypot(from,to)>maxRouteM)return null;
      const path=router.route(from,to);
      return path&&path.length<=maxRouteM?path:null;
    },
    allocate(job,homes,role,preferredHomeId){
      // A service has one visual employee. Public play areas allow up to four
      // children so they can meet without duplicating the location or asset.
      if((jobOccupants.get(job.id)??0)>=(role==='child'?4:1))return null;
      const qualified:ResidentAssignment[]=[];
      // Never assign a journey longer than can be traversed within half of
      // the role's work period: residentPoseAt uses this same invariant.
      const [start,end]=residentShift(role),dayLength=options.dayLengthSeconds??1200;
      const speed=options.residentSpeed??1.1;
      const roleBudget=Math.max(1,(end-start)*dayLength/48*speed);
      // Closest homes are a search heuristic only: the winner is measured
      // by actual route distance. Test at most 16 homes per batch, extending
      // to the next batch if all near homes are disconnected. This avoids
      // 80x A* per job in a large town while still finding remote fallback.
      const candidates=homes.filter(home=>(occupancy.get(home.id)??0)<homeLimit&&
        hypot(home.point,job.point)<=maxRouteM).sort((a,b)=>
          Number(b.id===preferredHomeId)-Number(a.id===preferredHomeId)
          ||hypot(a.point,job.point)-hypot(b.point,job.point)
          ||a.slot-b.slot||a.id.localeCompare(b.id));
      for(let offset=0;offset<candidates.length;offset+=16){
        for(const home of candidates.slice(offset,offset+16)){
          const result=route(home,job);
          if(result&&result.length>=.15&&result.length<=roleBudget)qualified.push({home,job,route:result});
        }
        if(qualified.length)break;
      }
      qualified.sort((a,b)=>{
        const pa=preferredHomeId===a.home.id?-1000:0,pb=preferredHomeId===b.home.id?-1000:0;
        // Prefer family homes when the caller explicitly supplies one. Otherwise
        // avoid overcrowding, then minimize actual walking distance.
        return pa-pb||(occupancy.get(a.home.id)??0)-(occupancy.get(b.home.id)??0)
          ||a.route.length-b.route.length||a.home.slot-b.home.slot||a.home.id.localeCompare(b.home.id);
      });
      const best=qualified[0]??null;
      if(best){this.reserve(best.home.id);jobOccupants.set(job.id,(jobOccupants.get(job.id)??0)+1);}
      return best;
    },
  };
}
