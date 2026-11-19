import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuestDirector} from '../src/quests/director.ts';
import {beginTransit,pendingTransit,parseTraveler} from '../src/archipelago/transit.ts';
import {newFlightProgress} from '../src/gameplay/flight-progress.ts';
const origin={id:'volcano-island',manifest:'maps/island/manifest.json'};
const destination={id:'forest-valley',manifest:'archipelago/worlds/forest-valley/manifest.json'};
const record={
 questKey:'quest:archipelago:1',templateId:'studio:archipelago',templateVersion:1,
 islandId:'volcano-island',giverId:'npc:volcano:merchant',
 bindings:{title:'Des nouvelles de la vallée'},catalogRevision:'studio-v1',
 steps:[
  {kind:'talk',npcId:'npc:volcano:merchant',islandId:'volcano-island'},
  {kind:'travel',fromIslandId:'volcano-island',toIslandId:'forest-valley'},
  {kind:'talk',npcId:'npc:forest:fisher',islandId:'forest-valley'},
  {kind:'travel',fromIslandId:'forest-valley',toIslandId:'volcano-island'},
 ],
 rewards:[{kind:'coins',quantity:12}],dependencies:[],
 proof:{capabilityIds:['npc:volcano:merchant'],validatorVersion:'studio-v1'},
};
const event=(id,islandId,type,other={})=>({schemaVersion:1,eventId:id,type,
 worldId:islandId,islandId,gameMinute:12,sequence:1,...other});
const store=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,
 setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)}};
test('inter-island quest persists via real ferry ticket, rejects false arrival and resumes home',()=>{
 const source=createQuestDirector([record],{islandId:origin.id,maxActive:3});
 source.accept(record.questKey,record.questKey,10);
 source.consume(event('origin:talk',origin.id,'npc.talked',{targetId:'npc:volcano:merchant'}));
 assert.equal(source.get(record.questKey).stepIndex,1);
 const escrow=store();
 const baggage={inventory:{coin:1},gasReserve:100,flightProgress:newFlightProgress(),
   questsPortable:source.serialize()};
 beginTransit(escrow,origin,destination,1200,baggage,2000000);
 const ticket=pendingTransit(escrow,destination,2000001);
 assert.ok(ticket);
 const islandB=createQuestDirector([],{islandId:destination.id,maxActive:3});
 islandB.restore(ticket.traveler.questsPortable);
 assert.equal(islandB.get(record.questKey).stepIndex,1);
 assert.deepEqual(islandB.consume(event('fake:arrival',destination.id,'ferry.arrived',{source:'wrong'})),[]);
 assert.deepEqual(islandB.consume(event('real:arrival',destination.id,'ferry.arrived',{source:origin.id})),[record.questKey]);
 assert.equal(islandB.get(record.questKey).stepIndex,2);
 islandB.consume(event('forest:talk',destination.id,'npc.talked',{targetId:'npc:forest:fisher'}));
 assert.equal(islandB.get(record.questKey).stepIndex,3);
 const returnTicket=store();
 beginTransit(returnTicket,destination,origin,1500,{...baggage,questsPortable:islandB.serialize()},2000100);
 const home=createQuestDirector([record],{islandId:origin.id,maxActive:3});
 home.restore(pendingTransit(returnTicket,origin,2000101).traveler.questsPortable);
 assert.deepEqual(home.consume(event('real:return',origin.id,'ferry.arrived',{source:destination.id})),[record.questKey]);
 assert.equal(home.get(record.questKey).status,'ready');
 const delivered=home.claim(record.questKey,'claim:archipelago',()=>true);
 assert.equal(delivered.ok,true);
 assert.equal(home.claim(record.questKey,'claim:again',()=>true).ok,false);
 assert.equal(home.get(record.questKey).rewardClaimId,'claim:archipelago');
});
test('portable chain parser rejects forged progress and retains legacy luggage compatibility',()=>{
 const director=createQuestDirector([record],{islandId:origin.id,maxActive:3});
 director.accept(record.questKey,record.questKey,10);
 const valid={inventory:{coin:2},gasReserve:100,flightProgress:newFlightProgress(),
   questsPortable:director.serialize()};
 assert.ok(parseTraveler(valid).questsPortable?.[record.questKey]);
 assert.equal(parseTraveler({inventory:{},gasReserve:1,flightProgress:newFlightProgress()}).questsPortable,undefined);
 const corrupted=structuredClone(valid);
 corrupted.questsPortable[record.questKey].stepIndex=999;
 assert.throws(()=>parseTraveler(corrupted),/Quest instance/);
});
