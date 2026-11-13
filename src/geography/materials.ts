/** Game palette of surface materials (vertex colours of the low-poly terrain and horizon).
 * Distinct from the 2D diagnostic palettes of layers.ts. Tuned for the existing light style. */
import type {Material,GeoSample} from './classify.ts';
import {valueNoise} from './noise.ts';
export const MATERIAL_COLORS:Record<Material,number>={
  grass:0x89ad7b,'dry-grass':0xb2ad7a,'forest-floor':0x6e9363,dirt:0xa48a68,sand:0xd8cba0,pebbles:0xb3ae9f,
  rock:0x8f8f86,gravel:0xa39f8f,basalt:0x5f5b58,ash:0x8b837b,mud:0x8a7c5f,
};
export const SEABED_COLOR=0x9fb7a8;
/** Final vertex colour: material, gentle altitude lightening, a tiny moisture tint and, for
 * mineral materials, cheap deterministic variation (wet sand band, rock strata, scree speckle).
 * `x`/`z` only seed the variation; no texture, no extra draw call. */
export function materialColor(s:GeoSample,seaLevel:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number},x=0,z=0):void{
  if(s.height<seaLevel-.6){out.setHex(SEABED_COLOR);return;}
  out.setHex(MATERIAL_COLORS[s.material]);
  const alt=s.height-seaLevel,light=Math.min(.12,Math.max(0,(alt-150)/2500)),wet=(s.moisture-.5)*.06;
  let k=1;
  switch(s.material){
    case 'sand':k=alt<.7?.86:1+.03*valueNoise(77,x*.7,z*.7);break;
    case 'rock':k=.9+.08*Math.sin(s.height*.9+valueNoise(77,x*.05,z*.05)*2)-.08*Math.min(1,Math.max(0,s.slope-.8));break;
    case 'basalt':k=.92+.1*valueNoise(77,x*.4,z*.4);break;
    case 'gravel':case 'pebbles':k=.93+.12*valueNoise(77,x*1.3,z*1.3);break;
    case 'ash':k=1.02+.06*valueNoise(77,x*.2,z*.2)-.05*Math.min(1,s.slope);break;
    default:k=1+.025*valueNoise(77,x*.15,z*.15);
  }
  out.r=Math.min(1,out.r*k*(1+light-wet));out.g=Math.min(1,out.g*k*(1+light));out.b=Math.min(1,out.b*k*(1+light+wet*.5));
}
