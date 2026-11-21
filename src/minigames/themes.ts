/**
 * Visual themes and decorative props of mini-game fields (doc 107 §évolution graphique).
 * Data only (no Three.js): read by the validator, Studio and the view. A theme changes
 * colours, borders and decoration — never a rule or a collision.
 */
export type MiniGameThemeId='classic'|'village'|'forest'|'beach'|'mountain'|'snow'|'volcano'|'marsh';
export const MINIGAME_THEME_IDS:readonly MiniGameThemeId[]=['classic','village','forest','beach','mountain','snow','volcano','marsh'];
/** Placeable decorative props (author elements of kind `decor`, plus automatic theme decor). */
export type MiniGamePropId='flag'|'bunting'|'stand'|'bollard'|'signpost'|'podium'|'trophy'|'marker'|'stall'|'fence'|'lamp'|
  'arch-start'|'arch-finish'|'windmill'|'tunnel'|'stump'|'rock'|'mushroom'|'driftwood'|'reeds'|'snowpole'|'basalt'|'barrel'|'crate'|'log';
export const MINIGAME_PROP_IDS:readonly MiniGamePropId[]=['flag','bunting','stand','bollard','signpost','podium','trophy','marker','stall','fence','lamp',
  'arch-start','arch-finish','windmill','tunnel','stump','rock','mushroom','driftwood','reeds','snowpole','basalt','barrel','crate','log'];
export const MINIGAME_PROPS:Readonly<Record<MiniGamePropId,{label:string;
  /** Footprint that also blocks balls (static box, metres); absent = purely decorative. */solid?:{width:number;depth:number;height:number}}>>={
  flag:{label:'Fanion'},bunting:{label:'Guirlande'},stand:{label:'Petite tribune'},bollard:{label:'Borne'},signpost:{label:'Pancarte'},
  podium:{label:'Podium'},trophy:{label:'Trophée'},marker:{label:'Marqueur'},stall:{label:'Petit stand'},fence:{label:'Barrière'},lamp:{label:'Lampe'},
  'arch-start':{label:'Arche de départ'},'arch-finish':{label:'Arche d’arrivée'},windmill:{label:'Petit moulin',solid:{width:.7,depth:.7,height:.9}},
  tunnel:{label:'Tunnel'},stump:{label:'Souche'},rock:{label:'Pierre'},mushroom:{label:'Champignon'},driftwood:{label:'Bois flotté'},reeds:{label:'Roseaux'},
  snowpole:{label:'Piquet'},basalt:{label:'Pierre volcanique'},barrel:{label:'Tonneau'},crate:{label:'Caisse'},log:{label:'Rondin'},
};
export type MiniGameBorder='boards'|'wood'|'logs'|'rope'|'stone'|'snowbank'|'basalt'|'planks';
/** Theme names (palettes live in theme-palettes.ts, loaded with the views and the Studio panel). */
export const MINIGAME_THEME_LABELS:Readonly<Record<MiniGameThemeId,string>>={classic:'Classique',village:'Village',forest:'Forêt',beach:'Plage',mountain:'Montagne',snow:'Neige',volcano:'Volcan',marsh:'Marais'};
/** Automatic theme from the geography at the field (biome / ground material of classifyAt). */
export function themeForGround(biome:string|null|undefined,material?:string|null):MiniGameThemeId{
  if(material==='snow'||material==='ice')return 'snow';
  if(biome==='volcanic'||material==='basalt'||material==='ash')return 'volcano';
  if(biome==='wetland'||material==='mud')return 'marsh';
  if(biome==='coast'||material==='sand'||material==='pebbles')return 'beach';
  if(biome==='mountain'||material==='rock'||material==='gravel')return 'mountain';
  if(biome==='forest'||material==='forest-floor')return 'forest';
  if(biome==='village'||biome==='meadow'||biome==='scrub')return 'village';
  return 'classic';
}
/** Author presentation options of an instance (`style`, all optional). */
export interface MiniGameStyleV1 {
  /** Theme preset, or 'auto' (default) = chosen from the biome at the field. */theme?:MiniGameThemeId|'auto';
  /** Border override (default: the theme's). */border?:MiniGameBorder;
  /** Score board next to the field (default true). */scoreboard?:boolean;
  /** Flags and bunting (default true). */flags?:boolean;
  /** Automatic decoration around the field (default 'light'). */decor?:'none'|'light'|'full';
  /** Ball look: catalogue colours or high-contrast ones. */balls?:'classic'|'bright';
  /** Impact / success effects (default true). */effects?:boolean;
}
export const STYLE_KEYS=['theme','border','scoreboard','flags','decor','balls','effects'] as const;
const BORDERS:readonly MiniGameBorder[]=['boards','wood','logs','rope','stone','snowbank','basalt','planks'];
export function validateStyle(raw:unknown):MiniGameStyleV1{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Mini-jeu : style invalide');
  const s=raw as Record<string,unknown>;
  for(const k of Object.keys(s))if(!(STYLE_KEYS as readonly string[]).includes(k))throw Error('Style : champ inconnu '+k);
  if(s.theme!==undefined&&s.theme!=='auto'&&!MINIGAME_THEME_IDS.includes(s.theme as MiniGameThemeId)||
     s.border!==undefined&&!BORDERS.includes(s.border as MiniGameBorder)||
     s.scoreboard!==undefined&&typeof s.scoreboard!=='boolean'||s.flags!==undefined&&typeof s.flags!=='boolean'||s.effects!==undefined&&typeof s.effects!=='boolean'||
     s.decor!==undefined&&!['none','light','full'].includes(s.decor as string)||s.balls!==undefined&&!['classic','bright'].includes(s.balls as string))throw Error('Mini-jeu : style invalide');
  return s as MiniGameStyleV1;
}
export const MINIGAME_BORDERS=BORDERS;
