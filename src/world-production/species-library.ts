/** World Production V1 — GPU library of the dressing species (WP-1/WP-3 runtime).
 * Loads the LOD0/LOD1 GLB files of the species table ONCE (base-aware local URLs, no CDN),
 * flattens each file into one indexed geometry with baked linear vertex colours (vertex
 * colour × material colour), the node transforms and the pivot ground correction applied.
 * Every geometry has the same attributes (position + color + index) so that all species can
 * share ONE BatchedMesh per LOD (one draw call per LOD with WEBGL_multi_draw).
 * Ownership: geometries live in a module cache shared by every dressing view and are never
 * disposed by a view (no premature dispose of shared GLB data). */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {SPECIES} from './biotopes.ts';
import {worldAsset,groundOffset} from './registry.ts';

export interface SpeciesGeometry {lod0:THREE.BufferGeometry;lod1:THREE.BufferGeometry;height:number;radius:number;triangles:[number,number];
  /** Mean colour of the upper half (crown/foliage), used by far silhouettes. */crownHex:number}
export interface SpeciesLibrary {species:(SpeciesGeometry|null)[];bytes:number;loadMs:number;failed:string[]}
let pending:Promise<SpeciesLibrary>|null=null;
const loader=new GLTFLoader();
/** Flatten a GLB scene into position + linear colour + index (no normals: flat shading). */
export function flattenScene(scene:THREE.Object3D,lift=0):THREE.BufferGeometry{
  scene.updateMatrixWorld(true);
  const positions:number[]=[],colors:number[]=[],indices:number[]=[];const v=new THREE.Vector3(),c=new THREE.Color();
  scene.traverse(node=>{
    const mesh=node as THREE.Mesh;if(!mesh.isMesh)return;
    const g=mesh.geometry,pos=g.getAttribute('position'),col=g.getAttribute('color'),base=positions.length/3;
    const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    // Material factors of the historical GLBs were also authored as sRGB values.
    const tint=((materials[0] as THREE.MeshStandardMaterial).color??new THREE.Color(1,1,1)).clone();if(!col)tint.convertSRGBToLinear();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);positions.push(v.x,v.y+lift,v.z);
      // Library COLOR_0 bytes are sRGB values written as-is by the asset generators (trimesh):
      // convert them so the models look as approved instead of washed out.
      if(col)c.setRGB(col.getX(i),col.getY(i),col.getZ(i)).convertSRGBToLinear();else c.setRGB(1,1,1);
      c.multiply(tint);colors.push(c.r,c.g,c.b);
    }
    if(g.index)for(let i=0;i<g.index.count;i++)indices.push(base+g.index.getX(i));else for(let i=0;i<pos.count;i++)indices.push(base+i);
  });
  const out=new THREE.BufferGeometry();
  out.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  out.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  out.setIndex(indices);out.computeBoundingSphere();out.computeBoundingBox();
  return out;
}
/** Mean linear colour of vertices above half height, returned as sRGB hex. */
export function crownColor(g:THREE.BufferGeometry,height:number):number{
  const p=g.getAttribute('position'),c=g.getAttribute('color');let r=0,gr=0,b=0,n=0;
  for(let i=0;i<p.count;i++)if(p.getY(i)>=height*.5){r+=c.getX(i);gr+=c.getY(i);b+=c.getZ(i);n++;}
  if(!n)return 0x6d8a55;return new THREE.Color(r/n,gr/n,b/n).getHex();
}
/** Same correction for whole GLB scenes drawn as placed objects (geometry shared and converted
 * once at load time by its owner, the model cache). */
export function linearizeVertexColors(scene:THREE.Object3D){
  const c=new THREE.Color(),done=new Set<THREE.BufferAttribute>();
  scene.traverse(node=>{const mesh=node as THREE.Mesh;const col=mesh.isMesh?mesh.geometry.getAttribute('color') as THREE.BufferAttribute|undefined:undefined;if(!col||done.has(col))return;done.add(col);
    for(let i=0;i<col.count;i++){c.setRGB(col.getX(i),col.getY(i),col.getZ(i)).convertSRGBToLinear();col.setXYZ(i,c.r,c.g,c.b);}col.needsUpdate=true;});
}
async function loadFile(file:string):Promise<THREE.Object3D>{
  const base=(import.meta as {env?:{BASE_URL?:string}}).env?.BASE_URL??'/';
  return (await loader.loadAsync(base+file)).scene;
}
/** Loads (once) every species; a missing file leaves that species on the procedural fallback. */
export function loadSpeciesLibrary():Promise<SpeciesLibrary>{
  if(pending)return pending;
  const t0=performance.now();
  pending=Promise.all(SPECIES.map(async s=>{
    const asset=worldAsset(s.id);if(!asset)return {id:s.id,geometry:null};
    try{
      const lift=groundOffset(asset),files=[asset.lods[0].file,(asset.lods[1]??asset.lods[0]).file];
      const [a,b]=await Promise.all(files.map(loadFile));
      const lod0=flattenScene(a,lift),lod1=flattenScene(b,lift);
      return {id:s.id,geometry:{lod0,lod1,height:asset.size[1],radius:Math.max(asset.size[0],asset.size[2])/2,triangles:[lod0.index!.count/3,lod1.index!.count/3] as [number,number],crownHex:crownColor(lod1,asset.size[1])}};
    }catch(error){console.warn('Espèce GLB indisponible, silhouette procédurale conservée',s.id,error);return {id:s.id,geometry:null};}
  })).then(list=>{
    let bytes=0;for(const e of list)if(e.geometry)for(const g of [e.geometry.lod0,e.geometry.lod1])bytes+=g.getAttribute('position').array.byteLength+g.getAttribute('color').array.byteLength+(g.index!.array as Uint32Array).byteLength;
    return {species:list.map(e=>e.geometry),bytes,loadMs:performance.now()-t0,failed:list.filter(e=>!e.geometry).map(e=>e.id)};
  });
  return pending;
}
