/** Single notification manager of the player interface.
 *  - `NotificationQueue` (pure, time injected): merges repeats by key (5 pickaxe strokes → one
 *    « +5 Pierre »), drops duplicates, keeps priorities, shows at most 3 items, important ones
 *    longer. Never placed in the centre of the screen.
 *  - `createNotificationCenter`: DOM rendering on push / expiry only (no per-frame work). The
 *    newest item keeps the historical `#message` id (live region read by assistive tech/tests);
 *    quest progress goes to a separate top banner. */
export type NoticeKind='gain'|'success'|'info'|'warning'|'error'|'quest'|'discovery'|'save';
export interface Notice {key:string;kind:NoticeKind;text:string;count:number;amount:number;priority:number;createdAt:number;expiresAt:number}
const DURATION:Record<NoticeKind,number>={gain:3,success:3,info:3.3,warning:4,error:6,quest:5,discovery:4,save:3};
const PRIORITY:Record<NoticeKind,number>={gain:0,info:0,success:1,save:1,discovery:2,warning:2,quest:3,error:4};
export class NotificationQueue {
  private items:Notice[]=[];
  /** Repeats of the same key within its lifetime are merged; returns the (new or merged) notice. */
  push(input:{kind:NoticeKind;text:string;key?:string;amount?:number;label?:string},now:number):Notice{
    const key=input.key??input.kind+':'+input.text,current=this.items.find(n=>n.key===key&&n.expiresAt>now);
    if(current){current.count++;current.amount+=input.amount??0;if(input.label&&input.amount!==undefined)current.text=`+${current.amount} ${input.label}`;current.expiresAt=now+DURATION[current.kind];current.createdAt=now;return current;}
    const notice:Notice={key,kind:input.kind,text:input.label&&input.amount!==undefined?`+${input.amount} ${input.label}`:input.text,count:1,amount:input.amount??0,priority:PRIORITY[input.kind],createdAt:now,expiresAt:now+DURATION[input.kind]};
    this.items.push(notice);if(this.items.length>20)this.items.splice(0,this.items.length-20);return notice;
  }
  /** Visible notices: not expired, highest priority first, then most recent; at most `max`. */
  visible(now:number,max=3):Notice[]{this.items=this.items.filter(n=>n.expiresAt>now);return [...this.items].sort((a,b)=>b.priority-a.priority||b.createdAt-a.createdAt).slice(0,max);}
  nextExpiry(now:number){const v=this.items.filter(n=>n.expiresAt>now);return v.length?Math.min(...v.map(n=>n.expiresAt)):null;}
}
export interface NotificationCenter {
  notify(kind:NoticeKind,text:string,options?:{key?:string}):void;
  /** Resource gained (merged per item while visible). */gain(itemId:string,label:string,amount:number):void;
  /** Mission / objective progress: top banner, kept longer. */quest(text:string):void;
  readonly queue:NotificationQueue;dispose():void;
}
export function createNotificationCenter(parent:HTMLElement,sound?:(kind:NoticeKind)=>void,clock:()=>number=()=>performance.now()/1000):NotificationCenter{
  const stack=document.createElement('div');stack.className='ui-notifications';stack.setAttribute('aria-live','polite');
  // Historical live element: always present, text of the newest notice (hidden when expired).
  const latest=document.createElement('div');latest.id='message';latest.className='ui-notice hide';latest.setAttribute('role','status');
  const banner=document.createElement('div');banner.id='quest-banner';banner.className='ui-quest-banner hide';banner.setAttribute('role','status');
  stack.append(latest);parent.append(banner,stack);
  const queue=new NotificationQueue();let timer:ReturnType<typeof setTimeout>|undefined,bannerTimer:ReturnType<typeof setTimeout>|undefined,newest:Notice|null=null;
  function render(){
    const now=clock(),visible=queue.visible(now).filter(n=>n.kind!=='quest');
    for(const node of [...stack.children])if(node!==latest)node.remove();
    if(newest&&newest.expiresAt>now&&newest.kind!=='quest'){latest.textContent=newest.text+(newest.count>1&&!newest.amount?` ×${newest.count}`:'');latest.dataset.kind=newest.kind;latest.classList.remove('hide');}else latest.classList.add('hide');
    for(const n of visible){if(n===newest)continue;const item=document.createElement('div');item.className='ui-notice';item.dataset.kind=n.kind;item.textContent=n.text+(n.count>1&&!n.amount?` ×${n.count}`:'');stack.append(item);}
    clearTimeout(timer);const next=queue.nextExpiry(now);if(next!==null)timer=setTimeout(render,Math.max(50,(next-now)*1000+20));
  }
  const push=(input:Parameters<NotificationQueue['push']>[0])=>{const fresh=queue.push(input,clock());const merged=fresh.count>1;newest=fresh;render();if(!merged)sound?.(fresh.kind);};
  return {
    queue,
    notify:(kind,text,options={})=>push({kind,text,key:options.key}),
    gain:(itemId,label,amount)=>push({kind:'gain',text:'',key:'gain:'+itemId,amount,label}),
    quest(text){const n=queue.push({kind:'quest',text},clock());banner.textContent=text;banner.classList.remove('hide');clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>banner.classList.add('hide'),(n.expiresAt-clock())*1000);sound?.('quest');},
    dispose(){clearTimeout(timer);clearTimeout(bannerTimer);stack.remove();banner.remove();},
  };
}
