/** Colour palettes, borders and decoration of the mini-game themes (doc 107 §décors). Loaded
 * only with the mini-game views and the Studio panel (never by the schema or the game core). */
import type {MiniGameBorder,MiniGamePropId,MiniGameThemeId} from './themes.ts';
export interface MiniGameTheme {
  label:string;border:MiniGameBorder;
  /** Wall colour and the lighter cap; bank of the access ramps; platform sides. */wall:number;cap:number;bank:number;side:number;
  /** Optional floor tints (stripe tones a/b) per floor material. */floor?:Partial<Record<'pitch'|'green'|'lane'|'sand',[number,number]>>;
  /** Props drawn around the field by the automatic decoration (in order of preference). */decor:readonly MiniGamePropId[];
  flags:readonly number[];scoreboard:'wood'|'stone';
  /** Light surroundings (snow, sand): interactive objects get darker outlines. */bright?:boolean;
}
export const MINIGAME_THEMES:Readonly<Record<MiniGameThemeId,MiniGameTheme>>={
  classic:{label:'Classique',border:'boards',wall:0xeae6da,cap:0xffffff,bank:0x6f9147,side:0x6b4f33,decor:['flag','bollard','lamp'],flags:[0xe2453c,0xf2c94c,0x3f7fd8],scoreboard:'wood'},
  village:{label:'Village',border:'wood',wall:0xa8784a,cap:0xc99a66,bank:0x6f9147,side:0x6b4f33,decor:['fence','flag','lamp','signpost','barrel','stand'],flags:[0xe2453c,0xf2c94c,0x56ccf2,0x6fcf97],scoreboard:'wood'},
  forest:{label:'Forêt',border:'logs',wall:0x7a5232,cap:0x9c7046,bank:0x55743a,side:0x5a3f26,floor:{pitch:[0x4a8f3a,0x52983f],green:[0x3fa04a,0x389343]},decor:['stump','rock','mushroom','log','signpost'],flags:[0xd9822b,0x6fcf97,0xf2c94c],scoreboard:'wood'},
  beach:{label:'Plage',border:'rope',wall:0xc9a46a,cap:0xe8d3a3,bank:0xd9c48d,side:0xb89f6a,floor:{pitch:[0x6aa84f,0x74b257],sand:[0xeedcab,0xe6d39f]},decor:['driftwood','flag','crate','bollard'],flags:[0x56ccf2,0xf2994a,0xffffff],scoreboard:'wood',bright:true},
  mountain:{label:'Montagne',border:'stone',wall:0x8f8a80,cap:0xa9a49a,bank:0x7d8a5e,side:0x6c675e,floor:{pitch:[0x5a8f45,0x63984d]},decor:['rock','signpost','flag','log'],flags:[0xe2453c,0xffffff],scoreboard:'stone'},
  snow:{label:'Neige',border:'snowbank',wall:0xf2f5f8,cap:0xffffff,bank:0xe8eef2,side:0xc8d2da,floor:{pitch:[0x6c9e5a,0x76a862],green:[0x5aa865,0x52a05d],sand:[0xf0f3f6,0xe6ebef]},decor:['snowpole','flag','lamp','crate'],flags:[0xe2453c,0x3f7fd8,0xf2c94c],scoreboard:'wood',bright:true},
  volcano:{label:'Volcan',border:'basalt',wall:0x3d3836,cap:0x55504c,bank:0x5a524a,side:0x2f2a28,floor:{pitch:[0x587d3c,0x608544],sand:[0x8a7a6a,0x837364]},decor:['basalt','rock','lamp','flag'],flags:[0xf2994a,0xeb5757,0xf2c94c],scoreboard:'stone'},
  marsh:{label:'Marais',border:'planks',wall:0x6b5638,cap:0x83704e,bank:0x4f6a3a,side:0x4a3c28,floor:{pitch:[0x4a7f3c,0x527a40],green:[0x3d8a46,0x37803f]},decor:['reeds','log','stump','mushroom','signpost'],flags:[0x9b51e0,0x6fcf97,0xf2c94c],scoreboard:'wood'},
};
