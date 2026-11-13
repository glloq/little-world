import type {ProjectDocument} from '../../studio-core/types.ts';
export interface PlacementCheck {level:'ok'|'warning'|'invalid';reason:string}
/** Pure validity rules (unit-tested): bounds and deep water refuse; overlap and slope warn. */
export function checkPlacement(p:ProjectDocument,x:number,z:number,options:{ground:(x:number,z:number)=>number;depth:(x:number,z:number)=>number;building:boolean;radius:number}):PlacementCheck{
  const b=p.world.bounds;if(x<b.minX+1||x>b.maxX-1||z<b.minZ+1||z>b.maxZ-1)return {level:'invalid',reason:'Hors des limites du monde'};
  if(options.depth(x,z)>(options.building?.2:.6))return {level:'invalid',reason:'Dans l’eau profonde'};
  const slope=Math.max(Math.abs(options.ground(x+1,z)-options.ground(x-1,z)),Math.abs(options.ground(x,z+1)-options.ground(x,z-1)))/2;
  for(const e of Object.values(p.entityIndex))if(Math.hypot(e.position.x-x,e.position.z-z)<options.radius)return {level:'warning',reason:'Chevauche « '+e.name+' »'};
  if(slope>(options.building?.35:.8))return {level:'warning',reason:'Pente forte : vérifier l’assise'};
  return {level:'ok',reason:''};
}
