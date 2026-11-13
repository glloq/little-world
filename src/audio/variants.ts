/** AUD-V2 — take selection: weighted draw, anti-repetition, shuffle bags, sequences, bounded
 * pitch/gain jitter and per-event cooldowns. Seeded and injectable, hence deterministic in tests. */
import type {RepeatMode} from './catalog.ts';
export type Random=()=>number;
export function seededRandom(seed:number):Random {let a=seed>>>0;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export interface Candidate {key:string;weight:number;}

export class VariantPicker {
 private last=new Map<string,string>();
 private bags=new Map<string,string[]>();
 private cursor=new Map<string,number>();
 private readonly random:Random;
 constructor(random:Random=Math.random){this.random=random;}
 /** `group` identifies the event *and* the eligible set (contexts select different groups). */
 pick<T extends Candidate>(group:string,candidates:readonly T[],mode:RepeatMode):T|null {
  if(!candidates.length)return null;let chosen:T;
  if(candidates.length===1)chosen=candidates[0];
  else if(mode==='sequence'){const i=(this.cursor.get(group)??-1)+1;this.cursor.set(group,i);chosen=candidates[i%candidates.length];}
  else if(mode==='shuffle'){let bag=this.bags.get(group)?.filter(k=>candidates.some(c=>c.key===k));if(!bag?.length){bag=this.shuffled(candidates);const previous=this.last.get(group);if(bag.length>1&&bag[bag.length-1]===previous)[bag[0],bag[bag.length-1]]=[bag[bag.length-1],bag[0]];}const key=bag.pop()!;this.bags.set(group,bag);chosen=candidates.find(c=>c.key===key)!;}
  else{const previous=this.last.get(group),pool=mode==='avoid-repeat'?candidates.filter(c=>c.key!==previous):candidates;chosen=this.weighted(pool.length?pool:candidates);}
  this.last.set(group,chosen.key);return chosen;
 }
 /** Shuffle bag: each take appears round(weight) times (at least once), Fisher–Yates order. */
 private shuffled(candidates:readonly Candidate[]):string[]{const bag=candidates.flatMap(c=>Array.from({length:Math.max(1,Math.min(8,Math.round(c.weight)))},()=>c.key));for(let i=bag.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}return bag.reverse();}
 private weighted<T extends Candidate>(pool:readonly T[]):T{const total=pool.reduce((s,c)=>s+c.weight,0);let r=this.random()*total;for(const c of pool){r-=c.weight;if(r<0)return c;}return pool[pool.length-1];}
 /** Playback-rate multiplier within ±semitones (clamped to 2). */
 pitch(semitones:number):number{const s=Math.max(0,Math.min(2,semitones));return s?2**((this.random()*2-1)*s/12):1;}
 /** Gain multiplier within ±fraction (clamped to 0.5). */
 gain(fraction:number):number{const f=Math.max(0,Math.min(.5,fraction));return f?1+(this.random()*2-1)*f:1;}
 reset(){this.last.clear();this.bags.clear();this.cursor.clear();}
}
/** Per-event cooldown, counted when the request is accepted (so slow decoding cannot cause bursts). */
export class CooldownGate {
 private until=new Map<string,number>();
 allow(key:string,nowMs:number,cooldownMs:number):boolean{if(cooldownMs<=0)return true;const until=this.until.get(key)??-Infinity;if(nowMs<until)return false;this.until.set(key,nowMs+cooldownMs);if(this.until.size>2048)for(const [k,t]of this.until)if(t<nowMs)this.until.delete(k);return true;}
 clear(){this.until.clear();}
}
