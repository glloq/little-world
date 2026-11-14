/** World Production V1 — ecological profiles (WP-2).
 * Ten configurable biotope profiles layered ON TOP of the Geography Engine classification:
 * the engine decides geology / biome / moisture / occupation (author masks first); a profile
 * only says what grows there, how densely, in which proportions, and how it fades into its
 * neighbours. Nothing here re-classifies terrain or stores per-plant data.
 * Pure, deterministic, Three.js-free (also runs in the geography worker). */
import type {GeoSample,Biome} from '../geography/classify.ts';
import {ASSET_USAGE,type BiotopeId} from './asset-usage.ts';

/** Ordered species table used by dressing items (index stored in the item; append only —
 * changing the order changes DRESSING_VERSION). */
export const SPECIES_IDS=['nature.broadleaf_round','nature.broadleaf_tall','nature.hazel_thin','nature.sapling_thin','nature.leafless_tree','nature.dead_tree_twisted','nature.palm_thin','nature.palm_curved','nature.fruit_apple','nature.fruit_pear','nature.fruit_plum','nature.fruit_cherry','nature.pine','nature.bush_small','nature.bush_asym','nature.bush_round','nature.bush_irregular','nature.shrub_flowering','nature.shrub_flower','nature.fern_small','nature.wildflowers_patch','nature.flowers_tall','nature.mushrooms_patch','nature.mushroom_tall','nature.moss_patch','nature.reeds_patch','nature.broadleaf_plant','nature.stump_simple','nature.stump_mossy','nature.log_fallen','nature.conifer_tall','nature.conifer_wide'] as const;
export type SpeciesId=typeof SPECIES_IDS[number];
/** Kind/crown/scale come from the asset usage table (single source). */
export const SPECIES=SPECIES_IDS.map(id=>{const u=ASSET_USAGE[id];const kind=u.role==='tree'?'tree':u.role==='shrub'?'shrub':u.role==='deadwood'?'deadwood':'plant';return {id,kind,crown:u.crown??'round',scale:u.scale};});
export const SPECIES_INDEX:Record<string,number>=Object.fromEntries(SPECIES.map((s,i)=>[s.id,i]));
type Mix=Partial<Record<SpeciesId,number>>;
/** Configurable ecological profile (doc 41 § 3). Densities are 0..1 acceptance shares of the
 * 4 m candidate lattice; `mix` weights are relative. */
