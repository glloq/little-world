/**
 * Activity stories (doc 104 §C7): one host NPC per activity family, a composed
 * dialogue that adapts to the player's equipment, and quests generated from
 * the activities that really exist on the map. Everything is ordinary
 * authored data (entities, dialogues, questCatalog), visible and editable in
 * the Studio; generation never invents an activity, an unreachable site or an
 * unobtainable tool, and a reward is only the quest director's single claim.
 */
import type {ProjectDocument,EntityDefinitionV3} from './types.ts';
import type {GameplayDialogue,ConditionExpr} from '../gameplay/schema.ts';
import type {QuestCatalogEntryV1,QuestStepV1} from '../quests/schema.ts';
import type {PlanDiagnostic} from './world-plan.ts';
import {collectActivitySites,type ActivitySite} from './activity-sites.ts';
import {buildCirculationGraph,circulationReport} from './circulation.ts';
import {t,type Locale} from '../i18n/strings.ts';
import {chunkAt} from './schema.ts';
import {putEntity} from './source.ts';
import {DEFAULT_APPEARANCE} from '../character-style.ts';
import {ECONOMY_ITEMS,SHOPS,type ShopKind} from '../gameplay/economy.ts';
import {projectGeography} from './geo-context.ts';
import {parseQuestCatalogEntry} from '../quests/validation.ts';

type Family='ski'|'race'|'flight'|'surf'|'fishing'|'mine'|'farm'|'dive';
const FAMILY:Record<ActivitySite['kind'],Family>={ski:'ski','race-roll':'race','race-mixed':'race','race-flight':'flight','race-surf':'surf','race-ski':'ski',surf:'surf',fishing:'fishing',mine:'mine',farm:'farm',dive:'dive'};
const HOST_KEY:Record<Family,string>={ski:'host.instructor.ski',race:'host.instructor.race',flight:'host.instructor.flight',surf:'host.sailor.surf',fishing:'host.fisher',mine:'host.miner',farm:'host.farmer',dive:'host.guide.dive'};
const GEAR_ITEM:Record<string,string>={skis:'tool:skis',snowboard:'tool:snowboard',surfboard:'tool:surfboard','fishing-rod':'tool:fishing-rod',pickaxe:'tool:pickaxe'};
/** Base coins per family; multiplied by the site difficulty (1–3). */
const REWARD:Record<Family,number>={ski:6,race:5,flight:6,surf:6,fishing:4,mine:5,farm:4,dive:8};
const DIFF:Record<string,number>={green:1,blue:1,red:2,black:3,easy:1,medium:2,hard:3};

export interface StoryOptions {locale?:Locale;maxHosts?:number;maxQuests?:number}
export interface StoryResult {hosts:string[];quests:string[];diagnostics:PlanDiagnostic[]}

function shopsInProject(p:ProjectDocument):Set<ShopKind>{
 const out=new Set<ShopKind>();for(const c of Object.values(p.chunks))for(const e of Object.values(c.entities)){const k=e.components.State?.initial.shop;if(typeof k==='string'&&k in SHOPS)out.add(k as ShopKind);}return out;
}
/** Where a tool can be obtained on this island, or null (never propose an unfeasible quest). */
export function gearSource(p:ProjectDocument,itemId:string,shops=shopsInProject(p)):ShopKind|'starter'|null{
 if(itemId==='tool:surfboard'&&Object.keys(p.libraries.surfZones??{}).length)return 'starter';
 for(const k of shops)if(SHOPS[k].sells.includes(itemId))return k;
 return null;
}

