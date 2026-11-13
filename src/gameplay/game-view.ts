import type * as THREE from 'three';
import type {NPCState} from '../npc.ts';
import {WorldCollisionQuery} from '../physics/collision-world.ts';
import type {CollisionDefinition} from '../physics/definitions.ts';
import {terrainHeight,waterSurface} from '../terrain.ts';
import {createGameplay} from './runtime.ts';
import {gameplayDialogueSession} from './dialogue-session.ts';
import {createGameSaveStore,scopedSaveStorage,type GameSaveV2} from './save.ts';
import {createActivityRuntime} from './activity-runtime.ts';
import type {PlayableActivities} from './activities.ts';
import type {MovementSpace} from '../physics/collision-world.ts';
import type {GameplayData,GameplayEntity,Point3} from './schema.ts';
import './game-view.css';
interface Options {onSound?:(id:string,position?:{x:number;y:number;z:number})=>void;collisions?:CollisionDefinition[];temporary:boolean;saveScope?:string;getPosition:()=>Point3;setPosition:(p:Point3,space?:MovementSpace|null)=>void;activities?:PlayableActivities;getSpace?:()=>MovementSpace|undefined;showInfo:(text:string)=>void;objects:THREE.Group;}
const element=<K extends keyof HTMLElementTagNameMap>(tag:K,text='')=>{const e=document.createElement(tag);e.textContent=text;return e;};
/** Bounded UI/effect adapter. It never opens the Studio authoring database. */
export function createGameplayView(data:GameplayData,options:Options){
 const runtime=createGameplay(data),slots=createGameSaveStore(options.temporary?scopedSaveStorage(sessionStorage,options.saveScope??'test'):undefined);
 const root=element('section'),heading=element('h2','Sac et parties'),inventory=element('div'),objectives=element('div'),slotRows=element('div'),feedback=element('p'),close=element('button','Reprendre l’exploration'),launcher=element('button',options.temporary?'Sac · Test temporaire':'Sac · Sauvegardes');
 root.className='game-save-panel';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','Sac et sauvegardes');root.setAttribute('aria-modal','true');launcher.className='game-save-launcher light-button';root.append(heading,element('p',options.temporary?'Partie de test : slots temporaires, séparés des vraies parties.':'Parties locales conservées dans ce navigateur. Exportez un slot pour le protéger.'),inventory,objectives,slotRows,feedback,close);document.body.append(root,launcher);
 const collisionDefinitions=new Map((options.collisions??[]).map(d=>[d.id,d]));
 const collision=new WorldCollisionQuery(terrainHeight,waterSurface);for(const definition of options.collisions??[]){const height=terrainHeight(definition.groundAnchor.x,definition.groundAnchor.z);collision.add({...definition,position:{...definition.position,y:definition.position.y+height},enabled:()=>{const state=runtime.state.entities[definition.id];return state?.open!==true&&state?.collected!==true;}});}
 const activities=createActivityRuntime(options.activities??{mines:[],farms:[]},{grant:changes=>runtime.grantItems(changes),time:()=>runtime.state.time,climate:runtime.climate,collision,ground:terrainHeight,water:waterSurface});
 /** Core gameplay state + active space + activity differences, in one versioned save. */
 const compose=(slotId:string):GameSaveV2=>({...runtime.save(slotId,options.getPosition()),space:options.getSpace?.()??null,...activities.serialize()});
 let npcs:readonly NPCState[]=[],version=-1,previousFocus:HTMLElement|null=null,disposed=false;
 const entityIds=new Set(runtime.data.entities.map(e=>e.id)),targets=runtime.data.entities.filter(e=>e.interactable),interactions=new Map<string,typeof runtime.data.interactions>();
 for(const i of runtime.data.interactions)if(i.trigger.type==='onInteract'){const list=interactions.get(i.trigger.entityId)??[];list.push(i);interactions.set(i.trigger.entityId,list);}
 const models=new Map(options.objects.children.filter(m=>m.userData.placementId).map(m=>[m.userData.placementId as string,{object:m,rotation:m.rotation.y}]));
 // Data positions are terrain-relative author coordinates. Runtime queries use actual Y.
 for(const entity of runtime.data.entities)if(entity.position)runtime.setEntityPosition(entity.id,{...entity.position,y:terrainHeight(entity.position.x,entity.position.z)+entity.position.y});
 function sync(){
  for(const [id,model] of models){const state=runtime.state.entities[id];if(!state)continue;model.object.visible=state.collected!==true;model.object.rotation.y=model.rotation+(state.open===true?Math.PI/2:0);}
 }
 const button=(text:string,task:()=>Promise<unknown>|unknown)=>{const b=element('button',text);b.type='button';b.onclick=()=>void Promise.resolve().then(task).catch(error=>{feedback.textContent=String(error);});return b;};
 const download=(slot:string,text:string)=>{const url=URL.createObjectURL(new Blob([text],{type:'application/json'})),a=element('a');a.href=url;a.download=slot+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 function renderInventory(){
  inventory.replaceChildren(element('h3','Inventaire'));let count=0;for(const item of runtime.data.items){const quantity=runtime.state.inventory[item.id]??0;if(!quantity)continue;inventory.append(element('p',`${item.name} : ${quantity}`));count++;}if(!count)inventory.append(element('p','Votre sac est vide.'));
  objectives.replaceChildren(element('h3','Petites missions'));const labels={locked:'À découvrir',active:'En cours',complete:'Terminée'};
  for(const objective of runtime.data.objectives)objectives.append(element('p',`${objective.name} — ${labels[runtime.state.objectives[objective.id]]}`));
 }
 async function renderSlots(){
  slotRows.replaceChildren(element('h3',options.temporary?'Slots de test':'Slots de partie'));const available=await slots.list(data.worldId);
  for(const id of ['slot-1','slot-2','slot-3']){const current=available.find(s=>s.slotId===id),row=element('div');row.className='game-slot-row';row.append(element('strong',id.replace('slot-','Partie ')),element('span',current?.error?'Illisible : '+current.error:current?.savedAt?new Date(current.savedAt).toLocaleString('fr'):'Vide'),button('Sauvegarder',async()=>{const r=await slots.save(compose(id));feedback.textContent=r.external?'Partie sauvegardée (détails des mines et parcelles dans le stockage IndexedDB du navigateur).':'Partie sauvegardée.';await renderSlots();}));
   if(current&&!current.error)row.append(button('Charger',async()=>{const save=await slots.load(data.worldId,id);if(!save)throw Error('Slot absent');const warnings=[...runtime.restore(save),...activities.restore(save)];options.setPosition(save.position,save.space??null);sync();renderInventory();feedback.textContent=warnings.length?warnings.join(' · '):'Partie restaurée.';}),button('Exporter',async()=>{const save=await slots.load(data.worldId,id);if(save)download(id,JSON.stringify(save,null,2));}));slotRows.append(row);
  }
  slotRows.append(button('Exporter la partie en cours',()=>download('partie-en-cours',JSON.stringify(compose('slot-export'),null,2))));
  const imported=element('input');imported.type='file';imported.accept='.json,application/json';imported.setAttribute('aria-label','Importer une sauvegarde');imported.onchange=()=>void Promise.resolve().then(async()=>{const file=imported.files?.[0];if(!file)return;if(file.size>20_000_000)throw Error('Sauvegarde trop volumineuse');const raw=JSON.parse(await file.text());if(raw.worldId!==data.worldId)throw Error('Sauvegarde d’un autre monde');if(!['slot-1','slot-2','slot-3'].includes(raw.slotId)){const used=new Set((await slots.list(data.worldId)).map(v=>v.slotId)),free=['slot-1','slot-2','slot-3'].find(id=>!used.has(id));if(!free)throw Error('Libérez un slot pour importer cette partie');raw.slotId=free;}await slots.save(raw);feedback.textContent='Slot importé. Chargez-le pour reprendre.';await renderSlots();}).catch(e=>feedback.textContent=String(e));slotRows.append(imported);
 }
 function dismiss(){root.hidden=true;previousFocus?.focus();}
 launcher.onclick=()=>{previousFocus=document.activeElement as HTMLElement;root.hidden=false;feedback.textContent='';renderInventory();void renderSlots().catch(e=>feedback.textContent=String(e));close.focus();};close.onclick=dismiss;
 const onKey=(e:KeyboardEvent)=>{if(root.hidden)return;if(e.key==='Escape'){e.preventDefault();dismiss();}if(e.key==='Tab'){const controls=[...root.querySelectorAll<HTMLElement>('button,input')],at=controls.indexOf(document.activeElement as HTMLElement);controls[(at+(e.shiftKey?-1:1)+controls.length)%controls.length]?.focus();e.preventDefault();}};window.addEventListener('keydown',onKey);
 function nearest(position:Point3):GameplayEntity|undefined {
  let best:GameplayEntity|undefined,distance=Infinity;
  for(const entity of targets){if(!entity.interactable||!entity.position||runtime.state.entities[entity.id]?.collected===true)continue;
   const usable=(interactions.get(entity.id)??[]).some(i=>!(i.repeat==='once'&&runtime.state.executed[i.id])&&(!i.condition||runtime.evaluate(i.condition)));if(!usable)continue;
   const d=Math.hypot(position.x-entity.position.x,position.y-entity.position.y,position.z-entity.position.z);if(d<=entity.interactable.range&&d<distance){distance=d;best=entity;}
  }return best;
 }
 sync();
 return {
  runtime,collision,activities,get isOpen(){return !root.hidden;},dialogueSession:(state:NPCState)=>gameplayDialogueSession(runtime,state.definition.id),attachNPCs(states:readonly NPCState[]){npcs=states;},
  prompt(position:Point3){runtime.state.playerPosition={...position};const target=nearest(position);return target?'[E] '+target.interactable!.prompt:null;},
  interact(position:Point3){runtime.state.playerPosition={...position};const target=nearest(position);return target?runtime.interact(target.id,position):false;},
  update(dt:number){
   if(disposed)return;runtime.state.playerPosition={...options.getPosition()};for(const npc of npcs)if(entityIds.has(npc.definition.id)){runtime.setEntityPosition(npc.definition.id,{x:npc.x,y:npc.y,z:npc.z});const body=collisionDefinitions.get(npc.definition.id);if(body)collision.moveBody(body.id,{x:npc.x+body.position.x-body.groundAnchor.x,y:npc.y+body.position.y,z:npc.z+body.position.z-body.groundAnchor.z});}
   runtime.update(dt);for(const effect of runtime.drainEffects()){
    if(effect.type==='showText')options.showInfo(effect.text);
    else if(effect.type==='playSound')options.onSound?.(effect.soundId,effect.entityId?runtime.data.entities.find(e=>e.id===effect.entityId)?.position:undefined);
    else if(effect.type==='startDialogue')options.showInfo('Approchez du personnage pour ouvrir sa conversation.');
    else options.showInfo('Effet de présentation non pris en charge : '+effect.type);
   }
   if(runtime.state.metrics.actions!==version){version=runtime.state.metrics.actions;sync();if(!root.hidden)renderInventory();}
   const diagnostic=runtime.state.diagnostics.splice(0);if(diagnostic.length)options.showInfo(diagnostic.at(-1)!);
  },dispose(){disposed=true;root.remove();launcher.remove();window.removeEventListener('keydown',onKey);}
 };
}
export type GameplayView=ReturnType<typeof createGameplayView>;
