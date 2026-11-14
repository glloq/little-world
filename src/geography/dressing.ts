/** Geography Engine — natural dressing of generated worlds (G5, extended by World Production
 * V1 WP-2/WP-3). Trees, shrubs, ground flora and deadwood now carry a SPECIES from the Little
 * World asset library, chosen by ecological profiles (src/world-production/biotopes.ts) layered
 * on the classification; relief dressing adds cliff rocks and foot boulders, scree, beach
 * pebbles, driftwood, dune plants, river-bank shingle and reeds, basalt columns.
 * Pure and deterministic: seed + cell + classification → items. No ids, nothing stored in
 * the V3 sources (doc 18): authors steer it through biomes, masks, occupation, zones and
 * landscape presets. Habitat rules (habitatOf) exclude roads, buildings, fields,
 * reserved/exclusion zones, water and steep rock; LOD never changes this logic, only which
 * cells are drawn. Ecotones: the profile of a candidate is read at a seeded jittered point
 * within the profile's transition width, so neighbouring biotopes interpenetrate. */
import {classifyPoint,curvatureAt,slopeAt,habitatOf,type GeoContext,type GeoSample} from './classify.ts';
import {fbm,hash2} from './noise.ts';
import {BIOTOPES,pickSpecies,profileOf,speciesScale,treeMix,SPECIES,SPECIES_INDEX,BIOTOPE_IDS,type LandscapeInfluence} from '../world-production/biotopes.ts';
import type {BiotopeId} from '../world-production/asset-usage.ts';
/** Uniform 0..1 from the shared lattice hash (-1..1). */
const rnd=(seed:number,i:number,j:number)=>(hash2(seed,i,j)+1)/2;

/** Bump when the placement rules or the species table change (cache keys, reproducibility). */
export const DRESSING_VERSION=5;
export type DressingKind='pine'|'oak'|'shrub'|'plant'|'deadwood'|'rock'|'scree'|'pebble'|'basalt';
export const DRESSING_KINDS:DressingKind[]=['pine','oak','shrub','plant','deadwood','rock','scree','pebble','basalt'];
/** x, y, z, scale, rotation (rad), tint 0..1, species index (-1 = procedural) per item.
 * For species items `scale` is the uniform GLB scale; pine/oak = cone/other crown classes. */
export const ITEM_STRIDE=7;
export interface DressingCell {cx:number;cz:number;items:Record<DressingKind,Float32Array>;count:number;ms:number}
export const DRESSING_CELL_M=64;
/** Highest acceptance threshold of the rules below: vegetation (trees ≤ .85 × 1.35 × .42 +
 * shrubs ≤ .42 × .12 + ground ≤ .75 × .1 + deadwood ≤ .08 × .15 ≈ .62), cliff rocks .47,
 * pebbles/shingle .45. Keep it ≥ every threshold (tests compare with an unskipped generation). */
export const PLACEMENT_CEILING=.63;
const STEP=4;
/** Ecotone sampling lattice (m) and maximum interpenetration distance (m). */
const ECOTONE_GRID_M=16,ECOTONE_MAX_M=32;
const clamp01=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(a:number,b:number,x:number)=>{const t=clamp01((x-a)/(b-a));return t*t*(3-2*t);};

/** Forest structure: low-frequency clumps → groves and clearings inside forest biomes. */
export function forestClump(seed:number,x:number,z:number):number{return smooth(-.15,.35,fbm((seed^0x6f1c)>>>0,x/55,z/55,2));}
/** Open landscapes: sparse clusters (isolated trees and copses) rather than a uniform rain. */
export function copse(seed:number,x:number,z:number):number{return smooth(.18,.5,fbm((seed^0x2b9d)>>>0,x/70,z/70,2));}

