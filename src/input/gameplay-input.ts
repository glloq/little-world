/** Browser-event policy for the game surface. Kept pure for deterministic regression tests.
 * Only the running game captures browser shortcuts; text editing and Studio stay native. */
const RESERVED_GAME_KEYS = new Set(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight']);

/** A HUD input or an editable area keeps native keyboard and context-menu behavior. */
export function isEditableGameTarget(target:EventTarget|null):boolean{
  return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""],[role="textbox"]');
}

export function shouldPreventGameplayKeyDefault(code:string,active:boolean,editing:boolean):boolean{
  return active&&!editing&&RESERVED_GAME_KEYS.has(code);
}
/** The entire running game owns its context menu, regardless of the DOM hit target.
 * Firefox deliberately bypasses this for Shift+right-click, so right-click is not a game binding. */
export function shouldSuppressGameplayContextMenu(running:boolean,editing:boolean):boolean{
  return running&&!editing;
}
/** The same acceleration input launches when stationary, provides a double jump in air,
 * and powers the glider; motion-state-specific gating stays in the deterministic simulator. */
export function flightBoostHeld(mode:string,shiftHeld:boolean,touchAccelerateHeld:boolean):boolean{
  return (mode==='ground'||mode==='air'||mode==='glide')&&(shiftHeld||touchAccelerateHeld);
}
