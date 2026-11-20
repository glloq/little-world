/** Game palette of surface materials (vertex colours of the low-poly terrain and horizon).
 * Distinct from the 2D diagnostic palettes of layers.ts. Tuned for the existing light style. */
import type {Material,GeoSample} from './classify.ts';
import {valueNoise} from './noise.ts';
import {depthZone,SEABED_ZONE_COLORS} from './depth-zones.ts';
import {setLinearHex} from '../render/linear-color.ts';
import {groundCover,COVER_PALETTE} from './ground-cover.ts';
export const MATERIAL_COLORS:Record<Material,number>={
  ...COVER_PALETTE,sand:0xd8cba0,pebbles:0xb3ae9f,
  rock:0x8f8f86,gravel:0xa39f8f,basalt:0x5f5b58,ash:0x8b837b,snow:0xe7f1f8,ice:0xb9ddea,
};
export const SEABED_COLOR=0x9fb7a8;
/** Colours as converted by the output's setHex (colour management), cached per material. */
const LINEAR:Partial<Record<Material,[number,number,number]>>={};
/** Final vertex colour: material, gentle altitude lightening, a tiny moisture tint and, for
 * mineral materials, cheap deterministic variation (wet sand band, rock strata, scree speckle).
 * `x`/`z` only seed the variation; no texture, no extra draw call. */
export function materialColor(s:GeoSample,seaLevel:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number},x=0,z=0,seed=77):void{
  if(s.height<seaLevel-.6){
    // Depth-aware seabed (doc 104 §3): sand → sediments → deep floor, rock on drop-offs; tiny variation only.
    const zone=depthZone(seaLevel-s.height,s.slope)??'shore',hex=SEABED_ZONE_COLORS[zone],k=.96+.08*valueNoise(seed^0x5eab,x*.08,z*.08);
    out.setHex(hex);out.r*=k;out.g*=k;out.b*=k;return;
  }
  const cover=groundCover(s,x,z,seed);
  if(cover.type!=='bare')setLinearHex(out,cover.color);
  else {
  const lin=LINEAR[s.material];if(lin){out.r=lin[0];out.g=lin[1];out.b=lin[2];}else{out.setHex(MATERIAL_COLORS[s.material]);LINEAR[s.material]=[out.r,out.g,out.b];}
  }
  const alt=s.height-seaLevel,light=Math.min(.12,Math.max(0,(alt-150)/2500)),wet=(s.moisture-.5)*.06;
  let k=1;
  switch(s.material){
    case 'snow':k=.985+.025*valueNoise(77,x*.18,z*.18);break;
    case 'ice':k=.97+.02*valueNoise(77,x*.12,z*.12);break;
    case 'sand':k=alt<.7?.86:1+.03*valueNoise(77,x*.7,z*.7);break;
    case 'rock':k=.9+.08*Math.sin(s.height*.9+valueNoise(77,x*.05,z*.05)*2)-.08*Math.min(1,Math.max(0,s.slope-.8));break;
    case 'basalt':k=.92+.1*valueNoise(77,x*.4,z*.4);break;
    case 'gravel':case 'pebbles':k=.93+.12*valueNoise(77,x*1.3,z*1.3);break;
    case 'ash':k=1.02+.06*valueNoise(77,x*.2,z*.2)-.05*Math.min(1,s.slope);break;
    default:k=cover.type==='bare'?1+.025*valueNoise(77,x*.15,z*.15):1;
  }
  out.r=Math.min(1,out.r*k*(1+light-wet));out.g=Math.min(1,out.g*k*(1+light));out.b=Math.min(1,out.b*k*(1+light+wet*.5));
}