export function generateDressingCell(ctx:GeoContext,seed:number,cx:number,cz:number,inside:(x:number,z:number)=>boolean,ceiling=PLACEMENT_CEILING):DressingCell{
  const t0=performance.now(),size=DRESSING_CELL_M,n=size/STEP,lists:Record<DressingKind,number[]>={pine:[],oak:[],shrub:[],plant:[],deadwood:[],rock:[],scree:[],pebble:[],basalt:[]};
  const cellSeed=(seed^Math.imul(cx,73856093)^Math.imul(cz,19349663))>>>0;
  const push=(kind:DressingKind,x:number,y:number,z:number,s:number,r:number,t:number,species=-1)=>lists[kind].push(x,y,z,s,r,t,species);
  const pushSpecies=(index:number,x:number,y:number,z:number,s:number,r:number,t:number)=>{
    const sp=SPECIES[index];const kind:DressingKind=sp.kind==='tree'?(sp.crown==='cone'?'pine':'oak'):sp.kind==='shrub'?'shrub':sp.kind==='deadwood'?'deadwood':'plant';
    push(kind,x,y,z,s,r,t,index);
  };
  // Ecotone lattice: profiles on a 16 m grid around the cell, computed lazily once per node
  // (jittered candidates read the nearest node: same result whatever the sector order).
  const ox=cx*size-ECOTONE_MAX_M,oz=cz*size-ECOTONE_MAX_M,nodes=(size+2*ECOTONE_MAX_M)/ECOTONE_GRID_M+1,memo=new Int8Array(nodes*nodes).fill(-1);
  const ecotone=(px:number,pz:number):BiotopeId|null=>{
    const a=Math.round((px-ox)/ECOTONE_GRID_M),b=Math.round((pz-oz)/ECOTONE_GRID_M);if(a<0||b<0||a>=nodes||b>=nodes)return null;
    const k=b*nodes+a;let v=memo[k];
    if(v===-1){const nx=ox+a*ECOTONE_GRID_M,nz=oz+b*ECOTONE_GRID_M,js=classifyPoint(ctx,nx,nz);v=js.underwater||js.occupation!=='none'?-2:BIOTOPE_IDS.indexOf(profileOf(js,ctx.riverDistance(nx,nz)));memo[k]=v;}
    return v<0?null:BIOTOPE_IDS[v];
  };
  /** Base height of a rock of radius k (its flattened icosahedron spans ±k): the lowest ground under
   * its footprint, slightly sunk, so that on a slope the downhill side never hangs in the air. */
  const seat=(x:number,z:number,k:number,h:number)=>{const d=.85*k;return Math.min(h,ctx.height(x+d,z),ctx.height(x-d,z),ctx.height(x,z+d),ctx.height(x,z-d))-.15;};
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
    const r0=rnd(cellSeed,i,j),r1=rnd(cellSeed^0x9e37,i,j),r2=rnd(cellSeed^0x51ed,i,j),r3=rnd(cellSeed^0x2c1b,i,j);
    const x=cx*size+(i+.15+.7*r0)*STEP,z=cz*size+(j+.15+.7*r1)*STEP;
    // No rule below places anything when r2 ≥ PLACEMENT_CEILING: skip the costly sampling.
    if(r2>=ceiling||!inside(x,z))continue;
    // Full gradient (4 neighbours): an east-only difference missed north/south-facing slopes.
    const h=ctx.height(x,z),slope=slopeAt(ctx.height,x,z);
    const s:GeoSample=classifyPoint(ctx,x,z,{height:h,slope});
    const r4=rnd(cellSeed^0x6a09,i,j),r5=rnd(cellSeed^0x3c6e,i,j);
    if(s.underwater){
      // Shallow still/marsh water: reed beds (never on the logical water level, only drawn).
      const w=ctx.water(x,z,h);
      if(s.occupation==='none'&&(s.biome==='wetland'||s.biome==='lake'||s.moisture>.85)&&w!==null&&w-h<.6&&r2<.12){const sp=SPECIES_INDEX['nature.reeds_patch'];pushSpecies(sp,x,h,z,speciesScale(sp,r4),r0*6.283,r1);}
      continue;
    }
    const hab=habitatOf(s);
    if(hab.trees+hab.shrubs+hab.flowers+hab.rocks+hab.grass===0)continue; // road, built, field, exclusion
    const influence:LandscapeInfluence|null=ctx.landscape?.(x,z)??null;
    // Ecotone: profile read at a jittered point (author masks still win at that point).
    let profileId=profileOf(s,ctx.riverDistance(x,z));
    const base=BIOTOPES[profileId],ja=r4*6.283,jd=Math.min(ECOTONE_MAX_M,base.transitionM*r5);
    if(jd>3){const neighbour=ecotone(x+Math.cos(ja)*jd,z+Math.sin(ja)*jd);if(neighbour)profileId=neighbour;}
    if(influence?.profile&&r5<influence.weight)profileId=influence.profile;
    const profile=BIOTOPES[profileId],density=influence?(1+(((influence.density??1)-1)*influence.weight)):1;
    const steep=1-smooth(profile.maxSlope*.7,profile.maxSlope*1.1,s.slope),reserved=s.occupation==='reserved'?0:1;
    // An authored region above density 1.2 closes the canopy (dense wood): the clump noise only
    // shapes groves and clearings below that floor.
    const structure=Math.max((1-profile.openness)*forestClump(seed,x,z)+profile.openness*copse(seed,x,z),influence?Math.min(1,Math.max(0,((influence.density??1)-1.2)*2.5)*influence.weight):0);
    const river=ctx.riverDistance(x,z),alt=s.height-ctx.seaLevel;
    // River banks: riparian trees closer to the water, shingle and reeds on the edge.
    const bank=river<26?1-smooth(6,26,river):0;
    if(river<3.5&&r2<.3){push('pebble',x,h,z,.16+.2*r3,r0*6.283,r1);continue;}
    if(river<7&&r2>=.3&&r2<.36){const sp=pickSpecies({'nature.reeds_patch':3,'nature.fern_small':1},r3);pushSpecies(sp,x,h,z,speciesScale(sp,r4),r0*6.283,r1);continue;}
    let mix=treeMix(profile,influence);
    if(bank>.3&&profile.trees>.02)mix={'nature.broadleaf_tall':4,'nature.hazel_thin':3,'nature.broadleaf_round':2,...(mix['nature.leafless_tree']?{'nature.leafless_tree':1}:{})};
    const treeShare=Object.keys(mix).length?profile.trees*Math.min(1.35,density*(1+bank*.6))*structure*steep*reserved*.42:0;
    if(r2<treeShare){const sp=pickSpecies(mix,r3);pushSpecies(sp,x,h,z,speciesScale(sp,rnd(cellSeed^0x77,i,j),profile.size),r3*6.283,rnd(cellSeed^0x31,i,j));continue;}
    let acc=treeShare;
    // Shrubs: more at forest edges and in open profiles, still grouped.
    const shrubShare=profile.shrubs*.12*steep*density*(.45+.55*Math.max(structure,profile.openness*.6));acc+=shrubShare;
    if(r2<acc){const sp=pickSpecies(profile.shrubMix,r3);pushSpecies(sp,x,h,z,speciesScale(sp,r4),r0*6.283,r1);continue;}
    // Ground flora (GLB patches complement the procedural small plants of ecology.ts).
    let groundMix=profile.groundMix,groundBoost=1;
    if(profileId==='sandy-coast'&&alt>1.5&&alt<6&&s.coast>8){groundBoost=4;groundMix={'nature.broadleaf_plant':3,'nature.reeds_patch':2};} // dune plants
    acc+=profile.ground*.1*groundBoost*Math.min(1,s.moisture+.4);
    if(r2<acc){const sp=pickSpecies(groundMix,r3);pushSpecies(sp,x,h,z,speciesScale(sp,r4),r0*6.283,r1);continue;}
    // Deadwood under cover; driftwood on the upper beach.
    const drift=profileId==='sandy-coast'&&alt<2.2&&alt>.3?.06:0;
    acc+=profile.deadwood*.15*(.3+structure)+drift;
    if(r2<acc){const sp=pickSpecies(drift?{'nature.log_fallen':1}:profile.deadwoodMix,r3);pushSpecies(sp,x,h-.05,z,speciesScale(sp,r4),r0*6.283,r1);continue;}
    // Geology dressing (relief): cliffs, foot boulders, basalt, scree, beach pebbles.
    if(s.geology==='rock'&&(s.slope>.45||s.cliff>.55&&s.coast<160)){if(r2<.22+.25*smooth(.45,1.2,s.slope)){const k=1.2+2.8*r3;push('rock',x,seat(x,z,k,h),z,k,r0*6.283,r1);}continue;}
    if(s.geology==='basalt'){
      // Basalt outcrops: small clusters of hexagonal columns of varied heights, rare.
      if(r2<.035){const n=3+Math.floor(r3*4);for(let q=0;q<n;q++){const a=q*2.4+r0*6.283,d=q?.85+.3*r1:0;push('basalt',x+Math.cos(a)*d,seat(x+Math.cos(a)*d,z+Math.sin(a)*d,.45,h)-.3,z+Math.sin(a)*d,.8+.5*rnd(cellSeed^q,i,j),a,rnd(cellSeed^(q+11),i,j));}}
      else if(r2<.11){const k=.8+1.6*r3;push('rock',x,seat(x,z,k,h),z,k,r0*6.283,.15*r1);}
      continue;}
    if(s.geology==='gravel'||s.geology==='rock'){if(r2<.35)push('scree',x,h,z,.25+.5*r3,r0*6.283,r1);continue;}
    if(s.material==='pebbles'){if(r2<.45)push('pebble',x,h,z,.18+.22*r3,r0*6.283,r1);continue;}
    // Cliff and slope feet: concave ground below steep rock collects fallen boulders.
    if((profileId==='mountain'||profileId==='rocky-coast'||profileId==='heath')&&s.slope>.18&&s.slope<.65&&r2<.1){
      if(curvatureAt(ctx.height,x,z)< -.012){const k=1+2.2*r3;push('rock',x,seat(x,z,k,h),z,k,r0*6.283,r1);continue;}
    }
    if(hab.rocks>0&&r2<profile.rocks*.06){const k=.6+1.4*r3;push('rock',x,seat(x,z,k,h),z,k,r0*6.283,r1);}
  }
  const items={} as Record<DressingKind,Float32Array>;let count=0;
  for(const kind of DRESSING_KINDS){items[kind]=new Float32Array(lists[kind]);count+=lists[kind].length/ITEM_STRIDE;}
  return {cx,cz,items,count,ms:performance.now()-t0};
}

