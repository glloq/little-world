/**
 * River stones (doc 108 §11): pebbles lining the banks, boulders breaking the riffles and rapids,
 * gravel on the inside of bends and blocks around waterfall pools. Derived from the compiled water
 * (deterministic per water id), presentation only: no collider, no gameplay, no source data.
 *
 * Budget: ONE InstancedMesh (20-triangle rock, flat Lambert, instance colours, no shadow). Stones are
 * bucketed in 48 m cells once; around the focus only the cells within `radius` are uploaded, and
 * only when the focus moved more than a few metres or the budget changed.
 */
import * as THREE from 'three';
import type {CompiledWater} from '../water/profile.ts';
import {waterSections} from '../water/profile.ts';

/** x, y, z, scale, yaw, tint (0..1). */
export const STONE_STRIDE=6;
const CELL=48;
function hashId(id:string){let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return h>>>0;}
function rng(seed:number){let s=seed>>>0||1;return ()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

/** Pure: stones of one compiled river or lake. `height` = carved terrain (bed and banks). */
export function riverStones(water:CompiledWater,height:(x:number,z:number)=>number):number[]{
 const out:number[]=[],rand=rng(hashId(water.id)),push=(x:number,y:number,z:number,s:number,tint:number)=>out.push(x,y,z,s,rand()*Math.PI*2,tint);
 if(water.kind==='lake'){
  const poly=water.polygon!,level=water.points[0].level;
  for(let i=0;i<poly.length;i++){if(rand()>.35)continue;const a=poly[i],b=poly[(i+1)%poly.length],t=rand(),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,s=.3+rand()*.5,h=height(x,z);
   if(h>level-.3)push(x,h-s*.3,z,s,.3+rand()*.4);}
  return out;
 }
 const p=water.points,sections=waterSections(water),n=p.length;if(n<2)return out;
 const falls=water.falls??[];
 let next=0;
 for(let i=1;i<n;i++){
  const a=p[i-1],b=p[i],seg=b.distance-a.distance;if(seg<=1e-3)continue;
  const slope=Math.max(0,(a.level-b.level)/seg),rush=Math.min(1,Math.max(0,(slope-.01)/.1));
  while(next<b.distance){
   const t=(next-a.distance)/seg;next+=2.2+3.8*(1-rush)+rand()*2;if(t<0)continue;
   const sa=sections[i-1],sb=sections[i],cx=a.x+(b.x-a.x)*t,cz=a.z+(b.z-a.z)*t,level=a.level+(b.level-a.level)*t;
   const lx=(sa.left.x+(sb.left.x-sa.left.x)*t)-cx,lz=(sa.left.z+(sb.left.z-sa.left.z)*t)-cz,half=Math.hypot(lx,lz)||water.width/2,ux=lx/half,uz=lz/half;
   const shift=(a.shift??0)+((b.shift??0)-(a.shift??0))*t;
   // Bank pebbles on both sides, a little above and below the water line.
   for(const side of [1,-1]){if(rand()>.55)continue;const off=half+(rand()-.35)*1.3,x=cx+ux*off*side,z=cz+uz*off*side,s=.18+rand()*.35,h=height(x,z);
    if(h<level+1.2)push(x,Math.max(h,level-.4)-s*.35,z,s,.25+rand()*.5);}
   // Point bar: gravel on the inside of a bend (opposite to the thalweg shift).
   if(Math.abs(shift)>.4&&rand()<.6){const side=-Math.sign(shift),off=half*(.55+rand()*.45),x=cx+ux*off*side,z=cz+uz*off*side,s=.15+rand()*.25;push(x,height(x,z)-s*.3,z,s,.4+rand()*.4);}
   // Boulders breaking riffles and rapids: only where the water is shallow enough to show them.
   if(rush>.25&&rand()<.35+.5*rush){const off=(rand()*2-1)*half*.7,x=cx+ux*off,z=cz+uz*off,bed=height(x,z),depth=level-bed;
    if(depth<1.4){const s=Math.min(water.width*.22,.35+rand()*.6+depth*.4);push(x,Math.max(bed+s*.25,level-s*.3),z,s,.1+rand()*.3);}}
  }
 }
 // Blocks around waterfall pools.
 for(const f of falls)for(let k=0;k<7;k++){const ang=rand()*Math.PI*2,r=water.width*(.6+rand()*.9),x=f.x+Math.cos(ang)*r,z=f.z+Math.sin(ang)*r,s=.5+rand()*.9;push(x,height(x,z)-s*.2,z,s,.05+rand()*.25);}
 return out;
}

export interface RiverStonesView {
 readonly mesh:THREE.InstancedMesh;
 readonly stats:{stones:number;drawn:number;cells:number};
 setWaters(waters:readonly CompiledWater[],height:(x:number,z:number)=>number):void;
 /** Instance budget (0 hides the stones). */
 setCapacity(count:number):void;
 update(x:number,z:number):void;
 dispose():void;
}
const MAX=2048;
/** Instance budget per presentation level (0 best … 3 overload); economy keeps a few near stones. */
export function riverStoneBudget(level:number,economy=false):number{return economy?300:level<=0?1500:level===1?1000:level===2?500:0;}
export function createRiverStonesView(parent:THREE.Object3D,radius=140):RiverStonesView{
 const geometry=new THREE.IcosahedronGeometry(1,0);geometry.scale(1,.62,1);
 const material=new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true});
 const mesh=new THREE.InstancedMesh(geometry,material,MAX);mesh.name='RiverStones';mesh.count=0;mesh.frustumCulled=false;mesh.castShadow=false;mesh.receiveShadow=false;
 mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.setColorAt(0,new THREE.Color());parent.add(mesh);
 const cells=new Map<number,number[]>(),stats={stones:0,drawn:0,cells:0};
 let capacity=MAX,lastX=Infinity,lastZ=Infinity,dirty=true;
 const key=(cx:number,cz:number)=>(cx+32768)*65536+(cz+32768);
 const m=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),up=new THREE.Vector3(0,1,0),col=new THREE.Color();
 const wet=new THREE.Color(0x6f6a60),dry=new THREE.Color(0xa49d8c);
 return {mesh,stats,
  setWaters(waters,height){cells.clear();stats.stones=0;
   for(const w of waters){const s=riverStones(w,height);stats.stones+=s.length/STONE_STRIDE;
    for(let i=0;i<s.length;i+=STONE_STRIDE){const k=key(Math.floor(s[i]/CELL),Math.floor(s[i+2]/CELL));let list=cells.get(k);if(!list)cells.set(k,list=[]);for(let j=0;j<STONE_STRIDE;j++)list.push(s[i+j]);}}
   stats.cells=cells.size;dirty=true;},
  setCapacity(count){const next=Math.max(0,Math.min(MAX,Math.floor(count)));if(next!==capacity){capacity=next;dirty=true;}},
  update(x,z){
   if(!dirty&&Math.hypot(x-lastX,z-lastZ)<6)return;
   dirty=false;lastX=x;lastZ=z;let n=0;const r=Math.ceil(radius/CELL),cx=Math.floor(x/CELL),cz=Math.floor(z/CELL),r2=radius*radius;
   // Nearest cells first so that a small budget keeps the stones around the player.
   const order:[number,number][]=[];for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++)order.push([dx,dz]);order.sort((a,b)=>a[0]*a[0]+a[1]*a[1]-b[0]*b[0]-b[1]*b[1]);
   outer:for(const [dx,dz]of order){const list=cells.get(key(cx+dx,cz+dz));if(!list)continue;
    for(let i=0;i<list.length;i+=STONE_STRIDE){if(n>=capacity)break outer;const sx=list[i],sz=list[i+2];if((sx-x)*(sx-x)+(sz-z)*(sz-z)>r2)continue;
     const s=list[i+3];pos.set(sx,list[i+1],sz);q.setFromAxisAngle(up,list[i+4]);scale.set(s,s*(.8+.4*((i*7)%5)/5),s);m.compose(pos,q,scale);mesh.setMatrixAt(n,m);
     col.copy(wet).lerp(dry,list[i+5]);mesh.setColorAt(n,col);n++;}}
   // Upload only the instances in use.
   mesh.count=n;stats.drawn=n;const im=mesh.instanceMatrix;im.clearUpdateRanges();im.addUpdateRange(0,Math.max(1,n)*16);im.needsUpdate=true;
   if(mesh.instanceColor){mesh.instanceColor.clearUpdateRanges();mesh.instanceColor.addUpdateRange(0,Math.max(1,n)*3);mesh.instanceColor.needsUpdate=true;}
  },
  dispose(){mesh.removeFromParent();geometry.dispose();material.dispose();mesh.dispose();},
 };
}
