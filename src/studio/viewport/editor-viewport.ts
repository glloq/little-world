import * as THREE from 'three';
import {FrameClock} from '../../frame-clock.ts';
import {buildWorld,configureScene,addPlacement,removePlacement,configureWorldGeography,type WorldView} from '../../world.ts';
import {configureTerrain,terrainHeight} from '../../terrain.ts';
import {terrainChangeRects} from '../../studio-core/geo-edits.ts';
import {horizonFar} from '../../horizon-view.ts';
import {createNPCSystem} from '../../npc-view.ts';
import {toRuntimeWorld} from '../../studio-core/migration.ts';
import {defaultSpawn} from '../../runtime/compiled-world.ts';
import {affectedChunkIds} from '../../studio-core/schema.ts';
import type {EditTransaction} from '../../studio-core/commands.ts';
import type {WorldDefinition,TerrainStroke} from '../../world-data.ts';
import type {StudioSession} from '../session.ts';
import {EditorCamera,poseFromContext} from './camera-controller.ts';
import {attachNavigation,isFormTarget,type Navigation} from './navigation.ts';
import {SelectionController} from './selection.ts';
import {elementExists} from '../../studio-core/elements.ts';
import {ToolManager,type ToolContext} from './tools.ts';
import {SelectTool} from './select-tool.ts';
import {PlacementTool} from './placement-tool.ts';
import {BrushTool,type BrushMode} from './brush-tool.ts';
import {PolylineTool} from './polyline-tool.ts';
import {applySkyLighting,type SkyLighting} from '../../environment/sky-lighting.ts';
import {entityTransform} from '../../studio-core/transforms.ts';
import type {LightStatus} from '../../lighting/light-budget.ts';

export interface ViewportOptions {
  message(text:string,error?:boolean):void;
  refreshInspector():void;
  /** Status bar: cursor ground coordinates, camera mode and selection size. */
  status(info:{cursor:{x:number;z:number}|null;mode:string;selected:number;sectors:number}):void;
  /** Tool changed from inside the viewport (Escape, placement end…). */
  toolChanged(id:string):void;
}
/** Content of nearby sectors is shown; terrain detail, horizon and LOD come from the shared
 * world renderer (camera-prioritised, budgeted). Nothing loads the whole island. */
const CONTENT_RADIUS=320,REPLAN_DISTANCE=48;
export const BRUSH_TOOLS:[string,BrushMode][]=[['raise','raise'],['lower','lower'],['flatten','flatten'],['smooth','smooth'],['forest','forest'],['meadow','meadow'],['mountain','mountain'],['coast','coast'],['village','village']];
/** The Studio's central 3D editing space. Created once per opened project and kept while
 * tools and panels change, so camera, selection and scene are never reset by a tool. */