/** Far forest canopy (G6, doc 17): a cheap stand-in for wooded cells beyond the far
 * silhouette ring. 3 × 3 jittered samples of the SAME classification per 64 m cell (no species
 * rules, no full generation): where the habitat holds trees, one large silhouette stands for a
 * clump. Pure and deterministic. Stride 6: x, y, z, width, height, conifer (1) or broadleaf (0). */
export const CANOPY_STRIDE=6;
const CANOPY_GRID=3;
const coneShare=new Map<BiotopeId,number>();
function conifers(id:BiotopeId){let v=coneShare.get(id);if(v===undefined){const mix=BIOTOPES[id].treeMix;let a=0,t=0;for(const [sid,w]of Object.entries(mix)){t+=w;if(SPECIES[SPECIES_INDEX[sid]]?.crown==='cone')a+=w;}v=t?a/t:0;coneShare.set(id,v);}return v;}
export function generateCanopyCell(ctx:GeoContext,seed:number,cx:number,cz:number,inside:(x:number,z:number)=>boolean):Float32Array{
  const out:number[]=[],step=DRESSING_CELL_M/CANOPY_GRID,s=(seed^0x7c3a91^Math.imul(cx,2654435761)^Math.imul(cz,40503))>>>0;
  for(let j=0;j<CANOPY_GRID;j++)for(let i=0;i<CANOPY_GRID;i++){
    const r0=rnd(s,i,j),r1=rnd(s^0x1f,i,j),r2=rnd(s^0x2e,i,j);
    const x=cx*DRESSING_CELL_M+(i+.2+.6*r0)*step,z=cz*DRESSING_CELL_M+(j+.2+.6*r1)*step;if(!inside(x,z))continue;
    const p=classifyPoint(ctx,x,z);if(p.underwater||p.occupation!=='none')continue;
    const hab=habitatOf(p);if(hab.trees<.2||r2>hab.trees*1.1)continue;
    const profile=profileOf(p,ctx.riverDistance(x,z)),k=BIOTOPES[profile].size??1,cone=rnd(s^0x3d,i,j)<conifers(profile)?1:0;
    out.push(x,p.height,z,(cone?4.2:6.2)*k,(cone?13:10)*k,cone);
  }
  return new Float32Array(out);
}
