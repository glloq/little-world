/**
 * Painter: flat-shaded triangle soup with one colour per face (doc 107 §style). Every static
 * part of a mini-game field — floors, markings, walls, props — is painted into ONE of these,
 * then turned into a single vertex-coloured mesh: one draw call per field, shared material.
 */
import * as THREE from 'three';
import type {StaticBox} from '../ball/ball-physics.ts';

export type V3=[number,number,number];
const color=new THREE.Color();
export const shade=(hex:number,k:number)=>color.setHex(hex).multiplyScalar(k).getHex();
export const mix=(a:number,b:number,t:number)=>{const c=new THREE.Color(a).lerp(new THREE.Color(b),t);return c.getHex();};

export class Painter {
  readonly p:number[]=[];readonly c:number[]=[];
  get triangles(){return this.p.length/9;}
  tri(a:V3,b:V3,d:V3,hex:number){color.setHex(hex);for(const v of [a,b,d]){this.p.push(v[0],v[1],v[2]);this.c.push(color.r,color.g,color.b);}}
  /** Quad a-b-c-d (the material is double-sided: winding only matters for normals). */
  quad(a:V3,b:V3,c:V3,d:V3,hex:number){this.tri(a,b,c,hex);this.tri(a,c,d,hex);}
  /** Oriented box (same frame convention as the physics' StaticBox); darker sides. */
  box(b:StaticBox,hex:number,top=hex){
    const ax=(u:number,v:number,y:number):V3=>[b.cx+u*b.cos+v*b.sin,y,b.cz-u*b.sin+v*b.cos];
    const x=b.hx,z=b.hz,lo=b.minY,hi=b.maxY,dark=shade(hex,.82);
    this.quad(ax(-x,-z,hi),ax(-x,z,hi),ax(x,z,hi),ax(x,-z,hi),top);
    this.quad(ax(-x,-z,lo),ax(x,-z,lo),ax(x,-z,hi),ax(-x,-z,hi),dark);this.quad(ax(x,z,lo),ax(-x,z,lo),ax(-x,z,hi),ax(x,z,hi),dark);
    this.quad(ax(x,-z,lo),ax(x,z,lo),ax(x,z,hi),ax(x,-z,hi),hex);this.quad(ax(-x,z,lo),ax(-x,-z,lo),ax(-x,-z,hi),ax(-x,z,hi),hex);
  }
  /** Box from a centre on the ground (x, y = base, z), size and world yaw. */
  block(x:number,y:number,z:number,w:number,h:number,d:number,yaw:number,hex:number,top=hex){
    this.box({cx:x,cz:z,hx:w/2,hz:d/2,minY:y,maxY:y+h,cos:Math.cos(yaw),sin:Math.sin(yaw),restitution:0},hex,top);
  }
  /** Vertical prism (n sides) or cone (rTop 0): posts, stumps, trophies, reeds. */
  prism(x:number,y:number,z:number,rBottom:number,rTop:number,h:number,n:number,hex:number,top=hex){
    for(let k=0;k<n;k++){
      const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2,s=k%2?hex:shade(hex,.9);
      const p0:V3=[x+Math.cos(a)*rBottom,y,z+Math.sin(a)*rBottom],p1:V3=[x+Math.cos(b)*rBottom,y,z+Math.sin(b)*rBottom];
      const p2:V3=[x+Math.cos(b)*rTop,y+h,z+Math.sin(b)*rTop],p3:V3=[x+Math.cos(a)*rTop,y+h,z+Math.sin(a)*rTop];
      if(rTop>0){this.quad(p0,p1,p2,p3,s);this.tri([x,y+h,z],p3,p2,top);}else this.tri(p0,p1,[x,y+h,z],s);
    }
  }
  /** Horizontal prism between two points (logs, ropes, rails), n sides of radius r. */
  beam(a:V3,b:V3,r:number,n:number,hex:number){
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||1,ux=dx/len,uy=dy/len,uz=dz/len;
    // Two axes perpendicular to the beam.
    let px=-uz,py=0,pz=ux;const pl=Math.hypot(px,pz);if(pl<1e-6){px=1;pz=0;}else{px/=pl;pz/=pl;}
    const qx=uy*pz-uz*py,qy=uz*px-ux*pz,qz=ux*py-uy*px;
    const ring=(c:V3,k:number):V3=>{const t=k/n*Math.PI*2,cs=Math.cos(t)*r,sn=Math.sin(t)*r;return [c[0]+px*cs+qx*sn,c[1]+py*cs+qy*sn,c[2]+pz*cs+qz*sn];};
    for(let k=0;k<n;k++)this.quad(ring(a,k),ring(b,k),ring(b,k+1),ring(a,k+1),k%2?hex:shade(hex,.88));
  }
  geometry():THREE.BufferGeometry|null{
    if(!this.p.length)return null;const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.computeVertexNormals();return g;
  }
}
