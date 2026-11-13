import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {TransformControls} from 'three/addons/controls/TransformControls.js';
import {FrameClock} from '../frame-clock.ts';
import {buildWorld,configureScene,addPlacement,removePlacement} from '../world.ts';
import {configureTerrain,terrainHeight} from '../terrain.ts';
import {createNPCSystem} from '../npc-view.ts';
import {toRuntimeWorld} from '../studio-core/migration.ts';
import {chunkAt,chunkCoordinates,affectedChunkIds} from '../studio-core/schema.ts';
import {putEntity,putTerrainEdit,putBiomeEdit} from '../studio-core/source.ts';
import {resolveEntity} from '../studio-core/references.ts';
import type {EditTransaction} from '../studio-core/commands.ts';
import type {StudioSession} from './session.ts';
import {node,button,field,numberInput,select} from './dom.ts';
interface Options {isActive:()=>boolean;inspector:()=>Promise<void>;message:(text:string,error?:boolean)=>void;}
/** Local viewport reuses the existing terrain/asset renderers. Source ownership stays in StudioSession. */
export async function mountLocal(host:HTMLElement,tools:HTMLElement,s:StudioSession,options:Options){
 const p=s.document,selected=s.selection.state.selected,entry=selected?p.entityIndex[selected.id]:undefined,context=s.selection.state.camera;
 const focus={x:entry?.position.x??context.x,z:entry?.position.z??context.z},radius=160;
 const visible=()=>affectedChunkIds(p.world,focus.x,focus.z,radius).filter(id=>!!p.chunkIndex[id]);
 await s.hydrate(visible());if(!options.isActive())return {focus:()=>{},dispose:()=>{}};const definition=toRuntimeWorld(p,visible());definition.config.viewDistance=radius;
 const scene=new THREE.Scene();configureScene(scene);const world=buildWorld(definition.config,definition);scene.add(world.root);
 const canvas=node('canvas'),renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 const camera=new THREE.PerspectiveCamera(51,1,.2,650),orbit=new OrbitControls(camera,canvas);camera.position.set(focus.x+24,terrainHeight(focus.x,focus.z)+28,focus.z-32);orbit.target.set(focus.x,terrainHeight(focus.x,focus.z)+1,focus.z);orbit.enableDamping=false;orbit.minDistance=5;orbit.maxDistance=130;orbit.maxPolarAngle=Math.PI/2.02;
 const transform=new TransformControls(camera,canvas);transform.showY=false;scene.add(transform.getHelper());const selectionBox=new THREE.BoxHelper(world.objects,0xf4c970);selectionBox.visible=false;scene.add(selectionBox);
 const brush=new THREE.Mesh(new THREE.RingGeometry(.95,1,40),new THREE.MeshBasicMaterial({color:0xffe8a6,side:THREE.DoubleSide,depthTest:false}));brush.rotation.x=-Math.PI/2;brush.renderOrder=20;brush.visible=false;scene.add(brush);
 let npcs=createNPCSystem(scene,definition.npcs),npcSignature=JSON.stringify(definition.npcs),disposed=false,frameId=0,remaining=40,renderCount=0,tool='select',asset='props.crate',brushRadius=10,strength=2,dragging=false,justTransformed=false,drawing=false;
 const models=new Map<string,{object:THREE.Group;signature:string}>(),clock=new FrameClock();const stats=node('div','','map-note'),wrap=node('div','','map-wrap');wrap.append(canvas,stats);host.replaceChildren(wrap);
 const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
 function selectedObject(){const id=s.selection.state.selected?.id;return id?(models.get(id)?.object??scene.getObjectByName('NPC:'+id)):undefined;}
 function highlight(){const object=selectedObject();transform.detach();selectionBox.visible=!!object;if(object){selectionBox.setFromObject(object);if(tool==='select')transform.attach(object);}invalidate(3);}
 function syncModels(){
  const ids=new Set(definition.placements.map(v=>v.id));for(const [id,model]of models)if(!ids.has(id)){transform.detach();removePlacement(model.object);models.delete(id);}
  for(const placement of definition.placements){const index=p.entityIndex[placement.id],entity=p.chunks[index.ownerChunkId]?.entities[placement.id];if(!entity)continue;const resolved=resolveEntity(p,entity),t=resolved.components.Transform!,signature=JSON.stringify([placement,t]);let model=models.get(placement.id);
   if(model?.signature===signature){model.object.position.y=terrainHeight(t.position.x,t.position.z)+t.position.y;continue;}
   if(model){transform.detach();removePlacement(model.object);}const object=addPlacement(world,placement);object.position.y+=t.position.y;object.quaternion.set(t.rotation.x,t.rotation.y,t.rotation.z,t.rotation.w);object.scale.set(t.scale.x,t.scale.y,t.scale.z);models.set(placement.id,{object,signature});
  }
  if(JSON.stringify(definition.npcs)!==npcSignature){transform.detach();npcs.dispose();npcs=createNPCSystem(scene,definition.npcs);npcSignature=JSON.stringify(definition.npcs);}npcs.update(0,0,focus);highlight();
 }
 function resize(){const r=wrap.getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();invalidate(5);}
 function draw(now:number){
  frameId=0;if(disposed)return;drawing=true;const frame=clock.advance(now,!document.hidden);
  if(frame.render){orbit.update();world.update(frame.renderDelta,focus);if(selectionBox.visible&&!dragging){const object=selectedObject();if(object)selectionBox.setFromObject(object);}renderer.render(scene,camera);remaining--;canvas.dataset.renderCount=String(++renderCount);canvas.dataset.pending=String(world.stats.pending);stats.textContent=`Vue locale · ${Object.keys(p.chunks).length} sources chargées · ${renderer.info.render.calls} appels · ${world.stats.active} secteurs visibles`;}
  drawing=false;if(remaining>0||world.stats.pending>0||dragging)frameId=requestAnimationFrame(draw);else canvas.dataset.idle='true';
 }
 function invalidate(frames=60){if(disposed)return;remaining=Math.max(remaining,frames);canvas.dataset.idle='false';if(!frameId&&!drawing){clock.reset();frameId=requestAnimationFrame(draw);}}
 let refreshQueue=Promise.resolve();
 function refresh(transaction?:EditTransaction){
  refreshQueue=refreshQueue.then(async()=>{if(disposed)return;await s.hydrate(visible());if(disposed)return;const next=toRuntimeWorld(p,visible());next.config.viewDistance=radius;Object.assign(definition,next);configureTerrain(definition.config,definition.terrain,definition.water,definition.paths);
   const terrainChanged=transaction?.patches.some(p=>p.path.some(k=>['terrainEdits','biomeEdits'].includes(k))||p.path[0]==='chunks'&&p.path.length===2);
   if(terrainChanged)for(const id of transaction!.affectedChunks){const c=chunkCoordinates(p.world,id),size=p.world.chunkSizeM;world.refreshTerrain(p.world.bounds.minX+(c.cx+.5)*size,p.world.bounds.minZ+(c.cz+.5)*size,size*.72);}
   syncModels();invalidate(40);
  }).catch(error=>options.message(String(error),true));
 }
 tools.replaceChildren(node('div','ÉDITION 3D LOCALE','kicker'),node('h3','Manipuler le monde'),select(tool,[['select','Sélection / déplacement'],['place','Placer un objet'],['raise','Élever le relief'],['lower','Abaisser le relief'],['flatten','Aplanir le relief'],['forest','Peindre une forêt'],['meadow','Peindre une prairie']],v=>{tool=v;s.selection.setTool(v);orbit.enableRotate=tool==='select'||tool==='place';brush.visible=false;highlight();}),select(asset,Object.values(p.assets).map(a=>[a.id,a.name] as const),v=>asset=v),field('Rayon du pinceau (m)',numberInput(brushRadius,v=>brushRadius=Math.max(1,Math.min(50,v)),1,50)),field('Force / hauteur',numberInput(strength,v=>strength=Math.max(0,Math.min(10,v)),0,10)),button('Centrer la sélection',()=>{const id=s.selection.state.selected?.id,index=id?p.entityIndex[id]:undefined;if(index)focusAt(index.position.x,index.position.z);}),node('p','Clic : sélectionner / placer. Flèches du gizmo : déplacer. Glisser le pinceau : une opération annulable. Clic droit : déplacer la vue.','muted'));
 function ground(e:PointerEvent){const r=canvas.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(world.terrain.children,true)[0]?.point;}
 let down:{x:number;y:number}|null=null,points:{x:number;z:number}[]=[],committing=false;
 function addPoint(e:PointerEvent){const point=ground(e);if(!point)return;const b=p.world.bounds;if(point.x<b.minX||point.x>b.maxX||point.z<b.minZ||point.z>b.maxZ)return;brush.position.set(point.x,point.y+.15,point.z);brush.scale.setScalar(brushRadius);brush.visible=true;const last=points.at(-1);if(points.length<64&&(!last||Math.hypot(last.x-point.x,last.z-point.z)>brushRadius*.45))points.push({x:point.x,z:point.z});invalidate(5);}
 const pointerDown=(e:PointerEvent)=>{if(e.button!==0||committing)return;down={x:e.clientX,y:e.clientY};if(!['select','place'].includes(tool)){orbit.enabled=false;points=[];addPoint(e);canvas.setPointerCapture(e.pointerId);}};
 const pointerMove=(e:PointerEvent)=>{if(down&&!['select','place'].includes(tool))addPoint(e);};
 const pointerUp=(e:PointerEvent)=>{if(e.button!==0||!down)return;const start=down;down=null;orbit.enabled=true;if(justTransformed||dragging){justTransformed=false;return;}void (async()=>{try{
  if(!['select','place'].includes(tool)){
   if(!points.length)return;committing=true;const pending=points;points=[];const chunks=[...new Set(pending.flatMap(q=>affectedChunkIds(p.world,q.x,q.z,brushRadius)))],strokeTool=tool,r=brushRadius,power=strength;
   await s.change(strokeTool==='forest'||strokeTool==='meadow'?'Peindre un biotope':'Sculpter le relief',chunks,d=>{for(const point of pending){const base={id:crypto.randomUUID(),...point,radius:r};if(strokeTool==='forest'||strokeTool==='meadow')putBiomeEdit(d,{...base,biome:strokeTool,density:Math.min(2,power)});else putTerrainEdit(d,{...base,mode:strokeTool as 'raise'|'lower'|'flatten',strength:power,height:power});}});options.message(`${pending.length} retouches · une opération dans l’historique.`);return;
  }
  if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)return;
  const point=ground(e);
  if(tool==='place'&&point){const ownerChunkId=chunkAt(p.world,point.x,point.z),id=crypto.randomUUID();await s.change('Placer un objet',[ownerChunkId],d=>putEntity(d,{id,kind:'prop',name:p.assets[asset].name,ownerChunkId,components:{Transform:{type:'Transform',position:{x:point.x,y:0,z:point.z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId:asset}}}));s.selection.select({kind:'entity',id});await options.inspector();return;}
  const roots=[...world.objects.children,...scene.children.filter(o=>o.name.startsWith('NPC:'))],hit=ray.intersectObjects(roots,true)[0];let object:THREE.Object3D|undefined=hit?.object;while(object&&!object.userData.placementId&&!object.name.startsWith('NPC:'))object=object.parent??undefined;const id=object?.userData.placementId??(object?.name.startsWith('NPC:')?object.name.slice(4):undefined);s.selection.select(id?{kind:'entity',id}:null);await options.inspector();
 }catch(error){options.message(String(error),true);}finally{committing=false;brush.visible=false;invalidate(20);}})();};
 canvas.addEventListener('pointerdown',pointerDown);canvas.addEventListener('pointermove',pointerMove);canvas.addEventListener('pointerup',pointerUp);const cancel=()=>{points=[];down=null;brush.visible=false;orbit.enabled=true;invalidate(3);};canvas.addEventListener('pointercancel',cancel);
 transform.addEventListener('dragging-changed',e=>{dragging=!!e.value;orbit.enabled=!dragging;if(dragging)justTransformed=true;invalidate(20);});transform.addEventListener('objectChange',()=>invalidate(2));transform.addEventListener('change',()=>invalidate(2));
 transform.addEventListener('mouseUp',()=>{const id=s.selection.state.selected?.id,index=id?p.entityIndex[id]:undefined,object=transform.object;if(!id||!index||!object)return;const position=object.position.clone();void (async()=>{try{const oldOwner=index.ownerChunkId,owner=chunkAt(p.world,position.x,position.z);await s.change('Déplacer un objet',[oldOwner,owner],d=>{const entity=structuredClone(d.chunks[oldOwner].entities[id]);const t=structuredClone(resolveEntity(d,entity).components.Transform!);t.position.x=position.x;t.position.z=position.z;entity.components.Transform=t;entity.ownerChunkId=owner;putEntity(d,entity);});await options.inspector();}catch(error){options.message(String(error),true);refresh();}})();});
 const onOrbit=()=>invalidate(3),onOrbitEnd=()=>{if(dragging)return;s.selection.setCamera({x:orbit.target.x,y:camera.position.y,z:orbit.target.z,mode:'orbit'});if(Math.hypot(focus.x-orbit.target.x,focus.z-orbit.target.z)>p.world.chunkSizeM*.5){focus.x=orbit.target.x;focus.z=orbit.target.z;refresh();}};orbit.addEventListener('change',onOrbit);orbit.addEventListener('end',onOrbitEnd);
 function focusAt(x:number,z:number){focus.x=x;focus.z=z;const delta=new THREE.Vector3(x-orbit.target.x,terrainHeight(x,z)+1-orbit.target.y,z-orbit.target.z);orbit.target.add(delta);camera.position.add(delta);refresh();}
 const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(wrap);const stopCommands=s.commands.subscribe(t=>refresh(t));let selectedId=s.selection.state.selected?.id;const stopSelection=s.selection.subscribe(c=>{if(c.selected?.id!==selectedId){selectedId=c.selected?.id;highlight();}});syncModels();resize();invalidate(40);
 return {focus:focusAt,dispose(){disposed=true;cancelAnimationFrame(frameId);stopCommands();stopSelection();resizeObserver.disconnect();orbit.dispose();transform.dispose();transform.detach();npcs.dispose();selectionBox.geometry.dispose();selectionBox.material.dispose();brush.geometry.dispose();brush.material.dispose();world.dispose();renderer.dispose();renderer.forceContextLoss();canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerup',pointerUp);canvas.removeEventListener('pointercancel',cancel);}};
}
