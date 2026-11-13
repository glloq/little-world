import type * as THREE from 'three';
import type {StudioSession} from '../session.ts';
import type {EditorCamera} from './camera-controller.ts';
import type {SelectionController} from './selection.ts';
/** Services a tool may use. Tools never add DOM listeners themselves: the viewport routes
 * left-button pointer events and shortcut keys to the active tool, so activating and
 * deactivating tools cannot accumulate listeners. Three.js objects a tool creates are
 * released in deactivate(). */
export interface ToolContext {
  session:StudioSession;
  scene:THREE.Scene;
  canvas:HTMLCanvasElement;
  camera:EditorCamera;
  selection:SelectionController;
  ground(e:{clientX:number;clientY:number}):THREE.Vector3|null;
  objectFor(id:string):THREE.Object3D|undefined;
  invalidate(frames?:number):void;
  message(text:string,error?:boolean):void;
  refreshInspector():void;
  setTool(id:string):void;
  /** Run an authoring action, reporting errors in the status bar. */
  run(action:()=>Promise<unknown>):void;
}
export interface Tool {
  readonly id:string;
  readonly cursor?:string;
  activate(context:ToolContext):void;
  deactivate():void;
  pointerDown?(e:PointerEvent):void;
  pointerMove?(e:PointerEvent):void;
  pointerUp?(e:PointerEvent):void;
  /** Returns true when the key was consumed. */
  keyDown?(e:KeyboardEvent):boolean;
  /** Escape: abandon the current operation; false = nothing to cancel. */
  cancel?():boolean;
  /** Called after each committed/undone transaction (sources may have changed). */
  sourcesChanged?():void;
  /** Called every rendered frame (for gizmo/selection following). */
  frame?():void;
}
export class ToolManager {
  private tools=new Map<string,Tool>();private current:Tool|null=null;
  activations=0;deactivations=0;
  private context:ToolContext;
  constructor(context:ToolContext){this.context=context;}
  register(tool:Tool){this.tools.set(tool.id,tool);}
  get active(){return this.current;}
  has(id:string){return this.tools.has(id);}
  activate(id:string){
    const next=this.tools.get(id)??this.tools.get('select')!;if(next===this.current)return;
    if(this.current){this.current.deactivate();this.deactivations++;}
    this.current=next;next.activate(this.context);this.activations++;this.context.canvas.style.cursor=next.cursor??'default';this.context.invalidate(3);
  }
  dispose(){if(this.current){this.current.deactivate();this.deactivations++;}this.current=null;}
}
