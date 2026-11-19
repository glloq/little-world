import {audioSoundIds} from '../audio/migrate.ts';
import {carryEditing} from './inspector-editing.ts';
import * as THREE from 'three';
import {node,button,field,input,numberInput,select} from './dom.ts';
import type {StudioSession} from './session.ts';
import {resolveEntity} from '../studio-core/references.ts';
import {applyTransforms,transformChunkIds,entityTransform,type TransformValue} from '../studio-core/transforms.ts';
import {layoutUpdates,type LayoutMode} from '../studio-core/selection-layout.ts';
import {updateCharacter,setCharacterPath,setResidentRoutine} from '../studio-core/character-authoring.ts';
import {residentDutyShift,RESIDENT_ROLES,type ResidentRole,type ResidentRoutineV1} from '../npc-life/schedule.ts';
import {residentAnchorChoices,reassignResident} from '../npc-life/authoring.ts';
import {residentRegistry} from '../npc-life/registry.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {applyInteraction,interactionChunkIds} from '../studio-core/interaction-templates.ts';
import {EMOTIONS,type Emotion,type Neckwear} from '../character-style.ts';
import {elementExists,elementLabel,type ElementRef} from '../studio-core/elements.ts';
import {renderElementInspector,lockToggle} from './element-inspector.ts';
import {lightSection} from './light-inspector.ts';

/** Serialised entity edits: rapid field changes never race each other (one transaction each). */
export const editQueue={pending:0,last:Promise.resolve() as Promise<unknown>,
  run(work:()=>Promise<unknown>):Promise<unknown>{this.pending++;const next=this.last.catch(()=>{}).then(work);this.last=next.finally(()=>{this.pending--;});return this.last;}};
