import * as THREE from 'three';
/** Diagnostic-only draw estimate for surf meshes: one draw call per visible mesh whose
 * bounds intersect the camera frustum (what WebGLRenderer would submit). Scratch objects are
 * module-level, so a diagnostic frame allocates nothing. Not a GPU timing. */
const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
export interface SurfDrawStats {drawCalls:number;vertices:number;triangles:number}
export function inCameraView(camera:THREE.Camera,mesh:THREE.Object3D):boolean{
 if(!mesh.visible)return false;
 matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
 frustum.setFromProjectionMatrix(matrix);
 return !(mesh as THREE.Mesh).isMesh||!mesh.frustumCulled||frustum.intersectsObject(mesh);
}
export function surfDrawStats(camera:THREE.Camera,meshes:readonly (THREE.Mesh|null|undefined)[],
 out:SurfDrawStats={drawCalls:0,vertices:0,triangles:0}):SurfDrawStats{
 out.drawCalls=0;out.vertices=0;out.triangles=0;
 for(const mesh of meshes){
  if(!mesh||!inCameraView(camera,mesh))continue;
  const g=mesh.geometry,indexCount=g.index?.count??g.attributes.position.count;
  const drawn=Math.min(indexCount,Math.max(0,g.drawRange.count));
  if(drawn<=0)continue;
  out.drawCalls++;out.triangles+=drawn/3;
  out.vertices+=g.attributes.position.count;
 }
 return out;
}
