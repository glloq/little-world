/** Bounded presentation history. No transport and no gameplay authority. */
import {parsePresentationState,type PlayerPresentationState} from '../hamster/presentation-state.ts';
export class PresentationBuffer {
 readonly samples:PlayerPresentationState[]=[];
 readonly capacity:number;readonly extrapolation:number;
 constructor(capacity=12,extrapolation=.25){this.capacity=capacity;this.extrapolation=extrapolation;}
 push(value:PlayerPresentationState){const s=parsePresentationState(value),a=this.samples;if(a.some(v=>v.t===s.t)||a.length&&s.t<a[0].t)return false;a.push(s);a.sort((x,y)=>x.t-y.t);if(a.length>this.capacity)a.shift();return true;}
 sample(time:number,out:PlayerPresentationState):boolean{
  const a=this.samples;if(!a.length)return false;
  let left=a[0],right=left;for(const s of a){if(s.t<=time)left=s;if(s.t>=time){right=s;break;}right=s;}
  Object.assign(out,left);out.t=time;
  if(right.t>left.t){const u=Math.min(1,Math.max(0,(time-left.t)/(right.t-left.t)));for(const k of ['x','y','z','speed','verticalSpeed','turnRate'] as const)out[k]=left[k]+(right[k]-left[k])*u;out.yaw=left.yaw+Math.atan2(Math.sin(right.yaw-left.yaw),Math.cos(right.yaw-left.yaw))*u;}
  else if(time>left.t&&a.length>1){const prev=a[a.length-2],dt=left.t-prev.t;if(dt>0){const u=Math.min(this.extrapolation,time-left.t)/dt;out.x+=(left.x-prev.x)*u;out.y+=(left.y-prev.y)*u;out.z+=(left.z-prev.z)*u;}}
  return true;
 }
}
