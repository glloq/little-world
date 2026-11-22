/** Interchangeable low-poly animal equipment. Local +X forwards, +Y up.
 * The loadout root uses capybara model coordinates. All pieces follow the animal
 * world transform. Tow body is a separate visual pivot for future physics.
 */
import * as THREE from 'three';
export const CAPYBARA_LOADOUTS=['none','saddle','pack','cart','wagon','caravan'] as const;
export type CapybaraLoadout=typeof CAPYBARA_LOADOUTS[number];
const palette={leather:0x67412e,dark:0x443126,cloth:0xb85d40,trim:0xe1c28f,wood:0x946b43,woodDark:0x61432f,canvas:0xd9c49f,roof:0x7f9470,metal:0xb79660,rim:0x553b2c};
const materials=new Map<number,THREE.MeshStandardMaterial>();
function mat(color:number){let m=materials.get(color);if(!m){m=new THREE.MeshStandardMaterial({color,roughness:.96,metalness:0,flatShading:true});materials.set(color,m);}return m;}
function add(parent:THREE.Group,name:string,g:THREE.BufferGeometry,color:number,x=0,y=0,z=0){
 const m=new THREE.Mesh(g,mat(color));m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
}
function block(parent:THREE.Group,name:string,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number){
 return add(parent,name,new THREE.BoxGeometry(sx,sy,sz),color,x,y,z);
}
/** Curved transverse tack band wrapping the capybara's torso, rather than a box through its belly. */
function bodyBand(root:THREE.Group,x:number,dy:number,color:number,width=.095){
 // Arc around the body cross-section (Y,Z), open underneath; no hard intersection slab.
 const path:THREE.Vector3[]=[];
 for(let i=0;i<=12;i++){
  const a=-.14+(Math.PI+.28)*i/12;
  path.push(new THREE.Vector3(x,1.10+dy+Math.sin(a)*.62,Math.cos(a)*.61));
 }
 const curve=new THREE.CatmullRomCurve3(path);
 return add(root,'BodyStrap',new THREE.TubeGeometry(curve,18,width/2,4,false),color);
}
function roundedPad(root:THREE.Group,name:string,color:number,x:number,y:number,z:number,sx:number,sy:number,sz:number){
 return add(root,name,new THREE.SphereGeometry(1,9,5),color,x,y,z).scale.set(sx,sy,sz);
}
/** Shaft from A to B; cylinders point along +Y before orientation. */
function bar(root:THREE.Group,name:string,color:number,a:THREE.Vector3,b:THREE.Vector3,r=.035){
 const diff=b.clone().sub(a);
 const o=add(root,name,new THREE.CylinderGeometry(r,r,diff.length(),6),color);
 o.position.copy(a).add(b).multiplyScalar(.5);
 o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),diff.normalize());
 return o;
}
function wheel(root:THREE.Group,x:number,z:number,r:number){
 const pivot=new THREE.Group();pivot.name='CapybaraWheelPivot';pivot.position.set(x,r,z);root.add(pivot);
 // Torus lies in XY plane: axle is +Z, while motion is +X.
 add(pivot,'WheelRim',new THREE.TorusGeometry(r-.045,.065,5,12),palette.rim);
 add(pivot,'WheelHub',new THREE.CylinderGeometry(.105,.105,.17,8),palette.metal).rotation.x=Math.PI/2;
 for(let i=0;i<6;i++){
   const a=i*Math.PI/3, end=new THREE.Vector3(Math.cos(a)*(r-.05),Math.sin(a)*(r-.05),0);
   bar(pivot,'WheelSpoke',palette.woodDark,new THREE.Vector3(),end,.027);
 }
 return pivot;
}
export function buildCapybaraAccessories(kind:CapybaraLoadout):THREE.Group {
 const root=new THREE.Group();root.name='CapybaraEquipment_'+kind;
 if(kind==='none')return root;
 const carrying=kind==='saddle'||kind==='pack';
 if(carrying){
   bodyBand(root,-.30,0,palette.leather,.095);
   bodyBand(root,-.78,0,palette.leather,.075);
   roundedPad(root,'BackPad',palette.cloth,-.49,1.66,0,.56,.075,.53);
 }
 if(kind==='saddle'){
   roundedPad(root,'SaddleSeat',palette.leather,-.49,1.76,0,.39,.075,.34);
   roundedPad(root,'SaddleRim',palette.trim,-.49,1.705,0,.48,.04,.43);
   bar(root,'SaddlePommel',palette.woodDark,new THREE.Vector3(-.16,1.77,-.29),new THREE.Vector3(-.16,1.86,.29),.045);
 }
 if(kind==='pack')for(const side of [-1,1]){
   const z=side*.70;
   roundedPad(root,'Pannier',palette.wood,-.55,1.20,z,.39,.28,.22);
   roundedPad(root,'PannierFlap',palette.leather,-.55,1.44,z,.39,.07,.25);
   block(root,'PannierBuckle',palette.metal,-.47,1.32,z+side*.19,.09,.10,.025);
 }
 if(!carrying){
   // Neck/chest harness; the wagon is anchored to the root, never to the head or deforming legs.
   bodyBand(root,.22,-.02,palette.leather,.12);
   for(const side of [-1,1]){
     const z=side*.43;
     bar(root,'HarnessTrace',palette.leather,new THREE.Vector3(-.78,.88,z),new THREE.Vector3(-1.71,.76,z),.045);
   }
   const axle=kind==='cart'?-2.95:-3.19;
   const width=kind==='cart'?1.08:1.36;
   const r=kind==='cart'?.35:.43;
   const tow=new THREE.Group();tow.name='CapybaraTowAssembly';root.add(tow);
   for(const side of [-1,1]){
     bar(tow,'TowShaft',palette.wood,new THREE.Vector3(-1.67,.76,side*.44),new THREE.Vector3(axle+.48,.72,side*.46),.05);
     wheel(tow,axle-.23,side*(width/2+.12),r);
   }
   block(tow,'CargoDeck',palette.wood,axle,.83,0,1.46,.13,width);
   block(tow,'Undercarriage',palette.woodDark,axle,.68,0,1.18,.14,width*.77);
   for(const side of [-1,1]) {
     block(tow,'SideRail',palette.wood,axle,1.07,side*(width/2),1.44,.27,.07);
     block(tow,'UpperRail',palette.woodDark,axle,1.25,side*(width/2),1.44,.055,.065);
   }
   block(tow,'TailGate',palette.wood,axle-.71,1.08,0,.07,.32,width);
   if(kind!=='cart')block(tow,'FrontGate',palette.wood,axle+.70,1.08,0,.07,.32,width);
   if(kind==='wagon'){
     for(const side of [-1,1]) for(const x of [axle-.49,axle+.48])
       bar(tow,'CargoStake',palette.woodDark,new THREE.Vector3(x,.94,side*width/2),new THREE.Vector3(x,1.55,side*width/2),.04);
   }
   if(kind==='caravan'){
     // Tapered stylized cottage cabin and a curved roof instead of a large rectangular block.
     roundedPad(tow,'CaravanShell',palette.canvas,axle,1.56,0,.72,.67,width*.46);
     const roof=add(tow,'CaravanRoof',new THREE.CylinderGeometry(width*.62,width*.62,1.54,8,1,false,0,Math.PI),palette.roof,axle,2.00,0);
     roof.rotation.z=Math.PI/2;
     block(tow,'CaravanDoor',palette.woodDark,axle-.71,1.48,0,.06,.66,.35);
     for(const side of [-1,1])roundedPad(tow,'RoundWindow',palette.woodDark,axle,1.58,side*(width*.46),.19,.19,.028);
   }
 }
 return root;
}
/** Wheel motion is a view-only visual hint. No simulation of terrain or towing constraints. */
export function advanceCapybaraEquipment(root:THREE.Group,distance:number):void {
 if(!Number.isFinite(distance))return;
 root.traverse(n=>{
  if(n.name==='CapybaraWheelPivot'){
   const wheel=n as THREE.Group;
   // wheel pivot height approximates the radius in its local coordinates
   const radius=Math.max(.1,wheel.position.y);
   wheel.rotation.z-=distance/radius;
  }
 });
}
/** Materials are cached/shared; dispose only each loadout's unique geometry. */
export function disposeCapybaraAccessories(root:THREE.Group):void {
 root.traverse(n=>{if(n instanceof THREE.Mesh)n.geometry.dispose();});
 root.clear();
}
