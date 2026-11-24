/** Grass tufts (doc 18): short and tall grass as a purely visual, LOW-RESOURCE local layer.
 * - Layer 1 (ground colour) is the terrain itself: nothing here.
 * - Layer 2: tufts of 3 crossed blades (3 triangles), ONE InstancedMesh for every tuft around the
 *   focus (1 draw call), opaque, no shadow cast or received.
 * - Layer 3: wind sway and bending around the player in the VERTEX SHADER only (uniforms): no
 *   per-tuft CPU animation, no matrix update per frame, no physics.
 * Tufts are generated per 16 m cell from seed + cell + the Geography classification (grass share
 * of the habitat, biome colour), sampled on a 4 m grid: deterministic, no per-tuft id in any source.
 * The instance buffer is rewritten only when the set of cells changes; tufts shrink to nothing at
 * the edge of the radius (no visible border, no fog). Profiles follow the shared budget level
 * (doc 22): dense / balanced / ultra-economy / groundOnly (off). Never touches gameplay. */
import * as THREE from 'three';
import {SlotAllocator} from './slot-allocator.ts';

import {GRASS_CELL_M,generateGrassCell,type GrassSample,type GrassCellData} from './grass-cell.ts';
import type {GeoTask,GeoWorkerPool} from '../geography/geo-workers.ts';
export {GRASS_CELL_M,type GrassSample};
/** Profiles (benchmark knobs, doc 18 §profiles): radius (m), tufts per m² at full grass share. */
export const GRASS_PROFILES = {
  dense: { radius: 42, density: 2.6 },
  balanced: { radius: 32, density: 1.9 },
  ultra: { radius: 20, density: 1.1 },
  groundOnly: { radius: 0, density: 0 },
} as const;
export type GrassProfile = keyof typeof GRASS_PROFILES;
/** Budget level (0 full … 3 lowest) → profile; `economy` quality starts one step lower. */
export function grassProfileFor(level: number, economy = false): GrassProfile {
  const l = Math.max(0, Math.min(3, Math.round(level) + (economy ? 1 : 0)));
  return (['dense', 'balanced', 'ultra', 'groundOnly'] as const)[l];
}
/** What the grass needs to know about a point: grass share 0…1, tall-grass share 0…1, colour. */
export interface GrassView {position:{x:number;y:number;z:number};fov:number;height:number}
export interface GrassActor {x:number;y:number;z:number}
export interface GrassStats { visibleScale:number;actors:number;generatedMs:number;updateMs:number;bytes:number;uploadedBytes:number;uploads:number;generatedCells:number; profile: GrassProfile; cells: number; tufts: number; triangles: number; calls: number; buildMs: number; pending: number }

/** Deterministic hash → [0, 1). */
/** One tuft: 3 blades (1 triangle each) at 0°, 60°, 120°, base on the ground, tip at y = 1.
 * Normals point up (soft, even lighting of thin blades); colour darker at the root. */
export function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, c = Math.cos(a), s = Math.sin(a), w = .07, lean = (k - 1) * .12;
    pos.push(-c * w, 0, -s * w, c * w, 0, s * w, -s * lean, 1, c * lean);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    col.push(.62, .66, .55, .62, .66, .55, 1.08, 1.06, .96);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
/** A generated cell: instance matrices (16 floats per tuft, column-major) and colours (3), ready to
 * copy into the shared buffers (a rebuild is a few typed-array copies, no per-tuft maths). */
/** `profile`: density it was generated for; a cell of another profile stays drawn until regenerated. */
interface Cell { cx: number; cz: number; count: number; matrices: Float32Array; colors: Float32Array; profile?: GrassProfile; d?: number }

