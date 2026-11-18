/** Mine rhythm and finite, deterministic extraction rewards.
 * Pure functions (also used by the lightweight HUD). Never use Math.random()
 * or wall-clock timestamps to determine loot; the authority owns rewards.
 */
export type StrikeAccuracy='normal'|'good'|'perfect';
export interface MineRhythm {periodMs:number;window:number;goodWindow:number}
export const MINE_RHYTHMS:readonly MineRhythm[]=[
  {periodMs:900,window:.115,goodWindow:.26}, // air: unused
  {periodMs:900,window:.125,goodWindow:.29}, // earth
  {periodMs:1150,window:.115,goodWindow:.24},// stone
  {periodMs:1480,window:.105,goodWindow:.22},// hard rock
  {periodMs:1680,window:.095,goodWindow:.20},// iron
  {periodMs:1920,window:.085,goodWindow:.18},// crystal
  {periodMs:1920,window:.085,goodWindow:.18},// protected: unused
] as const;
/** Ping-pong cursor in [0,1]. One full left-right-left cycle is periodMs. */
export function mineRhythmPosition(material:number,elapsedMs:number):number{
  const config=MINE_RHYTHMS[material]??MINE_RHYTHMS[2];
  const t=((Math.max(0,elapsedMs)/config.periodMs)%1+1)%1;
  return t<.5?t*2:2-t*2;
}
export function mineRhythmAccuracy(material:number,elapsedMs:number):StrikeAccuracy{
  const c=MINE_RHYTHMS[material]??MINE_RHYTHMS[2];
  const error=Math.abs(mineRhythmPosition(material,elapsedMs)-.5);
  return error<=c.window?'perfect':error<=c.goodWindow?'good':'normal';
}
/** Mining V7: one cycle harvests materials and removes EXACTLY one durability
 * point. Fixed-point work allows 5 normal, 4 good, or 3 perfect hits. A mix
 * resolves in 3–5 accepted strikes without using wall-clock RNG for rewards. */
export const MINE_WORK_PER_CYCLE=15;
export function mineStrikeWork(accuracy:StrikeAccuracy):number{
  return accuracy==='perfect'?5:accuracy==='good'?4:3;
}
/** Material difficulty is independent of the speed of the mining cursor.
 * Old hp remains only for migration of already-struck cells in older saves. */
export const MINE_DURABILITY:readonly number[]=[0,2,3,5,7,11,0];
export function mineBlockDurability(material:number):number{
  return MINE_DURABILITY[material]??3;
}
export function mineHitsUntilCycle(work:number,quality:StrikeAccuracy='good'):number{
  return Math.max(1,Math.ceil((MINE_WORK_PER_CYCLE-Math.max(0,Math.min(14,work)))/mineStrikeWork(quality)));
}

/** Integer hash in [0,1), stable across save/reload, frame rate and input devices. */
export function mineHash(level:number,ix:number,iz:number,cycle:number):number{
  let h=Math.imul(ix,0x27d4eb2d)^Math.imul(iz,0x165667b1)^
    Math.imul(level+1,0x9e3779b1)^Math.imul(cycle+1,0x85ebca6b);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h^=h>>>13;
  return (h>>>0)/4294967296;
}
/** One payout at each completed 3–5-strike cycle. Most payouts are common
 * debris, a single late rare payout can be the embedded ore. The final
 * durability point is handled separately and yields slightly more ore. */
export function mineInterimReward(
  material:number,quality:StrikeAccuracy,level:number,ix:number,iz:number,cycle:number,
):{itemId:string;quantity:number}{
  const rareChance=material===4?.05:material===5?.012:0;
  const precision=quality==='perfect'?2.25:quality==='good'?1.4:1;
  // At most ONE valuable interim mineral per cell. It can appear only on
  // the second 3–5-hit milestone; weak tools cannot farm extra rare rolls.
  const rare=(material===4||material===5)&&cycle===2&&
    mineHash(level,ix,iz,0)<rareChance*precision;
  if(rare)return {itemId:material===4?'mine:iron':'mine:crystal',quantity:1};
  return {itemId:material===1||mineHash(level,ix,iz,cycle+1049)<.28?'mine:earth':'mine:stone',quantity:1};
}
