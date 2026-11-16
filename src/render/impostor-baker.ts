import {atlasCrops} from './atlas-crop.ts';
/** Offline-only browser baker, loaded by tools/impostors/bake.html, never the game bundle. */
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {flattenScene} from '../world-production/species-library.ts';
import {buildHamster} from '../hamster/hamster.ts';
import type {MotionMode} from '../player.ts';
export interface BakeItem {id:string;file?:string;lift?:number;mode?:MotionMode;speed?:number;vy?:number;action?:boolean;frames:number;fps:number;sourceHash:string}
export async function bakeAtlas(request:{tile:number;views:number;elevations:number[];items:BakeItem[]}){
 const {tile,views,elevations,items}=request,total=items.reduce((n,i)=>n+i.frames*views*elevations.length,0),columns=Math.floor(1024/tile),rows=Math.ceil(total/columns);
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});renderer.setSize(columns*tile,rows*tile,false);renderer.setClearColor(0x000000,0);renderer.setScissorTest(true);
 const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xffffff,0x777466,2));const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,6,4);scene.add(sun);
 const camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,1000),loader=new GLTFLoader(),anchors:number[][]=[],entries:object[]=[];
 try{
  for(const item of items){
   let object:THREE.Object3D,geometry:THREE.BufferGeometry|undefined,material:THREE.Material|undefined,hamster:ReturnType<typeof buildHamster>|undefined;
   const actor={position:new THREE.Vector3(),velocity:new THREE.Vector3(0,item.vy??0,item.speed??0),mode:item.mode??'ground',oxygen:90,glideReady:false};
   if(item.file){const gltf=await loader.loadAsync(import.meta.env.BASE_URL+item.file);geometry=flattenScene(gltf.scene,item.lift??0);material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});object=new THREE.Mesh(geometry,material);gltf.scene.traverse(n=>{const m=n as THREE.Mesh;if(m.isMesh){m.geometry.dispose();for(const a of Array.isArray(m.material)?m.material:[m.material])a.dispose();}});}
   else{hamster=buildHamster();object=hamster.group;for(let n=0;n<30;n++){actor.position.addScaledVector(actor.velocity,1/30);object.position.copy(actor.position);hamster.update(actor,1/30,n/30);}if(item.action)hamster.play('INTERACT');object.position.set(0,0,0);hamster.rig.shadow.visible=false;}
   scene.add(object);object.updateMatrixWorld(true);
   const bounds=new THREE.Box3().setFromObject(object),centre=bounds.getCenter(new THREE.Vector3()),span=item.file?Math.max(...bounds.getSize(new THREE.Vector3()).toArray())*1.4:2.8;
   camera.left=camera.bottom=-span/2;camera.right=camera.top=span/2;camera.updateProjectionMatrix();const first=anchors.length;
   for(let frame=0;frame<item.frames;frame++){
    if(hamster){for(let n=0;n<(frame?Math.round(30/item.fps):1);n++){actor.position.addScaledVector(actor.velocity,1/30);object.position.copy(actor.position);hamster.update(actor,1/30,frame/Math.max(1,item.fps));}object.position.set(0,0,0);hamster.rig.shadow.visible=false;object.updateMatrixWorld(true);}
    for(const elev of elevations)for(let angle=0;angle<views;angle++){
     const a=angle/views*Math.PI*2,d=span*3;camera.position.set(centre.x+Math.sin(a)*Math.cos(elev)*d,centre.y+Math.sin(elev)*d,centre.z+Math.cos(a)*Math.cos(elev)*d);camera.lookAt(centre);camera.updateMatrixWorld();
     const anchor=new THREE.Vector3().project(camera),index=anchors.length;anchors.push([(1+(anchor.x*.5+.5)*(tile-2))/tile,(1+(anchor.y*.5+.5)*(tile-2))/tile,span*tile/(tile-2)]);
     const x=index%columns*tile,y=Math.floor(index/columns)*tile;renderer.setViewport(x+1,y+1,tile-2,tile-2);renderer.setScissor(x,y,tile,tile);renderer.clear();renderer.render(scene,camera);
    }
   }
   entries.push({id:item.id,first,views,elevations,frames:item.frames,fps:item.fps,sourceHash:item.sourceHash});object.removeFromParent();hamster?.dispose();geometry?.dispose();material?.dispose();
  }
  const copy=document.createElement('canvas');copy.width=columns*tile;copy.height=rows*tile;const context=copy.getContext('2d')!;context.drawImage(renderer.domElement,0,0);const crops=atlasCrops(context.getImageData(0,0,copy.width,copy.height).data,copy.width,copy.height,tile,columns,anchors.length);
  return {crops,png:renderer.domElement.toDataURL('image/png').split(',')[1],width:columns*tile,height:rows*tile,tile,columns,rows,anchors,entries};
 }finally{renderer.dispose();renderer.forceContextLoss();}
}
