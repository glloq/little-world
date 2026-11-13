/** Little World original MIDI compositions (SMF type 1, PPQN 480) for the five shared patches:
 * flute (GM 73, ch 0), pluck (GM 0, ch 1), harp (GM 24, ch 2), bell (GM 10, ch 3), soft drum (GM 115, ch 4).
 * Melodies are written by hand below; accompaniment (arpeggios, bass, bells, drums) is generated from the
 * chord chart with seeded humanisation. Every piece is checked: bar sums, loop end, note-offs, polyphony. */
import {rng} from './dsp.mjs';
export const PPQN=480;
const CH={flute:0,pluck:1,harp:2,bell:3,drum:4},PROGRAM={flute:73,pluck:0,harp:24,bell:10,drum:115};
const NOTE={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
export const midiOf=s=>{const m=/^([A-G])(#|b)?(-?\d)$/.exec(s);if(!m)throw Error('Note invalide '+s);return 12*(Number(m[3])+1)+NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);};
const DUR={w:4,h:2,q:1,e:.5,s:.25};
/** "E5:q D5:e r:e | G4:h." → [{note|null, beats}] ; bars separated by "|" and checked against the meter. */
export function line(text,beatsPerBar){const bars=text.split('|').map(b=>b.trim()).filter(Boolean),out=[];bars.forEach((bar,i)=>{let sum=0;for(const tok of bar.split(/\s+/)){const m=/^([A-Gr][#b]?\d?):([whqes])(\.?)(t?)$/.exec(tok);if(!m)throw Error('Jeton invalide '+tok);let b=DUR[m[2]]*(m[3]?1.5:1)*(m[4]?2/3:1);sum+=b;out.push({note:m[1]==='r'?null:midiOf(m[1]),beats:b});}if(Math.abs(sum-beatsPerBar)>1e-6)throw Error(`Mesure ${i+1} : ${sum} temps au lieu de ${beatsPerBar} (« ${bar} »)`);});return out;}
const QUAL={'':[0,4,7],m:[0,3,7],'7':[0,4,7,10],m7:[0,3,7,10],maj7:[0,4,7,11],dim:[0,3,6],sus4:[0,5,7],sus2:[0,2,7],add9:[0,4,7,14]};
export function chord(sym){const m=/^([A-G])(#|b)?(m7|maj7|m|7|dim|sus4|sus2|add9)?$/.exec(sym);if(!m)throw Error('Accord invalide '+sym);const root=NOTE[m[1]]+(m[2]==='#'?1:m[2]==='b'?-1:0);return {root:(root+12)%12,tones:QUAL[m[3]??''].map(i=>(root+i)%12),intervals:QUAL[m[3]??'']};}
const near=(pc,oct)=>12*(oct+1)+pc;
/** Build all tracks of a piece from its definition. */
export function compose(p){
 const r=rng(p.seed),bpb=p.beatsPerBar??4,bars=p.chords.length,end=bars*bpb*PPQN,ev={flute:[],pluck:[],harp:[],bell:[],drum:[]};
 const add=(inst,note,start,dur,vel)=>{const s=Math.round(start*PPQN),e=Math.min(end-1,Math.round((start+dur)*PPQN));if(e<=s)return;ev[inst].push({s,e,note,vel:Math.max(1,Math.min(127,Math.round(vel+(r()*2-1)*(p.humanize??6))))});};
 for(const [inst,spec]of Object.entries(p.melodies??{})){let t=spec.from??0;for(const n of line(spec.notes,bpb)){if(n.note!==null)add(inst,n.note+(spec.transpose??0),t,n.beats*(spec.legato??.92),spec.vel??78);t+=n.beats;}}
 p.chords.forEach((sym,bar)=>{const c=chord(sym),t0=bar*bpb;
  if(p.harp){const {step=.5,octave=3,pattern=[0,1,2,3,2,1],vel=46,hold=2,every=1}=p.harp;if(bar%every===0){const notes=[0,1,2,3].map(k=>{const i=c.intervals[k%c.intervals.length]+12*Math.floor(k/c.intervals.length);return near(c.root,octave)+i;});notes.push(notes[0]+12,notes[1]+12);for(let k=0,t=t0;t<t0+bpb-1e-6;k++,t+=step)add('harp',notes[pattern[k%pattern.length]],t,step*hold,vel-(k%2)*6);}}
  if(p.bass){const {beats=[0,2],octave=2,vel=60,len=.9,fifth=true}=p.bass;beats.forEach((b,k)=>add('pluck',near(c.root,octave)+(fifth&&k%2?7:0),t0+b,len,vel-(k?8:0)));}
  if(p.comp){const {beats=[.5,1.5,2.5,3.5],octave=4,vel=40,len=.3}=p.comp;for(const b of beats)for(const pc of c.tones.slice(1,3))add('pluck',near(pc,octave),t0+b,len,vel);}
  if(p.bells&&bar%p.bells.every===(p.bells.offset??0)){const top=c.tones[c.tones.length-1];add('bell',near(top,p.bells.octave??5),t0+(p.bells.beat??0),p.bells.len??2,p.bells.vel??44);}
  if(p.drums){const pat=p.drums.patterns[bar%p.drums.patterns.length],step=bpb/pat.length;[...pat].forEach((ch,k)=>{if(ch==='k')add('drum',45,t0+k*step,.2,p.drums.kick??62);else if(ch==='t')add('drum',57,t0+k*step,.1,p.drums.tick??26);});}
 });
 for(const extra of p.extra??[])add(extra.inst,midiOf(extra.note),extra.at,extra.beats,extra.vel??60);
 return {ev,end,bpb};
}
const vlq=n=>{const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a;};
const u32=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255],u16=n=>[(n>>>8)&255,n&255],tag=s=>[...s].map(c=>c.charCodeAt(0));
function track(events,endTick){const list=[...events].sort((a,b)=>a.t-b.t||a.order-b.order),out=[];let prev=0;for(const e of list){out.push(...vlq(e.t-prev),...e.bytes);prev=e.t;}out.push(...vlq(Math.max(0,endTick-prev)),0xff,0x2f,0);return [...tag('MTrk'),...u32(out.length),...out];}
/** SMF type 1: conductor (tempo, meter, title) + one track per used instrument. */
export function smf(p){const {ev,end,bpb}=compose(p),tempo=Math.round(60000000/p.bpm),title=[...new TextEncoder().encode(p.title)].slice(0,60);
 const tracks=[track([{t:0,order:0,bytes:[0xff,0x03,title.length,...title]},{t:0,order:1,bytes:[0xff,0x51,3,(tempo>>16)&255,(tempo>>8)&255,tempo&255]},{t:0,order:2,bytes:[0xff,0x58,4,bpb,2,24,8]}],end)];
 for(const [inst,notes]of Object.entries(ev)){if(!notes.length)continue;const ch=CH[inst],list=[{t:0,order:0,bytes:[0xc0+ch,PROGRAM[inst]]}];for(const n of notes){list.push({t:n.s,order:2,bytes:[0x90+ch,n.note,n.vel]},{t:n.e,order:1,bytes:[0x80+ch,n.note,0]});}tracks.push(track(list,end));}
 return new Uint8Array([...tag('MThd'),...u32(6),...u16(1),...u16(tracks.length),...u16(PPQN),...tracks.flat()]);}
/** Notes outside the key's scale that are not chord tones of the bar (unintended dissonance check). */
export function outOfKey(p){const {ev,bpb}=compose(p),scale=p.scale.map(n=>NOTE[n[0]]+(n[1]==='#'?1:n[1]==='b'?-1:0)),bad=[];for(const [inst,notes]of Object.entries(ev)){if(inst==='drum')continue;for(const n of notes){const bar=Math.floor(n.s/PPQN/bpb),c=chord(p.chords[Math.min(bar,p.chords.length-1)]),pc=n.note%12;if(!scale.includes((pc+12)%12)&&!c.tones.includes(pc))bad.push(`${inst} ${n.note} mesure ${bar+1}`);}}return bad;}
