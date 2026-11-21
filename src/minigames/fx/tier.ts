/** Graphic tier of mini-game presentation (doc 107 §qualité): the player's quality setting,
 * lowered one step per level of the game's single adaptive controller (PresentationBudget),
 * same rule as `surfQualityProfile`. Tiny module: main.ts imports it lazily with the host. */
import type {MiniGameFxTier} from '../types.ts';
export function minigameFxTier(userQuality:string,budgetLevel:number):MiniGameFxTier{
  const base=userQuality==='low'?0:userQuality==='high'?2:1,level=Math.max(0,Math.min(2,Math.round(budgetLevel)||0));
  return (['low','medium','high'] as const)[Math.max(0,base-level)];
}
