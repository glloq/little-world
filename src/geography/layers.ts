/** Geography layer contracts: identifiers, categorical values, 2D diagnostic palettes and the
 * sector-mask codec. Diagnostic palettes (map editor) are deliberately distinct from the game
 * material colours (see materials.ts). */
export type MaskLayerId='geology'|'moisture'|'biome'|'material'|'occupation';
export type ComputedLayerId='landsea'|'altitude'|'slope';
export type LayerId=ComputedLayerId|MaskLayerId;
export interface CategoryValue {code:string;id:string;label:string;color:number}
export const GEOLOGY:CategoryValue[]=[
  {code:'s',id:'soil',label:'Sol meuble',color:0x9c7b55},{code:'a',id:'sand',label:'Sable',color:0xe7d28f},{code:'r',id:'rock',label:'Roche',color:0x7f8288},
  {code:'b',id:'basalt',label:'Basalte',color:0x3f3a3d},{code:'h',id:'ash',label:'Cendre',color:0x9b8f8a},{code:'g',id:'gravel',label:'Éboulis / gravier',color:0xb5ad9a},
];
export const BIOMES_V:CategoryValue[]=[
  {code:'m',id:'meadow',label:'Prairie',color:0xa9d36b},{code:'f',id:'forest',label:'Forêt',color:0x2f7a3a},{code:'w',id:'wetland',label:'Marais',color:0x5aa39b},
  {code:'n',id:'mountain',label:'Montagne / rocheux',color:0x8a8c8f},{code:'v',id:'volcanic',label:'Volcanique',color:0x5a3b36},{code:'s',id:'scrub',label:'Lande aride',color:0xcbb36a},
  {code:'c',id:'coast',label:'Littoral',color:0xe9dca6},{code:'r',id:'river',label:'Rivière',color:0x4f8fcf},{code:'l',id:'lake',label:'Eau calme',color:0x6aa3d6},{code:'g',id:'village',label:'Village',color:0xc58f63},
];
export const MATERIALS:CategoryValue[]=[
  {code:'g',id:'grass',label:'Herbe',color:0x7fbf5a},{code:'y',id:'dry-grass',label:'Herbe sèche',color:0xc9c06a},{code:'f',id:'forest-floor',label:'Sol forestier',color:0x3f6e3b},
  {code:'d',id:'dirt',label:'Terre',color:0x8a6a45},{code:'s',id:'sand',label:'Sable',color:0xead796},{code:'p',id:'pebbles',label:'Galets',color:0xb9b3a4},
  {code:'r',id:'rock',label:'Roche',color:0x777a80},{code:'v',id:'gravel',label:'Gravier',color:0xa9a291},{code:'b',id:'basalt',label:'Basalte',color:0x3a3537},
  {code:'a',id:'ash',label:'Cendre',color:0x958a84},{code:'m',id:'mud',label:'Boue',color:0x6b5b44},
];
export const OCCUPATION:CategoryValue[]=[
  {code:'b',id:'built',label:'Bâti / village',color:0xd2693c},{code:'f',id:'farm',label:'Agricole',color:0xe5b83c},{code:'r',id:'road',label:'Chemin',color:0xa07850},
  {code:'p',id:'reserved',label:'Réservé (protégé)',color:0x9b59b6},{code:'x',id:'exclusion',label:'Sans végétation',color:0xe0e0e0},
];
/** Moisture corrections: '0'..'9' = 0..1 (0 dry, 9 waterlogged). */
export const MOISTURE_CODES='0123456789';
export const CATEGORY_LAYERS:Record<Exclude<MaskLayerId,'moisture'>,CategoryValue[]>={geology:GEOLOGY,biome:BIOMES_V,material:MATERIALS,occupation:OCCUPATION};
export const MASK_LAYERS:MaskLayerId[]=['geology','moisture','biome','material','occupation'];
export interface LayerInfo {id:LayerId;label:string;mode:'editable'|'computed'|'corrections';description:string}
/** Display order (bottom → top) and editing mode of each layer. */
export const LAYERS:LayerInfo[]=[
  {id:'landsea',label:'Terre / mer',mode:'editable',description:'Masses terrestres et côtes (contours d’îles, relief sous le niveau marin).'},
  {id:'altitude',label:'Altitude',mode:'editable',description:'Relief, ombrage et courbes de niveau tous les 20 m.'},
  {id:'slope',label:'Pentes / courbure',mode:'computed',description:'Inclinaison (vert → rouge) ; crêtes claires et creux sombres.'},
  {id:'geology',label:'Géologie',mode:'editable',description:'Roche, basalte, sable, cendre, éboulis, sols.'},
  {id:'moisture',label:'Humidité',mode:'corrections',description:'Drainage simplifié (sec → détrempé) avec corrections locales.'},
  {id:'biome',label:'Biomes',mode:'editable',description:'Forêt, prairie, marais, montagne, volcanique, lande, littoral.'},
  {id:'material',label:'Matériaux',mode:'corrections',description:'Revêtement visible dans le jeu, calculé puis corrigeable.'},
  {id:'occupation',label:'Occupation',mode:'editable',description:'Bâti, agricole, chemins, zones réservées ou sans végétation.'},
];
export function categoryOf(layer:Exclude<MaskLayerId,'moisture'>,code:string):CategoryValue|undefined{return CATEGORY_LAYERS[layer].find(v=>v.code===code);}
export function categoryById(layer:Exclude<MaskLayerId,'moisture'>,id:string):CategoryValue|undefined{return CATEGORY_LAYERS[layer].find(v=>v.id===id);}