export interface BiotopeProfile {
  id:BiotopeId;label:string;
  /** Preferred altitude band above sea level (m) and maximum slope (rise/run) for trees. */
  altitude:[number,number];maxSlope:number;
  geology:GeoSample['geology'][];moisture:[number,number];
  /** Distance bands (m): to the sea coast and to fresh water; Infinity = no constraint. */
  seaDistance:[number,number];freshWater:[number,number];
  trees:number;shrubs:number;ground:number;deadwood:number;rocks:number;
  treeMix:Mix;shrubMix:Mix;groundMix:Mix;deadwoodMix:Mix;
  /** Open spaces: 0 = continuous cover, 1 = many clearings/isolated trees. */
  openness:number;
  /** Tree size factor (×species scale) and tint variation. */
  size:number;
  /** Width (m) of the ecotone where neighbouring profiles interpenetrate. */
  transitionM:number;
  /** Biotopes it may fade into without abrupt borders (documentation + tests). */
  transitions:BiotopeId[];
  variants:string[];
}
const P=(p:BiotopeProfile)=>p;
export const BIOTOPES:Record<BiotopeId,BiotopeProfile>={
  'temperate-forest':P({id:'temperate-forest',label:'Forêt tempérée',altitude:[2,320],maxSlope:1.05,geology:['soil','gravel'],moisture:[.3,.85],seaDistance:[40,Infinity],freshWater:[0,Infinity],
    trees:.85,shrubs:.42,ground:.55,deadwood:.08,rocks:.06,openness:.25,size:1,transitionM:28,
    treeMix:{'nature.broadleaf_round':30,'nature.broadleaf_tall':22,'nature.hazel_thin':14,'nature.pine':5,'nature.conifer_tall':8,'nature.conifer_wide':6,'nature.sapling_thin':6,'nature.leafless_tree':2,'nature.dead_tree_twisted':1},
    shrubMix:{'nature.bush_small':4,'nature.bush_asym':3,'nature.shrub_flower':1},
    groundMix:{'nature.fern_small':40,'nature.moss_patch':18,'nature.broadleaf_plant':12,'nature.mushrooms_patch':8,'nature.mushroom_tall':3},
    deadwoodMix:{'nature.stump_simple':3,'nature.stump_mossy':3,'nature.log_fallen':4},
    transitions:['prairie','humid-valley','marsh','mountain','heath'],variants:['chênaie claire','sous-bois de fougères','lisière']}),
  prairie:P({id:'prairie',label:'Prairie',altitude:[1,260],maxSlope:.8,geology:['soil'],moisture:[.25,.75],seaDistance:[30,Infinity],freshWater:[0,Infinity],
    trees:.05,shrubs:.12,ground:.42,deadwood:.004,rocks:.03,openness:.9,size:1.05,transitionM:24,
    treeMix:{'nature.broadleaf_round':10,'nature.hazel_thin':4,'nature.fruit_cherry':2,'nature.sapling_thin':3},
    shrubMix:{'nature.bush_round':4,'nature.shrub_flowering':3,'nature.bush_small':2},
    groundMix:{'nature.wildflowers_patch':60,'nature.flowers_tall':22,'nature.broadleaf_plant':6},
    deadwoodMix:{'nature.stump_simple':1},
    transitions:['temperate-forest','mountain','sandy-coast','humid-valley','heath'],variants:['prairie fleurie','pâture rase']}),
  'humid-valley':P({id:'humid-valley',label:'Vallée humide',altitude:[0,220],maxSlope:.7,geology:['soil','gravel'],moisture:[.66,1],seaDistance:[0,Infinity],freshWater:[0,120],
    trees:.4,shrubs:.3,ground:.6,deadwood:.05,rocks:.04,openness:.45,size:1.1,transitionM:30,
    treeMix:{'nature.broadleaf_tall':30,'nature.broadleaf_round':20,'nature.hazel_thin':20,'nature.sapling_thin':6,'nature.leafless_tree':2},
    shrubMix:{'nature.bush_small':3,'nature.shrub_flowering':2,'nature.bush_asym':1},
    groundMix:{'nature.fern_small':30,'nature.flowers_tall':14,'nature.wildflowers_patch':10,'nature.moss_patch':14,'nature.reeds_patch':6,'nature.broadleaf_plant':10},
    deadwoodMix:{'nature.log_fallen':3,'nature.stump_mossy':3},
    transitions:['temperate-forest','prairie','marsh'],variants:['ripisylve','fond de vallon']}),
  marsh:P({id:'marsh',label:'Marais',altitude:[-1,60],maxSlope:.25,geology:['soil','sand'],moisture:[.78,1],seaDistance:[0,Infinity],freshWater:[0,80],
    trees:.07,shrubs:.16,ground:.75,deadwood:.05,rocks:0,openness:.8,size:.9,transitionM:20,
    treeMix:{'nature.leafless_tree':6,'nature.broadleaf_tall':4,'nature.hazel_thin':2},
    shrubMix:{'nature.bush_small':3,'nature.bush_asym':2},
    groundMix:{'nature.reeds_patch':60,'nature.moss_patch':20,'nature.fern_small':8,'nature.mushrooms_patch':3},
    deadwoodMix:{'nature.stump_mossy':4,'nature.stump_simple':2,'nature.log_fallen':2},
    transitions:['humid-valley','temperate-forest','prairie'],variants:['roselière','tourbière']}),
  mountain:P({id:'mountain',label:'Montagne',altitude:[200,1400],maxSlope:1.1,geology:['rock','gravel','soil'],moisture:[0,.8],seaDistance:[60,Infinity],freshWater:[0,Infinity],
    trees:.08,shrubs:.1,ground:.1,deadwood:.02,rocks:.5,openness:.85,size:.85,transitionM:40,
    treeMix:{'nature.conifer_tall':34,'nature.conifer_wide':22,'nature.pine':12,'nature.leafless_tree':10,'nature.dead_tree_twisted':12,'nature.hazel_thin':5},
    shrubMix:{'nature.bush_irregular':4,'nature.bush_asym':3},
    groundMix:{'nature.moss_patch':8,'nature.fern_small':2,'nature.wildflowers_patch':2},
    deadwoodMix:{'nature.stump_simple':3,'nature.log_fallen':1},
    transitions:['prairie','temperate-forest','volcanic','heath'],variants:['alpage','pierrier']}),
  heath:P({id:'heath',label:'Lande',altitude:[5,500],maxSlope:.9,geology:['soil','gravel'],moisture:[.12,.3],seaDistance:[20,Infinity],freshWater:[0,Infinity],
    trees:.025,shrubs:.38,ground:.14,deadwood:.006,rocks:.14,openness:.95,size:.85,transitionM:26,
    treeMix:{'nature.conifer_wide':4,'nature.pine':2,'nature.dead_tree_twisted':3,'nature.hazel_thin':1},
    shrubMix:{'nature.bush_irregular':5,'nature.bush_asym':4,'nature.bush_small':2},
    groundMix:{'nature.wildflowers_patch':4,'nature.moss_patch':2},
    deadwoodMix:{'nature.stump_simple':1},
    transitions:['prairie','mountain','temperate-forest','dry-zone','rocky-coast'],variants:['lande à bruyères']}),
  'sandy-coast':P({id:'sandy-coast',label:'Littoral sableux',altitude:[-1,8],maxSlope:.5,geology:['sand'],moisture:[0,1],seaDistance:[0,90],freshWater:[0,Infinity],
    trees:0,shrubs:.035,ground:.08,deadwood:.012,rocks:.03,openness:1,size:.9,transitionM:14,
    treeMix:{'nature.palm_thin':5,'nature.palm_curved':4},
    shrubMix:{'nature.bush_round':3,'nature.bush_irregular':1},
    groundMix:{'nature.broadleaf_plant':5,'nature.reeds_patch':3},
    deadwoodMix:{'nature.log_fallen':1},
    transitions:['prairie','rocky-coast','marsh'],variants:['plage large','crique','dune']}),
  'rocky-coast':P({id:'rocky-coast',label:'Littoral rocheux',altitude:[-1,120],maxSlope:1.5,geology:['rock','gravel','sand'],moisture:[0,1],seaDistance:[0,160],freshWater:[0,Infinity],
    trees:.02,shrubs:.06,ground:.05,deadwood:.004,rocks:.35,openness:1,size:.8,transitionM:18,
    treeMix:{'nature.conifer_tall':4,'nature.pine':2,'nature.dead_tree_twisted':1},
    shrubMix:{'nature.bush_irregular':3,'nature.bush_asym':2},
    groundMix:{'nature.moss_patch':3,'nature.broadleaf_plant':1},
    deadwoodMix:{'nature.log_fallen':1},
    transitions:['sandy-coast','heath','mountain'],variants:['cap','pied de falaise']}),
  volcanic:P({id:'volcanic',label:'Volcanique',altitude:[0,1400],maxSlope:1.2,geology:['basalt','ash'],moisture:[0,.6],seaDistance:[0,Infinity],freshWater:[0,Infinity],
    trees:.012,shrubs:.03,ground:.02,deadwood:.004,rocks:.55,openness:1,size:.8,transitionM:36,
    treeMix:{'nature.dead_tree_twisted':4,'nature.leafless_tree':3},
    shrubMix:{'nature.bush_irregular':3},
    groundMix:{'nature.moss_patch':2},
    deadwoodMix:{'nature.stump_simple':1},
    transitions:['mountain','heath','dry-zone'],variants:['coulée ancienne','champ de cendres']}),
  'dry-zone':P({id:'dry-zone',label:'Zone sèche',altitude:[0,400],maxSlope:.9,geology:['soil','gravel','sand','ash'],moisture:[0,.14],seaDistance:[0,Infinity],freshWater:[150,Infinity],
    trees:.008,shrubs:.12,ground:.03,deadwood:.006,rocks:.18,openness:1,size:.75,transitionM:30,
    treeMix:{'nature.dead_tree_twisted':3},
    shrubMix:{'nature.bush_irregular':4,'nature.bush_asym':1},
    groundMix:{'nature.broadleaf_plant':1},
    deadwoodMix:{'nature.stump_simple':1,'nature.log_fallen':1},
    transitions:['heath','volcanic','prairie'],variants:['désert localisé','garrigue']}),
};
export const BIOTOPE_IDS=Object.keys(BIOTOPES) as BiotopeId[];
/** Landscape influence at a point (from `libraries.landscapes`): weight 0..1 with a soft edge. */
export interface LandscapeInfluence {weight:number;profile?:BiotopeId;density?:number;palms?:boolean;orchard?:boolean;ruins?:boolean}
/** Profile of a classified point. The categorical classification stays the authority (author
 * masks included); continuous drivers only split categories into finer profiles. */
