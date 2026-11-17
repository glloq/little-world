/** Touch input adapter for the existing Controls simulation.
 * One active pointer for the joystick, independent pointer captures for actions.
 * This module does not emulate keyboard events or create any per-frame timers. */
export interface JoystickAxis {forward:number;right:number}
export const ZERO_AXIS:Readonly<JoystickAxis>=Object.freeze({forward:0,right:0});
export function joystickAxis(dx:number,dy:number,radius:number,deadzone=.14):JoystickAxis {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(radius)||radius<=0)return {forward:0,right:0};
  const distance=Math.hypot(dx,dy),cut=Math.min(.9,Math.max(0,deadzone));
  if(distance<=radius*cut)return {forward:0,right:0};
  const strength=Math.min(1,(distance/radius-cut)/(1-cut));
  return {right:dx/distance*strength,forward:-dy/distance*strength};
}
export interface TouchControls {
  readonly axis:Readonly<JoystickAxis>;
  readonly jumpHeld:boolean;
  readonly rollHeld:boolean;
  readonly diveHeld:boolean;
  setEnabled(enabled:boolean):void;
  reset():void;
  dispose():void;
}
export function createTouchControls(callbacks:{jump():void;action():void}):TouchControls {
  const root=document.createElement('div');root.className='touch-controls';root.hidden=true;
  root.setAttribute('aria-label','Commandes tactiles du joueur');
  const stick=document.createElement('div');stick.className='touch-joystick';stick.setAttribute('aria-label','Joystick de déplacement');
  const thumb=document.createElement('span');thumb.className='touch-joystick-thumb';stick.append(thumb);
  const actions=document.createElement('div');actions.className='touch-actions';
  root.append(stick,actions);document.body.append(root);
  let enabled=false,pointer:number|null=null,axis:JoystickAxis={forward:0,right:0};
  let jumpHeld=false,rollHeld=false,diveHeld=false;
  const active=new Map<HTMLButtonElement,number>();
  const clearJoystick=()=>{pointer=null;axis={forward:0,right:0};thumb.style.transform='translate(-50%, -50%)';};
  function updateStick(e:PointerEvent){
    const r=stick.getBoundingClientRect(),radius=Math.min(r.width,r.height)*.35;
    const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    axis=joystickAxis(dx,dy,radius);
    const len=Math.hypot(dx,dy),scale=len>radius?radius/len:1;
    thumb.style.transform=`translate(calc(-50% + ${dx*scale}px), calc(-50% + ${dy*scale}px))`;
  }
  stick.addEventListener('pointerdown',e=>{
    if(!enabled||pointer!==null||e.button!==0)return;
    pointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);e.preventDefault();
  });
  stick.addEventListener('pointermove',e=>{if(pointer===e.pointerId&&enabled){updateStick(e);e.preventDefault();}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)
    stick.addEventListener(type,e=>{if(pointer===e.pointerId)clearJoystick();});
  function hold(label:string,className:string,apply:(value:boolean)=>void,trigger?:()=>void) {
    const b=document.createElement('button');b.type='button';b.className='touch-action '+className;b.textContent=label;
    b.setAttribute('aria-label',label);actions.append(b);
    b.addEventListener('pointerdown',e=>{
      if(!enabled||e.button!==0||active.has(b))return;
      active.set(b,e.pointerId);apply(true);trigger?.();b.setPointerCapture(e.pointerId);b.classList.add('pressed');e.preventDefault();
    });
    const release=(e:PointerEvent)=>{if(active.get(b)!==e.pointerId)return;active.delete(b);apply(false);b.classList.remove('pressed');};
    for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(type,release);
    // Accessibility: keyboard activation of the DOM control, without duplicate touch clicks.
    b.addEventListener('click',e=>{if(e.detail===0&&enabled){trigger?.();}});
    return b;
  }
  hold('Saut','touch-jump',v=>{jumpHeld=v;},callbacks.jump);
  hold('Agir','touch-interact',()=>{},callbacks.action);
  hold('Rouler','touch-roll',v=>{rollHeld=v;});
  hold('Plonger','touch-dive',v=>{diveHeld=v;});
  const reset=()=>{
    clearJoystick();jumpHeld=false;rollHeld=false;diveHeld=false;
    for(const b of active.keys())b.classList.remove('pressed');
    active.clear();
  };
  const onBlur=()=>reset();
  const onVisibility=()=>{if(document.hidden)reset();};
  window.addEventListener('blur',onBlur);
  document.addEventListener('visibilitychange',onVisibility);
  return {
    get axis(){return axis;},
    get jumpHeld(){return jumpHeld;},
    get rollHeld(){return rollHeld;},
    get diveHeld(){return diveHeld;},
    setEnabled(value:boolean){if(enabled===value)return;enabled=value;root.hidden=!value;if(!value)reset();},
    reset,
    dispose(){reset();window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);root.remove();},
  };
}
