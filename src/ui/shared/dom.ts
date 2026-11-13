/** Small DOM helpers shared by every panel. Author/player data is always written as text. */
export function el<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text=''):HTMLElementTagNameMap[K]{const e=document.createElement(tag);if(className)e.className=className;if(text)e.textContent=text;return e;}
export function button(label:string,onClick:()=>unknown,className='ui-button',title=''):HTMLButtonElement{const b=el('button',className,label);b.type='button';if(title)b.title=title;b.addEventListener('click',()=>{void onClick();});return b;}
export function kbd(key:string){return el('kbd','',key);}
/** Keyboard focus stays inside an open panel (Tab / Shift+Tab cycle). */
export function trapFocus(root:HTMLElement,e:KeyboardEvent):boolean{
  if(e.key!=='Tab')return false;
  const items=[...root.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],summary,[tabindex="0"]')].filter(x=>x.offsetParent!==null);
  if(!items.length)return false;const at=items.indexOf(document.activeElement as HTMLElement);
  items[(at+(e.shiftKey?-1:1)+items.length)%items.length].focus();e.preventDefault();return true;
}
