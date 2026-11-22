/** Resident spectators of mini-games (doc 107 §PNJ): pure, event-driven selection. Called
 * once per mini-game event (never per frame): the nearest available residents within the
 * radius watch the field for a few seconds, bounded in number; busy residents (at work,
 * talking, scripted, indoors) are never taken. */
export interface Spectator {x:number;z:number;until:number;cheer:boolean;cheered:boolean}
export interface SpectateOptions {radius?:number;max?:number;seconds?:number;cheer?:boolean}
/** Maximum residents watching mini-games at once. */
export const SPECTATORS_MAX=4;
export function selectSpectators(residents:readonly {id:string;x:number;z:number;busy:boolean}[],point:{x:number;z:number},o:SpectateOptions,
  current:Map<string,Spectator>,now:number):number{
  const radius=Math.min(30,o.radius??14),max=Math.min(SPECTATORS_MAX,o.max??3),seconds=Math.min(12,o.seconds??6);
  for(const [id,w] of current)if(now>w.until)current.delete(id);
  const candidates:{id:string;d:number}[]=[];
  for(const r of residents){const d=Math.hypot(r.x-point.x,r.z-point.z);if(d<=radius&&!r.busy)candidates.push({id:r.id,d});}
  candidates.sort((a,b)=>a.d-b.d||(a.id<b.id?-1:1));
  let n=0;
  for(const c of candidates){
    const w=current.get(c.id);
    if(w){w.until=now+seconds;w.x=point.x;w.z=point.z;if(o.cheer){w.cheer=true;w.cheered=false;}n++;continue;}
    if(current.size>=max)continue;
    current.set(c.id,{x:point.x,z:point.z,until:now+seconds,cheer:!!o.cheer,cheered:false});n++;
  }
  return n;
}
