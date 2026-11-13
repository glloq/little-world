/** Keeps the field being edited across an inspector re-render.
 * One action can trigger several debounced inspector renders (selection, transaction, camera
 * state of the viewport…), each replacing the whole inspector. Without this, a render landing
 * while the author types replaced the field: focus and typed value were lost and no transaction
 * was created. Before the swap, the focused field is matched in the new content by its
 * accessible label and rank: the typed value, focus and caret are carried over (the edit is still
 * committed once, by the new field, on change). If the field no longer exists (other selection),
 * a pending value is committed first through its own handler, never silently dropped. */
const EDITABLE='input,select,textarea';
type Field=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
const keyOf=(e:Element)=>e.getAttribute('aria-label')??e.getAttribute('name')??'';
/** Value typed but not yet committed (fields made by `input()` record their initial and committed values). */
export function pendingValue(e:Field):string|null{
  const initial=e.dataset.initial;if(initial===undefined||e instanceof HTMLSelectElement||(e instanceof HTMLInputElement&&['checkbox','radio','file','button'].includes(e.type)))return null;
  return e.value!==(e.dataset.committed??initial)?e.value:null;
}
function sameKind(a:Field,b:Element):b is Field{return a.tagName===b.tagName&&(!(a instanceof HTMLInputElement)||(b as HTMLInputElement).type===a.type);}
/** Call with the current and the next inspector content before swapping; run the returned function after. */
export function carryEditing(current:ParentNode,next:ParentNode,active:Element|null=document.activeElement):()=>void{
  if(!active||!active.matches(EDITABLE)||!current.contains(active))return ()=>{};
  const field=active as Field,key=keyOf(field),pending=pendingValue(field);
  const peers=key?[...current.querySelectorAll(EDITABLE)].filter(e=>keyOf(e)===key&&e.tagName===field.tagName):[];
  const rank=peers.indexOf(field),candidate=key&&rank>=0?[...next.querySelectorAll(EDITABLE)].filter(e=>keyOf(e)===key)[rank]:undefined;
  if(!candidate||!sameKind(field,candidate)){if(pending!==null)field.dispatchEvent(new Event('change'));return ()=>{};}
  if(pending!==null)candidate.value=pending;
  let start:number|null=null,end:number|null=null;try{start=(field as HTMLInputElement).selectionStart;end=(field as HTMLInputElement).selectionEnd;}catch{/* number inputs have no caret API */}
  return ()=>{candidate.focus({preventScroll:true});if(start!==null&&end!==null)try{(candidate as HTMLInputElement).setSelectionRange(start,end);}catch{/* idem */}};
}
