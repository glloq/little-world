/** Surf swell shapes (pure, no Three.js). One analytic family shared by physics and shader:
 *
 *   f(p)  = sin p + a·sin 2p − c·cos 2p           a = skew + shoal·b (b: static breaking 0..1)
 *   m     = 1 + setVariation·sin Ps + peakVariation·sin Pc
 *   h     = seaLevel + amplitude · envelope · m · f
 *
 * - `skew` steepens the forward face and keeps the back face long (historical a = 0.22);
 * - `sharpness` (c) raises crests and flattens troughs (2nd-order Stokes-like, zero mean);
 * - `shoal` progressively steepens the face as the wave reaches its breaking depth;
 * - `setVariation` modulates successive waves in sets travelling with the swell (Ps moves with
 *   the same displacement over `setLength` wavelengths: no per-frame randomness);
 * - `peakVariation` gives static peaks along the crest line (Pc over `peakSpacing` wavelengths).
 * Every term is bounded, continuous, deterministic and differentiable. `classic` is exactly V1. */
export const SURF_WAVE_STYLES=['classic','gentle','long','fast','powerful','tubular','shorebreak'] as const;
export type SurfWaveStyle=typeof SURF_WAVE_STYLES[number];
export interface SurfWaveShape {
 skew:number;sharpness:number;shoal:number;
 setVariation:number;setLength:number;peakVariation:number;peakSpacing:number;
 /** Lateral breaking (peel) of the tube, metres and m/s; null = historical full-width lip.
  * A long rising shoulder fills the crest between sections: the whole line keeps breaking. */
 peel:null|{speed:number;period:number;shoulder:number;open:number;collapse:number};
}
export const SURF_WAVE_SHAPES:Readonly<Record<SurfWaveStyle,Readonly<SurfWaveShape>>>={
 classic:{skew:.22,sharpness:0,shoal:0,setVariation:0,setLength:4,peakVariation:0,peakSpacing:3,peel:null},
 /** Houle douce : rondeur, faibles séries. */
 gentle:{skew:.14,sharpness:.06,shoal:.06,setVariation:.12,setLength:4.6,peakVariation:.07,peakSpacing:3.4,peel:null},
 /** Vagues longues : crêtes régulières, séries marquées. */
 long:{skew:.18,sharpness:.1,shoal:.08,setVariation:.18,setLength:5.3,peakVariation:.05,peakSpacing:4.3,peel:null},
 /** Vagues rapides : face raide, pics rapprochés. */
 fast:{skew:.26,sharpness:.1,shoal:.1,setVariation:.14,setLength:3.7,peakVariation:.11,peakSpacing:2.4,
  peel:{speed:5.2,period:78,shoulder:46,open:16,collapse:10}},
 /** Vagues puissantes : crêtes hautes, grosses séries. */
 powerful:{skew:.26,sharpness:.16,shoal:.1,setVariation:.22,setLength:4.1,peakVariation:.09,peakSpacing:2.9,
  peel:{speed:4.4,period:84,shoulder:48,open:18,collapse:12}},
 /** Vagues tubulaires : face très creusée près du déferlement. */
 tubular:{skew:.24,sharpness:.12,shoal:.16,setVariation:.18,setLength:3.3,peakVariation:.12,peakSpacing:2.1,
  peel:{speed:4,period:72,shoulder:36,open:20,collapse:10}},
 /** Shorebreak : courtes, cassantes, irrégulières le long de la plage. */
 shorebreak:{skew:.26,sharpness:.14,shoal:.14,setVariation:.1,setLength:2.9,peakVariation:.16,peakSpacing:1.7,
  peel:{speed:6.5,period:60,shoulder:36,open:10,collapse:8}},
};
export const isSurfWaveStyle=(v:unknown):v is SurfWaveStyle=>
 typeof v==='string'&&(SURF_WAVE_STYLES as readonly string[]).includes(v);
export function surfWaveShape(style:SurfWaveStyle|undefined):Readonly<SurfWaveShape>{
 return SURF_WAVE_SHAPES[style??'classic'];
}
/** Profile value and phase derivative for an effective skew a. */
export const shapeValue=(p:number,a:number,c:number)=>Math.sin(p)+a*Math.sin(2*p)-c*Math.cos(2*p);
export const shapeDerivative=(p:number,a:number,c:number)=>Math.cos(p)+2*a*Math.cos(2*p)+2*c*Math.sin(2*p);
/** Crest phase (maximum of f), Newton refined from a dense scan: unique per (a,c). */
export function crestPhase(a:number,c:number):number{
 let best=0,value=-Infinity;
 for(let i=0;i<256;i++){const p=i/256*2*Math.PI,v=shapeValue(p,a,c);if(v>value){value=v;best=p;}}
 for(let i=0;i<8;i++){
  const d1=shapeDerivative(best,a,c),d2=-Math.sin(best)-4*a*Math.sin(2*best)+4*c*Math.cos(2*best);
  if(Math.abs(d2)<1e-12)break;best-=d1/d2;
 }
 return ((best%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
}
/** Range of f for the normalised `crest` (classic keeps the historical ±1.12 / 2.24). */
export function shapeRange(a:number,c:number):{offset:number;range:number}{
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<512;i++){const v=shapeValue(i/512*2*Math.PI,a,c);lo=Math.min(lo,v);hi=Math.max(hi,v);}
 return {offset:-lo,range:hi-lo};
}
/** Upper bound of the wave-surface slope |∇h| for a zone: used by validation tests. */
export function maxSurfSlope(shape:SurfWaveShape,amplitude:number,wavelength:number):number{
 const k=2*Math.PI/wavelength,a=shape.skew+shape.shoal;
 let df=0;for(let i=0;i<512;i++)df=Math.max(df,Math.abs(shapeDerivative(i/512*2*Math.PI,a,shape.sharpness)));
 let f=0;for(let i=0;i<512;i++)f=Math.max(f,Math.abs(shapeValue(i/512*2*Math.PI,a,shape.sharpness)));
 const m=1+shape.setVariation+shape.peakVariation;
 const dm=shape.setVariation*k/shape.setLength+shape.peakVariation*k/shape.peakSpacing;
 return amplitude*(m*df*k+dm*f);
}
