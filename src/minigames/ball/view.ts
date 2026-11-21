/**
 * Low-poly presentation of ball mini-games (separate chunk, browser only). Reads the
 * simulation, never writes it. Geometries/materials of balls and pins are shared by all
 * instances (created once, kept for the page); each instance owns only its instanced
 * meshes and one merged static mesh, both disposed with the instance.
 */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {MINIGAME_VARIANTS} from '../catalog.ts';
import {areaToWorld} from '../schema.ts';
import type {MiniGameEnvironment,MiniGameSimulation,MiniGameView,MiniGameViewFactory} from '../types.ts';
import type {StaticBox} from './ball-physics.ts';
import {ballGameOf,ballWorldOf} from './simulation.ts';

interface SharedResources {sphere:THREE.BufferGeometry;pinGeometry:THREE.BufferGeometry;canGeometry:THREE.BufferGeometry;ring:THREE.BufferGeometry;rings:THREE.Material[];ball:THREE.Material;pinMaterial:THREE.Material;field:THREE.Material;hole:THREE.Material;tee:THREE.Material;line:THREE.LineBasicMaterial;disc:THREE.BufferGeometry}
let shared:SharedResources|null=null;
function resources():SharedResources{
  if(shared)return shared;
  const pin=new THREE.CylinderGeometry(.07,.13,.5,6,1);pin.translate(0,.25,0);
  shared={sphere:new THREE.IcosahedronGeometry(1,1),pinGeometry:pin,canGeometry:new THREE.CylinderGeometry(.12,.12,.24,8),ring:new THREE.CircleGeometry(1,20),
    rings:[0xd8503f,0xf8f4e8].map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide})),disc:new THREE.CircleGeometry(1,12).rotateX(-Math.PI/2),
    ball:new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),pinMaterial:new THREE.MeshLambertMaterial({color:0xf4efe2,flatShading:true}),tee:new THREE.MeshBasicMaterial({color:0xf8f4e8}),
    field:new THREE.MeshLambertMaterial({color:0xb48a5a,flatShading:true}),hole:new THREE.MeshBasicMaterial({color:0x1d1a16}),
    line:new THREE.LineBasicMaterial({color:0xf8f4e8})};
  return shared;
}
const GOLF_COLORS=[0xffffff,0xf2c94c,0x56ccf2,0xeb5757];
const tmp=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),axis=new THREE.Vector3(),color=new THREE.Color();

