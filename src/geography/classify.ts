/** Geography Engine — pure classification of a world point.
 * Inputs are functions of the shared geographic source (height, water, generator field,
 * author masks and occupation); outputs are categorical ids. Authored corrections (masks,
 * then legacy biome strokes) always win over generated values for the same domain.
 * No rendering, no LOD, no load-order dependence. */
import {fbm} from './noise.ts';
import type {MaskLayerId} from './layers.ts';
import {categoryOf,MOISTURE_CODES} from './layers.ts';

export type Geology='soil'|'sand'|'rock'|'basalt'|'ash'|'gravel';
export type Biome='meadow'|'forest'|'wetland'|'mountain'|'volcanic'|'scrub'|'coast'|'river'|'lake'|'village';
export type Material='grass'|'dry-grass'|'forest-floor'|'dirt'|'sand'|'pebbles'|'rock'|'gravel'|'basalt'|'ash'|'mud';
export type Occupation='none'|'built'|'farm'|'road'|'reserved'|'exclusion';
export interface GeoContext {
  seed:number;seaLevel:number;
  height(x:number,z:number):number;
  /** Water surface at the point (rivers, lakes, sea) or null. */
  water(x:number,z:number,height:number):number|null;
  /** Distance to the nearest authored river (m), Infinity if none nearby. */
  riverDistance(x:number,z:number):number;
  /** coast distance, coastal steepness and volcanic influence of the generator, in one call. */
  site(x:number,z:number):{coast:number;cliff:number;volcanic:number};
  /** Author correction code for a mask layer at the point ('.'/undefined = none). */
  mask(layer:MaskLayerId,x:number,z:number):string|undefined;
  /** Legacy circular biome strokes (V2/V3 biomeEdits), last applicable wins. */
  biomeStroke(x:number,z:number):string|undefined;
  /** Vector occupation sources: zones, paths, building footprints. */
  occupancy(x:number,z:number):Occupation;
}
export interface GeoSample {height:number;slope:number;coast:number;cliff:number;volcanic:number;moisture:number;geology:Geology;biome:Biome;material:Material;occupation:Occupation;underwater:boolean}
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
/** Gradient magnitude (rise/run) from central differences at `step` metres. */
export function slopeAt(height:(x:number,z:number)=>number,x:number,z:number,step=2):number{
  const dx=(height(x+step,z)-height(x-step,z))/(2*step),dz=(height(x,z+step)-height(x,z-step))/(2*step);return Math.sqrt(dx*dx+dz*dz);
}
/** Laplacian-based curvature: positive on crests, negative in hollows (m⁻¹, scaled). */
export function curvatureAt(height:(x:number,z:number)=>number,x:number,z:number,step=8):number{
  const h=height(x,z);return (4*h-height(x+step,z)-height(x-step,z)-height(x,z+step)-height(x,z-step))/(step*step);
}
export function moistureAt(ctx:GeoContext,x:number,z:number,h:number,slope:number,coast:number,water:number|null):number{
  const code=ctx.mask('moisture',x,z);if(code&&code!=='.')return MOISTURE_CODES.indexOf(code)/9;
  if(water!==null&&water>h)return 1;
  const alt=h-ctx.seaLevel,river=ctx.riverDistance(x,z);
  let m=.48+.38*(1-smooth(0,45,river))+.18*(1-smooth(0,80,coast))*(1-smooth(0,6,alt))
    -.26*smooth(140,460,alt)-.28*smooth(.25,.9,slope)+.14*(1-smooth(0,.12,slope))*(1-smooth(15,90,alt))
    +.12*fbm((ctx.seed^0x3a7)>>>0,x/420,z/420,2);
  return clamp(m,0,1);
}
export function geologyAt(ctx:GeoContext,x:number,z:number,h:number,slope:number,coast:number,cliff:number,volcanic:number):Geology{
  const code=ctx.mask('geology',x,z);if(code&&code!=='.')return categoryOf('geology',code)!.id as Geology;
  const alt=h-ctx.seaLevel;
  if(alt<.6)return slope>.9?'rock':'sand';
  if(volcanic>.25)return volcanic>.6&&slope<.55&&alt>80?'ash':'basalt';
  if(slope>.95)return 'rock';
  if(coast<140&&cliff>.55&&slope>.45)return 'rock';
  if(coast<25+45*(1-cliff)&&alt<4.5&&cliff<.55)return 'sand';
  if(slope>.5&&alt>110)return 'gravel';
  return 'soil';
}
export function biomeAt(ctx:GeoContext,x:number,z:number,h:number,slope:number,moisture:number,geology:Geology,volcanic:number,water:number|null):Biome{
  const code=ctx.mask('biome',x,z);if(code&&code!=='.')return categoryOf('biome',code)!.id as Biome;
  const stroke=ctx.biomeStroke(x,z);if(stroke)return stroke as Biome;
  if(water!==null&&water>h+.15)return water>ctx.seaLevel+.05?'river':'coast';
  const alt=h-ctx.seaLevel;
  if(geology==='sand')return 'coast';
  if(volcanic>.4&&(geology==='basalt'||geology==='ash'))return 'volcanic';
  if(alt>280||geology==='rock'&&slope>.8)return 'mountain';
  if(moisture>.78&&slope<.15)return 'wetland';
  if(moisture<.24)return 'scrub';
  // Forest regions: low-frequency noise biased by moisture gives massifs and clearings.
  const forest=fbm((ctx.seed^0xf0e5)>>>0,x/320,z/320,3)+(moisture-.5)*1.1-smooth(180,320,alt)*.6-smooth(.6,1,slope)*.4;
  return forest>.12?'forest':'meadow';
}
export function materialAt(ctx:GeoContext,x:number,z:number,s:{geology:Geology;biome:Biome;moisture:number;occupation:Occupation;cliff:number;slope:number}):Material{
  const code=ctx.mask('material',x,z);if(code&&code!=='.')return categoryOf('material',code)!.id as Material;
  if(s.occupation==='road')return 'dirt';if(s.occupation==='built')return 'gravel';if(s.occupation==='farm')return 'dirt';
  switch(s.geology){
    case 'sand':return s.cliff>.35?'pebbles':'sand';
    case 'rock':return 'rock';case 'basalt':return 'basalt';case 'ash':return 'ash';case 'gravel':return 'gravel';
  }
  if(s.biome==='wetland')return s.moisture>.88?'mud':'grass';
  if(s.biome==='scrub')return 'dry-grass';
  if(s.biome==='forest')return 'forest-floor';
  if(s.biome==='mountain')return s.slope>.6?'rock':'dry-grass';
  return 'grass';
}
export function occupationAt(ctx:GeoContext,x:number,z:number):Occupation{
  const code=ctx.mask('occupation',x,z);if(code&&code!=='.')return categoryOf('occupation',code)!.id as Occupation;
  return ctx.occupancy(x,z);
}
/** Complete sample; `height`/`slope` may be passed when the caller already computed them. */
export function classifyPoint(ctx:GeoContext,x:number,z:number,known?:{height?:number;slope?:number}):GeoSample{
  const height=known?.height??ctx.height(x,z),slope=known?.slope??slopeAt(ctx.height,x,z),{coast,cliff,volcanic}=ctx.site(x,z);
  const water=ctx.water(x,z,height),underwater=water!==null&&water>height;
  const moisture=moistureAt(ctx,x,z,height,slope,coast,water),geology=geologyAt(ctx,x,z,height,slope,coast,cliff,volcanic);
  const biome=biomeAt(ctx,x,z,height,slope,moisture,geology,volcanic,water),occupation=occupationAt(ctx,x,z);
  const material=materialAt(ctx,x,z,{geology,biome,moisture,occupation,cliff,slope});
  return {height,slope,coast,cliff,volcanic,moisture,geology,biome,material,occupation,underwater};
}
/** Vegetation habitat: what may grow at a classified point (never on roads, buildings,
 * fields, exclusions, steep rock or under water). Density 0..1. */
