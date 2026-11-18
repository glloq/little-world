/** Small runtime-only audio extension for fishing. Generated audio manifests and
 * the project's authored audio stay untouched. All sounds use the existing
 * AudioEngine/AudioEventRouter and its global voice/mixer budgets. */
import type {AudioAssetV2,AudioDefinitionV2,SoundEventV2} from '../audio/catalog.ts';

type Cue='fishing.strain'|'fishing.catch'|'fishing.escape';
const tone=(id:string,frequency:number,seconds:number,notes:number[],gain:number):AudioAssetV2=>({
  id,name:id,kind:'procedural',format:'procedural',status:'GENERATED',
  license:'project-original',source:'src/gameplay/fishing-audio.ts',usage:'sfx',
  procedural:{generator:'tone',seconds,gain,attack:.006,decay:7,frequency,notes,harmonics:[1,.32,.1]},
});
const noise=(id:string,seconds:number,lowpass:number):AudioAssetV2=>({
  id,name:id,kind:'procedural',format:'procedural',status:'GENERATED',
  license:'project-original',source:'src/gameplay/fishing-audio.ts',usage:'sfx',
  procedural:{generator:'noise',seconds,gain:.22,attack:.01,decay:13,color:'brown',lowpass},
});
const event=(id:Cue,assetId:string,gain:number,cooldownMs:number):SoundEventV2=>({
  id,category:'water',description:id==='fishing.strain'?'Grincement léger de ligne tendue':id==='fishing.catch'?'Petite fanfare de capture':'Ligne relâchée, poisson échappé',
  bus:'sfx',variants:[{assetId,weight:1}],gain,pitch:1,pitchJitter:.08,gainJitter:.03,
  cooldownMs,priority:id==='fishing.catch'?7:5,maxInstances:1,steal:'oldest',
  spatial:id!=='fishing.catch',radius:30,loop:false,repeat:'random',maxLatencyMs:150,
});
export function withFishingSounds(catalog:AudioDefinitionV2):AudioDefinitionV2{
  const assets={...catalog.assets};
  const events={...catalog.events};
  const additions={
    'fishing.strain':noise('fishing.strain-proc',.26,.18),
    'fishing.catch':tone('fishing.catch-proc',660,.44,[0,4,7,12],.2),
    'fishing.escape':tone('fishing.escape-proc',290,.28,[0,-3,-7],.13),
  } as const;
  for(const [id,asset] of Object.entries(additions) as [Cue,AudioAssetV2][]){
    if(events[id])continue; // Never override authored events or their configured takes.
    assets[asset.id]??=asset;
    events[id]=event(id,asset.id,id==='fishing.catch'?.65:.34,id==='fishing.strain'?1100:300);
  }
  return {...catalog,assets,events};
}
