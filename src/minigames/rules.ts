/**
 * MiniGameRules: small composable end conditions, selected per variant in the catalogue
 * (`MINIGAME_VARIANTS[v].rules`) and parameterised by the instance data. No class per
 * variant: a new game composes existing predicates or adds one entry here.
 */
import {MINIGAME_VARIANTS,type MiniGameRuleId} from './catalog.ts';
import type {MiniGameInstanceV1} from './schema.ts';
import {sessionSeconds,type MiniGameSessionState} from './session.ts';

type RuleCheck=(s:MiniGameSessionState,def:MiniGameInstanceV1)=>string|null;
export const RULE_CHECKS:Record<MiniGameRuleId,RuleCheck>={
  /** A side reached the target score. */
  scoreTarget:(s,d)=>d.rules.scoreTarget!==undefined&&Object.values(s.scores).some(v=>v>=d.rules.scoreTarget!)?'score':null,
  /** Match time elapsed (active ticks only). */
  timeLimit:(s,d)=>d.rules.timeLimitSeconds!==undefined&&sessionSeconds(s)>=d.rules.timeLimitSeconds?'time':null,
  /** Every participant used all attempts of the current round. */
  attempts:(s,d)=>d.rules.attempts!==undefined&&s.players.length>0&&s.players.every(p=>(s.attempts[p.id]??0)>=d.rules.attempts!)?'attempts':null,
  /** Every participant completed the course (holed, or ran out of strokes). */
  allFinished:s=>s.players.length>0&&s.players.every(p=>s.finished.includes(p.id))?'complete':null,
  /** All rounds played (round counter advanced by the variant). */
  rounds:(s,d)=>d.rules.rounds!==undefined&&s.round>=d.rules.rounds*Math.max(1,s.players.length)?'rounds':null,
};
/** First satisfied end condition of the variant, in catalogue order (deterministic). */
export function finishReason(s:MiniGameSessionState,def:MiniGameInstanceV1):string|null{
  if(s.status!=='active')return null;
  for(const id of MINIGAME_VARIANTS[def.variant].rules){const r=RULE_CHECKS[id](s,def);if(r)return r;}
  return null;
}
