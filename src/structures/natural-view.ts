/** Natural stone authoring assets: local geometry only for nearby placements.
 * The source/compiled colliders are independent of draw distance.
 * A small hard cap protects low-memory/mobile GPU devices on crowded maps. */
import * as THREE from 'three';
import type {Placement} from '../world-data.ts';
import {naturalMesh} from './natural-mesh.ts';

export const NATURAL_DRAW_BUDGET={radius:260,hysteresis:24,maxVisible:48,rebuildStep:16} as const;
export interface NaturalViewStats {registered:number;visible:number;rebuilds:number;triangles:number;drawCalls:number}
export function createNaturalView(parent:THREE.Object3D,ground:(x:number,z:number)=>number){
 const root=new THREE.Group();root.name='Local natural structures';parent.add(root);
 const entries=new Map<string,Placement>(),active=new Map<string,THREE.Group>();
 const stats:NaturalViewStats={registered:0,visible:0,rebuilds:0,triangles:0,drawCalls:0};
 let previousX=NaN,previousZ=NaN,disposed=false;
 const disposeGroup=(g:THREE.Group)=>{
   g.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const material of Array.isArray(o.material)?o.material:[o.material])material.dispose();}});
   g.removeFromParent();
 };
 const add=(p:Placement)=>{
   if(!p.naturalStructure)throw Error('Natural view requires a natural structure');
   if(disposed)throw Error('Natural view disposed');
   // Keep source descriptors only; far geometry is never constructed.
   entries.set(p.id,p);stats.registered=entries.size;previousX=NaN;
 };
 const update=(x:number,z:number)=>{
   if(disposed||Math.hypot(x-previousX,z-previousZ)<NATURAL_DRAW_BUDGET.rebuildStep)return;
   previousX=x;previousZ=z;stats.rebuilds++;
   const r=NATURAL_DRAW_BUDGET.radius+NATURAL_DRAW_BUDGET.hysteresis;
   const nearest=[...entries.values()]
     .map(p=>({p,d:Math.hypot(p.x-x,p.z-z)}))
     .filter(e=>e.d<=r)
     .sort((a,b)=>a.d-b.d||a.p.id.localeCompare(b.p.id))
     .slice(0,NATURAL_DRAW_BUDGET.maxVisible);
   const shown=new Set(nearest.filter(e=>e.d<=NATURAL_DRAW_BUDGET.radius||active.has(e.p.id)).map(e=>e.p.id));
   for(const [id,g]of active)if(!shown.has(id)){disposeGroup(g);active.delete(id);}
   for(const {p}of nearest)if(shown.has(p.id)&&!active.has(p.id)){
     const obj=naturalMesh(p.naturalStructure!);
     obj.position.set(p.x,ground(p.x,p.z)+(p.y??0),p.z);
     if(p.quaternion)obj.quaternion.fromArray(p.quaternion);
     else obj.rotation.y=p.rotation;
     if(p.scale3)obj.scale.fromArray(p.scale3);
     else obj.scale.setScalar(p.scale??1);
     obj.userData.entityId=p.id;obj.userData.placementId=p.id;
     root.add(obj);active.set(p.id,obj);
   }
   stats.visible=active.size;stats.drawCalls=active.size;stats.triangles=active.size*(16*8+4);
 };
 return {add,update,stats,dispose(){
   if(disposed)return;disposed=true;for(const g of active.values())disposeGroup(g);
   active.clear();entries.clear();root.removeFromParent();stats.visible=0;stats.drawCalls=0;stats.triangles=0;
 }};
}
export type NaturalView=ReturnType<typeof createNaturalView>;
