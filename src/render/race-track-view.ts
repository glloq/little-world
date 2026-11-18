/** Low-poly roadbed: one mesh per authored course, created once, no frame-by-frame geometry. */
import * as THREE from 'three';
import {createRaceTrackSampler,type RaceTrack} from '../gameplay/race-track.ts';
export function createRaceTrackMesh(track:RaceTrack,height:(x:number,z:number)=>number):THREE.Mesh{
 const sampler=createRaceTrackSampler(track,{height}),length=sampler.length;
 const stations=Math.min(1400,Math.ceil(length/1.5)+1),position:number[]=[],colors:number[]=[],indices:number[]=[];
 const materialColor=track.material==='wood'?0x9d734e:track.material==='stone'?0xa8a39b:0xc29d64;
 const base=new THREE.Color(materialColor),edge=new THREE.Color(0x70513d),gold=new THREE.Color(0xe1bd72);
 const push=(p:{x:number;y:number;z:number},c:THREE.Color)=>{
  position.push(p.x,p.y,p.z);colors.push(c.r,c.g,c.b);
 };
 for(let i=0;i<stations;i++){
  const d=length*i/(stations-1);
  for(const lateral of [-track.width/2,0,track.width/2]){
   const p=sampler.station(d,lateral),accent=p.feature==='ramp'||p.feature==='bumps'||p.feature==='bridge';
   const c=lateral===0?(accent?gold:base):edge;
   push(p,c);
  }
  if(i)for(let j=0;j<2;j++){
   const a=(i-1)*3+j,b=i*3+j;
   indices.push(a,b,a+1,a+1,b,b+1);
  }
 }
 // Painted direction chevrons for readable turns and approaching modules:
 // triangles share this mesh and vertex-colour material (no extra draw calls).
 const arrow=new THREE.Color(0xffe6a8);
 for(let d=9;d<length-7;d+=16){
   const a=sampler.station(d-1.2,-.85),b=sampler.station(d+1.5,0),c=sampler.station(d-1.2,.85);
   const begin=position.length/3;
   for(const p of [a,b,c])push({x:p.x,y:p.y+.045,z:p.z},arrow);
   indices.push(begin,begin+1,begin+2);
 }
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
 geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 geometry.setIndex(indices);geometry.computeVertexNormals();
 const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
 const mesh=new THREE.Mesh(geometry,material);
 mesh.name='RaceRoadbed';mesh.castShadow=false;mesh.receiveShadow=false;
 return mesh;
}
export function createRaceTrackView(parent:THREE.Object3D,
 tracks:readonly RaceTrack[],height:(x:number,z:number)=>number){
 const meshes=tracks.map(track=>createRaceTrackMesh(track,height));
 for(const m of meshes)parent.add(m);
 return {meshes,dispose(){for(const m of meshes){m.removeFromParent();m.geometry.dispose();(m.material as THREE.Material).dispose();}}};
}
