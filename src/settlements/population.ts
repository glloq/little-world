/** Bounded, deterministic population authored from *qualified* settlement sources.
 * Each worker receives an actual home, a real job anchor and a certified walk.
 * Does not create resources, services or assets beyond the existing hamster rig.
 */
import type {ProjectDocument,EntityDefinitionV3,ActivityZoneV3} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord,BuildingRecord} from './schema.ts';
import type {GameplayDialogue} from '../gameplay/schema.ts';
import type {ResidentRole,ResidentPoint} from '../npc-life/schedule.ts';
import type {ResidentAssignmentPlanner,ResidentAssignment} from '../npc-life/assignments.ts';
import {localLifeCapabilities,type LifeJob} from '../npc-life/capabilities.ts';
import {DEFAULT_APPEARANCE} from '../character-style.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {amenityChanged} from './services.ts';

export interface LocalLifeWarning {code:string;message:string;targetId?:string}
export interface SettlementPopulation {
  entities:EntityDefinitionV3[];
  dialogues:Record<string,GameplayDialogue>;
  records:AmenityRecord[];
  preserved:string[];
  conflicts:string[];
  warnings:LocalLifeWarning[];
  limited:boolean;
  stats:{homes:number;jobs:number;play:number;assigned:number;unreachable:number;};
}
const label:Record<ResidentRole,string>={
  farmer:'Agriculteur',fisher:'Pêcheur',merchant:'Marchand',woodcutter:'Forestier',
  miner:'Mineur',miller:'Meunier',artisan:'Artisan',innkeeper:'Aubergiste',
  child:'Jeune habitant',villager:'Habitant',
};
const preferredJobs:Record<SettlementRecipe['activity'],readonly ResidentRole[]>={
  agriculture:['miller','merchant','farmer','innkeeper','artisan'],
  fishing:['merchant','fisher','innkeeper','artisan'],
  forest:['merchant','woodcutter','artisan','innkeeper'],
  mine:['merchant','miner','artisan','innkeeper'],
  commerce:['merchant','innkeeper','artisan','farmer'],
  mixed:['merchant','innkeeper','artisan','farmer','fisher'],
};
const priority=(r:SettlementRecipe,role:ResidentRole)=>{
  const index=preferredJobs[r.activity].indexOf(role);
  return index<0?30:index;
};
/** Preserve source-authored overrides, including deliberate deletion.
 * No generated dialogue is allowed to overwrite an authored dialogue.
 */
