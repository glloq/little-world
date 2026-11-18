/** Reusable authored-independent mine reception: the same physical layout on every floor.
 * One vertical lift shaft is shared by all levels. Geometry is a derived view; occupancy and
 * rights remain pure gameplay state. Coordinates are world XZ, Y vertical. */
import type {MineZone} from './mine-data.ts';
import type {MineState} from './mine-state.ts';

export interface MineHubLayout {
  mineId:string; levelId:string; levelIndex:number; floorY:number; height:number;
  heading:number;
  shaft:{x:number;z:number};
  counter:{x:number;z:number};
  keeper:{x:number;z:number};
  gallery:{x:number;z:number};
  /** Rear doorway toward the island, only on the first floor (never above the gallery). */
  surfaceExit:{x:number;z:number}|null;
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
  // One common 13 m wide reception, not a stack of props in the player's path.
  // The shop is recessed against the LEFT wall, the lift stays at the original
  // connector axis on the RIGHT, and the gallery/exit share a clear central aisle.
  return {mineId:zone.id,levelId:level.id,levelIndex,floorY:level.floorY,height:level.height,
    heading,shaft,counter:at(6.65,.15),keeper:at(7.72,.15),gallery:at(3.85,5.3),
    surfaceExit:levelIndex===0?at(3.85,-6.45):null};
}
/** A short straight opening makes the gallery visibly continue past the timber portal.
 * Its far end may join the authored galleries via a bend. No loading screen. */
export function mineHubGalleryApproach(hub:MineHubLayout):{x:number;z:number}{
  return {x:hub.gallery.x+Math.sin(hub.heading)*5.8,
    z:hub.gallery.z+Math.cos(hub.heading)*5.8};
}
/** Floor-space reservations on the player's authorised excavation grid.
 * This only opens cells INSIDE the existing mine polygon, not the exterior heightfield.
 * Broad faceted walls/props must remain inside this void (logical bounds stay canonical). */
export function mineHubCell(hub:MineHubLayout,ix:number,iz:number):boolean {
  const s=Math.sin(hub.heading),c=Math.cos(hub.heading);
  const dx=ix+.5-hub.shaft.x,dz=iz+.5-hub.shaft.z;
  const right=dx*c-dz*s,forward=dx*s+dz*c;
  // Cut the four corners so the low-poly rock looks excavated rather than a box.
  if(right< -3.3||right>9.6||forward<-7.5||forward>6.5)return false;
  const side=Math.abs(right-3.15),depth=Math.abs(forward+.5);
  return !(side>5.45&&depth>6.2&&side+depth>12.2);
}
/** Gradual extra height in the reception, returning smoothly to the authored gallery
 * ceiling at the borders. Reused by both mesher and physical ceiling query.
 * Keep total level clearance <= 4.7 m: even 6 m authored floors stay unchanged. */
export function mineHubRoofRise(hub:MineHubLayout,x:number,z:number):number {
  const dx=x-hub.shaft.x,dz=z-hub.shaft.z,
    s=Math.sin(hub.heading),c=Math.cos(hub.heading),
    right=dx*c-dz*s,forward=dx*s+dz*c;
  const edge=Math.min(right+3.2,9.5-right,forward+7.4,6.4-forward);
  const height=Math.max(0,Math.min(1.10,4.7-hub.height));
  return height*Math.max(0,Math.min(1,edge/2.1));
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

/** 3D pictograms derive from minerals actually found in the authored level. Shared visual
 * model for every mine; only the icons and colours vary. Bounded scan, never an ore claim
 * based solely on a theme or on what another level contains. */
export type MineResourceIcon='stone'|'iron'|'crystal';
export function mineLevelResourceIcons(state:MineState,levelIndex:number):MineResourceIcon[]{
  const grid=state.grid,seen=new Set<MineResourceIcon>();
  if(levelIndex<0||levelIndex>=grid.levels.length)return [];
  const stride=Math.max(1,Math.ceil(Math.sqrt(grid.width*grid.depth/12000)));
  for(let iz=grid.minZ;iz<grid.minZ+grid.depth;iz+=stride)
    for(let ix=grid.minX;ix<grid.minX+grid.width;ix+=stride){
      const material=state.material(levelIndex,ix,iz);
      if(material===2||material===3)seen.add('stone');
      else if(material===4)seen.add('iron');
      else if(material===5)seen.add('crystal');
      if(seen.size===3)return ['stone','iron','crystal'];
    }
  return (['stone','iron','crystal'] as const).filter(icon=>seen.has(icon));
}
