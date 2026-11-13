import * as THREE from 'three';
import {terrainHeight,waterSurface} from '../terrain.ts';
import type {PathDefinition} from '../world-data.ts';
import {centerline,pathSectors,sectorGeometry,type Sample} from './path-geometry.ts';

/** E8 — path surfaces streamed by sector around the focus. One shared material (vertex colours
 * + a tiny procedural pattern: cobbles, planks, ruts) and one mesh per sector: draw calls stay
 * bounded whatever the number of paths. An edit rebuilds only the sectors its path crosses;
 * far sectors use a simplified LOD and are dropped beyond the streaming radius (the terrain
 * colour already marks roads at distance). No collider: a path is a walkable ground surface. */
export interface PathViewStats {paths:number;sectors:number;built:number;triangles:number;buildMs:number;pending:number;/** Hash of the rendered path definitions (Studio ↔ game comparison). */signature:string}
const PATTERN_VERTEX=`attribute vec2 pathUv;attribute float pathKind;varying vec2 vPathUv;varying float vPathKind;\n`;
const PATTERN_FRAGMENT=`varying vec2 vPathUv;varying float vPathKind;
float pathHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float pathPattern(){
  float along=vPathUv.x,across=vPathUv.y;
  if(vPathKind>2.5){float seam=step(fract(along/.42),.07);return mix(1.0,.62,seam)*(.94+.06*pathHash(vec2(floor(along/.42),0.)));}
  if(vPathKind>1.5){vec2 c=vec2(along/.55+.5*floor(across*1.6),across*1.6);vec2 f=fract(c);float grout=step(min(min(f.x,1.-f.x),min(f.y,1.-f.y)),.06);return mix(.86+.2*pathHash(floor(c)),.7,grout);}
  if(vPathKind>0.5){float rut=exp(-pow((abs(across)-.45)/.12,2.));return 1.-.12*rut;}
  return 1.;
}
`;
export function createPathView(parent:THREE.Group,sectorSize:number,options:{radius?:number;lodDistance?:number;budgetMs?:number}={}){
  const radius=options.radius??360,lodDistance=options.lodDistance??160,budget=options.budgetMs??2;
  const root=new THREE.Group();root.name='Paths';parent.add(root);
  const material=new THREE.MeshLambertMaterial({vertexColors:true,side:THREE.DoubleSide});
  material.onBeforeCompile=shader=>{
    shader.vertexShader=PATTERN_VERTEX+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPathUv=pathUv;vPathKind=pathKind;');
    shader.fragmentShader=PATTERN_FRAGMENT+shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=pathPattern();');
  };
  material.customProgramCacheKey=()=>'little-world-paths-1';
  let paths:PathDefinition[]=[];
  const lines=new Map<string,Sample[]>(),signatures=new Map<string,string>(),sectorPaths=new Map<string,Set<string>>(),pathSectorKeys=new Map<string,string[]>();
  const built=new Map<string,{mesh:THREE.Mesh;lod:0|1}>(),dirty=new Set<string>();
  const stats:PathViewStats={paths:0,sectors:0,built:0,triangles:0,buildMs:0,pending:0,signature:''};
  let focus={x:NaN,z:NaN},disposed=false;
  const rectOf=(key:string)=>{const [cx,cz]=key.split(':').map(Number);return {minX:cx*sectorSize,maxX:(cx+1)*sectorSize,minZ:cz*sectorSize,maxZ:(cz+1)*sectorSize};};
  const distance=(key:string)=>{const r=rectOf(key);return Math.hypot(Math.max(r.minX-focus.x,0,focus.x-r.maxX),Math.max(r.minZ-focus.z,0,focus.z-r.maxZ));};
  function drop(key:string){const b=built.get(key);if(!b)return;b.mesh.removeFromParent();b.mesh.geometry.dispose();built.delete(key);}
  function build(key:string,lod:0|1){
    const begin=performance.now(),ids=sectorPaths.get(key);drop(key);if(!ids?.size)return;
    const list=paths.filter(p=>ids.has(p.id)),g=sectorGeometry(list,rectOf(key),{height:terrainHeight,water:waterSurface},lod,lines);
    if(g.index.length){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(g.positions,3));geometry.setAttribute('color',new THREE.BufferAttribute(g.colors,3));
      geometry.setAttribute('pathUv',new THREE.BufferAttribute(g.uvs,2));geometry.setAttribute('pathKind',new THREE.BufferAttribute(g.kinds,1));geometry.setIndex(new THREE.BufferAttribute(g.positions.length/3>65535?g.index:Uint16Array.from(g.index),1));
      geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.name='Paths '+key;mesh.userData.pathSector=key;mesh.userData.pathIds=g.paths;mesh.matrixAutoUpdate=false;root.add(mesh);built.set(key,{mesh,lod});
    }
    stats.buildMs+=performance.now()-begin;stats.built++;
  }
  function measure(){stats.paths=paths.length;stats.sectors=built.size;stats.triangles=0;for(const b of built.values())stats.triangles+=(b.mesh.geometry.index?.count??0)/3;}
  return {
    stats,root,
    /** Replace the path set; only sectors crossed by changed paths are rebuilt. Returns changed ids. */
    setPaths(next:readonly PathDefinition[]):string[]{
      const changed:string[]=[],ids=new Set(next.map(p=>p.id));
      for(const [id]of signatures)if(!ids.has(id)){changed.push(id);for(const k of pathSectorKeys.get(id)??[]){sectorPaths.get(k)?.delete(id);dirty.add(k);}signatures.delete(id);lines.delete(id);pathSectorKeys.delete(id);}
      for(const p of next){
        const sig=JSON.stringify(p);if(signatures.get(p.id)===sig)continue;changed.push(p.id);
        for(const k of pathSectorKeys.get(p.id)??[]){sectorPaths.get(k)?.delete(p.id);dirty.add(k);}
        const line=centerline(p),keys=pathSectors(p,sectorSize,line);lines.set(p.id,line);signatures.set(p.id,sig);pathSectorKeys.set(p.id,keys);
        for(const k of keys){let set=sectorPaths.get(k);if(!set)sectorPaths.set(k,set=new Set());set.add(p.id);dirty.add(k);}
      }
      paths=next.map(p=>structuredClone(p));measure();
      let h=2166136261;const text=JSON.stringify([...paths].sort((a,b)=>a.id<b.id?-1:1).map(p=>[p.id,p.kind??'dirt',!!p.smooth,p.width,p.points.map(q=>[Math.round(q.x*1000),Math.round(q.z*1000)])]));for(let i=0;i<text.length;i++)h=Math.imul(h^text.charCodeAt(i),16777619);stats.signature=(h>>>0).toString(16);
      return changed;
    },
    /** Relief changed under some paths: their surfaces are re-draped locally. */
    refreshArea(x:number,z:number,r:number){for(const key of sectorPaths.keys()){const q=rectOf(key);if(q.maxX>=x-r&&q.minX<=x+r&&q.maxZ>=z-r&&q.minZ<=z+r)dirty.add(key);}},
    update(fx:number,fz:number){
      if(disposed)return;focus={x:fx,z:fz};const begin=performance.now();
      const wanted:[string,0|1,number][]=[];
      for(const [key,set]of sectorPaths){if(!set.size){if(built.has(key))drop(key);continue;}const d=distance(key);if(d>radius+(built.has(key)?24:0)){drop(key);continue;}
        const current=built.get(key),lod:0|1=d<lodDistance-(current?.lod===0?-16:16)?0:1;if(!current||current.lod!==lod||dirty.has(key))wanted.push([key,lod,d]);}
      wanted.sort((a,b)=>a[2]-b[2]);
      let done=0;for(const [key,lod]of wanted){if(done>0&&performance.now()-begin>budget)break;build(key,lod);dirty.delete(key);done++;}
      stats.pending=wanted.length-done;measure();
    },
    dispose(){disposed=true;for(const key of [...built.keys()])drop(key);material.dispose();root.removeFromParent();},
  };
}
export type PathView=ReturnType<typeof createPathView>;
