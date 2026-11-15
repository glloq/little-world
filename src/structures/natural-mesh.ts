/** Compact low-poly natural stone vault: one mesh / one draw call per instance.
 * Portal opening stays empty in 3D; only arch/vault rock gets triangles. */
import * as THREE from 'three';
import {vaultUnder,validateNaturalStructure,type NaturalStructureSpec} from './natural-structure.ts';
export function naturalMesh(spec:NaturalStructureSpec):THREE.Group {
  validateNaturalStructure(spec);
  const positions:number[]=[],colors:number[]=[];
  const stone=new THREE.Color(),count=spec.kind==='tunnel'?16:16;
  const transverse=spec.kind==='tunnel',extent=(transverse?spec.width:spec.span)/2,halfDepth=(transverse?spec.span:spec.width)/2;
  function quad(a:number[],b:number[],c:number[],d:number[],color:number){
    stone.setHex(color);
    for(const point of [a,b,c,a,c,d]){positions.push(...point);colors.push(stone.r,stone.g,stone.b);}
  }
  for(let i=0;i<count;i++){
    const c0=-extent+2*extent*i/count,c1=-extent+2*extent*(i+1)/count;
    const rise=spec.kind==='tunnel'?0:(spec.bankRise??0);
    const bottom0=vaultUnder(spec,c0/extent)+rise*c0/spec.span,
      bottom1=vaultUnder(spec,c1/extent)+rise*c1/spec.span;
    // Slight polygonal unevenness in colour, without GPU textures or random generated state.
    const height0=bottom0+spec.thickness,height1=bottom1+spec.thickness;
    const vertex=(c:number,y:number,d:number)=>transverse?[d,y,c]:[c,y,d];
    const a=vertex(c0,bottom0,-halfDepth),b=vertex(c1,bottom1,-halfDepth),
      c=vertex(c1,height1,-halfDepth),d=vertex(c0,height0,-halfDepth),
      e=vertex(c0,bottom0,halfDepth),f=vertex(c1,bottom1,halfDepth),
      g=vertex(c1,height1,halfDepth),h=vertex(c0,height0,halfDepth);
    const palette=[0x837f78,0x969086,0x77796f,0x8a857a,0xaaa293],
      tone=palette[(i*7+Math.round(spec.curvature*3))%palette.length];
    // Double-sided stone material; all six prism sides explicitly present, no 'holes' from
    // inverted winding and no triangles across the walk-through opening.
    // Shared internal end caps are invisible; skip them (4 triangles per segment saved).
    quad(a,b,c,d,tone);quad(f,e,h,g,tone);
    quad(d,c,g,h,tone);quad(e,f,b,a,tone);
    if(i===0)quad(e,a,d,h,tone);
    if(i===count-1)quad(b,f,g,c,tone);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();geometry.computeBoundingSphere();
  const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='Low-poly natural '+spec.kind;// Avoid a second set of shadow-map draw calls on mobile; baked-looking rock tones remain.
  mesh.castShadow=false;mesh.receiveShadow=true;
  const group=new THREE.Group();group.name='NaturalStructure:'+spec.kind;group.add(mesh);
  group.userData.naturalStructure={...spec,triangles:positions.length/9,drawCalls:1};
  return group;
}
/** Single procedural mesh is an intentionally separate code path from cached GLB assets. */
export function naturalMeshBudget(spec:NaturalStructureSpec){validateNaturalStructure(spec);return {triangles:16*8+4,drawCalls:1,colliders:16};}
