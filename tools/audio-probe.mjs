/** Deterministic metadata of produced audio files (no decoding, no dependency): WAV via the
 * bounded RIFF reader, Ogg Vorbis/Opus via the identification header and the last granule,
 * MIDI via the restricted SMF reader. Used by `npm run generate:audio`. */
import {createHash} from 'node:crypto';
import {inspectWav} from '../src/audio/wav.ts';
import {parseMidi} from '../src/audio/midi.ts';
export function probeOgg(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),tag=(at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
 if(bytes.length<64||tag(0,4)!=='OggS')throw Error('Fichier Ogg invalide (signature OggS absente)');
 const segments=bytes[26],packet=27+segments;let channels,sampleRate,codec,clock;
 if(bytes[packet]===1&&tag(packet+1,6)==='vorbis'){codec='vorbis';channels=bytes[packet+11];sampleRate=view.getUint32(packet+12,true);clock=sampleRate;}
 else if(tag(packet,8)==='OpusHead'){codec='opus';channels=bytes[packet+9];sampleRate=48000;clock=48000;}
 else throw Error('Ogg : flux Vorbis ou Opus attendu');
 let last=-1;for(let at=bytes.length-27;at>=0;at--)if(bytes[at]===0x4f&&tag(at,4)==='OggS'){last=at;break;}
 const granule=Number(view.getBigUint64(last+6,true)),preSkip=codec==='opus'?view.getUint16(packet+10,true):0;
 if(!(channels===1||channels===2)||sampleRate<8000||sampleRate>96000||granule<=0)throw Error('Ogg : canaux/fréquence/durée invalides');
 return {codec,channels,sampleRate,duration:Math.round((granule-preSkip)/clock*1e4)/1e4};
}
export function probeAudioFile(bytes,format){
 const contentHash='sha256-'+createHash('sha256').update(bytes).digest('hex');
 if(format==='midi'){const m=parseMidi(bytes);return {bytes:bytes.length,contentHash,duration:Math.round(m.duration*1000)/1000};}
 const info=format==='wav'?inspectWavStatic(bytes):probeOgg(bytes);
 return {bytes:bytes.length,contentHash,duration:info.duration,channels:info.channels,sampleRate:info.sampleRate,estimatedDecodedBytes:Math.ceil(info.duration*48000)*info.channels*4};
}
/** Static files may be up to 12 s (embedded WAV keeps the 8 s/1 Mio V1 rule). */
function inspectWavStatic(bytes){try{return inspectWav(bytes);}catch(error){if(!/huit secondes|RIFF invalide/.test(String(error)))throw error;}
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),channels=v.getUint16(22,true),sampleRate=v.getUint32(24,true),block=v.getUint16(32,true);let at=12,data=0;
 while(at+8<=bytes.length){const id=String.fromCharCode(...bytes.subarray(at,at+4)),size=v.getUint32(at+4,true);if(id==='data'){data=size;break;}at+=8+size+(size%2);}
 if(!data||!block)throw Error('WAV invalide');return {channels,sampleRate,duration:Math.round(data/block/sampleRate*1e4)/1e4};}
