/** Automatic technical QC of produced WAV files. Measures only — it never claims a listening test. */
import {db,peak,rms} from './dsp.mjs';
function fft(re,im){const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){const a=-2*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci,vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t;}}}}
/** Average magnitude spectrum over frames of 4096 → centroid (Hz) and 24 log bands (for similarity). */
export function spectrum(x,sr){const N=4096,bands=new Float64Array(24);let num=0,den=0;const hop=N;for(let s=0;s+N<=Math.max(N,x.length);s+=hop){const re=new Float64Array(N),im=new Float64Array(N);for(let i=0;i<N;i++)re[i]=(x[s+i]??0)*(.5-.5*Math.cos(2*Math.PI*i/N));fft(re,im);
  for(let k=1;k<N/2;k++){const f=k*sr/N,m=Math.hypot(re[k],im[k]);num+=f*m;den+=m;const b=Math.min(23,Math.max(0,Math.floor(Math.log2(f/40)*24/9)));bands[b]+=m;}}
 const total=bands.reduce((a,b)=>a+b,0)||1;return {centroid:den?num/den:0,bands:[...bands].map(b=>b/total)};}
export function measure(x,sr,{loop=false}={}){
 const p=peak(x),n=x.length;let clipped=0,mean=0,maxStep=0;for(let i=0;i<n;i++){if(Math.abs(x[i])>=.999)clipped++;mean+=x[i];if(i)maxStep=Math.max(maxStep,Math.abs(x[i]-x[i-1]));}mean/=n;
 const thr=p*.05;let lead=0;while(lead<n&&Math.abs(x[lead])<thr)lead++;
 const win=Math.round(.01*sr);let gap=0,longest=0;const until=Math.round(n*.7);for(let s=0;s+win<=until;s+=win){if(db(rms(x,s,s+win))<-65){gap+=win;longest=Math.max(longest,gap);}else gap=0;}
 const m={durationS:+(n/sr).toFixed(4),sampleRate:sr,peakDb:+db(p).toFixed(2),rmsDb:+db(rms(x)).toFixed(2),clipped,dc:+mean.toFixed(5),leadingSilenceMs:+(lead/sr*1000).toFixed(1),longestInnerSilenceMs:+(longest/sr*1000).toFixed(0),edgeStart:+Math.abs(x[0]).toFixed(4),edgeEnd:+Math.abs(x[n-1]).toFixed(4),maxStep:+maxStep.toFixed(3),...spectrumSummary(x,sr)};
 if(loop){const w=Math.round(.05*sr),head=rms(x,0,w),tail=rms(x,n-w,n);let mean=0;for(let i=1;i<n;i++)mean+=Math.abs(x[i]-x[i-1]);mean/=n-1;m.loopSeamJump=+(Math.abs(x[0]-x[n-1])/(mean||1e-9)).toFixed(2);m.loopEdgeDb=+(db(head)-db(tail)).toFixed(2);}
 return m;
}
function spectrumSummary(x,sr){const s=spectrum(x,sr);return {centroidHz:Math.round(s.centroid),bands:s.bands.map(v=>+v.toFixed(4))};}
/** Pass/fail rules (technical only). Returns a list of problems. */
export function check(m,{loop=false}={}){const p=[];
 if(m.clipped>0)p.push(`écrêtage (${m.clipped} échantillons)`);if(m.peakDb>-0.9)p.push(`crête trop haute (${m.peakDb} dBFS)`);if(m.rmsDb<-50)p.push(`niveau quasi nul (${m.rmsDb} dBFS)`);
 if(Math.abs(m.dc)>.01)p.push(`offset DC ${m.dc}`);if(m.maxStep>1.2)p.push(`discontinuité ${m.maxStep}`);
 if(!loop){if(m.leadingSilenceMs>25)p.push(`silence initial ${m.leadingSilenceMs} ms`);if(m.edgeStart>.02||m.edgeEnd>.01)p.push('bord non nul (clic possible)');if(m.longestInnerSilenceMs>300)p.push(`silence interne ${m.longestInnerSilenceMs} ms`);}
 else{if(m.loopSeamJump>8)p.push(`raccord de boucle discontinu (×${m.loopSeamJump})`);if(Math.abs(m.loopEdgeDb)>3)p.push(`écart de niveau au raccord ${m.loopEdgeDb} dB`);if(m.longestInnerSilenceMs>0)p.push('silence dans une boucle');}
 return p;}
/** Within a group: takes must be distinct (waveform & spectral signature), levels coherent. */
export function groupCheck(items){const p=[];for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){const a=items[i],b=items[j],c=corr(a.x,b.x);if(c>.9)p.push(`${a.id}/${b.id} presque identiques (corrélation ${c.toFixed(2)})`);}
 if(items.length>1){const levels=items.map(i=>i.m.rmsDb),spread=Math.max(...levels)-Math.min(...levels);if(spread>6)p.push(`écart de niveau entre prises ${spread.toFixed(1)} dB`);}return p;}
export function corr(a,b){const n=Math.min(a.length,b.length);let best=0;for(const lag of [0,-64,64,-256,256]){let s=0,ea=0,eb=0;for(let i=Math.max(0,-lag);i<n&&i+lag<n;i++){const u=a[i],v=b[i+lag]??0;s+=u*v;ea+=u*u;eb+=v*v;}best=Math.max(best,Math.abs(s)/Math.sqrt(ea*eb||1));}return best;}
