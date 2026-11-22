/**
 * MiniGameSession (doc 107 §sessions): participants, teams, status, scores, attempts, rounds,
 * tick-based clock and results. Pure and serialisable (JSON): no rendering, no wall clock,
 * no randomness. Every mutation appends a typed event with a monotonic `seq`, so a future
 * authoritative server replays the same order. Events are returned to the caller, like
 * `advanceRace`; the game forwards only `game:finish` to the shared gameplay event registry.
 */
import {MINIGAME_VARIANTS} from './catalog.ts';
import type {MiniGameInstanceV1} from './schema.ts';

export const MINIGAME_TICK_HZ=30;
export type SessionStatus='ready'|'active'|'suspended'|'finished'|'abandoned';
export type MiniGameEvent=
 |{type:'game:start';sessionId:string;tick:number;seq:number}
 |{type:'game:finish';sessionId:string;tick:number;seq:number;reason:string;winners:string[]}
 |{type:'game:reset';sessionId:string;tick:number;seq:number;round:number}
 |{type:'game:abandon';sessionId:string;tick:number;seq:number;playerId?:string}
 |{type:'player:join'|'player:leave';sessionId:string;tick:number;seq:number;playerId:string;teamId?:string}
 |{type:'ball:hit';sessionId:string;tick:number;seq:number;playerId:string;ballId:string;speed:number;/** Voluntary launch (kick / throw / putt), not a contact push. */shot?:boolean}
 |{type:'ball:out';sessionId:string;tick:number;seq:number;ballId:string}
 |{type:'target:hit';sessionId:string;tick:number;seq:number;targetId:string;playerId?:string}
 |{type:'checkpoint:passed';sessionId:string;tick:number;seq:number;playerId:string;checkpointId:string}
 |{type:'score:changed';sessionId:string;tick:number;seq:number;key:string;score:number}
 /** Remarkable moment of a variant (presentation, HUD, reactions); never changes a score. */
 |{type:'highlight';sessionId:string;tick:number;seq:number;kind:MiniGameHighlight;playerId?:string;targetId?:string};
export type MiniGameHighlight='strike'|'spare'|'hole-in-one'|'bullseye'|'clear';
type EventBody<T> = T extends unknown ? Omit<T,'sessionId'|'tick'|'seq'> : never;
export type MiniGameEventBody=EventBody<MiniGameEvent>;

export interface SessionPlayer {id:string;teamId?:string}
export interface MiniGameSessionState {
  sessionId:string;instanceId:string;variant:string;status:SessionStatus;
  players:SessionPlayer[];
  /** Score per team id (team games) or per player id. */scores:Record<string,number>;
  /** Attempts used in the current round, per player. */attempts:Record<string,number>;
  /** Players that completed the course (mini-golf holed). */finished:string[];
  round:number;turn:number;
  /** Game mode chosen at start (variants with `modes`), absent otherwise. */
  mode?:string;
  startTick:number;lastTick:number;activeTicks:number;
  seq:number;
  result:{reason:string;winners:string[];tick:number}|null;
}
const PLAYER_ID=/^[a-zA-Z0-9:_-]{1,64}$/;

export function createSession(def:MiniGameInstanceV1,sessionId:string):MiniGameSessionState{
  if(!/^[a-zA-Z0-9:_-]{1,120}$/.test(sessionId))throw Error('Session : identifiant invalide');
  return {sessionId,instanceId:def.id,variant:def.variant,status:'ready',players:[],scores:Object.fromEntries((def.teams??[]).map(t=>[t.id,0])),
    attempts:{},finished:[],round:0,turn:0,startTick:0,lastTick:0,activeTicks:0,seq:0,result:null};
}
/** Appends a stamped event (the only way sessions emit). */
export function emit(s:MiniGameSessionState,out:MiniGameEvent[],tick:number,body:MiniGameEventBody){
  out.push({...body,sessionId:s.sessionId,tick,seq:++s.seq} as MiniGameEvent);
}
const scoreKey=(s:MiniGameSessionState,playerId:string)=>s.players.find(p=>p.id===playerId)?.teamId??playerId;

