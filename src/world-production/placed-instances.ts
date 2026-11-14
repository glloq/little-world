/** World Production V1 — instanced drawing of repeated placed structures (game runtime).
 * Enclosure modules (fences, posts, walls, hedges) and dock pieces are authored as individual
 * V3 entities (stable ids, transactions, collisions), but drawing each one as its own object
 * costs one draw call per module. Here they share ONE BatchedMesh per LOD (LOD0 near, LOD1
 * mid-distance, nothing beyond the cull radius), rebuilt only when the focus moves by more than
 * a step. Logic (positions, collisions, gameplay state) never depends on what is drawn.
 * Entities with gameplay state keep their individual object (not handled here). */
import * as THREE from 'three';
import {worldAsset} from './registry.ts';
import {loadAssetLods} from './species-library.ts';
import type {Placement} from '../world-data.ts';

export const INSTANCED_ROLES=new Set(['fence','wall','hedge','dock','rock','prop']);
/** LOD radii (m) of instanced structures: benchmark knobs. */
export const PLACED_RADII={lod0:45,lod1:140,rockMin:400,rockPerMetre:60,hysteresis:12};
/** Cull radius of a placement: natural rocks are landmarks of the relief (boulders, spires, cliff
 * blocks up to ~12 m): they stay drawn (LOD1) far beyond the small structures, scaled by their size. */
export function placedCullRadius(assetId:string,height:number):number{return worldAsset(assetId)?.usage?.role==='rock'?Math.max(PLACED_RADII.rockMin,PLACED_RADII.rockPerMetre*height):PLACED_RADII.lod1;}
export interface PlacedInstanceStats {placements:number;lod0:number;lod1:number;calls:number;rebuilds:number;state:'empty'|'loading'|'ready'}
export function eligibleForInstancing(assetId:string):boolean{const a=worldAsset(assetId);return !!a&&!!a.usage&&INSTANCED_ROLES.has(a.usage.role);}
export function createPlacedInstances(parent:THREE.Object3D,ground:(x:number,z:number)=>number){
  let occluded:((x:number,z:number,top:number)=>boolean)|null=null;
  const items:{assetId:string;matrix:THREE.Matrix4;x:number;z:number;top:number;cull:number;level:number}[]=[],stats:PlacedInstanceStats={placements:0,lod0:0,lod1:0,calls:0,rebuilds:0,state:'empty'};
  const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
  const active:number[][]=[[],[]];let batches:THREE.BatchedMesh[]=[],geometryIds:Map<string,number[]>=new Map(),focusX=NaN,focusZ=NaN,disposed=false,loading:Promise<void>|null=null;
  async function build(){
    const ids=[...new Set(items.map(i=>i.assetId))],lods=await Promise.all(ids.map(id=>loadAssetLods(id)));if(disposed)return;
    const per=[0,1].map(level=>{let v=0,ix=0;ids.forEach((_,k)=>{const g=lods[k]?.[Math.min(level,(lods[k]?.length??1)-1)];if(g){v+=g.getAttribute('position').count;ix+=g.index!.count;}});return {v,ix};});
    batches=[0,1].map(level=>{const b=new THREE.BatchedMesh(Math.max(1,items.length),Math.max(3,per[level].v),Math.max(3,per[level].ix),material);b.name='Placed structures LOD'+level;b.perObjectFrustumCulled=true;b.sortObjects=false;b.frustumCulled=false;b.castShadow=b.receiveShadow=false;parent.add(b);return b;});
    ids.forEach((id,k)=>{const l=lods[k];if(!l)return;geometryIds.set(id,[0,1].map(level=>batches[level].addGeometry(l[Math.min(level,l.length-1)])));});
    stats.state='ready';focusX=NaN;
  }
  /** LOD level with hysteresis (no popping back and forth around a threshold while walking). */
  const HYST=PLACED_RADII.hysteresis;
  function levelOf(it:{cull:number;level:number},d:number){
    if(it.level===0&&d<PLACED_RADII.lod0+HYST)return 0;if(it.level===1&&d>PLACED_RADII.lod0-HYST&&d<it.cull+HYST)return 1;
    return d<PLACED_RADII.lod0?0:d<it.cull?1:-1;
  }
  return {
    stats,
    /** Registers a placement; returns false when it must stay an individual object. */
    add(p:Placement):boolean{
      if(!eligibleForInstancing(p.assetId))return false;
      const q=p.quaternion?new THREE.Quaternion().fromArray(p.quaternion):new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),p.rotation);
      const s=p.scale3?new THREE.Vector3().fromArray(p.scale3):new THREE.Vector3().setScalar(p.scale??1);
      items.push({assetId:p.assetId,x:p.x,z:p.z,level:-1,cull:placedCullRadius(p.assetId,(worldAsset(p.assetId)?.size[1]??2)*Math.abs(s.y)),top:ground(p.x,p.z)+(p.y??0)+(worldAsset(p.assetId)?.size[1]??2)*Math.abs(s.y),matrix:new THREE.Matrix4().compose(new THREE.Vector3(p.x,ground(p.x,p.z)+(p.y??0),p.z),q,s)});stats.placements=items.length;
      if(!loading){stats.state='loading';loading=Promise.resolve().then(build);}
      return true;
    },
    /** Debug/test (metrics mode): keys of the placements drawn within `r` of (x, z). */
    drawnNear(x:number,z:number,r:number):string[]{const out:string[]=[];const m=new THREE.Matrix4(),p=new THREE.Vector3();
      batches.forEach((b,k)=>{for(const id of active[k]){b.getMatrixAt(id,m);p.setFromMatrixPosition(m);if(Math.hypot(p.x-x,p.z-z)<=r)out.push('placed:'+p.x.toFixed(1)+':'+p.z.toFixed(1));}});return out;},
    /** Relief occlusion (horizon field): hidden structures are left out at the next rebuild. */
    setOcclusion(fn:((x:number,z:number,top:number)=>boolean)|null){occluded=fn;focusX=NaN;},
    update(fx:number,fz:number){
      if(stats.state!=='ready'||disposed||Math.hypot(fx-focusX,fz-focusZ)<16)return;focusX=fx;focusZ=fz;stats.rebuilds++;
      const counts=[0,0];
      batches.forEach((b,k)=>{for(const id of active[k])b.deleteInstance(id);active[k]=[];});
      for(const it of items){const d=Math.hypot(it.x-fx,it.z-fz),level=levelOf(it,d);it.level=level;if(level<0||occluded?.(it.x,it.z,it.top))continue;const g=geometryIds.get(it.assetId);if(!g)continue;
        const id=batches[level].addInstance(g[level]);active[level].push(id);batches[level].setMatrixAt(id,it.matrix);counts[level]++;}
      stats.lod0=counts[0];stats.lod1=counts[1];stats.calls=counts.filter(Boolean).length;batches.forEach((b,k)=>b.visible=counts[k]>0);
    },
    dispose(){disposed=true;for(const b of batches){b.removeFromParent();b.dispose();}material.dispose();},
  };
}
export type PlacedInstances=ReturnType<typeof createPlacedInstances>;
