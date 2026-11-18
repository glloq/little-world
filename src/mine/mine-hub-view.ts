/** Lightweight original mine reception prefab (single static mesh + small emissive layer).
 * Built once for each level; hidden when that level is inactive. No gameplay collider here:
 * the MineGrid remains the authority for the floor and walls. */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {MineHubLayout} from './mine-hub.ts';

type Piece={geometry:THREE.BufferGeometry;color:number};
function merged(pieces:Piece[]):THREE.BufferGeometry {
  const geometries:THREE.BufferGeometry[]=[];
  for(const piece of pieces){
    // Box/Sphere/Cylinder are indexed; Dodecahedron is not. Normalise before merging.
    let geometry=piece.geometry;
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    const c=new THREE.Color(piece.color),col=new Float32Array(geometry.getAttribute('position').count*3);
    for(let i=0;i<col.length;i+=3){col[i]=c.r;col[i+1]=c.g;col[i+2]=c.b;}
    geometry.setAttribute('color',new THREE.BufferAttribute(col,3));geometries.push(geometry);
  }
  const result=mergeGeometries(geometries,false);
  for(const geometry of geometries)geometry.dispose();
  if(!result)throw Error('Assemblage du comptoir minier impossible');
  result.computeBoundingSphere();return result;
}
export function createMineHubView(hub:MineHubLayout,solid:THREE.Material,glow:THREE.Material):THREE.Group {
  const root=new THREE.Group();root.name='MineHub:'+hub.mineId+':'+hub.levelId;
  root.position.set(hub.shaft.x,hub.floorY,hub.shaft.z);root.rotation.y=hub.heading;
  // Keep the hoist pulley and roof below the authored low ceiling (2.5–6 m).
  root.scale.y=Math.min(1,(hub.height-.18)/3.85);
  root.userData={mineId:hub.mineId,levelId:hub.levelId,kind:'mine-hub'};
  const parts:Piece[]=[],lamps:Piece[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,rz=0,light=false)=>{
    const g=new THREE.BoxGeometry(w,h,d);if(rz)g.rotateZ(rz);g.translate(x,y,z);
    (light?lamps:parts).push({geometry:g,color});
  };
  const ball=(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:number,light=false)=>{
    const g=new THREE.SphereGeometry(1,8,5);g.scale(rx,ry,rz);g.translate(x,y,z);
    (light?lamps:parts).push({geometry:g,color});
  };
  const stone=(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:number,seed:number)=>{
    const g=new THREE.DodecahedronGeometry(1,0);g.scale(rx,ry,rz);g.rotateY((seed%9)*.33);g.translate(x,y,z);parts.push({geometry:g,color});
  };
  const wood=0x865431,woodLight=0xb17b49,woodDark=0x593c2a,iron=0x606669,
    fabric=0xa75648,canvas=0xdfb88a;
  // Shop on the LEFT (local -X), with a fabric roof. Counter faces the central walkway.
  box(-3.45,.69,-.03,.7,1.18,2.7,wood);
  box(-3.0,1.26,-.03,1.6,.13,2.9,woodLight);
  for(const z of [-1.55,1.55])for(const x of [-4.9,-2.65])box(x,1.43,z,.13,2.75,.13,woodDark);
  box(-3.7,2.84,-.03,2.85,.10,3.53,canvas,.09);
  for(const z of [-1.1,0,1.1])box(-3.7,2.89,z,2.8,.045,.08,fabric,.09);
  box(-3.73,1.18,-1.61,2.75,.12,.13,woodDark);
  // Display crates, resource samples and two simple crossed pickaxes.
  box(-4.65,.27,-1.07,.75,.54,.75,woodLight);
  box(-4.65,.25,1.16,.75,.5,.75,wood);
  stone(-3.13,1.38,-.98,.24,.19,.21,0x888783,4);
  stone(-3.13,1.38,-.26,.21,.16,.2,0xa46d43,7);
  stone(-3.13,1.41,.43,.17,.22,.18,0x7bd7e4,8);
  box(-4.53,1.6,-1.9,.08,1.16,.07,woodLight,.31);
  box(-4.28,1.57,-1.89,.08,1.16,.07,woodLight,-.31);
  box(-4.45,2.03,-1.9,.7,.13,.1,iron,.14);
  // Cloth mining symbol / pictogram over the counter.
  box(-3.15,2.11,-.01,.09,.74,.95,fabric);
  box(-3.08,2.15,-.01,.07,.64,.055,canvas,.57);
  box(-3.08,2.15,-.01,.07,.64,.055,canvas,-.57);
  // Mineworker hamster (recognisable at very low polycount), standing behind the desk.
  ball(-4.24,.82,.15,.43,.57,.42,0xc89359);
  ball(-4.18,1.48,.15,.45,.39,.39,0xe0aa6c);
  ball(-4.11,1.36,.38,.23,.18,.11,0xf0dfbd);
  ball(-4.48,1.76,-.11,.16,.20,.13,0xd39b67);
  ball(-3.91,1.76,-.11,.16,.20,.13,0xd39b67);
  ball(-4.0,1.55,.48,.055,.055,.05,0x242220);
  ball(-4.33,1.55,.48,.055,.055,.05,0x242220);
  ball(-4.16,1.35,.52,.07,.06,.06,0xb5756d);
  box(-4.18,1.87,.13,.85,.18,.76,0xd7a641);
  box(-4.18,1.94,.13,.52,.11,.52,0xf0ce62);
  ball(-4.18,1.90,.53,.115,.115,.05,0xffe3aa,true);
  // Main gallery entrance behind the open central corridor (+Z).
  for(const x of [-2.6,.2])box(x,1.38,3.75,.29,2.75,.37,wood);
  box(-1.2,2.81,3.75,3.24,.32,.36,woodDark);
  for(const x of [-2.3,-.1])box(x,2.52,3.75,.12,.85,.14,woodLight,x<0?-.45:.45);
  box(-1.2,3.06,3.73,2.9,.38,.27,woodLight);
  // Lift: solid support towers, overhead winding wheel, hanging ropes and OPEN platform.
  for(const x of [-.83,.83])for(const z of [-.95,.95])box(x,1.55,z,.19,3.1,.19,woodDark);
  box(0,3.1,-.95,2.05,.28,.24,wood);
  box(0,3.1,.95,2.05,.28,.24,wood);
  box(0,.08,0,1.75,.16,1.65,woodLight);
  for(const x of [-.85,.85])box(x,.5,.05,.10,.95,1.65,wood);
  for(const x of [-.67,.67])box(x,2.0,0,.042,2,.05,0xbda47c);
  const wheel=new THREE.CylinderGeometry(.31,.31,.16,9);wheel.rotateZ(Math.PI/2);
  wheel.translate(0,3.38,0);parts.push({geometry:wheel,color:iron});
  box(.0,3.6,-.97,1.68,.12,.13,woodDark);
  // Ascending and descending arrows carved on the lift sign.
  box(.0,2.4,-1.12,1.42,.62,.11,woodLight);
  for(const x of [-.35,.35]){box(x,2.39,-1.2,.085,.31,.06,woodDark);
    box(x,2.56,-1.2,.28,.07,.06,woodDark,x<0?0:.0);}
  // Lanterns with shared unshadowed emission, not one shadow-casting point light per prop.
  for(const [x,z] of [[-2.2,-2.15],[.92,1.65]]){
    box(x,2.18,z,.18,.25,.18,woodDark);
    ball(x,1.97,z,.13,.17,.13,0xffc66f,true);
    box(x,1.77,z,.19,.06,.19,woodDark);
  }
  for(const [x,z,a] of [[-2.4,2.0,1],[-5.05,2.6,2],[1.7,2.7,3]] as const)
    stone(x,.17,z,.4,.27,.33,a===2?0x79716d:0x8b8380,a);
  // Deliberately no mesh filling the gallery or shaft, and no fake collision.
  const mesh=new THREE.Mesh(merged(parts),solid);mesh.castShadow=false;mesh.receiveShadow=false;
  root.add(mesh);
  if(lamps.length){const luminous=new THREE.Mesh(merged(lamps),glow);luminous.castShadow=false;root.add(luminous);}
  return root;
}
