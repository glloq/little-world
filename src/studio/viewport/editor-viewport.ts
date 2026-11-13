import * as THREE from 'three';
import {FrameClock} from '../../frame-clock.ts';
import {buildWorld,configureScene,addPlacement,removePlacement,type WorldView} from '../../world.ts';
import {configureTerrain,terrainHeight} from '../../terrain.ts';
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
import {ToolManager,type ToolContext} from './tools.ts';
import {SelectTool} from './select-tool.ts';
import {PlacementTool} from './placement-tool.ts';
import {BrushTool,type BrushMode} from './brush-tool.ts';
import {PolylineTool} from './polyline-tool.ts';

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
    this.definition=definition;const p=session.document;this.editSignatures=new Map([...definition.terrain,...definition.biomes].map(e=>[e.id,JSON.stringify(e)]));
    this.element=document.createElement('div');this.element.className='viewport';this.canvas=document.createElement('canvas');this.canvas.tabIndex=0;this.canvas.setAttribute('aria-label','Vue 3D du monde');this.element.append(this.canvas);host.append(this.element);
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'low-power'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    configureScene(this.scene);this.world=buildWorld(definition.config,definition);this.scene.add(this.world.root);
    // A project without a saved 3D pose starts on the world's start point (beach, valley entrance).
    const saved=session.selection.state.camera,start=saved.target?saved:{...defaultSpawn(definition.config,definition.terrain),mode:'orbit' as const};
    const b=p.world.bounds;this.camera=new EditorCamera(poseFromContext(start,terrainHeight),session.selection.state.camera.mode==='top'?'top':session.selection.state.camera.mode==='free'?'free':'orbit',{minX:b.minX,maxX:b.maxX,minZ:b.minZ,maxZ:b.maxZ,ground:(x,z)=>terrainHeight(x,z)});
    this.camera.setFar(horizonFar(b.maxX-b.minX,b.maxZ-b.minZ));
    this.npcs=createNPCSystem(this.scene,[],[]);
    this.selection=new SelectionController(this.scene,session,()=>[...[...this.models.values()].map(m=>m.object),...[...this.npcObjects.values()].flat()],id=>this.objectFor(id));
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
  objectFor(id:string):THREE.Object3D|undefined{return this.models.get(id)?.object??this.npcObjects.get(id)?.find(o=>o.visible)??this.npcObjects.get(id)?.[0];}
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
      this.world.update(dt,{x:t.x,z:t.z},this.camera.mode==='top'?undefined:this.camera.perspective,this.canvas.height);
      this.npcs.update(0,0,{x:t.x,z:t.z});
      if(Math.hypot(t.x-this.contentCenter.x,t.z-this.contentCenter.z)>REPLAN_DISTANCE)this.syncContent();
      this.tools.active?.frame?.();this.selection.refresh();
      this.renderer.render(this.scene,this.camera.camera);this.remaining--;
      const d=this.canvas.dataset;d.renderCount=String(++this.renderCount);d.pending=String(this.world.stats.pending);d.cameraMode=this.camera.mode;d.camera=JSON.stringify(this.camera.context());d.calls=String(this.renderer.info.render.calls);
      d.waterCount=String(this.world.root.children.filter(o=>o.userData.waterId).length);d.diagnostics=JSON.stringify(this.diagnostics);d.models=String(this.models.size);d.contentSectors=String(this.contentIds.size);
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
      Object.assign(this.definition,next);
      this.applyTerrain([...next.terrain,...next.biomes] as TerrainStroke[],transaction);this.syncModels();this.tools.active?.sourcesChanged?.();this.reportStatus();this.invalidate(20);
    }).catch(error=>this.options.message(String(error),true));
  }
  refresh(transaction?:EditTransaction){
    // Undo/redo may remove selected elements: keep only those that still exist.
    this.session.selection.prune(v=>v.kind!=='entity'||!!this.session.document.entityIndex[v.id]);
    this.syncContent(transaction);
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
    for(const model of this.models.values())removePlacement(model.object);this.models.clear();this.npcs.dispose();this.selection.dispose();this.world.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.element.remove();
  }
}
const clampX=(p:{world:{bounds:{minX:number;maxX:number}}},x:number)=>Math.min(p.world.bounds.maxX,Math.max(p.world.bounds.minX,x));
const clampZ=(p:{world:{bounds:{minZ:number;maxZ:number}}},z:number)=>Math.min(p.world.bounds.maxZ,Math.max(p.world.bounds.minZ,z));
