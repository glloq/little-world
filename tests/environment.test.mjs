import test from 'node:test';
import assert from 'node:assert/strict';
import {WorldClock} from '../src/environment/clock.ts';
import {createClimate,defaultEnvironment,parseEnvironmentDefinition} from '../src/environment/climate.ts';
import {createGameplay} from '../src/gameplay/runtime.ts';
import {readFile} from 'node:fs/promises';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('world clock advances by logical steps equally at 20/30/60 Hz; pause, acceleration and reload stay explicit',()=>{
 for(const hz of [20,30,60]){const clock=new WorldClock();for(let i=0;i<hz*60;i++)clock.advance(1/hz);close(clock.time,60);clock.setRate(0);clock.advance(10);close(clock.time,60);clock.setRate(60);clock.advance(1);close(clock.time,120);clock.restore(3600);assert.equal(clock.time,3600);assert.equal(clock.rate,1);assert.throws(()=>clock.advance(-1));assert.throws(()=>clock.setRate(Infinity));}
});
test('deterministic climate history integrates each elapsed weather interval rather than the current weather',()=>{
 const climate=createClimate(defaultEnvironment(1284)),a=climate.summarize(0,10000,5),left=climate.summarize(0,173.6,5),right=climate.summarize(173.6,10000,5);
 for(const field of ['seconds','degreeHours','rainfallMm','evaporationMm'])close(a[field],left[field]+right[field]);
 for(const kind of ['clear','cloudy','rain'])close(a.weatherSeconds[kind],left.weatherSeconds[kind]+right.weatherSeconds[kind]);close(Object.values(a.weatherSeconds).reduce((s,n)=>s+n,0),10000);assert.ok(a.rainfallMm>0&&a.weatherSeconds.clear>0&&a.weatherSeconds.cloudy>0);
 const same=createClimate(defaultEnvironment(1284));assert.deepEqual(same.summarize(0,10000,5),a);assert.deepEqual(same.state(250),climate.state(250));
 const long=climate.summarize(0,1e9);assert.equal(long.seconds,1e9);assert.ok(Number.isFinite(long.degreeHours));
});
test('continuous and deferred climate queries produce the same aggregate without offscreen ticks',()=>{
 const climate=createClimate(defaultEnvironment()),whole=climate.summarize(15,7400,8),pieces=[];for(let at=15;at<7400;at+=37)pieces.push(climate.summarize(at,Math.min(at+37,7400),8));
 for(const field of ['degreeHours','rainfallMm','evaporationMm'])close(whole[field],pieces.reduce((sum,p)=>sum+p[field],0));
 assert.throws(()=>climate.summarize(5,4));assert.throws(()=>climate.state(Infinity));const invalid={...defaultEnvironment(),dayLengthSeconds:0};assert.throws(()=>parseEnvironmentDefinition(invalid));assert.throws(()=>parseEnvironmentDefinition({...defaultEnvironment(),generatorVersion:2}));
});
test('one gameplay clock drives timers, environment and save restoration',async()=>{
 const bundle=JSON.parse(await readFile(new URL('../public/maps/beta.json',import.meta.url),'utf8')),a=createGameplay(bundle.gameplay);a.update(30);a.clock.setRate(60);a.update(10);assert.equal(a.state.time,630);assert.equal(a.climate.state(a.clock.time).worldTime,630);const save=a.save('one');const b=createGameplay(bundle.gameplay);b.restore(save);assert.equal(b.clock.time,630);assert.deepEqual(a.climate.state(a.clock.time),b.climate.state(b.clock.time));assert.deepEqual(a.climate.summarize(0,630),b.climate.summarize(0,630));
});
