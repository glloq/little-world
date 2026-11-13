/** AUD-V2 — bounded procedural one-shots (UI chimes, signals). Parameters only, no author code;
 * deterministic output (seeded noise) so the same descriptor always produces the same PCM. */
import type {ProceduralSpec} from './catalog.ts';
export function renderProcedural(spec:ProceduralSpec,sampleRate:number):Float32Array {
 const n=Math.max(1,Math.min(Math.round(spec.seconds*sampleRate),Math.round(4*sampleRate))),out=new Float32Array(n);
 const notes=spec.notes?.length?spec.notes:[0],segment=n/notes.length,harmonics=spec.harmonics??[];let seed=0x2545f491,low=0,phase=0;
 for(let i=0;i<n;i++){
  const t=i/sampleRate,local=(i%segment)/sampleRate,note=notes[Math.min(notes.length-1,Math.floor(i/segment))];
  const envelope=Math.min(1,spec.attack>0?local/spec.attack:1)*Math.exp(-spec.decay*local)*Math.min(1,(n-i)/(sampleRate*.008));
  let v:number;
  if(spec.generator==='tone'){const f=spec.frequency!*2**((note+(spec.sweep??0)*t/spec.seconds)/12);phase+=2*Math.PI*f/sampleRate;v=Math.sin(phase);harmonics.forEach((h,k)=>{v+=h*Math.sin(phase*(k+2));});v/=1+harmonics.reduce((s,h)=>s+h,0);}
  else{seed=(Math.imul(seed,1664525)+1013904223)>>>0;const white=seed/4294967296*2-1;low+=(spec.lowpass??1)*(white-low);v=spec.color==='brown'?Math.max(-1,Math.min(1,low*3)):spec.lowpass?low:white;}
  out[i]=v*envelope*spec.gain;
 }
 return out;
}
