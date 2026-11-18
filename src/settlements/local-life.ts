/** One useful animal inhabitant at a validated public access; native dialogues, no new runtime. */
import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import type {SettlementRecipe,AmenityRecord,BuildingRecord} from './schema.ts';
import type {ActivityZoneV3} from '../studio-core/types.ts';
import type {ResidentRole} from '../npc-life/schedule.ts';
import type {GameplayDialogue} from '../gameplay/schema.ts';
import {DEFAULT_APPEARANCE} from '../character-style.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {amenityChanged} from './services.ts';
export function localLife(p:ProjectDocument,r:SettlementRecipe,amenities:AmenityRecord[],buildings:readonly BuildingRecord[]=[],zones:readonly ActivityZoneV3[]=[]){
 const old=p.libraries.settlements?.[r.id]?.amenities?.find(a=>a.role==='host'),oldEntity=old&&p.chunks[p.entityIndex[old.id]?.ownerChunkId]?.entities[old.id];
 if(old&&oldEntity&&amenityChanged(p,old))return {entity:structuredClone(oldEntity),record:structuredClone(old),dialogue:p.libraries.dialogues[old.id+'-talk'],preserved:true};
 if(!r.localLife)return null;
 const anchor=amenities.find(a=>a.role==='counter')??amenities.find(a=>a.role==='well');if(!anchor)return null;
 const home=[...buildings].sort((a,b)=>Math.hypot(a.entry.x-anchor.entry.x,a.entry.z-anchor.entry.z)-Math.hypot(b.entry.x-anchor.entry.x,b.entry.z-anchor.entry.z)||a.slot-b.slot)[0];
 const field=r.activity==='agriculture'?zones.find(z=>z.kind==='farm-plot'&&z.farm?.assignment==='npc'):undefined;
 const farmPoint=field?.polygon.length?field.polygon.reduce((p,q)=>({x:p.x+q.x/field.polygon.length,z:p.z+q.z/field.polygon.length}),{x:0,z:0}):null;
 const shore=r.activity==='fishing'?amenities.find(a=>a.role==='shore-hut'||a.role==='harbor'):undefined;
 const role:ResidentRole=r.activity==='agriculture'&&farmPoint?'farmer':r.activity==='fishing'&&shore?'fisher':r.activity==='forest'?'woodcutter':r.activity==='mine'?'miner':r.activity==='commerce'?'merchant':'villager';
 const work=role==='farmer'?farmPoint!:shore?.entry??anchor.entry;
 const workAnchorId=role==='farmer'?field!.id:shore?.id??anchor.id;
 // No fake household when the generator found no usable house.
 const resident=home&&Math.hypot(home.entry.x-work.x,home.entry.z-work.z)>2
   ?{Resident:{type:'Resident' as const,version:1 as const,role,home:{...home.entry},work:{...work},homeAnchorId:home.id,workAnchorId}}:{};
 const id=r.id+'-host',point=anchor.entry,entity:EntityDefinitionV3={id,kind:'character',name:r.activity==='fishing'?'Habitant du rivage':'Habitant du village',ownerChunkId:chunkAt(p.world,point.x,point.z),components:{Transform:{type:'Transform',position:{...point,y:0},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},Character:{type:'Character',species:'squirrel',rigId:'squirrel-rigid',appearance:{...DEFAULT_APPEARANCE}},DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']},...resident}};
 const dialogue:GameplayDialogue={id:id+'-talk',actorId:id,start:'hello',lines:[{id:'hello',text:'Bienvenue ! Que cherchez-vous ?',choices:[{id:'activity',text:'Que fait-on ici ?',next:'activity'},{id:'places',text:'Où aller ?',next:'places'},{id:'bye',text:'Au revoir !'}]},{id:'activity',text:r.activity==='fishing'?'Notre comptoir achète les poissons. Les poissons de rivière et de mer sont différents.':r.activity==='agriculture'?'Le comptoir propose des semences pour les cultures.':'Le comptoir permet de vendre les produits locaux et de trouver des provisions.',choices:[{text:'Merci.'}]},{id:'places',text:amenities.some(a=>a.role==='bridge')?'Le pont relie les deux rives. Les maisons de l’autre quartier sont accessibles à pied.':amenities.some(a=>a.role==='inn')?'Une auberge se trouve près du village. Son comptoir propose des provisions.':'Les équipements communs sont près du point d’activité du village.',choices:[{text:'Merci.'}]}]};
 return {entity,dialogue,record:{id,role:'host',entry:point,locked:false,entityHash:fingerprint(entity),dialogueHash:fingerprint(dialogue)} as AmenityRecord,preserved:false};
}
