import * as THREE from 'three';
import type { Player } from './player.ts';
import { DEFAULT_APPEARANCE, type Appearance, type Emotion } from './character-style.ts';

/**
 * Original, concept-inspired chibi flying squirrel.
 * Low-poly shapes and grouped joints are intentionally separate for later rigging.
 * Local +Z is the front (the face). Glider meshes are invisible at rest.
 */
export interface SquirrelModel {
  group: THREE.Group;
  update(player: Player, dt: number, elapsed: number): void;
  setAppearance(appearance: Appearance): void;
}
const palette = {
  cocoa: 0x9d654f,
  cocoaDark: 0x77493e,
  cocoaLight: 0xb77d64,
  cream: 0xffddb8,
  muzzle: 0xffe7ca,
  ear: 0xf4ad99,
  cheeks: 0xf5a394,
  mouth: 0x6e352f,
  tongue: 0xf68b83,
  eye: 0x321e1c,
  shine: 0xffffff,
  scarf: 0xbf6f62,
  gold: 0xe2a54f,
  leaf: 0x78a66b,
};
const materials = new Map<number, THREE.MeshStandardMaterial>();
function material(color: number): THREE.MeshStandardMaterial {
  let result = materials.get(color);
  if (!result) {
    result = new THREE.MeshStandardMaterial({color,roughness:1,metalness:0,flatShading:true});
    materials.set(color,result);
  }
  return result;
}
const round = new THREE.SphereGeometry(1,12,8);
const faceted = new THREE.IcosahedronGeometry(1,1);
function oval(
  parent: THREE.Object3D, color: number,
  x: number, y: number, z: number,
  rx: number, ry: number, rz: number,
  rotZ=0, geometry: THREE.BufferGeometry=round
): THREE.Mesh {
  const shape = new THREE.Mesh(geometry,material(color));
  shape.position.set(x,y,z);
  shape.scale.set(rx,ry,rz);
  shape.rotation.z=rotZ;
  parent.add(shape);
  return shape;
}
function shape(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number,
 x=0,y=0,z=0): THREE.Mesh {
  const m=new THREE.Mesh(geometry,material(color));
  m.position.set(x,y,z);
  parent.add(m);
  return m;
}
function curve(parent:THREE.Object3D,color:number,points:[number,number,number][],radius=.025){
  const path=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return shape(parent,new THREE.TubeGeometry(path,12,radius,4,false),color);
}
function buildWings(parent: THREE.Group): THREE.Mesh {
  // Two flexible-looking angular membranes between raised arms and hips.
  const points=new Float32Array([
    -.39,1.18,.12, -1.33,1.36,.28, -1.18,.88,-.22, -.47,.46,-.29,
     .39,1.18,.12,  1.33,1.36,.28,  1.18,.88,-.22,  .47,.46,-.29
  ]);
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.BufferAttribute(points,3));
  geo.setIndex([0,1,2,0,2,3,4,6,5,4,7,6]);
  geo.computeVertexNormals();
  const wing=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({
    color:0xf3c7a0,side:THREE.DoubleSide,roughness:1,flatShading:true
  }));
  wing.visible=false;wing.name='DeployableGlider';
  parent.add(wing);return wing;
}
function createFace(head: THREE.Group): Record<Emotion, THREE.Group> {
  // Cream mask and rounded cheeks provide the reference's large light-colored face.
  oval(head,palette.cream,0,.34,.57,.60,.43,.20);
  oval(head,palette.muzzle,-.22,.13,.70,.28,.20,.18);
  oval(head,palette.muzzle,.22,.13,.70,.28,.20,.18);
  oval(head,palette.cocoaDark,0,.24,.887,.082,.065,.045);
  oval(head,palette.cheeks,-.48,.12,.80,.17,.078,.065);
  oval(head,palette.cheeks,.48,.12,.80,.17,.078,.065);

  const expressions={} as Record<Emotion,THREE.Group>;
  for(const emotion of ['happy','joyful','surprised','sleepy','determined'] as const){
    const group=new THREE.Group();group.name='FaceEmotion_'+emotion;head.add(group);
    expressions[emotion]=group;
  }
  function openEyes(g:THREE.Group,scaleY=1){
    for(const side of [-1,1]){
      oval(g,palette.eye,side*.278,.425,.824,.156,.218*scaleY,.091);
      oval(g,palette.shine,side*.278-.043,.508,.905,.051,.069,.025);
      oval(g,palette.shine,side*.278+.060,.395,.907,.019,.025,.012);
    }
  }
  openEyes(expressions.happy);
  openEyes(expressions.surprised,1.13);
  for(const side of [-1,1]){
    curve(expressions.joyful,palette.eye,[
      [side*.14,.42,.843],[side*.28,.51,.857],[side*.41,.42,.829]
    ],.030);
    oval(expressions.sleepy,palette.eye,side*.279,.39,.827,.16,.055,.085);
    oval(expressions.determined,palette.eye,side*.279,.40,.827,.147,.13,.088);
    oval(expressions.determined,palette.cocoaDark,side*.28,.59,.833,.185,.043,.057,side*.24);
  }
  // Emotion-dependent mouths, designed as small groups for cheap switches.
  const mouthHappy=expressions.happy;
  oval(mouthHappy,palette.mouth,0,-.026,.858,.161,.171,.066);
  oval(mouthHappy,palette.tongue,0,-.104,.923,.103,.067,.018);

  oval(expressions.joyful,palette.mouth,0,-.031,.852,.20,.194,.075);
  oval(expressions.joyful,palette.tongue,0,-.137,.916,.122,.073,.027);

  oval(expressions.surprised,palette.mouth,0,-.052,.884,.091,.132,.067);
  curve(expressions.sleepy,palette.mouth,[[-.105,-.045,.848],[0,-.095,.881],[.105,-.045,.848]],.025);
  curve(expressions.determined,palette.mouth,[[-.103,-.055,.857],[0,-.092,.889],[.125,-.024,.844]],.027);
  return expressions;
}
function createAccessories(body: THREE.Group, head: THREE.Group){
  const hat=new THREE.Group();hat.name='ExplorerHat';head.add(hat);
  const brim=shape(hat,new THREE.CylinderGeometry(.57,.57,.085,12),palette.gold,0,1.065,.03);
  brim.scale.z=.9;
  shape(hat,new THREE.CylinderGeometry(.37,.46,.31,12),palette.gold,0,1.25,.02);
  shape(hat,new THREE.CylinderGeometry(.405,.405,.075,12),palette.cocoaDark,0,1.11,.02);
  oval(hat,palette.leaf,.31,1.46,.13,.15,.073,.038,-.4);
  oval(hat,palette.cream,.18,1.53,.10,.055,.09,.03,-.4);

  const backpack=new THREE.Group();backpack.name='ExplorerBackpack';body.add(backpack);
  oval(backpack,palette.cocoaDark,0,.94,-.50,.50,.55,.24);
  oval(backpack,palette.cocoaLight,0,1.00,-.734,.45,.44,.20);
  oval(backpack,palette.gold,0,1.01,-.931,.095,.13,.04);
  for(const s of [-1,1]){
    const strap=oval(backpack,palette.cocoaDark,s*.49,1.17,-.21,.105,.48,.12,s*.18);
    strap.rotation.y=s*.19;
  }

  const pendant=new THREE.Group();pendant.name='AcornPendant';body.add(pendant);
  curve(pendant,palette.cocoaDark,[[-.30,1.52,.4],[0,1.11,.56],[.30,1.52,.4]],.027);
  oval(pendant,palette.gold,0,1.14,.614,.155,.19,.068);
  oval(pendant,palette.cocoaDark,0,1.27,.654,.17,.082,.074);

  const scarf=new THREE.Group();scarf.name='CozyScarf';body.add(scarf);
  const collar=shape(scarf,new THREE.TorusGeometry(.385,.115,6,14),palette.scarf,0,1.46,.12);
  collar.rotation.x=Math.PI/2;
  const tail1=shape(scarf,new THREE.BoxGeometry(.17,.53,.15),palette.scarf,.13,1.17,.51);
  tail1.rotation.z=-.14;
  return {hat,backpack,pendant,scarf};
}

