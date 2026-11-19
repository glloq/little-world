import * as THREE from 'three';

/** Two shared opaque faceted silhouettes. Created only once per cloud field. */
export function makeCloudGeometry(variant: 0 | 1): THREE.BufferGeometry {
  const source = new THREE.IcosahedronGeometry(1, 0);
  const pos = source.getAttribute('position');
  const pieces = variant === 0
    ? [{x:-.60,y:0,z:0,sx:1,sy:.53,sz:.65},{x:.46,y:.16,z:0,sx:.82,sy:.65,sz:.64}]
    : [{x:-.62,y:0,z:0,sx:.85,sy:.48,sz:.64},{x:.20,y:.20,z:0,sx:1.05,sy:.67,sz:.76},{x:.83,y:-.05,z:.02,sx:.71,sy:.45,sz:.62}];
  const coords = new Float32Array(pos.count * 3 * pieces.length);
  let k = 0;
  for (const p of pieces) for (let i = 0; i < pos.count; i++) {
    coords[k++] = pos.getX(i) * p.sx + p.x;
    coords[k++] = pos.getY(i) * p.sy + p.y;
    coords[k++] = pos.getZ(i) * p.sz + p.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(coords, 3));
  // Indexed source geometries remain indexed: explicitly flatten all triangle vertices.
  if (source.index) {
    const indices: number[] = [];
    for (let p = 0; p < pieces.length; p++) for (let i = 0; i < source.index.count; i++) {
      indices.push(p * pos.count + source.index.getX(i));
    }
    geometry.setIndex(indices);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  source.dispose();
  return geometry;
}
