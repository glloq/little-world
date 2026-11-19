/** Lightweight deterministic pair encounters on validated public places.
 * Spatial hash limits comparisons and prevents duplicate ongoing conversations.
 * These interactions are cosmetic and never execute a quest or economy action.
 */
import type {ResidentRole,ResidentPhase,ResidentActivityKind} from './schedule.ts';
export interface ResidentSocialCandidate {
  id:string;x:number;z:number;role:ResidentRole;
  phase?:ResidentPhase;kind?:ResidentActivityKind;busy?:boolean;
}
export function residentSocialPairs(candidates:readonly ResidentSocialCandidate[],radius=5.5,maxPairs=12):Map<string,string>{
 const eligible=[...candidates].filter(c=>!c.busy&&Number.isFinite(c.x)&&Number.isFinite(c.z)&&
   ((c.phase==='activity'&&c.kind==='social')||(c.role==='child'&&c.phase==='work'))).sort((a,b)=>a.id.localeCompare(b.id));
 const paired=new Map<string,string>(),cells=new Map<string,ResidentSocialCandidate[]>();
 const CELL=6,key=(x:number,z:number)=>Math.floor(x/CELL)+':'+Math.floor(z/CELL);
 for(const actor of eligible){
  if(paired.size>=maxPairs*2)break;
  const cx=Math.floor(actor.x/CELL),cz=Math.floor(actor.z/CELL);
  let closest:ResidentSocialCandidate|null=null,minimum=radius;
  for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)
   for(const peer of cells.get(x+':'+z)??[]){
    if(paired.has(peer.id))continue;
    const d=Math.hypot(actor.x-peer.x,actor.z-peer.z);
    if(d<minimum-.00001||(Math.abs(d-minimum)<.00001&&closest&&peer.id<closest.id)){
      closest=peer;minimum=d;
    }
   }
  if(closest){paired.set(actor.id,closest.id);paired.set(closest.id,actor.id);}
  else{const k=key(actor.x,actor.z),bucket=cells.get(k)??[];bucket.push(actor);cells.set(k,bucket);}
 }
 return paired;
}

/** Stable short encounter window: both actors greet one another together.
 * Pure deterministic schedule, no per-NPC timers or random calls.
 */
export function residentSocialEncounterActive(a:string,b:string,time:number,period=12,duration=4):boolean{
 if(!Number.isFinite(time)||time<0||!Number.isFinite(period)||period<=0||
    !Number.isFinite(duration)||duration<=0||duration>period||a===b)return false;
 const [first,second]=a<b?[a,b]:[b,a];
 let hash=2166136261;
 for(const ch of first+'|'+second){hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;}
 const offset=(hash%1000)/1000*period;
 return ((time+offset)%period)<duration;
}
