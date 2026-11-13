import * as THREE from 'three';
import {geoContext} from './geography/engine.ts';
import {insideWorld} from './terrain.ts';
import {DRESSING_CELL_M,ITEM_STRIDE,generateDressingCell,type DressingCell,type DressingKind} from './geography/dressing.ts';

/** G5 — renderer of the natural dressing of generated worlds (doc 17/18/22 constraints).
 * Cells are generated progressively around the focus (time budget per frame, nearest
 * first, bounded LRU cache), then aggregated into ONE InstancedMesh per visual family:
 * ≤ 8 draw calls whatever the number of cells. Near trees have trunk + crown; far trees
 * keep a 4–8 triangle silhouette (no fog); small stones are short-ranged. No shadows, no
 * per-frame CPU animation: buffers are rewritten only when the visible cell set changes. */
type Family='trunk'|'cone'|'round'|'stone'|'grit'|'basalt'|'farCone'|'farRound';
const FAMILIES:Family[]=['trunk','cone','round','stone','grit','basalt','farCone','farRound'];
/** Draw radius (m) per item kind at detail level 0; values are benchmark knobs, not truths. */
export const DRESSING_RADII:Record<DressingKind|'farTrees',number>={pine:90,oak:90,shrub:90,rock:320,basalt:240,scree:80,pebble:60,farTrees:720};
const CAPACITY:Record<Family,number>={trunk:2500,cone:1500,round:2500,stone:3000,grit:5000,basalt:1500,farCone:9000,farRound:9000};
export interface DressingStats {byFamily:Record<string,number>;triangles:number;cells:number;pending:number;instances:number;calls:number;lastRebuildMs:number;maxCellMs:number;generatedMs:number;bytes:number;radiusScale:number}

