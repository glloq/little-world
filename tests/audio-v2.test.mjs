import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseAudioDefinitionV2,diagnoseAudioCatalog,eventAvailability,assetPlayable,AUDIO_V2_LIMITS} from '../src/audio/catalog.ts';
import {migrateAudioV1toV2,toAudioCatalog,parseAnyAudioDefinition,audioSoundIds} from '../src/audio/migrate.ts';
import {resolveSound} from '../src/audio/resolve.ts';
import {VariantPicker,CooldownGate,seededRandom} from '../src/audio/variants.ts';
import {MusicDirector} from '../src/audio/music.ts';
import {AmbienceMixer} from '../src/audio/ambience.ts';
import {AudioEventRouter} from '../src/audio/router.ts';
import {matchCondition,parseCondition,sanitizeContext} from '../src/audio/context.ts';
import {renderProcedural} from '../src/audio/procedural.ts';
import {validateAudioLinks} from '../src/audio/schema.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
const json=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),'utf8'));
const v1=await json('../public/audio/default.json'),catalog=await json('../public/audio/catalog.json'),manifest=await json('../assets/audio/production-manifest.json');
const picker=(seed=7)=>new VariantPicker(seededRandom(seed));
const asset=(id,extra={})=>({id,name:id,kind:'sample',format:'wav',status:'GENERATED',license:'CC0-1.0',source:'test',uri:`audio/test/${id}.wav`,...extra});
const event=(id,extra={})=>({id,category:'movement',bus:'sfx',variants:[],gain:1,pitch:1,pitchJitter:0,gainJitter:0,cooldownMs:0,priority:4,maxInstances:2,steal:'oldest',spatial:true,radius:20,loop:false,repeat:'random',maxLatencyMs:0,...extra});
const mini=(events,assets)=>parseAudioDefinitionV2({schemaVersion:2,patchIds:['flute'],assets,scores:{},events,music:{cues:{}},ambience:{},emitters:[]});

