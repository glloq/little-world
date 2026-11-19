/** F09-E audited, synchronous transfer between a native harvester ledger and
 * a real NPC workshop. Never credits the player bag or guesses missing supply.
 */
import type {createNpcHarvestAccount} from './harvest-ledger.ts';
import type {createNpcWorkshopEconomy} from './economy.ts';
type Harvest=ReturnType<typeof createNpcHarvestAccount>;
type Workshop=ReturnType<typeof createNpcWorkshopEconomy>;
export function transferNativeRawMaterial(
 source:Harvest,destination:Workshop,itemId:string,quantity:number,
 sourcePoint:{x:number;z:number},destinationPoint:{x:number;z:number},
 maxRange=8,
):boolean{
 if(!Number.isSafeInteger(quantity)||quantity<1||quantity>99||
  !Number.isFinite(maxRange)||maxRange<=0||maxRange>8||
  ![sourcePoint.x,sourcePoint.z,destinationPoint.x,destinationPoint.z].every(Number.isFinite)||
  Math.hypot(sourcePoint.x-destinationPoint.x,sourcePoint.z-destinationPoint.z)>maxRange||
  !source.canTake(itemId,quantity)||!destination.canReceive(itemId,quantity))return false;
 // Both ledgers preflight synchronously. No render, timers, network or async
 // code can interleave these two native operations.
 if(!destination.receive(itemId,quantity))return false;
 if(!source.take(itemId,quantity))
  throw Error('Transfert PNJ : source modifiée durant la transaction synchrone');
 return true;
}
