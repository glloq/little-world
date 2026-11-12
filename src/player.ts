import * as THREE from 'three';
import { clamp, insideWorld, terrainHeight, waterSurface } from './terrain';

export type MotionMode = 'ground' | 'air' | 'glide' | 'swim' | 'dive';
export interface Controls {
  forward: number;
  right: number;
  run: boolean;
  jumpPressed: boolean;
  spaceHeld: boolean;
  dive: boolean;
  cameraYaw: number;
}
export interface Player {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mode: MotionMode;
  oxygen: number;
  glideReady: boolean;
}
export const MAX_OXYGEN = 90;
export function spawnPlayer(): Player {
  const x=-24,z=-183;
  return {position:new THREE.Vector3(x,terrainHeight(x,z)+.02,z),
    velocity:new THREE.Vector3(),mode:'ground',oxygen:MAX_OXYGEN,glideReady:false};
}

export function simulatePlayer(p: Player, keys: Controls, dt: number): void {
  const {position:pos,velocity:v}=p;
  const oldMode=p.mode;
  const len=Math.hypot(keys.forward,keys.right);
  const forward=len>0?keys.forward/Math.max(1,len):0;
  const right=len>0?keys.right/Math.max(1,len):0;
  const sx=Math.sin(keys.cameraYaw),cz=Math.cos(keys.cameraYaw);
  const dx=right*cz+forward*sx;
  const dz=forward*cz-right*sx;
  const atWater=waterSurface(pos.x,pos.z);
  const ground=terrainHeight(pos.x,pos.z);
  const deepEnough=atWater!==null && atWater-ground>.62;
  const inWater=deepEnough && pos.y<=atWater+.42;
  if(inWater) {
    if(oldMode!=='swim'&&oldMode!=='dive') {
      p.mode='swim';v.y=0;pos.y=Math.min(pos.y,atWater+.12);
    }
    const speed=keys.run?5.0:3.15;
    const smoothing=Math.min(1,dt*6);
    v.x+=(dx*speed-v.x)*smoothing;
    v.z+=(dz*speed-v.z)*smoothing;
    let vyTarget=0;
    if(keys.dive)vyTarget=-3.2;
    else if(keys.spaceHeld || p.oxygen<=0)vyTarget=3.75;
    else if(pos.y>=atWater-.3)vyTarget=1.2;
    v.y+=(vyTarget-v.y)*Math.min(1,dt*5);
    pos.y+=v.y*dt;
    const floor=ground+.45;
    pos.y=clamp(pos.y,floor,atWater+.12);
    p.mode=pos.y<atWater-.55?'dive':'swim';
    if(p.mode==='dive')p.oxygen=Math.max(0,p.oxygen-dt);
    else p.oxygen=Math.min(MAX_OXYGEN,p.oxygen+dt*9);
    p.glideReady=false;
  } else {
    if(oldMode==='swim'||oldMode==='dive') {
      p.mode='air';
      v.y=Math.max(0,v.y);
    }
    const grounded=pos.y<=ground+.06 && v.y<=0;
    if(grounded) {
      p.mode='ground';pos.y=ground;v.y=0;p.glideReady=false;
      if(keys.jumpPressed){
        p.mode='air';v.y=7.1;p.glideReady=true;
      }
    } else if(p.mode==='ground') {
      p.mode='air';
      p.glideReady=true;
    }
    if(p.mode==='air'||p.mode==='glide') {
      if(keys.jumpPressed && p.glideReady) {
        p.mode=p.mode==='glide'?'air':'glide';
      }
      if(p.mode==='glide') {
        const forwardSpeed=10.4, a=Math.min(1,dt*2.1);
        v.x+=(dx*forwardSpeed-v.x)*a;
        v.z+=(dz*forwardSpeed-v.z)*a;
        v.y=Math.max(-2.8,v.y-5.0*dt);
        v.y=Math.min(v.y,2.8);
      } else {
        v.y-=17.2*dt;
        const speed=keys.run?7.2:5.2;
        const a=Math.min(1,dt*1.9);
        v.x+=(dx*speed-v.x)*a;
        v.z+=(dz*speed-v.z)*a;
      }
      pos.y+=v.y*dt;
      const nextGround=terrainHeight(pos.x,pos.z);
      if(pos.y<=nextGround && v.y<=0) {
        pos.y=nextGround;v.y=0;p.mode='ground';p.glideReady=false;
      }
    } else {
      const speed=keys.run?8.7:4.65;
      const a=Math.min(1,dt*10);
      v.x+=(dx*speed-v.x)*a;
      v.z+=(dz*speed-v.z)*a;
    }
    p.oxygen=Math.min(MAX_OXYGEN,p.oxygen+dt*14);
  }
  pos.x+=v.x*dt;
  pos.z+=v.z*dt;
  if(!insideWorld(pos.x,pos.z)){
    pos.x=clamp(pos.x,-97,97);pos.z=clamp(pos.z,-288,286);
    v.x*=.2;v.z*=.2;
  }
  const newGround=terrainHeight(pos.x,pos.z);
  if(p.mode==='ground')pos.y=Math.max(pos.y,newGround);
  if((p.mode==='air'||p.mode==='glide') && pos.y<newGround){
    pos.y=newGround;v.y=0;p.mode='ground';p.glideReady=false;
  }
  // Water is evaluated after horizontal motion as well, to avoid passing through the banks.
  const newWater=waterSurface(pos.x,pos.z);
  if(newWater!==null && newWater-terrainHeight(pos.x,pos.z)>.62 && pos.y<=newWater+.25
     && p.mode!=='swim'&&p.mode!=='dive'){
    p.mode='swim';v.y=0;pos.y=newWater+.08;p.glideReady=false;
  }
}

