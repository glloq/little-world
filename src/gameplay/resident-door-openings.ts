/** Purely transient, bounded exterior door opening requests from NPC routines.
 * Player-authored runtime state remains authoritative and is never mutated.
 */
export function createResidentDoorOpenings(now:()=>number){
 const until=new Map<string,number>();
 return {
  isOpen(id:string){return (until.get(id)??-Infinity)>now();},
  request(id:string,duration=2):boolean{
   const time=now();if(!id||id.length>100||!Number.isFinite(time)||!Number.isFinite(duration)||duration<=0||duration>5)return false;
   const previouslyOpen=(until.get(id)??-Infinity)>time;
   until.set(id,Math.max(until.get(id)??-Infinity,time+duration));
   return !previouslyOpen;
  },
  expire():boolean{
   const time=now();if(!Number.isFinite(time))return false;
   let changed=false;
   for(const [id,end] of until)if(end<=time){until.delete(id);changed=true;}
   return changed;
  },
  clear(){until.clear();},
 };
}
