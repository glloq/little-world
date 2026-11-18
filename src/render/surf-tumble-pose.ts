/** Visual-only curled ball caught in a breaking wave.
 * Animation occurs after normal HamsterAnimator.pose, never touches locomotion mode,
 * swimming speed, hitboxes, saves, or baked character assets. */
import type {HamsterCharacter} from '../hamster/hamster.ts';
import type {Player} from '../player.ts';
import {BARREL_WASH} from '../surf/barrel-wash.ts';

const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
export function applySurfTumblePose(character:HamsterCharacter,player:Player):void{
 const remaining=player.barrelTumbleRemaining??0;
 if(player.mode!=='swim'||remaining<=0)return;
 const progress=clamp(1-remaining/BARREL_WASH.duration,0,1);
 // Tuck and untuck around exactly two revolutions, returning to an upright pose.
 const tuck=clamp(Math.min(progress/.12,(1-progress)/.16),0,1);
 const joints=character.rig.joints;
 joints.HamsterBody.rotation.x+=(player.barrelTumbleAngle??0);
 joints.HamsterBody.rotation.z+=.17*tuck*Math.sin(progress*Math.PI*3);
 joints.Head.rotation.x+=.2*tuck;
 joints.Tail.rotation.x+=.55*tuck;
 for(const limb of ['ArmLeft','ArmRight','FootLeft','FootRight'] as const)
   joints[limb].scale.multiplyScalar(1-.65*tuck);
 joints.EarLeft.rotation.z+=.15*tuck;
 joints.EarRight.rotation.z-=.15*tuck;
}
