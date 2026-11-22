/**
 * Tiny hand-built geometries for mini-game presentation. Three's own Shape / Lathe / Ring /
 * Octahedron geometries would pull extra code into the SHARED three chunk that every page
 * downloads (Rollup cannot split a module), so the lazy mini-game views build the few shapes
 * they need from plain BufferGeometry — the initial game bundle stays unchanged.
 */
import * as THREE from 'three';

const geometry=(positions:number[],colors?:number[])=>{
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  if(colors)g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
};
/** Flat ring in the XZ plane (inner / outer radius, n segments). */
export function flatRing(inner:number,outer:number,n:number){
  const p:number[]=[];
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
    p.push(ca*inner,0,sa*inner,ca*outer,0,sa*outer,cb*outer,0,sb*outer, ca*inner,0,sa*inner,cb*outer,0,sb*outer,cb*inner,0,sb*inner);}
  return geometry(p);
}
/** Flat star (points, inner radius ratio) in the XY plane, triangle fan from the centre. */
export function flatStar(points:number,inner:number){
  const p:number[]=[],n=points*2,r=(k:number)=>k%2?inner:1;
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2;p.push(0,0,0,Math.sin(a)*r(k),Math.cos(a)*r(k),0,Math.sin(b)*r(k+1),Math.cos(b)*r(k+1),0);}
  return geometry(p);
}
/** Rectangle w × h in the XY plane, centred. */
export function flatQuad(w:number,h:number){
  const x=w/2,y=h/2;return geometry([-x,-y,0,x,-y,0,x,y,0,-x,-y,0,x,y,0,-x,y,0]);
}
/** Surface of revolution of a (radius, height) profile around Y, n sides, per-face colours
 * from `tone(height)` (grey levels / RGB, multiplied by the instance colour). */
export function lathe(profile:readonly [number,number][],n:number,tone:(y:number)=>[number,number,number]){
  const p:number[]=[],c:number[]=[];
  for(let i=0;i<profile.length-1;i++){
    const [r0,y0]=profile[i],[r1,y1]=profile[i+1],t=tone((y0+y1)/2);
    for(let k=0;k<n;k++){
      const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2,A=(r:number,y:number,ang:number)=>[Math.sin(ang)*r,y,Math.cos(ang)*r];
      const q=[A(r0,y0,a),A(r0,y0,b),A(r1,y1,b),A(r1,y1,a)];
      for(const v of [q[0],q[1],q[2],q[0],q[2],q[3]]){p.push(...v);c.push(...t);}
    }
  }
  return geometry(p,c);
}
