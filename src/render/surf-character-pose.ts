/** Surf-only overlay on the existing low-poly hamster skeleton.
 * No new clips or baked assets, no physics changes, and no heap allocation per frame. */
import type {HamsterCharacter} from '../hamster/hamster.ts';
import type {Player} from '../player.ts';
export function applySurfPose(character:HamsterCharacter,player:Player,tick:number):void{
 if(player.mode!=='surf'&&!player.surfAirborne)return;
 const joints=character.rig.joints;
 const speed=Math.hypot(player.velocity.x,player.velocity.z);
 const t=tick/30;
 if(player.surfStage==='paddle'&&!player.surfAirborne){
  // Lie prone to paddle; alternate forepaws without blocking the existing action layer.
  joints.HamsterBody.rotation.x+=.28;
  joints.HamsterBody.position.y-=.08;
  const paddle=Math.sin(t*14);
  joints.ShoulderLeft.rotation.x+=-.85-.5*paddle;
  joints.ShoulderRight.rotation.x+=-.85+.5*paddle;
  joints.HipLeft.rotation.x+=.23;
  joints.HipRight.rotation.x+=.23;
  joints.Tail.rotation.x+=.13;
 }else if(player.surfAirborne||player.surfStage==='air'){
  const tilt=Math.max(-.18,Math.min(.18,player.velocity.y*.025));
  joints.HamsterBody.rotation.x-=.12+tilt;
  joints.ShoulderLeft.rotation.x+=-.35;
  joints.ShoulderRight.rotation.x+=-.35;
  joints.ShoulderLeft.rotation.z+=-.45;
  joints.ShoulderRight.rotation.z+=.45;
  joints.HipLeft.rotation.x+=.35;
  joints.HipRight.rotation.x+=.35;
 }else{
  // One continuous rail-to-rail carve, driven by physical heading instead of animation time.
  const heading=player.surfHeading??player.heading??0;
  const slideYaw=Math.atan2(player.velocity.x,player.velocity.z);
  const edge=Math.atan2(Math.sin(heading-slideYaw),Math.cos(heading-slideYaw));
  const bank=Math.max(-.22,Math.min(.22,edge*.24));
  const crouch=Math.min(.18,Math.max(0,speed-4)*.009);
  joints.HamsterBody.rotation.x+=.09+crouch;
  joints.HamsterBody.rotation.z+=bank;
  joints.HipLeft.rotation.x+=.18+crouch;
  joints.HipRight.rotation.x+=.18+crouch;
  joints.FootLeft.rotation.x-=.08;
  joints.FootRight.rotation.x-=.08;
  joints.ShoulderLeft.rotation.z-=.24+bank;
  joints.ShoulderRight.rotation.z+=.24-bank;
  joints.Tail.rotation.x+=.13;
 }
}
