/** Reusable authored-independent mine reception: the same physical layout on every floor.
 * One vertical lift shaft is shared by all levels. Geometry is a derived view; occupancy and
 * rights remain pure gameplay state. Coordinates are world XZ, Y vertical. */
import type {MineZone} from './mine-data.ts';

export interface MineHubLayout {
  mineId:string; levelId:string; levelIndex:number; floorY:number; height:number;
  heading:number;
  shaft:{x:number;z:number};
  counter:{x:number;z:number};
  keeper:{x:number;z:number};
  gallery:{x:number;z:number};
}
/** The first authored stair is the shaft reference, preserving existing gallery routes.
 * For a single-level mine a point a few metres along the entrance corridor is used. */
export function mineHubLayout(zone:MineZone,levelIndex:number):MineHubLayout {
  const level=zone.mine.levels[levelIndex];
  if(!level)throw Error('Niveau minier inconnu');
  const {heading}=zone.mine.entrance,f={x:Math.sin(heading),z:Math.cos(heading)},
    r={x:Math.cos(heading),z:-Math.sin(heading)};
  const entrance=zone.mine.entrance,first=zone.mine.connectors[0];
  const shaft=first?{x:Math.floor(first.x)+.5,z:Math.floor(first.z)+.5}:
    {x:Math.floor(entrance.x+f.x*7)+.5,z:Math.floor(entrance.z+f.z*7)+.5};
  const at=(a:number,b:number)=>({x:shaft.x+r.x*a+f.x*b,z:shaft.z+r.z*a+f.z*b});
  return {mineId:zone.id,levelId:level.id,levelIndex,floorY:level.floorY,height:level.height,
    heading,shaft,counter:at(-3.2,0),keeper:at(-4.05,0),gallery:at(-1.4,4)};
}
/** Floor-space reservations on the player's authorised excavation grid.
 * This only opens cells INSIDE the existing mine polygon, not the exterior heightfield.
 * Broad faceted walls/props must remain inside this void (logical bounds stay canonical). */
export function mineHubCell(zone:MineZone,levelIndex:number,ix:number,iz:number):boolean {
  const hub=mineHubLayout(zone,levelIndex),s=Math.sin(hub.heading),c=Math.cos(hub.heading);
  const dx=ix+.5-hub.shaft.x,dz=iz+.5-hub.shaft.z;
  const right=dx*c-dz*s,forward=dx*s+dz*c;
  return right>=-5.5&&right<=2.5&&forward>=-3.5&&forward<=4.5;
}
export function mineRequiredExcavations(levelIndex:number):number {
  return levelIndex<=0?0:levelIndex===1?12:40+(levelIndex-2)*40;
}
export function mineLevelUnlocked(levelIndex:number,excavations:number):boolean {
  return excavations>=mineRequiredExcavations(levelIndex);
}
export function mineHubCounterId(mineId:string,levelId:string):string {
  return 'mine-hub:'+mineId+':'+levelId;
}
