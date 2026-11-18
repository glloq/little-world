/** Shared low-poly underground reception, version 3.
 * All floors use the same authored-independent prefab: recessed minekeeper stall
 * on the left wall, clear central aisle toward extraction, open lift to the right.
 * Only floor 1 gets a rear surface exit. The MineGrid remains collision authority.
 * A single merged solid mesh plus one unshadowed emissive mesh = two draw calls. */
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {MineHubLayout,MineResourceIcon} from './mine-hub.ts';

type Piece={geometry:THREE.BufferGeometry;color:number};
function merged(pieces:Piece[]):THREE.BufferGeometry{
  const geometries:THREE.BufferGeometry[]=[];
  for(const piece of pieces){
    let geometry=piece.geometry;
    if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
    const color=new THREE.Color(piece.color);
    const count=geometry.getAttribute('position').count,colors=new Float32Array(count*3);
    for(let i=0;i<colors.length;i+=3){
      colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    geometries.push(geometry);
  }
  const result=mergeGeometries(geometries,false);
  for(const geometry of geometries)geometry.dispose();
  if(!result)throw Error('Mine : fusion des géométries impossible');
  result.computeBoundingSphere();return result;
}
export function createMineHubView(hub:MineHubLayout,solid:THREE.Material,glow:THREE.Material,
  resources:readonly MineResourceIcon[]=[]):THREE.Group{
  const root=new THREE.Group();
  root.name='MineHub:'+hub.mineId+':'+hub.levelId;
  root.position.set(hub.shaft.x,hub.floorY,hub.shaft.z);
  root.rotation.y=hub.heading;
  // Screen-right in Little World's third-person camera is world -X.
  // Mirror the shared prefab to keep the counter on SCREEN-LEFT and lift right.
  root.scale.x=-1;
  // The authored mine may have only 2.5 m headroom. Compress height, not floor layout.
  root.scale.y=Math.min(1,(hub.height-.15)/3.33);
  root.userData={mineId:hub.mineId,levelId:hub.levelId,kind:'mine-hub',
    hasRearExit:hub.surfaceExit!==null,resourceIcons:[...resources],visualVersion:3,
    clearAisleWidth:3.5,shopSide:'left',liftSide:'right'};
  const parts:Piece[]=[],emissive:Piece[]=[];
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,color:number,
    rz=0,lit=false)=>{
    const g=new THREE.BoxGeometry(w,h,d);
    if(rz)g.rotateZ(rz);
    g.translate(x,y,z);
    (lit?emissive:parts).push({geometry:g,color});
  };
  const ball=(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:number,lit=false)=>{
    const g=new THREE.SphereGeometry(1,8,6);g.scale(rx,ry,rz);g.translate(x,y,z);
    (lit?emissive:parts).push({geometry:g,color});
  };
  const stone=(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:number,angle=0)=>{
    const g=new THREE.DodecahedronGeometry(1,0);
    g.scale(rx,ry,rz);g.rotateY(angle);g.translate(x,y,z);
    parts.push({geometry:g,color});
  };
  const wood=0x806044,beam=0x65442e,woodLight=0xb18a5e,
    iron=0x666965,ochre=0xd9b781,canvas=0xb97750,rock=0x85817a;
  function ore(kind:MineResourceIcon,x:number,y:number,z:number,scale=1){
    if(kind==='crystal'){
      const main=new THREE.OctahedronGeometry(1,0);
      main.scale(.15*scale,.25*scale,.12*scale);main.rotateZ(.19);main.translate(x,y,z);
      parts.push({geometry:main,color:0x7dcfdf});
      const side=new THREE.OctahedronGeometry(1,0);
      side.scale(.075*scale,.14*scale,.07*scale);side.rotateZ(-.25);
      side.translate(x+.14*scale,y-.05*scale,z);
      parts.push({geometry:side,color:0xab88d0});
    }else stone(x,y,z,.17*scale,.135*scale,.14*scale,
      kind==='iron'?0xb87847:0x92908b,kind==='iron'?.7:.23);
  }
  // Recessed counter against the left rock wall, NOT a full four-post kiosk.
  // Everything is x < -5.9: keep the central passage open for the player/camera.
  box(-6.7,.62,.15,.64,1.04,2.45,wood);
  box(-6.56,1.17,.15,.94,.14,2.73,woodLight);
  for(const z of [-1.3,1.6])box(-6.7,.65,z,.7,.065,.13,beam);
  box(-8.85,.1,-1.76,.72,.2,.35,beam);
  // Two thin wall-mounted supports and a narrow canvas valance, no giant roof.
  for(const z of [-1.45,1.73]){
    box(-8.85,1.42,z,.14,2.65,.14,beam);
    box(-8.03,2.67,z,1.82,.11,.13,woodLight,.05);
  }
  box(-7.95,2.73,.15,2.02,.11,3.38,woodLight);
  box(-6.99,2.56,.15,.085,.35,3.20,canvas);
  for(const z of [-.91,.10,1.10])box(-6.93,2.48,z,.055,.31,.12,ochre);
  // Small hanging mine symbol, set back inside the stall.
  box(-8.85,2.13,.12,.12,.72,.97,woodLight);
  for(const tilt of [-.55,.55])
    box(-8.72,2.16,.12,.105,.65,.09,beam,tilt);
  // Friendly low-poly minekeeper, visible OVER the low counter.
  ball(-7.72,.82,.15,.42,.53,.42,0xc08b58);
  ball(-7.66,1.46,.15,.45,.40,.39,0xdba46c);
  ball(-7.78,1.76,-.12,.17,.17,.15,0xca9160);
  ball(-7.43,1.76,-.12,.17,.17,.15,0xca9160);
  ball(-7.23,1.38,.15,.12,.20,.24,0xefdbb4);
  for(const z of [-.10,.34])ball(-7.29,1.56,z,.055,.059,.05,0x282322);
  ball(-7.14,1.36,.14,.065,.06,.07,0xab7371);
  box(-7.68,1.91,.15,.8,.13,.69,0xd7ac4b);
  box(-7.68,1.98,.15,.5,.085,.47,0xf0d676);
  ball(-7.27,1.93,.15,.11,.11,.06,0xffdf91,true);
  // A few ore samples on the counter. The colours match resources on THIS floor.
  for(const [i,kind] of resources.slice(0,3).entries())
    ore(kind,-6.19,1.33,-.70+i*.8,.88);
  box(-8.88,.38,-2.2,.62,.76,.65,wood);
  for(const z of [-2.46,-1.95])box(-8.55,.40,z,.06,.78,.06,beam);
  // Leaning tools, a small metal head, and one wall lantern on the left.
  box(-8.94,1.20,2.27,.075,1.25,.075,woodLight,.19);
  box(-8.82,1.74,2.27,.33,.11,.09,iron,.19);
  box(-8.96,1.85,-2.68,.17,.34,.17,beam);
  ball(-8.96,1.61,-2.68,.13,.18,.13,0xffbf68,true);
  // Wide extraction arch, centred on the aisle. Sign stays above the doorway.
  const gx=-3.85,gz=5.34;
  for(const x of [gx-1.98,gx+1.98]){
    box(x,1.38,gz,.30,2.76,.36,beam);
    box(x,1.3,gz-.16,.07,2.50,.07,woodLight);
    stone(x+(x<gx?-.26:.26),.22,gz,.34,.30,.42,rock);
  }
  box(gx,2.82,gz,4.32,.34,.43,beam);
  for(const x of [gx-1.7,gx+1.7])
    box(x,2.62,gz-.08,.10,.47,.13,woodLight,x<gx?-.48:.48);
  box(gx,3.12,gz-.05,3.14,.28,.21,woodLight);
  const icons=resources.slice(0,3),spacing=.78;
  for(const [i,kind] of icons.entries()){
    const x=gx+(i-(icons.length-1)/2)*spacing;
    box(x,3.13,gz-.19,.60,.26,.08,0x805e3e);
    ore(kind,x,3.13,gz-.30,.72);
  }
  // Rails start BEYOND the threshold, never clutter the reception floor.
  for(const x of [gx-.38,gx+.38])box(x,.055,gz+1.25,.075,.06,2.2,iron);
  for(const z of [gz+.46,gz+1.0,gz+1.54,gz+2.08])
    box(gx,.042,z,1.28,.07,.13,beam);
  // Open, freestanding mine elevator on the right; no foreground cage or roof.
  box(0,.045,.08,2.18,.09,2.12,woodLight);
  for(const x of [-1.12,1.12]){
    box(x,1.43,1.09,.17,2.86,.17,beam);
    box(x,2.81,1.09,.28,.20,.30,woodLight);
  }
  box(0,2.88,1.07,2.56,.20,.20,beam);
  box(1.11,1.52,-.71,.16,3.00,.16,beam);
  box(1.12,1.07,.12,.10,.09,1.9,wood);
  box(0,2.40,1.01,1.8,.09,.13,iron);
  // One pulley above the rear beam and two discreet hanging cables.
  const wheel=new THREE.CylinderGeometry(.27,.27,.14,8);
  wheel.rotateZ(Math.PI/2);wheel.translate(0,3.10,1.07);
  parts.push({geometry:wheel,color:iron});
  for(const x of [-.72,.72])box(x,2.0,1.09,.032,1.75,.042,0xb6a58d);
  // Small control board to the outside right, not facing the player's camera.
  box(1.35,1.72,-.45,.16,.60,.75,woodLight);
  box(1.47,1.72,-.45,.065,.39,.39,beam);
  box(1.52,1.88,-.45,.10,.095,.10,0xc9b885);
  ball(1.56,1.57,-.45,.07,.08,.07,0x9ec3a5,true);
  // An amber lantern identifies the shaft without adding a costly shadow light.
  ball(.0,2.70,.85,.12,.14,.12,0xffd389,true);
  // Rear exit only on floor 1: opposite the gallery, at floor level.
  if(hub.surfaceExit){
    const x=-3.85,z=-6.48;
    for(const sx of [x-1.9,x+1.9])box(sx,1.38,z,.3,2.76,.35,beam);
    box(x,2.84,z,4.22,.30,.39,wood);
    box(x,3.09,z+.10,1.35,.25,.11,woodLight);
    // Green leaf / island icon. No solid door: continuous walk out of the mine.
    const leaf=new THREE.OctahedronGeometry(1,0);
    leaf.scale(.18,.21,.08);leaf.rotateZ(.47);leaf.translate(x,3.13,z+.22);
    parts.push({geometry:leaf,color:0x85a961});
  }
  // Two perimeter supports, never in the 3.5 m main aisle.
  for(const [x,z] of [[-9.10,-3.95],[2.75,3.2]] as const){
    box(x,1.35,z,.24,2.7,.25,beam);
    box(x,2.7,z,.4,.18,.43,woodLight);
    stone(x,.18,z+.43,.42,.32,.46,0x89827b,.25);
  }
  ball(2.65,1.77,2.60,.12,.17,.13,0xffc66b,true);
  // No second physics system or decorative mesh blocking either entrance.
  const body=new THREE.Mesh(merged(parts),solid);
  body.castShadow=false;body.receiveShadow=false;
  root.add(body);
  const glowMesh=new THREE.Mesh(merged(emissive),glow);
  glowMesh.castShadow=false;root.add(glowMesh);
  return root;
}
