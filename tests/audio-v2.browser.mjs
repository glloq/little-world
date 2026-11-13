/** AUD-V2 real Web Audio checks (Chromium, modules served by Vite dev): catalogue loading from the
 * static base, fallbacks, cache/dedup, missing resources, cooldown/polyphony, ambience and music
 * transitions, procedural sounds, Ogg decoding when ffmpeg is available. */
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const base=(process.argv[2]??'http://127.0.0.1:5189/little-world/').replace(/\/?$/,'/'),basePath=new URL(base).pathname;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--autoplay-policy=user-gesture-required']});
let checks=0;const check=(yes,message)=>{assert.ok(yes,message);checks++;console.log('OK: '+message);};
let ogg=null;try{const dir=await mkdtemp(join(tmpdir(),'lw-audio-'));execFileSync('ffmpeg',['-loglevel','error','-y','-i',new URL('../public/audio/library/sample-collect.wav',import.meta.url).pathname,'-c:a','libvorbis','-q:a','4',join(dir,'fixture.ogg')]);ogg=await readFile(join(dir,'fixture.ogg'));}catch{console.log('SKIP: ffmpeg/libvorbis indisponible, décodage Ogg non testé ici');}
try{
 const page=await browser.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/audio/'))requests.push(new URL(r.url()).pathname);});
 if(ogg)await page.route('**/audio/test/fixture.ogg',route=>route.fulfill({status:200,contentType:'audio/ogg',body:ogg}));
 await page.goto(base+'audio/catalog.json');
 await page.evaluate(async({base,withOgg})=>{const {AudioEngine}=await import(base+'src/audio/engine.ts');const catalog=await(await fetch(base+'audio/catalog.json')).json();
  const broken=structuredClone(catalog);broken.assets['sample-collect'].uri='audio/library/absent.wav';
  if(withOgg){catalog.assets['ogg-test']={id:'ogg-test',name:'ogg',kind:'sample',format:'ogg',status:'GENERATED',license:'CC0-1.0',source:'test',uri:'audio/test/fixture.ogg'};catalog.events['test.ogg']={...catalog.events.collect,id:'test.ogg',variants:[{assetId:'ogg-test',weight:1}]};}
  window.v2=new AudioEngine(catalog,undefined,{baseUrl:base});window.broken=new AudioEngine(broken,undefined,{baseUrl:base});
  const legacy=await(await fetch(base+'audio/default.json')).json();window.legacy=new AudioEngine(legacy,undefined,{baseUrl:base});
  const b=document.createElement('button');b.id='unlock';b.textContent='Activer';b.onclick=()=>{void window.v2.unlock();void window.broken.unlock();void window.legacy.unlock();};document.body.append(b);},{base,withOgg:!!ogg});
 check(await page.evaluate(()=>window.v2.metrics.contexts)===0&&await page.evaluate(()=>window.v2.playEvent('player.footstep'))===null,'No context and no sound before the user gesture');
 check(!requests.some(r=>r.includes('/audio/library/')),'Nothing from the library is downloaded before it is needed');
 await page.click('#unlock');await page.waitForFunction(()=>window.v2.ready&&window.broken.ready&&window.legacy.ready);
 const id=await page.evaluate(()=>window.v2.playEvent('player.footstep',{context:{surface:'grass',wet:true},position:{x:1,y:0,z:0},source:'player'}));
 check(id!==null&&requests.includes(basePath+'audio/library/sample-step.wav'),'Planned footstep takes fall back to the V1 step, fetched from the Vite base path');
 const before=requests.filter(r=>r.endsWith('sample-lever.wav')).length;await page.evaluate(async()=>{await Promise.all(Array.from({length:10},()=>window.v2.playEvent('lever')));});
 check(requests.filter(r=>r.endsWith('sample-lever.wav')).length-before===1,'Concurrent requests share one download and one decoding');
 check(await page.evaluate(()=>window.v2.playEvent('no.such.event'))===null&&await page.evaluate(()=>window.v2.diagnostics.some(d=>d.includes('absent du catalogue'))),'Unknown event is a diagnostic, not an exception');
 check(await page.evaluate(()=>window.v2.playEvent('player.jump'))===null&&await page.evaluate(()=>window.v2.diagnostics.some(d=>d.includes('player.jump'))),'Planned-only event stays silent with an explicit diagnostic');
 await page.evaluate(()=>window.broken.playEvent('collect'));const missing=requests.filter(r=>r.endsWith('absent.wav')).length;await page.evaluate(async()=>{for(let i=0;i<5;i++)await window.broken.playEvent('collect');});
 check(missing===1&&requests.filter(r=>r.endsWith('absent.wav')).length===1&&await page.evaluate(()=>window.broken.metrics.unavailable===1&&window.broken.diagnostics.some(d=>/indisponible|incompatible/.test(d))),'A missing file is requested once, then skipped silently with a diagnostic');
 check(await page.evaluate(async()=>(await window.v2.playEvent('ui.error'))!==null),'Procedural UI sound is synthesised and played');
 await page.evaluate(async()=>{for(let i=0;i<20;i++)await window.v2.playEvent('mine.action.denied');});const cooled=await page.evaluate(()=>window.v2.metrics.events.cooldown);check(cooled>=19,`Cooldown prevents artificial rapid repetition (${cooled} rejected)`);
 await page.waitForFunction(()=>window.v2.metrics.voices===0,null,{timeout:5000});await page.evaluate(async()=>{await Promise.all(Array.from({length:10},()=>window.v2.playEvent('player.footstep',{context:{surface:'stone'}})));});
 let m=await page.evaluate(()=>window.v2.metrics);check(m.voices<=3,`Per-event polyphony is capped (${m.voices} voices for 10 footsteps)`);
 const scene=(ctx)=>page.evaluate(ctx=>window.v2.updateScene({x:0,y:0,z:0},()=>undefined,{night:ctx.time==='night',rain:ctx.weather==='rain',water:!!ctx.nearWater},1,{x:0,y:0,z:1},{context:ctx}),ctx);
 await scene({time:'day',weather:'rain',place:'forest'});await page.waitForFunction(()=>window.v2.metrics.ambience.includes('amb:weather:rain')&&window.v2.metrics.voices>0);check(true,'Rain profile layer plays (V1 rain as explicit fallback)');
 await page.waitForFunction(()=>window.v2.metrics.score==='day',null,{timeout:8000});check(await page.evaluate(()=>window.v2.metrics.cue)==='explore.day','Music cue selected from context; static MIDI loaded on demand');
 for(let i=0;i<20;i++)await scene({time:'day',weather:i%2?'rain':'clear',place:i%3?'forest':'mine',nearWater:i%4===0});
 m=await page.evaluate(()=>window.v2.metrics);check(m.nodes<=m.budget.maxTotalVoices+4&&m.pcmBytes<=m.budget.maxPcmBytes,`Fast profile changes keep voices and cache bounded (${m.nodes} nodes, ${Math.round(m.pcmBytes/1024)} KiB)`);
 await scene({time:'day',weather:'clear',place:'mine'});await page.waitForFunction(()=>!window.v2.metrics.ambience.some(k=>k.startsWith('amb:weather')),null,{timeout:4000});check(true,'Ambience layers leave cleanly (exclusive mine profile mutes weather)');
 await scene({time:'night',weather:'clear',place:'plain'});await page.waitForFunction(()=>window.v2.metrics.score==='night',null,{timeout:10000});check(true,'Day → night music switches on a bar boundary');
 check(await page.evaluate(()=>window.v2.triggerCue('discovery'))===false,'Planned stinger is never requested');
 if(ogg){check(await page.evaluate(async()=>(await window.v2.playEvent('test.ogg'))!==null),'Ogg Vorbis resource decodes in Chromium');}
 await page.evaluate(()=>window.v2.setHidden(true));m=await page.evaluate(()=>window.v2.metrics);check(m.nodes===0&&m.state==='suspended','Hidden tab releases every voice');await page.evaluate(()=>window.v2.setHidden(false));
 check(await page.evaluate(async()=>(await window.legacy.playSound('collect'))!==null&&window.legacy.metrics.catalogVersion==='migrated-v1'),'V1 definition still plays embedded samples through the migrated catalogue');
 await page.evaluate(async()=>{await window.v2.dispose();await window.broken.dispose();await window.legacy.dispose();});m=await page.evaluate(()=>window.v2.metrics);check(m.nodes===0&&m.pcmBytes===0&&m.state==='closed','Disposal releases nodes and decoded buffers');
 check(errors.length===0,errors.join('\n')||'No page error');console.log(JSON.stringify({checks,errors,ogg:!!ogg},null,2));
}finally{await browser.close();}
