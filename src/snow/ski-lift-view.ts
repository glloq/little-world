/** Low-poly lifts of a ski domain: pylons grounded on the terrain, two stations per lift, cables
 * and one InstancedMesh per carrier type (chairs, gondola cabins, T-bars). Static parts are
 * merged per material; carriers are the only per-frame update (no colliders, no shadows). */
import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {seatCount,seatPosition} from './ski-lift.ts';
import type {ResortLift} from './ski-resort.ts';
import type {LiftKind} from './resort-planner.ts';

const STATION_COLORS:Record<LiftKind,number>={gondola:0x2f6fd0,chairlift:0xc24a33,draglift:0x3d8a4a};
function placed(geometry:THREE.BufferGeometry,x:number,y:number,z:number,yaw=0,sx=1,sy=1,sz=1){
  const g=geometry.clone();g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),new THREE.Vector3(sx,sy,sz)));return g;
}
function carrierGeometry(kind:LiftKind){
  const parts:THREE.BufferGeometry[]=[];
  if(kind==='gondola'){
    parts.push(placed(new THREE.BoxGeometry(1.7,1.8,1.7),0,-.2,0),placed(new THREE.BoxGeometry(1.8,.18,1.8),0,.75,0),placed(new THREE.BoxGeometry(.12,1.3,.12),0,1.45,0));
  }else if(kind==='chairlift'){
    parts.push(placed(new THREE.BoxGeometry(1.5,.14,.62),0,0,0),placed(new THREE.BoxGeometry(1.5,.7,.1),0,.38,-.3),
      placed(new THREE.BoxGeometry(.08,1.2,.08),0,.75,-.32),placed(new THREE.BoxGeometry(1.5,.06,.06),0,.55,.28));
  }else{
    // T-bar: hanger from the cable (≈3.4 m above the snow) and a short bar at hip height.
    parts.push(placed(new THREE.BoxGeometry(.06,3,.06),0,1.9,0),placed(new THREE.BoxGeometry(1.1,.08,.08),0,.42,0));
  }
  const merged=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());return merged;
}
export function createSkiLiftView(scene:THREE.Scene,lifts:readonly ResortLift[],height:(x:number,z:number)=>number){
  const root=new THREE.Group();root.name='SkiLifts';
  const steel=new THREE.MeshLambertMaterial({color:0x76858d,flatShading:true});
  const wood=new THREE.MeshLambertMaterial({color:0x8a5f3c,flatShading:true});
  const roofs=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
  const cableMat=new THREE.LineBasicMaterial({color:0x2c343b});
  const steelParts:THREE.BufferGeometry[]=[],woodParts:THREE.BufferGeometry[]=[],roofParts:THREE.BufferGeometry[]=[],cable:number[]=[];
  const mast=new THREE.CylinderGeometry(.22,.3,1,6),arm=new THREE.BoxGeometry(2.6,.22,.32),wheel=new THREE.CylinderGeometry(1.1,1.1,.25,10);
  const hut=new THREE.BoxGeometry(4.6,3,5),roof=new THREE.ConeGeometry(4.2,1.6,4);
  for(const {kind,lift} of lifts){
    const path=lift.path,first=path[0],last=path[path.length-1],yaw=Math.atan2(last.x-first.x,last.z-first.z);
    const sideX=Math.cos(yaw)*.7,sideZ=-Math.sin(yaw)*.7;
    // Pylons: every support of an aerial lift, every ~40 m of a draglift (cable at 4.5 m).
    const dragTop=4.5;
    const supports=kind==='draglift'?path.filter((_,i)=>i>0&&i<path.length-1&&i%7===0):path.slice(1,-1);
    for(const p of supports){
      const ground=height(p.x,p.z),top=kind==='draglift'?ground+dragTop:p.y+.35,h=Math.max(1,top-ground+.4);
      steelParts.push(placed(mast,p.x,ground+h/2-.4,p.z,0,1,h,1),placed(arm,p.x,top,p.z,yaw+Math.PI/2));
    }
    // Stations behind each end, so the boarding and arrival points stay free.
    for(const [p,dir] of [[first,-1],[last,1]] as const){
      const x=p.x+Math.sin(yaw)*dir*4.2,z=p.z+Math.cos(yaw)*dir*4.2,ground=height(x,z);
      woodParts.push(placed(hut,x,ground+1.5,z,yaw));
      const r=placed(roof,x,ground+3.8,z,yaw+Math.PI/4),color=new THREE.Color(STATION_COLORS[kind]);
      const colors=new Float32Array(r.getAttribute('position').count*3);for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
      r.setAttribute('color',new THREE.BufferAttribute(colors,3));roofParts.push(r);
      const wy=kind==='draglift'?ground+dragTop:p.y+.2;
      steelParts.push(placed(wheel,p.x,wy,p.z));
    }
    // Two cable runs: up (left) and return (right), like the carriers.
    const cableY=(i:number)=>kind==='draglift'?height(path[i].x,path[i].z)+dragTop:path[i].y+.05;
    for(const side of [-1,1])for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      cable.push(a.x+side*sideX,cableY(i-1),a.z+side*sideZ,b.x+side*sideX,cableY(i),b.z+side*sideZ);
    }
  }
  const meshes:THREE.Object3D[]=[];
  for(const [parts,material] of [[steelParts,steel],[woodParts,wood],[roofParts,roofs]] as const){
    if(!parts.length)continue;
    const merged=mergeGeometries(parts)!;parts.forEach(p=>p.dispose());
    const m=new THREE.Mesh(merged,material);m.castShadow=false;m.receiveShadow=false;meshes.push(m);root.add(m);
  }
  [mast,arm,wheel,hut,roof].forEach(g=>g.dispose());
  const cableGeometry=new THREE.BufferGeometry();cableGeometry.setAttribute('position',new THREE.Float32BufferAttribute(cable,3));
  root.add(new THREE.LineSegments(cableGeometry,cableMat));
  // Carriers: one instanced mesh per kind; matrices follow the shared seat phase.
  const carriers=(['gondola','chairlift','draglift'] as const).flatMap(kind=>{
    const own=lifts.filter(l=>l.kind===kind);if(!own.length)return [];
    const count=own.reduce((s,l)=>s+seatCount(l.lift),0),geometry=carrierGeometry(kind);
    const material=new THREE.MeshLambertMaterial({color:kind==='gondola'?0xd94f3d:kind==='chairlift'?0x39424a:0x8a949b,flatShading:true});
    const mesh=new THREE.InstancedMesh(geometry,material,count);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=false;mesh.frustumCulled=false;
    root.add(mesh);return [{kind,own,mesh,geometry,material}];
  });
  scene.add(root);
  const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1),p=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  return {
    update(time:number){
      for(const c of carriers){
        let index=0;
        for(const {lift} of c.own){
          const first=lift.path[0],last=lift.path[lift.path.length-1],yaw=Math.atan2(last.x-first.x,last.z-first.z),count=seatCount(lift);
          for(let i=0;i<count;i++){
            const s=seatPosition(lift,time,i);
            p.set(s.x,s.y,s.z);q.setFromAxisAngle(up,yaw);matrix.compose(p,q,one);c.mesh.setMatrixAt(index++,matrix);
          }
        }
        c.mesh.instanceMatrix.needsUpdate=true;
      }
    },
    dispose(){
      scene.remove(root);
      for(const m of meshes)(m as THREE.Mesh).geometry.dispose();
      cableGeometry.dispose();
      for(const c of carriers){c.geometry.dispose();c.material.dispose();c.mesh.dispose();}
      steel.dispose();wood.dispose();roofs.dispose();cableMat.dispose();
    },
  };
}