/** Plan hosts, composed dialogues and activity quests. Idempotent: replaces only its own ids. */
export function planActivityStories(p:ProjectDocument,o:StoryOptions={}):StoryResult{
 const locale=o.locale??'fr',maxHosts=o.maxHosts??8,maxQuests=o.maxQuests??24,diagnostics:PlanDiagnostic[]=[];
 const sites=collectActivitySites(p),graph=buildCirculationGraph(p),report=circulationReport(graph),shops=shopsInProject(p),geo=projectGeography(p).ctx;
 const reachable=new Set(report.destinations.filter(d=>d.status==='reachable').map(d=>d.id));
 // Site ids → circulation destination ids (same prefixes for the land kinds).
 const destOf=(s:ActivitySite)=>s.kind==='ski'?'piste:'+s.sourceId:s.kind==='surf'?'surf:'+s.sourceId:s.kind.startsWith('race-')?'race:'+s.sourceId:s.kind==='mine'?'mine:'+s.sourceId:s.kind==='farm'?'farm:'+s.sourceId:null;
 const isReachable=(s:ActivitySite)=>{const d=destOf(s);if(!d)return true;if(s.kind==='race-ski'||s.kind==='race-surf')return true;return reachable.has(d)||!report.destinations.some(x=>x.id===d);};
 // Remove previous generated stories (regeneration replaces only its own data).
 for(const id of Object.keys(p.libraries.questCatalog??{}))if(id.startsWith('quest:gen:'))delete p.libraries.questCatalog![id];
 for(const [id,e]of Object.entries(p.entityIndex))if(id.startsWith('host:')&&e.kind==='character'){const c=p.chunks[e.ownerChunkId];if(c){delete c.entities[id];c.entityIds=c.entityIds.filter(x=>x!==id);}delete p.entityIndex[id];delete p.libraries.dialogues[id+'-talk'];}
 // One host per family, near the access of its first reachable site, on the walking network.
 const byFamily=new Map<Family,ActivitySite[]>();
 for(const s of sites){const f=FAMILY[s.kind];if(f==='farm')continue;if(!isReachable(s)){diagnostics.push({severity:'WARNING',code:'STORY_SITE_UNREACHABLE',message:`${s.name} : site non relié au réseau de chemins, aucune quête proposée.`});continue;}const l=byFamily.get(f)??[];l.push(s);byFamily.set(f,l);}
 const characters=Object.values(p.entityIndex).filter(v=>v.kind==='character').length;
 const hostOf=new Map<Family,string>(),hosts:string[]=[];
 let k=0;
 for(const [family,list]of [...byFamily].sort((a,b)=>a[0].localeCompare(b[0]))){
  if(hosts.length>=maxHosts||characters+hosts.length>=100)break;
  // Host next to the family site closest to the walking network.
  let best:{x:number;z:number}|null=null,bestD=Infinity,anchorSite=list[0];
  for(const site of list)for(const q of graph.nodes){const d=Math.hypot(q.x-site.access.x,q.z-site.access.z);if(d<bestD&&geo.height(q.x,q.z)>p.world.seaLevel+.8){bestD=d;best=q;anchorSite=site;}}
  list.sort((a,b)=>a===anchorSite?-1:b===anchorSite?1:0);
  if(!best||bestD>450){diagnostics.push({severity:'WARNING',code:'STORY_HOST_UNPLACED',message:`${t('act.'+family,{},locale)} : aucun point du réseau à moins de 450 m pour un hôte.`});continue;}
  const id='host:'+family+':'+(k++),pos={x:Math.round((best.x+1.5)*100)/100,z:Math.round((best.z+1.5)*100)/100};
  const entity:EntityDefinitionV3={id,kind:'character',name:t(HOST_KEY[family],{},locale),ownerChunkId:chunkAt(p.world,pos.x,pos.z),
   components:{Transform:{type:'Transform',position:{x:pos.x,y:0,z:pos.z},rotation:{x:0,y:0,z:0,w:1},scale:{x:1,y:1,z:1}},
    Character:{type:'Character',species:'hamster',rigId:'hamster-rigid',appearance:{...DEFAULT_APPEARANCE}},DialogueActor:{type:'DialogueActor',dialogueIds:[id+'-talk']}}};
  putEntity(p,entity);
  p.libraries.dialogues[id+'-talk']=composeHostDialogue(p,id,family,list,pos,shops,locale) as never;
  hostOf.set(family,id);hosts.push(id);
 }
 // Quests from templates, one or two per site, feasibility first.
 const catalog:Record<string,QuestCatalogEntryV1>={...(p.libraries.questCatalog??{})},quests:string[]=[];
 const add=(site:ActivitySite,template:string,steps:QuestStepV1[],titleKey:string,textKey:string,params:Record<string,string|number>)=>{
  if(quests.length>=maxQuests||Object.keys(catalog).length>=128)return;
  const giverId=hostOf.get(FAMILY[site.kind]);if(!giverId)return;
  const gear=(site.equipment??[]).map(g=>GEAR_ITEM[g]).filter((x):x is string=>!!x);
  // Any one of the listed tools is enough (skis or snowboard).
  if(gear.length&&!gear.some(item=>gearSource(p,item,shops))){diagnostics.push({severity:'WARNING',code:'STORY_GEAR_UNAVAILABLE',message:`${site.name} : matériel introuvable sur l’île (${gear.join(', ')}), quête non proposée.`});return;}
  const level=DIFF[site.difficulty??'']??1,questKey=('quest:gen:'+site.id+':'+template).replace(/[^a-zA-Z0-9_.:-]/g,'-').slice(0,100);
  const entry:QuestCatalogEntryV1={questKey,templateId:'activity:'+template,templateVersion:1,islandId:p.world.worldId,giverId,
   bindings:{title:t(titleKey,params,locale).slice(0,200),instruction:t(textKey,params,locale).slice(0,200),titleKey,instructionKey:textKey,locale},
   steps,rewards:[{kind:'coins',quantity:REWARD[FAMILY[site.kind]]*level+(steps[0].kind==='event'&&steps[0].count>1?steps[0].count:0)}],
   dependencies:[giverId,site.sourceId].map(x=>x.slice(0,100)),catalogRevision:'activity-v1',
   proof:{capabilityIds:[giverId,...site.capabilities].slice(0,32).map(x=>x.slice(0,100)),validatorVersion:'activity-stories-v1'}};
  parseQuestCatalogEntry(entry);catalog[questKey]=entry;quests.push(questKey);
 };
 const world=p.world.worldId;
 for(const s of sites){
  if(!isReachable(s))continue;
  const name={name:s.name};
  switch(s.kind){
   case 'race-roll':case 'race-mixed':case 'race-surf':case 'race-ski':add(s,'race',[{kind:'race',raceId:s.sourceId,islandId:world}],'q.race.title','q.race.text',name);break;
   case 'race-flight':add(s,'flight',[{kind:'race',raceId:s.sourceId,islandId:world}],'q.flight.title','q.flight.text',name);break;
   case 'ski':add(s,'piste',[{kind:'event',eventType:'ski.piste-completed',subjectId:s.sourceId,count:1}],'q.ski.title','q.ski.text',name);
    if(s.capabilities.some(c=>c.startsWith('ski:lift:')))add(s,'lift',[{kind:'event',eventType:'ski.lift-ridden',subjectId:s.sourceId,count:1}],'q.lift.title','q.lift.text',name);break;
   case 'surf':add(s,'waves',[{kind:'event',eventType:'surf.wave-ridden',subjectId:s.sourceId,count:3}],'q.surf.title','q.surf.text',{...name,count:3});
    if(Object.values(p.libraries.surfFeatures??{}).some(f=>{const z=p.libraries.surfZones?.[s.sourceId];return z&&f.x>=z.minX&&f.x<=z.maxX&&f.z>=z.minZ&&f.z<=z.maxZ;}))add(s,'trick',[{kind:'event',eventType:'surf.trick',count:1}],'q.surftrick.title','q.surftrick.text',name);break;
   case 'mine':add(s,'extract',[{kind:'event',eventType:'mine.extracted',count:5}],'q.mine.title','q.mine.text',{count:5});break;
   case 'dive':{const site=p.libraries.diveSites?.[s.sourceId];if(!site)break;const mark=[45,30,20,10,5].find(m=>m<=site.depthM)??5;
    add(s,'depth',[{kind:'event',eventType:'dive.depth-reached',subjectId:site.id,source:String(mark),count:1}],'q.dive.title','q.dive.text',{...name,depth:mark});
    for(const d of site.discoveries??[])add({...s,id:s.id+':'+d.id},'discover',[{kind:'event',eventType:'underwater.discovered',subjectId:d.id,count:1}],'q.discover.title','q.discover.text',{...name,item:d.name});break;}
   default:break;
  }
 }
 // Fishing: one island-wide quest (catches are not tied to one water body).
 const fishing=sites.find(s=>s.kind==='fishing'&&hostOf.has('fishing'));
 if(fishing)add({...fishing,id:'fishing:island'},'catch',[{kind:'event',eventType:'fishing.caught',count:3}],'q.fish.title','q.fish.text',{count:3});
 p.libraries.questCatalog=catalog;
 return {hosts,quests,diagnostics};
}

