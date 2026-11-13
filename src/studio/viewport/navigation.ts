import type {EditorCamera} from './camera-controller.ts';
/** DOM bindings of E1. Right button = orient/orbit (+ WASD/ZQSD, E/Q, Shift = free flight),
 * middle button = pan, wheel = zoom towards the cursor, Alt + left = orbit (trackpads).
 * The left button is never captured here: it always belongs to the active tool, so a tool
 * can never block the camera and the camera never steals a selection or a brush stroke. */
export interface NavigationOptions {
  pick:(clientX:number,clientY:number)=>{x:number;y:number;z:number}|null;
  heightPx:()=>number;
  isActive:()=>boolean;
  onInteract:()=>void;
  onSettled:()=>void;
}
export interface Navigation {readonly dragging:boolean;readonly flying:boolean;update(dt:number):boolean;dispose():void;listenerCount:number}
const MOVE:Record<string,[number,number,number]>={KeyW:[1,0,0],KeyS:[-1,0,0],KeyA:[0,-1,0],KeyD:[0,1,0],KeyE:[0,0,1],KeyQ:[0,0,-1],PageUp:[0,0,1],PageDown:[0,0,-1],ArrowUp:[1,0,0],ArrowDown:[-1,0,0],ArrowLeft:[0,-1,0],ArrowRight:[0,1,0]};
export function isFormTarget(target:EventTarget|null){return target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement||target instanceof HTMLSelectElement||(target instanceof HTMLElement&&target.isContentEditable);}
export function attachNavigation(canvas:HTMLCanvasElement,camera:EditorCamera,options:NavigationOptions):Navigation{
  let drag:{mode:'rotate'|'pan';pointer:number;x:number;y:number;moved:boolean}|null=null,settle:ReturnType<typeof setTimeout>|undefined;
  const held=new Set<string>();let fast=false;
  const settled=()=>{clearTimeout(settle);settle=setTimeout(options.onSettled,350);};
  const down=(e:PointerEvent)=>{
    if(!options.isActive())return;
    const mode=e.button===2||(e.button===0&&e.altKey)?'rotate':e.button===1?'pan':null;if(!mode)return;
    e.preventDefault();e.stopImmediatePropagation();canvas.focus({preventScroll:true});
    drag={mode,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);canvas.dataset.navigating=mode;
  };
  const move=(e:PointerEvent)=>{
    if(!drag||e.pointerId!==drag.pointer)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(!dx&&!dy)return;
    drag.x=e.clientX;drag.y=e.clientY;drag.moved=true;
    if(drag.mode==='rotate')camera.rotate(dx,dy);else camera.pan(dx,dy,options.heightPx());options.onInteract();
  };
  const up=(e:PointerEvent)=>{if(!drag||e.pointerId!==drag.pointer)return;drag=null;held.clear();delete canvas.dataset.navigating;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);settled();options.onInteract();};
  const cancel=()=>{drag=null;held.clear();delete canvas.dataset.navigating;};
  const wheel=(e:WheelEvent)=>{
    if(!options.isActive())return;e.preventDefault();
    const steps=Math.sign(e.deltaY)*Math.min(3,Math.max(1,Math.abs(e.deltaY)/100));
    camera.zoomAt(options.pick(e.clientX,e.clientY),steps);options.onInteract();settled();
  };
  const context=(e:Event)=>e.preventDefault();
  // Movement keys only while the right button is held: elsewhere letters stay tool shortcuts.
  const key=(e:KeyboardEvent)=>{
    fast=e.shiftKey;
    if(e.type==='keyup'){if(held.delete(e.code)&&!held.size)settled();return;}
    if(!drag||drag.mode!=='rotate'||!MOVE[e.code]||isFormTarget(e.target))return;
    e.preventDefault();held.add(e.code);options.onInteract();
  };
  const blur=()=>{held.clear();drag=null;delete canvas.dataset.navigating;};
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel);
  canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('contextmenu',context);
  window.addEventListener('keydown',key);window.addEventListener('keyup',key);window.addEventListener('blur',blur);
  return {
    get dragging(){return drag!==null;},
    get flying(){return held.size>0;},
    listenerCount:10,
    update(dt){
      let moved=camera.update(dt);
      if(held.size){const input={forward:0,right:0,up:0,fast};for(const code of held){const [f,r,u]=MOVE[code];input.forward+=f;input.right+=r;input.up+=u;}moved=camera.fly(dt,input)||moved;}
      return moved;
    },
    dispose(){
      clearTimeout(settle);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',cancel);canvas.removeEventListener('lostpointercapture',cancel);
      canvas.removeEventListener('wheel',wheel);canvas.removeEventListener('contextmenu',context);window.removeEventListener('keydown',key);window.removeEventListener('keyup',key);window.removeEventListener('blur',blur);
    },
  };
}
