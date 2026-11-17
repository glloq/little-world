/** Automatic horizontal follow. The camera pitch is a deliberate glider control,
 * so only yaw is recentered after inactivity. Called at presentation frequency. */
import {angleDelta} from '../physics/motion.ts';
export interface FlightCameraFollow {
  yaw:number;pitch:number;idleSeconds:number;wasGliding:boolean;
}
export const FLIGHT_CAMERA={idleDelay:2,fastIdleDelay:1,fastSpeed:18,followRate:2.5} as const;
export function advanceFlightAutoCamera(
  s:FlightCameraFollow,dt:number,gliding:boolean,dragging:boolean,enabled:boolean,
  velocityX:number,velocityZ:number,facingYaw:number,boosting:boolean,
):void{
  if(!gliding){s.idleSeconds=0;s.wasGliding=false;return;}
  if(!s.wasGliding){s.idleSeconds=0;s.wasGliding=true;}
  if(dragging||!enabled){s.idleSeconds=0;return;}
  s.idleSeconds+=Math.min(Math.max(dt,0),.1);
  const horizontalSpeed=Math.hypot(velocityX,velocityZ);
  const delay=boosting||horizontalSpeed>FLIGHT_CAMERA.fastSpeed?FLIGHT_CAMERA.fastIdleDelay:FLIGHT_CAMERA.idleDelay;
  if(s.idleSeconds<delay)return;
  const target=horizontalSpeed>2?Math.atan2(velocityX,velocityZ):facingYaw;
  const smooth=1-Math.exp(-FLIGHT_CAMERA.followRate*Math.min(Math.max(dt,0),.1));
  s.yaw+=angleDelta(s.yaw,target)*smooth;
  // Do not reset s.pitch: otherwise the idle camera would unintentionally pitch the glider.
}