export interface Habitat {trees:number;shrubs:number;flowers:number;grass:number;rocks:number;reeds:number}
export function habitatOf(s:GeoSample):Habitat{
  const none:Habitat={trees:0,shrubs:0,flowers:0,grass:0,rocks:0,reeds:0};
  if(s.underwater)return {...none,reeds:s.biome==='wetland'||s.biome==='lake'?.6:0};
  if(s.occupation==='road'||s.occupation==='built'||s.occupation==='farm'||s.occupation==='exclusion')return none;
  const reserved=s.occupation==='reserved'?0:1,steep=1-smooth(.7,1.1,s.slope);
  switch(s.biome){
    case 'forest':return {trees:.85*steep*reserved,shrubs:.5*steep,flowers:.1,grass:.25,rocks:.08,reeds:0};
    case 'meadow':return {trees:.04*reserved,shrubs:.12,flowers:.45*s.moisture+.1,grass:.8,rocks:.04,reeds:0};
    case 'wetland':return {trees:.05*reserved,shrubs:.2,flowers:.1,grass:.4,rocks:0,reeds:.8};
    case 'scrub':return {trees:.02*reserved,shrubs:.35,flowers:.05,grass:.3,rocks:.15,reeds:0};
    case 'mountain':return {trees:.03*reserved*steep,shrubs:.08*steep,flowers:.03,grass:.15*steep,rocks:.5,reeds:0};
    case 'volcanic':return {trees:0,shrubs:.03,flowers:0,grass:.04,rocks:.55,reeds:0};
    case 'coast':return {trees:0,shrubs:.04,flowers:0,grass:s.geology==='sand'?.05:.25,rocks:s.cliff>.35?.35:.05,reeds:0};
    default:return {...none,grass:.3};
  }
}
