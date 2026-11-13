import * as THREE from 'three';
import type {StudioCamera} from '../../studio-core/context.ts';

/** E1 — Studio camera: orbit around a pivot, free flight and orthographic top view.
 * The pose is (eye position, yaw, pitch, pivot distance); the pivot (target) is derived.
 * Pure state + small Three.js cameras: no DOM here, so the math is unit-testable. */
export type CameraMode='orbit'|'free'|'top';
export interface Pose {x:number;y:number;z:number;yaw:number;pitch:number;distance:number;zoom:number}
export interface CameraLimits {minX:number;maxX:number;minZ:number;maxZ:number;ground:(x:number,z:number)=>number}
export interface FlyInput {forward:number;right:number;up:number;fast:boolean}
const PITCH_MIN=-1.553,PITCH_MAX=1.2,MIN_DISTANCE=2,MAX_DISTANCE=9000,MARGIN=1500,MAX_ALTITUDE=4000;
const wrap=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
export function forwardOf(yaw:number,pitch:number){return {x:-Math.sin(yaw)*Math.cos(pitch),y:Math.sin(pitch),z:-Math.cos(yaw)*Math.cos(pitch)};}
export function targetOf(p:Pose){const f=forwardOf(p.yaw,p.pitch);return {x:p.x+f.x*p.distance,y:p.y+f.y*p.distance,z:p.z+f.z*p.distance};}
/** Pose from a saved context (eye + target), tolerant of contexts saved before targets existed. */
export function poseFromContext(c:StudioCamera,ground:(x:number,z:number)=>number):Pose{
  const target=c.target??{x:c.x,y:ground(c.x,c.z),z:c.z};
  let eye={x:c.x,y:c.y,z:c.z};
  if(!c.target||Math.hypot(eye.x-target.x,eye.y-target.y,eye.z-target.z)<.5)eye={x:target.x+28,y:target.y+34,z:target.z+32};
  const dx=target.x-eye.x,dy=target.y-eye.y,dz=target.z-eye.z,distance=clamp(Math.hypot(dx,dy,dz),MIN_DISTANCE,MAX_DISTANCE);
  return {...eye,yaw:Math.atan2(-dx,-dz),pitch:clamp(Math.asin(clamp(dy/distance,-1,1)),PITCH_MIN,PITCH_MAX),distance,zoom:c.zoom??Math.max(40,distance*1.2)};
}
export class EditorCamera {
  readonly perspective=new THREE.PerspectiveCamera(55,1,.2,12000);
  readonly orthographic=new THREE.OrthographicCamera(-1,1,1,-1,.5,20000);
  pose:Pose;mode:CameraMode;
  private animation:{from:Pose;to:Pose;time:number;duration:number;then?:()=>void;mode:CameraMode}|null=null;
  private limits:CameraLimits;
  constructor(pose:Pose,mode:CameraMode,limits:CameraLimits){this.limits=limits;this.pose={...pose};this.mode=mode;this.constrain();this.apply();}
  get camera():THREE.Camera{return this.mode==='top'?this.orthographic:this.perspective;}
  get target(){return targetOf(this.pose);}
  get animating(){return this.animation!==null;}
  setAspect(aspect:number){this.perspective.aspect=aspect;this.perspective.updateProjectionMatrix();this.apply();}
  setFar(far:number){this.perspective.far=far;this.perspective.updateProjectionMatrix();}
  /** Right drag: orbit around the pivot (orbit/top) or look around in place (free). */
  rotate(dx:number,dy:number){
    this.stop();if(this.mode==='top'){this.leaveTop();return;}
    const target=this.target;this.pose.yaw=wrap(this.pose.yaw-dx*.005);this.pose.pitch=clamp(this.pose.pitch-dy*.005,PITCH_MIN,PITCH_MAX);
    if(this.mode==='orbit'){const f=forwardOf(this.pose.yaw,this.pose.pitch);this.pose.x=target.x-f.x*this.pose.distance;this.pose.y=target.y-f.y*this.pose.distance;this.pose.z=target.z-f.z*this.pose.distance;}
    this.constrain();this.apply();
  }
  /** Middle drag: translate the view in its plane (top view: on the ground). */
  pan(dx:number,dy:number,heightPx:number){
    this.stop();
    if(this.mode==='top'){const k=this.pose.zoom/Math.max(1,heightPx),c=Math.cos(this.pose.yaw),s=Math.sin(this.pose.yaw);this.pose.x+=(-dx*c-dy*s)*k;this.pose.z+=(dx*s-dy*c)*k;}
    else{
      const k=2*this.pose.distance*Math.tan(THREE.MathUtils.degToRad(this.perspective.fov)/2)/Math.max(1,heightPx);
      const right={x:Math.cos(this.pose.yaw),z:-Math.sin(this.pose.yaw)},f=forwardOf(this.pose.yaw,this.pose.pitch),up={x:-Math.sin(this.pose.pitch)*-Math.sin(this.pose.yaw),y:Math.cos(this.pose.pitch),z:-Math.sin(this.pose.pitch)*-Math.cos(this.pose.yaw)};
      void f;this.pose.x+=(-right.x*dx+up.x*dy)*k;this.pose.y+=up.y*dy*k;this.pose.z+=(-right.z*dx+up.z*dy)*k;
    }
    this.constrain();this.apply();
  }
  /** Wheel: zoom towards the point under the cursor (null = towards the pivot). */
  zoomAt(point:{x:number;y:number;z:number}|null,steps:number){
    this.stop();const factor=Math.pow(1.18,clamp(steps,-6,6));
    if(this.mode==='top'){
      const next=clamp(this.pose.zoom*factor,12,MAX_DISTANCE*1.5),k=1-next/this.pose.zoom;
      if(point){const t=this.target;this.pose.x+=(point.x-t.x)*k;this.pose.z+=(point.z-t.z)*k;}
      this.pose.zoom=next;
    }else{
      const anchor=point??this.target,distance=clamp(this.pose.distance*factor,MIN_DISTANCE,MAX_DISTANCE),k=distance/this.pose.distance;
      this.pose.x=anchor.x+(this.pose.x-anchor.x)*k;this.pose.y=anchor.y+(this.pose.y-anchor.y)*k;this.pose.z=anchor.z+(this.pose.z-anchor.z)*k;this.pose.distance=distance;
    }
    this.constrain();this.apply();
  }
  /** Right button + WASD/ZQSD: free flight, speed grows with altitude (3 × 8 km reachable). */
  fly(dt:number,input:FlyInput){
    if(this.mode==='top'||(!input.forward&&!input.right&&!input.up))return false;
    this.stop();this.mode='free';
    const altitude=Math.max(0,this.pose.y-this.limits.ground(this.pose.x,this.pose.z)),speed=clamp(altitude*1.1,8,700)*(input.fast?4:1)*Math.min(dt,.25);
    const f=forwardOf(this.pose.yaw,this.pose.pitch),right={x:Math.cos(this.pose.yaw),z:-Math.sin(this.pose.yaw)};
    this.pose.x+=(f.x*input.forward+right.x*input.right)*speed;this.pose.y+=(f.y*input.forward+input.up)*speed;this.pose.z+=(f.z*input.forward+right.z*input.right)*speed;
    this.constrain();this.apply();return true;
  }
  /** F: frame a point/sphere in orbit mode, with a controlled transition. */
  focus(center:{x:number;y:number;z:number},radius:number){
    const pitch=Math.min(this.mode==='top'?-1.1:this.pose.pitch,-.32),distance=clamp(Math.max(radius,1)*3.2,6,MAX_DISTANCE),f=forwardOf(this.pose.yaw,pitch);
    const to:Pose={...this.pose,pitch,distance,x:center.x-f.x*distance,y:center.y-f.y*distance,z:center.z-f.z*distance};
    if(this.mode==='top')this.leaveTop(false);this.mode='orbit';this.animate(to);
  }
  /** 7: orthographic top view over the current pivot (press again to come back). */
  toggleTop(){
    if(this.mode==='top'){this.leaveTop();return;}
    const t=this.target,tan=Math.tan(THREE.MathUtils.degToRad(this.perspective.fov)/2),zoom=clamp(2*this.pose.distance*tan,12,MAX_DISTANCE*1.5),distance=zoom/(2*tan);
    const to:Pose={...this.pose,pitch:PITCH_MIN,distance,zoom,x:t.x,y:t.y+distance,z:t.z};
    this.animate(to,()=>{this.mode='top';this.apply();},'top');
  }
  private leaveTop(animated=true){
    if(this.mode!=='top')return;const t=this.target,tan=Math.tan(THREE.MathUtils.degToRad(this.perspective.fov)/2),distance=clamp(this.pose.zoom/(2*tan),MIN_DISTANCE,MAX_DISTANCE),pitch=-1.05,f=forwardOf(this.pose.yaw,pitch);
    this.mode='orbit';const to:Pose={...this.pose,pitch,distance,x:t.x-f.x*distance,y:t.y-f.y*distance,z:t.z-f.z*distance};
    if(animated)this.animate(to);else{this.pose=to;this.constrain();this.apply();}
  }
  /** Teleport the pivot (global map → 3D) keeping orientation and distance. */
  moveTarget(x:number,z:number){const t=this.target,y=this.limits.ground(x,z);this.stop();this.pose.x+=x-t.x;this.pose.y+=y-t.y;this.pose.z+=z-t.z;this.constrain();this.apply();}
  /** Advance transitions; returns true while the camera moves. */
  update(dt:number):boolean{
    const a=this.animation;if(!a)return false;a.time+=dt;const t=Math.min(1,a.time/a.duration),k=t*t*(3-2*t);
    const lerp=(x:number,y:number)=>x+(y-x)*k;
    this.pose={x:lerp(a.from.x,a.to.x),y:lerp(a.from.y,a.to.y),z:lerp(a.from.z,a.to.z),yaw:a.from.yaw+wrap(a.to.yaw-a.from.yaw)*k,pitch:lerp(a.from.pitch,a.to.pitch),distance:lerp(a.from.distance,a.to.distance),zoom:lerp(a.from.zoom,a.to.zoom)};
    if(t>=1){this.animation=null;this.pose={...a.to};a.then?.();}
    this.apply();return true;
  }
  stop(){if(this.animation){const then=this.animation.then;this.pose={...this.animation.to};this.animation=null;then?.();}}
  /** Persisted pose: the end of a running transition, never an intermediate frame. */
  context():StudioCamera{const a=this.animation,pose=a?a.to:this.pose,t=targetOf(pose),mode=a?.mode??this.mode;return {x:pose.x,y:pose.y,z:pose.z,mode,target:{x:t.x,y:t.y,z:t.z},zoom:pose.zoom};}
  private animate(to:Pose,then?:()=>void,mode:CameraMode=this.mode){this.stop();this.animation={from:{...this.pose},to,time:0,duration:.32,then,mode};}
  /** Keep the eye above ground, within the island plus a sea margin, below a ceiling. */
  private constrain(){
    const l=this.limits,p=this.pose;p.x=clamp(p.x,l.minX-MARGIN,l.maxX+MARGIN);p.z=clamp(p.z,l.minZ-MARGIN,l.maxZ+MARGIN);
    const inside=p.x>=l.minX&&p.x<=l.maxX&&p.z>=l.minZ&&p.z<=l.maxZ,floor=(inside?l.ground(p.x,p.z):0)+1.2;p.y=clamp(p.y,floor,MAX_ALTITUDE);
    p.distance=clamp(p.distance,MIN_DISTANCE,MAX_DISTANCE);p.zoom=clamp(p.zoom,12,MAX_DISTANCE*1.5);
  }
  private apply(){
    const p=this.pose,c=this.perspective;c.position.set(p.x,p.y,p.z);c.rotation.set(p.pitch,p.yaw,0,'YXZ');c.updateMatrixWorld();
    const o=this.orthographic,t=this.target,h=p.zoom/2,w=h*c.aspect;o.left=-w;o.right=w;o.top=h;o.bottom=-h;
    o.position.set(t.x,t.y+Math.max(500,h*4),t.z);o.up.set(-Math.sin(p.yaw),0,-Math.cos(p.yaw));o.lookAt(t.x,t.y,t.z);o.far=Math.max(2000,h*10);o.updateProjectionMatrix();o.updateMatrixWorld();
  }
}
