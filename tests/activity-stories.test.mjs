import test from 'node:test';
import assert from 'node:assert/strict';
import {GAMEPLAY_EVENT_TYPES,isGameplayEventType,questFields} from '../src/gameplay/events.ts';
import {createDiveTracker,stepDiveTracker,createSurfRideTracker,stepSurfRide,createSkiRunTracker,stepSkiRun} from '../src/gameplay/activity-trackers.ts';
import {parseQuestCatalogEntry} from '../src/quests/validation.ts';
import {acceptQuest,advanceQuest} from '../src/quests/progress.ts';
import {t,missingKeys} from '../src/i18n/strings.ts';
import {planActivityStories,gearSource} from '../src/studio-core/activity-stories.ts';
import {planCirculationLinks} from '../src/studio-core/circulation.ts';
import {terrainAccessContext} from '../src/studio-core/terrain-access.ts';
import {putPath} from '../src/studio-core/source.ts';
import {buildHarvestIsland} from '../src/studio-core/harvest-island.ts';
import {buildAlpineIsland} from '../src/studio-core/alpine-island.ts';
import {parseProject} from '../src/studio-core/schema.ts';

test('event registry, typed payloads and i18n tables', () => {
 assert.ok(GAMEPLAY_EVENT_TYPES.includes('flight.completed')&&isGameplayEventType('dive.depth-reached')&&!isGameplayEventType('boss.defeated'));
 assert.deepEqual(questFields({type:'race.finished',raceId:'r',measuredSeconds:12,raceKind:'surf'}),{raceId:'r',measuredSeconds:12,source:'surf'});
 assert.deepEqual(questFields({type:'market.sold',itemId:'fish:trout',quantity:2,shopId:'c'}),{itemId:'fish:trout',quantity:2,source:'sell',targetId:'c'});
 assert.deepEqual(missingKeys('en'),[]);
 assert.equal(t('q.surf.text',{count:3,name:'A'},'en'),'Ride 3 waves at the A spot.');
 assert.equal(t('unknown.key'),'unknown.key');
});

test('quest steps only accept declared events and can filter by source', () => {
 const base={questKey:'q',templateId:'t',templateVersion:1,islandId:'w',giverId:'g',bindings:{},rewards:[],dependencies:[],catalogRevision:'r',proof:{capabilityIds:[],validatorVersion:'v'}};
 assert.throws(()=>parseQuestCatalogEntry({...base,steps:[{kind:'event',eventType:'boss.defeated',count:1}]}));
 const offer=parseQuestCatalogEntry({...base,steps:[{kind:'event',eventType:'race.finished',source:'surf',count:2}]});
 let q=acceptQuest(offer,'i',0);
 const ev=(n,source)=>({schemaVersion:1,eventId:'e'+n,type:'race.finished',worldId:'w',islandId:'w',gameMinute:1,sequence:n,raceId:'r',measuredSeconds:10,source});
 q=advanceQuest(q,ev(1,'roll')).instance;assert.equal(q.stepProgress[0],0);
 q=advanceQuest(q,ev(2,'surf')).instance;q=advanceQuest(q,ev(3,'surf')).instance;assert.equal(q.status,'ready');
});

test('trackers: dive marks once per dive, discoveries once, waves and piste runs', () => {
 const site={version:1,id:'reef',name:'Récif',kind:'reef',entry:{x:0,z:0},polygon:[{x:-50,z:-50},{x:50,z:-50},{x:50,z:50},{x:-50,z:50}],depthM:25,discoveries:[{id:'pearl',name:'Perle',x:10,y:-12,z:0}]};
 const s=createDiveTracker(),at=(y,x=0)=>stepDiveTracker(s,{mode:'dive',x,y,z:0,waterLevel:0},[site]);
 assert.deepEqual(at(-6).map(e=>e.depthM),[5]);assert.deepEqual(at(-7),[]);assert.deepEqual(at(-11).map(e=>e.depthM),[10]);
 assert.deepEqual(at(-12,10).map(e=>e.type),['underwater.discovered']);
 stepDiveTracker(s,{mode:'swim',x:0,y:0,z:0,waterLevel:0},[site]);assert.deepEqual(at(-6).map(e=>e.depthM),[5]);assert.deepEqual(at(-12,10).map(e=>e.type),['dive.depth-reached'],'discovery not repeated');
 const r=createSurfRideTracker();assert.deepEqual(stepSurfRide(r,{mode:'surf',tick:0,zoneId:'z'}),[]);assert.deepEqual(stepSurfRide(r,{mode:'swim',tick:200,zoneId:null}).map(e=>e.type),['surf.wave-ridden']);
 assert.deepEqual(stepSurfRide(r,{mode:'surf',tick:300,zoneId:'z'}),[]);assert.deepEqual(stepSurfRide(r,{mode:'swim',tick:320,zoneId:null}),[]);
 const k=createSkiRunTracker(),piste=[{id:'p',points:[{x:0,z:0},{x:0,z:100}],widthM:10,difficulty:'blue'}];
 let out=[];for(let z=2;z<=98;z+=4)out.push(...stepSkiRun(k,{mode:'snow',tick:z,x:1,z},piste));
 assert.deepEqual(out.map(e=>e.type),['ski.piste-completed']);
});

test('stories: hosts, gated dialogue and feasible quests on a composed island', () => {
 const p=buildHarvestIsland();
 for(const l of planCirculationLinks(p,terrainAccessContext(p)).paths)putPath(p,l);
 const r=planActivityStories(p,{locale:'fr'});
 assert.ok(r.hosts.length>=1&&r.quests.length>=1,JSON.stringify(r));
 for(const key of r.quests){const q=p.libraries.questCatalog[key];assert.ok(p.entityIndex[q.giverId],'giver exists');assert.ok(q.rewards[0].quantity>0);}
 const again=planActivityStories(p,{locale:'fr'});assert.deepEqual(again.quests.sort(),r.quests.sort(),'idempotent');
 assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))).libraries.questCatalog,p.libraries.questCatalog);
 assert.equal(gearSource(p,'tool:skis'),null,'no ski shop on the harvest island');
});

test('stories on a ski island gate the gear line on the inventory', () => {
 const p=buildAlpineIsland();
 for(const l of planCirculationLinks(p,terrainAccessContext(p)).paths)putPath(p,l);
 planActivityStories(p);
 const d=Object.values(p.libraries.dialogues).find(x=>x.id.startsWith('host:ski'));assert.ok(d);
 const gated=d.lines[0].choices.filter(c=>c.gate);assert.equal(gated.length,2);
 assert.ok(p.libraries.items['tool:skis']);
 assert.ok(Object.keys(p.libraries.questCatalog).some(k=>k.includes(':piste')));
});
