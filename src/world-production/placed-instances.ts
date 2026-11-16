/** World Production V1 — instanced drawing of repeated placed structures (game runtime).
 * Enclosure modules (fences, posts, walls, hedges) and dock pieces are authored as individual
 * V3 entities (stable ids, transactions, collisions), but drawing each one as its own object
 * costs one draw call per module. Here they share one BatchedMesh per LOD (two for small modules, three original
 * LODs for whitelisted static buildings, preserving their 900 m visibility), rebuilt only when the focus moves by more than
 * a step. Existing instance IDs survive unchanged visibility and LOD. Logic (positions, collisions, gameplay state) never depends on what is drawn.
 * Entities with gameplay state keep their individual object (not handled here). */
import * as THREE from 'three';
import {worldAsset,lodDistances} from './registry.ts';
import {loadAssetLods} from './species-library.ts';
import type {Placement} from '../world-data.ts';

export const STATIC_BUILDINGS=new Set(['architecture.wooden_cabin','architecture.stone_house','architecture.house_blue','architecture.house_timber','architecture.farmhouse','architecture.inn','structure.pier_hut']);
export const INSTANCED_ROLES=new Set(['fence','wall','hedge','dock','rock','prop']);
/** LOD radii (m) of instanced structures: benchmark knobs. */
export const PLACED_RADII={lod0:45,lod1:140,rockMin:400,rockPerMetre:60,hysteresis:12};
/** Cull radius of a placement: natural rocks are landmarks of the relief (boulders, spires, cliff
 * blocks up to ~12 m): they stay drawn (LOD1) far beyond the small structures, scaled by their size. */
