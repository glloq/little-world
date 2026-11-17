/** Touch adapter for two primary actions and contextual controls.
 * Each touch pointer is captured independently; the game reads state at its fixed tick. */
export interface JoystickAxis {forward:number;right:number}
export const ZERO_AXIS:Readonly<JoystickAxis>=Object.freeze({forward:0,right:0});
export function joystickAxis(dx:number,dy:number,radius:number,deadzone=.14):JoystickAxis {
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||!Number.isFinite(radius)||radius<=0)return {forward:0,right:0};
  const distance=Math.hypot(dx,dy),cut=Math.min(.9,Math.max(0,deadzone));
  if(distance<=radius*cut)return {forward:0,right:0};
  const strength=Math.min(1,(distance/radius-cut)/(1-cut));
  return {right:dx===0?0:dx/distance*strength,forward:dy===0?0:-dy/distance*strength};
}
export interface TouchControls {
  readonly axis:Readonly<JoystickAxis>;
  readonly jumpHeld:boolean;readonly accelerateHeld:boolean;readonly diveHeld:boolean;
  setMode(mode:string,aboard:boolean,gasAvailable:boolean):void;
  setEnabled(enabled:boolean):void;reset():void;dispose():void;
}
export function createTouchControls(callbacks:{jump():void;action():void;roll():void}):TouchControls {
  const root=document.createElement('div');root.className='touch-controls';root.hidden=true;
  root.setAttribute('aria-label','Commandes tactiles du joueur');
  const stick=document.createElement('div');stick.className='touch-joystick';stick.setAttribute('aria-label','Joystick de déplacement ou pilotage en vol');
  const thumb=document.createElement('span');thumb.className='touch-joystick-thumb';stick.append(thumb);
  const actions=document.createElement('div');actions.className='touch-actions';root.append(stick,actions);document.body.append(root);
  let enabled=false,pointer:number|null=null,axis:JoystickAxis={forward:0,right:0};
  let jumpHeld=false,accelerateHeld=false,diveHeld=false;
  let previousMode='',previousAboard=false,previousGas=false;
  const active=new Map<HTMLButtonElement,number>();
  function clearJoystick(){
    const id=pointer;pointer=null;axis={forward:0,right:0};thumb.style.transform='translate(-50%, -50%)';
    if(id!==null&&stick.hasPointerCapture(id))stick.releasePointerCapture(id);
  }
  function updateStick(e:PointerEvent){
    const r=stick.getBoundingClientRect(),radius=Math.min(r.width,r.height)*.35;
    const dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    axis=joystickAxis(dx,dy,radius);const len=Math.hypot(dx,dy),scale=len>radius?radius/len:1;
    thumb.style.transform='translate(calc(-50% + '+dx*scale+'px), calc(-50% + '+dy*scale+'px))';
  }
  stick.addEventListener('pointerdown',e=>{
    if(!enabled||pointer!==null||e.button!==0)return;
    pointer=e.pointerId;stick.setPointerCapture(e.pointerId);updateStick(e);e.preventDefault();
  });
  stick.addEventListener('pointermove',e=>{if(pointer===e.pointerId&&enabled){updateStick(e);e.preventDefault();}});
  for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)
    stick.addEventListener(type,e=>{if(pointer===e.pointerId)clearJoystick();});
  function hold(label:string,className:string,apply:(value:boolean)=>void,trigger?:()=>void){
    const b=document.createElement('button');b.type='button';b.className='touch-action '+className;b.textContent=label;
    b.setAttribute('aria-label',label);actions.append(b);
    b.addEventListener('pointerdown',e=>{
      if(!enabled||e.button!==0||active.has(b)||b.disabled||b.hidden)return;
      active.set(b,e.pointerId);apply(true);trigger?.();b.setPointerCapture(e.pointerId);
      b.classList.add('pressed');e.preventDefault();
    });
    const release=(e:PointerEvent)=>{if(active.get(b)!==e.pointerId)return;active.delete(b);apply(false);b.classList.remove('pressed');};
    for(const type of ['pointerup','pointercancel','lostpointercapture'] as const)b.addEventListener(type,release);
    b.addEventListener('click',e=>{if(e.detail===0&&enabled&&!b.disabled&&!b.hidden)trigger?.();});
    return b;
  }
  const jump=hold('Saut','touch-jump',v=>{jumpHeld=v;},callbacks.jump);
  const accelerate=hold('Courir','touch-accelerate',v=>{accelerateHeld=v;});
  const interact=hold('Agir','touch-interact',()=>{},callbacks.action);
  const roll=hold('Rouler','touch-roll',()=>{},callbacks.roll);
  const dive=hold('Plonger','touch-dive',v=>{diveHeld=v;});
  function cancel(b:HTMLButtonElement,apply:(value:boolean)=>void){
    const id=active.get(b);if(id!==undefined){active.delete(b);apply(false);b.classList.remove('pressed');if(b.hasPointerCapture(id))b.releasePointerCapture(id);}
  }
  function label(b:HTMLButtonElement,value:string){
    if(b.textContent!==value){b.textContent=value;b.setAttribute('aria-label',value);}
  }
  function setMode(mode:string,aboard:boolean,gasAvailable:boolean){
    if(mode===previousMode&&aboard===previousAboard&&gasAvailable===previousGas)return;
    previousMode=mode;previousAboard=aboard;previousGas=gasAvailable;
    const water=mode==='swim'||mode==='dive',rolling=mode==='roll',flight=mode==='glide';
    label(jump,aboard?'Quitter':water?'Brasse':flight?'Replier':mode==='air'?'Planeur':'Saut');
    label(accelerate,aboard?'Accélérer':flight?'Boost':water?'Nage rapide':rolling?'Accélérer':mode==='air'?'Vitesse':'Courir');
    const accelerateAvailable=aboard||water||rolling||mode==='ground'||(flight&&gasAvailable);
    if(!accelerateAvailable)cancel(accelerate,v=>{accelerateHeld=v;});
    accelerate.disabled=!accelerateAvailable;
    accelerate.setAttribute('aria-label',flight&&!gasAvailable?'Boost (réserve vide)':accelerate.textContent??'Accélérer');
    roll.hidden=aboard||!(mode==='ground'||rolling);
    dive.hidden=!water;interact.hidden=aboard;
    if(roll.hidden)cancel(roll,()=>{});
    if(dive.hidden)cancel(dive,v=>{diveHeld=v;});
    if(interact.hidden)cancel(interact,()=>{});
    root.dataset.mode=aboard?'boat':mode;
  }
  function reset(){
    clearJoystick();
    for(const [b,id] of active){b.classList.remove('pressed');if(b.hasPointerCapture(id))b.releasePointerCapture(id);}
    active.clear();jumpHeld=false;accelerateHeld=false;diveHeld=false;
  }
  const onBlur=()=>reset(),onVisibility=()=>{if(document.hidden)reset();};
  window.addEventListener('blur',onBlur);document.addEventListener('visibilitychange',onVisibility);
  return {
    get axis(){return axis;},get jumpHeld(){return jumpHeld;},
    get accelerateHeld(){return accelerateHeld;},get diveHeld(){return diveHeld;},
    setMode,setEnabled(value:boolean){if(enabled===value)return;enabled=value;root.hidden=!value;if(!value)reset();},
    reset,dispose(){reset();window.removeEventListener('blur',onBlur);document.removeEventListener('visibilitychange',onVisibility);root.remove();},
  };
}