/** Composed host dialogue: activity, directions with the real distance, and gear lines gated by the inventory. */
export function composeHostDialogue(p:ProjectDocument,actorId:string,family:Family,sites:readonly ActivitySite[],host:{x:number;z:number},shops:Set<ShopKind>,locale:Locale):GameplayDialogue{
 const site=sites[0],distance=Math.max(10,Math.round(Math.hypot(site.access.x-host.x,site.access.z-host.z)/10)*10);
 const gearIds=(site.equipment??[]).map(g=>GEAR_ITEM[g]).filter((x):x is string=>!!x);
 // Gear conditions need the items in the project library (taken from the economy catalog).
 for(const id of gearIds)if(!p.libraries.items[id]){const def=ECONOMY_ITEMS.find(i=>i.id===id);if(def)p.libraries.items[id]={id,name:def.name,category:def.category,maxQuantity:def.maxQuantity,...(def.description?{description:def.description}:{})} as never;}
 const usable=gearIds.filter(id=>p.libraries.items[id]);
 const has:ConditionExpr|undefined=usable.length?{type:'any',conditions:usable.map(itemId=>({type:'hasItem' as const,itemId,quantity:1}))}:undefined;
 const gearName=usable.length?t('gear.'+usable[0],{},locale):'';
 const source=usable.length?gearSource(p,usable[0],shops):null,shopName=source&&source!=='starter'?t('shop.'+source,{},locale):t('shop.port',{},locale);
 const lines:GameplayDialogue['lines']=[
  {id:'hello',text:t('dlg.hello',{activity:t('act.'+family,{},locale)},locale),choices:[
   {id:'what',text:t('dlg.ask.what',{},locale),next:'what'},
   {id:'where',text:t('dlg.ask.where',{},locale),next:'where'},
   ...(has?[{id:'gear-ok',text:t('dlg.ask.gear',{},locale),next:'gear-ok',gate:has},{id:'gear-missing',text:t('dlg.ask.gear',{},locale),next:'gear-missing',gate:{type:'not' as const,condition:has}}]:[{id:'gear',text:t('dlg.ask.gear',{},locale),next:'gear-none'}]),
   {id:'bye',text:t('dlg.bye',{},locale)}]},
  {id:'what',text:t('how.'+family,{},locale),choices:[{text:t('dlg.thanks',{},locale),next:'hello'}]},
  {id:'where',text:t('dlg.where',{distance},locale),choices:[{text:t('dlg.thanks',{},locale),next:'hello'}]},
  ...(has?[
   {id:'gear-ok',text:t('dlg.gear.ok',{gear:gearName},locale),choices:[{text:t('dlg.thanks',{},locale),next:'hello'}]},
   {id:'gear-missing',text:t('dlg.gear.missing',{gear:gearName,shop:shopName},locale),choices:[{text:t('dlg.thanks',{},locale),next:'hello'}]}]:
   [{id:'gear-none',text:t('dlg.gear.none',{},locale),choices:[{text:t('dlg.thanks',{},locale),next:'hello'}]}]),
 ];
 return {id:actorId+'-talk',actorId,start:'hello',lines} as GameplayDialogue;
}
