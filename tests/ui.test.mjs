// Player interface (doc 40): pure view models and contracts, no DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import {NotificationQueue} from '../src/ui/notifications/notifications.ts';
import {promptText,resolveTarget,objectTarget,npcTarget,boatTarget,mineWallTarget,farmPlotTarget} from '../src/ui/interactions/targets.ts';
import {inventoryViewModel} from '../src/ui/inventory/inventory.ts';
import {questViewModel,questChanges} from '../src/ui/journal/journal.ts';
import {saveSlotViewModel} from '../src/ui/saves/saves.ts';
import {parsePreferences,loadPreferences,savePreferences,DEFAULT_PREFERENCES,UI_PREFERENCES_KEY} from '../src/ui/app/preferences.ts';
import {miningViewModel,farmingViewModel} from '../src/ui/activities/activity-card.ts';
import {createMapRaster} from '../src/ui/map/map.ts';

test('notifications merge repeated gains, keep priorities and expire', () => {
  const q=new NotificationQueue();
  for(let i=0;i<5;i++)q.push({kind:'gain',text:'',key:'gain:stone',amount:1,label:'Pierre'},i*.1);
  let v=q.visible(.5);assert.equal(v.length,1);assert.equal(v[0].text,'+5 Pierre');assert.equal(v[0].count,5);
  q.push({kind:'error',text:'Stockage plein'},.6);q.push({kind:'info',text:'Bonjour'},.7);q.push({kind:'info',text:'Bonjour'},.8);q.push({kind:'quest',text:'Nouvelle mission'},.9);
  v=q.visible(1);assert.equal(v.length,3,'at most three visible');assert.equal(v[0].kind,'error','errors first');assert.equal(v[1].kind,'quest');
  assert.equal(q.visible(1,10).filter(n=>n.text==='Bonjour').length,1,'identical messages are not duplicated');
  assert.equal(q.visible(20).length,0,'everything expires');assert.equal(q.nextExpiry(20),null);
});
test('a repeated gain after expiry starts a new notice', () => {
  const q=new NotificationQueue();q.push({kind:'gain',text:'',key:'g',amount:2,label:'Gland'},0);
  assert.equal(q.push({kind:'gain',text:'',key:'g',amount:1,label:'Gland'},10).text,'+1 Gland');
});

test('interaction targets: one primary action, explicit reason when impossible', () => {
  const ok=objectTarget({entity:{id:'acorn'},name:'Gland',prompt:'Ramasser un gland',range:2,usable:true});
  assert.equal(ok.targetType,'object');assert.equal(ok.primaryAction.enabled,true);assert.equal(promptText(ok),'[E] Ramasser un gland — Gland');
  const used=objectTarget({entity:{id:'acorn'},name:'Ramasser',prompt:'Ramasser',range:2,usable:false,reason:'Déjà utilisé'});
  assert.equal(used.disabledReason,'Déjà utilisé');assert.equal(promptText(used),'Ramasser · Déjà utilisé','no key shown when disabled');
  assert.equal(promptText(npcTarget({id:'galopin',name:'Galopin'})),'[E] Parler avec Galopin');
  assert.equal(promptText(boatTarget(true)),'[E] Quitter le bateau');assert.equal(promptText(boatTarget(false)),'[E] Embarquer — Bateau');
  const wall=mineWallTarget({target:{mineId:'m',level:2,ix:3,iz:4,material:1},materialName:'Granite',ok:false,reason:'Trop dur sans pioche renforcée',reward:null});
  assert.equal(wall.targetId,'m:2:3,4');assert.match(promptText(wall),/Creuser — Granite · Trop dur/);assert.deepEqual(wall.availableActions.map(a=>a.key),['E','F']);
  const plot=farmPlotTarget({zoneId:'p',zoneName:'Potager',intent:{type:'plant',label:'Semer : Carotte'},ok:true,choices:3});
  assert.deepEqual(plot.availableActions.map(a=>a.key),['E','F','C']);assert.equal(promptText(plot),'[E] Semer : Carotte — Potager');
  assert.equal(resolveTarget([()=>null,()=>plot,()=>wall]),plot,'first source wins');assert.equal(resolveTarget([]),null);
});

const ITEMS=[{id:'acorn',name:'Gland',category:'nature',maxQuantity:10,description:'Un fruit du chêne.'},{id:'iron',name:'Minerai de fer',category:'mine',maxQuantity:50},{id:'pick',name:'Pioche',category:'tool',maxQuantity:1},{id:'odd',name:'Babiole',category:'curio',maxQuantity:5},{id:'carrot',name:'Carotte',category:'farm',maxQuantity:99}];
test('inventory groups by business category, marks new and full stacks, empty state', () => {
  const vm=inventoryViewModel(ITEMS,{acorn:10,iron:3,pick:1,odd:2,carrot:0},{iron:1});
  assert.deepEqual(vm.groups.map(g=>g.label),['Ressources naturelles','Minerais et cristaux','Outils','Objets divers']);
  const acorn=vm.groups[0].entries[0],iron=vm.groups[1].entries[0];
  assert.equal(acorn.full,true);assert.equal(acorn.description,'Un fruit du chêne.');assert.equal(acorn.delta,10);assert.equal(iron.delta,2);
  assert.equal(vm.groups[2].entries[0].tool,true);assert.equal(vm.kinds,4);assert.equal(vm.total,16);
  assert.equal(inventoryViewModel(ITEMS,{},{}).empty,true);assert.equal(inventoryViewModel([],{ghost:3},{}).empty,true,'unknown ids are not invented');
});

