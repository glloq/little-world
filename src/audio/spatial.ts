import type {AudioEmitter} from './schema.ts';
type Position={x:number;y:number;z:number};
/** Static emitters are bucketed; only entity-linked emitters refresh their coordinates. */
export class AudioEmitterIndex {
 private cells=new Map<string,AudioEmitter[]>();
 private dynamic:AudioEmitter[]=[];
 constructor(emitters:readonly AudioEmitter[]){for(const e of emitters){if(e.entityId){this.dynamic.push(e);continue;}if(e.position){const key=Math.floor(e.position.x/64)+':'+Math.floor(e.position.z/64),cell=this.cells.get(key)??[];cell.push(e);this.cells.set(key,cell);}}}
 audible(listener:Position,lookup:(id:string)=>Position|undefined,limit:number){
  const candidates:{emitter:AudioEmitter;position:Position;distance:number}[]=[],add=(e:AudioEmitter,p:Position|undefined)=>{if(!p)return;const distance=Math.hypot(p.x-listener.x,p.y-listener.y,p.z-listener.z);if(distance<=e.radius)candidates.push({emitter:e,position:p,distance});};
  if(this.cells.size)for(let x=Math.floor((listener.x-200)/64);x<=Math.floor((listener.x+200)/64);x++)for(let z=Math.floor((listener.z-200)/64);z<=Math.floor((listener.z+200)/64);z++)for(const e of this.cells.get(x+':'+z)??[])add(e,e.position);
  for(const e of this.dynamic)add(e,lookup(e.entityId!));return candidates.sort((a,b)=>b.emitter.priority-a.emitter.priority||a.distance-b.distance||a.emitter.id.localeCompare(b.emitter.id)).slice(0,limit);
 }
}
