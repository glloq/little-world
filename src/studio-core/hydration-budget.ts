/** Pure cache eviction policy. Call only after dirty/history/dependency pinning. */
export function planHydrationEviction(loaded:readonly string[],pinned:ReadonlySet<string>,limit=512):string[]{
  if(limit<1||!Number.isSafeInteger(limit))throw Error('Budget de secteurs invalide');
  if(loaded.length<=limit)return [];
  const removed:string[]=[];
  for(const id of loaded){
    if(loaded.length-removed.length<=limit)break;
    if(!pinned.has(id))removed.push(id);
  }
  return removed;
}
