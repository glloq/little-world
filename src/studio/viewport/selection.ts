import * as THREE from 'three';
import type {StudioSession} from '../session.ts';
import {terrainHeight} from '../../terrain.ts';
import {elementData,elementsAt,type ElementRef} from '../../studio-core/elements.ts';
/** E2/E7 — picking and highlighting by stable V3 IDs (never Three.js UUIDs).
 * Entities: a picked mesh walks up to the root carrying `userData.entityId` (multi-mesh and
 * late GLB objects resolve to one entity); highlights are box outlines (shared materials are
 * never mutated). Paths, rivers, zones and terrain/biome retouches are picked from the ground
 * point and highlighted by a draped outline; that outline also serves as the gizmo proxy of
 * the element (moves are converted to V3 point offsets by the select tool). */
export class SelectionController {
  private boxes=new Map<string,THREE.Box3Helper>();
  private overlays=new Map<string,{object:THREE.Line;signature:string}>();
  private hover:THREE.Box3Helper;
  private hoverId:string|null=null;
  private ray=new THREE.Raycaster();
  private pointer=new THREE.Vector2();
  private scene:THREE.Scene;private session:StudioSession;private roots:()=>THREE.Object3D[];private objectFor:(id:string)=>THREE.Object3D|undefined;
  private ground:(e:{clientX:number;clientY:number})=>THREE.Vector3|null;
  constructor(scene:THREE.Scene,session:StudioSession,roots:()=>THREE.Object3D[],objectFor:(id:string)=>THREE.Object3D|undefined,ground:(e:{clientX:number;clientY:number})=>THREE.Vector3|null=()=>null){
    this.scene=scene;this.session=session;this.roots=roots;this.objectFor=objectFor;this.ground=ground;
    this.hover=new THREE.Box3Helper(new THREE.Box3(),0xffffff);this.hover.visible=false;this.hover.renderOrder=30;(this.hover.material as THREE.Material).depthTest=false;scene.add(this.hover);
  }
  get ids(){return this.session.selection.selection.map(v=>v.id);}
  get refs():ElementRef[]{return this.session.selection.selection as ElementRef[];}
  /** Entity under the pointer, nearest hit first (hover). */
  pickEntity(e:{clientX:number;clientY:number},canvas:HTMLCanvasElement,camera:THREE.Camera):string|null{
    const r=canvas.getBoundingClientRect();this.pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,camera);
    for(const hit of this.ray.intersectObjects(this.roots(),true)){let o:THREE.Object3D|null=hit.object;while(o&&!o.userData.entityId)o=o.parent;if(o?.visible!==false&&o?.userData.entityId)return o.userData.entityId as string;}
    return null;
  }
  /** Element under the pointer: an entity mesh first, otherwise the line/zone at the ground point. */
  pick(e:{clientX:number;clientY:number},canvas:HTMLCanvasElement,camera:THREE.Camera):ElementRef|null{
    const id=this.pickEntity(e,canvas,camera);if(id)return {kind:'entity',id};
    const g=this.ground(e);if(!g)return null;
    const camDistance=camera.position.distanceTo(g);return elementsAt(this.session.document,g.x,g.z,Math.max(1.5,camDistance*.01))[0]??null;
  }
  /** Click semantics: plain = replace, Shift = toggle, empty = clear. */
  click(ref:ElementRef|string|null,additive:boolean){
    const s=this.session.selection,value=typeof ref==='string'?{kind:'entity' as const,id:ref}:ref;
    if(!value){if(!additive)s.select(null);return;}
    if(additive)s.toggle(value);else s.select(value);
  }
  setHover(id:string|null){if(id===this.hoverId)return;this.hoverId=id;this.refresh();}
  /** Gizmo proxy of a non-entity element (its highlight outline), if selected. */
  proxyFor(id:string):THREE.Object3D|undefined{return this.overlays.get(id)?.object;}
  private outline(ref:ElementRef):{points:THREE.Vector3[];closed:boolean;anchor:THREE.Vector3}|null{
    const d=elementData(this.session.document,ref);if(!d)return null;
    let pts:{x:number;z:number}[];let closed=false;
    if('points' in d)pts=d.points;else if('polygon' in d){pts=d.polygon;closed=true;}
    else{pts=Array.from({length:48},(_,i)=>({x:d.x+Math.cos(i/48*Math.PI*2)*d.radius,z:d.z+Math.sin(i/48*Math.PI*2)*d.radius}));closed=true;}
    const dense:{x:number;z:number}[]=[];const ring=closed?[...pts,pts[0]]:pts;
    for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/3));for(let j=0;j<n;j++)dense.push({x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n});}
    if(!closed)dense.push(ring.at(-1)!);
    const anchor=new THREE.Vector3(dense.reduce((s,v)=>s+v.x,0)/dense.length,0,dense.reduce((s,v)=>s+v.z,0)/dense.length);anchor.y=terrainHeight(anchor.x,anchor.z);
    return {points:dense.map(v=>new THREE.Vector3(v.x-anchor.x,terrainHeight(v.x,v.z)+.45-anchor.y,v.z-anchor.z)),closed,anchor};
  }
  /** Rebuild/follow highlights; cheap enough to call on each rendered frame. */
  refresh(){
    const refs=this.refs,entityIds=new Set(refs.filter(r=>r.kind==='entity').map(r=>r.id)),others=refs.filter(r=>r.kind!=='entity');
    for(const [id,box]of this.boxes)if(!entityIds.has(id)){box.removeFromParent();box.geometry.dispose();(box.material as THREE.Material).dispose();this.boxes.delete(id);}
    let index=0;
    for(const id of entityIds){
      const object=this.objectFor(id);let box=this.boxes.get(id);
      if(!box){box=new THREE.Box3Helper(new THREE.Box3(),index===0?0xf2b84b:0xf6d48c);box.renderOrder=31;(box.material as THREE.Material).depthTest=false;this.scene.add(box);this.boxes.set(id,box);}
      box.visible=!!object;if(object)box.box.setFromObject(object).expandByScalar(.15);index++;
    }
    const keep=new Set(others.map(r=>r.id));
    for(const [id,o]of this.overlays)if(!keep.has(id)){o.object.removeFromParent();o.object.geometry.dispose();(o.object.material as THREE.Material).dispose();this.overlays.delete(id);}
    for(const ref of others){
      const data=elementData(this.session.document,ref),signature=JSON.stringify(data??null),current=this.overlays.get(ref.id);
      if(current&&current.signature===signature)continue;
      if(current){current.object.removeFromParent();current.object.geometry.dispose();(current.object.material as THREE.Material).dispose();this.overlays.delete(ref.id);}
      const shape=this.outline(ref);if(!shape)continue;
      const geometry=new THREE.BufferGeometry().setFromPoints(shape.points),material=new THREE.LineBasicMaterial({color:ref.id===refs[0]?.id?0xf2b84b:0xf6d48c,depthTest:false});
      const line=shape.closed?new THREE.LineLoop(geometry,material):new THREE.Line(geometry,material);line.position.copy(shape.anchor);line.renderOrder=32;line.frustumCulled=false;line.name='Selection:'+ref.kind;line.userData.selectionProxy=ref.id;
      this.scene.add(line);this.overlays.set(ref.id,{object:line,signature});
    }
    const hovered=this.hoverId&&!entityIds.has(this.hoverId)?this.objectFor(this.hoverId):undefined;this.hover.visible=!!hovered;if(hovered)this.hover.box.setFromObject(hovered).expandByScalar(.1);
  }
  /** Bounding sphere of the selection (for F / focus). */
  bounds():{center:THREE.Vector3;radius:number}|null{
    const box=new THREE.Box3();let any=false;for(const id of this.ids){const o=this.objectFor(id)??this.proxyFor(id);if(o){box.expandByObject(o);any=true;}}
    if(!any||box.isEmpty())return null;const sphere=box.getBoundingSphere(new THREE.Sphere());return {center:sphere.center,radius:Math.max(1,sphere.radius)};
  }
  dispose(){
    for(const box of [...this.boxes.values(),this.hover]){box.removeFromParent();box.geometry.dispose();(box.material as THREE.Material).dispose();}this.boxes.clear();
    for(const o of this.overlays.values()){o.object.removeFromParent();o.object.geometry.dispose();(o.object.material as THREE.Material).dispose();}this.overlays.clear();
  }
}
