/**
 * Low-poly stylised presentation of ball mini-games (separate chunk, browser only). Reads the
 * simulation, never writes it. Per instance: ONE vertex-coloured static mesh (floors with
 * their skirts, markings, walls, obstacles, flags…), one transparent mesh for goal nets, and
 * instanced balls / pins. Geometries and materials of dynamic objects are shared by every
 * instance (created once). Everything static is derived from the same data the physics uses
 * (floor regions, static boxes), so what the player sees is what the ball hits.
 */
import * as THREE from 'three';
import {MINIGAME_VARIANTS,type FloorMaterial} from '../catalog.ts';
import {areaToWorld,type MiniGameElementV1} from '../schema.ts';
import type {MiniGameAimLine,MiniGameEnvironment,MiniGameSimulation,MiniGameView,MiniGameViewFactory} from '../types.ts';
import type {StaticBox,StaticBoxTag} from './ball-physics.ts';
import {shapeOffset,type FloorRegion} from './floors.ts';
import {ballGameOf,ballWorldOf} from './simulation.ts';
import type {BallGame} from './kit.ts';

interface SharedResources {sphere:THREE.BufferGeometry;pinGeometry:THREE.BufferGeometry;canGeometry:THREE.BufferGeometry;ring:THREE.BufferGeometry;rings:THREE.Material[];
  ball:THREE.Material;pinMaterial:THREE.Material;painted:THREE.Material;net:THREE.Material;dot:THREE.BufferGeometry;}
let shared:SharedResources|null=null;
function resources():SharedResources{
  if(shared)return shared;
  const pin=new THREE.CylinderGeometry(.07,.13,.5,6,1);pin.translate(0,.25,0);
  shared={sphere:new THREE.IcosahedronGeometry(1,1),pinGeometry:pin,canGeometry:new THREE.CylinderGeometry(.12,.12,.24,8),ring:new THREE.CircleGeometry(1,20),
    rings:[0xd8503f,0xf8f4e8].map(color=>new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide})),
    ball:new THREE.MeshLambertMaterial({color:0xffffff,flatShading:true}),pinMaterial:new THREE.MeshLambertMaterial({color:0xf4efe2,flatShading:true}),
    painted:new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide}), // Generated faces: winding-independent.
    net:new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.28,depthWrite:false,side:THREE.DoubleSide}),
    dot:new THREE.IcosahedronGeometry(1,0)};
  return shared;
}
const GOLF_COLORS=[0xffffff,0xf2c94c,0x56ccf2,0xeb5757];
const FLAG_COLORS=[0xe2453c,0xf2c94c,0x3f7fd8,0x9b51e0,0xf2994a,0x27ae60];
/** Floor palette: two alternating tones (stripes / planks) and the platform side. */
const FLOOR:Record<FloorMaterial,{a:number;b:number;side:number;stripe:number;across:boolean}>={
  pitch:{a:0x4f9a3e,b:0x5aa847,side:0x6b4f33,stripe:2,across:false},
  lane:{a:0xdcb784,b:0xd0a873,side:0x5b3d26,stripe:.12,across:true},
  gutter:{a:0x4a4f57,b:0x50555e,side:0x3a3e44,stripe:9,across:false},
  green:{a:0x46b553,b:0x3ea64b,side:0x7a5536,stripe:.5,across:false},
  sand:{a:0xe2cf9b,b:0xd9c48d,side:0xb89f6a,stripe:9,across:false},
};
/** Grassy bank of the access ramps (close to the island's meadow tone). */
const GRASS_BANK=0x6f9147;
const BOX_COLORS:Record<StaticBoxTag,number>={wall:0xeae6da,obstacle:0xb9ae98,net:0xffffff,post:0xffffff,bumper:0xf2c94c,board:0x6b4a2f};
/** Wall tone per floor family (white boards, dark wood alley, wooden mini-golf borders). */
const WALL_BY_FLOOR:Partial<Record<FloorMaterial,number>>={pitch:0xeae6da,lane:0x6b4a2f,green:0x8a5a3b};
const tmp=new THREE.Matrix4(),q=new THREE.Quaternion(),pos=new THREE.Vector3(),scale=new THREE.Vector3(),axis=new THREE.Vector3(),color=new THREE.Color();

