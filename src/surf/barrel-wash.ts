/** Deterministic nearshore white-water tumble.
 * A swimmer/wiped-out rider is briefly pushed shoreward and spins visually.
 * It never activates the ground 'roll' motion mode, so buoyancy and oxygen remain correct.
 * Explicit dive or sufficient submersion bypasses the breaking lip. */
import type {SurfZone,SurfWaveField} from './wave-field.ts';
import {sampleSurfBarrel} from './surf-barrel.ts';

export const BARREL_WASH={
 duration:1.05,
 cooldownTicks:66,
 minIntensity:.15,
 maxSpeed:11.5,
 maxRideSpeed:10,
 surfaceDepth:1.05,
 spinTurns:2,
} as const;
export interface BarrelWashActor {
 position:{x:number;y:number;z:number};
 velocity:{x:number;y:number;z:number};
 mode:string;
 diving?:boolean;
 barrelTumbleRemaining?:number;
 barrelTumbleAngle?:number;
 barrelTumbleSeq?:number;
 barrelTumbleCooldownUntilTick?:number;
}
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
const smooth=(v:number)=>{const t=clamp(v,0,1);return t*t*(3-2*t);};
const speedOf=(zone:SurfZone)=>clamp(3.4+zone.speed*.68+zone.amplitude*.7,4.5,BARREL_WASH.maxRideSpeed);
const capHorizontal=(v:BarrelWashActor['velocity'])=>{
 const speed=Math.hypot(v.x,v.z);
 if(speed>BARREL_WASH.maxSpeed){const ratio=BARREL_WASH.maxSpeed/speed;v.x*=ratio;v.z*=ratio;}
};
export function isShelteredByDive(actor:BarrelWashActor,zone:SurfZone,diveHeld=false):boolean{
 return actor.diving===true||actor.mode==='dive'||diveHeld||
        actor.position.y<zone.seaLevel-BARREL_WASH.surfaceDepth;
}
/** Called once at impact. Returns false during dive/cooldown or outside water. */
export function startBarrelWash(actor:BarrelWashActor,zone:SurfZone,tick:number,diveHeld=false):boolean{
 if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick de brassage invalide');
 if((actor.mode!=='swim'&&actor.mode!=='dive')||
    isShelteredByDive(actor,zone,diveHeld)||
    tick<(actor.barrelTumbleCooldownUntilTick??0)|| (actor.barrelTumbleRemaining??0)>0)
    return false;
 const impulse=speedOf(zone);
 actor.velocity.x=actor.velocity.x*.36+zone.dirX*impulse;
 actor.velocity.z=actor.velocity.z*.36+zone.dirZ*impulse;
 capHorizontal(actor.velocity);
 actor.velocity.y=Math.min(actor.velocity.y,-.28);
 actor.barrelTumbleRemaining=BARREL_WASH.duration;
 actor.barrelTumbleAngle=0;
 actor.barrelTumbleSeq=(actor.barrelTumbleSeq??0)+1;
 actor.barrelTumbleCooldownUntilTick=tick+BARREL_WASH.cooldownTicks;
 return true;
}
export interface BarrelWashStep {caught:boolean;active:boolean;}
/** Run after ordinary swim input, before integrating the actor's XZ displacement.
 * All impulses are bounded and deterministic. The simulation tick is 30 Hz. */
export function stepBarrelWash(actor:BarrelWashActor,field:SurfWaveField,
 ground:(x:number,z:number)=>number,tick:number,dt:number,diveHeld=false):BarrelWashStep{
 if(!Number.isSafeInteger(tick)||tick<0||!Number.isFinite(dt)||dt<=0||dt>.25)
   throw Error('Pas de brassage invalide');
 const zone=field.zone;
 if(isShelteredByDive(actor,zone,diveHeld)||actor.mode!=='swim'){
   actor.barrelTumbleRemaining=0;actor.barrelTumbleAngle=0;
   return {caught:false,active:false};
 }
 let caught=false;
 if(!(actor.barrelTumbleRemaining&&actor.barrelTumbleRemaining>0)&&
    tick>=(actor.barrelTumbleCooldownUntilTick??0)){
   const sample=sampleSurfBarrel(field,ground,actor.position.x,actor.position.z,tick);
   // The unbroken shoulder ahead of a peeling tube is not whitewater yet.
   if(sample&&sample.intensity>=BARREL_WASH.minIntensity&&sample.peel!=='shoulder')
     caught=startBarrelWash(actor,zone,tick,diveHeld);
 }
 const before=actor.barrelTumbleRemaining??0;
 if(before<=0)return {caught,active:false};
 const remaining=Math.max(0,before-dt);
 const remainingFactor=remaining/BARREL_WASH.duration;
 // Surface swimmers retain a proportion of their own input, but breaking water
 // imposes an increasingly damped, shoreward flow until the turbulence ends.
 const target=speedOf(zone)*(.5+.5*remainingFactor);
 const keep=1-Math.exp(-3.2*dt);
 actor.velocity.x+=(zone.dirX*target-actor.velocity.x)*keep;
 actor.velocity.z+=(zone.dirZ*target-actor.velocity.z)*keep;
 capHorizontal(actor.velocity);
 const progress=1-remaining/BARREL_WASH.duration;
 actor.barrelTumbleAngle=BARREL_WASH.spinTurns*2*Math.PI*smooth(progress);
 actor.barrelTumbleRemaining=remaining;
 return {caught,active:remaining>0};
}