test('journal lists active / completed missions and detects changes', () => {
  const objectives=[{id:'a',name:'Apporter un gland',initialStatus:'active',persistent:true,description:'Galopin a faim.'},{id:'b',name:'Ouvrir la vanne',initialStatus:'hidden',persistent:true},{id:'c',name:'Pêcher',initialStatus:'hidden',persistent:true}];
  const vm=questViewModel(objectives,{a:'complete',b:'active'},[{id:'act',name:'Livraison',objectiveId:'a',interactionIds:[]}]);
  assert.deepEqual(vm.active.map(q=>q.id),['b']);assert.deepEqual(vm.completed.map(q=>q.id),['a']);assert.equal(vm.completed[0].activity,'Livraison');assert.equal(vm.hiddenCount,1);
  assert.deepEqual(questChanges(objectives,{a:'active',b:'hidden'},{a:'complete',b:'active'}),['Mission terminée : Apporter un gland','Nouvelle mission : Ouvrir la vanne']);
  assert.deepEqual(questChanges(objectives,{a:'active'},{a:'active'}),[]);
});

test('save slots show date, progress, version mismatch and unreadable slots', () => {
  const vm=saveSlotViewModel(['slot-1','slot-2','slot-3'],[
    {slotId:'slot-1',savedAt:'2026-11-13T10:00:00Z',worldBuildVersion:'b1',progress:{time:1300,items:7,objectivesDone:2}},
    {slotId:'slot-2',savedAt:'2026-11-12T10:00:00Z',worldBuildVersion:'old',progress:{time:0,items:0,objectivesDone:0}},
    {slotId:'slot-3',error:'JSON invalide'}],'b1',600);
  assert.equal(vm[0].state,'ready');assert.equal(vm[0].progress,'Jour 3 · 7 objet(s) · 2 mission(s) terminée(s)');assert.ok(vm[0].when);assert.equal(vm[0].versionWarning,false);
  assert.equal(vm[1].versionWarning,true);assert.equal(vm[2].state,'error');assert.equal(vm[2].error,'JSON invalide');
  assert.deepEqual(saveSlotViewModel(['slot-1'],[],'b1',600),[{slotId:'slot-1',title:'Partie 1',state:'empty'}]);
});

test('preferences are clamped, tolerant to corruption and stored apart from saves', () => {
  assert.deepEqual(parsePreferences(null),DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences({cameraSensitivity:99,invertY:'yes',reduceMotion:true,developer:1}),{...DEFAULT_PREFERENCES,cameraSensitivity:2.5,reduceMotion:true});
  const store=new Map();const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
  assert.equal(savePreferences({...DEFAULT_PREFERENCES,invertY:true},storage),true);assert.deepEqual([...store.keys()],[UI_PREFERENCES_KEY]);
  assert.equal(loadPreferences(storage).invertY,true);
  store.set(UI_PREFERENCES_KEY,'{corrupt');assert.deepEqual(loadPreferences(storage),DEFAULT_PREFERENCES);
  assert.equal(savePreferences(DEFAULT_PREFERENCES,{setItem(){throw Error('quota');}}),false,'storage failure is reported, not hidden');
});

test('activity cards are built from business previews only', () => {
  const mine=miningViewModel({mineName:'Mine du col',levelName:'Galerie basse',levelIndex:2,levelCount:3,passage:null,exit:{label:'Escalier vers le niveau 2',distance:12,angle:Math.PI/2}},Math.PI/2,{materialName:'Fer',ok:true,rewardName:'Minerai de fer'});
  assert.equal(mine.title,'Mine du col · Galerie basse (3/3)');assert.equal(mine.exit.relativeAngle,0);assert.deepEqual(mine.wall,{material:'Fer',resource:'Minerai de fer',ok:true});
  const zone={name:'Potager',farm:{crops:['carrot','wheat']}};
  const empty=farmingViewModel({plotId:'p',cropId:null,stage:'empty',growth:0,moisture:.3,selectedCrop:'carrot',zone},{intent:{label:'Semer : Carotte'},ok:true});
  assert.deepEqual(empty.choices.map(c=>[c.id,c.selected]),[['carrot',true],['wheat',false]]);assert.equal(empty.growth,undefined);
  const dry=farmingViewModel({plotId:'p',cropId:'carrot',stage:'growing',growth:.4,moisture:.1,selectedCrop:'carrot',zone},{intent:{label:'Arroser'},ok:false,reason:'Aucun point d’eau à proximité'});
  assert.equal(dry.crop,'Carotte');assert.equal(dry.stage,'En croissance');assert.equal(dry.action.reason,'Aucun point d’eau à proximité');assert.deepEqual(dry.choices,[]);
});

test('map raster is computed progressively from the existing height/water functions', () => {
  let calls=0;const raster=createMapRaster({bounds:{minX:0,maxX:200,minZ:0,maxZ:600},height:(x,z)=>{calls++;return z/10;},water:(x,z)=>z>500?60:null,seaLevel:0},64);
  assert.deepEqual([raster.width,raster.height],[21,64]);assert.equal(raster.done,false);
  let steps=0;while(!raster.step(0)&&steps<1000)steps++;assert.equal(raster.done,true);assert.ok(steps>1,'budget 0 → one row per step');
  assert.equal(calls,21*64,'one height sample per pixel, never the world generator');
  const px=(i,j)=>[...raster.data.slice((j*21+i)*4,(j*21+i)*4+3)];assert.ok(px(10,63)[2]>px(10,63)[0],'water is blue');
});
