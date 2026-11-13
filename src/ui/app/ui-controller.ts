/** Central UI state: one panel open at a time, in-app confirmations, focus trap and restore,
 * Escape routing. Pure interface state — nothing here is saved with the game. */
import {el,button,trapFocus} from '../shared/dom.ts';

export interface PanelOptions {
  /** Pauses the world simulation while open (menus); inventory/journal/map do not. */pauses?:boolean;
  /** Renders the panel body each time it opens (and on refresh while open). */render(body:HTMLElement):void;
  onClose?():void;
}
interface Registered extends PanelOptions {id:string;title:string;root:HTMLElement;body:HTMLElement}
export class UiController {
  private panels=new Map<string,Registered>();private current:Registered|null=null;private previousFocus:HTMLElement|null=null;
  private modal:HTMLElement|null=null;private host:HTMLElement;private listeners=new Set<(id:string|null)=>void>();
  constructor(host:HTMLElement){this.host=host;}
  register(id:string,title:string,options:PanelOptions){
    const root=el('section','ui-panel');root.hidden=true;root.dataset.panel=id;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label',title);
    const head=el('header','ui-panel-head'),body=el('div','ui-panel-body');head.append(el('h2','',title),button('Fermer · Échap',()=>this.close(),'ui-button ui-close'));
    root.append(head,body);this.host.append(root);this.panels.set(id,{...options,id,title,root,body});
  }
  get active(){return this.current?.id??null;}
  has(id:string){return this.panels.has(id);}
  /** Game inputs are suspended while a panel or a confirmation is open. */
  get blocking(){return this.current!==null||this.modal!==null;}
  get paused(){return !!this.current?.pauses||this.modal!==null;}
  onChange(listener:(id:string|null)=>void){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  open(id:string){
    const p=this.panels.get(id);if(!p)return;if(this.current&&this.current!==p)this.hide(this.current);
    if(!this.current)this.previousFocus=document.activeElement as HTMLElement|null;
    this.current=p;p.render(p.body);p.root.hidden=false;
    (p.body.querySelector<HTMLElement>('[data-autofocus],button,input,select')??p.root.querySelector<HTMLElement>('.ui-close'))?.focus();
    for(const l of this.listeners)l(id);
  }
  toggle(id:string){if(this.current?.id===id)this.close();else this.open(id);}
  /** Re-render the open panel (state changed while it is visible). */
  refresh(id?:string){if(this.current&&(!id||this.current.id===id)){const focused=document.activeElement as HTMLElement|null,key=focused?.dataset.focusKey;this.current.render(this.current.body);if(key)this.current.body.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)?.focus();}}
  close(){if(!this.current)return;this.hide(this.current);this.current=null;this.previousFocus?.focus?.();this.previousFocus=null;for(const l of this.listeners)l(null);}
  private hide(p:Registered){p.root.hidden=true;p.onClose?.();}
  /** In-app confirmation for destructive operations (never window.confirm). */
  confirm(text:string,confirmLabel:string,cancelLabel='Annuler'):Promise<boolean>{
    return new Promise(resolve=>{
      const box=el('div','ui-modal');box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Confirmation');
      const back=document.activeElement as HTMLElement|null,done=(v:boolean)=>{box.remove();this.modal=null;window.removeEventListener('keydown',key,true);back?.focus?.();resolve(v);};
      const ok=button(confirmLabel,()=>done(true),'ui-button ui-primary'),no=button(cancelLabel,()=>done(false));
      const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();done(false);}else if(trapFocus(box,e))e.stopImmediatePropagation();};
      const card=el('div','ui-modal-card');card.append(el('p','',text),el('div','ui-row',''));card.lastElementChild!.append(no,ok);box.append(card);this.host.append(box);this.modal=box;window.addEventListener('keydown',key,true);no.focus();
    });
  }
  /** Keys while a panel is open: Escape closes, Tab stays inside. Returns true when consumed. */
  handleKey(e:KeyboardEvent):boolean{
    if(this.modal)return true;if(!this.current)return false;
    if(e.key==='Escape'){e.preventDefault();this.close();return true;}
    trapFocus(this.current.root,e);return true;
  }
}
