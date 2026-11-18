/** Mine rhythm and finite, deterministic extraction rewards.
 * Pure functions (also used by the lightweight HUD). Never use Math.random()
 * or wall-clock timestamps to determine loot; the authority owns rewards.
 */
export type StrikeAccuracy='normal'|'good'|'perfect';
export interface MineRhythm {periodMs:number;window:number;goodWindow:number;hitsPerResult:number}
export const MINE_RHYTHMS:readonly MineRhythm[]=[
  {periodMs:900,window:.115,goodWindow:.26,hitsPerResult:3}, // air: unused
  {periodMs:900,window:.125,goodWindow:.29,hitsPerResult:3}, // earth
  {periodMs:1150,window:.115,goodWindow:.24,hitsPerResult:4},// stone
  {periodMs:1480,window:.105,goodWindow:.22,hitsPerResult:5},// hard rock
  {periodMs:1680,window:.095,goodWindow:.20,hitsPerResult:4},// iron
  {periodMs:1920,window:.085,goodWindow:.18,hitsPerResult:5},// crystal
  {periodMs:1920,window:.085,goodWindow:.18,hitsPerResult:5},// protected: unused
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
export function mineAccuracyMultiplier(quality:StrikeAccuracy):number{
  return quality==='perfect'?1.30:quality==='good'?1.15:1;
}
/** Integer hash in [0,1), stable across save/reload, frame rate and input devices. */
export function mineHash(level:number,ix:number,iz:number,cycle:number):number{
  let h=Math.imul(ix,0x27d4eb2d)^Math.imul(iz,0x165667b1)^
    Math.imul(level+1,0x9e3779b1)^Math.imul(cycle+1,0x85ebca6b);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h^=h>>>13;
  return (h>>>0)/4294967296;
}
export function mineHitsPerResult(material:number):number{
  return MINE_RHYTHMS[material]?.hitsPerResult??4;
}
/** Most interim payouts are low-value stone/earth; a rare enriched one can
 * contain the cell's actual ore. Final excavation still grants its base ore.
 * One roll every N *successful* strikes on the same cell, not per refresh. */
export function mineInterimReward(
  material:number,quality:StrikeAccuracy,level:number,ix:number,iz:number,cycle:number,
):{itemId:string;quantity:number}{
  const rareChance=material===4?.05:material===5?.012:0;
  const precision=quality==='perfect'?2.25:quality==='good'?1.4:1;
  const rare=(material===4||material===5)&&mineHash(level,ix,iz,cycle)<rareChance*precision;
  if(rare)return {itemId:material===4?'mine:iron':'mine:crystal',quantity:1};
  return {itemId:material===1||mineHash(level,ix,iz,cycle+1049)<.28?'mine:earth':'mine:stone',quantity:1};
}
