/** B1 climate v1: one region, periodic deterministic weather, exact historical integrals. */
export type WeatherKind='clear'|'cloudy'|'rain';
export interface EnvironmentDefinition {schemaVersion:1;generatorVersion:1;weatherSeed:number;dayLengthSeconds:number;initialDayPhase:number;weatherPeriodSeconds:number;}
export interface EnvironmentState {worldTime:number;dayPhase:number;sunAltitude:number;weather:WeatherKind;cloudCover:number;temperatureC:number;rainfallMmPerHour:number;wind:number;}
export interface ClimateSummary {schemaVersion:1;generatorVersion:1;from:number;to:number;seconds:number;degreeHours:number;rainfallMm:number;evaporationMm:number;weatherSeconds:Record<WeatherKind,number>;}
const kinds:WeatherKind[]=['clear','cloudy','rain'];
const profiles={clear:{cloudCover:.05,temperatureC:20,rainfallMmPerHour:0,evaporationMmPerHour:.25,wind:.2},cloudy:{cloudCover:.8,temperatureC:16,rainfallMmPerHour:0,evaporationMmPerHour:.1,wind:.35},rain:{cloudCover:1,temperatureC:13,rainfallMmPerHour:3,evaporationMmPerHour:.02,wind:.5}};
export const defaultEnvironment=(seed=1284):EnvironmentDefinition=>({schemaVersion:1,generatorVersion:1,weatherSeed:seed,dayLengthSeconds:1200,initialDayPhase:.36,weatherPeriodSeconds:180});
export function parseEnvironmentDefinition(value:unknown):EnvironmentDefinition {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Définition d’environnement invalide');const v=value as Record<string,unknown>;
 if(Object.keys(v).some(k=>!['schemaVersion','generatorVersion','weatherSeed','dayLengthSeconds','initialDayPhase','weatherPeriodSeconds'].includes(k))||v.schemaVersion!==1||v.generatorVersion!==1)throw Error('Version d’environnement incompatible');
 const range=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
 if(!Number.isSafeInteger(v.weatherSeed)||!range(v.weatherSeed,1,9999999)||!range(v.dayLengthSeconds,60,864000)||!range(v.initialDayPhase,0,1)||!range(v.weatherPeriodSeconds,10,86400))throw Error('Paramètres d’environnement invalides');return structuredClone(value) as EnvironmentDefinition;
}
/** Small versioned cycle provides replay over arbitrarily old intervals without per-frame history. */
export function createClimate(definition:EnvironmentDefinition){
 const d=parseEnvironmentDefinition(definition),pattern=Array.from({length:16},(_,slot)=>{let hash=Math.imul(d.weatherSeed^(slot+1),0x45d9f3b);hash=Math.imul(hash^(hash>>>16),0x45d9f3b);return kinds[(hash>>>0)%kinds.length];});
 const cycleLength=pattern.length*d.weatherPeriodSeconds;
 const cycleCounts={clear:0,cloudy:0,rain:0};for(const kind of pattern)cycleCounts[kind]+=d.weatherPeriodSeconds;
 const validTime=(time:number)=>{if(!Number.isFinite(time)||time<0||time>1e9)throw Error('Instant climatique invalide');};
 function state(time:number):EnvironmentState {
  validTime(time);const dayPhase=(time/d.dayLengthSeconds+d.initialDayPhase)%1,weather=pattern[Math.floor(time/d.weatherPeriodSeconds)%pattern.length],profile=profiles[weather];
  return {worldTime:time,dayPhase,sunAltitude:Math.sin(2*Math.PI*(dayPhase-.25)),weather,cloudCover:profile.cloudCover,temperatureC:profile.temperatureC,rainfallMmPerHour:profile.rainfallMmPerHour,wind:profile.wind};
 }
 function prefix(time:number){
  const cycles=Math.floor(time/cycleLength),counts={clear:cycles*cycleCounts.clear,cloudy:cycles*cycleCounts.cloudy,rain:cycles*cycleCounts.rain};let remaining=time-cycles*cycleLength;
  for(const kind of pattern){const seconds=Math.min(d.weatherPeriodSeconds,remaining);counts[kind]+=seconds;remaining-=seconds;if(remaining<=0)break;}return counts;
 }
 function summarize(from:number,to:number,baseTemperatureC=0):ClimateSummary {
  validTime(from);validTime(to);if(to<from||!Number.isFinite(baseTemperatureC)||baseTemperatureC< -50||baseTemperatureC>60)throw Error('Intervalle climatique invalide');
  const a=prefix(from),b=prefix(to),weatherSeconds={clear:b.clear-a.clear,cloudy:b.cloudy-a.cloudy,rain:b.rain-a.rain};let degreeHours=0,rainfallMm=0,evaporationMm=0;
  for(const kind of kinds){const hours=weatherSeconds[kind]/3600,p=profiles[kind];degreeHours+=Math.max(0,p.temperatureC-baseTemperatureC)*hours;rainfallMm+=p.rainfallMmPerHour*hours;evaporationMm+=p.evaporationMmPerHour*hours;}
  return {schemaVersion:1,generatorVersion:1,from,to,seconds:to-from,degreeHours,rainfallMm,evaporationMm,weatherSeconds};
 }
 return {definition:d,state,summarize};
}
export type ClimateHistory=ReturnType<typeof createClimate>;
