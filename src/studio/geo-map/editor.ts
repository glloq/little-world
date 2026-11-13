/** G2 — Layered 2D map editor of Little World Studio (the "Carte globale" module).
 * Same project, history, selection and sources as the 3D view: every stroke/fill/restoration
 * is one StudioSession transaction, so Ctrl+Z, autosave and the 3D viewport follow.
 * Rendering: per-pixel Geography Engine samples in 64 px tiles, coarse level first, bounded
 * LRU cache, local invalidation from transaction sectors; vectors drawn as overlays. */
import {node,button,field} from '../dom.ts';
import type {StudioSession} from '../session.ts';
import {projectGeography,projectGeographyInput,type ProjectGeography} from '../../studio-core/geo-context.ts';
import {geoWorkerPool,type GeoTask} from '../../geography/geo-workers.ts';
import {paintMask,regionCells,regionCorrections,restoreGeneration,regionChunkIds,sectorGrid,terrainChangeRects,type Region} from '../../studio-core/geo-edits.ts';
import {affectedChunkIds} from '../../studio-core/schema.ts';
import {elementData,type ElementRef} from '../../studio-core/elements.ts';
import {putTerrainEdit} from '../../studio-core/source.ts';
import {classifyPoint} from '../../geography/classify.ts';
import {LAYERS,CATEGORY_LAYERS,MOISTURE_CODES,MASK_GRID,cellCenter,type LayerId,type MaskLayerId} from '../../geography/layers.ts';
import {TILE_PX,levelMpp,sampleTile,type SampleTile,ALTITUDE_RAMP,SLOPE_RAMP,MOISTURE_RAMP} from './raster.ts';
import {TileCache} from './tile-cache.ts';
import {createShapeTool} from './shapes.ts';

export type MapToolId='select'|'pan'|'shape'|'paint'|'erase'|'polygon'|'raise'|'lower'|'smooth'|'flatten';
interface LayerState {id:LayerId;visible:boolean;opacity:number;locked:boolean}
const MASKS=new Set<LayerId>(['geology','moisture','biome','material','occupation']);
const RELIEF=new Set<LayerId>(['altitude','landsea']);
const TOOL_INFO:Record<MapToolId,[string,string]>={
  select:['Viser','Clic : choisir l’élément proche et viser ce lieu en 3D'],pan:['Déplacer','Glisser pour déplacer la carte'],
  paint:['Pinceau','Peint la valeur choisie (un trait = une opération annulable)'],erase:['Gomme','Rétablit la valeur générée sous le pinceau'],
  polygon:['Polygone','Clics : sommets · double-clic / Entrée : fermer · Retour arrière : retirer'],
  shape:['Formes','Contours d’îles, volcans, massifs, collines, cuvettes, plateaux, crêtes et vallées'],
  raise:['Monter','Élève le relief'],lower:['Creuser','Abaisse le relief'],smooth:['Lisser','Adoucit les bosses'],flatten:['Aplanir','Aplanit à la hauteur du premier point'],
};
export function toolsFor(layer:LayerId):MapToolId[]{
  if(MASKS.has(layer))return ['select','pan','paint','erase','polygon'];
  if(RELIEF.has(layer))return ['select','pan','shape','raise','lower','smooth','flatten','polygon'];
  return ['select','pan'];
}
const PREFS='little-world.map-layers.v1';
function loadPrefs():{layers:LayerState[];active:LayerId}|null{try{const v=JSON.parse(localStorage.getItem(PREFS)??'null');if(v&&Array.isArray(v.layers)&&v.layers.length===LAYERS.length&&LAYERS.every(l=>v.layers.some((s:LayerState)=>s.id===l.id)))return v;}catch{/* per-viewer convenience only */}return null;}
function savePrefs(v:{layers:LayerState[];active:LayerId}){try{localStorage.setItem(PREFS,JSON.stringify(v));}catch{/* ignore */}}
const hex=(c:number)=>'#'+c.toString(16).padStart(6,'0');
const gradient=(stops:[number,number][])=>`linear-gradient(90deg,${stops.map(([,c],i)=>hex(c)+' '+Math.round(i/(stops.length-1)*100)+'%').join(',')})`;

/** Tiles and geography survive 2D/3D switches while the project stays open (bounded LRU);
 * edits made from any view keep invalidating them locally even while the map is hidden. */