export function profileOf(s:GeoSample,river:number):BiotopeId{
  const alt=s.height;
  switch(s.biome as Biome){
    case 'forest':return s.moisture>.72&&s.slope<.35?'humid-valley':'temperate-forest';
    case 'meadow':return s.moisture>.7&&s.slope<.3&&river<90?'humid-valley':'prairie';
    case 'village':return 'prairie';
    case 'wetland':return 'marsh';
    case 'mountain':return 'mountain';
    case 'volcanic':return 'volcanic';
    case 'scrub':return s.moisture<.14&&river>150?'dry-zone':'heath';
    case 'coast':return s.geology==='sand'&&s.cliff<.55?'sandy-coast':'rocky-coast';
    default:void alt;return 'prairie';
  }
}
/** Deterministic weighted pick: `r` uniform 0..1. Returns -1 for an empty mix. */
export function pickSpecies(mix:Mix,r:number):number{
  let total=0;for(const w of Object.values(mix))total+=w!;if(total<=0)return -1;
  let t=r*total;for(const [id,w]of Object.entries(mix)){t-=w!;if(t<0)return SPECIES_INDEX[id];}
  return SPECIES_INDEX[Object.keys(mix).at(-1)!];
}
/** Species scale for a random 0..1 (× profile size factor for trees). */
export function speciesScale(index:number,r:number,size=1):number{const [a,b]=SPECIES[index].scale;return (a+(b-a)*r)*size;}
export function speciesKind(index:number){return SPECIES[index].kind;}
/** Trees mix of a profile, with landscape options (palms only where an author allowed them,
 * orchards add fruit trees). Without palms, a palm-only mix becomes empty. */
