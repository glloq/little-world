import {materializeComponents} from './entity-authoring.ts';
import {DEFAULT_APPEARANCE,type Appearance} from '../character-style.ts';
import {newDialogue} from '../dialogue-authoring.ts';
import type {ProjectDocument} from './types.ts';
import {chunkAt,string} from './schema.ts';
import {putEntity} from './source.ts';
import {resolveEntity} from './references.ts';
export function createCharacter(project:ProjectDocument,options:{id:string;name:string;x:number;z:number;species:'squirrel'|'animal'}){
 string(options.id,'ID personnage',80);
 if(project.entityIndex[options.id])throw Error('Cet identifiant existe déjà');if(!options.name.trim()||options.name.length>80||options.id.length>80||!['squirrel','animal'].includes(options.species))throw Error('Personnage invalide');
 const id=options.id,behaviorId='behavior:'+id,dialogueId='dialogue:'+id,ownerChunkId=chunkAt(project.world,options.x,options.z);
 project.libraries.behaviors={...project.libraries.behaviors,[behaviorId]:{id:behaviorId,kind:'idle'}};
 project.libraries.dialogues={...project.libraries.dialogues,[dialogueId]:{id:dialogueId,actorId:id,...newDialogue()}};
 putEntity(project,{id,name:options.name.trim(),kind:'character',ownerChunkId,components:{Transform:{type:'Transform',position:{x:options.x,y:0,z:options.z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Character:{type:'Character',species:options.species,rigId:'squirrel-rigid',appearance:{...DEFAULT_APPEARANCE}},Navigation:{type:'Navigation',behaviorId,speed:1,radius:8},BehaviorRef:{type:'BehaviorRef',behaviorId},DialogueActor:{type:'DialogueActor',dialogueIds:[dialogueId]}}});return id;
}
export function updateCharacter(project:ProjectDocument,id:string,options:{name:string;species:'squirrel'|'animal';appearance:Appearance;behavior:'idle'|'wander'|'work'|'patrol';radius:number;speed:number}){
 const index=project.entityIndex[id];if(!index||!project.chunks[index.ownerChunkId])throw Error('Charger le secteur du personnage');const source=project.chunks[index.ownerChunkId].entities[id],resolved=resolveEntity(project,source);if(!resolved.components.Character||!options.name.trim()||options.name.length>80)throw Error('Personnage invalide');
 const entity=materializeComponents(source,{Character:resolved.components.Character,...(resolved.components.Navigation?{Navigation:resolved.components.Navigation}:{}),...(resolved.components.BehaviorRef?{BehaviorRef:resolved.components.BehaviorRef}:{})});const behaviorId='behavior:'+id;entity.name=options.name.trim();entity.components.Character={...resolved.components.Character,species:options.species,appearance:structuredClone(options.appearance)};entity.components.Navigation={type:'Navigation',behaviorId,radius:options.radius,speed:options.speed,...(options.behavior==='patrol'&&resolved.components.Navigation?.path?{path:structuredClone(resolved.components.Navigation.path)}:{})};entity.components.BehaviorRef={type:'BehaviorRef',behaviorId};project.libraries.behaviors={...project.libraries.behaviors,[behaviorId]:{id:behaviorId,kind:options.behavior}};putEntity(project,entity);
}
