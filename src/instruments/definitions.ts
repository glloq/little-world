/** Playable instruments are inventory items, not UI-selectable synth patches.
 * Models/poses intentionally stay independent for the later 3D phase. */
import type {ItemDefinition} from '../gameplay/schema.ts';
import type {PatchId} from '../audio/schema.ts';

export interface InstrumentDefinition {
  id:'flute'|'ocarina'|'ukulele';
  itemId:string;
  name:string;
  patchId:PatchId;
  modelId:string;
  poseId:'MUSIC_WIND'|'MUSIC_STRUM';
  minNote:number;
  maxNote:number;
  maxPolyphony:number;
}
export const INSTRUMENTS:readonly InstrumentDefinition[]=[
  {id:'flute',itemId:'instrument:flute',name:'Flûte douce',patchId:'flute',modelId:'instrument/flute',poseId:'MUSIC_WIND',minNote:48,maxNote:96,maxPolyphony:6},
  {id:'ocarina',itemId:'instrument:ocarina',name:'Ocarina',patchId:'ocarina',modelId:'instrument/ocarina',poseId:'MUSIC_WIND',minNote:48,maxNote:96,maxPolyphony:6},
  {id:'ukulele',itemId:'instrument:ukulele',name:'Ukulélé',patchId:'ukulele',modelId:'instrument/ukulele',poseId:'MUSIC_STRUM',minNote:48,maxNote:96,maxPolyphony:6},
];
export const INSTRUMENT_BY_ITEM:ReadonlyMap<string,InstrumentDefinition>=new Map(INSTRUMENTS.map(v=>[v.itemId,v]));
export const INSTRUMENT_ITEMS:ItemDefinition[]=INSTRUMENTS.map(v=>({
  id:v.itemId,name:v.name,category:'instrument',maxQuantity:1,
  description:'Instrument à jouer depuis le sac : équiper puis sélectionner Jouer.',
}));
export function instrumentForItem(itemId:string|null|undefined):InstrumentDefinition|null{
  return itemId?INSTRUMENT_BY_ITEM.get(itemId)??null:null;
}