export class StudioViewport {
  readonly element:HTMLDivElement;
  readonly canvas:HTMLCanvasElement;
  readonly camera:EditorCamera;
  readonly selection:SelectionController;
  readonly tools:ToolManager;
  private renderer:THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private world:WorldView;
  private definition:WorldDefinition;
  private navigation:Navigation;
  private models=new Map<string,{object:THREE.Object3D;signature:string}>();
  private npcs:ReturnType<typeof createNPCSystem>;
  private npcObjects=new Map<string,THREE.Object3D[]>();
  private npcSignature='';
  private editSignatures=new Map<string,string>();
  private contentCenter={x:Infinity,z:Infinity};
  private contentIds=new Set<string>();
  private queue=Promise.resolve();
  private clock=new FrameClock();
  private frame=0;private remaining=30;private drawing=false;private disposed=false;private visible=true;private renderCount=0;
  private ray=new THREE.Raycaster();private pointer=new THREE.Vector2();
  private cursor:{x:number;z:number}|null=null;private lastCursorPick=0;
  private persist:ReturnType<typeof setTimeout>|undefined;
  private unsubscribe:(()=>void)[]=[];
  private resizeObserver:ResizeObserver;
  private session:StudioSession;private options:ViewportOptions;
  private constructor(host:HTMLElement,session:StudioSession,options:ViewportOptions,definition:WorldDefinition){
    this.session=session;this.options=options;
    this.definition=definition;const p=session.document;this.editSignatures=new Map([...definition.terrain,...definition.biomes].map(e=>[e.id,JSON.stringify(e)]));this.geoSignatures=geographySignatures(definition);
    this.element=document.createElement('div');this.element.className='viewport';this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Vue 3D du monde');this.element.append(this.canvas);host.append(this.element);
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.sky=configureScene(this.scene);this.skyDay={sun:this.sky.sun.intensity,fill:this.sky.fill.intensity,ambient:this.sky.ambient.intensity,sunColor:this.sky.sun.color.getHex(),sunPosition:this.sky.sun.position.clone(),background:(this.scene.background as THREE.Color).getHex()};
    this.lightGroup.name='LightMarkers';this.scene.add(this.lightGroup);this.rangeGizmo.visible=false;this.rangeGizmo.renderOrder=24;this.scene.add(this.rangeGizmo);
    this.world=buildWorld(definition.config,definition);this.scene.add(this.world.root);
    // A project without a saved 3D pose starts on the world's start point (beach, valley entrance).
    const saved=session.selection.state.camera,start=saved.target?saved:{...defaultSpawn(definition.config,definition.terrain),mode:'orbit' as const};
    const b=p.world.bounds;this.camera=new EditorCamera(poseFromContext(start,terrainHeight),session.selection.state.camera.mode==='top'?'top':session.selection.state.camera.mode==='free'?'free':'orbit',{minX:b.minX,maxX:b.maxX,minZ:b.minZ,maxZ:b.maxZ,ground:(x,z)=>terrainHeight(x,z)});
    this.camera.setFar(horizonFar(b.maxX-b.minX,b.maxZ-b.minZ));
    this.npcs=createNPCSystem(this.scene,[],[]);
    this.selection=new SelectionController(this.scene,session,()=>[...[...this.models.values()].map(m=>m.object),...[...this.npcObjects.values()].flat(),...[...this.lightMarkers.values()].map(m=>m.object)],id=>this.objectFor(id),e=>this.groundAt(e.clientX,e.clientY));
    this.navigation=attachNavigation(this.canvas,this.camera,{pick:(x,y)=>this.groundAt(x,y),heightPx:()=>this.canvas.clientHeight,isActive:()=>this.visible,onInteract:()=>this.invalidate(4),onSettled:()=>this.saveCamera()});
    const context:ToolContext={session,scene:this.scene,canvas:this.canvas,camera:this.camera,selection:this.selection,ground:e=>this.groundAt(e.clientX,e.clientY),objectFor:id=>this.objectFor(id),invalidate:n=>this.invalidate(n),message:options.message,refreshInspector:options.refreshInspector,setTool:id=>{this.setTool(id);options.toolChanged(id);},
      run:action=>{void action().catch(error=>{options.message(String(error instanceof Error?error.message:error),true);this.refresh();});}};
    this.tools=new ToolManager(context);this.tools.register(new SelectTool());this.tools.register(new PlacementTool());this.tools.register(new PolylineTool());for(const [id,mode]of BRUSH_TOOLS)this.tools.register(new BrushTool(id,mode));
    this.canvas.addEventListener('pointerdown',this.onDown);this.canvas.addEventListener('pointermove',this.onMove);this.canvas.addEventListener('pointerup',this.onUp);this.canvas.addEventListener('pointerleave',this.onLeave);
    window.addEventListener('keydown',this.onKey);
    this.unsubscribe.push(session.commands.subscribe(t=>this.refresh(t)),session.selection.subscribe(()=>{this.selection.refresh();this.invalidate(3);this.reportStatus();}));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(this.element);
    this.setTool(session.selection.state.activeTool);this.syncContent();this.resize();
  }
  static async create(host:HTMLElement,session:StudioSession,options:ViewportOptions){
    const p=session.document,c=session.selection.state.camera,center=c.target??(c.mode==='map2d'&&!c.x&&!c.z?{x:0,z:0}:c),ids=affectedChunkIds(p.world,clampX(p,center.x),clampZ(p,center.z),CONTENT_RADIUS).filter(id=>!!p.chunkIndex[id]);
    await session.hydrate(ids);const definition=toRuntimeWorld(p,Object.keys(p.chunks));definition.config.viewDistance=300;
    return new StudioViewport(host,session,options,definition);
  }
  /** The global map may have moved the target while the 3D view was hidden. */
  syncFromContext(){const c=this.session.selection.state.camera,t=c.target;if(!t)return;const current=this.camera.target;if(Math.hypot(t.x-current.x,t.z-current.z)>1){this.camera.moveTarget(t.x,t.z);this.invalidate(20);}}
  /** Rendering is paused while a full-page panel covers the workspace; nothing is destroyed. */
  setVisible(visible:boolean){this.visible=visible;this.element.hidden=!visible;if(visible){this.resize();this.invalidate(10);}}
  setTool(id:string){this.tools.activate(this.tools.has(id)?id:'select');if(this.session.selection.state.activeTool!==this.tools.active!.id)this.session.selection.setTool(this.tools.active!.id);this.canvas.dataset.tool=this.tools.active!.id;}
  focusSelection(){const b=this.selection.bounds();if(b)this.camera.focus(b.center,b.radius);else if(this.cursor)this.camera.focus({x:this.cursor.x,y:terrainHeight(this.cursor.x,this.cursor.z),z:this.cursor.z},10);this.invalidate(30);this.saveCamera();}
  goTo(x:number,z:number,radius=12){const p=this.session.document;x=clampX(p,x);z=clampZ(p,z);this.camera.moveTarget(x,z);this.camera.focus({x,y:terrainHeight(x,z),z},radius);this.invalidate(30);this.saveCamera();}
  objectFor(id:string):THREE.Object3D|undefined{return this.models.get(id)?.object??this.npcObjects.get(id)?.find(o=>o.visible)??this.npcObjects.get(id)?.[0]??this.lightMarkers.get(id)?.object;}
  /** E10 — night preview: the runtime's own midnight sky values and lights at full night
   * factor; the project's time and environment settings are not modified. */
  get nightPreview(){return this.night;}
  setNightPreview(on:boolean){
    this.night=on;const sky=this.sky,background=this.scene.background as THREE.Color;
    if(on)applySkyLighting(sky,background,-1,0,0);
    else{const d=this.skyDay;sky.sun.intensity=d.sun;sky.fill.intensity=d.fill;sky.ambient.intensity=d.ambient;sky.sun.color.setHex(d.sunColor);sky.sun.position.copy(d.sunPosition);background.setHex(d.background);}
    this.canvas.dataset.night=String(on);this.invalidate(6);
  }
  /** Budget decision for a light-carrying entity at the current camera (Studio list). */
  lightStatus(entityId:string):LightStatus{return this.world.lights.statusOf('light:'+entityId);}
  get diagnostics(){return {models:this.models.size,npcs:this.npcObjects.size,contentSectors:this.contentIds.size,loadedSectors:Object.keys(this.session.document.chunks).length,geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,sceneChildren:this.scene.children.length,toolActivations:this.tools.activations,toolDeactivations:this.tools.deactivations,listeners:this.navigation.listenerCount+5,terrain:{...this.world.stats},horizon:{...this.world.horizon}};}
  private groundAt(clientX:number,clientY:number):THREE.Vector3|null{
    const r=this.canvas.getBoundingClientRect();if(!r.width)return null;this.pointer.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);this.ray.setFromCamera(this.pointer,this.camera.camera);
    const hit=this.ray.intersectObjects(this.world.terrain.children,true)[0];if(hit)return hit.point;
    // Analytic fallback (horizon/far relief, or tiles not built yet): march the height field.
    const o=this.ray.ray.origin,d=this.ray.ray.direction;for(let t=1;t<12000;t+=Math.max(1,t*.02)){const x=o.x+d.x*t,y=o.y+d.y*t,z=o.z+d.z*t;if(y<=terrainHeight(x,z))return new THREE.Vector3(x,terrainHeight(x,z),z);if(y<-400)break;}
    return null;
  }
  private onDown=(e:PointerEvent)=>{if(e.button!==0||e.altKey||!this.visible)return;this.canvas.focus({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);this.tools.active?.pointerDown?.(e);this.invalidate(2);};
  private onMove=(e:PointerEvent)=>{
    if(!this.visible||this.navigation.dragging)return;this.tools.active?.pointerMove?.(e);
    const now=performance.now();if(now-this.lastCursorPick>80){this.lastCursorPick=now;const g=this.groundAt(e.clientX,e.clientY);this.cursor=g?{x:g.x,z:g.z}:null;this.reportStatus();}
  };
  private onUp=(e:PointerEvent)=>{if(e.button!==0||!this.visible)return;if(this.canvas.hasPointerCapture(e.pointerId))this.canvas.releasePointerCapture(e.pointerId);this.tools.active?.pointerUp?.(e);this.invalidate(3);};
  private onLeave=()=>{this.selection.setHover(null);this.invalidate(2);};
  private onKey=(e:KeyboardEvent)=>{
    if(!this.visible||this.disposed||isFormTarget(e.target)||this.navigation.dragging)return;
    if(e.target instanceof HTMLElement&&e.target.closest('dialog,.dialogue-panel'))return;
    if(e.key==='Escape'){e.preventDefault();if(!this.tools.active?.cancel?.()){this.session.selection.select(null);this.options.refreshInspector();}this.invalidate(3);return;}
    if(this.tools.active?.keyDown?.(e)){e.preventDefault();this.invalidate(3);return;}
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='f'||e.key==='F'){e.preventDefault();this.focusSelection();}
    else if(e.code==='Digit7'||e.code==='Numpad7'){e.preventDefault();this.camera.toggleTop();this.invalidate(40);this.saveCamera();}
  };
  private saveCamera(){clearTimeout(this.persist);this.persist=setTimeout(()=>{if(!this.disposed)this.session.selection.setCamera(this.camera.context());},250);}
  private reportStatus(){this.options.status({cursor:this.cursor,mode:this.camera.mode,selected:this.selection.ids.length,sectors:this.contentIds.size});}
  private resize(){const r=this.element.getBoundingClientRect();if(!r.width||!r.height)return;this.renderer.setSize(r.width,r.height,false);this.camera.setAspect(r.width/r.height);this.invalidate(4);}
  invalidate(frames=30){if(this.disposed||!this.visible)return;this.remaining=Math.max(this.remaining,frames);this.canvas.dataset.idle='false';if(!this.frame&&!this.drawing){this.clock.reset();this.frame=requestAnimationFrame(this.draw);}}
  private draw=(now:number)=>{
    this.frame=0;if(this.disposed||!this.visible)return;this.drawing=true;const step=this.clock.advance(now,!document.hidden);
    if(step.render){
      const dt=step.renderDelta;if(this.navigation.update(dt))this.remaining=Math.max(this.remaining,3);
      const t=this.camera.target;
      this.world.lights.setEnvironment(this.night?1:0,now/1000);
      this.world.update(dt,{x:t.x,z:t.z},this.camera.mode==='top'?undefined:this.camera.perspective,this.canvas.height);this.updateRangeGizmo();
      this.npcs.update(0,0,{x:t.x,z:t.z});
      if(Math.hypot(t.x-this.contentCenter.x,t.z-this.contentCenter.z)>REPLAN_DISTANCE)this.syncContent();
      this.tools.active?.frame?.();this.selection.refresh();
      this.renderer.render(this.scene,this.camera.camera);this.remaining--;
      const d=this.canvas.dataset;d.renderCount=String(++this.renderCount);d.pending=String(this.world.stats.pending);d.cameraMode=this.camera.mode;d.camera=JSON.stringify(this.camera.context());d.calls=String(this.renderer.info.render.calls);
      d.waterCount=String(this.world.root.children.filter(o=>o.userData.waterId).length);d.diagnostics=JSON.stringify(this.diagnostics);d.models=String(this.models.size);d.paths=String(this.world.paths.paths);d.pathSectors=String(this.world.paths.sectors);d.pathSignature=this.world.paths.signature;d.contentSectors=String(this.contentIds.size);
      const ls=this.world.lights.stats;d.lights=JSON.stringify({sources:ls.sources,pool:ls.pool,budget:ls.budget,active:ls.active,glow:ls.glow,overBudget:ls.overBudget,markers:this.lightMarkers.size});
    }
    this.drawing=false;
    if(this.remaining>0||this.world.stats.pending>0||this.navigation.flying||this.camera.animating||this.tools.active&&'dragging' in this.tools.active&&(this.tools.active as {dragging:boolean}).dragging)this.frame=requestAnimationFrame(this.draw);
    else this.canvas.dataset.idle='true';
  };
  /** Hydrate sectors around the camera target, then rebuild only what changed. */
  private syncContent(transaction?:EditTransaction){
    const t=this.camera.target,p=this.session.document;this.contentCenter={x:t.x,z:t.z};
    const ids=affectedChunkIds(p.world,clampX(p,t.x),clampZ(p,t.z),CONTENT_RADIUS).filter(id=>!!p.chunkIndex[id]);
    this.queue=this.queue.then(async()=>{
      if(this.disposed)return;await this.session.hydrate(ids);if(this.disposed)return;
      this.contentIds=new Set(ids);const next=toRuntimeWorld(p,Object.keys(p.chunks));next.config.viewDistance=300;
      // Same object as the one given to buildWorld: biome sampling reads its live edit list.
      const generatorBefore=JSON.stringify(this.definition.config.terrain??null);
      Object.assign(this.definition,next);
      if(generatorBefore!==JSON.stringify(next.config.terrain??null))this.applyGenerator(transaction);
      this.syncGeography();this.applyTerrain([...next.terrain,...next.biomes] as TerrainStroke[],transaction);this.world.refreshPaths(this.definition.paths);this.syncZones();this.syncModels();this.syncLights();this.tools.active?.sourcesChanged?.();this.reportStatus();this.invalidate(20);
    }).catch(error=>this.options.message(String(error),true));
  }
  refresh(transaction?:EditTransaction){
    // Undo/redo may remove selected elements: keep only those that still exist.
    this.session.selection.prune(v=>elementExists(this.session.document,v));
    this.syncContent(transaction);
  }
  /** Relief generator parameters changed (2D shape editing, presets, undo): reconfigure the
   * terrain and rebuild only the areas of the changed shapes (whole world if global). */
  private applyGenerator(transaction?:EditTransaction){
    const d=this.definition;configureTerrain(d.config,d.terrain,d.water,d.paths);this.world.refreshWater();
    this.canvas.dataset.generatorRevision=String(Number(this.canvas.dataset.generatorRevision??0)+1);
    const change=transaction?terrainChangeRects(transaction.patches):{global:true,rects:[]};
    const b=this.session.document.world.bounds;
    if(change.global||!change.rects.length){this.world.refreshTerrain((b.minX+b.maxX)/2,(b.minZ+b.maxZ)/2,Math.hypot(b.maxX-b.minX,b.maxZ-b.minZ)/2+64);return;}
    for(const r of change.rects)this.world.refreshTerrain((r.minX+r.maxX)/2,(r.minZ+r.maxZ)/2,Math.hypot(r.maxX-r.minX,r.maxZ-r.minZ)/2+16);
  }
  /** Geography corrections (sector masks, activity zones): reconfigure the shared engine and
   * refresh only the sectors whose masks changed (2D map strokes, undo/redo, hydration). */
  private geoSignatures=new Map<string,string>();
  private syncGeography(){
    const d=this.definition;configureWorldGeography(d.config,d);
    const next=geographySignatures(d),previous=this.geoSignatures;this.geoSignatures=next;
    const size=this.session.document.world.chunkSizeM,b=this.session.document.world.bounds;
    for(const id of new Set([...next.keys(),...previous.keys()])){
      if(next.get(id)===previous.get(id))continue;
      if(id==='#zones'){for(const zones of [previous.get(id),next.get(id)])for(const z of JSON.parse(zones??'[]') as {polygon:{x:number;z:number}[]}[]){const xs=z.polygon.map(q=>q.x),zs=z.polygon.map(q=>q.z),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);this.world.refreshTerrain((x0+x1)/2,(z0+z1)/2,Math.hypot(x1-x0,z1-z0)/2+4);}continue;}
      const [cx,cz]=id.split(':').map(Number);this.world.refreshTerrain(b.minX+(cx+.5)*size,b.minZ+(cz+.5)*size,size*.72+4);
    }
  }
  /** Terrain and biome edits are refreshed locally (tiles, vegetation and horizon blocks around each changed edit). */
  private applyTerrain(edits:TerrainStroke[],transaction?:EditTransaction){
    const next=new Map(edits.map(e=>[e.id,JSON.stringify(e)])),changed:TerrainStroke[]=[],previous=this.editSignatures;
    for(const e of edits)if(previous.get(e.id)!==next.get(e.id))changed.push(e);
    const removed=[...previous.keys()].filter(id=>!next.has(id)).map(id=>JSON.parse(previous.get(id)!) as TerrainStroke);
    const waterChanged=transaction?.patches.some(p=>p.path.includes('water'))??false;
    if(!changed.length&&!removed.length&&!waterChanged&&previous.size===next.size)return;
    this.editSignatures=next;const d=this.definition;configureTerrain(d.config,d.terrain,d.water,d.paths);
    const water=new Set(this.world.refreshWater());
    for(const e of [...changed,...removed])this.world.refreshTerrain(e.x,e.z,e.radius+4);
    if(water.size)for(const w of d.water)if(water.has(w.id))for(const q of w.points)this.world.refreshTerrain(q.x,q.z,w.width+12);
  }
  /** Activity zone outlines (farm plots, mines), draped on the relief; authoring aid only. */
  private zoneGroup=new THREE.Group();private zoneSignature='';
  private syncZones(){
    const zones=Object.values(this.session.document.libraries.zones??{}),signature=JSON.stringify(zones);if(signature===this.zoneSignature)return;this.zoneSignature=signature;
    for(const child of [...this.zoneGroup.children]){const line=child as THREE.Line;line.geometry.dispose();(line.material as THREE.Material).dispose();}this.zoneGroup.clear();
    if(!this.zoneGroup.parent)this.scene.add(this.zoneGroup);
    for(const zone of zones){
      const pts:THREE.Vector3[]=[];const ring=[...zone.polygon,zone.polygon[0]];
      for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/4));for(let j=0;j<steps;j++){const x=a.x+(b.x-a.x)*j/steps,z=a.z+(b.z-a.z)*j/steps;pts.push(new THREE.Vector3(x,terrainHeight(x,z)+.5,z));}}
      const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:zone.kind==='mine'?0x8a5a3c:0xd9a520}));line.name='Zone:'+zone.id;line.userData.zoneId=zone.id;this.zoneGroup.add(line);
    }
    this.canvas.dataset.zones=String(zones.length);
  }
  /** Light sources go to the shared world renderer (same budget as the game); editor markers
   * (small octahedra + range gizmo) are authoring aids only and are never exported. */
  private lightGroup=new THREE.Group();private lightMarkers=new Map<string,{object:THREE.Object3D;signature:string}>();private lightSignature='';
  private markerGeometry=new THREE.OctahedronGeometry(.32,0);
  private rangeGizmo=new THREE.LineSegments(rangeGeometry(),new THREE.LineBasicMaterial({color:0xffd27a,transparent:true,opacity:.85,depthTest:false}));
  private sky!:SkyLighting;private skyDay!:{sun:number;fill:number;ambient:number;sunColor:number;sunPosition:THREE.Vector3;background:number};private night=false;
  private syncLights(){
    const lights=this.definition.lights??[],signature=JSON.stringify(lights);
    if(signature!==this.lightSignature){this.lightSignature=signature;this.world.refreshLights(lights);}
    const p=this.session.document,shown=lights.filter(l=>this.contentIds.has(p.entityIndex[l.entityId]?.ownerChunkId??'')),ids=new Set(shown.map(l=>l.entityId));
    for(const [id,m]of this.lightMarkers)if(!ids.has(id)){disposeMarker(m.object);this.lightMarkers.delete(id);}
    for(const l of shown){
      let t;try{t=entityTransform(p,l.entityId);}catch{continue;}
      const sig=JSON.stringify([l,t]),current=this.lightMarkers.get(l.entityId);if(current?.signature===sig)continue;if(current)disposeMarker(current.object);
      const group=new THREE.Group(),marker=new THREE.Mesh(this.markerGeometry,new THREE.MeshBasicMaterial({color:l.color}));group.name='LightMarker:'+l.entityId;group.userData.entityId=l.entityId;
      group.position.set(t.position.x,terrainHeight(t.position.x,t.position.z)+t.position.y,t.position.z);group.quaternion.set(t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w);group.scale.set(t.scale.x,t.scale.y,t.scale.z);
      const local=new THREE.Vector3(l.offset.x,l.offset.y,l.offset.z).applyQuaternion(group.quaternion.clone().invert()).divide(group.scale);marker.position.copy(local);marker.userData.entityId=l.entityId;marker.userData.range=l.range;
      group.add(marker);this.lightGroup.add(group);this.lightMarkers.set(l.entityId,{object:group,signature:sig});
    }
  }
  /** Range of the selected light (sphere outline), coloured by its budget decision. */
  private updateRangeGizmo(){
    const id=this.selection.ids.find(v=>this.lightMarkers.has(v)),g=this.rangeGizmo;if(!id){g.visible=false;return;}
    const marker=this.lightMarkers.get(id)!.object.children[0];marker.getWorldPosition(g.position);g.scale.setScalar(marker.userData.range as number);g.visible=true;
    const status=this.lightStatus(id);(g.material as THREE.LineBasicMaterial).color.setHex(status==='dynamic'?0xffd27a:status==='budget'?0xe0614e:0x9aa6ad);this.canvas.dataset.selectedLight=status;
  }
  private syncModels(){
    const p=this.session.document,shown=this.definition.placements.filter(v=>this.contentIds.has(p.entityIndex[v.id]?.ownerChunkId??''));const ids=new Set(shown.map(v=>v.id));
    for(const [id,model]of this.models)if(!ids.has(id)){removePlacement(model.object);this.models.delete(id);}
    for(const placement of shown){
      const signature=JSON.stringify(placement),model=this.models.get(placement.id);
      if(model?.signature===signature){model.object.position.y=terrainHeight(placement.x,placement.z)+(placement.y??0);continue;}
      if(model)removePlacement(model.object);const object=addPlacement(this.world,placement);object.userData.entityId=placement.id;this.models.set(placement.id,{object,signature});
    }
    const npcs=this.definition.npcs.filter(n=>this.contentIds.has(p.entityIndex[n.id]?.ownerChunkId??'')),signature=JSON.stringify(npcs);
    if(signature!==this.npcSignature){
      this.npcs.dispose();this.npcs=createNPCSystem(this.scene,npcs,[]);this.npcSignature=signature;this.npcObjects.clear();
      for(const n of npcs){const objects=[this.scene.getObjectByName('NPC:'+n.id),this.scene.getObjectByName('NPC silhouette:'+n.id)].filter((o):o is THREE.Object3D=>!!o);for(const o of objects)o.userData.entityId=n.id;this.npcObjects.set(n.id,objects);}
    }
    this.selection.refresh();
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;clearTimeout(this.persist);cancelAnimationFrame(this.frame);this.session.selection.setCamera(this.camera.context());
    for(const stop of this.unsubscribe)stop();this.tools.dispose();this.navigation.dispose();this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown',this.onDown);this.canvas.removeEventListener('pointermove',this.onMove);this.canvas.removeEventListener('pointerup',this.onUp);this.canvas.removeEventListener('pointerleave',this.onLeave);window.removeEventListener('keydown',this.onKey);
    for(const child of this.zoneGroup.children){const line=child as THREE.Line;line.geometry.dispose();(line.material as THREE.Material).dispose();}this.zoneGroup.clear();this.zoneGroup.removeFromParent();
    for(const model of this.models.values())removePlacement(model.object);this.models.clear();for(const m of this.lightMarkers.values())disposeMarker(m.object);this.lightMarkers.clear();this.markerGeometry.dispose();this.rangeGizmo.geometry.dispose();(this.rangeGizmo.material as THREE.Material).dispose();this.npcs.dispose();this.selection.dispose();this.world.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.element.remove();
  }
}
const clampX=(p:{world:{bounds:{minX:number;maxX:number}}},x:number)=>Math.min(p.world.bounds.maxX,Math.max(p.world.bounds.minX,x));
const clampZ=(p:{world:{bounds:{minZ:number;maxZ:number}}},z:number)=>Math.min(p.world.bounds.maxZ,Math.max(p.world.bounds.minZ,z));

function disposeMarker(o:THREE.Object3D){o.traverse(c=>{const m=c as THREE.Mesh;if(m.isMesh)(m.material as THREE.Material).dispose();});o.removeFromParent();}
/** Three unit circles (XY, XZ, YZ): the outline of a light's range sphere. */
function rangeGeometry(){
  const pts:number[]=[],n=48;for(let axis=0;axis<3;axis++)for(let i=0;i<n;i++)for(const k of [i,i+1]){const a=k/n*Math.PI*2,c=Math.cos(a),s=Math.sin(a);pts.push(...(axis===0?[c,s,0]:axis===1?[c,0,s]:[0,c,s]));}
  return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
}
function geographySignatures(d:WorldDefinition):Map<string,string>{
  const out=new Map<string,string>();for(const [id,layers]of Object.entries(d.geography?.masks??{}))out.set(id,JSON.stringify(layers));
  out.set('#zones',JSON.stringify(d.geography?.zones??[]));return out;
}