function part(g: THREE.Group, shape: THREE.BufferGeometry, color:number,
              x:number,y:number,z:number,sx=1,sy=1,sz=1): THREE.Mesh {
  const m=new THREE.Mesh(shape,new THREE.MeshLambertMaterial({color}));
  m.position.set(x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;
}
export interface SquirrelModel {
  group:THREE.Group;
  update:(p:Player,dt:number,clock:number)=>void;
}
export function buildSquirrel():SquirrelModel{
  const g=new THREE.Group();
  const round=new THREE.SphereGeometry(1,10,7);
  const brown=0xa4754d,light=0xeac79c,dark=0x4d3e34;
  part(g,round,brown,0,.80,0,.48,.36,.76);
  part(g,round,light,0,.53,.22,.34,.18,.45);
  part(g,round,brown,0,1.03,.7,.40,.40,.41);
  part(g,round,light,0,.87,.95,.32,.24,.16);
  for(const s of [-1,1]){
    part(g,round,brown,s*.28,1.34,.67,.17,.23,.15);
    part(g,round,0xf2c8a2,s*.28,1.36,.79,.09,.14,.08);
    part(g,round,dark,s*.17,1.08,1.075,.066,.075,.06);
    part(g,round,light,s*.28,.33,.40,.17,.27,.20);
    part(g,round,brown,s*.32,.34,-.44,.21,.28,.23);
  }
  part(g,round,dark,0,.86,1.12,.09,.07,.07);
  const tail=new THREE.Group();g.add(tail);tail.position.set(0,.93,-.6);
  const chunks=[
    [0,0,-.1,.22,.19,.34],[0,.13,-.48,.27,.25,.38],
    [0,.44,-.78,.3,.34,.40],[0,.81,-.91,.31,.38,.34],
  ];
  for(const [x,y,z,sx,sy,sz] of chunks)part(tail,round,brown,x,y,z,sx,sy,sz);
  part(tail,round,light,0,.93,-1.04,.20,.21,.11);
  const wingMat=new THREE.MeshLambertMaterial({color:0xd9ae7d,side:THREE.DoubleSide,transparent:true,opacity:.93});
  const wingVerts=new Float32Array([
    -.23,.77,.62,-1.35,.62,.32,-.42,.61,-.58,
    .23,.77,.62,.42,.61,-.58,1.35,.62,.32
  ]);
  const wingsGeometry=new THREE.BufferGeometry();
  wingsGeometry.setAttribute('position',new THREE.BufferAttribute(wingVerts,3));
  wingsGeometry.computeVertexNormals();
  const wings=new THREE.Mesh(wingsGeometry,wingMat);g.add(wings);wings.visible=false;
  const leftArm=part(g,round,brown,-.4,.6,.45,.17,.17,.48);
  const rightArm=part(g,round,brown,.4,.6,.45,.17,.17,.48);
  const shadow=new THREE.Mesh(new THREE.CircleGeometry(.75,16),new THREE.MeshBasicMaterial({
    color:0x1a473a,transparent:true,opacity:.22,depthWrite:false
  }));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=.028;
  const container=new THREE.Group();container.add(shadow,g);
  let facing=0;
  return {
    group:container,
    update(p:Player,dt:number,time:number){
      const moving=Math.hypot(p.velocity.x,p.velocity.z)>.4;
      if(moving){
        const desired=Math.atan2(p.velocity.x,p.velocity.z);
        let diff=Math.atan2(Math.sin(desired-facing),Math.cos(desired-facing));
        facing+=diff*Math.min(1,dt*8);
      }
      g.rotation.y=facing;
      wings.visible=p.mode==='glide';
      const gait=p.mode==='ground'&&moving?Math.sin(time*(Math.hypot(p.velocity.x,p.velocity.z)>6?16:10))*.07:0;
      g.position.y=gait+(p.mode==='glide'?.12:0);
      g.rotation.z=p.mode==='glide'?-Math.sin(time*1.2)*.08:0;
      tail.rotation.x=Math.sin(time*3)*.16+(p.mode==='glide'?.2:0);
      leftArm.rotation.y=p.mode==='glide'?-1.0:0;
      rightArm.rotation.y=p.mode==='glide'?1.0:0;
      shadow.visible=p.mode==='ground';
    }
  };
}
