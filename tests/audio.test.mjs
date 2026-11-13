import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseMidi} from '../src/audio/midi.ts';
import {parseAudioDefinition,base64Bytes} from '../src/audio/schema.ts';
import {inspectWav} from '../src/audio/wav.ts';
import {audioBudgetForLevel} from '../src/audio/budget.ts';
import {createProject,parseProject} from '../src/studio-core/schema.ts';
import {writeProjectArchive,readProjectArchive} from '../src/studio-core/archive.ts';
const definition=JSON.parse(await readFile(new URL('../public/audio/default.json',import.meta.url),'utf8'));
const u32=n=>[n>>>24&255,n>>>16&255,n>>>8&255,n&255],tag=s=>[...s].map(c=>c.charCodeAt(0));
function smf(tracks,division=480,format=tracks.length===1?0:1){return Uint8Array.from([...tag('MThd'),...u32(6),0,format,0,tracks.length,division>>8,division&255,...tracks.flatMap(bytes=>[...tag('MTrk'),...u32(bytes.length),...bytes])]);}
const end=[0,255,47,0];
test('SMF type 0 handles running status, velocity-zero note-off and exact ticks',()=>{
 const m=parseMidi(smf([[0,0xc0,73,0,0x90,60,80,0x83,0x60,60,0,...end]]));assert.equal(m.format,0);assert.equal(m.notes.length,1);assert.equal(m.notes[0].duration,.5);assert.equal(m.notes[0].program,73);assert.equal(m.maxPolyphony,1);
});
test('SMF type 1 merges tempo changes across tracks and note-off boundaries',()=>{
 const midi=smf([[0,255,81,3,7,161,32,0x83,0x60,255,81,3,15,66,64,0x83,0x60,255,47,0],[0,0x90,60,100,0x83,0x60,0x80,60,0,0,0x90,64,100,0x83,0x60,0x80,64,0,...end]]),m=parseMidi(midi);assert.equal(m.format,1);assert.deepEqual(m.notes.map(n=>[n.start,n.duration]),[[0,.5],[.5,1]]);assert.equal(m.maxPolyphony,1);assert.equal(m.duration,1.5);
});
test('invalid MIDI rejects truncated lengths, SMPTE, SysEx, malformed status and VLQ',()=>{
 for(const bytes of [smf([[0,240,0,...end]]),smf([[0,60,40,...end]]),smf([[255,255,255,255,255,...end]]),smf([end],0xe728)])assert.throws(()=>parseMidi(bytes));const valid=smf([[0,0x90,60,50,0x83,0x60,0x80,60,0,...end]]);assert.throws(()=>parseMidi(valid.slice(0,-1)));assert.throws(()=>parseMidi(smf([end],480,2)));
});
test('dangling notes are bounded and unsupported controllers are diagnosed',()=>{
 const parsed=parseMidi(smf([[0,0xb0,64,127,0,0x90,60,80,...end]]));assert.equal(parsed.notes.length,1);assert.equal(parsed.notes[0].duration,.5);assert.equal(parsed.warnings.length,2);
});
test('default palette has five patches, licensed embedded MIDI and bounded original PCM',()=>{
 const d=parseAudioDefinition(definition);assert.equal(d.patchIds.length,5);for(const score of Object.values(d.scores)){const parsed=parseMidi(base64Bytes(d.assets[score.assetId].bytesBase64));assert.equal(parsed.programs.length,5);assert.ok(parsed.notes.length>30);assert.ok(parsed.maxPolyphony<=5);}
 for(const asset of Object.values(d.assets)){assert.equal(asset.license,'CC0-1.0');if(asset.kind==='sample'){const info=inspectWav(base64Bytes(asset.bytesBase64));assert.ok(info.duration<=1.5);assert.equal(info.channels,1);}}
});
test('audio rejects unknown presets, missing references, oversized PCM and malformed base64 before decode',()=>{
 const bad=structuredClone(definition);bad.patchIds.push('general-midi-bank');assert.throws(()=>parseAudioDefinition(bad));const missing=structuredClone(definition);missing.sounds.collect.assetId='absent';assert.throws(()=>parseAudioDefinition(missing));assert.throws(()=>base64Bytes('a!??'));const wav=base64Bytes(definition.assets['sample-water'].bytesBase64);new DataView(wav.buffer).setUint32(24,1,true);assert.throws(()=>inspectWav(wav));
});
test('embedded audio survives a complete V3 archive roundtrip without contexts or decoded buffers',()=>{
 const project=createProject({name:'Audio archive'});project.world.audio=definition;assert.deepEqual(readProjectArchive(writeProjectArchive(parseProject(project))).world.audio,definition);assert.ok(!JSON.stringify(project).includes('AudioBuffer'));
});
test('audio consumes the existing quality level with fixed voice/spatial/cache ceilings',()=>{
 for(const level of [0,1,2]){const b=audioBudgetForLevel(level);assert.ok(b.maxTotalVoices>b.maxMusicVoices);assert.ok(b.maxSpatial<=4);assert.ok(b.maxPcmBytes<=4_194_304);}assert.ok(audioBudgetForLevel(2).maxTotalVoices<audioBudgetForLevel(0).maxTotalVoices);
});

test('spatial emitter selection virtualizes 200 sources and keeps only nearby highest priorities',async()=>{
 const {AudioEmitterIndex}=await import('../src/audio/spatial.ts');const emitters=Array.from({length:200},(_,i)=>({id:'bird-'+i,position:{x:i<5?i:5000+i,y:0,z:0},soundId:'collect',radius:20,loop:true,priority:i===4?10:1}));const index=new AudioEmitterIndex(emitters),selected=index.audible({x:0,y:0,z:0},()=>undefined,2);assert.equal(selected.length,2);assert.equal(selected[0].emitter.id,'bird-4');assert.equal(selected[1].emitter.id,'bird-0');assert.equal(index.audible({x:-5000,y:0,z:0},()=>undefined,4).length,0);
});
test('action sounds and attached emitters cannot reference absent project data',async()=>{
 const {validateAudioLinks}=await import('../src/audio/schema.ts');const d=structuredClone(definition);d.emitters=[{id:'speaker',entityId:'absent',soundId:'water',radius:20,loop:true,priority:1}];assert.throws(()=>validateAudioLinks(d,[],[]));assert.throws(()=>validateAudioLinks(undefined,[],['collect']));assert.throws(()=>validateAudioLinks(definition,[],['constructor']));const bad=structuredClone(definition);bad.music.day='constructor';assert.throws(()=>parseAudioDefinition(bad));
});
test('listener and panner support the Firefox legacy position/orientation API as well as AudioParams',async()=>{
 const {positionListener,positionPanner}=await import('../src/audio/positions.ts');const calls=[];positionListener({setPosition:(...p)=>calls.push(p),setOrientation:(...p)=>calls.push(p)},{x:1,y:2,z:3},{x:0,y:0,z:1});assert.deepEqual(calls,[[1,2,3],[0,0,1,0,1,0]]);positionPanner({setPosition:(...p)=>calls.push(p)},{x:4,y:5,z:6});assert.deepEqual(calls.at(-1),[4,5,6]);const modern={positionX:{value:0},positionY:{value:0},positionZ:{value:0},forwardX:{value:0},forwardY:{value:0},forwardZ:{value:0}};positionListener(modern,{x:1,y:2,z:3},{x:0,y:0,z:1});assert.equal(modern.positionY.value,2);assert.equal(modern.forwardZ.value,1);
});
