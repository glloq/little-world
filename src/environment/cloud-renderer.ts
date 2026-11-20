import * as THREE from 'three';
import {makeCloudGeometry} from './cloud-presets.ts';

export type CloudQuality = 'low' | 'medium' | 'high';
const CELL = 160;
const MAX_CLOUDS = 16;
function noise(x:number,z:number,seed:number):number {
  let h=Math.imul(x ^ seed, 374761393) ^ Math.imul(z + seed, 668265263);
  h=Math.imul(h ^ (h>>>13), 1274126177);
  return ((h ^ (h>>>16))>>>0)/4294967296;
}
/** Entirely cosmetic 3D clouds: 2 instanced draw calls, no shadows, no physics.
 * Positions are deterministic world-space cells; rebuild instances only after a cell boundary crossing. */
export function createCloudRenderer(scene:THREE.Scene, seed:number) {
  const geometries=[makeCloudGeometry(0),makeCloudGeometry(1)] as const;
  const materials=[
    new THREE.MeshBasicMaterial({color:0xf4f4ed,depthWrite:true,fog:false}),
    new THREE.MeshBasicMaterial({color:0xdce5e7,depthWrite:true,fog:false}),
  ];
  const root=new THREE.Group();
  root.name='EnvironmentClouds3D';
  const meshes=geometries.map((g,i)=>{
    const mesh=new THREE.InstancedMesh(g,materials[i],MAX_CLOUDS/2);
    mesh.name='EnvironmentClouds3D-'+i;
    mesh.count=0;
    mesh.frustumCulled=false;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    root.add(mesh);
    return mesh;
  });
  scene.add(root);
  const dummy=new THREE.Object3D();
  let lastFieldX=Infinity,lastFieldZ=Infinity,lastCount=-1,lastCover=-1,disposed=false;
  const candidates:{x:number;y:number;z:number;scale:number;rotation:number;distance:number;type:number}[]=[];
  let visibleCount=0,rebuilds=0;
  const sunColor=new THREE.Color();
  const daytimeCloudColor=new THREE.Color('#f6f3ed');
  function update(params:{position:{x:number;y:number;z:number};time:number;wind:number;cloudCover:number;sunAltitude:number;quality:CloudQuality;detail:number;underground:boolean;enabled:boolean}) {
    const maxCount=!params.enabled||params.underground||params.detail>=2||params.quality==='low'
      ?0:params.quality==='high'?16:8;
    // Sparse clouds on clear days, fuller cloudfield when covered.
    const count=maxCount===0?0:Math.min(maxCount,Math.max(0,Math.round(maxCount*(.35+.65*THREE.MathUtils.clamp(params.cloudCover,0,1)))));
    root.visible=count>0;
    visibleCount=count;
    if (!count) { for(const mesh of meshes) mesh.count=0; lastCount=0; return; }
    const windOffset=params.time * Math.max(0,params.wind) * .018;
    root.position.set(windOffset,0,windOffset*.28);
    // Stable absolute-world placement; cells are selected relative to drifting field.
    const cellX=Math.floor((params.position.x-root.position.x)/CELL);
    const cellZ=Math.floor((params.position.z-root.position.z)/CELL);
    const coverBand=Math.floor(params.cloudCover*4);
    // Rebuild after a short move (not only at 160 m cell crossings): selection is stable per
    // cell (shape from the cell hash, not from the distance rank) and clouds near the edge of
    // the field shrink to nothing, so the field slides smoothly instead of swapping shapes
    // and popping clouds in or out (doc 105, SEAM-11). Still no upload on a still camera.
    const fieldX=params.position.x-root.position.x,fieldZ=params.position.z-root.position.z;
    if(Math.hypot(fieldX-lastFieldX,fieldZ-lastFieldZ)>20||count!==lastCount||coverBand!==lastCover) {
      // Radius that holds about `count` cell centres, with a fading rim.
      const radius=Math.min(620,CELL*Math.sqrt(count/Math.PI)*1.15+90),rim=110;
      candidates.length=0;
      for(let dz=-4;dz<=4;dz++) for(let dx=-4;dx<=4;dx++){
        const x=cellX+dx,z=cellZ+dz;
        const nx=noise(x,z,seed),nz=noise(x,z,seed+57);
        const wx=(x+.15+nx*.7)*CELL,wz=(z+.15+nz*.7)*CELL;
        const dist=Math.hypot(wx-fieldX,wz-fieldZ);
        if(dist>radius)continue;
        const fade=THREE.MathUtils.smoothstep(radius-dist,0,rim);if(fade<.02)continue;
        candidates.push({x:wx,y:260+noise(x,z,seed+101)*100,z:wz,
          scale:(11+noise(x,z,seed+11)*11)*fade,rotation:noise(x,z,seed+23)*Math.PI*2,distance:dist,type:noise(x,z,seed+29)<.5?0:1});
      }
      candidates.sort((a,b)=>a.distance-b.distance);
      const used=[0,0],cap=MAX_CLOUDS/2;let total=0;
      for(const c of candidates){
        if(total>=count)break;const type=used[c.type]<cap?c.type:1-c.type;if(used[type]>=cap)continue;
        const slot=used[type]++;total++;
        dummy.position.set(c.x,c.y,c.z);
        dummy.rotation.set(0,c.rotation,0);
        dummy.scale.set(c.scale,c.scale,c.scale);
        dummy.updateMatrix();
        meshes[type].setMatrixAt(slot,dummy.matrix);
      }
      for(let i=0;i<2;i++){
        meshes[i].count=used[i];
        meshes[i].instanceMatrix.needsUpdate=true;
      }
      visibleCount=used[0]+used[1];
      lastFieldX=fieldX;lastFieldZ=fieldZ;lastCount=count;lastCover=coverBand;
      rebuilds++;
    }
    // Change one shared material per silhouette, never per instance.
    const day=THREE.MathUtils.smoothstep(params.sunAltitude,-.1,.3);
    sunColor.set('#6f808d').lerp(daytimeCloudColor,day);
    materials[0].color.copy(sunColor);
    materials[1].color.copy(sunColor).multiplyScalar(.91);
  }
  return {
    update,
    get metrics(){return {visible:root.visible,instances:visibleCount,drawCalls:root.visible?meshes.filter(m=>m.count>0).length:0,rebuilds,geometryTriangles:geometries.map(g=>g.index?g.index.count/3:g.getAttribute('position').count/3)};},
    dispose(){if(disposed)return;disposed=true;root.removeFromParent();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();},
  };
}