export interface InspectorContext {
  session:StudioSession;
  status(text:string,error?:boolean):void;
  open(module:string):void;
  focus():void;
  /** Start the 3D polyline tool on a route/line/zone. */
  editPath(target:import('./viewport/polyline-tool.ts').PolylineTarget):void;
  /** Show a place in the 3D view with a comfortable framing. */
  view(x:number,z:number):void;
  duplicate():void;
  remove():void;
  refresh():void;
  /** E9 — elements touched by the last relief change (shown until dismissed). */
  impact?:{touched:number;items:{ref:ElementRef;severity:string;message:string;x:number;z:number}[];dismiss():void;select(ref:ElementRef,x:number,z:number):void};
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
  const token=++renderToken,host=node('div');await buildInspector(host,ctx);if(token!==renderToken)return;
  const restore=carryEditing(target,host);target.replaceChildren(...host.childNodes);restore();
}
async function buildInspector(host:HTMLElement,ctx:InspectorContext){
  const s=ctx.session,p=s.document,refs=s.selection.selection.filter(v=>elementExists(p,v)) as ElementRef[],ids=refs.filter(v=>v.kind==='entity').map(v=>v.id);
  host.replaceChildren(node('div','INSPECTEUR','kicker'));
  if(ctx.impact)host.append(impactSection(ctx.impact));
  if(refs.length>1&&ids.length!==refs.length){
    host.append(node('h3',`${refs.length} éléments`),node('p',refs.map(r=>elementLabel(p,r)).join(', '),'selection-tag'),
      button('Centrer (F)',ctx.focus),button('Dupliquer (Ctrl+D)',ctx.duplicate),button('Supprimer (Suppr)',ctx.remove),
      node('p','Le gizmo déplace tout le groupe (W) ; rotation et échelle ne s’appliquent qu’aux objets.','muted'));
    return;
  }
  if(refs.length===1&&refs[0].kind!=='entity'){renderElementInspector(host,refs[0],ctx);return;}
  if(!ids.length){
    host.append(node('h3','Votre monde'),node('p','Clic : sélectionner · Maj+clic : ajouter · F : centrer · 7 : vue du dessus · clic droit : orienter (+ ZQSD/WASD pour voler) · clic molette : déplacer la vue.','muted'));
    const audit=residentRegistry(p);
    if(audit.residents.length){
      const section=node('details');
      section.append(node('summary',`Vie locale : ${audit.residents.length} PNJ · ${audit.issues.length} alerte(s)`));
      section.append(node('p','Diagnostic limité aux secteurs chargés dans Studio. Les secteurs non chargés ne sont pas considérés comme validés.','muted'));
      for(const issue of audit.issues.slice(0,12)){
        const person=audit.residents.find(r=>r.id===issue.targetId);
        if(person)section.append(button(person.name+' · '+issue.message,()=>ctx.view(person.home.x,person.home.z)));
      }
      if(audit.issues.length>12)section.append(node('p',`Et ${audit.issues.length-12} autres alertes : charger le village et inspecter ses habitants.`,'muted'));
      host.append(section);
    }
    return;
  }
  if(ids.length>1){
    host.append(node('h3',`${ids.length} éléments`),node('p',ids.map(id=>p.entityIndex[id].name).join(', '),'selection-tag'),
      button('Centrer (F)',ctx.focus),button('Aligner au sol',()=>alignAll(ctx,ids)),
       button('Aligner X',()=>applyLayout(ctx,ids,'align-x')),button('Aligner Z',()=>applyLayout(ctx,ids,'align-z')),
       button('Espacer X',()=>applyLayout(ctx,ids,'distribute-x')),button('Espacer Z',()=>applyLayout(ctx,ids,'distribute-z')),
       button('Dupliquer (Ctrl+D)',ctx.duplicate),button('Supprimer (Suppr)',ctx.remove),
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
  if(resolved.components.NaturalStructure){
    const n=resolved.components.NaturalStructure;
    host.append(node('h4','Structure naturelle · '+n.kind),
      node('p',`Portée ${n.span.toFixed(1)} m · largeur ${n.width.toFixed(1)} m · hauteur libre ${n.clearance.toFixed(1)} m`,'muted'),
      node('p','Utilisez l’éditeur spécialisé pour déplacer, tourner ou redimensionner : les ouvertures de terrain et les collisions resteront synchronisées.','muted'),
      button('Modifier dans Structures naturelles',()=>ctx.open('natural')),
      button('Centrer (F)',ctx.focus),
      button('Supprimer avec excavation',ctx.remove));
    return;
  }
  const position=node('fieldset');position.append(node('legend','Position (m)'));
  for(const axis of ['x','y','z'] as const)position.append(field(axis==='y'?'Position Y (m)':'Position '+axis.toUpperCase()+' (m)',numberInput(round(t.position[axis]),v=>change('Déplacer '+source.name,n=>{n.position[axis]=v;}),-10000,10000)));
  position.append(node('p','Y = hauteur au-dessus du sol.','muted'));
  const e=eulerDegrees(t.rotation),rotation=node('fieldset');rotation.append(node('legend','Rotation (°)'));
  for(const [axis,label]of [['y','Lacet (Y)'],['x','Tangage (X)'],['z','Roulis (Z)']] as const)rotation.append(field(label,numberInput(round(e[axis]),v=>change('Pivoter '+source.name,n=>{n.rotation=quaternionFromDegrees({...eulerDegrees(n.rotation),[axis]:v});}),-360,360)));
  const scale=node('fieldset');scale.append(node('legend','Échelle'),field('Échelle',numberInput(round(t.scale.x),v=>change('Mettre à l’échelle '+source.name,n=>{n.scale={x:v,y:v,z:v};}),.05,100)));
  const axes=node('details');axes.append(node('summary','Échelle par axe'));for(const axis of ['x','y','z'] as const)axes.append(field('Échelle '+axis.toUpperCase(),numberInput(round(t.scale[axis]),v=>change('Mettre à l’échelle '+source.name,n=>{n.scale[axis]=v;}),.05,100)));scale.append(axes);
  host.append(position,rotation,scale);
  const actions=node('div','','row');actions.append(button('Centrer (F)',ctx.focus),button('Aligner au sol',()=>change('Aligner au sol',n=>{n.position.y=0;n.rotation=quaternionFromDegrees({x:0,y:eulerDegrees(n.rotation).y,z:0});})),button('Dupliquer',ctx.duplicate),button('Supprimer',ctx.remove),button('Voir en 3D',()=>ctx.view(t.position.x,t.position.z)),lockToggle(s,id,ctx.refresh));host.append(actions);
  const logic=node('div','','row');logic.append(button('Configurer une interaction',()=>ctx.open('interactions')));
  if(resolved.components.Interactable)logic.append(node('span','Interaction : '+resolved.components.Interactable.prompt,'muted'));
  else if(!resolved.components.Character){
    // One-click template: the object becomes a collectable resource (item + interaction + state).
    let resource=source.name;const quick=node('div','','row');
    quick.append(field('Ressource ramassée',input(resource,v=>resource=v)),button('Rendre collectable',()=>void editQueue.run(async()=>{const request={entityId:id,kind:'collect' as const,prompt:'Ramasser '+resource.trim().toLowerCase(),quantity:1,resourceName:resource,soundId:audioSoundIds(p.world.audio).includes('collect')?'collect':audioSoundIds(p.world.audio).includes('interaction.collect')?'interaction.collect':undefined};
      await s.change('Rendre collectable '+source.name,interactionChunkIds(p,request),d=>{applyInteraction(d,request);});ctx.status('Objet collectable : « Jouer ici » puis E pour le ramasser.');ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true)),'primary-button'));
    logic.append(quick);
  }
  if(resolved.components.DialogueActor)logic.append(button('Ouvrir son dialogue',()=>ctx.open('dialogues')));host.append(node('h4','Logique'),logic);
  if(resolved.components.Character)host.append(characterSection(ctx,id,entry.ownerChunkId));
  host.append(lightSection(ctx,id,source.components.Light));
}
function round(v:number){return Math.round(v*1000)/1000;}
function impactSection(impact:NonNullable<InspectorContext['impact']>){
  const box=node('div','','impact-card');box.dataset.count=String(impact.items.length);
  box.append(node('strong',impact.items.length?`Relief modifié : ${impact.items.length} point(s) à vérifier`:`Relief modifié : ${impact.touched} élément(s) touché(s), tous cohérents`));
  for(const item of impact.items.slice(0,8))box.append(button((item.severity==='ERROR'?'⛔ ':'⚠ ')+item.message,()=>impact.select(item.ref,item.x,item.z),'diagnostic '+item.severity));
  box.append(button('Masquer',impact.dismiss));return box;
}
function applyLayout(ctx:InspectorContext,ids:string[],mode:LayoutMode){
  void editQueue.run(async()=>{
    const s=ctx.session;
    await s.hydrate(ids.map(id=>s.document.entityIndex[id]?.ownerChunkId).filter((x):x is string=>!!x));
    const updates=layoutUpdates(s.document,ids,mode);
    await s.change('Organiser '+ids.length+' objets ('+mode+')',transformChunkIds(s.document,updates),d=>applyTransforms(d,updates));
    ctx.refresh();
  }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true));
}
function alignAll(ctx:InspectorContext,ids:string[]){
  const s=ctx.session;void editQueue.run(async()=>{const updates=ids.map(id=>{const t=entityTransform(s.document,id);return {id,transform:{...t,position:{...t.position,y:0}}};});await s.change(`Aligner ${ids.length} éléments au sol`,transformChunkIds(s.document,updates),d=>applyTransforms(d,updates));ctx.refresh();}).catch(e=>ctx.status(String(e),true));
}
/** E5 — character identity, look and routine, reusing the shared character authoring. */
function characterSection(ctx:InspectorContext,id:string,owner:string){
  const s=ctx.session,p=s.document,source=p.chunks[owner].entities[id],c=resolveEntity(p,source).components,character=c.Character!,box=node('fieldset');
  let name=source.name,species=character.species==='squirrel'?'hamster' as const:character.species,behavior=p.libraries.behaviors[c.Navigation?.behaviorId??'']?.kind??'idle',radius=c.Navigation?.radius??8,speed=c.Navigation?.speed??1;const appearance=structuredClone(character.appearance);
  const checkbox=(title:string,value:boolean,set:(v:boolean)=>void)=>{const e=node('input');e.type='checkbox';e.checked=value;e.onchange=()=>set(e.checked);return field(title,e);};
  box.append(node('legend','Personnage'),field('Nom du personnage',input(name,v=>name=v)),field('Morphologie',select(species,[['hamster','Hamster (habitants)'],['animal','Petit animal (faune)']],v=>species=v as typeof species)),
    field('Activité',select(behavior,[['idle','Rester sur place'],['wander','Se promener'],['work','Travailler sur place'],['patrol','Patrouiller (trajet)']],v=>behavior=v as typeof behavior)),
    field('Rayon de promenade (m)',numberInput(radius,v=>radius=v,0,100)),field('Vitesse (m/s)',numberInput(speed,v=>speed=v,0,5)),
    checkbox('Chapeau',appearance.hat,v=>appearance.hat=v),checkbox('Sac à dos',appearance.backpack,v=>appearance.backpack=v),
    field('Accessoire de cou',select(appearance.neckwear,[['none','Aucun'],['pendant','Pendentif'],['scarf','Écharpe']],v=>appearance.neckwear=v as Neckwear)),
    field('Émotion',select(appearance.emotion,EMOTIONS.map(e=>[e,e] as const),v=>appearance.emotion=v as Emotion)),
    button('Appliquer le personnage',()=>void editQueue.run(async()=>{await s.change('Modifier le personnage',[p.entityIndex[id].ownerChunkId],d=>updateCharacter(d,id,{name,species,behavior,radius,speed,appearance}));ctx.status('Personnage appliqué. Son identifiant et ses dialogues sont conservés.');ctx.refresh();}).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true)),'primary-button'),
    button('Éditer son dialogue',()=>ctx.open('dialogues')),button('Tracer son trajet',()=>ctx.editPath({label:'Trajet de '+source.name,points:c.Navigation?.path?.length?c.Navigation.path:[{x:(c.Transform?.position.x??0),z:(c.Transform?.position.z??0)}],min:2,max:100,color:0xf5a35b,commit:async points=>{await s.change('Tracer le trajet de '+source.name,[p.entityIndex[id].ownerChunkId],d=>setCharacterPath(d,id,points));ctx.refresh();}})));
  const path=c.Navigation?.path;box.append(node('p',path?.length?`Trajet : ${path.length} point(s).`:'Aucun trajet : « Tracer son trajet » puis cliquer dans la vue.','muted'));
  if(c.Resident){
    const resident=structuredClone(c.Resident),[from,to]=residentDutyShift(resident);
    let role:ResidentRole=resident.role,start=from,end=to;
    const life=node('details');
    const hour=node('input');hour.type='range';hour.min='0';hour.max='23.5';hour.step='.5';hour.value='12';
    const preview=node('p','','muted');
    const updatePreview=()=>{const h=Number(hour.value),visit=resident.activities?.find(a=>h>=a.startHour&&h<a.endHour);
      const activity=visit?visit.kind==='meal'?'Pause repas':visit.kind==='social'?'Rencontre et discussion':visit.kind==='play'?'Jeux':visit.kind==='rest'?'Repos':'Activité complémentaire':null;
      preview.textContent=h.toFixed(1).replace('.0','')+' h : '+(activity??(h<start||h>=end?'Au domicile':'Au lieu de travail'))+
        ' · trajet '+resident.home.x.toFixed(1)+','+resident.home.z.toFixed(1)+' → '+resident.work.x.toFixed(1)+','+resident.work.z.toFixed(1);};
    hour.oninput=updatePreview;updatePreview();
    life.append(node('summary','Vie quotidienne et métier'),
      field('Métier',select(role,RESIDENT_ROLES.map(k=>[k,k] as const),value=>role=value as ResidentRole)),
      field('Début du travail (heure du jeu)',numberInput(start,n=>{start=n;updatePreview();},0,24)),
      field('Fin du travail (heure du jeu)',numberInput(end,n=>{end=n;updatePreview();},0,24)),
      field('Aperçu de la journée',hour),preview,
      button('Appliquer les horaires',()=>void editQueue.run(async()=>{
        const next:ResidentRoutineV1={...resident,role,workStartHour:start,workEndHour:end};
        await s.change('Modifier les horaires du résident',[p.entityIndex[id].ownerChunkId],d=>setResidentRoutine(d,id,next));
        ctx.status('Routines quotidiennes enregistrées.');ctx.refresh();
      }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true))),
      button('Désactiver la routine',()=>void editQueue.run(async()=>{
        await s.change('Retirer la routine du personnage',[p.entityIndex[id].ownerChunkId],d=>setResidentRoutine(d,id,null));
        ctx.refresh();
      }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true))));
    // Existing native registry provides actionable Studio diagnostics without
    // creating another NPC state, save format, or background simulation.
    const diagnostics=residentRegistry(p).issues.filter(issue=>issue.targetId===id);
    if(diagnostics.length){
      const report=node('div');
      report.append(node('strong',`Cohérence PNJ : ${diagnostics.length} problème(s)`));
      for(const issue of diagnostics)report.append(node('p',issue.message,'muted'));
      life.append(report);
    }else{
      life.append(node('p','Aucune incohérence détectée dans les secteurs chargés.','muted'));
    }
    const anchors=residentAnchorChoices(p,id);
    if(anchors){
      let homeId=resident.homeAnchorId??'',jobId=resident.workAnchorId??'';
      life.append(field('Maison de résidence',select(homeId,[['','Choisir un domicile'],...anchors.homes.map(a=>[a.id,a.name] as const)],v=>homeId=v)),
        field('Poste de travail ou lieu public',select(jobId,[['','Choisir un lieu'],...anchors.jobs.map(a=>[a.id,a.name] as const)],v=>jobId=v)),
        button('Valider les affectations',()=>void editQueue.run(async()=>{
          const selectedHome=anchors.homes.find(a=>a.id===homeId);
          if(!selectedHome)throw Error('Sélectionner une maison existante');
          await s.fullDocument();
          const chunks=[p.entityIndex[id].ownerChunkId,chunkAt(p.world,selectedHome.point.x,selectedHome.point.z)];
          await s.change('Affecter domicile et métier du résident',[...new Set(chunks)],d=>reassignResident(d,id,homeId,jobId));
          ctx.status('Domicile et poste enregistrés ; chemin et horaires validés.');ctx.refresh();
        }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true))));
    }
    box.append(life);
  }else if(path&&path.length>=2){
    box.append(button('Créer une routine depuis le trajet',()=>void editQueue.run(async()=>{
      const routine:ResidentRoutineV1={type:'Resident',version:1,role:'villager',home:{...path[0]},work:{...path[path.length-1]}};
      await s.change('Activer la vie locale du personnage',[p.entityIndex[id].ownerChunkId],d=>setResidentRoutine(d,id,routine));
      ctx.status('Routine créée : renseigner le métier et les heures ci-dessous.');ctx.refresh();
    }).catch(e=>ctx.status(String(e instanceof Error?e.message:e),true))));
  }
  return box;
}
