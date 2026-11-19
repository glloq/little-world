import test from 'node:test';
import assert from 'node:assert/strict';
import {newFlightProgress,advanceFlight,parseFlightProgress,FLIGHT_SKINS} from '../src/gameplay/flight-progress.ts';
import {gasCapacity,gasShots,gasPower,gasMastery} from '../src/physics/gas-propulsion.ts';
import {parseGameSave} from '../src/gameplay/save.ts';

test('flight rewards, skill levels and cosmetics unlock deterministically',()=>{
 const p=newFlightProgress();
 for(let i=0;i<460;i++){
  const message=advanceFlight(p,{gliding:true,distance:8,speed:i===20?47:20,pulse:i%7===0,time:i/30});
  assert.ok(message===null||typeof message==='string');
 }
 assert.equal(p.capacityLevel,3);assert.equal(p.controlLevel,2);
 assert.ok(p.achievements.includes('first-flight'));
 assert.ok(p.achievements.includes('speed-demon'));
 assert.ok(p.achievements.includes('long-flight'));
 assert.ok(p.unlockedSkins.includes('magic'));
 assert.ok(p.unlockedSkins.includes('potato'));
 assert.equal(gasCapacity({gasCapacityLevel:p.capacityLevel}),140);
 assert.equal(gasShots({gasCapacityLevel:p.capacityLevel,gasReserve:140}),10);
 assert.ok(gasMastery({gasControlLevel:p.controlLevel})<1);
 assert.equal(gasPower({gasPowerLevel:p.powerLevel}),14);
 assert.deepEqual(parseFlightProgress(p),p);
});

test('combo unlocks after four distinct pulses within its window; landing resets session',()=>{
 const p=newFlightProgress();
 for(let i=0;i<4;i++)advanceFlight(p,{gliding:true,distance:4,speed:30,pulse:true,time:i*.6});
 assert.equal(p.bestCombo,4);
 assert.ok(p.achievements.includes('combo-four'));
 assert.ok(p.unlockedSkins.includes('hazelnut'));
 advanceFlight(p,{gliding:false,distance:0,speed:0,pulse:false,time:4});
 assert.equal(p.currentFlightDistance,0);assert.equal(p.currentCombo,0);
 assert.equal(p.bestCombo,4);
});

test('flight progress rejects locked cosmetics and malformed levels',()=>{
 const p=newFlightProgress();
 assert.deepEqual(parseFlightProgress(undefined),newFlightProgress());
 assert.throws(()=>parseFlightProgress({...p,capacityLevel:8}),/Niveau/);
 assert.throws(()=>parseFlightProgress({...p,selectedSkin:'rainbow'}),/Cosmétique/);
 assert.throws(()=>parseFlightProgress({...p,unlockedSkins:['classic','unknown']}),/Cosmétique/);
 assert.ok(FLIGHT_SKINS.includes('rainbow'));
});

test('V2 game save gains a versioned flightProgress while old gas is preserved',()=>{
 const old={schemaVersion:2,worldId:'boost',worldBuildVersion:'v2',slotId:'slot-1',savedAt:1,time:0,position:{x:0,y:0,z:0},inventory:{},variables:{},objectives:{},entities:{},executed:{},cooldowns:{},dialogueFlags:{},pending:[],mines:{},farms:{},gasReserve:72};
 const migrated=parseGameSave(old);
 assert.equal(migrated.gasReserve,72);
 assert.equal(migrated.flightProgress.capacityLevel,0);
 const p=newFlightProgress();p.capacityLevel=3;
 const saved=parseGameSave({...old,flightProgress:p,gasReserve:250});
 assert.equal(saved.gasReserve,250);
 assert.equal(saved.flightProgress.capacityLevel,3);
 assert.throws(()=>parseGameSave({...old,gasReserve:250}),/gaz invalide/);
});
