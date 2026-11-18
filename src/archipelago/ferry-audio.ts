/** Two procedural bell cues use the existing AudioEngine and its shared voice budgets. */
import type {AudioDefinitionV2,AudioAssetV2,SoundEventV2} from '../audio/catalog.ts';
const event=(id:string,assetId:string):SoundEventV2=>({
  id,category:'boat',description:id==='ferry.arrived'?'Cloche d’arrivée de la navette':'Cloche cinq minutes avant le départ',
  bus:'sfx',variants:[{assetId,weight:1}],gain:.85,pitch:1,pitchJitter:0,gainJitter:0,
  cooldownMs:500,priority:7,maxInstances:1,steal:'oldest',spatial:true,radius:90,
  loop:false,repeat:'sequence',maxLatencyMs:5000,
});
const bell=(id:string,frequency:number):AudioAssetV2=>({
  id,name:id,kind:'procedural',format:'procedural',status:'GENERATED',license:'project-original',source:'ferry-audio.ts',
  usage:'sfx',procedural:{generator:'tone',seconds:1.4,gain:.34,attack:.006,decay:5,frequency,harmonics:[1,.48,.21]},
});
export function withFerryBells(catalog:AudioDefinitionV2):AudioDefinitionV2{
  return {...catalog,
    assets:{...catalog.assets,'ferry.arrival-bell':bell('ferry.arrival-bell',590),'ferry.warning-bell':bell('ferry.warning-bell',440)},
    events:{...catalog.events,'ferry.arrived':event('ferry.arrived','ferry.arrival-bell'),'ferry.departure-warning':event('ferry.departure-warning','ferry.warning-bell')},
  };
}
