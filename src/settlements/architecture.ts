/**
 * Architecture styles (doc 104 §C6): a theme-level catalog that picks the
 * house looks, path surfaces and pole roles of a settlement. Pure data so the
 * generator, the Studio and the renderer share it. House looks only change
 * visuals: dimensions, colliders and doorways stay those of the hollow
 * habitat (HOUSE), so gameplay and physics never depend on the theme.
 */
import type {HabitatStyle} from './habitat.ts';

export interface HouseLook {
 label:string;wall:number;roof:number;trim:number;
 /** pyramid = historical 4-sided cap; steep = alpine; thatch = low wide 8-sided; flat = terrace roof; gable = long ridge. */
 roofShape:'pyramid'|'steep'|'thatch'|'flat'|'gable';
}
/** Visual look per habitat style (historical three first: their colours are unchanged). */
export const HOUSE_LOOKS:Record<HabitatStyle,HouseLook>={
 timber:{label:'Colombages',wall:0xb58b60,roof:0xb46e57,trim:0x5f4129,roofShape:'pyramid'},
 stone:{label:'Pierre',wall:0x999c98,roof:0xb46e57,trim:0x5f4129,roofShape:'pyramid'},
 white:{label:'Chaux',wall:0xe7dcc1,roof:0xb46e57,trim:0x5f4129,roofShape:'pyramid'},
 chalet:{label:'Chalet',wall:0x7a5332,roof:0x4a4a4f,trim:0xe8e2d4,roofShape:'steep'},
 fisher:{label:'Maison de pêcheur',wall:0x5f8fb0,roof:0x9b5a3c,trim:0xf0ece2,roofShape:'gable'},
 tropical:{label:'Case tropicale',wall:0xd8c08a,roof:0xb08a4a,trim:0x6b4a2a,roofShape:'thatch'},
 adobe:{label:'Adobe',wall:0xd09a64,roof:0xc58a58,trim:0x8a5a35,roofShape:'flat'},
 medieval:{label:'Bourg médiéval',wall:0xcfc3a6,roof:0x7d2f24,trim:0x3d2b1f,roofShape:'steep'},
};

export const ARCHITECTURE_STYLE_IDS=['temperate','alpine','fishing','tropical','arid','medieval'] as const;
export type ArchitectureStyleId=typeof ARCHITECTURE_STYLE_IDS[number];
export interface ArchitectureStyle {
 label:string;
 /** House looks drawn (deterministically per slot) for `style: 'auto'`. */
 houses:readonly HabitatStyle[];
 /** Street surface by wealth 0/1/2. */
 paths:readonly ['dirt'|'stone'|'wood','dirt'|'stone'|'wood','dirt'|'stone'|'wood'];
 /** Settlement layout pattern preferred for each pole role. */
 patterns:Partial<Record<PoleRole,'organic'|'street'|'mountain'|'river'|'fishing'|'network'>>;
}
export const POLE_ROLES=['port','market','fishing','farming','mountain','forest','mine','resort'] as const;
export type PoleRole=typeof POLE_ROLES[number];
export const ARCHITECTURE_STYLES:Record<ArchitectureStyleId,ArchitectureStyle>={
 temperate:{label:'Tempéré',houses:['timber','stone','white'],paths:['dirt','dirt','stone'],patterns:{farming:'street',forest:'organic',mountain:'mountain',fishing:'fishing',market:'network',port:'network',mine:'mountain',resort:'mountain'}},
 alpine:{label:'Alpin',houses:['chalet','chalet','stone'],paths:['dirt','stone','stone'],patterns:{farming:'street',forest:'organic',mountain:'mountain',fishing:'fishing',market:'network',port:'network',mine:'mountain',resort:'mountain'}},
 fishing:{label:'Littoral',houses:['fisher','white','fisher'],paths:['dirt','wood','stone'],patterns:{fishing:'fishing',port:'fishing',market:'network',farming:'street',forest:'organic',mountain:'mountain',mine:'mountain',resort:'mountain'}},
 tropical:{label:'Tropical',houses:['tropical','tropical','white'],paths:['dirt','wood','wood'],patterns:{fishing:'fishing',port:'fishing',market:'organic',farming:'organic',forest:'organic',mountain:'mountain',mine:'mountain',resort:'mountain'}},
 arid:{label:'Aride',houses:['adobe','adobe','white'],paths:['dirt','dirt','stone'],patterns:{market:'network',farming:'street',fishing:'fishing',port:'network',forest:'organic',mountain:'mountain',mine:'mountain',resort:'mountain'}},
 medieval:{label:'Médiéval',houses:['medieval','stone','timber'],paths:['dirt','stone','stone'],patterns:{market:'organic',farming:'street',fishing:'fishing',port:'network',forest:'organic',mountain:'mountain',mine:'mountain',resort:'mountain'}},
};
/** Historical 'auto' draw (kept for existing settlements without an architecture style). */
export const LEGACY_AUTO_HOUSES:readonly HabitatStyle[]=['timber','stone','white'];
export function houseStylesFor(architecture:ArchitectureStyleId|undefined):readonly HabitatStyle[]{return architecture?ARCHITECTURE_STYLES[architecture].houses:LEGACY_AUTO_HOUSES;}