export function treeMix(profile:BiotopeProfile,influence:LandscapeInfluence|null):Mix{
  let mix:Mix={...profile.treeMix};
  if(!influence?.palms||influence.weight<.5){delete mix['nature.palm_thin'];delete mix['nature.palm_curved'];}
  if(influence?.orchard&&influence.weight>.4)mix={'nature.fruit_apple':5,'nature.fruit_pear':3,'nature.fruit_plum':3,'nature.fruit_cherry':2};
  if(influence?.ruins&&influence.weight>.4)mix={...mix,'nature.dead_tree_twisted':(mix['nature.dead_tree_twisted']??0)+3};
  return mix;
}
/** Rectangular landscape footprint (oriented), carried from `libraries.landscapes` into the
 * geography sources. `edgeM` = soft border where the influence fades (no hard frontier). */
export interface LandscapeRegion {id:string;x:number;z:number;width:number;length:number;rotation:number;edgeM:number;profile?:BiotopeId;density?:number;palms?:boolean;orchard?:boolean;ruins?:boolean}
/** Strongest landscape influence at a point (pure). */
export function landscapeInfluenceAt(regions:readonly LandscapeRegion[],x:number,z:number):LandscapeInfluence|null{
  let best:LandscapeInfluence|null=null;
  for(const r of regions){
    const c=Math.cos(r.rotation),s=Math.sin(r.rotation),dx=x-r.x,dz=z-r.z,u=Math.abs(dx*c+dz*s),v=Math.abs(-dx*s+dz*c);
    const ox=u-r.width/2,oz=v-r.length/2;if(ox>0||oz>0)continue;
    const inside=Math.min(-ox,-oz),t=Math.min(1,inside/Math.max(1,r.edgeM)),weight=t*t*(3-2*t);
    if(!best||weight>best.weight)best={weight,...(r.profile?{profile:r.profile}:{}),...(r.density!==undefined?{density:r.density}:{}),...(r.palms?{palms:true}:{}),...(r.orchard?{orchard:true}:{}),...(r.ruins?{ruins:true}:{})};
  }
  return best;
}
