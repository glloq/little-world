/** Boats on surf swells (pure, fixed 30 Hz tick): hull height and slope from the same wave field
 * as the surfer, and a gentle push toward the shore on a steep face. The push is refused when the
 * destination is not sailable (shallows, land, other boats), so a swell never beaches a boat. */
import type {SurfWaveField} from './wave-field.ts';
export interface SwellBoat {x:number;y:number;z:number;heading:number;waveNormal?:{x:number;y:number;z:number}}
export const BOAT_SWELL={draft:.15,pushGain:6,pushMax:2.5} as const;
export function followSurfSwell(boat:SwellBoat,field:SurfWaveField|null,tick:number,dt:number,
 canSail:(x:number,z:number,heading:number)=>boolean,push=true):boolean{
 const w=field?.sample(boat.x,boat.z,tick);
 if(!w){boat.waveNormal=undefined;return false;}
 boat.y=w.height-BOAT_SWELL.draft;
 boat.waveNormal={x:w.normalX,y:w.normalY,z:w.normalZ};
 if(!push)return true;
 const step=Math.min(BOAT_SWELL.pushMax,Math.max(0,-(w.gradientX*w.directionX+w.gradientZ*w.directionZ))*BOAT_SWELL.pushGain)*dt;
 const nx=boat.x+w.directionX*step,nz=boat.z+w.directionZ*step;
 if(step>0&&canSail(nx,nz,boat.heading)){boat.x=nx;boat.z=nz;}
 return true;
}
