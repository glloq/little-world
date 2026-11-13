import * as THREE from 'three';
import type {StudioSession} from '../session.ts';
/** E2 — picking and highlighting by stable V3 IDs (never Three.js UUIDs).
 * A picked mesh walks up to the root carrying `userData.entityId`, so multi-mesh and
 * late-loaded GLB objects resolve to one entity. Highlights are box outlines (no material
 * mutation: materials are shared between instances). */
export class SelectionController {
  private boxes=new Map<string,THREE.Box3Helper>();
  private hover:THREE.Box3Helper;
  private hoverId:string|null=null;
  private ray=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private scene:THREE.Scene;private session:StudioSession;private roots:()=>THREE.Object3D[];private objectFor:(id:string)=>THREE.Object3D|undefined;
  constructor(scene:THREE.Scene,session:StudioSession,roots:()=>THREE.Object3D[],objectFor:(id:string)=>THREE.Object3D|undefined){
    this.scene=scene;this.session=session;this.roots=roots;this.objectFor=objectFor;
    this.hover=new THREE.Box3Helper(new THREE.Box3(),0xffffff);this.hover.visible=false;this.hover.renderOrder=30;(this.hover.material as THREE.Material).depthTest=false;scene.add(this.hover);
  }
  get ids(){return this.session.selection.selection.map(v=>v.id);}
  /** Entity under the pointer, nearest hit first. */
  pick(e:{clientX:number;clientY:number},canvas:HTMLCanvasElement,camera:THREE.Camera):string|null{
    const r=canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,camera);
    for(const hit of this.ray.intersectObjects(this.roots(),true)){let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.entityId)o=o.parent;if(o?.visible!==false&&o?.userData.entityId)return o.userData.entityId as string;}
    return null;
  }
  /** Click semantics: plain = replace, Shift = toggle, empty = clear. */
  click(id:string|null,additive:boolean){
    const s=this.session.selection;
    if(!id){if(!additive)s.select(null);return;}
    if(additive)s.toggle({kind:'entity',id});else s.select({kind:'entity',id});
  }
  setHover(id:string|null){if(id===this.hoverId)return;this.hoverId=id;this.refresh();}
  /** Rebuild/follow outline boxes; cheap enough to call on each rendered frame. */
  refresh(){
    const ids=new Set(this.ids);
    for(const [id,box]of this.boxes)if(!ids.has(id)){box.removeFromParent();box.geometry.dispose();(box.material as THREE.Material).dispose();this.boxes.delete(id);}
    let index=0;
    for(const id of ids){
      const object=this.objectFor(id);let box=this.boxes.get(id);
      if(!box){box=new THREE.Box3Helper(new THREE.Box3(),index===0?0xf2b84b:0xf6d48c);box.renderOrder=31;(box.material as THREE.Material).depthTest=false;this.scene.add(box);this.boxes.set(id,box);}
      box.visible=!!object;if(object)box.box.setFromObject(object).expandByScalar(.15);index++;
    }
    const hovered=this.hoverId&&!ids.has(this.hoverId)?this.objectFor(this.hoverId):undefined;this.hover.visible=!!hovered;if(hovered)this.hover.box.setFromObject(hovered).expandByScalar(.1);
  }
  /** Bounding sphere of the selection (for F / focus). */
  bounds():{center:THREE.Vector3;radius:number}|null{
    const box=new THREE.Box3();let any=false;for(const id of this.ids){const o=this.objectFor(id);if(o){box.expandByObject(o);any=true;}}
    if(!any||box.isEmpty())return null;const sphere=box.getBoundingSphere(new THREE.Sphere());return {center:sphere.center,radius:Math.max(1,sphere.radius)};
  }
  dispose(){for(const box of [...this.boxes.values(),this.hover]){box.removeFromParent();box.geometry.dispose();(box.material as THREE.Material).dispose();}this.boxes.clear();}
}
