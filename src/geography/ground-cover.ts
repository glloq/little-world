/** Pure ground cover derived from an already classified point. No world, renderer or LOD state.
 * The smallest colour mass is 192 m: even a 64 m horizon grid samples it without fine speckle.
 * Terrain and tufts share the same sRGB palette; lighting is left to their Lambert materials. */
import {habitatOf,type GeoSample,type Material} from './classify.ts';
import {valueNoise} from './noise.ts';
export const COVER_PALETTE={grass:0x89ad7b,'dry-grass':0xb2ad7a,'forest-floor':0x6e9363,mud:0x8a7c5f,dirt:0xa48a68};
export interface GroundCoverSample {
  type:'grass'|'dry-grass'|'forest-floor'|'wetland'|'bare';
  density:number;tallGrass:number;color:number;
}
const settings:Partial<Record<Material,{k:number;tall:number}>>={
  grass:{k:1,tall:.36},'dry-grass':{k:.9,tall:.55},'forest-floor':{k:.52,tall:.2},dirt:{k:.25,tall:.15},mud:{k:.5,tall:.6},
};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
function mix(a:number,b:number,t:number):number {
  const channel=(shift:number)=>Math.round(((a>>shift)&255)*(1-t)+((b>>shift)&255)*t);
  return (channel(16)<<16)|(channel(8)<<8)|channel(0);
}
export function groundCover(s:GeoSample,x:number,z:number,seed=77):GroundCoverSample {
  const m=settings[s.material];
  if(!m)return {type:'bare',density:0,tallGrass:0,color:0};
  const density=Math.min(1,habitatOf(s).grass*1.15)*m.k*(1-clamp((s.slope-.8)/.4));
  const base=COVER_PALETTE[s.material as keyof typeof COVER_PALETTE];
  // Exclusions keep their authored surface colour, even when a grass material was painted.
  if(density<=.02)return {type:'bare',density:0,tallGrass:0,color:base};
  const broad=valueNoise(seed^0x4c07,x/640,z/640),patch=valueNoise(seed^0x72a1,x/192,z/192);
  const dry=clamp((.55-s.moisture)*.85+.18+broad*.18+patch*.14);
  const forest=s.material==='forest-floor',wet=s.biome==='wetland';
  let color=mix(base,forest?0x90a978:wet?0x729873:0xb7ae7b,forest?clamp(.22+patch*.22):dry*.48);
  // Sparse soil transitions instead of a uniformly green sheet; forest clearings stay broad.
  color=mix(color,0x9b8968,clamp((1-density)*.10+patch*.07));
  const light=1+broad*.18+patch*.13;
  const channel=(shift:number)=>Math.min(255,Math.round(((color>>shift)&255)*light));
  color=(channel(16)<<16)|(channel(8)<<8)|channel(0);
  return {type:wet?'wetland':forest?'forest-floor':s.material==='dry-grass'?'dry-grass':'grass',density,
    tallGrass:wet?.7:s.biome==='scrub'?.6:m.tall,color};
}