const trianglesOf=(g:THREE.BufferGeometry)=>(g.index?g.index.count:g.getAttribute('position').count)/3;
/** Far round crown: an octahedron whose lower half is squashed (reads as a canopy, not a diamond). */
function flatBottom(g:THREE.BufferGeometry){const pos=g.getAttribute('position') as THREE.BufferAttribute;for(let i=0;i<pos.count;i++)if(pos.getY(i)<0)pos.setY(i,pos.getY(i)*.3);g.computeVertexNormals();return g;}
function rockGeometry(){
  const g=new THREE.IcosahedronGeometry(1,0),pos=g.getAttribute('position') as THREE.BufferAttribute;
  for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i),k=1+.18*Math.sin(x*12.9+y*7.1+z*3.7);pos.setXYZ(i,x*k,Math.max(-.35,y)*k,z*k);}
  g.computeVertexNormals();return g.translate(0,.3,0);
}
export function createDressingView(parent:THREE.Group,seed:number,density:number){
  const root=new THREE.Group();root.name='Dressing';parent.add(root);
  const geometries:Record<Family,THREE.BufferGeometry>={
    trunk:new THREE.CylinderGeometry(.22,.32,1,5,1,true).translate(0,.5,0),
    cone:new THREE.ConeGeometry(1,1,6).translate(0,.5,0),
    round:new THREE.IcosahedronGeometry(1,0),
    stone:rockGeometry(),
    grit:new THREE.OctahedronGeometry(1,0).translate(0,.25,0),
    basalt:new THREE.CylinderGeometry(.5,.55,1,6,1,true).translate(0,.5,0),
    farCone:new THREE.ConeGeometry(1,1,4,1,true).translate(0,.5,0),
    farRound:flatBottom(new THREE.OctahedronGeometry(1,0)),
  };
  const lambert=(color:number)=>new THREE.MeshLambertMaterial({color,flatShading:true});
  const materials:Record<Family,THREE.Material>={trunk:lambert(0x7b6046),cone:lambert(0xffffff),round:lambert(0xffffff),stone:lambert(0xffffff),grit:lambert(0xffffff),basalt:lambert(0xffffff),farCone:lambert(0xffffff),farRound:lambert(0xffffff)};
  const meshes={} as Record<Family,THREE.InstancedMesh>;
  for(const f of FAMILIES){const m=new THREE.InstancedMesh(geometries[f],materials[f],CAPACITY[f]);m.count=0;m.visible=false;m.name='Dressing '+f;m.castShadow=m.receiveShadow=false;m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);if(f!=='trunk')m.setColorAt(0,new THREE.Color());root.add(m);meshes[f]=m;}
  const cache=new Map<string,DressingCell&{used:number;stale?:boolean}>(),MAX_CELLS=900;let clock=0;
  const stats:DressingStats={byFamily:{},triangles:0,cells:0,pending:0,instances:0,calls:0,lastRebuildMs:0,maxCellMs:0,generatedMs:0,bytes:0,radiusScale:1};
  let queue:[number,number][]=[],focusCell='',dirty=true,lastRebuild=0,radiusScale=1,farScale=1,detail=0,retired=false;
  const included=new Set<string>();
  const maxRadius=()=>Math.max(DRESSING_RADII.rock*radiusScale,DRESSING_RADII.farTrees*farScale);
  function plan(fx:number,fz:number){
    const cx=Math.floor(fx/DRESSING_CELL_M),cz=Math.floor(fz/DRESSING_CELL_M),r=Math.ceil(maxRadius()/DRESSING_CELL_M),need:[number,number,number][]=[];
    for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      const x=cx+dx,z=cz+dz,cached=cache.get(x+':'+z);if(cached&&!cached.stale)continue;
      const d=cellDistance(x,z,fx,fz);if(d>maxRadius())continue;
      if(!insideWorld((x+.5)*DRESSING_CELL_M,(z+.5)*DRESSING_CELL_M)&&!insideWorld(x*DRESSING_CELL_M,z*DRESSING_CELL_M)&&!insideWorld((x+1)*DRESSING_CELL_M,(z+1)*DRESSING_CELL_M))continue;
      need.push([x,z,cached?d-1e6:d]);
    }
    queue=need.sort((a,b)=>a[2]-b[2]).map(([x,z])=>[x,z]);stats.pending=queue.length;
  }
  const cellDistance=(x:number,z:number,fx:number,fz:number)=>{const dx=Math.max(x*DRESSING_CELL_M-fx,0,fx-(x+1)*DRESSING_CELL_M),dz=Math.max(z*DRESSING_CELL_M-fz,0,fz-(z+1)*DRESSING_CELL_M);return Math.hypot(dx,dz);};
  function evict(){
    if(cache.size<=MAX_CELLS)return;const order=[...cache.entries()].sort((a,b)=>a[1].used-b[1].used);
    for(const [key]of order.slice(0,cache.size-MAX_CELLS)){cache.delete(key);for(const kind of ['pine','shrub','rock','scree','pebble','basalt'])included.delete(kind+':'+key);}
  }
  const color=new THREE.Color(),c2=new THREE.Color();
  const FOLIAGE:[number,number][]=[[0x4f7a45,0x6d9653],[0x5d8a4a,0x8aa85c]];
  function rebuild(fx:number,fz:number){
    const t0=performance.now(),counts:Record<Family,number>={trunk:0,cone:0,round:0,stone:0,grit:0,basalt:0,farCone:0,farRound:0};
    const bounds:Record<Family,THREE.Box3>=Object.fromEntries(FAMILIES.map(f=>[f,new THREE.Box3()])) as Record<Family,THREE.Box3>;
    // Near/far decisions use the distance to the cell centre (a cell is 64 m wide).
    const cells=[...cache.values()].map(c=>({c,d:Math.hypot((c.cx+.5)*DRESSING_CELL_M-fx,(c.cz+.5)*DRESSING_CELL_M-fz)})).sort((a,b)=>a.d-b.d);
    const near=(kind:DressingKind,d:number,key:string)=>{const r=DRESSING_RADII[kind]*radiusScale;const tag=kind+key;if(d<r){included.add(tag);return true;}if(d<r+24&&included.has(tag))return true;included.delete(tag);return false;};
    const write=(f:Family,x:number,y:number,z:number,sx:number,sy:number,sz:number,rot:number,hex:number|null)=>{
      const n=counts[f];if(n>=CAPACITY[f])return;const m=meshes[f],e=m.instanceMatrix.array as Float32Array,o=n*16,c=Math.cos(rot),s=Math.sin(rot);
      e[o]=c*sx;e[o+1]=0;e[o+2]=-s*sx;e[o+3]=0;e[o+4]=0;e[o+5]=sy;e[o+6]=0;e[o+7]=0;e[o+8]=s*sz;e[o+9]=0;e[o+10]=c*sz;e[o+11]=0;e[o+12]=x;e[o+13]=y;e[o+14]=z;e[o+15]=1;
      if(hex!==null&&m.instanceColor){color.setHex(hex);m.instanceColor.setXYZ(n,color.r,color.g,color.b);}
      bounds[f].expandByPoint(new THREE.Vector3(x,y+sy,z)).expandByPoint(new THREE.Vector3(x,y,z));counts[f]=n+1;
    };
    const mix=(a:number,b:number,t:number)=>{color.setHex(a);c2.setHex(b);color.lerp(c2,t);return color.getHex();};
    for(const {c,d}of cells){
      c.used=++clock;const key=':'+c.cx+':'+c.cz;
      const trees=near('pine',d,key),far=!trees&&d<DRESSING_RADII.farTrees*farScale;
      for(const kind of ['pine','oak'] as const){
        const a=c.items[kind];if(!trees&&!far)continue;
        // Distant groves: one silhouette out of two, slightly larger (same canopy coverage).
        const thin=far&&(d>320*farScale||detail>=2)?2:1,grow=thin===2?1.25:1;
        for(let i=0;i<a.length;i+=ITEM_STRIDE*thin){
          const x=a[i],y=a[i+1],z=a[i+2],s=a[i+3],r=a[i+4],t=a[i+5],tone=FOLIAGE[kind==='pine'?0:1],hex=mix(tone[0],tone[1],t);
          if(trees){
            const trunkH=kind==='pine'?2.4*s:2.1*s;write('trunk',x,y-.2,z,s,trunkH+.2,s,r,null);
            if(kind==='pine')write('cone',x,y+trunkH*.75,z,2.3*s,6.4*s,2.3*s,r,hex);else write('round',x,y+trunkH+1.6*s,z,2.5*s,2.1*s,2.5*s,r,hex);
          }else if(kind==='pine')write('farCone',x,y,z,2.4*s*grow,8.8*s,2.4*s*grow,r,hex);else write('farRound',x,y+1.2*s,z,2.9*s*grow,4.4*s,2.9*s*grow,r,hex);
        }
      }
      if(near('shrub',d,key)){const a=c.items.shrub;for(let i=0;i<a.length;i+=ITEM_STRIDE)write('round',a[i],a[i+1]+.45*a[i+3],a[i+2],1.1*a[i+3],.75*a[i+3],1.1*a[i+3],a[i+4],mix(0x6f8f4e,0x93a15a,a[i+5]));}
      if(near('rock',d,key)){const a=c.items.rock;for(let i=0;i<a.length;i+=ITEM_STRIDE)write('stone',a[i],a[i+1],a[i+2],a[i+3],a[i+3]*(.7+.5*a[i+5]),a[i+3]*.85,a[i+4],mix(0x8b8b84,0x6f6e69,a[i+5]));}
      if(near('scree',d,key)){const a=c.items.scree;for(let i=0;i<a.length;i+=ITEM_STRIDE)write('grit',a[i],a[i+1],a[i+2],a[i+3],a[i+3]*.55,a[i+3]*.8,a[i+4],mix(0xa29d8e,0x85817a,a[i+5]));}
      if(near('pebble',d,key)){const a=c.items.pebble;for(let i=0;i<a.length;i+=ITEM_STRIDE)write('grit',a[i],a[i+1],a[i+2],a[i+3],a[i+3]*.4,a[i+3]*.75,a[i+4],mix(0xc2bbaa,0x9b968a,a[i+5]));}
      if(near('basalt',d,key)){const a=c.items.basalt;for(let i=0;i<a.length;i+=ITEM_STRIDE)write('basalt',a[i],a[i+1],a[i+2],a[i+3],a[i+3]*(.7+1.6*a[i+5]),a[i+3],a[i+4],mix(0x4a4547,0x5e5856,a[i+5]));}
    }
    let instances=0,calls=0,triangles=0;
    for(const f of FAMILIES){
      const m=meshes[f],n=counts[f];m.count=n;m.visible=n>0;instances+=n;if(n)calls++;stats.byFamily[f]=n;triangles+=n*trianglesOf(geometries[f]);
      m.instanceMatrix.needsUpdate=true;m.instanceMatrix.clearUpdateRanges();m.instanceMatrix.addUpdateRange(0,n*16);
      if(m.instanceColor){m.instanceColor.needsUpdate=true;m.instanceColor.clearUpdateRanges();m.instanceColor.addUpdateRange(0,n*3);}
      if(n){m.boundingSphere=bounds[f].getBoundingSphere(new THREE.Sphere());m.boundingSphere.radius+=8;}
    }
    stats.instances=instances;stats.calls=calls;stats.triangles=triangles;stats.lastRebuildMs=performance.now()-t0;stats.cells=cache.size;
    let bytes=0;for(const c of cache.values())for(const a of Object.values(c.items))bytes+=a.byteLength;stats.bytes=bytes;
  }
  return {
    stats,
    /** Quality tiers of the shared budget manager: 0 full, 1 −15 %, 2 shorter rings and thinner
     * far groves, 3 near dressing only (far silhouettes off; terrain colours keep forests). */
    setDetail(level:number){detail=level;const next=level>=3?.45:level>=2?.65:level>=1?.85:1,far=level>=3?0:level>=2?.55:level>=1?.85:1;if(next!==radiusScale||far!==farScale){radiusScale=next;farScale=far;stats.radiusScale=next;dirty=true;focusCell='';}},
    update(fx:number,fz:number,budgetMs=3){
      if(retired||density<=0)return;
      const cell=Math.floor(fx/DRESSING_CELL_M)+':'+Math.floor(fz/DRESSING_CELL_M);
      if(cell!==focusCell){focusCell=cell;plan(fx,fz);dirty=true;}
      const t0=performance.now();let made=0;
      const ctx=queue.length?geoContext():null;
      while(queue.length&&performance.now()-t0<budgetMs*(detail>=2?.6:1)){
        const [x,z]=queue.shift()!,key=x+':'+z;if(cache.has(key)&&!cache.get(key)!.stale)continue;
        const c=generateDressingCell(ctx!,seed,x,z,insideWorld);cache.set(key,{...c,used:++clock});stats.maxCellMs=Math.max(stats.maxCellMs,c.ms);stats.generatedMs+=c.ms;made++;
      }
      stats.pending=queue.length;if(made){dirty=true;evict();}
      const now=performance.now();if(dirty&&(now-lastRebuild>250||!queue.length)){dirty=false;lastRebuild=now;rebuild(fx,fz);}
    },
    /** Mark cells around an authored change (relief, masks, zones) stale: they stay drawn
     * until regenerated in priority (no popping hole). */
    refresh(x:number,z:number,radius:number){
      let dropped=0;for(const c of cache.values())if(cellDistance(c.cx,c.cz,x,z)<=radius){c.stale=true;dropped++;}
      if(dropped){focusCell='';dirty=true;}
    },
    dispose(){
      if(retired)return;retired=true;cache.clear();root.removeFromParent();
      for(const f of FAMILIES){meshes[f].dispose();geometries[f].dispose();materials[f].dispose();}
    },
  };
}
export type DressingView=ReturnType<typeof createDressingView>;
