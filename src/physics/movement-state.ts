/** Simulation checkpoint + input tape, separate from visual presentation and player saves.
 * Enough state for deterministic local replay/ghosts or a future authority correction.
 * No transport, prediction scheduler, race rules or server is installed here. */
import {simulatePlayer,MOTION_MODES,type Player,type Controls} from '../player.ts';
import type {WorldCollisionQuery} from './collision-world.ts';
export interface MovementCommand {tick:number;input:Controls}
const fields=['oxygen','glideReady','stamina','climbCooldown','climbDir','rollSpeed','rollHeading','rollIdle','rollByHold','diving','diveSink','glideHeading','glidePitch','glideTurnRate','stalled','space','body','runCharge','intentYaw','jumpOrigin','jumpSeq','landingSpeed','landingSeq','coyoteLeft','coyoteFrom','jumpBufferLeft','groundPitch','groundRoll','rollSlip'] as const;
export interface MovementSnapshot {version:1;tick:number;position:{x:number;y:number;z:number};velocity:{x:number;y:number;z:number};mode:Player['mode'];yaw:number;state:Partial<Pick<Player,typeof fields[number]>>}
const point=(v:unknown):v is {x:number;y:number;z:number}=>!!v&&typeof v==='object'&&['x','y','z'].every(k=>typeof (v as Record<string,unknown>)[k]==='number'&&Number.isFinite((v as Record<string,number>)[k])&&Math.abs((v as Record<string,number>)[k])<=100000);
export function captureMovement(p:Player,tick:number):MovementSnapshot{
 if(!Number.isSafeInteger(tick)||tick<0)throw Error('Tick invalide');
 const state:MovementSnapshot['state']={};for(const k of fields)if(p[k]!==undefined)Object.assign(state,{[k]:typeof p[k]==='object'?{...p[k] as object}:p[k]});
 return {version:1,tick,position:{x:p.position.x,y:p.position.y,z:p.position.z},velocity:{x:p.velocity.x,y:p.velocity.y,z:p.velocity.z},mode:p.mode,yaw:p.heading??Math.atan2(p.velocity.x,p.velocity.z),state};
}
export function restoreMovement(p:Player,s:MovementSnapshot){
 if(!s||s.version!==1||!Number.isSafeInteger(s.tick)||s.tick<0||!Number.isFinite(s.yaw)||!point(s.position)||!point(s.velocity)||!MOTION_MODES.includes(s.mode)||!s.state||typeof s.state!=='object')throw Error('État de mouvement invalide');
 if(typeof s.state.oxygen!=='number'||!Number.isFinite(s.state.oxygen)||typeof s.state.glideReady!=='boolean')throw Error('État de locomotion incomplet');
 // Whitelist fields and validate the entire payload before mutating the live actor.
 for(const [k,v]of Object.entries(s.state)){
  const obj=v&&typeof v==='object'?v as Record<string,unknown>:null;
  if(!(fields as readonly string[]).includes(k))throw Error('Champ de mouvement inconnu');
  if(['glideReady','rollByHold','diving','diveSink','stalled'].includes(k)){if(typeof v!=='boolean')throw Error('Drapeau invalide');}
  else if(k==='climbDir'){if(!obj||typeof obj.x!=='number'||typeof obj.z!=='number'||!Number.isFinite(obj.x)||!Number.isFinite(obj.z))throw Error('Direction invalide');}
  else if(k==='jumpOrigin'||k==='coyoteFrom'){if(!['idle','run','roll'].includes(String(v)))throw Error('Origine de saut invalide');}
  else if(k==='jumpSeq'||k==='landingSeq'){if(!Number.isSafeInteger(v)||Number(v)<0)throw Error('Sequence de mouvement invalide');}
  else if(k==='runCharge'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw Error('Charge de course invalide');}
  else if(k==='coyoteLeft'||k==='jumpBufferLeft'){if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>.25)throw Error('Durée de saut invalide');}
  else if(k==='groundPitch'||k==='groundRoll'||k==='rollSlip'){if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>1)throw Error('Cue de sol invalide');}
  else if(k==='space'){if(!obj||typeof obj.zoneId!=='string'||typeof obj.levelId!=='string')throw Error('Espace invalide');}
  else if(k==='body'){if(!obj||Object.entries(obj).some(([k,n])=>!['radius','height','step','maxSlope'].includes(k)||typeof n!=='number'||!Number.isFinite(n)||n<0||n>10))throw Error('Corps invalide');}
  else if(typeof v!=='number'||!Number.isFinite(v)||Math.abs(v)>100000)throw Error('Nombre de mouvement invalide');
 }
 p.position.set(s.position.x,s.position.y,s.position.z);p.velocity.set(s.velocity.x,s.velocity.y,s.velocity.z);p.mode=s.mode;p.heading=s.yaw;p.transitioned=undefined;
 for(const k of fields){delete p[k];if(s.state[k]!==undefined)Object.assign(p,{[k]:typeof s.state[k]==='object'?{...s.state[k] as object}:s.state[k]});}
}
/** Caller supplies the same collision/surface source and ordered inputs as the authority.
 * Steps are always 30 Hz, irrespective of how often the samples will be rendered. */
export function replayMovement(p:Player,s:MovementSnapshot,commands:readonly MovementCommand[],collision?:WorldCollisionQuery){
 let next=s.tick;
 for(const c of commands){
  if(c.tick!==++next)throw Error('Commandes de mouvement non consécutives');
  const k=c.input;if(!k||!Number.isFinite(k.cameraYaw)||!Number.isFinite(k.forward)||Math.abs(k.forward)>1||!Number.isFinite(k.right)||Math.abs(k.right)>1||['run','jumpPressed','spaceHeld','dive'].some(f=>typeof k[f as keyof Controls]!=='boolean')||k.cameraPitch!==undefined&&(!Number.isFinite(k.cameraPitch)||Math.abs(k.cameraPitch)>1.6)||k.autoRun!==undefined&&typeof k.autoRun!=='boolean'||k.jumpAssist!==undefined&&typeof k.jumpAssist!=='boolean')throw Error('Commande de mouvement invalide');
 }
 restoreMovement(p,s);let tick=s.tick;
 for(const c of commands){if(c.tick!==tick+1)throw Error('Commandes de mouvement non consécutives');simulatePlayer(p,c.input,1/30,collision);tick=c.tick;}
 return captureMovement(p,tick);
}
