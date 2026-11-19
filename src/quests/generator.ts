/** A small, SOLVABILITY-GATED social quest generator for native resident
 * villages. Does not invent NPCs, routes, goods or pseudo work events.
 * Q7 catalog is opt-in: only real resident dialogues and certified footpaths.
 */
import type {NPCDefinition} from '../npc.ts';
import type {GameplayData} from '../gameplay/schema.ts';
import type {ResidentPoint} from '../npc-life/schedule.ts';
import type {QuestCatalogEntryV1} from './schema.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';

const ident=(s:string)=>/^[a-zA-Z0-9_.:-]{1,100}$/.test(s);
const groupId=(id:string):string|null=>/^(.*)-(?:resident-\d+|worker-\d+|host)$/.exec(id)?.[1]??null;
export function generateResidentSocialQuestOffers(
 npcs:readonly NPCDefinition[],gameplay:Pick<GameplayData,'dialogues'|'entities'|'objectives'|'items'>,
 islandId:string,
 route:(from:ResidentPoint,to:ResidentPoint)=>{length:number}|null,
 maxOffers=12,
):QuestCatalogEntryV1[]{
 if(!ident(islandId)||!Number.isSafeInteger(maxOffers)||maxOffers<0||maxOffers>24)
  throw Error('Social quest generation: invalid island or budget');
 if(maxOffers===0)return [];
 const dialogueActors=new Set(gameplay.dialogues.filter(d=>d.lines?.length&&
  d.lines.some(l=>l.choices?.length))
  .map(d=>d.actorId??gameplay.entities.find(e=>e.dialogueIds?.includes(d.id))?.id)
  .filter((id):id is string=>!!id));
 const groups=new Map<string,NPCDefinition[]>();
 for(const npc of npcs){
  const settlement=groupId(npc.id),r=npc.routine;
  if(!settlement||!r||!r.homeAnchorId||!r.workAnchorId||
   !ident(npc.id)||!dialogueActors.has(npc.id))continue;
  const group=groups.get(settlement)??[];group.push(npc);groups.set(settlement,group);
 }
 const out:QuestCatalogEntryV1[]=[];
 for(const [settlement,group]of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
  group.sort((a,b)=>a.id.localeCompare(b.id));
  const legacy=gameplay.objectives.some(o=>o.id===settlement+'-meet-neighbor');
  if(group.length<(legacy?3:2))continue;
  const targetStart=legacy?2:1;
  for(let i=0;i<Math.min(2,group.length-targetStart);i++){
   const giver=group[i],target=group[i+targetStart],from=giver.routine!.work,to=target.routine!.work;
   const path=route(from,to);
   if(!path||!Number.isFinite(path.length)||path.length>300)continue;
   const hash=fingerprint({islandId,giver:giver.id,target:target.id}).slice(0,16);
   const questKey='quest:social:'+hash;
   const reward=gameplay.items.some(item=>item.id==='coin')
    ?[{kind:'coins' as const,quantity:3}]:[];
   out.push({questKey,templateId:'resident:introduction',templateVersion:1,
    islandId,giverId:giver.id,
    bindings:{title:'Rencontrer '+target.name,targetId:target.id},
    steps:[{kind:'talk',npcId:target.id}],rewards:reward,
    dependencies:[giver.id,target.id],
    catalogRevision:'resident-social-v1',
    proof:{capabilityIds:[giver.id,target.id],validatorVersion:'resident-routes-v1'},
   });
   if(out.length>=maxOffers)return out;
  }
 }
 return out;
}

/** Second verified family: visit an actual work amenity that survives project
 * compilation, using the native NPC pedestrian router. This does not assume
 * that a missing farm polygon, counter, harbor, or workshop has an entity.
 */
export function generateResidentVisitQuestOffers(
 npcs:readonly NPCDefinition[],gameplay:Pick<GameplayData,'dialogues'|'entities'|'items'>,
 islandId:string,route:(from:ResidentPoint,to:ResidentPoint)=>{length:number}|null,
 maxOffers=6,
):QuestCatalogEntryV1[]{
 if(!ident(islandId)||!Number.isSafeInteger(maxOffers)||maxOffers<0||maxOffers>12)
  throw Error('Visit quest generation: invalid island or budget');
 if(maxOffers===0)return [];
 const actorIds=new Set(gameplay.dialogues.filter(d=>d.lines?.length&&d.lines.some(l=>l.choices?.length))
  .map(d=>d.actorId).filter((id):id is string=>!!id));
 const positioned=new Map(gameplay.entities.filter(e=>e.position&&Number.isFinite(e.position.x)&&Number.isFinite(e.position.z)).map(e=>[e.id,e.position!] as const));
 const residents=[...npcs].filter(n=>n.routine?.homeAnchorId&&n.routine.workAnchorId&&
  groupId(n.id)&&actorIds.has(n.id)).sort((a,b)=>a.id.localeCompare(b.id));
 const out:QuestCatalogEntryV1[]=[];
 const usedSettlements=new Set<string>();
 for(const giver of residents){
  const settlement=groupId(giver.id)!;
  if(usedSettlements.has(settlement))continue;
  for(const target of residents){
   if(target.id===giver.id||groupId(target.id)!==settlement)continue;
   const anchor=target.routine!.workAnchorId!;
   const position=positioned.get(anchor);
   if(!ident(anchor)||!position)continue;
   // An author may move an amenity without recomposing the resident. Never
   // produce a visit quest to a place that no longer matches its work anchor.
   if(Math.hypot(position.x-target.routine!.work.x,position.z-target.routine!.work.z)>1.5)continue;
   const path=route(giver.routine!.work,{x:position.x,z:position.z});
   if(!path||!Number.isFinite(path.length)||path.length<1||path.length>300)continue;
   const hash=fingerprint({islandId,giver:giver.id,anchor}).slice(0,16);
   out.push({
    questKey:'quest:visit:'+hash,templateId:'resident:discover-workplace',templateVersion:1,
    islandId,giverId:giver.id,
    bindings:{title:'Découvrir un lieu de travail',targetId:anchor},
    steps:[{kind:'visit',targetId:anchor,withinM:5}],
    rewards:gameplay.items.some(item=>item.id==='coin')?[{kind:'coins',quantity:2}]:[],
    dependencies:[giver.id,target.id,anchor],catalogRevision:'resident-visit-v1',
    proof:{capabilityIds:[giver.id,target.id,anchor],validatorVersion:'resident-routes-v1'},
   });
   usedSettlements.add(settlement);
   break;
  }
  if(out.length>=maxOffers)break;
 }
 return out;
}
