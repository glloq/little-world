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
export function shouldSuppressGameplayContextMenu(running:boolean,onGameSurface:boolean,editing:boolean):boolean{
  return running&&onGameSurface&&!editing;
}
/** Shift is the same contextual acceleration button on ground, water and in flight. */
export function flightBoostHeld(mode:string,rightMouseHeld:boolean,shiftHeld:boolean,touchAccelerateHeld:boolean):boolean{
  return mode==='glide'&&(rightMouseHeld||shiftHeld||touchAccelerateHeld);
}