test('shipped V2 catalogue validates; PLANNED resources carry no fictive file reference',()=>{
 const c=parseAudioDefinitionV2(catalog);assert.ok(Object.keys(c.events).length>=100);
 for(const a of Object.values(c.assets)){if(a.status==='PLANNED'){assert.equal(a.uri,undefined);assert.equal(a.bytesBase64,undefined);assert.equal(assetPlayable(a),false);}if(a.uri)assert.match(a.uri,/^audio\//);}
 assert.equal(diagnoseAudioCatalog(c).filter(d=>d.level==='error').length,0);
 for(const id of ['player.footstep','player.jump','player.land','player.glide.deploy','water.enter','water.swim','mine.hit','mine.cell.excavated','farm.plant','farm.water','farm.harvest','npc.vocalize','interaction.door.open','ui.confirm','magic.activate'])assert.ok(c.events[id],id);
 for(const id of ['menu','explore.day','explore.night','forest','village','farm','mine','coast','swamp','desert','mountain','ruins','discovery','mission','mission.success','magic','rare.phenomenon'])assert.ok(c.music.cues[id],id);
 for(const id of ['forest','plain','swamp','desert','mountain','volcano','coast','river','lake','waterfall','village','farm','mine','ruins','weather','night','underwater'])assert.ok(c.ambience[id],id);
});
test('library files are local static files whose bytes match the catalogue hashes and the V1 base64',async()=>{
 const c=parseAudioDefinitionV2(catalog);for(const a of Object.values(c.assets).filter(a=>a.uri)){const bytes=await readFile(new URL('../public/'+a.uri,import.meta.url));assert.equal(bytes.length,a.bytes);assert.equal('sha256-'+createHash('sha256').update(bytes).digest('hex'),a.contentHash);assert.equal(bytes.toString('base64'),v1.assets[a.id].bytesBase64);}
});
test('production manifest covers every PLANNED file once, with stable unique paths and a bounded enriched-beta target',()=>{
 const c=parseAudioDefinitionV2(catalog),planned=Object.values(c.assets).filter(a=>a.status==='PLANNED').map(a=>a.id).sort();
 assert.deepEqual(manifest.items.map(i=>i.assetId).sort(),planned);assert.equal(new Set(manifest.items.map(i=>i.file)).size,manifest.items.length);
 for(const i of manifest.items){assert.match(i.file,i.kind==='midi'?/^audio\/music\/[a-z0-9-]+\.mid$/:/^audio\/(sfx\/[a-z]+|ambience)\/[a-z0-9-]+\.ogg$/);assert.ok(i.brief.length>10&&i.events.length>=1&&i.durationSeconds[0]<=i.durationSeconds[1]);assert.ok(i.durationSeconds[1]<=(i.kind==='midi'?120:AUDIO_V2_LIMITS.sampleSeconds));if(i.loop&&i.kind==='sample')assert.ok(i.durationSeconds[1]<=8,'loops fit the eco PCM budget');}
 const s=manifest.summary;assert.equal(s.b1+s.byWave[2],s.enrichedBeta);assert.ok(s.enrichedBeta>=80&&s.enrichedBeta<=120,`enriched beta ${s.enrichedBeta}`);assert.ok(s.b1<s.enrichedBeta);
});
test('V1 → V2 migration is pure, keeps ids, gains, scores, emitters and the legacy music/ambience behaviour',()=>{
 const input=structuredClone(v1);input.emitters=[{id:'mill',position:{x:1,y:2,z:3},soundId:'water',radius:30,loop:true,priority:3}];const before=JSON.stringify(input),out=migrateAudioV1toV2(input);
 assert.equal(JSON.stringify(input),before,'input untouched');assert.equal(out.schemaVersion,2);assert.deepEqual(out.patchIds,v1.patchIds);assert.deepEqual(out.scores,v1.scores);assert.deepEqual(out.emitters,input.emitters);
 for(const [id,s]of Object.entries(v1.sounds)){assert.equal(out.events[id].gain,s.gain);assert.equal(out.events[id].pitch,s.pitch);assert.deepEqual(out.events[id].variants,[{assetId:s.assetId,weight:1}]);assert.equal(out.events[id].pitchJitter,0);}
 for(const a of Object.values(v1.assets))assert.equal(out.assets[a.id].bytesBase64,a.bytesBase64);
 assert.deepEqual(out.music.cues['explore.day'].scoreIds,['day']);assert.deepEqual(out.music.cues['explore.night'].scoreIds,['night']);
 assert.deepEqual(out.ambience.legacy.layers.map(l=>l.id),['rain','water']);assert.equal(out.events['player.footstep'].fallback,'step');
 assert.deepEqual(toAudioCatalog(out),out);assert.equal(parseAnyAudioDefinition(v1).schemaVersion,1);assert.deepEqual(audioSoundIds(v1).sort(),Object.keys(v1.sounds).sort());
});
test('migrated catalogue plays the same takes with the same gains (direct ids and router fallbacks)',()=>{
 const c=migrateAudioV1toV2(v1),p=picker();
 for(const [id,s]of Object.entries(v1.sounds)){const r=resolveSound(c,id,{},p);assert.ok(r.ok);assert.equal(r.sound.asset.id,s.assetId);assert.equal(r.sound.gain,s.gain);assert.equal(r.sound.pitch,s.pitch);}
 const step=resolveSound(c,'player.footstep',{surface:'grass',wet:true},p);assert.ok(step.ok);assert.deepEqual(step.sound.path,['player.footstep','step']);assert.equal(step.sound.gain,v1.sounds.step.gain);
 const rain=resolveSound(c,'weather.rain',{},p);assert.equal(rain.sound.asset.id,'sample-rain');
});
test('legacy ambience keeps the V1 order and the budget cap (rain > water > night)',()=>{
 const withNight=structuredClone(v1);withNight.ambience.night='rain';const c=migrateAudioV1toV2(withNight),mixer=new AmbienceMixer(c,()=>true,seededRandom(1));
 const all={weather:'rain',nearWater:true,time:'night'};assert.deepEqual(mixer.loops(all,1).map(l=>l.eventId),['rain']);assert.deepEqual(mixer.loops(all,2).map(l=>l.eventId),['rain','water']);
 assert.deepEqual(mixer.loops({time:'night',nearWater:true},2).map(l=>l.key),['amb:legacy:water','amb:legacy:night']);assert.deepEqual(mixer.loops({time:'day'},2),[]);
});
test('hierarchical take selection: most specific playable group, then generic, then fallback chain, then silence',()=>{
 const assets={g1:asset('g1'),g2:asset('g2'),wet:asset('wet'),stone:asset('stone',{status:'PLANNED',uri:undefined}),base:asset('base')};
 const events={'fs':event('fs',{variants:[{assetId:'g1',weight:1,when:{surface:['grass']}},{assetId:'g2',weight:1,when:{surface:['grass']}},{assetId:'wet',weight:1,when:{surface:['grass'],wet:true}},{assetId:'stone',weight:1,when:{surface:['stone']}}],fallback:'base'}),base:event('base',{variants:[{assetId:'base',weight:1}],gain:.3})};
 const c=mini(events,assets),p=picker();
 assert.equal(resolveSound(c,'fs',{surface:'grass',wet:true},p).sound.asset.id,'wet');
 for(let i=0;i<20;i++)assert.ok(['g1','g2'].includes(resolveSound(c,'fs',{surface:'grass'},p).sound.asset.id));
 const fallback=resolveSound(c,'fs',{surface:'stone'},p);assert.deepEqual(fallback.sound.path,['fs','base']);assert.equal(fallback.sound.gain,.3);
 assert.equal(resolveSound(c,'fs',{surface:'stone'},p,a=>a.id!=='base'&&assetPlayable(a)).ok,false);
 assert.deepEqual(resolveSound(c,'absent',{},p),{ok:false,reason:'unknown-event',path:['absent']});
 assert.equal(resolveSound(c,'fs',{surface:'grass',wet:true},p,a=>a.id!=='wet').sound.asset.id.startsWith('g'),true,'unavailable specific take falls back to the generic group');
});
test('variant picker: avoid-repeat, shuffle bags, weights, bounded jitter, determinism',()=>{
 const p=picker(3),c=[{key:'a',weight:1},{key:'b',weight:1},{key:'c',weight:1}];let last='';
 for(let i=0;i<300;i++){const k=p.pick('g',c,'avoid-repeat').key;assert.notEqual(k,last);last=k;}
 const bag=picker(4);let previous='';for(let cycle=0;cycle<30;cycle++){const seen=new Set();for(let i=0;i<3;i++){const k=bag.pick('b',c,'shuffle').key;assert.notEqual(k,previous);previous=k;seen.add(k);}assert.equal(seen.size,3,'each bag plays every take once');}
 const w=picker(5),counts={a:0,b:0};for(let i=0;i<4000;i++)counts[w.pick('w',[{key:'a',weight:3},{key:'b',weight:1}],'random').key]++;assert.ok(counts.a/counts.b>2.4&&counts.a/counts.b<3.7);
 const j=picker(6);for(let i=0;i<500;i++){const r=j.pitch(5);assert.ok(r>=2**(-2/12)-1e-9&&r<=2**(2/12)+1e-9,'pitch jitter clamped to 2 semitones');const g=j.gain(.9);assert.ok(g>=.5&&g<=1.5);}
 const s=picker(1),t=picker(1);for(let i=0;i<20;i++)assert.equal(s.pick('x',c,'random').key,t.pick('x',c,'random').key);
 const q=picker(2);for(let i=0;i<6;i++)assert.equal(q.pick('s',c,'sequence').key,c[i%3].key);
});
test('cooldown gate blocks rapid repeats per event and expires',()=>{
 const g=new CooldownGate();assert.ok(g.allow('e',0,300));assert.ok(!g.allow('e',100,300));assert.ok(g.allow('other',100,300));assert.ok(g.allow('e',301,300));assert.ok(g.allow('free',1,0)&&g.allow('free',1,0));
});
test('conditions: specificity, strict author validation and never-throwing runtime sanitising',()=>{
 assert.equal(matchCondition(undefined,{}),0);assert.equal(matchCondition({surface:['grass'],wet:true},{surface:'grass',wet:true}),2);assert.equal(matchCondition({surface:['grass']},{}),-1);assert.equal(matchCondition({wet:false},{}),1);
 assert.throws(()=>parseCondition({colour:['red']},'x'),/inconnu/);assert.throws(()=>parseCondition({surface:['lava']},'x'));assert.throws(()=>parseCondition({},'x'));assert.throws(()=>parseCondition({biome:['__proto__']},'x'));
 assert.deepEqual(sanitizeContext({surface:'lava',wet:'yes',biome:'forest',material:'crystal',distance:-1,__proto__:{x:1}}),{material:'crystal',biome:'forest'});assert.deepEqual(sanitizeContext(null),{});
});
test('V2 validation refuses fictive or unsafe references and out-of-range parameters',()=>{
 const ok={a:asset('a')},e={e:event('e',{variants:[{assetId:'a',weight:1}]})};assert.ok(mini(e,ok));
 const bad=[[{a:asset('a',{status:'PLANNED'})},e],[{a:asset('a',{uri:'https://cdn.example/a.wav'})},e],[{a:asset('a',{uri:'/audio/a.wav'})},e],[{a:asset('a',{uri:'audio/../secret.wav'})},e],[{a:asset('a',{uri:'audio/a.ogg'})},e],[ok,{e:event('e',{variants:[{assetId:'a',weight:1}],pitchJitter:3})}],[ok,{e:event('e',{variants:[{assetId:'missing',weight:1}]})}],[ok,{e:event('e',{fallback:'nope'})}],[ok,{x:event('x',{fallback:'y'}),y:event('y',{fallback:'x'})}],[{a:asset('a',{uri:undefined,kind:'procedural',format:'procedural',procedural:{generator:'tone',seconds:9,gain:.5,attack:0,decay:1,frequency:440}})},e],[{a:asset('a',{format:'ogg',uri:undefined,bytesBase64:'AAAA'})},e]];
 for(const [assets,events]of bad)assert.throws(()=>mini(events,assets));
 const layer={schemaVersion:2,patchIds:['flute'],assets:ok,scores:{},events:e,music:{cues:{}},ambience:{p:{id:'p',priority:1,global:true,fadeSeconds:1,layers:[{id:'l',role:'bed',eventId:'missing',priority:1,gain:1}]}},emitters:[]};assert.throws(()=>parseAudioDefinitionV2(layer),/événement absent/);
});
test('music director: context cues, hold when nothing matches, silences between takes, stingers resume the loop',()=>{
 const c=parseAudioDefinitionV2(catalog),available=id=>assetPlayable(c.assets[c.scores[id].assetId]),d=new MusicDirector(c,available,seededRandom(2));
 let r=d.update(0,{time:'day',place:'forest'},null);assert.equal(r.type,'play');assert.equal(r.scoreId,'day','forest score is PLANNED: the playable day cue wins');assert.equal(r.loop,true);
 assert.equal(d.update(1,{time:'day'},'day').type,'hold');r=d.update(2,{time:'night'},'day');assert.equal(r.scoreId,'night');
 const none=new MusicDirector(c,()=>false);assert.equal(none.update(0,{time:'day'},null).type,'hold');
 const all=new MusicDirector(c,()=>true,seededRandom(3));r=all.update(0,{place:'mine',time:'day'},null);assert.equal(r.cueId,'mine');assert.equal(r.loop,false);
 assert.equal(all.update(10,{place:'mine'},null).type,'silence');assert.equal(all.update(11,{place:'mine'},null).type,'hold');assert.equal(all.update(200,{place:'mine'},null).type,'play');
 assert.ok(all.trigger('discovery'));r=all.update(201,{place:'mine'},'music-mine');assert.equal(r.cueId,'discovery');assert.equal(r.loop,false);assert.equal(all.update(202,{place:'mine'},'music-mine').type,'hold','waits for the bar boundary');
 assert.equal(all.update(203,{place:'mine'},'music-discovery').type,'hold');assert.equal(all.update(206,{place:'mine'},null).cueId,'mine','loop cue resumes after the stinger');
 assert.equal(new MusicDirector(c,available).trigger('discovery'),false,'planned stinger is never requested');
});
test('ambience mixer: one place profile plus globals, capped loops, punctual layers on random intervals without bursts',()=>{
 const c=parseAudioDefinitionV2(catalog),mixer=new AmbienceMixer(c,()=>true,seededRandom(9));
 assert.deepEqual(mixer.profiles({place:'forest',time:'day'}).map(p=>p.id),['forest','weather','water-near','night']);
 assert.deepEqual(mixer.loops({place:'mine',weather:'rain',nearWater:true},2).map(l=>l.eventId),['ambience.cave','ambience.cave.air'],'exclusive mine profile: no rain underground');
 const loops=mixer.loops({place:'forest',weather:'rain',nearWater:true},2);assert.deepEqual(loops.map(l=>l.eventId),['weather.rain','ambience.water.river']);
 assert.deepEqual(mixer.due({place:'forest',time:'day'},0),[],'no burst when entering');let shots=0;for(let t=0;t<=120;t+=.2)shots+=mixer.due({place:'forest',time:'day'},t).filter(s=>s.eventId==='fauna.bird.song').length;assert.ok(shots>=8&&shots<=31,`${shots} bird calls in 2 min`);
 assert.deepEqual(mixer.due({place:'plain',time:'night'},121).filter(s=>s.eventId==='fauna.bird.song'),[]);
 const silent=new AmbienceMixer(c,()=>false);assert.deepEqual(silent.loops({place:'forest'},2),[]);
});
const frame=(t,player,world={})=>({nowMs:t,player:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},mode:'ground',aboard:false,...player},world:{time:'day',weather:'clear',nearWater:false,...world}});
test('router: footstep cadence is distance-based and identical at 20 and 30 FPS',()=>{
 const counts=[];for(const speed of [3.15,5])for(const fps of [20,30]){const out=[],r=new AudioEventRouter(s=>out.push(s));const dt=1000/fps;for(let t=0;t<=10000;t+=dt)r.observe(frame(t,{position:{x:speed*t/1000,y:0,z:0},velocity:{x:speed,y:0,z:0},surface:'grass'}));
  const steps=out.filter(s=>s.eventId==='player.footstep');counts.push(steps.length);assert.ok(steps.length>=(speed>4.2?38:33)&&steps.length<=(speed>4.2?41:36),`${speed} m/s @${fps}: ${steps.length}`);assert.equal(steps[0].context.surface,'grass');assert.equal(steps[0].context.movement,speed>4.2?'run':'walk');assert.equal(steps[0].source,'player');}
 assert.equal(counts[0],counts[1]);assert.equal(counts[2],counts[3]);
});
test('router: jump, glide, landing intensity, water, boat and mine transitions are business events',()=>{
 const out=[],r=new AudioEventRouter(s=>out.push(s));let t=0;const step=(p,w)=>{t+=33;return r.observe(frame(t,p,w));};
 step({});step({mode:'air',velocity:{x:0,y:6,z:0}});step({mode:'glide',velocity:{x:5,y:-1,z:0}});const loops=step({mode:'glide',velocity:{x:8,y:-1,z:0}});assert.equal(loops[0].eventId,'player.glide.wind');
 step({mode:'air',velocity:{x:0,y:-14,z:0}});step({mode:'ground',surface:'stone'});step({mode:'swim',velocity:{x:0,y:-3,z:0}});step({mode:'dive'});step({mode:'swim'});step({mode:'ground'});
 step({aboard:true,boatSpeed:3});assert.equal(step({aboard:true,boatSpeed:3})[0].eventId,'boat.move');step({aboard:false});
 step({space:{zoneId:'m',levelId:'l0'}});step({space:{zoneId:'m',levelId:'l1'}});step({space:null});
 assert.deepEqual(out.map(s=>s.eventId),['player.jump','player.glide.deploy','player.glide.fold','player.land','water.enter','water.dive','water.surface','water.exit','boat.board','boat.disembark','mine.enter','mine.level.change','mine.exit']);
 assert.equal(out.find(s=>s.eventId==='player.land').context.intensity,'heavy');assert.equal(out.find(s=>s.eventId==='player.land').context.surface,'stone');
 assert.equal(r.context.activity,'explore');r.observe(frame(t+33,{space:{zoneId:'m',levelId:'l0'}}));assert.equal(r.context.place,'mine');assert.equal(r.context.activity,'mining');
 r.observe(frame(t+66,{},{weather:'rain',submerged:true}));assert.equal(r.context.wet,true);assert.equal(r.context.place,'underwater');
 assert.doesNotThrow(()=>{r.emit('');r.emit(undefined);r.emit('x',{context:{surface:42}});});assert.deepEqual(out.at(-1).context.surface,undefined);
});
test('procedural UI sounds are deterministic, bounded and short',()=>{
 const c=parseAudioDefinitionV2(catalog);for(const a of Object.values(c.assets).filter(a=>a.kind==='procedural')){const x=renderProcedural(a.procedural,48000),y=renderProcedural(a.procedural,48000);assert.deepEqual(x,y);assert.ok(x.length<=4*48000);assert.ok(Math.max(...x.map(Math.abs))<=1&&Math.max(...x.map(Math.abs))>.01);}
});
test('every event the game router or runtime emits exists in the shipped catalogue and silent ones are diagnosed, not thrown',async()=>{
 const c=parseAudioDefinitionV2(catalog),sources=['../src/audio/router.ts','../src/main.ts'].map(f=>readFile(new URL(f,import.meta.url),'utf8'));const text=(await Promise.all(sources)).join('\n');
 const ids=new Set([...text.matchAll(/'((?:player|water|boat|mine|farm|npc|ui|interaction)\.[a-z.]+)'/g)].map(m=>m[1]));assert.ok(ids.size>=15);for(const id of ids)assert.ok(c.events[id],'missing event '+id);
 const silent=diagnoseAudioCatalog(c).filter(d=>d.code==='event-silent').map(d=>d.ref);for(const id of silent)assert.equal(eventAvailability(c,id).playable,false);
});
test('V2 audio is accepted by Studio projects, link validation and the portable V3 archive',()=>{
 const project=createProject({name:'Audio V2'});project.world.audio=catalog;const parsed=parseProject(project);assert.equal(parsed.world.audio.schemaVersion,2);
 assert.deepEqual(readProjectArchive(writeProjectArchive(parsed)).world.audio,catalog);
 assert.doesNotThrow(()=>validateAudioLinks(catalog,[],['collect','interaction.lever']));assert.throws(()=>validateAudioLinks(catalog,[],['nope']),/absent/);
 const v1project=createProject({name:'Audio V1'});v1project.world.audio=v1;assert.equal(parseProject(v1project).world.audio.schemaVersion,1,'V1 projects stay V1 until the author migrates');
});
test('the beta map (V1 audio) still loads and converts in memory',async()=>{
 const beta=await json('../public/maps/beta.json');assert.equal(beta.audio.schemaVersion,1);const c=toAudioCatalog(beta.audio);assert.equal(c.schemaVersion,2);assert.deepEqual(Object.keys(beta.audio.sounds).every(id=>c.events[id]),true);
});
test('installing the shipped catalogue on a migrated V1 project keeps every author value and adds missing ids only',async()=>{
 const {mergeAudioCatalogs}=await import('../src/audio/migrate.ts');const custom=structuredClone(v1);custom.sounds.collect.gain=.2;custom.emitters=[{id:'e',position:{x:0,y:0,z:0},soundId:'water',radius:10,loop:true,priority:1}];
 const base=migrateAudioV1toV2(custom),merged=mergeAudioCatalogs(base,parseAudioDefinitionV2(catalog));
 assert.equal(merged.events.collect.gain,.2);assert.ok(merged.events['player.footstep'].variants.length>10&&merged.events['player.footstep'].fallback==='step','migration alias replaced by the richer built-in event');
 const p=picker();assert.equal(resolveSound(merged,'player.footstep',{surface:'grass'},p).sound.asset.id,'sample-step');assert.equal(resolveSound(merged,'interaction.collect',{},p).sound.gain,.2,'fallback still uses the author gain');assert.deepEqual(merged.emitters,custom.emitters);assert.ok(merged.events['mine.hit']&&merged.ambience.forest&&merged.music.cues.mine);
 assert.ok(merged.ambience.legacy&&!merged.ambience.weather,'no doubled rain/water layers');assert.equal(merged.music.cues.day,undefined);assert.deepEqual(Object.keys(merged.music.cues).filter(k=>k.startsWith('explore')).sort(),['explore.day','explore.night']);
 assert.equal(merged.assets['sample-collect'].bytesBase64,v1.assets['sample-collect'].bytesBase64,'embedded V1 bytes kept (portable)');
});
test('a produced file replaces its PLANNED entry: probed metadata, played instead of the fallback, removed from the to-do list',async()=>{
 const {buildAudioCatalog}=await import('../src/audio/catalog-source.ts'),{probeAudioFile,probeOgg}=await import('../tools/audio-probe.mjs');
 const library=Object.fromEntries(Object.entries(catalog.assets).filter(([,a])=>a.uri?.startsWith('audio/library/')));
 const wav=new Uint8Array(await readFile(new URL('../public/audio/library/sample-step.wav',import.meta.url))),meta=probeAudioFile(wav,'wav');
 assert.equal(meta.channels,1);assert.equal(meta.contentHash,library['sample-step'].contentHash);
 const built=buildAudioCatalog(library,{'fs-grass-01':{uri:'audio/sfx/movement/fs-grass-01.wav',status:'GENERATED',source:'test',license:'CC0-1.0',...meta}}),c=parseAudioDefinitionV2(built.catalog);
 assert.equal(c.assets['fs-grass-01'].status,'GENERATED');assert.equal(c.assets['fs-grass-01'].format,'wav');assert.ok(!built.production.some(p=>p.assetId==='fs-grass-01'));assert.equal(built.done.length,1);
 const r=resolveSound(c,'player.footstep',{surface:'grass'},picker());assert.equal(r.sound.asset.id,'fs-grass-01');assert.deepEqual(r.sound.path,['player.footstep']);
 assert.throws(()=>buildAudioCatalog(library,{'sample-step':{uri:'audio/x.wav'}}),/inconnue ou déjà disponible/);
 assert.throws(()=>probeOgg(wav),/OggS/);
});
