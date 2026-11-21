/**
 * Player intentions for mini-games and the LOCAL authority that orders them (doc 107 §multi).
 * Clients only send intentions stamped with a tick; the authority validates their shape,
 * orders them deterministically (tick, player, seq) and the manager applies them before the
 * physics step of that tick. A future server replaces this queue, not the contracts:
 * collision outcomes and scores are never decided by a client.
 */
export type MiniGameIntent=
 |{type:'join';teamId?:string}
 |{type:'leave'}|{type:'abandon'}|{type:'reset'}
 /** Optional game mode (variant `modes`, e.g. bowling beginner / normal). */
 |{type:'start';mode?:string}
 /** Kick / throw / putt: absolute world yaw (rad, 0 = +Z) and power 0…1. */
 |{type:'launch';yaw:number;power:number;
   /** Height of the shot 0…1 (absent = the variant's default). */loft?:number};
export type MiniGameCommand=MiniGameIntent&{instanceId:string;playerId:string;tick:number;seq:number};

const ID=/^[a-zA-Z0-9:_-]{1,120}$/;
export function validateCommand(c:MiniGameCommand):boolean{
  if(!c||!ID.test(c.instanceId)||!ID.test(c.playerId)||!Number.isSafeInteger(c.tick)||c.tick<0||!Number.isSafeInteger(c.seq)||c.seq<0)return false;
  switch(c.type){
    case 'join':return c.teamId===undefined||ID.test(c.teamId);
    case 'launch':return Number.isFinite(c.yaw)&&Math.abs(c.yaw)<=100&&Number.isFinite(c.power)&&c.power>=0&&c.power<=1&&(c.loft===undefined||Number.isFinite(c.loft)&&c.loft>=0&&c.loft<=1);
    case 'start':return c.mode===undefined||ID.test(c.mode);
    case 'leave':case 'abandon':case 'reset':return true;
    default:return false;
  }
}
/** Commands later than this many ticks are dropped (stale input after a stall). */
export const COMMAND_STALE_TICKS=90;
const MAX_QUEUE=256;
const order=(a:MiniGameCommand,b:MiniGameCommand)=>a.tick-b.tick||(a.playerId<b.playerId?-1:a.playerId>b.playerId?1:0)||a.seq-b.seq;

export class LocalMiniGameAuthority {
  private queue:MiniGameCommand[]=[];
  private lastSeq=new Map<string,number>();
  /** Accepts a well-formed, non-duplicated intention. */
  submit(c:MiniGameCommand):boolean{
    if(!validateCommand(c)||this.queue.length>=MAX_QUEUE)return false;
    const key=c.instanceId+'|'+c.playerId;if(c.seq<=(this.lastSeq.get(key)??-1))return false; // idempotent replay
    this.lastSeq.set(key,c.seq);this.queue.push(structuredClone(c));return true;
  }
  /** Commands due at `tick`, in deterministic order; stale ones are discarded. */
  drain(tick:number):MiniGameCommand[]{
    if(!this.queue.length)return EMPTY;
    const due:MiniGameCommand[]=[],later:MiniGameCommand[]=[];
    for(const c of this.queue){if(c.tick>tick)later.push(c);else if(tick-c.tick<=COMMAND_STALE_TICKS)due.push(c);}
    this.queue=later;return due.sort(order);
  }
  /** Forget an instance (disposed): its queued commands and sequence counters. */
  forget(instanceId:string){this.queue=this.queue.filter(c=>c.instanceId!==instanceId);for(const k of [...this.lastSeq.keys()])if(k.startsWith(instanceId+'|'))this.lastSeq.delete(k);}
  get pending(){return this.queue.length;}
}
const EMPTY:MiniGameCommand[]=[];
