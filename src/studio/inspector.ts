import * as THREE from 'three';
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {resolveEntity} from '../studio-core/references.ts';
import {applyTransforms,transformChunkIds,entityTransform,type TransformValue} from '../studio-core/transforms.ts';
import {updateCharacter} from '../studio-core/character-authoring.ts';
import {EMOTIONS,type Emotion,type Neckwear} from '../character-style.ts';

/** Serialised entity edits: rapid field changes never race each other (one transaction each). */
export const editQueue={pending:0,last:Promise.resolve() as Promise<unknown>,
  run(work:()=>Promise<unknown>):Promise<unknown>{this.pending++;const next=this.last.catch(()=>{}).then(work);this.last=next.finally(()=>{this.pending--;});return this.last;}};
export interface InspectorContext {
  session:StudioSession;
  status(text:string,error?:boolean):void;
  open(module:string):void;
  focus():void;
  /** Show a place in the 3D view with a comfortable framing. */
  view(x:number,z:number):void;
  duplicate():void;
  remove():void;
  refresh():void;
}
const KIND:Record<string,string>={prop:'Objet',building:'Bâtiment',character:'Personnage',trigger:'Zone',effect:'Effet'};
const deg=THREE.MathUtils.radToDeg,rad=THREE.MathUtils.degToRad;
export function eulerDegrees(r:TransformValue['rotation']){const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion(r.x,r.y,r.z,r.w),'YXZ');return {x:deg(e.x),y:deg(e.y),z:deg(e.z)};}
export function quaternionFromDegrees(d:{x:number;y:number;z:number}){const q=new THREE.Quaternion().setFromEuler(new THREE.Euler(rad(d.x),rad(d.y),rad(d.z),'YXZ'));return {x:q.x,y:q.y,z:q.z,w:q.w};}
/** E2/E3/E5 — contextual properties of the selection: identity, complete transform,
 * alignment, duplication, deletion, character routine and links to dialogue/interactions. */
