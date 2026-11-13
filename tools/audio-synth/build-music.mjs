/** Lot B — write the original MIDI themes and check them with the game's own SMF parser.
 *   node --experimental-strip-types tools/audio-synth/build-music.mjs [--check] */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {parseMidi} from '../../src/audio/midi.ts';
import {smf,compose,outOfKey,PPQN} from './music.mjs';
import {PIECES} from './compositions.mjs';
import {PRODUCTION_DATE} from './render.mjs';
const root=new URL('../../',import.meta.url),verify=process.argv.includes('--check');
export const MUSIC_VERSION='lw-music-1';
/** Technical + musical sanity checks (not a listening test). */
export function checkPiece(id,p,bytes){const m=parseMidi(bytes),bad=[],bars=p.chords.length,bpb=p.beatsPerBar??4,expected=bars*bpb*60/p.bpm;
 if(m.format!==1||m.ppqn!==PPQN)bad.push('format/PPQN');if(m.warnings.length)bad.push('avertissements : '+m.warnings.join(' ; '));if(Math.abs(m.duration-expected)>.01)bad.push(`durée ${m.duration.toFixed(2)} ≠ ${expected.toFixed(2)} s`);
 if(m.maxPolyphony>6)bad.push(`polyphonie ${m.maxPolyphony} > 6`);if(m.programs.some(x=>![0,10,24,73,115].includes(x)))bad.push('programme hors palette');
 if(m.notes.some(n=>n.start+n.duration>m.duration+1e-6))bad.push('note dépassant la fin (boucle)');
 const odd=outOfKey(p);if(odd.length)bad.push('notes hors tonalité/accord : '+odd.slice(0,5).join(', '));
 const leadCh=new Set(Object.keys(p.melodies??{}).map(i=>({flute:0,pluck:1,harp:2,bell:3})[i])),lead=m.notes.filter(n=>leadCh.has(n.channel)&&n.velocity>.4),distinct=new Set(lead.map(n=>n.note)).size;if(id!=='music-rare'&&!id.match(/discovery|success/)&&distinct<7)bad.push(`mélodie trop pauvre (${distinct} hauteurs)`);
 return {bad,metrics:{durationS:+m.duration.toFixed(2),bpm:p.bpm,bars,beatsPerBar:bpb,notes:m.notes.length,maxPolyphony:m.maxPolyphony,programs:m.programs,leadPitches:distinct}};}
/** Melodic fingerprint (lead intervals) to detect a theme that would only be a transposed copy of another. */
export function fingerprint(p){const {ev}=compose(p),lead=[...(ev.flute??[]),...(ev.pluck??[]).filter(n=>n.vel>60),...(ev.bell??[]),...(ev.harp??[]).filter(n=>n.vel>55)].sort((a,b)=>a.s-b.s);return lead.slice(1,25).map((n,i)=>n.note-lead[i].note).join(',');}
const registry=JSON.parse(await readFile(new URL('assets/audio/produced.json',root),'utf8'));let report={};try{report=JSON.parse(await readFile(new URL('assets/audio/qc-report.json',root),'utf8'));}catch{}
const problems=[],prints=new Map();
for(const [id,p]of Object.entries(PIECES)){const bytes=smf(p),{bad,metrics}=checkPiece(id,p,bytes),fp=fingerprint(p);if(prints.has(fp))bad.push('mélodie identique à '+prints.get(fp));prints.set(fp,id);
 if(bad.length){problems.push(`${id} : ${bad.join(' ; ')}`);continue;}const file=`audio/music/${id}.mid`,url=new URL('public/'+file,root);
 if(verify){const old=new Uint8Array(await readFile(url));if(!Buffer.from(old).equals(Buffer.from(bytes)))problems.push(id+' : rendu non reproductible');continue;}
 await mkdir(new URL('public/audio/music/',root),{recursive:true});await writeFile(url,bytes);
 registry.files[id]={file,status:'TECHNICALLY_VALID',source:`Little World — composition originale « ${p.title} » (tools/audio-synth/compositions.mjs, ${PRODUCTION_DATE}), mélodie écrite note à note, accompagnement généré par grille d’accords`,license:'CC0-1.0',generatorVersion:MUSIC_VERSION,notes:`${metrics.bars} mesures à ${metrics.bpm} BPM, polyphonie ${metrics.maxPolyphony}. Contrôles SMF/tonalité réussis ; écoute humaine non réalisée.`};
 report[id]={group:'music',lot:'B',file,loop:false,...metrics};}
if(problems.length){console.error('Musique en échec :\n- '+problems.join('\n- '));process.exit(1);}
if(verify){console.log(`${Object.keys(PIECES).length} partitions identiques aux fichiers livrés.`);process.exit(0);}
const sorted=o=>Object.fromEntries(Object.entries(o).sort(([a],[b])=>a.localeCompare(b)));registry.files=sorted(registry.files);
await writeFile(new URL('assets/audio/produced.json',root),JSON.stringify(registry,null,1)+'\n');await writeFile(new URL('assets/audio/qc-report.json',root),JSON.stringify(sorted(report),null,1)+'\n');
console.log(`${Object.keys(PIECES).length} partitions MIDI écrites et vérifiées.`);
