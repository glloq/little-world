/** Deterministic gas reserve and flight pulse timing (no rendering or wall clock). */
export const GAS={max:100,initial:75,drainPerSecond:16,acceleration:5,pulseInterval:.2} as const;
export interface GasState {gasReserve?:number;gasPulseClock?:number;gasPulseSeq?:number;gasBoosting?:boolean}
export const gasLevel=(p:GasState):number=>Math.max(0,Math.min(GAS.max,p.gasReserve??GAS.initial));
/** Mean acceleration for the fixed tick, including the final partial tank. */
export function gasBoostStep(p:GasState,held:boolean,gliding:boolean,dt:number):number{
  const reserve=gasLevel(p);p.gasReserve=reserve;
  if(!held||!gliding||reserve<=0){p.gasBoosting=false;p.gasPulseClock=0;return 0;}
  const seconds=Math.min(dt,reserve/GAS.drainPerSecond),started=!p.gasBoosting;
  p.gasReserve=Math.max(0,reserve-GAS.drainPerSecond*seconds);p.gasBoosting=true;
  let phase=(p.gasPulseClock??0)+seconds;
  if(started){p.gasPulseSeq=(p.gasPulseSeq??0)+1;phase=0;}
  else if(phase>=GAS.pulseInterval){p.gasPulseSeq=(p.gasPulseSeq??0)+1;phase%=GAS.pulseInterval;}
  p.gasPulseClock=phase;
  return GAS.acceleration*seconds/dt;
}
/** Invoke only after successfully consuming a food item in the inventory. */
export function refillGas(p:GasState,amount:number):number{
  if(!Number.isFinite(amount)||amount<=0)return 0;
  const before=gasLevel(p);p.gasReserve=Math.min(GAS.max,before+amount);return p.gasReserve-before;
}
