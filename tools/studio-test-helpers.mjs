/** Shared Studio browser-test helpers.
 * One user action can trigger several debounced inspector renders (selection, transaction,
 * viewport refresh; measured locally at ≈ 25, 55 and 310 ms after selecting a light). Editing a
 * field that a later render replaces sends the change to a detached element, so the transaction
 * is never created. `inspectorSettled` waits until the inspector has been quiet for `quietMs`.
 * The observer is (re)installed per page load. */
export function inspectorSettled(page,quietMs=400){
  return page.waitForFunction(q=>{
    const box=document.querySelector('#inspector');if(!box)return false;
    if(window.__inspectorWatchTarget!==box){window.__inspectorChanged=performance.now();window.__inspectorWatchTarget=box;
      new MutationObserver(()=>{window.__inspectorChanged=performance.now();}).observe(box,{childList:true,subtree:true});return false;}
    return performance.now()-window.__inspectorChanged>q;
  },quietMs,{polling:50,timeout:15000});
}
