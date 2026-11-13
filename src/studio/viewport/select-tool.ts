import * as THREE from 'three';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {terrainHeight} from '../../terrain.ts';
import {applyTransforms,transformChunkIds,entityTransform,duplicateEntities,duplicateChunkIds,deleteEntities,type TransformUpdate} from '../../studio-core/transforms.ts';
import {ReferenceIndex} from '../../studio-core/references.ts';
import type {Tool,ToolContext} from './tools.ts';

/** Shared, user-adjustable gizmo settings (tool panel and shortcuts edit the same object). */
export const transformSettings={mode:'translate' as 'translate'|'rotate'|'scale',snap:false,grid:1,angle:15,followTerrain:true,space:'world' as 'world'|'local'};
interface Start {id:string;object:THREE.Object3D;matrix:THREE.Matrix4;offset:number}
/** E2 + E3 — click/Shift-click selection, hover, and gizmo transforms of one or many
 * entities. A complete drag is ONE transaction committed on release; Escape during a drag
 * restores the start state without touching the sources. */
export class SelectTool implements Tool {
  readonly id='select';
  private ctx!:ToolContext;
  private gizmo:TransformControls|null=null;
  private pivot=new THREE.Object3D();
  private pivotStart=new THREE.Matrix4();
  private starts:Start[]=[];
  private down:{x:number;y:number}|null=null;
  private gizmoUsed=false;
  private cancelled=false;
  private lastHover=0;
  activate(ctx:ToolContext){
    this.ctx=ctx;const gizmo=new TransformControls(ctx.camera.camera,ctx.canvas);this.gizmo=gizmo;
    ctx.scene.add(this.pivot,gizmo.getHelper());this.applySettings();
    gizmo.addEventListener('mouseDown',this.onGizmoDown);gizmo.addEventListener('objectChange',this.onGizmoChange);gizmo.addEventListener('mouseUp',this.onGizmoUp);gizmo.addEventListener('change',this.onGizmoRedraw);
    this.placePivot();
  }
  deactivate(){
    const g=this.gizmo;if(g){g.removeEventListener('mouseDown',this.onGizmoDown);g.removeEventListener('objectChange',this.onGizmoChange);g.removeEventListener('mouseUp',this.onGizmoUp);g.removeEventListener('change',this.onGizmoRedraw);g.detach();g.getHelper().removeFromParent();g.dispose();}
    this.gizmo=null;this.pivot.removeFromParent();this.starts=[];this.ctx.selection.setHover(null);
  }
  applySettings(){
    const g=this.gizmo;if(!g)return;const s=transformSettings;g.setMode(s.mode);g.setSpace(s.space);
    g.setTranslationSnap(s.snap?s.grid:null);g.setRotationSnap(s.snap?THREE.MathUtils.degToRad(s.angle):null);g.setScaleSnap(s.snap?.1:null);this.ctx?.invalidate(3);
  }
  get dragging(){return !!this.gizmo?.dragging;}
  pointerDown(e:PointerEvent){if(e.button!==0)return;this.down={x:e.clientX,y:e.clientY};this.gizmoUsed=!!this.gizmo&&this.gizmo.axis!==null;}
  pointerMove(e:PointerEvent){
    if(e.buttons||performance.now()-this.lastHover<50)return;this.lastHover=performance.now();
    this.ctx.selection.setHover(this.ctx.selection.pick(e,this.ctx.canvas,this.ctx.camera.camera));this.ctx.invalidate(2);
  }
  pointerUp(e:PointerEvent){
    const start=this.down;this.down=null;if(e.button!==0||!start||this.gizmoUsed||this.dragging){this.gizmoUsed=false;return;}
    if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
    this.ctx.selection.click(this.ctx.selection.pick(e,this.ctx.canvas,this.ctx.camera.camera),e.shiftKey);this.ctx.refreshInspector();this.ctx.invalidate(3);
  }
  keyDown(e:KeyboardEvent){
    const key=e.key.toLowerCase();
    if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&(key==='w'||key==='e'||key==='r')){transformSettings.mode=key==='w'?'translate':key==='e'?'rotate':'scale';this.applySettings();return true;}
    if((e.ctrlKey||e.metaKey)&&key==='d'){this.duplicate();return true;}
    if(e.key==='Delete'||e.key==='Backspace'){this.remove();return true;}
    return false;
  }
  cancel(){
    if(!this.dragging)return false;this.cancelled=true;
    for(const s of this.starts)s.matrix.decompose(s.object.position,s.object.quaternion,s.object.scale);
    this.pivot.matrix.copy(this.pivotStart);this.pivot.matrix.decompose(this.pivot.position,this.pivot.quaternion,this.pivot.scale);this.ctx.invalidate(3);return true;
  }
  sourcesChanged(){this.placePivot();}
  frame(){if(this.gizmo){this.gizmo.camera=this.ctx.camera.camera;if(!this.dragging)this.placePivot(false);}}
  /** Pivot at the centroid of the selected objects (orientation of the primary in local space). */
  private placePivot(attach=true){
    const g=this.gizmo;if(!g)return;const objects=this.ctx.selection.ids.map(id=>this.ctx.objectFor(id)).filter((o):o is THREE.Object3D=>!!o);
    if(!objects.length){if(g.object)g.detach();return;}
    const center=new THREE.Vector3();for(const o of objects)center.add(o.getWorldPosition(new THREE.Vector3()));center.divideScalar(objects.length);
    this.pivot.position.copy(center);this.pivot.quaternion.copy(transformSettings.space==='local'?objects[0].quaternion:new THREE.Quaternion());this.pivot.scale.set(1,1,1);this.pivot.updateMatrixWorld(true);
    if(attach||!g.object)g.attach(this.pivot);
  }
  private onGizmoRedraw=()=>this.ctx.invalidate(2);
  private onGizmoDown=()=>{
    this.cancelled=false;this.pivot.updateMatrixWorld(true);this.pivotStart.copy(this.pivot.matrixWorld);const p=this.ctx.session.document;
    this.starts=this.ctx.selection.ids.flatMap(id=>{const object=this.ctx.objectFor(id);if(!object)return [];object.updateMatrixWorld(true);let offset=0;try{offset=entityTransform(p,id).position.y;}catch{/* unloaded */}return [{id,object,matrix:object.matrix.clone(),offset}];});
  };
  private onGizmoChange=()=>{
    if(this.cancelled)return;this.pivot.updateMatrixWorld(true);const delta=this.pivot.matrixWorld.clone().multiply(this.pivotStart.clone().invert()),lift=this.pivot.position.y-new THREE.Vector3().setFromMatrixPosition(this.pivotStart).y;
    for(const s of this.starts){
      new THREE.Matrix4().multiplyMatrices(delta,s.matrix).decompose(s.object.position,s.object.quaternion,s.object.scale);
      // Follow the relief: horizontal moves keep the height offset above the new ground.
      if(transformSettings.mode==='translate'&&transformSettings.followTerrain)s.object.position.y=terrainHeight(s.object.position.x,s.object.position.z)+s.offset+lift;
    }
    this.ctx.invalidate(2);
  };
  private onGizmoUp=()=>{
    const starts=this.starts;this.starts=[];if(this.cancelled||!starts.length){this.cancelled=false;return;}
    const updates:TransformUpdate[]=starts.map(s=>{const o=s.object;return {id:s.id,transform:{position:{x:o.position.x,y:o.position.y-terrainHeight(o.position.x,o.position.z),z:o.position.z},rotation:{x:o.quaternion.x,y:o.quaternion.y,z:o.quaternion.z,w:o.quaternion.w},scale:{x:o.scale.x,y:o.scale.y,z:o.scale.z}}};});
    const label=transformSettings.mode==='translate'?'Déplacer':transformSettings.mode==='rotate'?'Pivoter':'Mettre à l’échelle';
    this.ctx.run(async()=>{const s=this.ctx.session;await s.change(`${label} ${updates.length>1?updates.length+' éléments':'un élément'}`,transformChunkIds(s.document,updates),d=>applyTransforms(d,updates));this.ctx.refreshInspector();});
  };
  duplicate(){
    const ids=this.ctx.selection.ids;if(!ids.length)return;const offset={x:Math.max(2,transformSettings.snap?transformSettings.grid:2),y:0,z:0};
    this.ctx.run(async()=>{const s=this.ctx.session;await s.hydrate(ids.map(id=>s.document.entityIndex[id]?.ownerChunkId).filter(Boolean) as string[]);let created:string[]=[];
      await s.change(ids.length>1?`Dupliquer ${ids.length} éléments`:'Dupliquer',duplicateChunkIds(s.document,ids,offset),d=>{created=duplicateEntities(d,ids,offset);});
      s.selection.setSelection(created.map(id=>({kind:'entity',id})));this.ctx.message(`${created.length} copie(s) créée(s) ; la logique (interactions, dialogue) n’est pas copiée.`);this.ctx.refreshInspector();});
  }
  remove(){
    const ids=this.ctx.selection.ids;if(!ids.length)return;const s=this.ctx.session,p=s.document,refs=new ReferenceIndex(p),dependents=ids.flatMap(id=>refs.dependents(id));
    if(dependents.length&&!window.confirm(`${dependents.length} référence(s) (interactions, dialogues, liens) utilisent ${ids.length>1?'ces éléments':'cet élément'}. Elles deviendront invalides et seront signalées par la validation. Supprimer quand même ?`))return;
    this.ctx.run(async()=>{const owners=[...new Set(ids.map(id=>p.entityIndex[id]?.ownerChunkId).filter(Boolean) as string[])];await s.change(ids.length>1?`Supprimer ${ids.length} éléments`:'Supprimer un élément',owners,d=>deleteEntities(d,ids));s.selection.select(null);this.ctx.refreshInspector();});
  }
}
