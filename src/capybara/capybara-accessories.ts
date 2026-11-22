/** Optional low-poly capybara accessories, independent of mounts/physics.
 * Original primitive previews: socket alignment is indicative and must be qualified in Studio.
 */
import * as THREE from 'three';
export const CAPYBARA_LOADOUTS = ['none','saddle','pack','cart','wagon','caravan'] as const;
export type CapybaraLoadout = typeof CAPYBARA_LOADOUTS[number];
const C = {wood:0x89613e,woodDark:0x64442f,leather:0x69422d,cloth:0xb96643,trim:0xe4c98c,metal:0xc9a458,canvas:0xe0c59d,clothGreen:0x829668,spoke:0x744b32};
function box(parent:THREE.Group,name:string,color:number,xyz:[number,number,number],size:[number,number,number],rot=0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:1}));
  o.position.set(...xyz); o.rotation.z=rot; o.name=name; o.castShadow=true; parent.add(o); return o;
}
function wheel(parent:THREE.Group,x:number,z:number,radius=.43) {
  const geom=new THREE.CylinderGeometry(radius,radius,.13,10,1);
  const mat=new THREE.MeshStandardMaterial({color:C.woodDark,roughness:1});
  const mesh=new THREE.Mesh(geom,mat); mesh.rotation.x=Math.PI/2;
  mesh.position.set(x,radius,z); mesh.castShadow=true; mesh.name='Wheel'; parent.add(mesh);
  for(let i=0;i<4;i++) {
    const a=i*Math.PI/4;
    const spoke=box(parent,'Spoke',C.spoke,[x,radius,z],[radius*1.65,.055,.04]);
    spoke.rotation.x=a;
  }
}
/** All accessories are optional, created only for the selected loadout. */
export function buildCapybaraAccessories(loadout:CapybaraLoadout):THREE.Group {
  const root=new THREE.Group(); root.name=`CapybaraEquipment_${loadout}`;
  if(loadout==='none')return root;
  // Cargo straps are subtle: keep head and hind limb articulation regions unobstructed.
  box(root,'BellyStrap',C.leather,[-.40,.97,0],[.17,1.13,1.28]);
  if(loadout==='saddle') {
    box(root,'SaddleBlanket',C.cloth,[-.44,1.72,0],[.81,.07,.99]);
    box(root,'SaddleTrim',C.trim,[-.44,1.76,0],[.7,.035,.78]);
    box(root,'SaddleSeat',C.leather,[-.45,1.83,0],[.52,.12,.56]);
    box(root,'SaddlePommel',C.woodDark,[-.13,1.94,0],[.06,.17,.48]);
  }
  if(loadout==='pack') {
    for(const sign of [-1,1]) {
      box(root,'Pannier',C.wood,[-.48,1.16,sign*.7],[.72,.53,.30]);
      box(root,'PannierLid',C.woodDark,[-.48,1.47,sign*.7],[.77,.09,.36]);
    }
  }
  if(loadout==='cart'||loadout==='wagon'||loadout==='caravan') {
    // Visual tow bar fixed to the animal root: not jointed and no wheel/terrain simulation yet.
    const hitchX=-1.57;
    box(root,'LeftShaft',C.wood,[hitchX-.72,.73,-.46],[1.65,.075,.075]);
    box(root,'RightShaft',C.wood,[hitchX-.72,.73,.46],[1.65,.075,.075]);
    const x=loadout==='caravan'?-3.10:-2.91;
    const width=loadout==='cart'?.95:1.25;
    box(root,'Chassis',C.woodDark,[x,.72,0],[1.5,.16,width]);
    box(root,'Deck',C.wood,[x,.85,0],[1.43,.11,width]);
    for(const sign of [-1,1]){
      wheel(root,x-.20,sign*(width/2+.10),loadout==='cart'?.34:.45);
      box(root,'SidePanel',C.wood,[x,1.04,sign*(width/2)],[1.42,.30,.09]);
    }
    box(root,'TailGate',C.wood,[x-.69,1.04,0],[.09,.3,width]);
    if(loadout==='wagon'||loadout==='caravan'){
      box(root,'FrontPanel',C.wood,[x+.68,1.04,0],[.09,.3,width]);
      for(const sign of [-1,1]) box(root,'CanopySupport',C.wood,[x-.49,1.43,sign*(width/2-.12)],[.08,.86,.08]);
    }
    if(loadout==='caravan'){
      // Compact sleeping wagon / small caravan with low-poly roof, no interior gameplay.
      box(root,'CaravanBody',C.canvas,[x,1.49,0],[1.42,1.03,width-.12]);
      box(root,'Roof',C.clothGreen,[x,2.06,0],[1.55,.16,width+.15]);
      box(root,'Door',C.woodDark,[x-.73,1.39,0],[.035,.72,.42]);
      for(const sign of [-1,1]) box(root,'Window',C.woodDark,[x,1.57,sign*(width/2-.04)],[.35,.30,.026]);
    }
  }
  return root;
}
export function disposeCapybaraAccessories(group:THREE.Group):void {
  group.traverse((node)=>{
    if(!(node instanceof THREE.Mesh)) return;
    node.geometry.dispose();
    if(Array.isArray(node.material))node.material.forEach(m=>m.dispose());
    else node.material.dispose();
  });
  group.clear();
}