export function joinSession(s:MiniGameSessionState,def:MiniGameInstanceV1,playerId:string,tick:number,out:MiniGameEvent[],teamId?:string):boolean{
  if(!PLAYER_ID.test(playerId)||s.status==='finished'||s.status==='abandoned'||s.players.some(p=>p.id===playerId)||s.players.length>=def.playersMax)return false;
  const teams=def.teams??[];
  if(teams.length){
    if(teamId===undefined){ // Balanced, deterministic: smallest team, then declaration order.
      teamId=teams.map(t=>({id:t.id,n:s.players.filter(p=>p.teamId===t.id).length})).sort((a,b)=>a.n-b.n)[0].id;
    }else if(!teams.some(t=>t.id===teamId))return false;
  }else teamId=undefined;
  s.players.push(teamId?{id:playerId,teamId}:{id:playerId});
  if(!teams.length)s.scores[playerId]??=0;
  s.attempts[playerId]??=0;
  emit(s,out,tick,{type:'player:join',playerId,...(teamId?{teamId}:{})});
  return true;
}
/** Leaving an active game: the game abandons when nobody remains. */
export function leaveSession(s:MiniGameSessionState,playerId:string,tick:number,out:MiniGameEvent[]):boolean{
  const i=s.players.findIndex(p=>p.id===playerId);if(i<0)return false;
  s.players.splice(i,1);emit(s,out,tick,{type:'player:leave',playerId});
  if(s.turn>=s.players.length)s.turn=0;
  if(!s.players.length&&(s.status==='active'||s.status==='suspended'))abandonSession(s,tick,out);
  return true;
}
export function canStart(s:MiniGameSessionState,def:MiniGameInstanceV1):string|null{
  if(s.status!=='ready')return 'Partie déjà commencée';
  if(s.players.length<def.playersMin&&!(def.rules.practice&&s.players.length>=1))return `Il faut ${def.playersMin} joueur(s)`;
  return null;
}
export function startSession(s:MiniGameSessionState,def:MiniGameInstanceV1,tick:number,out:MiniGameEvent[],mode?:string):boolean{
  if(canStart(s,def))return false;
  const modes=MINIGAME_VARIANTS[def.variant].modes;
  if(modes?.length)s.mode=modes.some(m=>m.id===mode)?mode:def.rules.mode??modes[0].id;else delete s.mode;
  s.status='active';s.startTick=tick;s.lastTick=tick;s.activeTicks=0;s.round=0;s.turn=0;
  emit(s,out,tick,{type:'game:start'});return true;
}
export function suspendSession(s:MiniGameSessionState){if(s.status==='active')s.status='suspended';}
export function resumeSession(s:MiniGameSessionState,tick:number){if(s.status==='suspended'){s.status='active';s.lastTick=tick;}}
/** Exactly one call per fixed tick while active (suspended time is not counted). */
export function tickSession(s:MiniGameSessionState,tick:number){
  if(s.status!=='active')return;
  if(!Number.isSafeInteger(tick)||tick<=s.lastTick)throw Error('Tick de mini-jeu non croissant');
  s.activeTicks+=tick-s.lastTick;s.lastTick=tick;
}
export const sessionSeconds=(s:MiniGameSessionState)=>s.activeTicks/MINIGAME_TICK_HZ;
export function addScore(s:MiniGameSessionState,key:string,delta:number,tick:number,out:MiniGameEvent[]){
  if(!Number.isFinite(delta)||delta===0)return;
  s.scores[key]=(s.scores[key]??0)+delta;emit(s,out,tick,{type:'score:changed',key,score:s.scores[key]});
}
export const playerScoreKey=scoreKey;
export function finishSession(s:MiniGameSessionState,def:MiniGameInstanceV1,reason:string,tick:number,out:MiniGameEvent[]){
  if(s.status!=='active'&&s.status!=='suspended')return;
  const ranking=MINIGAME_VARIANTS[def.variant].ranking,entries=Object.entries(s.scores);
  const best=entries.length?(ranking==='highest'?Math.max(...entries.map(e=>e[1])):Math.min(...entries.map(e=>e[1]))):0;
  // A tie in a team game is a draw (no winner); individual ties share the win.
  let winners=entries.filter(e=>e[1]===best).map(e=>e[0]).sort();
  if(def.teams?.length&&winners.length>1)winners=[];
  s.status='finished';s.result={reason,winners,tick};
  emit(s,out,tick,{type:'game:finish',reason,winners});
}
export function abandonSession(s:MiniGameSessionState,tick:number,out:MiniGameEvent[],playerId?:string){
  if(s.status==='finished'||s.status==='abandoned')return;
  s.status='abandoned';s.result={reason:'abandon',winners:[],tick};
  emit(s,out,tick,{type:'game:abandon',...(playerId?{playerId}:{})});
}
/** New round / reset of the field; scores are kept (use a new session for a new match). */
export function resetRound(s:MiniGameSessionState,tick:number,out:MiniGameEvent[],nextRound=true){
  if(nextRound)s.round++;
  for(const p of s.players)s.attempts[p.id]=0;
  emit(s,out,tick,{type:'game:reset',round:s.round});
}
/** Turn-based variants (bowling, target games): the player's round is over — reset its
 * attempts, count the round and pass the turn. One shared rule, not one per variant. */
export function completeTurn(s:MiniGameSessionState,playerId:string,tick:number,out:MiniGameEvent[]){
  s.attempts[playerId]=0;s.round++;s.turn++;
  emit(s,out,tick,{type:'game:reset',round:s.round});
}
/** Player whose turn it is (turn-based variants), or null. */
export const currentPlayer=(s:MiniGameSessionState)=>s.players[s.turn%Math.max(1,s.players.length)]?.id??null;
