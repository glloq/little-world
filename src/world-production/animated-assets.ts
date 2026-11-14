/** Animated parts of registry assets (doc 42 §H2): windmill rotors, watermill wheels, the
 * lighthouse beam and the player's sailing boat. Driven only by the pivots the GLB models already
 * name (RotorPivot, WheelPivot, SailRigPivot, RudderPivot, OarPort/OarStarboard); no skinning,
 * no per-frame allocation, a handful of rotations per frame. Purely visual: no gameplay state. */
import * as THREE from 'three';

interface Spinner {owner:THREE.Object3D;nodes:THREE.Object3D[];axis:'x'|'y'|'z';speed:number}
/** Rotation axis and speed (rad/s) of a named pivot. */
export const PIVOT_MOTION:Record<string,{axis:'x'|'y'|'z';speed:number}>={RotorPivot:{axis:'z',speed:-.55},WheelPivot:{axis:'x',speed:-.8}};
const BEAM_LENGTH=60;
/** One shared beam geometry/material for every lighthouse: two opposite additive cones. */
let beamAssets:{geometry:THREE.BufferGeometry;material:THREE.MeshBasicMaterial;glow:THREE.MeshBasicMaterial}|null=null;
function beamParts(){
  if(!beamAssets){
    const g=new THREE.ConeGeometry(4.5,BEAM_LENGTH,12,4,true);g.translate(0,-BEAM_LENGTH/2,0);g.rotateZ(Math.PI/2);// apex at the lamp, opening along +X
    // Additive light fading from the lamp to the tip (vertex colour = intensity): no hard end.
    const pos=g.getAttribute('position'),col=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){const k=Math.pow(Math.max(0,1-pos.getX(i)/BEAM_LENGTH),1.6);col[i*3]=k;col[i*3+1]=k*.95;col[i*3+2]=k*.78;}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    beamAssets={geometry:g,material:new THREE.MeshBasicMaterial({color:0xfff2c2,vertexColors:true,transparent:true,opacity:.18,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.FrontSide,fog:false}),
      glow:new THREE.MeshBasicMaterial({color:0xffe7a0,fog:false})};
  }
  return beamAssets;
}
export function createAnimatedAssets(){
  const spinners:Spinner[]=[],beams:{owner:THREE.Object3D;pivot:THREE.Group;lamp:THREE.Mesh}[]=[];let night=0,time=0;
  return {
    /** Registers the named pivots of a freshly loaded asset (all LOD levels). */
    register(owner:THREE.Object3D,scene:THREE.Object3D){
      const byName=new Map<string,THREE.Object3D[]>();
      scene.traverse(n=>{if(PIVOT_MOTION[n.name]){const list=byName.get(n.name)??[];list.push(n);byName.set(n.name,list);}});
      for(const [name,nodes]of byName)spinners.push({owner,nodes,...PIVOT_MOTION[name]});
    },
    /** Rotating beam at the lamp room of a lighthouse (height in the asset's frame). */
    addBeam(owner:THREE.Object3D,height:number){
      const {geometry,material,glow}=beamParts(),pivot=new THREE.Group();pivot.name='LighthouseBeam';pivot.position.y=height;
      const a=new THREE.Mesh(geometry,material),b=new THREE.Mesh(geometry,material);b.rotation.y=Math.PI;a.renderOrder=b.renderOrder=5;a.frustumCulled=b.frustumCulled=false;
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.7,8,6),glow);pivot.add(a,b);owner.add(pivot,lamp);lamp.position.y=height;pivot.visible=false;
      beams.push({owner,pivot,lamp});
    },
    setNight(value:number){night=value;},
    update(dt:number){
      time+=dt;
      for(let i=spinners.length-1;i>=0;i--){const s=spinners[i];if(!s.owner.parent){spinners.splice(i,1);continue;}
        if(!s.owner.visible)continue;for(const n of s.nodes)n.rotation[s.axis]+=s.speed*dt;}
      for(let i=beams.length-1;i>=0;i--){const b=beams[i];if(!b.owner.parent){beams.splice(i,1);continue;}
        b.pivot.visible=night>.25;b.pivot.rotation.y=time*.9;b.lamp.visible=night>.15;}
      if(beamAssets)beamAssets.material.opacity=.06+.14*Math.min(1,night);
    },
    get stats(){return {spinners:spinners.length,beams:beams.length};},
  };
}
export type AnimatedAssets=ReturnType<typeof createAnimatedAssets>;

/** Player boat dressed with the sailboat model: the sail rig swings with the steering and fills
 * with speed, the rudder follows the helm. Scale chosen so the hull covers the boat logic. */
export function dressSailboat(boat:THREE.Group,scene:THREE.Object3D,scale=1.55){
  const model=scene.clone(true);model.scale.setScalar(scale);model.name='Sailboat';
  const rig=model.getObjectByName('SailRigPivot')??null,rudder=model.getObjectByName('RudderPivot')??null;
  for(const c of [...boat.children])c.visible=false;boat.add(model);
  return {
    /** speed in m/s (signed), steer −1…1 (right positive, as BoatInput). */
    update(speed:number,steer:number,dt:number){
      const k=Math.min(1,dt*3);
      if(rig)rig.rotation.y+=((-steer*.55+(speed>0?.15:0))-rig.rotation.y)*k;
      if(rudder)rudder.rotation.y+=((steer*.6)-rudder.rotation.y)*k;
    },
  };
}