export function createGrass(parent: THREE.Object3D, seed: number, sampler: (x: number, z: number) => GrassSample | null, height: (x: number, z: number) => number, capacity = 24000, exactPlacement = false,
  /** OPT-4 (doc 82 step 7): the generated-world sampler (biomes.generatedGrass + terrainHeight,
   * exact placement) runs in the geography workers; without ?opt4=1 (default) or unavailable: main thread. */
  workers: GeoWorkerPool | null = null) {
  const geometry = tuftGeometry();
  const uniforms = { uTime: { value: 0 }, uWind: { value: .35 }, uFocus: { value: new THREE.Vector3() }, uRadius: { value: 1 }, uActors: { value: [new THREE.Vector3(1e6,1e6,1e6),new THREE.Vector3(1e6,1e6,1e6)] }, uActorCount:{value:0}, uVisibility:{value:1} };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'uniform float uTime; uniform float uWind; uniform vec3 uFocus; uniform float uRadius; uniform vec3 uActors[2]; uniform int uActorCount; uniform float uVisibility;\n' + shader.vertexShader.replace('#include <project_vertex>', `
      vec4 mvPosition = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        mvPosition = instanceMatrix * mvPosition;
      #endif
      vec3 rootW = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
      float hf = clamp( position.y, 0.0, 1.0 ); hf *= hf;
      // Wind: slow gusts travelling across the field (world-stable phase).
      float gust = sin( uTime * 1.7 + rootW.x * .21 + rootW.z * .17 ) + .5 * sin( uTime * 3.1 + rootW.x * .53 - rootW.z * .37 );
      mvPosition.xz += vec2( .8, .45 ) * gust * uWind * .22 * hf;
      // At most two nearby actors, including vertical separation (no bend under a glider).
      for(int i=0;i<2;i++) {
        if(i>=uActorCount)break;
        vec2 away=rootW.xz-uActors[i].xz; float d=length(away);
        float push=(1.0-smoothstep(.3,1.3,d))*hf*(1.0-smoothstep(.8,1.8,abs(rootW.y-uActors[i].y)));
        mvPosition.xz+=(d>1e-3?away/d:vec2(0.0))*push*.55;
        mvPosition.y-=push*.45*(mvPosition.y-rootW.y);
      }
      // Edge of the grass radius: tufts shrink to their root (no visible border).
      float k = 1.0 - smoothstep( uRadius * .72, uRadius, distance( rootW.xz, uFocus.xz ) );
      mvPosition.xyz = rootW + ( mvPosition.xyz - rootW ) * k * uVisibility;
      mvPosition = modelViewMatrix * mvPosition;
      gl_Position = projectionMatrix * mvPosition;`);
    // Thin double-sided blades: both faces lit with the upward normal (no dark back faces).
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
  };
  material.customProgramCacheKey = () => 'little-world-grass-v3';
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = 'Grass'; mesh.count = 0; mesh.frustumCulled = false; mesh.castShadow = mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  parent.add(mesh);
  const cells = new Map<string, Cell>(), order: Cell[] = [];
  let active=true,sinceUpload=1;
  let profile: GrassProfile = 'balanced', queue: [number, number][] = [], focusKey = '', dirty = false, disposed = false;
  const stats: GrassStats = { visibleScale:1,actors:0,generatedMs:0,updateMs:0,bytes:capacity*19*4,uploadedBytes:0,uploads:0,generatedCells:0, profile, cells: 0, tufts: 0, triangles: 0, calls: 0, buildMs: 0, pending: 0 };
  const radius = () => GRASS_PROFILES[profile].radius;
  function generate(cx: number, cz: number): Cell {
    return { ...generateGrassCell(seed, cx, cz, GRASS_PROFILES[profile].density, sampler, height, exactPlacement), profile };
  }
  const inFlight = new Map<string, GeoTask<GrassCellData>>();
  let wantedKeys = new Set<string>();
  // Opt-in only (?opt4=1), see ecology.ts: default = historical main-thread generation.
  const optIn = typeof location !== 'undefined' && new URLSearchParams(location.search).get('opt4') === '1';
  const remote = () => optIn && !!workers?.available;
  /** Content first (OPT-4): the main-thread path keeps generating the head of the queue exactly as
   * before; workers prefetch the following queued cells at low priority (only when idle, after
   * terrain and dressing). A prefetched cell is used as soon as it arrives (removed from the queue). */
  function prefetch() {
    for (let i = 0; i < queue.length && inFlight.size < 4; i++) {
      const [x, z] = queue[i], key = x + ':' + z;
      if (inFlight.has(key)) continue;
      const prof = profile, task = workers!.run<GrassCellData>({ kind: 'grass', seed, cx: x, cz: z, density: GRASS_PROFILES[prof].density }, 6600 + i);
      inFlight.set(key, task);
      task.promise.then(({ result, stale, ms }) => {
        if (disposed || inFlight.get(key) !== task) return;
        inFlight.delete(key);
        // Stale (relief changed), profile changed, no longer wanted or already generated here: dropped.
        if (stale || prof !== profile || !wantedKeys.has(key) || cells.get(key)?.profile === prof) return;
        cells.set(key, { ...result, profile: prof }); stats.generatedMs += ms; stats.generatedCells++; dirty = true;
        const at = queue.findIndex(([qx, qz]) => qx === result.cx && qz === result.cz); if (at >= 0) queue.splice(at, 1);
      }, () => { if (inFlight.get(key) === task) inFlight.delete(key); });
    }
  }
  function plan(fx: number, fz: number) {
    const r = radius(), cx = Math.floor(fx / GRASS_CELL_M), cz = Math.floor(fz / GRASS_CELL_M), n = Math.ceil(r / GRASS_CELL_M), need: [number, number, number][] = [], wanted = new Set<string>();
    if (r > 0) for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
      const x = cx + dx, z = cz + dz, ex = Math.max(x * GRASS_CELL_M - fx, 0, fx - (x + 1) * GRASS_CELL_M), ez = Math.max(z * GRASS_CELL_M - fz, 0, fz - (z + 1) * GRASS_CELL_M), d = Math.hypot(ex, ez);
      if (d > r) continue; const key = x + ':' + z; wanted.add(key); const cell = cells.get(key); if (!cell || cell.profile !== profile) need.push([x, z, d]);
    }
    for (const key of [...cells.keys()]) if (!wanted.has(key)) { cells.delete(key); dirty = true; }
    for (const [key, task] of inFlight) if (!wanted.has(key)) { task.cancel(); inFlight.delete(key); }
    wantedKeys = wanted;
    queue = need.sort((a, b) => a[2] - b[2]).map(([x, z]) => [x, z]);
  }
  // Stable slots (doc 82 step 6): a cell keeps its instance range while it stays drawn, so a
  // rebuild writes and uploads only the cells that appear or disappear. `?grassUpload=full`
  // restores the historical full rewrite (A/B).
  const fullUpload=typeof location!=='undefined'&&new URLSearchParams(location.search).get('grassUpload')==='full';
  const allocator=new SlotAllocator(capacity),slots=new Map<Cell,{start:number;count:number}>(),wanted=new Map<Cell,number>();
  const matrixDirty:number[]=[],colorDirty:number[]=[];
  const matrices=mesh.instanceMatrix.array as Float32Array,colors=mesh.instanceColor!.array as Float32Array;
  function upload(){
    mesh.count=allocator.end;mesh.visible=allocator.end>0;
    let bytes=0;
    if(matrixDirty.length){mesh.instanceMatrix.clearUpdateRanges();for(let i=0;i<matrixDirty.length;i+=2){mesh.instanceMatrix.addUpdateRange(matrixDirty[i]*16,matrixDirty[i+1]*16);bytes+=matrixDirty[i+1]*64;}mesh.instanceMatrix.needsUpdate=true;}
    if(colorDirty.length){mesh.instanceColor!.clearUpdateRanges();for(let i=0;i<colorDirty.length;i+=2){mesh.instanceColor!.addUpdateRange(colorDirty[i]*3,colorDirty[i+1]*3);bytes+=colorDirty[i+1]*12;}mesh.instanceColor!.needsUpdate=true;}
    if(bytes){stats.uploads++;stats.uploadedBytes+=bytes;}
    matrixDirty.length=colorDirty.length=0;
  }
  function place(c:Cell,start:number,k:number){
    matrices.set(k===c.count?c.matrices:c.matrices.subarray(0,k*16),start*16);colors.set(k===c.count?c.colors:c.colors.subarray(0,k*3),start*3);
    slots.set(c,{start,count:k});matrixDirty.push(start,k);colorDirty.push(start,k);
  }
  /** Contiguous nearest-first layout from scratch (first fill, fragmentation, A/B flag). */
  function compact(){
    allocator.reset();slots.clear();matrixDirty.length=colorDirty.length=0;
    for(const [c,k] of wanted)place(c,allocator.allocate(k),k);
    matrixDirty.length=colorDirty.length=0;
    if(allocator.end){matrixDirty.push(0,allocator.end);colorDirty.push(0,allocator.end);}
    upload();
  }
  /** Moves the cell drawn last into an earlier hole while one fits: the drawn range stays tight
   * (empty slots still cost vertex work) and only the moved cells are uploaded. */
  function packTail(){
    while(allocator.holes>0){
      let tail:Cell|null=null,slot:{start:number;count:number}|null=null;
      for(const [c,s] of slots)if(!slot||s.start>slot.start){tail=c;slot=s;}
      if(!tail||!slot)return;
      const start=allocator.allocate(slot.count);
      if(start<0)return;
      if(start>slot.start){allocator.release(start,slot.count);return;}
      const old=slot.start;matrices.copyWithin(start*16,old*16,(old+slot.count)*16);colors.copyWithin(start*3,old*3,(old+slot.count)*3);
      matrixDirty.push(start,slot.count);colorDirty.push(start,slot.count);allocator.release(old,slot.count);slot.start=start;
    }
  }
  function rebuild() {
    // Nearest cells first (capacity); distances computed once, list reused (no per-rebuild garbage).
    const fx=uniforms.uFocus.value.x,fz=uniforms.uFocus.value.z;order.length=0;
    // Hidden layer (sub-pixel tufts at altitude): nothing drawn or uploaded, cells kept.
    if(active)for(const c of cells.values()){c.d=Math.hypot((c.cx+.5)*GRASS_CELL_M-fx,(c.cz+.5)*GRASS_CELL_M-fz);order.push(c);}
    order.sort((a,b)=>a.d!-b.d!);
    wanted.clear();let n=0;
    for (const c of order) { const k = Math.min(c.count, capacity - n); if (k <= 0) break; wanted.set(c,k); n += k; }
    if(fullUpload||!active||!slots.size)compact();
    else{
      // Cells leaving (or truncated differently): zero-scaled so their slots draw nothing.
      for(const [c,slot] of slots)if(wanted.get(c)!==slot.count){matrices.fill(0,slot.start*16,(slot.start+slot.count)*16);matrixDirty.push(slot.start,slot.count);allocator.release(slot.start,slot.count);slots.delete(c);}
      let fits=true;
      for(const [c,k] of wanted)if(!slots.has(c)){const start=allocator.allocate(k);if(start<0){fits=false;break;}place(c,start,k);}
      if(fits)packTail();
      // Too fragmented (no hole fits, or a quarter of the drawn range is empty): lay out again.
      if(!fits||allocator.holes>capacity*.25)compact();else upload();
    }
    let cellBytes=0;for(const c of order)cellBytes+=c.matrices.byteLength+c.colors.byteLength;stats.bytes=capacity*19*4+cellBytes;
    stats.tufts = n; stats.triangles = n * 3; stats.calls = n ? 1 : 0; stats.cells = cells.size;
  }
  return {
    stats, mesh,
    /** Profile change (adaptive budget): cells are regenerated in place, nearest first, while
     * the current ones stay drawn — the grass never vanishes and regrows from the centre. */
    setProfile(next: GrassProfile) { if (next === profile) return; profile = next; stats.profile = next; if(next==='groundOnly')uniforms.uVisibility.value=0;queue=[]; focusKey = ''; dirty = true; },
    setWind(strength: number) { uniforms.uWind.value = Math.max(0, Math.min(1.5, strength)); },
    /** Per frame: uniforms (time, focus, player) + a time-budgeted generation of missing cells. */
    update(dt: number, focus: { x: number; y?: number; z: number }, budgetMs = 1, view?:GrassView, actors:readonly GrassActor[] = []) {
      if (disposed) return;
      sinceUpload+=Math.max(0,dt);
      uniforms.uTime.value += dt; uniforms.uFocus.value.set(focus.x, focus.y ?? 0, focus.z); uniforms.uRadius.value = Math.max(1, radius());
      const begin=performance.now();
      if(profile==='groundOnly'){
        if(dirty){dirty=false;rebuild();}stats.pending=stats.actors=stats.visibleScale=0;
        stats.updateMs=performance.now()-begin;return;
      }
      const cameraGround=view?height(view.position.x,view.position.z):0;
      const cameraNear=view&&view.position.y-cameraGround<12&&Math.hypot(view.position.x-focus.x,view.position.z-focus.z)>radius()*.5;
      const center=cameraNear?view.position:focus;
      uniforms.uFocus.value.set(center.x,0,center.z);
      // Projected size of a 0.35 m tuft at the nearest visible ground. No per-tuft view work.
      const ground=height(center.x,center.z),distance=view?Math.hypot(view.position.x-center.x,Math.max(0,view.position.y-ground),view.position.z-center.z):0;
      const pixels=view?.height? .35*view.height/(2*Math.tan(view.fov*Math.PI/360)*Math.max(1,distance)):4;
      const target=Math.max(0,Math.min(1,(pixels-.6)/1.2));
      const previous=uniforms.uVisibility.value;
      const scale=previous+(target-previous)*Math.min(1,Math.max(0,dt)*6);
      stats.visibleScale=uniforms.uVisibility.value=Math.abs(scale-target)<.005?target:scale;
      const enabled=target>0||uniforms.uVisibility.value>.005;
      // Hidden when too small on screen (flight): keep the cells, so landing shows them at once.
      if(enabled!==active){active=enabled;queue=[];focusKey='';dirty=true;}
      stats.actors=0;
      const actorLimit=profile==='ultra'?1:2;
      const playerY=focus.y??height(focus.x,focus.z);
      if(Math.hypot(focus.x-center.x,focus.z-center.z)<radius()+2&&Math.abs(playerY-height(focus.x,focus.z))<1.8)
        uniforms.uActors.value[stats.actors++].set(focus.x,playerY,focus.z);
      // Fixed nearest candidate: no allocation/sort or per-tuft JS animation each frame.
      let nearest:GrassActor|undefined,nearestD=radius()+2;
      if(stats.actors<actorLimit)for(const actor of actors){
        const d=Math.hypot(actor.x-center.x,actor.y-ground,actor.z-center.z);
        if(d<nearestD){nearestD=d;nearest=actor;}
      }
      if(nearest)uniforms.uActors.value[stats.actors++].set(nearest.x,nearest.y,nearest.z);
      uniforms.uActorCount.value=stats.actors;
      const key = Math.floor(center.x / 4) + ':' + Math.floor(center.z / 4);
      if(target===0){queue=[];focusKey='';}
      if (active&&target>0&&key !== focusKey) { focusKey = key; plan(center.x, center.z); }
      const t0 = performance.now();
      let generated=0;
      while (queue.length && generated<2 && performance.now() - t0 < budgetMs) { const [x, z] = queue.shift()!; inFlight.get(x + ':' + z)?.cancel(); inFlight.delete(x + ':' + z); const start=performance.now();cells.set(x + ':' + z, generate(x, z));stats.generatedMs+=performance.now()-start;stats.generatedCells++;generated++; dirty = true; }
      if (remote()) prefetch();
      stats.pending = queue.length;
      if (dirty&&(!stats.pending||mesh.count===0||sinceUpload>=.1)) { sinceUpload=0;dirty = false; const t1 = performance.now(); rebuild(); stats.buildMs = performance.now() - t1; }
      stats.updateMs=performance.now()-begin;
    },
    /** Authored change (relief, biotopes): regenerate the cells around it. */
    refresh(x: number, z: number, r: number) { for (const t of inFlight.values()) t.cancel(); inFlight.clear(); for (const c of [...cells.values()]) if (Math.hypot((c.cx + .5) * GRASS_CELL_M - x, (c.cz + .5) * GRASS_CELL_M - z) < r + GRASS_CELL_M) cells.delete(c.cx + ':' + c.cz); focusKey = ''; dirty = true; },
    dispose() { if (disposed) return; disposed = true; for (const t of inFlight.values()) t.cancel(); inFlight.clear(); mesh.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); cells.clear(); },
  };
}
export type Grass = ReturnType<typeof createGrass>;