/** Sector masks: MASK_GRID² cells per V3 sector, one character per cell, '.' = generated value.
 * Small, diffable strings: one brush stroke patches a few sector strings in one transaction. */
export const MASK_GRID=16;
export const EMPTY_MASK='.'.repeat(MASK_GRID*MASK_GRID);
export type SectorLayers=Partial<Record<MaskLayerId,string>>;
export function validMaskString(layer:MaskLayerId,value:unknown):value is string{
  if(typeof value!=='string'||value.length!==MASK_GRID*MASK_GRID)return false;
  const allowed=layer==='moisture'?MOISTURE_CODES:CATEGORY_LAYERS[layer].map(v=>v.code).join('');
  for(let i=0;i<value.length;i++){const c=value[i];if(c!=='.'&&!allowed.includes(c))return false;}
  return true;
}
export interface SectorGrid {minX:number;minZ:number;chunkSizeM:number;columns:number;rows:number}
/** Cell of a world point: sector id + index inside its mask (half-open, last cell owns the edge). */
export function maskCell(g:SectorGrid,x:number,z:number):{chunkId:string;index:number}|null{
  const fx=(x-g.minX)/g.chunkSizeM,fz=(z-g.minZ)/g.chunkSizeM;if(fx<0||fz<0||fx>g.columns||fz>g.rows)return null;
  const cx=Math.min(g.columns-1,Math.floor(fx)),cz=Math.min(g.rows-1,Math.floor(fz));
  const i=Math.min(MASK_GRID-1,Math.floor((fx-cx)*MASK_GRID)),j=Math.min(MASK_GRID-1,Math.floor((fz-cz)*MASK_GRID));
  return {chunkId:`${cx}:${cz}`,index:j*MASK_GRID+i};
}
/** Centre of a mask cell in world coordinates. */
export function cellCenter(g:SectorGrid,chunkId:string,index:number){const [cx,cz]=chunkId.split(':').map(Number),size=g.chunkSizeM/MASK_GRID;return {x:g.minX+cx*g.chunkSizeM+((index%MASK_GRID)+.5)*size,z:g.minZ+cz*g.chunkSizeM+(Math.floor(index/MASK_GRID)+.5)*size};}
export function setMaskCell(mask:string|undefined,index:number,code:string):string{const base=mask??EMPTY_MASK;return base.slice(0,index)+code+base.slice(index+1);}
export const isEmptyMask=(mask:string|undefined)=>!mask||!/[^.]/.test(mask);
