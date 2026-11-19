/** Revision tracker shared by gameplay doors and resident route invalidation.
 * Observing the same state is idempotent; an initial snapshot is not a change.
 * Transient NPC openings and persisted player openings use the same boolean.
 */
export function createResidentNavigationRevisionTracker(){
 const observed=new Map<string,boolean>();
 let revision=0;
 return {
  get revision(){return revision;},
  observe(id:string,open:boolean):void{
   const previous=observed.get(id);
   if(previous!==undefined&&previous!==open)revision++;
   observed.set(id,open);
  },
  /** A new world instance gets a fresh baseline without implying a mutation. */
  clear():void{observed.clear();revision=0;},
 };
}
