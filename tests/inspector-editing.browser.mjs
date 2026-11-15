// carryEditing (src/studio/inspector-editing.ts) in a real DOM, without a server: the module is
// transformed by Vite's esbuild (direct dev dependency; the module has no imports) and injected
// into a blank page.
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {transformWithEsbuild} from 'vite';
import assert from 'node:assert/strict';
const file=new URL('../src/studio/inspector-editing.ts',import.meta.url).pathname,bundle=(await transformWithEsbuild(await readFile(file,'utf8'),file,{format:'iife',globalName:'Editing'})).code;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
let checks=0;const check=(ok,label)=>{assert.ok(ok,'FAILED: '+label);checks++;console.log('OK: '+label);};
try{
  const page=await browser.newPage();await page.setContent('<!doctype html><div id="cur"></div><div id="next"></div>');await page.addScriptTag({content:bundle});
  const run=fn=>page.evaluate(`(${fn})()`);
  // Helpers in the page: a field like dom.ts input() (initial / committed values, change handler).
  await run(()=>{window.mk=(label,value,type='text')=>{const e=document.createElement('input');e.type=type;e.value=value;e.dataset.initial=value;e.setAttribute('aria-label',label);e.changes=0;e.onchange=()=>{e.dataset.committed=e.value;e.changes++;};return e;};
    window.reset=()=>{cur.replaceChildren();next.replaceChildren();};});
  let r=await run(()=>{reset();const a=mk('Nom','Caisse'),b=mk('Nom','Caisse');cur.append(a);next.append(b);a.focus();a.value='Caisse test';a.setSelectionRange(3,5);
    const after=Editing.carryEditing(cur,next);cur.replaceChildren(...next.childNodes);after();return {value:b.value,focused:document.activeElement===b,caret:[b.selectionStart,b.selectionEnd],changesOld:a.changes,changesNew:b.changes};});
  check(r.value==='Caisse test'&&r.focused&&r.caret[0]===3&&r.caret[1]===5,'Typed value, focus and caret carried to the new field');
  check(r.changesOld===0&&r.changesNew===0,'Nothing committed by the render itself (one transaction later, on change)');
  r=await run(()=>{reset();const a=mk('Nom','A'),other=mk('Rayon','2');cur.append(a);next.append(other);a.focus();a.value='B';const after=Editing.carryEditing(cur,next);cur.replaceChildren(...next.childNodes);after();return {changes:a.changes,committed:a.dataset.committed};});
  check(r.changes===1&&r.committed==='B','Field gone from the new content: the pending value is committed first, never dropped');
  r=await run(()=>{reset();const a=mk('Nom','A');cur.append(a);next.append(mk('Rayon','2'));a.focus();const after=Editing.carryEditing(cur,next);after();return a.changes;});
  check(r===0,'Field gone but nothing typed: no spurious transaction');
  r=await run(()=>{reset();const a=mk('Nom','A');cur.append(a);a.focus();a.value='B';a.dispatchEvent(new Event('change'));const n=mk('Nom','A');next.append(n);const after=Editing.carryEditing(cur,next);cur.replaceChildren(...next.childNodes);after();return {pending:Editing.pendingValue(a),value:n.value,changes:a.changes};});
  check(r.pending===null&&r.changes===1&&r.value==='A','An already committed value is not pending (no double commit)');
  r=await run(()=>{reset();const [x1,x2]=[mk('X','1','number'),mk('X','2','number')],[y1,y2]=[mk('X','1','number'),mk('X','2','number')];cur.append(x1,x2);next.append(y1,y2);x2.focus();x2.value='7';const after=Editing.carryEditing(cur,next);cur.replaceChildren(...next.childNodes);after();return {first:y1.value,second:y2.value,focused:document.activeElement===y2};});
  check(r.first==='1'&&r.second==='7'&&r.focused,'Same label several times: the field of the same rank is used (number input without caret API)');
  r=await run(()=>{reset();const s=document.createElement('select');s.setAttribute('aria-label','Mode');s.add(new Option('a','a'));s.add(new Option('b','b'));const t=s.cloneNode(true);t.value='b';cur.append(s);next.append(t);s.focus();const after=Editing.carryEditing(cur,next);cur.replaceChildren(...next.childNodes);after();return {focused:document.activeElement===t,value:t.value};});
  check(r.focused&&r.value==='b','A focused select gets its focus back and keeps the rendered value');
  r=await run(()=>{reset();const out=mk('Recherche','');document.body.append(out);out.focus();out.value='abc';cur.append(mk('Nom','A'));next.append(mk('Nom','A'));const after=Editing.carryEditing(cur,next);after();const res={focused:document.activeElement===out,changes:out.changes};out.remove();return res;});
  check(r.focused&&r.changes===0,'Focus outside the inspector is left alone');
  r=await run(()=>{reset();const c=mk('Visible','on','checkbox');cur.append(c);next.append(mk('Visible','on','checkbox'));c.focus();c.checked=!c.checked;return Editing.pendingValue(c);});
  check(r===null,'Checkboxes are never treated as pending text');
  console.log(JSON.stringify({checks}));
}finally{await browser.close();}