function staticGeometry(boxes:readonly StaticBox[]):THREE.BufferGeometry|null{
  const parts=boxes.map(b=>{const h=b.maxY-b.minY,g=new THREE.BoxGeometry(b.hx*2,h,b.hz*2);g.rotateY(Math.atan2(b.sin,b.cos));g.translate(b.cx,b.minY+h/2,b.cz);return g;});
  if(!parts.length)return null;
  const merged=mergeGeometries(parts);parts.forEach(p=>p.dispose());return merged;
}
function create(parent:unknown,sim:MiniGameSimulation,env:MiniGameEnvironment):MiniGameView{
  const root=parent as THREE.Object3D,res=resources(),world=ballWorldOf(sim),game=ballGameOf(sim),def=sim.def;
  const group=new THREE.Group();group.name='MiniGame:'+def.id;root.add(group);
  const owned:{dispose():void}[]=[];
  // Static field: walls, obstacles and goal frames from the SAME boxes the ball collides with.
  const geom=staticGeometry(world.boxes);
  if(geom){const m=new THREE.Mesh(geom,res.field);m.castShadow=false;m.receiveShadow=false;group.add(m);owned.push(geom);}
  // Area outline 4 cm above the ground (football pitch / lane / course limits).
  const {halfWidth:w,halfLength:l}=def.area,pts:THREE.Vector3[]=[];
  const corners=[[-w,-l],[w,-l],[w,l],[-w,l]];
  for(let c=0;c<4;c++){const [x0,z0]=corners[c],[x1,z1]=corners[(c+1)%4];for(let k=0;k<6;k++){const p=areaToWorld(def.area,x0+(x1-x0)*k/6,z0+(z1-z0)*k/6);pts.push(new THREE.Vector3(p.x,env.height(p.x,p.z)+.04,p.z));}}
  const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),res.line);group.add(outline);owned.push(outline.geometry);
  for(const e of def.elements)if(e.kind==='hole'||e.kind==='tee'||e.kind==='spawn'){
    const p=areaToWorld(def.area,e.x,e.z),m=new THREE.Mesh(res.disc,e.kind==='hole'?res.hole:res.tee);
    m.position.set(p.x,env.height(p.x,p.z)+.03,p.z);m.scale.setScalar(e.kind==='hole'?.22:e.kind==='spawn'?.2:.3);group.add(m);
  }
  // Dynamic objects: one InstancedMesh for spheres, one for pins (bowling).
  // Data-driven presentation (catalogue `visual`): dynamic objects authored as pins or targets
  // stand upright, everything else is a sphere.
  const visual=MINIGAME_VARIANTS[def.variant].visual??{},upright=visual.upright??'pin',pinIndex:number[]=[],ballIndex:number[]=[];
  const uprightIds=new Set(def.elements.filter(e=>e.kind==='pin'||e.kind==='target').map(e=>e.id));
  for(let i=0;i<world.count;i++)(uprightIds.has(world.ids[i])?pinIndex:ballIndex).push(i);
  const balls=new THREE.InstancedMesh(res.sphere,res.ball,Math.max(1,ballIndex.length));balls.frustumCulled=false;group.add(balls);owned.push(balls);
  ballIndex.forEach((_,k)=>balls.setColorAt(k,color.setHex(visual.playerColors?GOLF_COLORS[k%GOLF_COLORS.length]:visual.ballColor??0xffffff)));
  const pins=pinIndex.length?new THREE.InstancedMesh(upright==='can'?res.canGeometry:res.pinGeometry,res.pinMaterial,pinIndex.length):null;
  if(pins&&upright==='can')pinIndex.forEach((_,k)=>pins.setColorAt(k,color.setHex([0xd8503f,0x3f7fd8,0xf2c94c][k%3])));
  // Target boards: concentric rings on the face turned towards the thrower.
  if(visual.board)for(const e of def.elements)if(e.kind==='target'){
    const half=(e.width??1.2)/2,p=areaToWorld(def.area,e.x,e.z-.06),y=env.height(p.x,p.z)+(e.height??1);
    for(let k=0;k<5;k++){const m=new THREE.Mesh(res.ring,res.rings[k%2]);m.scale.setScalar(half*(5-k)/5);m.position.set(p.x,y,p.z);m.rotation.y=def.area.heading+Math.PI;m.translateZ(.001*k);group.add(m);}
  }
  if(pins){pins.frustumCulled=false;group.add(pins);owned.push(pins);}
  const homes=new Map(def.elements.map(e=>[e.id,areaToWorld(def.area,e.x,e.z)]));
  function update(alpha:number){
    ballIndex.forEach((i,k)=>{
      const r=world.radius[i],on=world.enabled[i]===1;
      pos.set(world.ox[i]+(world.px[i]-world.ox[i])*alpha,world.oy[i]+(world.py[i]-world.oy[i])*alpha,world.oz[i]+(world.pz[i]-world.oz[i])*alpha);
      scale.setScalar(on?r:0);tmp.compose(pos,q.identity(),scale);balls.setMatrixAt(k,tmp);
    });
    balls.instanceMatrix.needsUpdate=true;
    if(pins){
      const knocked=(game.state as {knocked?:number[]}).knocked??[];
      pinIndex.forEach((i,k)=>{
        const on=world.enabled[i]===1,home=homes.get(world.ids[i])!;
        pos.set(world.px[i],upright==='can'?world.py[i]:world.py[i]-world.radius[i],world.pz[i]);
        // Presentation-only fall: tilt along the displacement once the rules count it down.
        if(knocked.includes(i)){const dx=world.px[i]-home.x,dz=world.pz[i]-home.z,d=Math.hypot(dx,dz)||1;axis.set(dz/d,0,-dx/d);q.setFromAxisAngle(axis,Math.min(Math.PI/2,.4+d*4));}else q.identity();
        scale.setScalar(on?1:0);tmp.compose(pos,q,scale);pins.setMatrixAt(k,tmp);
      });
      pins.instanceMatrix.needsUpdate=true;
    }
  }
  update(1);
  return {update,dispose(){root.remove(group);for(const o of owned)o.dispose();owned.length=0;group.clear();}};
}
export const ballViewFactory:MiniGameViewFactory={create};