export function settlementPopulation(
  p:ProjectDocument,r:SettlementRecipe,amenities:readonly AmenityRecord[],
  buildings:readonly BuildingRecord[],zones:readonly ActivityZoneV3[],
  assignment:ResidentAssignmentPlanner,
):SettlementPopulation{
  const index=localLifeCapabilities(r,buildings,amenities,zones,p),old=p.libraries.settlements?.[r.id];
  const out:SettlementPopulation={entities:[],dialogues:{},records:[],preserved:[],
    conflicts:[],warnings:[],limited:false,
    stats:{homes:index.homes.length,jobs:index.jobs.length,play:index.play.length,assigned:0,unreachable:0}};
  if(!r.localLife||!r.residentRoutines)return out;
  if(old?.suppressedAmenities?.includes('resident'))return out;
  for(const code of index.warnings){
    if(code==='LIFE_NO_HOMES')out.warnings.push({code,message:'Aucune maison accessible pour créer des résidents.'});
    if(code==='LIFE_NO_JOBS')out.warnings.push({code,message:'Aucun poste professionnel qualifié dans le village.'});
    if(code==='LIFE_NO_PLAY_ANCHOR')out.warnings.push({code,message:'Pas de lieu public de jeu pour les enfants.'});
  }
  if(buildings.length<6)return out;
  const existingPeople=Object.values(p.entityIndex).filter(e=>e.kind==='character').length;
  const managed=(old?.amenities??[]).filter(a=>(a.role==='resident'||a.role==='host')&&!!p.entityIndex[a.id]).length;
  const hostNew=amenities.some(a=>a.role==='host'&&!p.entityIndex[a.id])?1:0;
  let budget=Math.max(0,100-existingPeople+managed-hostNew);
  const wantedChildren=r.residentDensity==='low'?(buildings.length>=10?1:0):
    r.residentDensity==='high'?Math.min(3,Math.floor(buildings.length/4)):buildings.length>=10?2:1;
  const workerSlots=r.residentDensity==='low'?(buildings.length>=10?1:0):
    r.residentDensity==='high'?(buildings.length>=16?4:2):buildings.length>=16?3:1;
  if(assignment.truncated)out.warnings.push({code:'LIFE_GRAPH_LIMIT',message:'Réseau piéton tronqué : certains trajets sont indisponibles.'});
  function retain(id:string):{status:'new'|'preserved'|'deleted'|'conflict';previous?:EntityDefinitionV3}{
    const record=old?.amenities?.find(a=>a.id===id);
    const loc=p.entityIndex[id],existing=loc?p.chunks[loc.ownerChunkId]?.entities[id]:undefined;
    if(record&&amenityChanged(p,record)){
      if(!existing)return {status:'deleted'};
      out.entities.push(structuredClone(existing));out.records.push(structuredClone(record));out.preserved.push(id);
      const dialogue=p.libraries.dialogues[id+'-talk'];
      if(dialogue)out.dialogues[dialogue.id]=structuredClone(dialogue);
      const home=existing.components.Resident?.homeAnchorId;
      if(home)assignment.reserve(home);
      return {status:'preserved'};
    }
    if(loc&&!record){out.conflicts.push(id);return {status:'conflict'};}
    return {status:'new',previous:existing};
  }
  function store(id:string,entity:EntityDefinitionV3,dialogue:GameplayDialogue,entry:ResidentPoint){
    out.entities.push(entity);out.dialogues[dialogue.id]=dialogue;
    out.records.push({id,role:'resident',entityHash:fingerprint(entity),dialogueHash:fingerprint(dialogue),entry:{...entry},locked:false});
    out.stats.assigned++;
  }
  function search(jobs:readonly LifeJob[],preferredHomeId?:string):ResidentAssignment|null{
    for(const job of jobs){
      const choice=assignment.allocate(job,index.homes,job.role,preferredHomeId);
      if(choice)return choice;
    }
    return null;
  }
  const play=[...index.play].sort((a,b)=>a.id.localeCompare(b.id));
  for(let i=0;i<wantedChildren;i++){
    const id=r.id+'-resident-'+i,check=retain(id);
    if(check.status!=='new')continue;
    if(budget<=0){out.limited=true;break;}
    const olderHome=check.previous?.components.Resident?.homeAnchorId;
    const possible=play.length?play.map((_,k)=>play[(i+k)%play.length]):[];
    const assigned=search(possible,olderHome);
    if(!assigned){
      out.stats.unreachable++;
      out.warnings.push({code:'LIFE_NO_SAFE_ROUTE',targetId:id,message:'Enfant omis : aucune maison reliée à un lieu de jeu accessible.'});
      continue;
    }
    const {home,job}=assigned;
    const entity:EntityDefinitionV3={id,name:'Jeune habitant '+(i+1),kind:'character',
      ownerChunkId:chunkAt(p.world,home.point.x,home.point.z),components:{
        Transform:{type:'Transform',position:{...home.point,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:.73,y:.73,z:.73}},
        Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',
          appearance:{...DEFAULT_APPEARANCE,hat:false,backpack:false,emotion:'joyful'}},
        DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},
        Resident:{type:'Resident',version:1,role:'child',home:{...home.point},work:{...job.point},
          homeAnchorId:home.id,workAnchorId:job.id},
      }};
    const dialogue:GameplayDialogue={id:id+'-talk',actorId:id,start:'hello',lines:[
      {id:'hello',text:'Bonjour ! On joue près de la place pendant la journée.',
        choices:[{id:'play',text:'Que faites-vous ?',next:'play'},{id:'bye',text:'Amusez-vous bien !'}]},
      {id:'play',text:'On court le long des chemins. Le soir, on rentre à la maison.',
        choices:[{text:'À bientôt !'}]},
    ]};
    store(id,entity,dialogue,home.point);budget--;
  }
  const jobs=[...index.jobs].sort((a,b)=>priority(r,a.role)-priority(r,b.role)
    ||a.id.localeCompare(b.id));
  // Each job anchor is reserved once. A generated worker never replaces an
  // authored character who already occupies that source location.
  for(let i=0;i<Math.min(workerSlots,jobs.length);i++){
    const id=r.id+'-worker-'+i,check=retain(id);
    if(check.status!=='new')continue;
    if(budget<=0){out.limited=true;break;}
    const previous=check.previous?.components.Resident;
    const availableJobs=jobs.filter(j=>assignment.jobOccupancy(j.id)<1).sort((a,b)=>
      Number(b.id===previous?.workAnchorId)-Number(a.id===previous?.workAnchorId)
      ||priority(r,a.role)-priority(r,b.role)||a.id.localeCompare(b.id));
    const selected=search(availableJobs,previous?.homeAnchorId);
    if(!selected){
      out.stats.unreachable++;
      out.warnings.push({code:'LIFE_JOB_UNREACHABLE',targetId:id,
        message:'Travailleur omis : aucun poste restant relié à une maison accessible.'});
      continue;
    }
    const {home,job}=selected;
    const appearance={...DEFAULT_APPEARANCE,hat:i%2===0,backpack:false,
      neckwear:(i%3===0?'scarf':'none') as 'scarf'|'none',emotion:'happy' as const};
    const entity:EntityDefinitionV3={id,name:label[job.role]+' du village',kind:'character',
      ownerChunkId:chunkAt(p.world,home.point.x,home.point.z),components:{
        Transform:{type:'Transform',position:{...home.point,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:.92,y:.92,z:.92}},
        Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',appearance},
        DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},
        Resident:{type:'Resident',version:1,role:job.role,home:{...home.point},work:{...job.point},
          homeAnchorId:home.id,workAnchorId:job.id},
      }};
    const dialogue:GameplayDialogue={id:id+'-talk',actorId:id,start:'hello',lines:[
      {id:'hello',text:'Bonjour ! Je travaille dans le village. Chaque habitant a ses habitudes.',
        choices:[{id:'work',text:'Où travaillez-vous ?',next:'work'},{id:'bye',text:'À bientôt !'}]},
      {id:'work',text:job.role==='farmer'?'Je rejoins les champs des habitants.':
        job.role==='merchant'?'Je me rends au comptoir du village.':
        job.role==='innkeeper'?"Je passe mes journées près de l'auberge.":
        job.role==='miller'?'Je vais près du moulin.':
        job.role==='miner'?'Je travaille près de la mine.':
        job.role==='woodcutter'?'Je rejoins le camp de la forêt.':
        job.role==='artisan'?"Je travaille à l'atelier.":
        job.role==='fisher'?'Je rejoins le rivage pour pêcher.':'Je vais à mon poste.',
        choices:[{text:'Merci pour les informations !'}]},
    ]};
    store(id,entity,dialogue,home.point);budget--;
  }
  if(budget<=0&&out.stats.assigned<wantedChildren+Math.min(workerSlots,jobs.length))out.limited=true;
  return out;
}
