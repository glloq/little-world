/** Pooled, presentation-only fishing effects. The original hamster rig and baked
 * impostor inputs stay unchanged. At most 3 ripple meshes + one optional line
 * are visible during fishing; 0 draw calls when idle and all effects have faded. */
import * as THREE from 'three';
import type {FishingState} from '../gameplay/fishing.ts';

export type FishingSplash='cast'|'bite'|'strain'|'caught'|'escaped';
interface Ripple { mesh:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>; age:number;duration:number;power:number; }
const clamp=(n:number,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function createFishingEffects(scene:THREE.Object3D,hamster:THREE.Object3D){
  const geometry=new THREE.RingGeometry(.91,1,20);
  const ripples:Ripple[]=Array.from({length:3},()=>{
    const material=new THREE.MeshBasicMaterial({color:0xd8f5ed,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false});
    const mesh=new THREE.Mesh(geometry,material);
    mesh.rotation.x=-Math.PI/2;mesh.frustumCulled=false;mesh.visible=false;mesh.renderOrder=3;
    mesh.name='FishingRipple';scene.add(mesh);
    return {mesh,age:1,duration:1,power:1};
  });
  const positions=new Float32Array(15);
  const lineGeometry=new THREE.BufferGeometry();
  lineGeometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const reelLine=new THREE.Line(lineGeometry,new THREE.LineBasicMaterial({color:0xf7ecd2,transparent:true,opacity:.94}));
  reelLine.name='FishingReelLine';reelLine.visible=false;reelLine.frustumCulled=false;hamster.add(reelLine);
  // One lightweight fish silhouette reused for every catch; no exported asset or extra rig.
  const fishMaterial=new THREE.MeshLambertMaterial({color:0x88b7ad,flatShading:true,side:THREE.DoubleSide});
  const fishBody=new THREE.Mesh(new THREE.IcosahedronGeometry(.19,0),fishMaterial);
  fishBody.scale.set(1.3,.68,.74);
  const fishTail=new THREE.Mesh(new THREE.ConeGeometry(.13,.23,3),fishMaterial);
  fishTail.position.x=-.29;fishTail.rotation.z=Math.PI/2;
  const fishEye=new THREE.Mesh(new THREE.SphereGeometry(.018,4,3),new THREE.MeshBasicMaterial({color:0x1a3435}));
  fishEye.position.set(.17,.048,.12);
  const catchDisplay=new THREE.Group();
  catchDisplay.name='FishingCatchDisplay';catchDisplay.visible=false;
  catchDisplay.add(fishBody,fishTail,fishEye);hamster.add(catchDisplay);
  let catchAge=-1;
  const original=hamster.getObjectByName('FishingLine') as THREE.Line|undefined;
  const bobber=hamster.getObjectByName('FishingFloat') as THREE.Mesh|undefined;
  let next=0;
  const FISH_COLORS:Record<string,number>={
    'fish:sardine':0x91b8c2,'fish:perch':0x8db56d,'fish:trout':0x85b7a7,
    'fish:carp':0xc5a276,'fish:mackerel':0x6ca5bd,'fish:seabass':0xaabac4,'fish:golden':0xf2c45a,
  };
  function displayCatch(fish:string){
    fishMaterial.color.setHex(FISH_COLORS[fish]??0x88b7ad);
    catchAge=0;catchDisplay.visible=true;
  }
  function burst(at:{x:number;y:number;z:number},kind:FishingSplash){
    const count=kind==='caught'?3:kind==='escaped'||kind==='bite'?2:1;
    const power=kind==='caught'?1.7:kind==='escaped'?1.5:kind==='bite'?1.2:kind==='strain'?.65:.85;
    for(let k=0;k<count;k++){
      const ripple=ripples[next];next=(next+1)%ripples.length;
      ripple.age=0;ripple.duration=kind==='caught'?.9:.64;
      ripple.power=power*(1-k*.22);
      ripple.mesh.position.set(at.x,at.y+.025+k*.004,at.z);
      ripple.mesh.material.color.setHex(kind==='escaped'?0xa8dbdf:0xd8f5ed);
      ripple.mesh.visible=true;
    }
  }
  function clearLine(){reelLine.visible=false;}
  /** Call after hamster.update(): it restores its 2-point source every frame.
   * The renderer temporarily hides that line while showing a curved overlay.
   * Physics, remote avatar presentations and hamster source files remain untouched. */
  function update(state:FishingState|null,time:number,dt:number){
    if(catchAge>=0){
      catchAge+=clamp(dt,0,.1);
      if(catchAge>=1.15){catchAge=-1;catchDisplay.visible=false;}
      else{
        const t=catchAge/1.15;
        catchDisplay.position.set(.14,1.20+.32*Math.sin(Math.PI*t),.77);
        catchDisplay.rotation.y=time*.9;
        catchDisplay.scale.setScalar(.65+.35*Math.sin(Math.PI*Math.min(1,t+.22)));
      }
    }
    for(const ripple of ripples){
      if(!ripple.mesh.visible)continue;
      ripple.age+=clamp(dt,0,.1);
      if(ripple.age>=ripple.duration){ripple.mesh.visible=false;continue;}
      const t=ripple.age/ripple.duration;
      const radius=(.18+.78*t)*ripple.power;
      ripple.mesh.scale.setScalar(radius);
      ripple.mesh.material.opacity=(1-t)*.58;
    }
    if(!state||state.phase!=='reeling'||!original?.visible||!bobber?.visible){clearLine();return;}
    const attr=original.geometry.getAttribute('position') as THREE.BufferAttribute|undefined;
    if(!attr||attr.count<2){clearLine();return;}
    const tension=clamp(state.tension),progress=clamp(state.progress);
    // The float follows the fish modestly toward the shore; it never leaves the water surface.
    const approach=progress*.30;
    bobber.position.x*=1-approach;
    bobber.position.z*=1-approach;
    bobber.position.y-=.025*tension+Math.sin(time*8)*.009*tension;
    const sx=attr.getX(0),sy=attr.getY(0),sz=attr.getZ(0);
    const ex=bobber.position.x,ey=bobber.position.y+.02,ez=bobber.position.z;
    const sag=(1-tension)*.20+.018;
    for(let i=0;i<5;i++){
      const t=i/4,curve=Math.sin(Math.PI*t);
      positions[i*3]=sx+(ex-sx)*t;
      positions[i*3+1]=sy+(ey-sy)*t-sag*curve;
      positions[i*3+2]=sz+(ez-sz)*t+.055*curve*Math.sin(time*4);
    }
    (lineGeometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate=true;
    lineGeometry.computeBoundingSphere();
    reelLine.visible=true;original.visible=false;
  }
  function reset(){
    clearLine();catchAge=-1;catchDisplay.visible=false;
    for(const r of ripples)r.mesh.visible=false;
  }
  function dispose(){
    reset();reelLine.removeFromParent();lineGeometry.dispose();(reelLine.material as THREE.Material).dispose();
    for(const r of ripples){r.mesh.removeFromParent();r.mesh.material.dispose();}
    geometry.dispose();catchDisplay.removeFromParent();
    fishBody.geometry.dispose();fishTail.geometry.dispose();fishEye.geometry.dispose();
    fishMaterial.dispose();(fishEye.material as THREE.Material).dispose();
  }
  return {burst,displayCatch,update,reset,dispose};
}
