/** Presentation-only weather priority for residents already at their qualified job.
 * No imaginary shelter, new pathfinding or economic transaction is created.
 * A future action service may consume the same decision for real jobs.
 */
import type {ResidentRole} from './schedule.ts';
export type ResidentWeather='clear'|'cloudy'|'rain';
export type ResidentWorkMode='active'|'weather-pause';
const EXPOSED_ROLES:ReadonlySet<ResidentRole>=new Set([
 'farmer','fisher','woodcutter','gatherer','musician','instructor',
]);
export function residentWorkMode(role:ResidentRole,weather:ResidentWeather):ResidentWorkMode{
 return weather==='rain'&&EXPOSED_ROLES.has(role)?'weather-pause':'active';
}
