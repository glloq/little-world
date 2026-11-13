/** Reproducible authoring fixture for G1/G2. Not the complete B1 release. */
import {readFile,writeFile} from 'node:fs/promises';
import {migrateWorldToV3,toRuntimeWorld} from '../src/studio-core/migration.ts';
import {chunkAt,parseProject} from '../src/studio-core/schema.ts';
import {putEntity} from '../src/studio-core/source.ts';
import {gameplayDataFromProject} from '../src/gameplay/project-adapter.ts';
import {makeCollect,makeDeliver,makePuzzle} from '../src/gameplay/templates.ts';
import {defaultEnvironment} from '../src/environment/climate.ts';
import {collisionDefinitionsFromProject} from '../src/studio-core/collision-adapter.ts';
import {parsePlayableWorld} from '../src/gameplay/playable.ts';
const base=JSON.parse(await readFile(new URL('../maps/default.json',import.meta.url),'utf8'));base.name='Clairière des petits services';base.config.width=1000;base.config.length=1000;
const {project:p}=migrateWorldToV3(base,{projectId:'little-world-beta-authoring',worldId:'little-world-beta'});
p.world.audio=JSON.parse(await readFile(new URL('../public/audio/default.json',import.meta.url),'utf8'));
p.world.environment=defaultEnvironment(p.world.seed);
function prop(id,name,assetId,x,z,initial={},prompt){const ownerChunkId=chunkAt(p.world,x,z);const e={id,name,kind:'prop',ownerChunkId,components:{Transform:{type:'Transform',position:{x,y:0,z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Visual:{type:'Visual',assetId},State:{type:'State',initial},Persistence:{type:'Persistence',fields:Object.keys(initial)},...(prompt?{Interactable:{type:'Interactable',prompt,range:4,interactionIds:['action:'+id]}}:{})}};putEntity(p,e);return e;}
prop('beta-acorn','Panier de glands','props.crate',-24,-180,{collected:false},'Ramasser un gland');
prop('beta-lever','Levier de la clairière','props.crate',-20,-180,{active:false},'Actionner le levier');
prop('beta-panel','Lanterne du mécanisme','props.lantern',-20,-175,{},'Essayer le mécanisme');
const gate=prop('beta-gate','Barrière de démonstration','props.crate',-16,-174,{open:false});gate.components.Collider={type:'Collider',shape:'box',size:{x:2,y:2,z:2},layer:'solid'};putEntity(p,gate);
p.libraries.items.acorn={id:'acorn',name:'Gland',category:'nature',maxQuantity:9};p.libraries.objectives.delivery={id:'delivery',name:'Apporter un gland à Galopin',initialStatus:'locked',persistent:true};
const actorId='woodland-animal',old=p.entityIndex[actorId],actor=structuredClone(p.chunks[old.ownerChunkId].entities[actorId]);actor.name='Galopin';actor.components.Transform.position={x:-30,y:0,z:-180};actor.ownerChunkId=chunkAt(p.world,-30,-180);actor.components.Navigation={type:'Navigation',behaviorId:'behavior:'+actorId,speed:0,radius:0};p.libraries.behaviors['behavior:'+actorId]={id:'behavior:'+actorId,kind:'idle'};actor.components.DialogueActor={type:'DialogueActor',dialogueIds:['beta-talk']};actor.components.Interactable={type:'Interactable',prompt:'Livrer le gland à Galopin',range:4,interactionIds:['action:delivery']};putEntity(p,actor);
p.libraries.dialogues['beta-talk']={id:'beta-talk',actorId,start:'hello',lines:[{id:'hello',text:'Bonjour ! Peux-tu me rapporter un gland du panier ? Le levier et la lanterne cachent aussi un petit mécanisme.',choices:[{id:'accept',text:'Avec plaisir.',gate:{type:'objectiveState',objectiveId:'delivery',status:'locked'},actions:[{type:'setObjective',objectiveId:'delivery',status:'active'}],next:'thanks'},{text:'À bientôt.'}]},{id:'thanks',text:'Merci ! Rapporte-moi un gland avec E. Tu peux sauvegarder depuis ton sac.',choices:[{text:'Je vais voir.'}]}]};
p.libraries.interactions['action:beta-acorn']=makeCollect('action:beta-acorn','beta-acorn','acorn');
const deliver=makeDeliver('action:delivery',actorId,'acorn','delivery');deliver.condition={type:'all',conditions:[deliver.condition,{type:'objectiveState',objectiveId:'delivery',status:'active'}]};p.libraries.interactions[deliver.id]=deliver;
p.libraries.interactions['action:beta-lever']={id:'action:beta-lever',trigger:{type:'onInteract',entityId:'beta-lever'},repeat:'always',persistent:true,sequence:[{type:'toggleState',entityId:'beta-lever',key:'active'},{type:'showText',text:'Le levier a changé de position. Essayez la lanterne.'}]};
p.libraries.interactions['action:beta-panel']=makePuzzle('action:beta-panel','beta-panel','beta-gate',[{type:'stateEquals',entityId:'beta-lever',key:'active',value:true}]);
p.libraries.activities['activity:delivery']={id:'activity:delivery',kind:'deliver',name:'Le petit service de Galopin',interactionIds:['action:beta-acorn','action:delivery'],objectiveId:'delivery'};p.libraries.activities['activity:puzzle']={id:'activity:puzzle',kind:'puzzle',name:'Le levier et la lanterne',interactionIds:['action:beta-lever','action:beta-panel']};
// The old authored conversation is still a valid library entry; its actor keeps the same stable ID.
for(const [id,soundId]of [['action:beta-acorn','collect'],['action:delivery','mission'],['action:beta-lever','lever'],['action:beta-panel','mission']])p.libraries.interactions[id].sequence.push({type:'playSound',soundId});
const project=parseProject(p),bundle=parsePlayableWorld({schemaVersion:1,kind:'playable-world',audio:project.world.audio,world:toRuntimeWorld(project),collisions:collisionDefinitionsFromProject(project),gameplay:gameplayDataFromProject(project,'beta-audio-v1'),spawn:{x:-24,y:0,z:-183}});
await writeFile(new URL('../maps/beta.project.json',import.meta.url),JSON.stringify(project,null,2)+'\n');await writeFile(new URL('../public/maps/beta.project.json',import.meta.url),JSON.stringify(project)+'\n');await writeFile(new URL('../public/maps/beta.json',import.meta.url),JSON.stringify(bundle)+'\n');console.log('Beta fixture: 1000 × 1000 m source, 4 NPCs, collection/delivery and two-step mechanism; not qualified B1.');
