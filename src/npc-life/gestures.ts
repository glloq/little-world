/** Profession-only visual actions. These animations are cosmetic and never
 * mint resources, advance quests or change the workshop/economy state.
 * Work slots are sampled on a coarse presentation clock (not every frame).
 */
import type {ResidentRole} from './schedule.ts';

export interface ResidentGesture {
  activity:string;
  intervalSeconds:number;
}
const gestures:Readonly<Partial<Record<ResidentRole,ResidentGesture>>>={
  farmer:{activity:'farm-water',intervalSeconds:7},
  fisher:{activity:'fish-cast',intervalSeconds:16},
  merchant:{activity:'interact',intervalSeconds:12},
  woodcutter:{activity:'fell',intervalSeconds:8},
  miner:{activity:'mine',intervalSeconds:6},
  miller:{activity:'collect',intervalSeconds:10},
  artisan:{activity:'mine',intervalSeconds:8},
  innkeeper:{activity:'interact',intervalSeconds:10},
  dockworker:{activity:'collect',intervalSeconds:10},sailor:{activity:'interact',intervalSeconds:14},
  courier:{activity:'interact',intervalSeconds:12},guard:{activity:'interact',intervalSeconds:18},
  musician:{activity:'interact',intervalSeconds:12},gatherer:{activity:'collect',intervalSeconds:9},
  blacksmith:{activity:'mine',intervalSeconds:8},traveler:{activity:'interact',intervalSeconds:20},
  instructor:{activity:'interact',intervalSeconds:12},
};
export function residentGesture(role:ResidentRole):ResidentGesture|null{
  return gestures[role]??null;
}
export function shouldPlayResidentGesture(nowSeconds:number,lastAtSeconds:number,gesture:ResidentGesture):boolean{
  return Number.isFinite(nowSeconds)&&nowSeconds>=0&&(lastAtSeconds<0||nowSeconds-lastAtSeconds>=gesture.intervalSeconds);
}
