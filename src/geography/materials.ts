/** Game palette of surface materials (vertex colours of the low-poly terrain and horizon).
 * Distinct from the 2D diagnostic palettes of layers.ts. Tuned for the existing light style. */
import type {Material,GeoSample} from './classify.ts';
export const MATERIAL_COLORS:Record<Material,number>={
  grass:0x89ad7b,'dry-grass':0xb2ad7a,'forest-floor':0x6e9363,dirt:0xa48a68,sand:0xd8cba0,pebbles:0xb3ae9f,
  rock:0x8f8f86,gravel:0xa39f8f,basalt:0x5f5b58,ash:0x8b837b,mud:0x8a7c5f,
};
export const SEABED_COLOR=0x9fb7a8;
/** Final vertex colour: material, gentle altitude lightening and a tiny moisture tint. */
export function materialColor(s:GeoSample,seaLevel:number,out:{setHex(hex:number):unknown;r:number;g:number;b:number}):void{
  if(s.height<seaLevel-.6){out.setHex(SEABED_COLOR);return;}
  out.setHex(MATERIAL_COLORS[s.material]);
  const alt=s.height-seaLevel,light=Math.min(.12,Math.max(0,(alt-150)/2500)),wet=(s.moisture-.5)*.06;
  out.r=Math.min(1,out.r*(1+light-wet));out.g=Math.min(1,out.g*(1+light));out.b=Math.min(1,out.b*(1+light+wet*.5));
}