export function placedCullRadius(assetId:string,height:number):number{if(STATIC_BUILDINGS.has(assetId))return 900;return worldAsset(assetId)?.usage?.role==='rock'?Math.max(PLACED_RADII.rockMin,PLACED_RADII.rockPerMetre*height):PLACED_RADII.lod1;}
export interface PlacedInstanceStats {placements:number;lod0:number;lod1:number;lod2:number;calls:number;rebuilds:number;staticBuildings:number;instanceCreates:number;instanceDeletes:number;fallbacks:number;lod2Capacity:number;preparedThisUpdate:number;pendingLevels:number;maxPrepareMs:number;state:'empty'|'loading'|'ready'}
export function eligibleForInstancing(assetId:string):boolean{const a=worldAsset(assetId);return !!a&&!!a.usage&&(INSTANCED_ROLES.has(a.usage.role)||STATIC_BUILDINGS.has(assetId));}
export function createPlacedInstances(parent:THREE.Object3D,ground:(x:number,z:number)=>number,load:typeof loadAssetLods=loadAssetLods){
  let occluded:((x:number,z:number,top:number)=>boolean)|null=null;
  const items:{assetId:string;matrix:THREE.Matrix4;x:number;y:number;z:number;top:number;cull:number;level:number;instance:number;batch:number;building:boolean;distances:number[];fallback:THREE.Mesh|null}[]=[],stats:PlacedInstanceStats={placements:0,lod0:0,lod1:0,lod2:0,calls:0,rebuilds:0,staticBuildings:0,instanceCreates:0,instanceDeletes:0,fallbacks:0,lod2Capacity:0,preparedThisUpdate:0,pendingLevels:0,maxPrepareMs:0,state:'empty'};
  const material=new THREE.MeshLambertMaterial({vertexColors:true,flatShading:true});
  const fallbackMaterial=new THREE.MeshLambertMaterial({color:0xb9a789,flatShading:true}),fallbackGeometry=new Map<string,THREE.BoxGeometry>();
  const active:number[][]=[[],[],[]];let batches:THREE.BatchedMesh[]=[],geometryIds:Map<string,number[]>=new Map(),focusX=NaN,focusZ=NaN,cameraX=NaN,cameraY=NaN,cameraZ=NaN,disposed=false,loading:Promise<void>|null=null;
  const preparation:(()=>void)[]=[];
  async function build(){
    const ids=[...new Set(items.map(i=>i.assetId))],lods=await Promise.all(ids.map(id=>load(id)));if(disposed)return;
    const levels=items.some(i=>i.building&&i.distances.length>2)?[0,1,2]:[0,1];
    const per=levels.map(level=>{let v=0,ix=0;ids.forEach((id,k)=>{if(level===2&&(!STATIC_BUILDINGS.has(id)||(worldAsset(id)?.lods.length??0)<3))return;const g=lods[k]?.[Math.min(level,(lods[k]?.length??1)-1)];if(g){v+=g.getAttribute('position').count;ix+=g.index!.count;}});return {v,ix};});
    ids.forEach((id,k)=>{if(lods[k])geometryIds.set(id,levels.map(()=>-1));});
    for(const level of levels)preparation.push(()=>{
      const capacity=level===2?items.filter(i=>i.building&&i.distances.length>2).length:items.length;if(level===2)stats.lod2Capacity=capacity;
      const b=new THREE.BatchedMesh(Math.max(1,capacity),Math.max(3,per[level].v),Math.max(3,per[level].ix),material);b.name='Placed structures LOD'+level;b.perObjectFrustumCulled=true;b.sortObjects=false;b.frustumCulled=false;b.castShadow=b.receiveShadow=false;parent.add(b);batches.push(b);
      ids.forEach((id,k)=>{const l=lods[k];if(!l||level===2&&(!STATIC_BUILDINGS.has(id)||l.length<3))return;geometryIds.get(id)![level]=b.addGeometry(l[Math.min(level,l.length-1)]);});
    });
    stats.pendingLevels=preparation.length;
  }
  function prepareNext(){
    const job=preparation.shift();if(!job)return;const start=performance.now();job();stats.preparedThisUpdate=1;stats.pendingLevels=preparation.length;stats.maxPrepareMs=Math.max(stats.maxPrepareMs,performance.now()-start);focusX=NaN;
    if(!preparation.length){for(const it of items)if(it.fallback&&geometryIds.has(it.assetId)){it.fallback.removeFromParent();it.fallback=null;}stats.fallbacks=items.filter(i=>i.fallback).length;stats.state='ready';}
  }

  /** LOD level with hysteresis (no popping back and forth around a threshold while walking). */
  const HYST=PLACED_RADII.hysteresis;
  function levelOf(it:{cull:number;level:number;building:boolean;distances:number[]},d:number){
    if(it.building){let level=0;for(let i=1;i<it.distances.length;i++){const threshold=it.distances[i]*(it.level===i?.98:1);if(d<threshold)break;level=i;}return level;}
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
      // Mirrored instance matrices invert face winding inside a shared draw; keep the
      // ordinary object path so Three.js can select the proper front face per object.
      if(s.x*s.y*s.z<0)return false;
      const asset=worldAsset(p.assetId)!,building=STATIC_BUILDINGS.has(p.assetId),matrix=new THREE.Matrix4().compose(new THREE.Vector3(p.x,ground(p.x,p.z)+(p.y??0),p.z),q,s);
      let fallback:THREE.Mesh|null=null;if(building){let g=fallbackGeometry.get(p.assetId);if(!g){g=new THREE.BoxGeometry(Math.max(.2,asset.size[0]*.8),Math.max(.2,asset.size[1]),Math.max(.2,asset.size[2]*.8)).translate(0,asset.size[1]/2,0);fallbackGeometry.set(p.assetId,g);}fallback=new THREE.Mesh(g,fallbackMaterial);fallback.matrixAutoUpdate=false;fallback.matrix.copy(matrix);fallback.name='Placed loading '+p.assetId;parent.add(fallback);stats.staticBuildings++;stats.fallbacks++;}
      items.push({assetId:p.assetId,x:p.x,y:ground(p.x,p.z)+(p.y??0),z:p.z,level:-1,instance:-1,batch:-1,building,distances:building?lodDistances(asset):[0,PLACED_RADII.lod0],fallback,cull:placedCullRadius(p.assetId,asset.size[1]*Math.abs(s.y)),top:ground(p.x,p.z)+(p.y??0)+asset.size[1]*Math.abs(s.y),matrix});stats.placements=items.length;
      if(!loading){stats.state='loading';loading=Promise.resolve().then(build);}
      return true;
    },
    /** Debug/test (metrics mode): keys of the placements drawn within `r` of (x, z). */
    drawnNear(x:number,z:number,r:number):string[]{const out:string[]=[];const m=new THREE.Matrix4(),p=new THREE.Vector3();
      batches.forEach((b,k)=>{for(const id of active[k]){b.getMatrixAt(id,m);p.setFromMatrixPosition(m);if(Math.hypot(p.x-x,p.z-z)<=r)out.push('placed:'+p.x.toFixed(1)+':'+p.z.toFixed(1));}});return out;},
    /** Relief occlusion (horizon field): hidden structures are left out at the next rebuild. */
    setOcclusion(fn:((x:number,z:number,top:number)=>boolean)|null){occluded=fn;focusX=NaN;},
    update(fx:number,fz:number,camera?:{x:number;y:number;z:number}){
      if(disposed)return;stats.preparedThisUpdate=0;prepareNext();
      if(!batches.length){for(const it of items)if(it.fallback)it.fallback.visible=Math.hypot(it.x-fx,it.z-fz)<it.cull;return;}
      if(Math.hypot(fx-focusX,fz-focusZ)<16&&(!camera||Math.hypot(camera.x-cameraX,camera.y-cameraY,camera.z-cameraZ)<12))return;focusX=fx;focusZ=fz;cameraX=camera?.x??NaN;cameraY=camera?.y??NaN;cameraZ=camera?.z??NaN;stats.rebuilds++;
      const counts=[0,0,0];
      for(const it of items){
        const d=Math.hypot(it.x-fx,it.z-fz),visualDistance=it.building&&camera?Math.hypot(it.x-camera.x,it.y-camera.y,it.z-camera.z):d;
        const level=d>=it.cull+(it.building?0:HYST)?-1:levelOf(it,visualDistance);it.level=level;
        const visible=level>=0&&!(d>80&&occluded?.(it.x,it.z,it.top));
        const g=geometryIds.get(it.assetId),target=visible&&g&&batches[level]&&g[level]>=0?level:-1;
        if(it.fallback)it.fallback.visible=visible&&target<0;
        if(target!==it.batch){
          if(it.instance>=0){batches[it.batch].deleteInstance(it.instance);stats.instanceDeletes++;}
          it.instance=-1;it.batch=target;
          if(target>=0){it.instance=batches[target].addInstance(g![target]);batches[target].setMatrixAt(it.instance,it.matrix);stats.instanceCreates++;}
        }
        if(it.batch>=0)counts[it.batch]++;
      }
      for(let k=0;k<active.length;k++)active[k].length=0;
      for(const it of items)if(it.batch>=0)active[it.batch].push(it.instance);
      stats.lod0=counts[0];stats.lod1=counts[1];stats.lod2=counts[2];stats.calls=counts.filter(Boolean).length;batches.forEach((b,k)=>b.visible=counts[k]>0);
    },
    dispose(){disposed=true;preparation.length=0;stats.pendingLevels=0;for(const it of items)it.fallback?.removeFromParent();for(const g of fallbackGeometry.values())g.dispose();fallbackMaterial.dispose();for(const b of batches){b.removeFromParent();b.dispose();}material.dispose();},
  };
}
export type PlacedInstances=ReturnType<typeof createPlacedInstances>;
