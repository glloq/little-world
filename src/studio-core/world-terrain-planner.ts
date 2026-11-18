import {planWorldTerrainV5} from './world-terrain-v5.ts';
/** Version dispatch preserves previous saved compositions. */
import type {MapRequirements} from './map-requirements.ts';
import {planWorldTerrainV3} from './world-terrain-v3.ts';
import {planWorldTerrainV4} from './world-terrain-v4.ts';
export {landscapeOrder,randomStream} from './world-terrain-v3.ts';
export function planWorldTerrain(r:MapRequirements,attempt=0){
 if(r.compositionVersion===5)return planWorldTerrainV5(r,attempt);
 return r.compositionVersion===4?planWorldTerrainV4(r,attempt):planWorldTerrainV3(r,attempt);
}
