/** Single local surf board, kept inside a save slot and never shared across islands. */
export interface SurfBoardPlacement {x:number;y:number;z:number;heading:number}
const finite=(n:unknown,limit:number)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=limit;
export function parseSurfBoardPlacement(value:unknown):SurfBoardPlacement|null {
 if(value===null||value===undefined)return null;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Position de planche de surf invalide');
 const v=value as Record<string,unknown>;
 if(!finite(v.x,100000)||!finite(v.y,10000)||!finite(v.z,100000)||!finite(v.heading,100))
   throw Error('Position de planche de surf invalide');
 return {x:v.x as number,y:v.y as number,z:v.z as number,heading:v.heading as number};
}
export function distanceToBoard(board:SurfBoardPlacement,x:number,z:number):number {
 return Math.hypot(board.x-x,board.z-z);
}
export function isSurfBoardWaterSafe(
 board:SurfBoardPlacement,
 water:(x:number,z:number)=>number|null,
 floor:(x:number,z:number)=>number,
 hasSurfZone:(x:number,z:number)=>boolean,
 margin=.65
):boolean {
 const level=water(board.x,board.z);
 return level!==null&&Number.isFinite(level)&&level-floor(board.x,board.z)>.8&&
   Number.isFinite(margin)&&margin>=0&&
   [[0,0],[margin,0],[-margin,0],[0,margin],[0,-margin]].every(([dx,dz])=>hasSurfZone(board.x+dx,board.z+dz));
}
/** Every board placement is snapped to the actual water height instead of a cached wave mesh. */
export function boardOnWater(x:number,z:number,heading:number,water:(x:number,z:number)=>number|null):SurfBoardPlacement|null {
 const y=water(x,z);
 return y===null||!Number.isFinite(y)?null:{x,y:y+.03,z,heading};
}