type V3=[number,number,number];
/** Flat-shaded triangle soup with one colour per face: one draw call for a whole activity. */
class Painter {
  readonly p:number[]=[];readonly c:number[]=[];
  tri(a:V3,b:V3,d:V3,hex:number){color.setHex(hex);for(const v of [a,b,d]){this.p.push(v[0],v[1],v[2]);this.c.push(color.r,color.g,color.b);}}
  /** Quad a-b-c-d (counter-clockwise seen from the visible side). */
  quad(a:V3,b:V3,c:V3,d:V3,hex:number){this.tri(a,b,c,hex);this.tri(a,c,d,hex);}
  box(b:StaticBox,hex:number){
    const ax=(u:number,v:number,y:number):V3=>[b.cx+u*b.cos+v*b.sin,y,b.cz-u*b.sin+v*b.cos];
    const x=b.hx,z=b.hz,lo=b.minY,hi=b.maxY,dark=shade(hex,.82);
    this.quad(ax(-x,-z,hi),ax(-x,z,hi),ax(x,z,hi),ax(x,-z,hi),hex);
    this.quad(ax(-x,-z,lo),ax(x,-z,lo),ax(x,-z,hi),ax(-x,-z,hi),dark);this.quad(ax(x,z,lo),ax(-x,z,lo),ax(-x,z,hi),ax(x,z,hi),dark);
    this.quad(ax(x,-z,lo),ax(x,z,lo),ax(x,z,hi),ax(x,-z,hi),dark);this.quad(ax(-x,z,lo),ax(-x,-z,lo),ax(-x,-z,hi),ax(-x,z,hi),dark);
  }
  geometry():THREE.BufferGeometry|null{
    if(!this.p.length)return null;const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));g.computeVertexNormals();return g;
  }
}
const shade=(hex:number,k:number)=>color.setHex(hex).multiplyScalar(k).getHex();