export function buildSquirrel():SquirrelModel {
  const body=new THREE.Group();body.name='SquirrelBody';
  oval(body,palette.cocoa,0,.91,0,.64,.79,.52,0,faceted);
  oval(body,palette.cream,0,.84,.405,.46,.64,.22,0,faceted);

  // Rounded paws and short legs keep the stance recognizable at game distance.
  const feet:THREE.Group[]=[];
  for(const side of [-1,1]){
    const foot=new THREE.Group();foot.position.set(side*.34,.25,.15);body.add(foot);
    oval(foot,palette.cocoa,0,-.05,.04,.23,.29,.24,0,faceted);
    oval(foot,palette.cocoaLight,0,-.20,.17,.21,.085,.25);
    feet.push(foot);
  }
  // Arm pivots allow a deployable membrane without a cloth simulation.
  const arms:THREE.Group[]=[];
  for(const side of [-1,1]){
    const pivot=new THREE.Group();pivot.position.set(side*.55,1.33,.16);body.add(pivot);
    oval(pivot,palette.cocoa,side*.09,-.24,.08,.19,.35,.19,side*.18,faceted);
    oval(pivot,palette.cocoaLight,side*.11,-.49,.16,.16,.16,.15);
    arms.push(pivot);
  }

  const tail=new THREE.Group();tail.name='TailJoint';
  tail.position.set(.33,1.13,-.40);body.add(tail);
  oval(tail,palette.cocoaDark,.04,.11,-.28,.33,.30,.45,-.18,faceted);
  oval(tail,palette.cocoa,.29,.50,-.59,.47,.54,.45,-.17,faceted);
  oval(tail,palette.cocoa,.45,1.07,-.67,.59,.62,.52,.09,faceted);
  oval(tail,palette.cocoaLight,.49,1.53,-.51,.56,.48,.43,.20,faceted);
  oval(tail,palette.cream,.47,1.00,-1.105,.27,.63,.09,-.14,faceted);

  const head=new THREE.Group();head.name='HeadJoint';head.position.set(0,1.50,.22);body.add(head);
  oval(head,palette.cocoa,0,.36,.10,.71,.65,.59,0,faceted);
  // Exaggerated ear silhouette with visible pink interiors.
  for(const side of [-1,1]){
    const outer=oval(head,palette.cocoa,side*.55,.92,.03,.30,.39,.19,-side*.20,faceted);
    outer.rotation.y=-side*.1;
    oval(head,palette.ear,side*.56,.91,.195,.19,.28,.071,-side*.18,faceted);
  }
  const expressions=createFace(head);
  const accessories=createAccessories(body,head);
  const wings=buildWings(body);

  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.76,16),new THREE.MeshBasicMaterial({
    color:0x20453a,transparent:true,opacity:.18,depthWrite:false
  }));
  shadow.rotation.x=-Math.PI/2;
  shadow.position.y=.027;

  const container=new THREE.Group();container.name='FlyingSquirrel';
  container.add(shadow,body);
  // Character height ≈2 m, with model geometry left low-poly and independent of physics.
  body.scale.setScalar(.78);
  let facing=0;
  let current={...DEFAULT_APPEARANCE};
  function setAppearance(value: Appearance):void {
    current={...value};
    accessories.hat.visible=value.hat;
    accessories.backpack.visible=value.backpack;
    accessories.pendant.visible=value.neckwear==='pendant';
    accessories.scarf.visible=value.neckwear==='scarf';
    for(const [kind,group] of Object.entries(expressions)){
      group.visible=kind===value.emotion;
    }
  }
  setAppearance(current);
  return {
    group:container,
    setAppearance,
    update(player,dt,time){
      const speed=Math.hypot(player.velocity.x,player.velocity.z);
      if(speed>.4){
        const desired=Math.atan2(player.velocity.x,player.velocity.z);
        const delta=Math.atan2(Math.sin(desired-facing),Math.cos(desired-facing));
        facing+=delta*Math.min(1,dt*8);
      }
      body.rotation.y=facing;
      const airborne=player.mode==='air'||player.mode==='glide';
      const gliding=player.mode==='glide';
      const walking=player.mode==='ground'&&speed>.4;
      const stride=walking?Math.sin(time*(speed>6?15:10)):0;
      body.position.y=walking?Math.abs(stride)*.046:gliding?.08:0;
      body.rotation.z=gliding?-Math.sin(time*.9)*.065:0;
      body.rotation.x=gliding?-.11:airborne?-.04:0;
      head.rotation.z=gliding?Math.sin(time*.75)*.035:walking?stride*.015:0;
      tail.rotation.x=Math.sin(time*2.5)*.095+(gliding?.24:0);
      tail.rotation.z=Math.sin(time*1.7)*.045;
      arms[0].rotation.z=gliding? .93 : walking?stride*.20:0;
      arms[1].rotation.z=gliding?-.93 : walking?-stride*.20:0;
      feet[0].rotation.x=walking?stride*.21:0;
      feet[1].rotation.x=walking?-stride*.21:0;
      wings.visible=gliding;
      shadow.visible=player.mode==='ground';
      if(current.emotion==='sleepy'&&gliding)head.rotation.x=-.04;
    }
  };
}
