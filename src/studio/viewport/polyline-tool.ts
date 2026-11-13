import * as THREE from 'three';
import {terrainHeight} from '../../terrain.ts';
import type {Tool,ToolContext} from './tools.ts';
/** What the polyline tool edits: an NPC route, a river, a path or an activity zone. The
 * tool only collects points; `commit` performs ONE authoring transaction (Enter). */
export interface PolylineTarget {label:string;points:{x:number;z:number}[];min:number;max:number;closed?:boolean;color?:number;commit(points:{x:number;z:number}[]):Promise<void>;
  /** Live validation (e.g. river profile vs relief, zone contour); null = no remark. */
  diagnose?(points:{x:number;z:number}[]):string|null;
  /** Optional magnet (E8: path ends and points snap onto existing paths). */
  snap?(point:{x:number;z:number}):{x:number;z:number}|null;}
export const polylineTarget={current:null as PolylineTarget|null};
/** E5/E6 — click to add points on the ground, drag a handle to move it, Backspace removes
 * the last point, Enter validates, Escape abandons. Navigation stays on right/middle/wheel. */
export class PolylineTool implements Tool {
  readonly id='polyline';readonly cursor='crosshair';
  private ctx!:ToolContext;private points:{x:number;z:number}[]=[];private target:PolylineTarget|null=null;
  private group=new THREE.Group();private line:THREE.Line|null=null;private handles:THREE.InstancedMesh|null=null;
  private drag:number|null=null;private down:{x:number;y:number}|null=null;
  activate(ctx:ToolContext){
    this.ctx=ctx;this.target=polylineTarget.current;this.points=this.target?this.target.points.map(p=>({...p})):[];const color=this.target?.color??0xffc04d;
    this.line=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color,depthTest:false}));this.line.renderOrder=45;this.line.frustumCulled=false;
    this.handles=new THREE.InstancedMesh(new THREE.SphereGeometry(.7,10,8),new THREE.MeshBasicMaterial({color,depthTest:false}),128);this.handles.renderOrder=46;this.handles.frustumCulled=false;
    this.group.add(this.line,this.handles);ctx.scene.add(this.group);this.redraw();
    ctx.message(this.target?`${this.target.label} : clic = ajouter un point · glisser un point = le déplacer · Retour arrière = retirer · Entrée = valider · Échap = abandonner.`:'Aucun tracé à éditer.',!this.target);
  }
  deactivate(){for(const o of [this.line,this.handles]){if(!o)continue;o.geometry.dispose();(o.material as THREE.Material).dispose();}this.group.clear();this.group.removeFromParent();this.line=null;this.handles=null;this.target=null;}
  private redraw(){
    if(!this.line||!this.handles)return;const pts=this.points.map(p=>new THREE.Vector3(p.x,terrainHeight(p.x,p.z)+.6,p.z));if(this.target?.closed&&pts.length>2)pts.push(pts[0].clone());
    this.line.geometry.dispose();this.line.geometry=new THREE.BufferGeometry().setFromPoints(pts);
    const m=new THREE.Matrix4(),scale=Math.max(1,this.ctx.camera.mode==='top'?this.ctx.camera.pose.zoom/90:this.ctx.camera.pose.distance/40);this.handles.count=Math.min(128,this.points.length);
    this.points.slice(0,128).forEach((p,i)=>{m.makeScale(scale,scale,scale).setPosition(p.x,terrainHeight(p.x,p.z)+.6,p.z);this.handles!.setMatrixAt(i,m);});this.handles.instanceMatrix.needsUpdate=true;this.ctx.invalidate(2);
    const remark=this.target?.diagnose&&this.points.length>=this.target.min?this.target.diagnose(this.points):null;this.ctx.canvas.dataset.polylineRemark=remark??'';if(remark)this.ctx.message(remark,true);
  }
  /** Index of the handle under the pointer (screen distance), or null. */
  private handleAt(e:PointerEvent){
    const r=this.ctx.canvas.getBoundingClientRect(),v=new THREE.Vector3();let best:number|null=null,bestD=14;
    this.points.forEach((p,i)=>{v.set(p.x,terrainHeight(p.x,p.z)+.6,p.z).project(this.ctx.camera.camera);const x=(v.x+1)/2*r.width+r.left,y=(1-v.y)/2*r.height+r.top,d=Math.hypot(x-e.clientX,y-e.clientY);if(d<bestD&&v.z<1){bestD=d;best=i;}});return best;
  }
  pointerDown(e:PointerEvent){if(e.button!==0)return;this.down={x:e.clientX,y:e.clientY};this.drag=this.handleAt(e);}
  private snapped(g:{x:number;z:number}){const q={x:g.x,z:g.z},s=this.target?.snap?.(q);if(s){this.ctx.canvas.dataset.polylineSnap='1';return {x:s.x,z:s.z};}this.ctx.canvas.dataset.polylineSnap='0';return q;}
  pointerMove(e:PointerEvent){if(this.drag===null||!(e.buttons&1))return;const g=this.ctx.ground(e);if(g){this.points[this.drag]=this.snapped(g);this.redraw();}}
  pointerUp(e:PointerEvent){
    const start=this.down,dragged=this.drag;this.down=null;this.drag=null;if(e.button!==0||!start||!this.target)return;
    if(dragged!==null||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
    if(this.points.length>=this.target.max){this.ctx.message(`Maximum ${this.target.max} points.`,true);return;}
    const g=this.ctx.ground(e),b=this.ctx.session.document.world.bounds;if(!g||g.x<b.minX||g.x>b.maxX||g.z<b.minZ||g.z>b.maxZ)return;
    const q=this.snapped(g);this.ctx.message(`${this.target.label} : ${this.points.length+1} point(s)${this.ctx.canvas.dataset.polylineSnap==='1'?' · raccordé à un chemin':''} · Entrée pour valider.`);this.points.push(q);this.redraw();
  }
  keyDown(e:KeyboardEvent){
    if(e.key==='Backspace'||e.key==='Delete'){this.points.pop();this.redraw();return true;}
    if(e.key==='Enter'&&this.target){const target=this.target,points=this.points.map(p=>({...p}));
      if(points.length<target.min){this.ctx.message(`${target.label} : au moins ${target.min} points.`,true);return true;}
      this.ctx.run(async()=>{await target.commit(points);polylineTarget.current=null;this.ctx.message(`${target.label} enregistré (${points.length} points) · une opération annulable.`);this.ctx.setTool('select');});return true;}
    return false;
  }
  cancel(){polylineTarget.current=null;this.ctx.message('Tracé abandonné.');this.ctx.setTool('select');return true;}
}
