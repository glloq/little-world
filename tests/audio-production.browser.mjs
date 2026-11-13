/** Produced audio in the real engine (Chromium, Vite dev modules): every MIDI theme through the Little World
 * synth, every produced event decoded and played, variants rotate, mixed scene stays bounded and gameplay
 * sounds keep priority. Measures signal/voices only — it is not a listening test. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const base=(process.argv[2]??'http://127.0.0.1:5189/little-world/').replace(/\/?$/,'/');
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
let checks=0;const check=(yes,message)=>{assert.ok(yes,message);checks++;console.log('OK: '+message);};
try{
 const page=await browser.newPage(),errors=[],failed=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push(r.url()));page.on('response',r=>{if(r.status()>=400&&r.url().includes('/audio/'))failed.push(r.url());});
 await page.goto(base+'audio/catalog.json');
 await page.evaluate(async base=>{const {AudioEngine}=await import(base+'src/audio/engine.ts');window.catalog=await(await fetch(base+'audio/catalog.json')).json();window.e=new AudioEngine(window.catalog,undefined,{baseUrl:base});const b=document.createElement('button');b.id='go';b.textContent='Go';b.onclick=()=>void window.e.unlock();document.body.append(b);},base);
 await page.click('#go');await page.waitForFunction(()=>window.e.ready);
 const scores=await page.evaluate(()=>Object.values(window.catalog.scores).filter(s=>window.catalog.assets[s.assetId].uri?.startsWith('audio/music/')).map(s=>s.id));check(scores.length>=19,`${scores.length} produced themes`);
 for(const id of scores){await page.evaluate(id=>{window.e.applyBudget(1);window.e.requestScore(id,{loop:false,immediate:true});},id);
  await page.waitForFunction(id=>window.e.metrics.score===id&&window.e.metrics.rms>.0005,id,{timeout:9000});await page.waitForTimeout(1200);const m=await page.evaluate(()=>window.e.metrics);
  assert.ok(m.musicVoices<=m.budget.maxMusicVoices,id);await page.evaluate(()=>window.e.requestSilence());await page.waitForFunction(()=>window.e.metrics.score===null,null,{timeout:12000});await page.waitForFunction(()=>window.e.metrics.musicVoices===0,null,{timeout:4000});}
 check(true,'Every theme plays through the Little World synth, stays within the music voice budget and ends without stuck notes');
 const events=await page.evaluate(()=>Object.values(window.catalog.events).filter(ev=>ev.variants.some(v=>{const a=window.catalog.assets[v.assetId];return a.uri?.startsWith('audio/sfx/')||a.uri?.startsWith('audio/ambience/');})).map(ev=>({id:ev.id,when:ev.variants.find(v=>window.catalog.assets[v.assetId].uri?.startsWith('audio/'))?.when??{}})));
 const missed=[];await page.evaluate(()=>window.e.applyBudget(0));for(const ev of events){const ctx=Object.fromEntries(Object.entries(ev.when).map(([k,v])=>[k,Array.isArray(v)?v[0]:v]));const id=await page.evaluate(([id,ctx])=>window.e.playEvent(id,{context:ctx,loop:false,priority:9}),[ev.id,ctx]);if(id===null)missed.push(ev.id);await page.waitForTimeout(40);await page.evaluate(async()=>{await window.e.setHidden(true);await window.e.setHidden(false);});}
 check(missed.length===0,`All ${events.length} events with produced takes decode and play (${missed.join(', ')||'none missed'})`);
 const m=await page.evaluate(()=>window.e.metrics);check(m.pcmBytes<=m.budget.maxPcmBytes&&m.unavailable===0,`PCM cache bounded (${Math.round(m.pcmBytes/1024)} Kio) and no unavailable resource`);
 const picks=await page.evaluate(()=>Array.from({length:16},()=>{const r=window.e.resolve('player.footstep',{surface:'grass'});return r.ok?r.sound.asset.id:null;}));check(new Set(picks).size>=3&&picks.every((p,i)=>i===0||p!==picks[i-1])&&picks.every(p=>/^fs-grass-/.test(p)),'Grass footsteps rotate through distinct takes without immediate repeats');
 const wet=await page.evaluate(()=>window.e.resolve('player.footstep',{surface:'grass',wet:true}).sound.asset.id);check(/^fs-grass-wet-/.test(wet),'Wet grass selects the wet takes');
 const ore=await page.evaluate(()=>window.e.resolve('mine.hit',{material:'metalOre'}).sound.asset.id),unknown=await page.evaluate(()=>window.e.resolve('mine.hit',{}).sound.asset.id);check(/^mine-hit-ore-/.test(ore)&&/^mine-hit-softrock-/.test(unknown),'Mine material response is contextual, unknown material uses the generic soft-rock takes');
 // Mixed scene: rain + forest + river + night music + steps; a gameplay sound still gets a voice.
 await page.evaluate(()=>{window.e.applyBudget(2);window.e.updateScene({x:0,y:0,z:0},()=>undefined,{night:true,rain:true,water:true},2,{x:0,y:0,z:1},{context:{time:'night',weather:'rain',place:'forest',nearWater:true}});});
 await page.waitForFunction(()=>window.e.metrics.ambience.length>=1&&window.e.metrics.voices>0,null,{timeout:8000});for(let i=0;i<12;i++){await page.evaluate(()=>window.e.playEvent('player.footstep',{context:{surface:'grass',wet:true},source:'player'}));await page.waitForTimeout(60);}
 const hit=await page.evaluate(()=>window.e.playEvent('mine.hit',{context:{material:'hardRock'},source:'player'}));const mix=await page.evaluate(()=>window.e.metrics);
 check(hit!==null&&mix.voices<=mix.budget.maxTotalVoices&&mix.rms>0,`Mixed scene (eco budget): ${mix.voices}/${mix.budget.maxTotalVoices} voices, ${mix.ambience.length} ambience layer(s), gameplay hit still played`);
 await page.evaluate(()=>window.e.dispose());check(errors.length===0&&failed.length===0,[...errors,...failed].join('\n')||'No page error and no failed audio request');
 console.log(JSON.stringify({checks,errors,failed},null,2));
}finally{await browser.close();}
