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
   hasSurfZone(board.x,board.z)&&hasSurfZone(board.x+margin,board.z)&&
   hasSurfZone(board.x-margin,board.z)&&hasSurfZone(board.x,board.z+margin)&&
   hasSurfZone(board.x,board.z-margin);
}
/** Every board placement is snapped to the actual water height instead of a cached wave mesh. */
export function boardOnWater(x:number,z:number,heading:number,water:(x:number,z:number)=>number|null):SurfBoardPlacement|null {
 const y=water(x,z);
 return y===null||!Number.isFinite(y)?null:{x,y:y+.03,z,heading};
}
/** Mounting reach: a floating board closer than this is boarded, farther it is recalled. */
export const BOARD_REACH=2.5;
/** Nearest valid floating spot around a swimmer (front first, then sides, then behind), always
 * within mounting reach so that the next B boards it.
 * Used both to deploy the equipped board and to recall a board left anywhere else. */
export function findBoardSpotNear(x:number,z:number,heading:number,
 water:(x:number,z:number)=>number|null,floor:(x:number,z:number)=>number,
 hasSurfZone:(x:number,z:number)=>boolean):SurfBoardPlacement|null{
 for(const d of [0,1.2,1.8,BOARD_REACH-.1])for(const turn of [0,.6,-.6,1.4,-1.4,Math.PI]){
  if(d===0&&turn!==0)continue;
  const a=heading+turn,candidate=boardOnWater(x+Math.sin(a)*d,z+Math.cos(a)*d,heading,water);
  if(candidate&&isSurfBoardWaterSafe(candidate,water,floor,hasSurfZone))return candidate;
 }
 return null;
}
export type BoardRequest=
 {kind:'mount';board:SurfBoardPlacement}|
 {kind:'recall';board:SurfBoardPlacement}|
 {kind:'pickup'}|
 {kind:'deploy';board:SurfBoardPlacement}|
 {kind:'none';reason:'no-water'|'not-in-water'|'unsafe'};
/** B pressed while not surfing: board within reach → mount; board elsewhere → recalled next to
 * the player (it disappears from its old place) or, with no surfable water around, taken back in
 * hand; no board in the water → deploy the equipped one. Pure decision, applied by the caller. */
export function boardRequest(placed:SurfBoardPlacement|null,player:{x:number;z:number;heading:number;inWater:boolean},
 water:(x:number,z:number)=>number|null,floor:(x:number,z:number)=>number,
 hasSurfZone:(x:number,z:number)=>boolean):BoardRequest{
 if(placed&&distanceToBoard(placed,player.x,player.z)<=BOARD_REACH){
  if(!player.inWater)return {kind:'none',reason:'not-in-water'};
  if(!isSurfBoardWaterSafe(placed,water,floor,hasSurfZone))return {kind:'none',reason:'unsafe'};
  return {kind:'mount',board:placed};
 }
 const spot=findBoardSpotNear(player.x,player.z,player.heading,water,floor,hasSurfZone);
 if(placed)return spot?{kind:'recall',board:spot}:{kind:'pickup'};
 return spot?{kind:'deploy',board:spot}:{kind:'none',reason:'no-water'};
}