/** A floor region (deck + skirt down into the ground), coloured in stripes or planks. */
function paintFloor(pt:Painter,game:BallGame,r:FloorRegion){
  const pal=FLOOR[r.material],hw=r.halfWidth,hl=r.halfLength,shaped=r.shape!=='flat';
  const su=pal.across?pal.stripe:shaped&&r.shape==='bank'?.4:Math.min(1,hw),sv=shaped?.25:Math.min(1,pal.stripe,hl);
  const nu=Math.max(1,Math.ceil(2*hw/su)),nv=Math.max(1,Math.ceil(2*hl/sv));
  const at=(u:number,v:number,dy=0):V3=>{
    const ax=r.x+u*r.cos+v*r.sin,az=r.z-u*r.sin+v*r.cos,w=areaToWorld(game.def.area,ax,az);
    return [w.x,r.level-r.drop+shapeOffset(r.shape,r.slope,u,v,hw,hl)+dy,w.z];
  };
  const U=(i:number)=>-hw+2*hw*i/nu,V=(j:number)=>-hl+2*hl*j/nv;
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){
    const band=pal.across?i:Math.floor((V(j)+hl+1e-6)/pal.stripe);
    pt.quad(at(U(i),V(j)),at(U(i+1),V(j)),at(U(i+1),V(j+1)),at(U(i),V(j+1)),band%2?pal.b:pal.a);
  }
  // Platform sides, down to 1 m under the deck (buried where the relief is higher).
  const down=-1;
  for(let i=0;i<nu;i++){pt.quad(at(U(i+1),-hl,down),at(U(i),-hl,down),at(U(i),-hl),at(U(i+1),-hl),pal.side);pt.quad(at(U(i),hl,down),at(U(i+1),hl,down),at(U(i+1),hl),at(U(i),hl),pal.side);}
  for(let j=0;j<nv;j++){pt.quad(at(-hw,V(j),down),at(-hw,V(j+1),down),at(-hw,V(j+1)),at(-hw,V(j)),pal.side);pt.quad(at(hw,V(j+1),down),at(hw,V(j),down),at(hw,V(j)),at(hw,V(j+1)),pal.side);}
  // Access ramps (the hamster's walking surface around the deck), only where the deck stands
  // above the relief. Same formula as Floors.walk along the edge normal.
  const apron=r.material==='sand'?shade(pal.a,.92):GRASS_BANK,A=game.floors.apron;
  const out=(u:number,v:number,nu:number,nv:number):V3=>{
    const e=at(u,v),ax=r.x+(u+nu*A)*r.cos+(v+nv*A)*r.sin,az=r.z-(u+nu*A)*r.sin+(v+nv*A)*r.cos,w=areaToWorld(game.def.area,ax,az);
    return [w.x,Math.min(e[1],game.floors.ground(w.x,w.z)+.02),w.z];
  };
  const ramp=(u0:number,v0:number,u1:number,v1:number,nu:number,nv:number)=>{
    const a=at(u0,v0),b=at(u1,v1),c=out(u1,v1,nu,nv),d=out(u0,v0,nu,nv);
    if(a[1]-d[1]<.04&&b[1]-c[1]<.04)return;pt.quad(a,d,c,b,apron);
  };
  for(let i=0;i<nu;i++){ramp(U(i),-hl,U(i+1),-hl,0,-1);ramp(U(i+1),hl,U(i),hl,0,1);}
  for(let j=0;j<nv;j++){ramp(-hw,V(j+1),-hw,V(j),-1,0);ramp(hw,V(j),hw,V(j+1),1,0);}
}
/** Flat mark on the deck (area frame): a thin strip from a to b. */
function strip(pt:Painter,game:BallGame,a:{x:number;z:number},b:{x:number;z:number},width:number,hex:number,lift=.012){
  const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;
  const w=(x:number,z:number):V3=>{const p=areaToWorld(game.def.area,x,z);return [p.x,game.env.height(p.x,p.z)+lift,p.z];};
  pt.quad(w(a.x-nx,a.z-nz),w(a.x+nx,a.z+nz),w(b.x+nx,b.z+nz),w(b.x-nx,b.z-nz),hex);
}
function ringMark(pt:Painter,game:BallGame,cx:number,cz:number,radius:number,width:number,hex:number,n=24){
  for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2;strip(pt,game,{x:cx+Math.cos(a)*radius,z:cz+Math.sin(a)*radius},{x:cx+Math.cos(b)*radius,z:cz+Math.sin(b)*radius},width,hex);}
}
function disc(pt:Painter,game:BallGame,cx:number,cz:number,radius:number,hex:number,lift=.014,n=10){
  const w=(x:number,z:number):V3=>{const p=areaToWorld(game.def.area,x,z);return [p.x,game.env.height(p.x,p.z)+lift,p.z];};
  const c=w(cx,cz);for(let k=0;k<n;k++){const a=k/n*Math.PI*2,b=(k+1)/n*Math.PI*2;pt.tri(c,w(cx+Math.cos(b)*radius,cz+Math.sin(b)*radius),w(cx+Math.cos(a)*radius,cz+Math.sin(a)*radius),hex);}
}
/** Upright decorative box at an area point (flag poles, goal posts, board legs). */
function pole(pt:Painter,game:BallGame,x:number,z:number,w:number,h:number,hex:number,base?:number){
  const p=areaToWorld(game.def.area,x,z),y=base??game.env.height(p.x,p.z),hd=game.def.area.heading;
  pt.box({cx:p.x,cz:p.z,hx:w/2,hz:w/2,minY:y,maxY:y+h,cos:Math.cos(hd),sin:Math.sin(hd),restitution:0},hex);
}
const WHITE=0xf8f6ee;
function markings(pt:Painter,game:BallGame){
  const def=game.def,{halfWidth:hw,halfLength:hl}=def.area,el=(k:MiniGameElementV1['kind'])=>def.elements.filter(e=>e.kind===k);
  switch(def.variant){
    case 'football':{
      const i=.25,line=(x0:number,z0:number,x1:number,z1:number)=>strip(pt,game,{x:x0,z:z0},{x:x1,z:z1},.09,WHITE);
      line(-hw+i,-hl+i,hw-i,-hl+i);line(hw-i,-hl+i,hw-i,hl-i);line(hw-i,hl-i,-hw+i,hl-i);line(-hw+i,hl-i,-hw+i,-hl+i);line(-hw+i,0,hw-i,0);
      ringMark(pt,game,0,0,Math.min(2.5,hw*.35),.09,WHITE);disc(pt,game,0,0,.12,WHITE);
      for(const g of el('goal')){
        const s=Math.sign(g.z)||1,w=(g.width??4)/2+1.2,d=2,z=s*(hl-i),h=g.height??1.6,gw=(g.width??4)/2;
        line(g.x-w,z-s*d,g.x+w,z-s*d);line(g.x-w,z,g.x-w,z-s*d);line(g.x+w,z,g.x+w,z-s*d);disc(pt,game,g.x,z-s*3.2,.1,WHITE);
        const team=def.teams?.find(t=>t.id===g.teamId)?.color??WHITE;
        for(const side of [-1,1])pole(pt,game,g.x+side*gw,g.z,.12,h,WHITE);
        strip(pt,game,{x:g.x-gw,z:g.z+s*.3},{x:g.x+gw,z:g.z+s*.3},.5,team,.02); // Team colour in the goal mouth.
      }
      break;
    }
    case 'bowling':{
      const tee=el('tee')[0],lw=hw-.35;
      strip(pt,game,{x:-lw,z:tee.z+1},{x:lw,z:tee.z+1},.05,0x2b2b2b);
      for(let k=-2;k<=2;k++){const x=k*lw/3,z=tee.z+4;pt.tri(...arrow(game,x,z));}
      for(const pin of el('pin'))disc(pt,game,pin.x,pin.z,.09,0x9c7b52);
      disc(pt,game,tee.x,tee.z,.08,0x2b2b2b);
      break;
    }
    case 'minigolf':{
      const holes=el('hole'),tees=el('tee');
      holes.forEach((h,k)=>{
        const stage=h.stage??k,flag=FLAG_COLORS[stage%FLAG_COLORS.length];
        disc(pt,game,h.x,h.z,.15,0x161412,.016,12);ringMark(pt,game,h.x,h.z,.16,.025,WHITE,12);
        const p=areaToWorld(def.area,h.x,h.z),top=game.env.height(p.x,p.z)+1.1;
        pole(pt,game,h.x+.1,h.z,.025,1.1,WHITE);
        const a=areaToWorld(def.area,h.x+.1,h.z),b=areaToWorld(def.area,h.x+.5,h.z);
        pt.tri([a.x,top,a.z],[b.x,top-.13,b.z],[a.x,top-.26,a.z],flag);pt.tri([a.x,top-.26,a.z],[b.x,top-.13,b.z],[a.x,top,a.z],flag);
      });
      for(const t of tees){
        const lane=def.elements.find(e=>e.kind==='lane'&&e.stage===t.stage),yaw=lane?.yaw??0,c=Math.cos(yaw),s=Math.sin(yaw);
        const half=(u:number,v:number)=>({x:t.x+u*c+v*s,z:t.z-u*s+v*c});
        strip(pt,game,half(-.55,0),half(.55,0),.5,0x2f8a3c,.013);
        disc(pt,game,t.x,t.z,.05,WHITE,.016,8);
        // Hole number as pips on the tee mat (1…9).
        for(let k=0;k<=(t.stage??0);k++){const p=half(-.45+k*.12,-.15);disc(pt,game,p.x,p.z,.035,FLAG_COLORS[(t.stage??0)%FLAG_COLORS.length],.017,6);}
      }
      break;
    }
    default:{ // Throwing games: a white throw line and the stand of each board.
      const tee=el('tee')[0];strip(pt,game,{x:-.8,z:tee.z+.25},{x:.8,z:tee.z+.25},.07,WHITE);
      for(const e of el('target'))if(MINIGAME_VARIANTS[def.variant].visual?.board){
        const half=(e.width??1.2)/2;for(const side of [-1,1])pole(pt,game,e.x+side*half*.7,e.z+.08,.08,(e.height??1)-half+.05,0x5b3d26);
      }
    }
  }
}
function arrow(game:BallGame,x:number,z:number):[V3,V3,V3,number]{
  const w=(ax:number,az:number):V3=>{const p=areaToWorld(game.def.area,ax,az);return [p.x,game.env.height(p.x,p.z)+.012,p.z];};
  return [w(x-.06,z),w(x+.06,z),w(x,z+.22),0x7a5230];
}
function boxColor(game:BallGame,b:StaticBox){
  const tag=b.tag??'obstacle',floor=game.floors.regions[0]?.material;
  if(tag==='wall')return WALL_BY_FLOOR[floor]??BOX_COLORS.wall;
  if(tag==='obstacle'&&MINIGAME_VARIANTS[game.def.variant].family==='target')return 0xc0392b; // Table cloth.
  return BOX_COLORS[tag];
}
function staticMeshes(game:BallGame,boxes:readonly StaticBox[],withFloors:boolean){
  const pt=new Painter(),nets=new Painter();
  if(withFloors){for(const r of game.floors.regions)paintFloor(pt,game,r);markings(pt,game);}
  for(const b of boxes)(b.tag==='net'?nets:pt).box(b,boxColor(game,b));
  return {solid:pt.geometry(),nets:nets.geometry()};
}
function create(parent:unknown,sim:MiniGameSimulation,_env:MiniGameEnvironment):MiniGameView{
  const root=parent as THREE.Object3D,res=resources(),world=ballWorldOf(sim),game=ballGameOf(sim),def=sim.def;
  const group=new THREE.Group();group.name='MiniGame:'+def.id;root.add(group);
  const owned:{dispose():void}[]=[];
  // Static field: floors, markings and every box the ball collides with (same data as physics).
  const base=staticMeshes(game,game.baseBoxes,true);
  for(const [g,m] of [[base.solid,res.painted],[base.nets,res.net]] as const)if(g){const mesh=new THREE.Mesh(g,m);mesh.castShadow=mesh.receiveShadow=false;group.add(mesh);owned.push(g);}
  // Mode-dependent boxes (bowling bumpers): rebuilt only when the box list changes.
  let extraBoxes:StaticBox[]|null=null,extra:THREE.Mesh|null=null;
  const syncExtra=()=>{
    if(world.boxes===extraBoxes)return;extraBoxes=world.boxes;
    if(extra){group.remove(extra);extra.geometry.dispose();extra=null;}
    const more=world.boxes.filter(b=>!game.baseBoxes.includes(b));if(!more.length)return;
    const g=staticMeshes(game,more,false).solid;if(g){extra=new THREE.Mesh(g,res.painted);group.add(extra);}
  };
  // Dynamic objects: one InstancedMesh for spheres, one for pins / cans (data-driven `visual`).
  const visual=MINIGAME_VARIANTS[def.variant].visual??{},upright=visual.upright??'pin',pinIndex:number[]=[],ballIndex:number[]=[];
  const uprightIds=new Set(def.elements.filter(e=>e.kind==='pin'||e.kind==='target').map(e=>e.id));
  for(let i=0;i<world.count;i++)(uprightIds.has(world.ids[i])?pinIndex:ballIndex).push(i);
  const balls=new THREE.InstancedMesh(res.sphere,res.ball,Math.max(1,ballIndex.length));balls.frustumCulled=false;group.add(balls);owned.push(balls);
  ballIndex.forEach((_,k)=>balls.setColorAt(k,color.setHex(visual.playerColors?GOLF_COLORS[k%GOLF_COLORS.length]:visual.ballColor??0xffffff)));
  const pins=pinIndex.length?new THREE.InstancedMesh(upright==='can'?res.canGeometry:res.pinGeometry,res.pinMaterial,pinIndex.length):null;
  if(pins&&upright==='can')pinIndex.forEach((_,k)=>pins.setColorAt(k,color.setHex([0xd8503f,0x3f7fd8,0xf2c94c][k%3])));
  // Target boards: concentric rings on the face turned towards the thrower.
  if(visual.board)for(const e of def.elements)if(e.kind==='target'){
    const half=(e.width??1.2)/2,p=areaToWorld(def.area,e.x,e.z-.06),y=game.env.height(p.x,p.z)+(e.height??1);
    for(let k=0;k<5;k++){const m=new THREE.Mesh(res.ring,res.rings[k%2]);m.scale.setScalar(half*(5-k)/5);m.position.set(p.x,y,p.z);m.rotation.y=def.area.heading+Math.PI;m.translateZ(.001*k);group.add(m);}
  }
  if(pins){pins.frustumCulled=false;group.add(pins);owned.push(pins);}
  const homes=new Map(def.elements.map(e=>[e.id,areaToWorld(def.area,e.x,e.z)]));
  function update(alpha:number){
    syncExtra();
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
  return {update,dispose(){root.remove(group);for(const o of owned)o.dispose();owned.length=0;if(extra){extra.geometry.dispose();extra=null;}group.clear();}};
}
/** Dotted trajectory preview (slingshot): ≤ 32 instanced dots and a landing ring, tinted
 * green → red with the power. Hidden when `set(null)`. */
export const AIM_DOTS=32;
function createAimLine(parent:unknown):MiniGameAimLine{
  const root=parent as THREE.Object3D,res=resources();
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9,depthWrite:false});
  const dots=new THREE.InstancedMesh(res.dot,material,AIM_DOTS+1);dots.frustumCulled=false;dots.visible=false;dots.renderOrder=2;dots.name='MiniGameAimLine';root.add(dots);
  return {
    set(points,power){
      if(!points||points.length<6){dots.visible=false;return;}
      material.color.setHSL((1-Math.max(0,Math.min(1,power)))*.33,.85,.55);
      const n=points.length/3,step=Math.max(1,Math.ceil(n/AIM_DOTS));let k=0;
      for(let i=step;i<n&&k<AIM_DOTS;i+=step,k++){pos.set(points[3*i],points[3*i+1],points[3*i+2]);scale.setScalar(.05);tmp.compose(pos,q.identity(),scale);dots.setMatrixAt(k,tmp);}
      // Landing marker: a larger flat dot at the end of the preview.
      pos.set(points[3*(n-1)],points[3*(n-1)+1],points[3*(n-1)+2]);scale.set(.16,.03,.16);tmp.compose(pos,q.identity(),scale);dots.setMatrixAt(k++,tmp);
      dots.count=k;dots.instanceMatrix.needsUpdate=true;dots.visible=true;
    },
    dispose(){root.remove(dots);dots.dispose();material.dispose();},
  };
}
export const ballViewFactory:MiniGameViewFactory={create,createAimLine};
