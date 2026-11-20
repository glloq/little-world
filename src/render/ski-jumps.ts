import * as THREE from 'three';
import type {RaceGate} from '../gameplay/races.ts';

/** Small snow kickers with a marked lip. The fixed simulation owns takeoff. */
export function createSkiJumps(scene:THREE.Object3D,gates:readonly RaceGate[],height:(x:number,z:number)=>number){
  if(!gates.length)return null;
  const vertices:number[]=[],colors:number[]=[];
  const snow=new THREE.Color(0xd7eef8),lip=new THREE.Color(0x2996ba);
  for(const gate of gates){
    const {x,z}=gate.center,n=gate.normal;
    const point=(along:number,side:number,rise:number)=>{
      const px=x+n.x*along+n.z*side,pz=z+n.z*along-n.x*side;
      return [px,height(px,pz)+rise,pz];
    };
    const half=gate.width/2;
    const strip=(a:number,b:number,low:number,high:number,color:THREE.Color)=>{
      const la=point(a,-half,low),ra=point(a,half,low),lb=point(b,-half,high),rb=point(b,half,high);
      vertices.push(...la,...ra,...lb,...ra,...rb,...lb);
      for(let i=0;i<6;i++)colors.push(color.r,color.g,color.b);
    };
    strip(-2,-.35,.04,.42,snow);
    strip(-.35,0,.42,.52,lip);
    strip(0,.18,.52,.05,snow);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const material=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(geometry,material);
  mesh.name='AlpineJumpRamps';scene.add(mesh);
  return {dispose(){scene.remove(mesh);geometry.dispose();material.dispose();}};
}