interface SharedMap {session:StudioSession;cache:TileCache;geo:ProjectGeography|null;stop:()=>void}
/** Geography sources changed: drop the main-thread context and the workers' project. */
function invalidateGeo(state:SharedMap){state.geo=null;geoWorkerPool()?.invalidateProject();}
let shared:SharedMap|null=null;
function sharedFor(session:StudioSession):SharedMap{
  if(shared?.session===session)return shared;releaseGeoMap();
  const p=session.document,grid=sectorGrid(p),state:SharedMap={session,cache:new TileCache(),geo:null,stop:()=>{}};
  state.stop=session.commands.subscribe(t=>{
    invalidateGeo(state);
    // Terrain edits reach up to their radius (≤ 80 m) past the owner sector; moisture reads rivers 60 m away.
    const relief=terrainChangeRects(t.patches);
    if(relief.global||t.patches.some(q=>q.path[0]==='libraries'||q.path[0]==='world'&&q.path[1]!=='terrain'))state.cache.invalidate(null);
    else for(const r of relief.rects)state.cache.invalidate({minX:r.minX-8,maxX:r.maxX+8,minZ:r.minZ-8,maxZ:r.maxZ+8});
    for(const id of t.affectedChunks){const [x,z]=id.split(':').map(Number),s=grid.chunkSizeM,pad=96;state.cache.invalidate({minX:grid.minX+x*s-pad,maxX:grid.minX+(x+1)*s+pad,minZ:grid.minZ+z*s-pad,maxZ:grid.minZ+(z+1)*s+pad});}
  });
  return shared=state;
}
/** Free the map caches (project closed). */
export function releaseGeoMap(){if(shared){shared.stop();shared.cache.clear();shared=null;}}
export interface GeoMapOptions {onPick(x:number,z:number,tolerance?:number):void;status(message:string,error?:boolean):void;open3D():void}
export function mountGeoMap(host:HTMLElement,tools:HTMLElement,session:StudioSession,options:GeoMapOptions){
  const p=session.document,b=p.world.bounds,grid=sectorGrid(p);
  const wrap=node('div','','map-wrap'),canvas=node('canvas'),note=node('div','','map-note'),readout=node('div','','map-readout');wrap.append(canvas,note,readout);host.replaceChildren(wrap);
  canvas.dataset.mapPending='1';canvas.tabIndex=0;canvas.setAttribute('aria-label','Carte 2D par couches');
  const g2=canvas.getContext('2d')!;
  // ---- view state
  const saved=loadPrefs();
  const state={layers:saved?.layers??LAYERS.map(l=>({id:l.id,visible:l.id==='altitude'||l.id==='biome',opacity:l.id==='biome'?.6:1,locked:false})),active:saved?.active??'biome' as LayerId,
    tool:'select' as MapToolId,radius:16,strength:2,code:{geology:'r',moisture:'9',biome:'f',material:'s',occupation:'p'} as Record<MaskLayerId,string>,overlays:true,grid:false};
  let scale=1,cx=session.selection.state.camera.target?.x??session.selection.state.camera.x??0,cz=session.selection.state.camera.target?.z??session.selection.state.camera.z??0;
  const base=()=>Math.min(canvas.width/(b.maxX-b.minX+50),canvas.height/(b.maxZ-b.minZ+50))*scale;
  const toScreen=(x:number,z:number)=>({x:canvas.width/2+(x-cx)*base(),y:canvas.height/2+(z-cz)*base()});
  const toWorld=(x:number,y:number)=>({x:cx+(x-canvas.width/2)/base(),z:cz+(y-canvas.height/2)/base()});
  // ---- geography (rebuilt lazily after edits/hydration)
  const mem=sharedFor(session),cache=mem.cache;const geography=()=>mem.geo??=projectGeography(p);let queue:{level:number;tx:number;tz:number}[]=[],raf=0,sampleMs=0,samples=0;
  const levelFor=()=>Math.max(0,Math.min(7,Math.ceil(Math.log2(1/base()))));
  const tilesAcross=(level:number)=>({nx:Math.ceil((b.maxX-b.minX)/(TILE_PX*levelMpp(level))),nz:Math.ceil((b.maxZ-b.minZ)/(TILE_PX*levelMpp(level)))});
  function visibleTiles(level:number){
    const span=TILE_PX*levelMpp(level),lo=toWorld(0,0),hi=toWorld(canvas.width,canvas.height),{nx,nz}=tilesAcross(level),out:{level:number;tx:number;tz:number}[]=[];
    const tx0=Math.max(0,Math.floor((lo.x-b.minX)/span)),tx1=Math.min(nx-1,Math.floor((hi.x-b.minX)/span)),tz0=Math.max(0,Math.floor((lo.z-b.minZ)/span)),tz1=Math.min(nz-1,Math.floor((hi.z-b.minZ)/span));
    for(let tz=tz0;tz<=tz1;tz++)for(let tx=tx0;tx<=tx1;tx++)out.push({level,tx,tz});return out;
  }
  function plan(){
    const level=levelFor(),coarse=Math.min(7,level+2),centre=toWorld(canvas.width/2,canvas.height/2);
    const need=[...visibleTiles(coarse),...(coarse!==level?visibleTiles(level):[])].filter(t=>{const e=cache.get(t.level,t.tx,t.tz);return !e||e.stale;});
    const dist=(t:{level:number;tx:number;tz:number})=>{const span=TILE_PX*levelMpp(t.level);return Math.hypot(b.minX+(t.tx+.5)*span-centre.x,b.minZ+(t.tz+.5)*span-centre.z);};
    queue=need.sort((a,c)=>c.level-a.level||dist(a)-dist(c));canvas.dataset.mapPending=String(queue.length+(pool?inFlight.size:0));
    if(queue.length&&!raf)raf=requestAnimationFrame(work);
  }
  const pool=geoWorkerPool(),inFlight=new Map<string,GeoTask<SampleTile>>();
  /** Off-thread sampling (same engine, same pixels); the project inputs are sent lazily. */
  function dispatch(){
    if(pool!.projectRev===0||!projectSent()){pool!.setProject(projectGeographyInput(p));sentRev=pool!.projectRev;}
    for(let i=0;i<queue.length&&inFlight.size<4;i++){
      const t=queue[i],k=TileCache.key(t.level,t.tx,t.tz);if(inFlight.has(k))continue;
      const task=pool!.run<SampleTile>({kind:'map',bounds:{minX:b.minX,minZ:b.minZ},level:t.level,tx:t.tx,tz:t.tz},3000+i);inFlight.set(k,task);
      task.promise.then(({result,stale,ms})=>{
        if(inFlight.get(k)!==task)return;inFlight.delete(k);if(disposed)return;
        if(!stale){cache.put(result);sampleMs+=ms;samples++;}
        redrawSoon();
      },()=>{if(inFlight.get(k)===task)inFlight.delete(k);if(!disposed)redrawSoon();});
    }
    queue=queue.filter(t=>!inFlight.has(TileCache.key(t.level,t.tx,t.tz)));
    canvas.dataset.mapPending=String(queue.length+inFlight.size);
  }
  /** Results arriving in bursts are merged into one redraw per animation frame. */
  let redrawFrame=0;const redrawSoon=()=>{if(!redrawFrame)redrawFrame=requestAnimationFrame(()=>{redrawFrame=0;if(!disposed)draw();});};
  let sentRev=0,disposed=false;const projectSent=()=>sentRev===pool!.projectRev;
  function work(){
    raf=0;if(pool?.available){dispatch();return;}
    const t0=performance.now(),g=geography();let did=0;
    while(queue.length&&performance.now()-t0<10){const t=queue.shift()!,s0=performance.now();cache.put(sampleTile(g.ctx,b,t.level,t.tx,t.tz));sampleMs+=performance.now()-s0;samples++;did++;}
    canvas.dataset.mapPending=String(queue.length);if(did)draw(false);if(queue.length)raf=requestAnimationFrame(work);
  }
  // ---- hydration of the displayed sectors (corrections, edits, buildings live in sectors)
  let hydrating=false;
  function hydrateVisible(){
    if(hydrating)return;const lo=toWorld(0,0),hi=toWorld(canvas.width,canvas.height),s=grid.chunkSizeM,ids:string[]=[];
    for(let z=Math.max(0,Math.floor((lo.z-grid.minZ)/s));z<=Math.min(grid.rows-1,Math.floor((hi.z-grid.minZ)/s));z++)for(let x=Math.max(0,Math.floor((lo.x-grid.minX)/s));x<=Math.min(grid.columns-1,Math.floor((hi.x-grid.minX)/s));x++){const id=x+':'+z;if(p.chunkIndex[id]&&!p.chunks[id])ids.push(id);}
    if(!ids.length)return;if(ids.length>600){note.textContent='Zoomer pour charger les corrections de ce secteur ('+ids.length+' secteurs).';return;}
    hydrating=true;void session.hydrate(ids).then(()=>{invalidateGeo(mem);for(const id of ids)invalidateChunk(id,8);draw();}).catch(e=>options.status(String(e),true)).finally(()=>{hydrating=false;});
  }
  function chunkRect(id:string,pad:number){const [x,z]=id.split(':').map(Number),s=grid.chunkSizeM;return {minX:grid.minX+x*s-pad,maxX:grid.minX+(x+1)*s+pad,minZ:grid.minZ+z*s-pad,maxZ:grid.minZ+(z+1)*s+pad};}
  function invalidateChunk(id:string,pad:number){cache.invalidate(chunkRect(id,pad));}
  // ---- transactions from any editor (2D, 3D, inspector, undo/redo)
  // Invalidation itself is done by the shared subscription (also while the map is hidden).
  const onTransaction=()=>draw();
  // ---- drawing
  function draw(replan=true){
    const r=wrap.getBoundingClientRect();if(canvas.width!==Math.max(1,Math.round(r.width))||canvas.height!==Math.max(1,Math.round(r.height))){canvas.width=Math.max(1,Math.round(r.width));canvas.height=Math.max(1,Math.round(r.height));}
    g2.fillStyle='#dfe8e4';g2.fillRect(0,0,canvas.width,canvas.height);
    const level=levelFor(),sea=p.world.seaLevel;g2.imageSmoothingEnabled=level>0;
    for(const layer of state.layers){
      if(!layer.visible)continue;g2.globalAlpha=layer.opacity;
      for(const t of visibleTiles(level)){
        const span=TILE_PX*levelMpp(level),a=toScreen(b.minX+t.tx*span,b.minZ+t.tz*span),size=span*base();
        let entry=cache.get(level,t.tx,t.tz),k=0;
        // Progressive detail: coarser cached tiles stand in until the exact level is sampled.
        while((!entry)&&k<3&&level+k<7){k++;entry=cache.get(level+k,t.tx>>k,t.tz>>k);}
        if(!entry)continue;const img=cache.image(entry,layer.id,sea);
        if(k===0)g2.drawImage(img,a.x,a.y,size+.5,size+.5);
        else{const part=TILE_PX>>k,sx=(t.tx-((t.tx>>k)<<k))*part,sz=(t.tz-((t.tz>>k)<<k))*part;g2.drawImage(img,sx,sz,part,part,a.x,a.y,size+.5,size+.5);}
      }
    }
    g2.globalAlpha=1;
    const a=toScreen(b.minX,b.minZ),c=toScreen(b.maxX,b.maxZ);g2.strokeStyle='#5f7a68';g2.lineWidth=1;g2.strokeRect(a.x,a.y,c.x-a.x,c.y-a.y);
    if(state.grid&&grid.chunkSizeM*base()>10){g2.strokeStyle='#ffffff55';g2.beginPath();for(let x=0;x<=grid.columns;x++){const q=toScreen(grid.minX+x*grid.chunkSizeM,0);g2.moveTo(q.x,a.y);g2.lineTo(q.x,c.y);}for(let z=0;z<=grid.rows;z++){const q=toScreen(0,grid.minZ+z*grid.chunkSizeM);g2.moveTo(a.x,q.y);g2.lineTo(c.x,q.y);}g2.stroke();}
    if(state.overlays)drawVectors();
    if(state.tool==='shape')shapes.draw(g2);
    drawToolPreview();
    const lvl=levelMpp(level);note.textContent=`${LAYERS.find(l=>l.id===state.active)!.label} · ${TOOL_INFO[state.tool][0]} · ${lvl} m/px · ${cache.size} tuiles (${(cache.bytes/1048576).toFixed(1)} Mio)${queue.length?' · calcul '+queue.length:''}${samples?` · ${(sampleMs/samples).toFixed(1)} ms/tuile`:''}`;
    if(replan){plan();hydrateVisible();}
  }
  function drawVectors(){
    const lib=p.libraries;
    for(const zone of Object.values(lib.zones??{})){g2.beginPath();zone.polygon.forEach((v,i)=>{const q=toScreen(v.x,v.z);if(i)g2.lineTo(q.x,q.y);else g2.moveTo(q.x,q.y);});g2.closePath();g2.fillStyle=zone.kind==='farm-plot'?'#e5b83c33':'#9b59b633';g2.fill();g2.strokeStyle=zone.kind==='farm-plot'?'#b88a1c':'#7d3c98';g2.lineWidth=1.5;g2.stroke();}
    const PATH_COLOURS:Record<string,string>={trail:'#a08a5c',dirt:'#8a6a45',stone:'#7d7d78',wood:'#9a6b3c'};
    const strokeLine=(pts:{x:number;z:number}[],colour:string,width:number)=>{g2.strokeStyle=colour;g2.lineWidth=width;g2.beginPath();pts.forEach((v,i)=>{const q=toScreen(v.x,v.z);if(i)g2.lineTo(q.x,q.y);else g2.moveTo(q.x,q.y);});g2.stroke();};
    for(const water of Object.values(lib.water))strokeLine(water.points,'#2f7fb8',Math.max(1.5,water.width*base()));
    for(const path of Object.values(lib.paths))strokeLine(path.points,PATH_COLOURS[path.kind??'dirt'],Math.max(1.5,path.width*base()));
    // E7 — selected lines, zones and retouches are outlined (entities: dots below).
    for(const ref of session.selection.selection){
      const d=elementData(p,ref as ElementRef);if(!d||ref.kind==='entity')continue;g2.save();g2.setLineDash([6,4]);
      if('points' in d)strokeLine(d.points,'#c0562e',Math.max(3,d.width*base()+4));
      else if('polygon' in d){g2.strokeStyle='#c0562e';g2.lineWidth=3;g2.beginPath();d.polygon.forEach((v,i)=>{const q=toScreen(v.x,v.z);if(i)g2.lineTo(q.x,q.y);else g2.moveTo(q.x,q.y);});g2.closePath();g2.stroke();}
      else{const q=toScreen(d.x,d.z);g2.strokeStyle='#c0562e';g2.lineWidth=2;g2.beginPath();g2.arc(q.x,q.y,Math.max(4,d.radius*base()),0,Math.PI*2);g2.stroke();}
      g2.restore();
    }
    const selected=new Set(session.selection.selection.map(v=>v.id));
    for(const e of Object.values(p.entityIndex)){const q=toScreen(e.position.x,e.position.z);if(q.x<-8||q.x>canvas.width+8||q.y<-8||q.y>canvas.height+8)continue;const on=selected.has(e.id);g2.fillStyle=on?'#c0562e':e.kind==='character'?'#8a5a2b':'#2d5a3f';g2.strokeStyle='#fff';g2.lineWidth=1.5;g2.beginPath();g2.arc(q.x,q.y,on?7:4,0,Math.PI*2);g2.fill();g2.stroke();}
    const target=session.selection.state.camera.target;if(target){const q=toScreen(target.x,target.z);g2.strokeStyle='#c0562e';g2.lineWidth=2;g2.beginPath();g2.moveTo(q.x-9,q.y);g2.lineTo(q.x+9,q.y);g2.moveTo(q.x,q.y-9);g2.lineTo(q.x,q.y+9);g2.stroke();}
  }
  // ---- tools
  let cursor:{x:number;z:number}|null=null,stroke:{x:number;z:number}[]=[],painting=false,polygon:{x:number;z:number}[]=[],region:Region|null=null,flatHeight=0,busy=false;
  const activeLayer=()=>state.layers.find(l=>l.id===state.active)!;
  const isBrush=()=>['paint','erase','raise','lower','smooth','flatten'].includes(state.tool);
  function dabs(){const out:{x:number;z:number}[]=[],spacing=Math.max(1,state.radius*.45);for(const q of stroke){const last=out.at(-1);if(!last){out.push(q);continue;}const d=Math.hypot(q.x-last.x,q.z-last.z);if(d<spacing)continue;const n=Math.floor(d/spacing);for(let i=1;i<=n&&out.length<160;i++)out.push({x:last.x+(q.x-last.x)*i/n,z:last.z+(q.z-last.z)*i/n});}return out.slice(0,160);}
  function strokeCells(){const all=new Map<string,Set<number>>();for(const d of dabs())for(const [id,cells]of regionCells(p,{kind:'circle',x:d.x,z:d.z,radius:state.radius})){let s=all.get(id);if(!s)all.set(id,s=new Set());cells.forEach(c=>s!.add(c));}return new Map([...all].map(([id,s])=>[id,[...s]]));}
  function paintColor(){const l=state.active as MaskLayerId;if(state.tool==='erase')return '#ffffff';if(l==='moisture')return '#3f9aa8';const v=CATEGORY_LAYERS[l].find(c=>c.code===state.code[l]);return v?hex(v.color):'#ffffff';}
  function drawToolPreview(){
    g2.save();
    if(painting&&MASKS.has(state.active)){const size=grid.chunkSizeM/MASK_GRID*base();g2.fillStyle=paintColor();g2.globalAlpha=.55;for(const [id,cells]of strokeCells())for(const i of cells){const q=cellCenter(grid,id,i),s=toScreen(q.x,q.z);g2.fillRect(s.x-size/2,s.y-size/2,size,size);}g2.globalAlpha=1;}
    else if(painting){g2.strokeStyle=state.tool==='lower'?'#2f7fb8':'#c08a1e';g2.lineWidth=1;for(const d of dabs()){const q=toScreen(d.x,d.z);g2.beginPath();g2.arc(q.x,q.y,state.radius*base(),0,Math.PI*2);g2.stroke();}}
    if(cursor&&isBrush()){const q=toScreen(cursor.x,cursor.z);g2.strokeStyle='#1f2f27';g2.lineWidth=1.5;g2.setLineDash([4,3]);g2.beginPath();g2.arc(q.x,q.y,state.radius*base(),0,Math.PI*2);g2.stroke();g2.setLineDash([]);}
    const pts=region?.kind==='polygon'?region.points:polygon;
    if(pts.length){g2.strokeStyle='#c0562e';g2.fillStyle='#c0562e22';g2.lineWidth=2;g2.beginPath();pts.forEach((v,i)=>{const q=toScreen(v.x,v.z);if(i)g2.lineTo(q.x,q.y);else g2.moveTo(q.x,q.y);});if(region)g2.closePath();else if(cursor){const q=toScreen(cursor.x,cursor.z);g2.lineTo(q.x,q.y);}g2.stroke();if(region)g2.fill();for(const v of pts){const q=toScreen(v.x,v.z);g2.fillStyle='#fff';g2.fillRect(q.x-3,q.y-3,6,6);}}
    g2.restore();
  }
  function commitStroke(){
    const layer=state.active,tool=state.tool,radius=state.radius,strength=state.strength;
    if(MASKS.has(layer)){
      const cells=strokeCells(),code=tool==='erase'?'.':state.code[layer as MaskLayerId];if(!cells.size)return;
      run(session.change(tool==='erase'?'Rétablir la génération ('+label(layer)+')':'Peindre '+label(layer),[...cells.keys()],d=>paintMask(d,layer as MaskLayerId,code,cells)),`${[...cells.values()].reduce((n,c)=>n+c.length,0)} cellules · une opération dans l’historique.`);
      return;
    }
    const list=dabs();if(!list.length)return;const g=geography();
    const targets=list.map(d=>{if(tool!=='smooth')return flatHeight;let sum=0,n=0;for(let r=0;r<=2;r++){const ring=r?r*6:1,dd=radius*r/2.5;for(let i=0;i<ring;i++){const a=i/ring*Math.PI*2;sum+=g.ctx.height(d.x+Math.cos(a)*dd,d.z+Math.sin(a)*dd);n++;}}return sum/n;});
    const ids=[...new Set(list.flatMap(d=>affectedChunkIds(p.world,d.x,d.z,radius)))];
    run(session.change(tool==='smooth'?'Lisser le relief':tool==='flatten'?'Aplanir le relief':'Sculpter le relief',ids,draft=>list.forEach((d,i)=>putTerrainEdit(draft,{id:crypto.randomUUID(),x:d.x,z:d.z,radius,mode:tool as 'raise',strength:tool==='smooth'?Math.min(4,strength*.4):strength,height:tool==='raise'||tool==='lower'?strength:targets[i]}))),`${list.length} retouche(s) du relief · une opération dans l’historique.`);
  }
  function run(promise:Promise<unknown>,done:string){busy=true;promise.then(()=>options.status(done)).catch(e=>options.status(String(e instanceof Error?e.message:e),true)).finally(()=>{busy=false;});}
  const label=(id:LayerId)=>LAYERS.find(l=>l.id===id)!.label.toLowerCase();
  // ---- pointer & keyboard
  let drag:{x:number;y:number;cx:number;cz:number;moved:boolean}|null=null;
  const local=(e:{clientX:number;clientY:number})=>{const r=canvas.getBoundingClientRect();return toWorld(e.clientX-r.left,e.clientY-r.top);};
  const inside=(q:{x:number;z:number})=>q.x>=b.minX&&q.x<=b.maxX&&q.z>=b.minZ&&q.z<=b.maxZ;
  canvas.onpointerdown=e=>{
    canvas.focus();canvas.setPointerCapture(e.pointerId);const q=local(e);
    if(e.button===0&&state.tool==='shape'&&!activeLayer().locked){const r=canvas.getBoundingClientRect();if(shapes.pointerDown(e.clientX-r.left,e.clientY-r.top,q))return;}
    const editing=e.button===0&&!activeLayer().locked&&!busy;
    if(editing&&isBrush()&&inside(q)){painting=true;stroke=[q];flatHeight=geography().ctx.height(q.x,q.z);draw(false);return;}
    if(editing&&state.tool==='polygon'&&inside(q)){if(region){region=null;polygon=[];}const first=polygon[0];if(first&&polygon.length>2&&Math.hypot((q.x-first.x)*base(),(q.z-first.z)*base())<10)closePolygon();else polygon.push(q);draw(false);return;}
    drag={x:e.clientX,y:e.clientY,cx,cz,moved:false};
  };
  let lastReadout=0;
  canvas.onpointermove=e=>{
    const q=local(e);cursor=inside(q)?q:null;
    if(painting&&e.buttons&1){stroke.push(q);draw(false);return;}
    if(state.tool==='shape'&&shapes.pointerMove(q))return;
    if(drag){const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>4)drag.moved=true;if(drag.moved){cx=drag.cx-dx/base();cz=drag.cz-dy/base();draw();return;}}
    if(isBrush()||state.tool==='polygon')draw(false);
    if(cursor&&performance.now()-lastReadout>60){lastReadout=performance.now();showReadout(cursor);}
  };
  canvas.onpointerup=e=>{
    if(state.tool==='shape'&&shapes.pointerUp())return;
    if(painting){painting=false;commitStroke();stroke=[];draw(false);return;}
    const d=drag;drag=null;if(!d)return;
    if(d.moved){const c=session.selection.state.camera,t=c.target??{x:c.x,y:0,z:c.z};session.selection.setCamera({...c,x:c.x+cx-t.x,z:c.z+cz-t.z,target:{...t,x:cx,z:cz}});return;}
    const q=local(e);if(e.button===0&&inside(q)&&(state.tool==='select'||activeLayer().locked||!toolsFor(state.active).includes(state.tool)))options.onPick(q.x,q.z,Math.max(2,8/base()));
  };
  canvas.ondblclick=e=>{if(state.tool==='polygon'&&polygon.length>2)closePolygon();else if(state.tool==='shape'&&!activeLayer().locked)shapes.dblclick(local(e));};
  canvas.onpointerleave=()=>{cursor=null;readout.textContent='';draw(false);};
  canvas.onwheel=e=>{e.preventDefault();const before=local(e);scale=Math.max(.25,Math.min(400,scale*Math.exp(-e.deltaY*.0015)));const after=local(e);cx+=before.x-after.x;cz+=before.z-after.z;draw();};
  canvas.onkeydown=e=>{
    if(state.tool==='shape'&&shapes.key(e)){e.preventDefault();return;}
    if(e.key==='Escape'){if(painting){painting=false;stroke=[];options.status('Trait annulé.');}else if(polygon.length||region){polygon=[];region=null;panel();}draw(false);e.preventDefault();}
    else if(e.key==='Enter'&&polygon.length>2){closePolygon();e.preventDefault();}
    else if(e.key==='Backspace'&&polygon.length&&!region){polygon.pop();draw(false);e.preventDefault();}
    else if(e.key==='['||e.key===']'){state.radius=Math.max(2,Math.min(200,state.radius*(e.key===']'?1.25:.8)));panel();draw(false);}
  };
  function showReadout(q:{x:number;z:number}){
    const s=classifyPoint(geography().ctx,q.x,q.z),cat=(l:Exclude<MaskLayerId,'moisture'>,id:string)=>CATEGORY_LAYERS[l].find(v=>v.id===id)?.label??'—';
    readout.textContent=`X ${q.x.toFixed(0)} · Z ${q.z.toFixed(0)} · ${(s.height-p.world.seaLevel).toFixed(1)} m · pente ${(s.slope*100).toFixed(0)} % · ${cat('geology',s.geology)} · ${cat('biome',s.biome)} · ${cat('material',s.material)}${s.occupation!=='none'?' · '+cat('occupation',s.occupation):''} · humidité ${(s.moisture*100).toFixed(0)} %`;
  }
  function closePolygon(){region={kind:'polygon',points:polygon.slice()};polygon=[];panel();draw(false);}
  // ---- left panel: layers, legend, tools, region actions
  function panel(){
    tools.replaceChildren();
    tools.append(node('div','CARTE 2D · COUCHES','kicker'));
    const list=node('div','','layer-list');
    [...state.layers].reverse().forEach(l=>{
      const info=LAYERS.find(i=>i.id===l.id)!,row=node('div','','layer-row'+(l.id===state.active?' active':''));row.dataset.layer=l.id;
      const vis=node('input');vis.type='checkbox';vis.checked=l.visible;vis.title='Afficher';vis.setAttribute('aria-label','Afficher '+info.label);vis.onchange=()=>{l.visible=vis.checked;persist();draw();};
      const name=button(info.label,()=>{state.active=l.id;l.visible=true;if(!toolsFor(l.id).includes(state.tool))state.tool='select';persist();panel();draw();},'layer-name');name.title=info.description;
      const lock=button(l.locked?'🔒':'🔓',()=>{l.locked=!l.locked;persist();panel();},'layer-icon');lock.title=l.locked?'Déverrouiller':'Verrouiller (aucune édition)';lock.setAttribute('aria-pressed',String(l.locked));
      const up=button('▲',()=>move(l.id,1),'layer-icon'),down=button('▼',()=>move(l.id,-1),'layer-icon');up.title='Monter';down.title='Descendre';
      const opacity=node('input');opacity.type='range';opacity.min='0.1';opacity.max='1';opacity.step='0.05';opacity.value=String(l.opacity);opacity.title='Opacité';opacity.setAttribute('aria-label','Opacité '+info.label);opacity.oninput=()=>{l.opacity=Number(opacity.value);draw(false);};opacity.onchange=persist;
      const head=node('div','','layer-head');head.append(vis,name,lock,up,down);row.append(head);if(l.id===state.active)row.append(opacity);list.append(row);
    });
    tools.append(list);
    const layer=activeLayer(),info=LAYERS.find(i=>i.id===layer.id)!;
    tools.append(node('div','OUTILS','kicker'));
    if(layer.locked)tools.append(node('p','Couche verrouillée : sélection et navigation seulement.','muted'));
    const chips=node('div','','chip-row');
    for(const t of toolsFor(layer.id)){const c=button(TOOL_INFO[t][0],()=>{state.tool=t;polygon=[];region=null;panel();draw(false);},'chip'+(state.tool===t?' active':''));c.title=TOOL_INFO[t][1];c.dataset.tool=t;if(layer.locked&&t!=='select'&&t!=='pan')c.disabled=true;chips.append(c);}
    tools.append(chips,node('p',TOOL_INFO[state.tool][1],'muted'));
    if(state.tool==='shape'&&!layer.locked)tools.append(shapes.panel());
    if(info.mode==='computed')tools.append(node('p','Couche calculée : modifiez le relief (Altitude) pour la faire évoluer.','muted'));
    if(isBrush()){
      const radius=node('input');radius.type='range';radius.min='2';radius.max='200';radius.value=String(state.radius);radius.oninput=()=>{state.radius=Number(radius.value);radiusLabel.textContent=`Rayon : ${state.radius.toFixed(0)} m ( [ ] )`;};
      const radiusLabel=node('label',`Rayon : ${state.radius.toFixed(0)} m ( [ ] )`);radiusLabel.append(radius);tools.append(radiusLabel);
      if(RELIEF.has(layer.id)){const strength=node('input');strength.type='range';strength.min='0.5';strength.max='10';strength.step='0.5';strength.value=String(state.strength);const l=node('label',`Force : ${state.strength}`);strength.oninput=()=>{state.strength=Number(strength.value);l.firstChild!.textContent=`Force : ${state.strength}`;};l.append(strength);tools.append(l);}
    }
    tools.append(node('div',MASKS.has(layer.id)?'VALEUR À PEINDRE':'LÉGENDE','kicker'),legend());
    if(region)tools.append(regionPanel(region));
    const overlays=node('input');overlays.type='checkbox';overlays.checked=state.overlays;overlays.onchange=()=>{state.overlays=overlays.checked;draw(false);};
    const gridBox=node('input');gridBox.type='checkbox';gridBox.checked=state.grid;gridBox.onchange=()=>{state.grid=gridBox.checked;draw(false);};
    const view=node('details');view.append(node('summary','Affichage avancé'),field('Rivières, chemins, zones, objets',overlays),field('Grille des secteurs',gridBox));
    tools.append(view,button('Voir ce lieu en 3D',options.open3D,'primary-button'));
  }
  function legend(){
    const l=state.active,box=node('div','','legend');
    if(l==='altitude'||l==='landsea'){const bar=node('div','','legend-ramp');bar.style.background=gradient(ALTITUDE_RAMP);box.append(bar,node('div','fond −80 m · 0 · 120 · 250 · 400 · 600 m','legend-scale'));return box;}
    if(l==='slope'){const bar=node('div','','legend-ramp');bar.style.background=gradient(SLOPE_RAMP);box.append(bar,node('div','plat · 25 % · 50 % · 80 % · falaise','legend-scale'));return box;}
    if(l==='moisture'){
      const bar=node('div','','legend-ramp');bar.style.background=gradient(MOISTURE_RAMP);box.append(bar,node('div','sec → détrempé','legend-scale'));
      const values=node('div','','swatches');for(const code of MOISTURE_CODES){const s=button(code,()=>{state.code.moisture=code;if(!['paint','polygon'].includes(state.tool))state.tool='paint';panel();},'swatch'+(state.code.moisture===code?' active':''));s.title='Humidité '+Number(code)*10+' %';values.append(s);}
      box.append(values);return box;
    }
    for(const v of CATEGORY_LAYERS[l as Exclude<MaskLayerId,'moisture'>]){
      const item=button('',()=>{state.code[l as MaskLayerId]=v.code;if(!['paint','polygon'].includes(state.tool))state.tool='paint';panel();},'legend-item'+(state.code[l as MaskLayerId]===v.code?' active':''));
      const sw=node('span','','legend-swatch');sw.style.background=hex(v.color);item.append(sw,node('span',v.label));item.title='Peindre : '+v.label;item.dataset.code=v.code;box.append(item);
    }
    box.append(node('p','Hachures : valeur corrigée par l’auteur. Gomme : revenir au calcul.','muted'));
    return box;
  }
  function regionPanel(r:Region){
    const box=node('div','','section-card region-card'),layer=state.active;
    const preview=regionCorrections(p,r,MASKS.has(layer)?[layer as MaskLayerId]:[]),all=regionCorrections(p,r);
    const cells=regionCells(p,r),count=[...cells.values()].reduce((n,c)=>n+c.length,0);
    box.append(node('strong','Zone polygonale'),node('p',`${count} cellules de ${grid.chunkSizeM/MASK_GRID} m · ${all.terrainEdits.length} retouche(s) de relief · ${Object.values(all.cells).reduce((n,v)=>n+(v??0),0)} correction(s) de couches (secteurs chargés).`,'muted'));
    if(MASKS.has(layer)){
      const value=layer==='moisture'?`humidité ${Number(state.code.moisture)*10} %`:CATEGORY_LAYERS[layer as Exclude<MaskLayerId,'moisture'>].find(v=>v.code===state.code[layer as MaskLayerId])?.label;
      box.append(button(`Remplir : ${value}`,()=>run(session.change('Remplir '+label(layer),[...cells.keys()],d=>paintMask(d,layer as MaskLayerId,state.code[layer as MaskLayerId],cells)),`${count} cellules remplies.`),'primary-button'));
      box.append(button(`Rétablir la génération (${label(layer)}, ${preview.cells[layer as MaskLayerId]??0} cellule(s))`,()=>restore({terrain:false,layers:[layer as MaskLayerId]})));
    }
    box.append(button(`Tout rétablir ici (relief + couches)`,()=>restore({terrain:true,layers:['geology','moisture','biome','material','occupation']})));
    box.append(node('p','Aperçu calculé avant validation ; une seule opération annulable. Les corrections hors de la zone sont conservées.','muted'));
    return box;
    function restore(o:{terrain:boolean;layers:MaskLayerId[]}){const ids=regionChunkIds(p,r);run(session.change('Rétablir la génération',ids,d=>{restoreGeneration(d,r,o);}),'Génération rétablie dans la zone.');region=null;panel();draw(false);}
  }
  function move(id:LayerId,delta:number){const i=state.layers.findIndex(l=>l.id===id),j=i+delta;if(j<0||j>=state.layers.length)return;const [l]=state.layers.splice(i,1);state.layers.splice(j,0,l);persist();panel();draw(false);}
  function persist(){savePrefs({layers:state.layers,active:state.active});}
  // ---- lifecycle
  const shapes=createShapeTool({session,toScreen,scale:base,redraw:()=>draw(false),refreshPanel:()=>panel(),status:options.status});
  const observer=new ResizeObserver(()=>draw());observer.observe(wrap);
  const stops=[session.commands.subscribe(onTransaction),session.selection.subscribe(()=>draw(false))];
  panel();draw();
  return {
    dispose(){disposed=true;if(redrawFrame)cancelAnimationFrame(redrawFrame);observer.disconnect();stops.forEach(s=>s());if(raf)cancelAnimationFrame(raf);for(const t of inFlight.values())t.cancel();inFlight.clear();},
    focus(x:number,z:number){cx=x;cz=z;draw();},
    /** Test/benchmark hooks. */
    stats:()=>({tiles:cache.size,bytes:cache.bytes,pending:queue.length,msPerTile:samples?sampleMs/samples:0}),
  };
}
