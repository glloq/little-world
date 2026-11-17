/** Fixed-step, allocation-free boost pulses. Simulation is authoritative; visuals use gasPulseSeq. */
export const GAS = {
  max:280, initial:150, legacyInitial:75, cost:14,
  pulseSeconds:.2, cooldownSeconds:.55, acceleration:70,
  // Former continuous tuning retained as explicit legacy metadata only.
  legacyDrainPerSecond:16
} as const;
export const GAS_CAPACITIES=[200,224,252,280] as const;
export const GAS_POWERS=[10,11,12,14] as const;
export const GAS_MASTERY=[1,.96,.92] as const;
export interface GasState {
 gasReserve?:number;gasCapacityLevel?:number;gasPowerLevel?:number;gasControlLevel?:number;
 gasBoosting?:boolean;gasPulseSeq?:number;gasPulseClock?:number;gasThrust?:number;
 gasPulseRemaining?:number;gasCooldown?:number;gasBoostHeld?:boolean;gasRepeatArmed?:boolean;
}
const clamp=(v:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,v));
const level=(value:number|undefined,max:number):number=>typeof value==='number'&&Number.isInteger(value)&&value>=0?Math.min(value,max):0;
export const gasCapacity=(p:GasState):number=>GAS_CAPACITIES[level(p.gasCapacityLevel,GAS_CAPACITIES.length-1)];
export const gasPower=(p:GasState):number=>GAS_POWERS[level(p.gasPowerLevel,GAS_POWERS.length-1)];
export const gasMastery=(p:GasState):number=>GAS_MASTERY[level(p.gasControlLevel,GAS_MASTERY.length-1)];
export const gasLevel=(p:GasState):number=>clamp(Number.isFinite(p.gasReserve)?p.gasReserve!:GAS.initial,0,gasCapacity(p));
export const gasShots=(p:GasState):number=>Math.floor((gasLevel(p)+1e-8)/GAS.cost);
export const gasMaxShots=(p:GasState):number=>Math.floor(gasCapacity(p)/GAS.cost);
/** Start once on a fresh press, or repeat while continuously held after 0.55 s.
 * The pulse lasts 0.2 s even when released. A mode switch aborts it without a refund.
 * An already held button on entering glide is NOT automatically armed. */
export function gasBoostStep(p:GasState,held:boolean,gliding:boolean,dt:number):number {
 if(!Number.isFinite(dt)||dt<0||dt>.25)throw Error('Pas de propulsion invalide');
 const wasHeld=p.gasBoostHeld===true;
 p.gasBoostHeld=held;
 p.gasReserve=gasLevel(p);
 p.gasCooldown=Math.max(0,(p.gasCooldown??0)-dt);
 if(!gliding){
  p.gasBoosting=false;p.gasPulseRemaining=0;p.gasPulseClock=0;p.gasThrust=0;p.gasRepeatArmed=false;
  return 0;
 }
 if(!held)p.gasRepeatArmed=false;
 else if(!wasHeld)p.gasRepeatArmed=true;
 const ready=(p.gasCooldown??0)<=1e-8&&(p.gasPulseRemaining??0)<=1e-8;
 if(held&&p.gasRepeatArmed&&ready&&gasShots(p)>0){
  p.gasReserve=Math.max(0,p.gasReserve-GAS.cost);
  p.gasCooldown=GAS.cooldownSeconds;
  p.gasPulseRemaining=GAS.pulseSeconds;
  p.gasPulseClock=0;
  p.gasPulseSeq=(p.gasPulseSeq??0)+1;
 }
 const seconds=Math.min(dt,p.gasPulseRemaining??0);
 p.gasPulseRemaining=Math.max(0,(p.gasPulseRemaining??0)-seconds);
 p.gasPulseClock=(p.gasPulseClock??0)+seconds;
 p.gasBoosting=seconds>0;
 const acceleration=gasPower(p)/GAS.pulseSeconds;
 p.gasThrust=seconds>0?acceleration:0;
 return dt>0?acceleration*seconds/dt:0;
}
/** Refuel only after successfully deducting one valid food item from inventory. */
export function refillGas(p:GasState,amount:number):number {
 if(!Number.isFinite(amount)||amount<=0)return 0;
 const before=gasLevel(p);
 p.gasReserve=Math.min(gasCapacity(p),before+amount);
 return p.gasReserve-before;
}
/** Upgrades change capacity without filling the tank automatically. */
export function upgradeGas(p:GasState,kind:'capacity'|'power'|'control'):boolean{
 const key=kind==='capacity'?'gasCapacityLevel':kind==='power'?'gasPowerLevel':'gasControlLevel';
 const limit=kind==='capacity'?GAS_CAPACITIES.length-1:kind==='power'?GAS_POWERS.length-1:GAS_MASTERY.length-1;
 const old=level(p[key],limit);
 if(old>=limit)return false;
 p[key]=old+1;
 return true;
}
