/** Small native resident population for opted-in settlements.
 * Always uses existing homes and civic anchors. Does not create economy resources.
 */
import type {ProjectDocument,EntityDefinitionV3,ActivityZoneV3} from '../studio-core/types.ts';
import type {ResidentRole} from '../npc-life/schedule.ts';
import type {SettlementRecipe,AmenityRecord,BuildingRecord} from './schema.ts';
import type {GameplayDialogue} from '../gameplay/schema.ts';
import {DEFAULT_APPEARANCE} from '../character-style.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {amenityChanged} from './services.ts';

export interface SettlementPopulation {
  entities:EntityDefinitionV3[];
  dialogues:Record<string,GameplayDialogue>;
  records:AmenityRecord[];
  preserved:string[];
  conflicts:string[];
  limited:boolean;
}
/** Keep 0–2 children per populated village: visual life, not one rig per house. */
export function settlementPopulation(p:ProjectDocument,r:SettlementRecipe,amenities:readonly AmenityRecord[],buildings:readonly BuildingRecord[],zones:readonly ActivityZoneV3[]=[]):SettlementPopulation{
  const output:SettlementPopulation={entities:[],dialogues:{},records:[],preserved:[],conflicts:[],limited:false};
  if(!r.localLife||!r.residentRoutines||buildings.length<6)return output;
  const old=p.libraries.settlements?.[r.id];
  if(old?.suppressedAmenities?.includes('resident'))return output;
  const place=amenities.find(a=>a.role==='well')??amenities.find(a=>a.role==='bench');
  if(!place)return output;
  const wanted=buildings.length>=10?2:1;
  const existingPeople=Object.values(p.entityIndex).filter(e=>e.kind==='character').length;
  const retainedPeople=(old?.amenities??[]).filter(a=>a.role==='resident'&&!!p.entityIndex[a.id]).length;
  const addingHost=old?.amenities?.some(a=>a.role==='host')?0:1;
  const count=Math.min(wanted,Math.max(0,100-existingPeople+retainedPeople-addingHost));
  output.limited=count<wanted;
  const sorted=[...buildings].sort((a,b)=>a.slot-b.slot);
  for(let i=0;i<count;i++){
    const id=r.id+'-resident-'+i;
    const previous=old?.amenities?.find(a=>a.id===id);
    const current=previous&&p.entityIndex[id]?p.chunks[p.entityIndex[id].ownerChunkId]?.entities[id]:undefined;
    if(previous&&amenityChanged(p,previous)){
      // Locked, edited or deliberately deleted sources must not be silently rebuilt.
      if(current){output.entities.push(structuredClone(current));output.records.push(structuredClone(previous));output.preserved.push(id);
        const dialogue=p.libraries.dialogues[id+'-talk'];if(dialogue)output.dialogues[dialogue.id]=structuredClone(dialogue);}
      continue;
    }
    if(p.entityIndex[id]&&!previous){output.conflicts.push(id);continue;}
    const home=sorted[Math.min(i+1,sorted.length-1)];
    if(!home||Math.hypot(place.entry.x-home.entry.x,place.entry.z-home.entry.z)<3)continue;
    const entity:EntityDefinitionV3={
      id,name:'Jeune habitant '+(i+1),kind:'character',ownerChunkId:chunkAt(p.world,home.entry.x,home.entry.z),
      components:{
        Transform:{type:'Transform',position:{...home.entry,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:.73,y:.73,z:.73}},
        Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',appearance:{...DEFAULT_APPEARANCE,hat:false,backpack:false,emotion:'joyful'}},
        DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},
        Resident:{type:'Resident',version:1,role:'child',
          home:{...home.entry},work:{...place.entry},homeAnchorId:home.id,workAnchorId:place.id},
      },
    };
    const dialogue:GameplayDialogue={
      id:id+'-talk',actorId:id,start:'hello',
      lines:[{id:'hello',text:'Bonjour ! On joue près de la place pendant la journée.',choices:[
        {id:'play',text:'Que faites-vous ?',next:'play'},
        {id:'bye',text:'Amusez-vous bien !'},
      ]},{id:'play',text:'On court le long des chemins. Le soir, on rentre à la maison.',choices:[{text:'À bientôt !'}]}],
    };
    output.entities.push(entity);output.dialogues[dialogue.id]=dialogue;
    output.records.push({id,role:'resident',entityHash:fingerprint(entity),dialogueHash:fingerprint(dialogue),entry:{...home.entry},locked:false});
  }
  // Adult professions are bound to native, placed job anchors. Decorative buildings
  // may provide ambiance but do not perform any economy transactions.
  const jobs:{role:ResidentRole;point:{x:number;z:number};anchorId:string}[]=[];
  const addJob=(role:ResidentRole,a:AmenityRecord|undefined)=>{
    if(a&&!jobs.some(j=>j.role===role))jobs.push({role,point:{...a.entry},anchorId:a.id});
  };
  const service=(role:string)=>amenities.find(a=>a.role===role);
  if(r.activity==='agriculture')addJob('miller',service('mill'));
  if(r.activity==='fishing')addJob('merchant',service('counter'));
  if(r.activity==='forest')addJob('woodcutter',service('fire'));
  if(r.activity==='mine')addJob('miner',service('counter'));
  if(r.activity==='commerce'||r.activity==='mixed')addJob('merchant',service('counter'));
  addJob('innkeeper',service('inn'));
  const field=zones.find(z=>z.kind==='farm-plot'&&z.farm?.assignment==='npc'&&z.polygon.length>0);
  if(field&&r.activity!=='agriculture'){
    const point=field.polygon.reduce((v,p)=>({x:v.x+p.x/field.polygon.length,z:v.z+p.z/field.polygon.length}),{x:0,z:0});
    if(!jobs.some(j=>j.role==='farmer'))jobs.push({role:'farmer',point,anchorId:field.id});
  }
  const workers=Math.min(jobs.length,buildings.length>=16?3:1);
  let available=Math.max(0,100-existingPeople+retainedPeople-addingHost-output.entities.filter(e=>!p.entityIndex[e.id]).length);
  if(available<workers)output.limited=true;
  for(let i=0;i<Math.min(workers,available);i++){
    const job=jobs[i],id=r.id+'-worker-'+i;
    const previous=old?.amenities?.find(a=>a.id===id);
    const current=previous&&p.entityIndex[id]?p.chunks[p.entityIndex[id].ownerChunkId]?.entities[id]:undefined;
    if(previous&&amenityChanged(p,previous)){
      if(current){output.entities.push(structuredClone(current));output.records.push(structuredClone(previous));output.preserved.push(id);
        const authored=p.libraries.dialogues[id+'-talk'];if(authored)output.dialogues[authored.id]=structuredClone(authored);}
      continue;
    }
    if(p.entityIndex[id]&&!previous){output.conflicts.push(id);continue;}
    const home=sorted[Math.min(count+i+2,sorted.length-1)];
    if(!home||Math.hypot(home.entry.x-job.point.x,home.entry.z-job.point.z)<3)continue;
    const appearance={...DEFAULT_APPEARANCE,hat:i%2===0,backpack:false,
      neckwear:(i%3===0?'scarf':'none') as 'scarf'|'none',emotion:'happy' as const};
    const entity:EntityDefinitionV3={
      id,name:job.role==='miller'?'Meunier du village':job.role==='merchant'?'Marchand du village':
        job.role==='innkeeper'?'Aubergiste':job.role==='farmer'?'Agriculteur du village':
        job.role==='woodcutter'?'Forestier':job.role==='miner'?'Mineur du village':'Habitant du village',
      kind:'character',ownerChunkId:chunkAt(p.world,home.entry.x,home.entry.z),
      components:{
        Transform:{type:'Transform',position:{...home.entry,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:.92,y:.92,z:.92}},
        Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',appearance},
        DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},
        Resident:{type:'Resident',version:1,role:job.role,home:{...home.entry},work:{...job.point},
          homeAnchorId:home.id,workAnchorId:job.anchorId},
      },
    };
    const dialogue:GameplayDialogue={id:id+'-talk',actorId:id,start:'hello',lines:[{
      id:'hello',text:'Bonjour ! Je travaille dans le village. Les habitants ont chacun leurs habitudes.',
      choices:[{id:'work',text:'Où travaillez-vous ?',next:'work'},{id:'bye',text:'À bientôt !'}],
    },{
      id:'work',text:job.role==='farmer'?'Je rejoins les champs des habitants.':
        job.role==='merchant'?'Je me rends au comptoir du village.':
        job.role==='innkeeper'?"Je passe mes journées près de l'auberge.":
        job.role==='miller'?'Je vais près du moulin.':
        job.role==='miner'?'Je m’occupe du comptoir minier.':
        job.role==='woodcutter'?'Je rejoins le camp de la forêt.':'Je vais à mon poste.',
      choices:[{text:'Merci pour les informations !'}],
    }]};
    output.entities.push(entity);output.dialogues[dialogue.id]=dialogue;
    output.records.push({id,role:'resident',entityHash:fingerprint(entity),dialogueHash:fingerprint(dialogue),
      entry:{...home.entry},locked:false});
    available--;
  }
  return output;
}
