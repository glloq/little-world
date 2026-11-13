/** Rendering of mines and farm plots — light procedural stand-ins (no asset is used or changed).
 * Mines: only chunks of the player's level and its neighbours, within a radius, are meshed
 * (one shared vertex-coloured material, local rebuild after digging, bounded cache); the
 * entrance and stairs are marked and lit with E10 lanterns. Farms: one draped soil mesh tinted
 * by moisture and one InstancedMesh of simple plants per plot, refreshed only when the public
 * stage changes, hidden beyond a distance. No collision or gameplay state lives here. */
import * as THREE from 'three';
import type {ActivityRuntime,ActivityChange} from './gameplay/activity-runtime.ts';
import type {MovementSpace} from './physics/collision-world.ts';
import type {RuntimeLight} from './lighting/light-data.ts';
import {mineChunkGeometry} from './mine/mine-mesher.ts';
import {MINE_CHUNK,insidePolygon,type MineZone} from './mine/mine-data.ts';
import {CROPS,type FarmZone} from './farm/farm-data.ts';

const CHUNK_RADIUS=48,MAX_CHUNKS=36,BUILDS_PER_FRAME=2,FARM_DETAIL=140;
export interface ActivityViewStats {mineChunks:number;mineQuads:number;builds:number;farmInstances:number;farmUpdates:number}
export function createActivityView(parent:THREE.Object3D,activities:ActivityRuntime,ground:(x:number,z:number)=>number){
  const root=new THREE.Group();root.name='Activities';parent.add(root);
  const mineMaterial=new THREE.MeshLambertMaterial({vertexColors:true}),wood=new THREE.MeshLambertMaterial({color:0x6b4a2f}),dark=new THREE.MeshBasicMaterial({color:0x0b0a09}),stone=new THREE.MeshLambertMaterial({color:0x8d8a84});
  const stats:ActivityViewStats={mineChunks:0,mineQuads:0,builds:0,farmInstances:0,farmUpdates:0};
  const chunks=new Map<string,{mesh:THREE.Mesh;dirty:boolean;mineId:string;level:number;cx:number;cz:number;quads:number}>();
  const mineMarkers=new Map<string,THREE.Group[]>(),lights:RuntimeLight[]=[];
  const box=(g:THREE.Object3D,m:THREE.Material,sx:number,sy:number,sz:number,x:number,y:number,z:number)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),m);b.position.set(x,y,z);g.add(b);return b;};
  const lantern=(id:string,x:number,y:number,z:number,mode:'always'|'night')=>lights.push({id:'light:activity:'+id,entityId:'activity:'+id,x,y,z,offset:{x:0,y:0,z:0},color:'#ffd39a',intensity:9,range:9,mode,flicker:{amplitude:.08,speed:.6},follow:false,absolute:true});
  // Entrance (surface frame + dark opening) and stairs markers of each mine, built once.
  for(const [id,{zone}] of activities.mines){
    const e=zone.mine.entrance,gy=ground(e.x,e.z),frame=new THREE.Group();frame.name='MineEntrance:'+id;frame.position.set(e.x,gy,e.z);frame.rotation.y=e.heading;
    box(frame,wood,.3,3,.3,-1.2,1.5,0);box(frame,wood,.3,3,.3,1.2,1.5,0);box(frame,wood,2.8,.35,.4,0,3,0);const hole=box(frame,dark,2.1,2.8,.05,0,1.4,.12);hole.name='MineOpening';
    root.add(frame);lantern(id+':entrance',e.x-Math.sin(e.heading)*1.2,gy+2.6,e.z-Math.cos(e.heading)*1.2,'night');
    const top=zone.mine.levels[0];lantern(id+':inside',Math.floor(e.x+Math.sin(e.heading)*3)+.5,top.floorY+2.6,Math.floor(e.z+Math.cos(e.heading)*3)+.5,'always');
    const markers:THREE.Group[]=[];
    for(const c of zone.mine.connectors){
      const up=zone.mine.levels.find(l=>l.id===c.upper)!,low=zone.mine.levels.find(l=>l.id===c.lower)!,cx=Math.floor(c.x)+.5,cz=Math.floor(c.z)+.5;
      const a=new THREE.Group();a.name='MineStairs:'+c.id;a.userData={mineId:id,level:up.id};box(a,dark,.96,.02,.96,cx,up.floorY+.02,cz);for(const s of [-.42,.42])box(a,wood,.08,1.4,.08,cx+s,up.floorY+.7,cz-.42);
      const b=new THREE.Group();b.name='MineStairsBelow:'+c.id;b.userData={mineId:id,level:low.id};for(let i=0;i<5;i++)box(b,stone,.96,.18,.3,cx,low.floorY+.09+i*.18,cz-.3+i*.0);for(const s of [-.42,.42])box(b,wood,.08,low.height,.08,cx+s,low.floorY+low.height/2,cz-.45);
      root.add(a,b);markers.push(a,b);lantern(id+':'+c.id+':up',cx+1,up.floorY+2.6,cz,'always');lantern(id+':'+c.id+':down',cx+1,low.floorY+2.6,cz,'always');
    }
    mineMarkers.set(id,markers);
  }
  function chunkMesh(mineId:string,level:number,cx:number,cz:number){
    const m=activities.mines.get(mineId)!,g=mineChunkGeometry(m.state,level,cx,cz),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.BufferAttribute(g.positions,3));geo.setAttribute('normal',new THREE.BufferAttribute(g.normals,3));geo.setAttribute('color',new THREE.BufferAttribute(g.colors,3));geo.setIndex(new THREE.BufferAttribute(g.index,1));geo.computeBoundingSphere();
    stats.builds++;return {geo,quads:g.quads};
  }
  const unsubscribe=activities.subscribe((c:ActivityChange)=>{
    if(c.kind==='mine'){for(const v of chunks.values())if(v.mineId===c.mineId&&(c.level<0||v.level===c.level&&c.chunks.includes(v.cx+','+v.cz)))v.dirty=true;}
    else farmDirty.add(c.plotId);
  });
  function updateMines(p:{x:number;y:number;z:number},space?:MovementSpace){
    const wanted=new Set<string>();let builds=0;
    for(const [id,m] of activities.mines){
      const active=space?.zoneId===id?m.state.grid.levelIndex(space.levelId):-1;
      for(const marker of mineMarkers.get(id)??[]){const l=m.zone.mine.levels.findIndex(v=>v.id===marker.userData.level);marker.visible=active>=0&&Math.abs(l-active)<=1;}
      if(active<0)continue;
      for(const level of [active,active-1,active+1]){if(level<0||level>=m.state.grid.levels.length)continue;
        for(let cx=Math.floor((p.x-CHUNK_RADIUS)/MINE_CHUNK);cx<=Math.floor((p.x+CHUNK_RADIUS)/MINE_CHUNK);cx++)for(let cz=Math.floor((p.z-CHUNK_RADIUS)/MINE_CHUNK);cz<=Math.floor((p.z+CHUNK_RADIUS)/MINE_CHUNK);cz++){
          const key=`${id}:${level}:${cx},${cz}`;wanted.add(key);const current=chunks.get(key);
          if((current&&!current.dirty)||builds>=BUILDS_PER_FRAME)continue;builds++;
          const {geo,quads}=chunkMesh(id,level,cx,cz);
          if(current){current.mesh.geometry.dispose();current.mesh.geometry=geo;current.dirty=false;current.quads=quads;}
          else{const mesh=new THREE.Mesh(geo,mineMaterial);mesh.name='MineChunk:'+key;mesh.matrixAutoUpdate=false;root.add(mesh);chunks.set(key,{mesh,dirty:false,mineId:id,level,cx,cz,quads});}
        }}
    }
    // Leaving a level / the mine: chunks out of the wanted set are hidden, the oldest evicted.
    // Solid-rock chunks have no face: kept as a cache entry, never drawn.
    for(const [key,v] of chunks){v.mesh.visible=wanted.has(key)&&v.quads>0;if(!wanted.has(key)&&chunks.size>MAX_CHUNKS){v.mesh.geometry.dispose();v.mesh.removeFromParent();chunks.delete(key);}}
    stats.mineChunks=[...chunks.values()].filter(v=>v.mesh.visible).length;stats.mineQuads=[...chunks.values()].reduce((s,v)=>s+(v.mesh.visible?v.quads:0),0);
  }
  // Farms.
  const farmDirty=new Set<string>(activities.farms.keys()),farmViews=new Map<string,{soil:THREE.Mesh;plants:THREE.InstancedMesh|null;key:string;centre:THREE.Vector3}>();let farmClock=0;
  const plantGeometry={wheat:new THREE.ConeGeometry(.12,1,4),carrot:new THREE.ConeGeometry(.16,1,5),pumpkin:new THREE.SphereGeometry(.5,7,5)} as Record<string,THREE.BufferGeometry>;
  const plantMaterial=new THREE.MeshLambertMaterial({color:0xffffff});
  for(const [id,{zone}] of activities.farms)farmViews.set(id,{soil:soilMesh(zone,ground),plants:null,key:'',centre:centreOf(zone,ground)});
  for(const [id,v] of farmViews){v.soil.name='FarmSoil:'+id;root.add(v.soil);const irr=activities.farms.get(id)!.zone.farm.irrigation;if(irr){const g=new THREE.Group();g.name='Irrigation:'+id;const y=ground(irr.x,irr.z);const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.5,.55,1,10),wood);barrel.position.set(irr.x,y+.5,irr.z);const water=new THREE.Mesh(new THREE.CircleGeometry(.45,10),new THREE.MeshLambertMaterial({color:0x4f9fc0}));water.rotation.x=-Math.PI/2;water.position.set(irr.x,y+1.01,irr.z);g.add(barrel,water);root.add(g);}}
  function updateFarms(p:{x:number;y:number;z:number},dt:number){
    farmClock+=dt;const tick=farmClock>=1;if(tick)farmClock=0;
    for(const [id,v] of farmViews){
      const near=v.centre.distanceTo(new THREE.Vector3(p.x,p.y,p.z))<FARM_DETAIL;
      if(v.plants)v.plants.visible=near;
      if(!near||!tick&&!farmDirty.has(id))continue;farmDirty.delete(id);
      const view=activities.farmView(id)!;const key=`${view.cropId}:${view.stage}:${Math.round(view.growth*10)}:${Math.round(view.moisture*5)}`;if(key===v.key)continue;v.key=key;stats.farmUpdates++;
      (v.soil.material as THREE.MeshLambertMaterial).color.setHex(view.moisture>.6?0x4b3424:view.moisture>.3?0x6b4b31:0x9a7a55);
      if(v.plants){v.plants.removeFromParent();v.plants.dispose();v.plants=null;}
      if(!view.cropId)continue;const crop=CROPS[view.cropId],zone=activities.farms.get(id)!.zone,spots=plantSpots(zone,ground),mesh=new THREE.InstancedMesh(plantGeometry[view.cropId],plantMaterial,spots.length);
      const s=view.stage==='failed'?.5:.15+.85*view.growth,color=new THREE.Color(view.stage==='failed'?0x8a7a5a:view.stage==='mature'?crop.matureColor:crop.color),m=new THREE.Matrix4(),q=new THREE.Quaternion();
      spots.forEach((spot,i)=>{const h=crop.height*s;m.compose(new THREE.Vector3(spot.x,spot.y+h/2,spot.z),q,new THREE.Vector3(view.cropId==='pumpkin'?s:1,h,view.cropId==='pumpkin'?s:1));mesh.setMatrixAt(i,m);mesh.setColorAt(i,color);});
      mesh.name='FarmCrops:'+id;mesh.castShadow=false;mesh.receiveShadow=false;root.add(mesh);v.plants=mesh;
    }
    stats.farmInstances=[...farmViews.values()].reduce((n,v)=>n+(v.plants?.visible?v.plants.count:0),0);
  }
  return {
    stats,lights,
    update(dt:number,p:{x:number;y:number;z:number},space?:MovementSpace){updateMines(p,space);updateFarms(p,dt);},
    dispose(){unsubscribe();for(const v of chunks.values())v.mesh.geometry.dispose();root.traverse(o=>{const m=o as THREE.Mesh;if(m.geometry&&!Object.values(plantGeometry).includes(m.geometry))m.geometry.dispose();});for(const g of Object.values(plantGeometry))g.dispose();for(const v of farmViews.values())(v.soil.material as THREE.Material).dispose();[mineMaterial,wood,dark,stone,plantMaterial].forEach(m=>m.dispose());root.removeFromParent();},
  };
}
function centreOf(zone:FarmZone,ground:(x:number,z:number)=>number){const x=zone.polygon.reduce((s,p)=>s+p.x,0)/zone.polygon.length,z=zone.polygon.reduce((s,p)=>s+p.z,0)/zone.polygon.length;return new THREE.Vector3(x,ground(x,z),z);}
/** Soil draped on the relief over a 1 m grid clipped to the plot outline. */
function soilMesh(zone:FarmZone,ground:(x:number,z:number)=>number){
  const xs=zone.polygon.map(p=>p.x),zs=zone.polygon.map(p=>p.z),x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs)),z0=Math.floor(Math.min(...zs)),z1=Math.ceil(Math.max(...zs)),p:number[]=[];
  const step=Math.max(1,Math.ceil(Math.max(x1-x0,z1-z0)/64));
  for(let x=x0;x<x1;x+=step)for(let z=z0;z<z1;z+=step){if(!insidePolygon(zone.polygon,x+step/2,z+step/2))continue;const v=(a:number,b:number)=>[a,ground(a,b)+.05,b];p.push(...v(x,z),...v(x,z+step),...v(x+step,z+step),...v(x,z),...v(x+step,z+step),...v(x+step,z));}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.computeVertexNormals();
  return new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x6b4b31}));
}
/** Plant positions along rows (rowAngle), inside the plot, deterministic, at most 600. */
function plantSpots(zone:FarmZone,ground:(x:number,z:number)=>number){
  const a=zone.farm.rowAngle,ca=Math.cos(a),sa=Math.sin(a),xs=zone.polygon.map(p=>p.x),zs=zone.polygon.map(p=>p.z),cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2,r=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...zs)-Math.min(...zs))/2,out:{x:number;y:number;z:number}[]=[];
  for(let u=-r;u<=r&&out.length<600;u+=.8)for(let v=-r;v<=r&&out.length<600;v+=.5){const x=cx+u*ca-v*sa,z=cz+u*sa+v*ca;if(insidePolygon(zone.polygon,x,z)&&!zone.polygon.some((p,i)=>{const q=zone.polygon[(i+1)%zone.polygon.length],dx=q.x-p.x,dz=q.z-p.z,t=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-p.x-t*dx,z-p.z-t*dz)<.35;}))out.push({x,y:ground(x,z),z});}
  return out;
}
export type ActivityView=ReturnType<typeof createActivityView>;
export type {MineZone};
