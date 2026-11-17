/** Lightweight, persistent, optional solo-flight progression. No renderer, clock, or networking. */
import {FLIGHT_COURSES,type FlightCourseId} from './flight-courses.ts';
export const FLIGHT_SKINS=['classic','cheese','potato','hazelnut','magic','rainbow'] as const;
export type FlightSkin=typeof FLIGHT_SKINS[number];
export const FLIGHT_CHALLENGES=['first-flight','speed-demon','long-flight','combo-four'] as const;
export type FlightChallenge=typeof FLIGHT_CHALLENGES[number];
export interface FlightProgress {
 version:1;
 capacityLevel:number;powerLevel:number;controlLevel:number;
 selectedSkin:FlightSkin;selectedSound:FlightSkin;
 unlockedSkins:FlightSkin[];unlockedSounds:FlightSkin[];
 totalDistance:number;bestFlightDistance:number;currentFlightDistance:number;
 pulsesUsed:number;maxSpeed:number;bestCombo:number;currentCombo:number;
 currentFlightNoGas:number;lastPulseAt:number;
 achievements:FlightChallenge[];records:Record<FlightCourseId,number|null>;
}
export const newFlightProgress=():FlightProgress=>({
 version:1,capacityLevel:0,powerLevel:0,controlLevel:0,
 selectedSkin:'classic',selectedSound:'classic',unlockedSkins:['classic'],unlockedSounds:['classic'],
 totalDistance:0,bestFlightDistance:0,currentFlightDistance:0,pulsesUsed:0,maxSpeed:0,
 bestCombo:0,currentCombo:0,currentFlightNoGas:0,lastPulseAt:-1,
 achievements:[],records:{rings:null,dive:null,economy:null}
});
const bounded=(v:unknown,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=max;
const limited=(v:unknown,max:number):v is number=>Number.isInteger(v)&&bounded(v,max);
const skin=(v:unknown):v is FlightSkin=>typeof v==='string'&&(FLIGHT_SKINS as readonly string[]).includes(v);
const challenge=(v:unknown):v is FlightChallenge=>typeof v==='string'&&(FLIGHT_CHALLENGES as readonly string[]).includes(v);
/** Strict validator for saves. Missing object migrates an old save to level 0. */
export function parseFlightProgress(raw:unknown):FlightProgress{
 if(raw===undefined||raw===null)return newFlightProgress();
 if(typeof raw!=='object'||Array.isArray(raw))throw Error('Progression de vol invalide');
 const p=raw as Record<string,unknown>;
 if(p.version!==1||!limited(p.capacityLevel,3)||!limited(p.powerLevel,3)||!limited(p.controlLevel,2)||
  !skin(p.selectedSkin)||!skin(p.selectedSound))throw Error('Niveau de propulsion invalide');
 const fields=['totalDistance','bestFlightDistance','currentFlightDistance','pulsesUsed','maxSpeed','bestCombo','currentCombo','currentFlightNoGas'] as const;
 for(const field of fields)if(!bounded(p[field],1e9))throw Error('Statistique de vol invalide : '+field);
 if(typeof p.lastPulseAt!=='number'||!Number.isFinite(p.lastPulseAt)||p.lastPulseAt< -1||p.lastPulseAt>1e9)throw Error('Horloge de combo invalide');
 const unlocked=(v:unknown):v is FlightSkin[]=>Array.isArray(v)&&v.length>=1&&v.length<=FLIGHT_SKINS.length&&v.every(skin)&&new Set(v).size===v.length&&v.includes('classic');
 if(!unlocked(p.unlockedSkins)||!unlocked(p.unlockedSounds)||!p.unlockedSkins.includes(p.selectedSkin as FlightSkin)||!p.unlockedSounds.includes(p.selectedSound as FlightSkin))throw Error('Cosmétique de propulsion invalide');
 if(!Array.isArray(p.achievements)||p.achievements.length>FLIGHT_CHALLENGES.length||!p.achievements.every(challenge)||new Set(p.achievements).size!==p.achievements.length)throw Error('Récompenses de vol invalides');
 const records=p.records??{rings:null,dive:null,economy:null};
 if(typeof records!=='object'||records===null||Array.isArray(records)||Object.keys(records).some(id=>!FLIGHT_COURSES.includes(id as FlightCourseId))||
   FLIGHT_COURSES.some(id=>((records as Record<string,unknown>)[id]!==null)&&!bounded((records as Record<string,unknown>)[id],600)))throw Error('Records de vol invalides');
 return structuredClone({...p,records}) as unknown as FlightProgress;
}
/** Track genuine fixed-step flight. Returns a single progress message only on an unlock. */
export function advanceFlight(p:FlightProgress,step:{gliding:boolean;distance:number;speed:number;pulse:boolean;time:number}):string|null{
 if(!step.gliding){
  p.currentFlightDistance=0;p.currentFlightNoGas=0;p.currentCombo=0;p.lastPulseAt=-1;
  return null;
 }
 const distance=Number.isFinite(step.distance)?Math.max(0,Math.min(8,step.distance)):0;
 const speed=Number.isFinite(step.speed)?Math.max(0,Math.min(60,step.speed)):0;
 p.totalDistance=Math.min(1e9,p.totalDistance+distance);
 p.currentFlightDistance=Math.min(1e9,p.currentFlightDistance+distance);
 p.bestFlightDistance=Math.max(p.bestFlightDistance,p.currentFlightDistance);
 p.maxSpeed=Math.max(p.maxSpeed,speed);
 if(step.pulse){
  p.pulsesUsed=Math.min(1e9,p.pulsesUsed+1);
  p.currentCombo=p.lastPulseAt>=0&&step.time-p.lastPulseAt<=1.2?p.currentCombo+1:1;
  p.bestCombo=Math.max(p.bestCombo,p.currentCombo);
  p.lastPulseAt=step.time;
  p.currentFlightNoGas=0;
 }else p.currentFlightNoGas+=distance;
 const checks:readonly [FlightChallenge,boolean,FlightSkin][]=[
  ['first-flight',p.totalDistance>=150,'cheese'],
  ['speed-demon',p.maxSpeed>=45,'magic'],
  ['long-flight',p.bestFlightDistance>=1000,'potato'],
  ['combo-four',p.bestCombo>=4,'hazelnut']
 ];
 let notice:string|null=null;
 for(const [id,ready,unlock] of checks)if(ready&&!p.achievements.includes(id)){
  p.achievements.push(id);
  if(!p.unlockedSkins.includes(unlock))p.unlockedSkins.push(unlock);
  if(!p.unlockedSounds.includes(unlock))p.unlockedSounds.push(unlock);
  notice='Défi de vol réussi : '+id.replace(/-/g,' ')+' · nouvel effet débloqué';
 }
 if(p.achievements.length>=4&&!p.unlockedSkins.includes('rainbow')){
  p.unlockedSkins.push('rainbow');p.unlockedSounds.push('rainbow');
  notice='Tous les défis de vol réussis : propulsion arc-en-ciel débloquée';
 }
 const capacity=[0,300,1500,3500],power=[0,8,30,60],control=[0,600,2000];
 for(let i=1;i<capacity.length;i++)if(p.totalDistance>=capacity[i]&&p.capacityLevel<i){p.capacityLevel=i;notice='Capacité de propulsion améliorée : niveau '+(i+1);}
 for(let i=1;i<power.length;i++)if(p.pulsesUsed>=power[i]&&p.powerLevel<i){p.powerLevel=i;notice='Puissance de propulsion améliorée : niveau '+(i+1);}
 for(let i=1;i<control.length;i++)if(p.totalDistance>=control[i]&&p.controlLevel<i){p.controlLevel=i;notice='Maîtrise du vol améliorée : niveau '+(i+1);}
 return notice;
}
