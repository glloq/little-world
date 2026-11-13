/** Little World procedural audio DSP — deterministic (seeded), dependency-free, offline only.
 * Building blocks for physically inspired sound design: coloured noise, RBJ biquads, modal
 * resonators (impacts), bubbles (water), grains (rustle/crunch/rain), envelopes, seamless loops. */
export const SR=44100;
export function rng(seed){let a=(seed>>>0)||1;return ()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
export const hash=s=>{let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;};
export const range=(r,a,b)=>a+(b-a)*r();
export const pick=(r,list)=>list[Math.floor(r()*list.length)];
export const buf=(seconds,sr=SR)=>new Float32Array(Math.max(1,Math.round(seconds*sr)));
export const db=x=>20*Math.log10(Math.max(1e-12,x));
export const fromDb=d=>10**(d/20);

export function white(n,r){const o=new Float32Array(n);for(let i=0;i<n;i++)o[i]=r()*2-1;return o;}
/** Paul Kellet's refined pink filter. */
export function pink(n,r){const o=new Float32Array(n);let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;for(let i=0;i<n;i++){const w=r()*2-1;b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;o[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;}return o;}
export function brown(n,r){const o=new Float32Array(n);let l=0;for(let i=0;i<n;i++){l=(l+.02*(r()*2-1))/1.02;o[i]=l*3.5;}return o;}

/** RBJ cookbook biquad, applied in place. type: lp, hp, bp, peak, lowshelf, highshelf. f may be a number or a function(i). */
export function biquad(x,type,f,q=.707,gainDb=0,sr=SR){
 let x1=0,x2=0,y1=0,y2=0,b0,b1,b2,a1,a2,lastF=-1;const dyn=typeof f==='function';
 const coef=fc=>{const w=2*Math.PI*Math.min(fc,sr*.49)/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*q),A=10**(gainDb/40);let B0,B1,B2,A0,A1,A2;
  if(type==='lp'){B0=(1-c)/2;B1=1-c;B2=(1-c)/2;A0=1+al;A1=-2*c;A2=1-al;}
  else if(type==='hp'){B0=(1+c)/2;B1=-(1+c);B2=(1+c)/2;A0=1+al;A1=-2*c;A2=1-al;}
  else if(type==='bp'){B0=al;B1=0;B2=-al;A0=1+al;A1=-2*c;A2=1-al;}
  else if(type==='peak'){B0=1+al*A;B1=-2*c;B2=1-al*A;A0=1+al/A;A1=-2*c;A2=1-al/A;}
  else if(type==='lowshelf'){const sq=2*Math.sqrt(A)*al;B0=A*((A+1)-(A-1)*c+sq);B1=2*A*((A-1)-(A+1)*c);B2=A*((A+1)-(A-1)*c-sq);A0=(A+1)+(A-1)*c+sq;A1=-2*((A-1)+(A+1)*c);A2=(A+1)+(A-1)*c-sq;}
  else {const sq=2*Math.sqrt(A)*al;B0=A*((A+1)+(A-1)*c+sq);B1=-2*A*((A-1)+(A+1)*c);B2=A*((A+1)+(A-1)*c-sq);A0=(A+1)-(A-1)*c+sq;A1=2*((A-1)-(A+1)*c);A2=(A+1)-(A-1)*c-sq;}
  b0=B0/A0;b1=B1/A0;b2=B2/A0;a1=A1/A0;a2=A2/A0;};
 if(!dyn)coef(f);
 for(let i=0;i<x.length;i++){if(dyn&&(i&31)===0){const fc=f(i);if(Math.abs(fc-lastF)>.5){coef(fc);lastF=fc;}}const y=b0*x[i]+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x[i];y2=y1;y1=y;x[i]=y;}
 return x;
}
export const lp=(x,f,q)=>biquad(x,'lp',f,q),hp=(x,f,q)=>biquad(x,'hp',f,q),bp=(x,f,q)=>biquad(x,'bp',f,q);
/** Envelopes: attack (s), exponential decay rate (1/s), optional hold. */
export function env(x,attack,decay,hold=0,sr=SR){for(let i=0;i<x.length;i++){const t=i/sr;const a=attack>0?Math.min(1,t/attack):1;x[i]*=a*(t<attack+hold?1:Math.exp(-decay*(t-attack-hold)));}return x;}
export function fade(x,inS=.002,outS=.01,sr=SR){const a=Math.round(inS*sr),b=Math.round(outS*sr),n=x.length;for(let i=0;i<a&&i<n;i++)x[i]*=i/a;for(let i=0;i<b&&i<n;i++)x[n-1-i]*=i/b;return x;}
export function add(dst,src,at=0,gain=1){const o=Math.round(at);for(let i=0;i<src.length;i++){const j=i+o;if(j>=0&&j<dst.length)dst[j]+=src[i]*gain;}return dst;}
export function scale(x,g){for(let i=0;i<x.length;i++)x[i]*=g;return x;}
export function peak(x){let p=0;for(const v of x)p=Math.max(p,Math.abs(v));return p;}
export function rms(x,a=0,b=x.length){let s=0;for(let i=a;i<b;i++)s+=x[i]*x[i];return Math.sqrt(s/Math.max(1,b-a));}
export function normalize(x,peakDb){const p=peak(x);return p>0?scale(x,fromDb(peakDb)/p):x;}
/** Gentle tanh saturation for density without hard clipping. */
export function soft(x,drive=1.5){const k=Math.tanh(drive);for(let i=0;i<x.length;i++)x[i]=Math.tanh(x[i]*drive)/k;return x;}
export function dcBlock(x){let px=0,py=0;for(let i=0;i<x.length;i++){const y=x[i]-px+.9995*py;px=x[i];py=y;x[i]=y;}return x;}

/** Modal synthesis: decaying partials {f, d (1/s), a}. Excited by a short strike. */
export function modal(seconds,modes,r,{strike=.0015,jitter=0}={},sr=SR){
 const o=buf(seconds,sr);
 for(const m of modes){const f=m.f*(1+(r()*2-1)*jitter),ph=r()*Math.PI*2,w=2*Math.PI*f/sr;if(f>=sr*.48)continue;let decay=Math.exp(-m.d/sr),amp=m.a;
  for(let i=0;i<o.length;i++){o[i]+=amp*Math.sin(ph+w*i);amp*=decay;if(amp<1e-5)break;}}
 // strike transient: filtered click
 const n=Math.round(strike*sr),c=white(n,r);for(let i=0;i<n;i++)o[i]+=c[i]*(1-i/n)*.6;
 return o;
}
/** Minnaert-style bubble: rising-pitch damped sine (water drops, bubbles, splashes). */
export function bubble(seconds,f0,rise,decay,sr=SR){const o=buf(seconds,sr);let ph=0;for(let i=0;i<o.length;i++){const t=i/sr,f=f0*(1+rise*t);ph+=2*Math.PI*f/sr;o[i]=Math.sin(ph)*Math.exp(-decay*t)*Math.min(1,t/.0008);}return o;}
/** Noise grain: band-limited burst. */
export function grain(seconds,r,{lo=200,hi=8000,attack=.001,decay=60,color='white'}={},sr=SR){let g=color==='pink'?pink(Math.round(seconds*sr),r):white(Math.round(seconds*sr),r);if(hi<sr/2.1)lp(g,hi,.8);if(lo>20)hp(g,lo,.8);return env(g,attack,decay);}
/** Scatter `count` grains over `span` seconds following a density curve. */
export function scatter(dst,r,count,startS,spanS,make,{curve=t=>1,gain=[.5,1]}={},sr=SR){for(let k=0;k<count;k++){let t;do{t=r();}while(r()>curve(t));const g=make(k);add(dst,g,(startS+t*spanS)*sr,range(r,gain[0],gain[1]));}return dst;}
/** Slow random modulation curve (smooth), values in [0,1], periodic over n when `loop`. */
export function lfo(n,r,points=8,loop=false){const pts=Array.from({length:points+1},()=>r());if(loop)pts[points]=pts[0];return i=>{const x=i/n*points,k=Math.min(points-1,Math.floor(x)),f=x-k,s=f*f*(3-2*f);return pts[k]*(1-s)+pts[k+1]*s;};}
/** Seamless loop: render n + overlap samples, crossfade the tail onto the head (equal power). */
export function seamless(render,seconds,overlapS=.6,sr=SR){const n=Math.round(seconds*sr),ov=Math.round(overlapS*sr),x=render(n+ov);const out=x.slice(0,n);for(let i=0;i<ov;i++){const t=i/ov,a=Math.sin(t*Math.PI/2),b=Math.cos(t*Math.PI/2);out[i]=x[i]*a+x[n+i]*b;}return out;}
/** Resample by linear interpolation (used to derive pitch-distinct but structurally new material). */
export function resample(x,ratio){const n=Math.floor(x.length/ratio),o=new Float32Array(n);for(let i=0;i<n;i++){const p=i*ratio,k=Math.floor(p),f=p-k;o[i]=(x[k]??0)*(1-f)+(x[k+1]??0)*f;}return o;}
/** Simple Schroeder-style short room (for cave/indoor tails), deterministic. */
export function room(x,mix=.2,size=.6,sr=SR){const dl=[1557,1617,1491,1422].map(d=>Math.round(d*size*sr/44100)),fb=.72,out=new Float32Array(x.length);
 for(const d of dl){const line=new Float32Array(d);let k=0,lpz=0;for(let i=0;i<x.length;i++){const y=line[k];lpz=y*.6+lpz*.4;line[k]=x[i]+lpz*fb;k=(k+1)%d;out[i]+=y*.25;}}
 for(let i=0;i<x.length;i++)x[i]=x[i]*(1-mix)+out[i]*mix;return x;}
/** 16-bit PCM mono WAV with deterministic TPDF dither. */
export function wav16(x,sr=SR,seed=1){const r=rng(seed),n=x.length,b=new Uint8Array(44+n*2),v=new DataView(b.buffer),t=(o,s)=>[...s].forEach((c,i)=>b[o+i]=c.charCodeAt(0));
 t(0,'RIFF');v.setUint32(4,36+n*2,true);t(8,'WAVE');t(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);t(36,'data');v.setUint32(40,n*2,true);
 for(let i=0;i<n;i++){const d=(r()-r())/32768;v.setInt16(44+i*2,Math.max(-32768,Math.min(32767,Math.round((x[i]+d)*32767))),true);}return b;}
export function readWav(bytes){const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=12,sr=0,ch=0,bits=0,data=null;while(at+8<=bytes.length){const id=String.fromCharCode(...bytes.subarray(at,at+4)),size=v.getUint32(at+4,true);if(id==='fmt '){ch=v.getUint16(at+10,true);sr=v.getUint32(at+12,true);bits=v.getUint16(at+22,true);}if(id==='data')data={off:at+8,size};at+=8+size+(size%2);}
 if(!data||bits!==16)throw Error('WAV 16 bits attendu');const n=data.size/2/ch,x=new Float32Array(n);for(let i=0;i<n;i++)x[i]=v.getInt16(data.off+i*2*ch,true)/32768;return {sr,channels:ch,x};}
