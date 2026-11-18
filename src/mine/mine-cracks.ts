/** Low-poly damage stages for an already-existing excavable mine cell.
 * Cosmetic only. Three crack tiers are updated on accepted harvest cycles;
 * the cell stays solid until the mine authority has consumed its durability.
 * All coordinates are integer world cells, independent of chunk streaming.
 */
import {MINE_CHUNK} from './mine-data.ts';
import {mineBlockDurability} from './mine-rhythm.ts';

export type MineCrackStage=0|1|2|3;

export function mineCrackStage(material:number,consumedDurability:number):MineCrackStage{
  const max=mineBlockDurability(material);
  if(max<=0||consumedDurability<=0||consumedDurability>=max)return 0;
  const proportion=consumedDurability/max;
  if(proportion>=.75)return 3;
  if(proportion>=.50)return 2;
  if(proportion>=.25)return 1;
  return 0;
}

/** Chunks containing exposed faces of the damaged rock, including both sides
 * of a 32 m seam. Changing a stage never changes any collision or occupancy. */
export function mineCrackAffectedChunks(ix:number,iz:number):string[]{
  const keys=new Set<string>();
  for(const [x,z] of [[ix,iz],[ix-1,iz],[ix+1,iz],[ix,iz-1],[ix,iz+1]] as const)
    keys.add(Math.floor(x/MINE_CHUNK)+','+Math.floor(z/MINE_CHUNK));
  return [...keys];
}

/** Path segments in wall coordinates u: left -> right; v: floor -> roof.
 * Separate strokes are added per stage. All points stay away from the face
 * edges to avoid artificial cracks between unrelated neighbouring cells.
 * There are at most eight tiny strips per exposed wall (two triangles each).
 */
export const MINE_CRACK_STROKES:readonly (readonly [number,number,number,number])[]=[
  [.35,.73,.48,.57], [.48,.57,.43,.44], // stage 1: hairline
  [.48,.57,.63,.66], [.43,.44,.30,.34], [.43,.44,.55,.29], // stage 2: branching
  [.63,.66,.74,.82], [.55,.29,.66,.18], [.30,.34,.24,.20], // stage 3: fracture
] as const;
export function mineCrackStrokeCount(stage:MineCrackStage):number{
  return stage===1?2:stage===2?5:stage===3?8:0;
}
export function mineCrackColor(material:number):number{
  return material===5?0x224650:material===4?0x4b3227:
    material===1?0x473323:0x353237;
}