let renderToken=0;
/** Built off-DOM and swapped in only if no newer render started (async hydration never duplicates fields). */
export async function renderInspector(target:HTMLElement,ctx:InspectorContext){
  const token=++renderToken,host=node('div');await buildInspector(host,ctx);if(token===renderToken)target.replaceChildren(...host.childNodes);
}
async function buildInspector(host:HTMLElement,ctx:InspectorContext){
  const s=ctx.session,p=s.document,ids=s.selection.selection.filter(v=>v.kind==='entity'&&p.entityIndex[v.id]).map(v=>v.id);
  host.replaceChildren(node('div','INSPECTEUR','kicker'));
  if(!ids.length){host.append(node('h3','Votre monde'),node('p','Clic : sélectionner · Maj+clic : ajouter · F : centrer · 7 : vue du dessus · clic droit : orienter (+ ZQSD/WASD pour voler) · clic molette : déplacer la vue.','muted'));return;}
  if(ids.length>1){
    host.append(node('h3',`${ids.length} éléments`),node('p',ids.map(id=>p.entityIndex[id].name).join(', '),'selection-tag'),
      button('Centrer (F)',ctx.focus),button('Aligner au sol',()=>alignAll(ctx,ids)),button('Dupliquer (Ctrl+D)',ctx.duplicate),button('Supprimer (Suppr)',ctx.remove),
      node('p','Le gizmo déplace, pivote ou met à l’échelle tout le groupe autour de son centre (W / E / R).','muted'));
    return;
  }
  const id=ids[0],entry=p.entityIndex[id];await s.hydrate([entry.ownerChunkId]);
  const source=p.chunks[entry.ownerChunkId]?.entities[id];if(!source){host.append(node('p','Secteur non chargé.','muted'));return;}
  const resolved=resolveEntity(p,source),t=entityTransform(p,id);
  host.append(node('h3',source.name),node('p',`${KIND[source.kind]??source.kind} · ${id}`,'selection-tag'));
  const change=(label:string,edit:(v:TransformValue)=>void)=>{void editQueue.run(async()=>{const current=p.entityIndex[id];if(!current)throw Error('Entité supprimée');await s.hydrate([current.ownerChunkId]);const next=entityTransform(p,id);edit(next);const update={id,transform:next};await s.change(label,transformChunkIds(p,[update]),d=>applyTransforms(d,[update]));ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));};
  const rename=(name:string)=>{void editQueue.run(async()=>{const current=p.entityIndex[id];if(!current||!name.trim())return;await s.change('Renommer '+source.name,[current.ownerChunkId],d=>{const e=d.chunks[current.ownerChunkId].entities[id];e.name=name.trim().slice(0,100);d.entityIndex[id]={...d.entityIndex[id],name:e.name};});ctx.refresh();}).catch(e=>ctx.status(String(e),true));};
  host.append(field('Nom',input(source.name,rename)));
  const position=node('fieldset');position.append(node('legend','Position (m)'));
  for(const axis of ['x','y','z'] as const)position.append(field(axis==='y'?'Position Y (m)':'Position '+axis.toUpperCase()+' (m)',numberInput(round(t.position[axis]),v=>change('Déplacer '+source.name,n=>{n.position[axis]=v;}),-10000,10000)));
  position.append(node('p','Y = hauteur au-dessus du sol.','muted'));
  const e=eulerDegrees(t.rotation),rotation=node('fieldset');rotation.append(node('legend','Rotation (°)'));
  for(const [axis,label]of [['y','Lacet (Y)'],['x','Tangage (X)'],['z','Roulis (Z)']] as const)rotation.append(field(label,numberInput(round(e[axis]),v=>change('Pivoter '+source.name,n=>{n.rotation=quaternionFromDegrees({...eulerDegrees(n.rotation),[axis]:v});}),-360,360)));
  const scale=node('fieldset');scale.append(node('legend','Échelle'),field('Échelle',numberInput(round(t.scale.x),v=>change('Mettre à l’échelle '+source.name,n=>{n.scale={x:v,y:v,z:v};}),.05,100)));
  const axes=node('details');axes.append(node('summary','Échelle par axe'));for(const axis of ['x','y','z'] as const)axes.append(field('Échelle '+axis.toUpperCase(),numberInput(round(t.scale[axis]),v=>change('Mettre à l’échelle '+source.name,n=>{n.scale[axis]=v;}),.05,100)));scale.append(axes);
  host.append(position,rotation,scale);
  const actions=node('div','','row');actions.append(button('Centrer (F)',ctx.focus),button('Aligner au sol',()=>change('Aligner au sol',n=>{n.position.y=0;n.rotation=quaternionFromDegrees({x:0,y:eulerDegrees(n.rotation).y,z:0});})),button('Dupliquer',ctx.duplicate),button('Supprimer',ctx.remove),button('Voir en 3D',()=>ctx.view(t.position.x,t.position.z)));host.append(actions);
  const logic=node('div','','row');logic.append(button('Configurer une interaction',()=>ctx.open('interactions')));if(resolved.components.Interactable)logic.append(node('span','Interaction : '+resolved.components.Interactable.prompt,'muted'));
  if(resolved.components.DialogueActor)logic.append(button('Ouvrir son dialogue',()=>ctx.open('dialogues')));host.append(node('h4','Logique'),logic);
  if(resolved.components.Character)host.append(characterSection(ctx,id,entry.ownerChunkId));
}
function round(v:number){return Math.round(v*1000)/1000;}
function alignAll(ctx:InspectorContext,ids:string[]){
  const s=ctx.session;void editQueue.run(async()=>{const updates=ids.map(id=>{const t=entityTransform(s.document,id);return {id,transform:{...t,position:{...t.position,y:0}}};});await s.change(`Aligner ${ids.length} éléments au sol`,transformChunkIds(s.document,updates),d=>applyTransforms(d,updates));ctx.refresh();}).catch(e=>ctx.status(String(e),true));
}
/** E5 — character identity, look and routine, reusing the shared character authoring. */
function characterSection(ctx:InspectorContext,id:string,owner:string){
  const s=ctx.session,p=s.document,source=p.chunks[owner].entities[id],c=resolveEntity(p,source).components,character=c.Character!,box=node('fieldset');
  let name=source.name,species=character.species,behavior=p.libraries.behaviors[c.Navigation?.behaviorId??'']?.kind??'idle',radius=c.Navigation?.radius??8,speed=c.Navigation?.speed??1;const appearance=structuredClone(character.appearance);
  const checkbox=(title:string,value:boolean,set:(v:boolean)=>void)=>{const e=node('input');e.type='checkbox';e.checked=value;e.onchange=()=>set(e.checked);return field(title,e);};
  box.append(node('legend','Personnage'),field('Nom du personnage',input(name,v=>name=v)),field('Morphologie',select(species,[['squirrel','Écureuil'],['animal','Petit animal']],v=>species=v as typeof species)),
    field('Activité',select(behavior,[['idle','Rester sur place'],['wander','Se promener'],['work','Travailler sur place'],['patrol','Patrouiller (trajet)']],v=>behavior=v as typeof behavior)),
    field('Rayon de promenade (m)',numberInput(radius,v=>radius=v,0,100)),field('Vitesse (m/s)',numberInput(speed,v=>speed=v,0,5)),
    checkbox('Chapeau',appearance.hat,v=>appearance.hat=v),checkbox('Sac à dos',appearance.backpack,v=>appearance.backpack=v),
    field('Accessoire de cou',select(appearance.neckwear,[['none','Aucun'],['pendant','Pendentif'],['scarf','Écharpe']],v=>appearance.neckwear=v as Neckwear)),
    field('Émotion',select(appearance.emotion,EMOTIONS.map(e=>[e,e] as const),v=>appearance.emotion=v as Emotion)),
    button('Appliquer le personnage',()=>void editQueue.run(async()=>{await s.change('Modifier le personnage',[p.entityIndex[id].ownerChunkId],d=>updateCharacter(d,id,{name,species,behavior,radius,speed,appearance}));ctx.status('Personnage appliqué. Son identifiant et ses dialogues sont conservés.');ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true)),'primary-button'),
    button('Éditer son dialogue',()=>ctx.open('dialogues')),button('Tracer son trajet',()=>ctx.open('patrol')));
  const path=c.Navigation?.path;box.append(node('p',path?.length?`Trajet : ${path.length} point(s).`:'Aucun trajet : « Tracer son trajet » puis cliquer dans la vue.','muted'));
  return box;
}
