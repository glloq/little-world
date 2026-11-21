/**
 * Mini-game sounds (doc 107 §audio): a small runtime-only extension of the game's audio
 * catalogue, same pattern as `withFishingSounds` — procedural tones / noise bursts played by
 * the existing AudioEngine with its voice budget, cooldowns and distance culling. Authored
 * events with the same id are never overridden. Views ask for semantic ids
 * (`MiniGameSoundId`); `minigameSoundEvent` maps them to these catalogue events.
 */
import type {AudioAssetV2,AudioDefinitionV2,SoundEventV2} from '../audio/catalog.ts';
import type {MiniGameSoundId} from './types.ts';

const SOURCE='src/minigames/audio.ts';
const tone=(id:string,frequency:number,seconds:number,notes:number[],gain:number,harmonics=[1,.3,.1],decay=8,sweep?:number):AudioAssetV2=>({
  id,name:id,kind:'procedural',format:'procedural',status:'GENERATED',license:'project-original',source:SOURCE,usage:'sfx',
  procedural:{generator:'tone',seconds,gain,attack:.004,decay,frequency,notes,harmonics,...(sweep!==undefined?{sweep}:{})},
});
const noise=(id:string,seconds:number,lowpass:number,gain:number,decay=18,color:'white'|'brown'='brown'):AudioAssetV2=>({
  id,name:id,kind:'procedural',format:'procedural',status:'GENERATED',license:'project-original',source:SOURCE,usage:'sfx',
  procedural:{generator:'noise',seconds,gain,attack:.002,decay,color,lowpass},
});
/** Catalogue event id, asset, gain, cooldown (ms), priority, spatial. */
const SOUNDS:Record<MiniGameSoundId,[string,AudioAssetV2,number,number,number,boolean]>={
  'ball.kick':['minigame.ball.kick',noise('minigame.kick-proc',.09,.35,.5,30),.55,60,5,true],
  'ball.bounce':['minigame.ball.bounce',tone('minigame.bounce-proc',180,.08,[0],.3,[1,.4],30,-.4),.35,70,3,true],
  'hit.wood':['minigame.hit.wood',tone('minigame.wood-proc',420,.07,[0],.28,[1,.6,.3],35),.45,60,4,true],
  'hit.stone':['minigame.hit.stone',noise('minigame.stone-proc',.08,.5,.4,32,'white'),.4,60,4,true],
  'hit.metal':['minigame.hit.metal',tone('minigame.metal-proc',1240,.18,[0,7],.18,[1,.5,.35,.2],14),.32,60,4,true],
  'hit.ball':['minigame.hit.ball',tone('minigame.ballhit-proc',300,.06,[0],.28,[1,.3],38),.35,60,3,true],
  pins:['minigame.pins',noise('minigame.pins-proc',.35,.55,.5,9,'white'),.55,120,6,true],
  cup:['minigame.cup',tone('minigame.cup-proc',520,.3,[0,5,12],.22,[1,.25],9),.6,200,7,true],
  goal:['minigame.goal',tone('minigame.goal-proc',392,.7,[0,4,7,12,16],.2,[1,.35,.12],5),.65,600,8,false],
  success:['minigame.success',tone('minigame.success-proc',660,.4,[0,4,7,12],.18,[1,.3,.1],7),.55,250,7,false],
  fail:['minigame.fail',tone('minigame.fail-proc',300,.42,[0,-3,-7],.14,[1,.3],6),.45,600,6,false],
  record:['minigame.record',tone('minigame.record-proc',523,1,[0,4,7,12,16,19,24],.18,[1,.4,.15],4),.7,1500,9,false],
  applause:['minigame.applause',noise('minigame.applause-proc',1.4,.8,.35,2.2,'white'),.45,1500,6,false],
  start:['minigame.start',tone('minigame.start-proc',440,.32,[0,7,12],.16,[1,.3],8),.5,600,6,false],
};
export const minigameSoundEvent=(id:MiniGameSoundId)=>SOUNDS[id][0];
export function withMiniGameSounds(catalog:AudioDefinitionV2):AudioDefinitionV2{
  const assets={...catalog.assets},events={...catalog.events};
  for(const [key,[id,asset,gain,cooldownMs,priority,spatial]] of Object.entries(SOUNDS) as [MiniGameSoundId,(typeof SOUNDS)[MiniGameSoundId]][]){
    if(events[id])continue;
    assets[asset.id]??=asset;
    const e:SoundEventV2={id,category:'interaction',description:'Mini-jeu : '+key,bus:'sfx',variants:[{assetId:asset.id,weight:1}],gain,pitch:1,pitchJitter:.07,gainJitter:.05,
      cooldownMs,priority,maxInstances:key==='pins'||key==='applause'?1:2,steal:'oldest',spatial,radius:35,loop:false,repeat:'random',maxLatencyMs:120};
    events[id]=e;
  }
  return {...catalog,assets,events};
}
