/** E10 — local lights: presets, runtime projection, deterministic flicker and day/night factor.
 * Pure (no Three.js): shared by the Studio preview, the compiled-world reader and Node tests,
 * so « Jouer ici » and the Studio use exactly the same light list and the same curves. */
import type {LightComponent,LightMode,LightPreset,TransformComponent} from '../studio-core/types.ts';

export interface LightPresetDefinition {label:string;color:string;intensity:number;range:number;offsetY:number;mode:LightMode;flicker?:{amplitude:number;speed:number}}
/** Starting values (to be tuned on real scenes; not benchmarks). Intensities are physical
 * point-light candela with the default decay of 2. */
export const LIGHT_PRESETS:Record<LightPreset,LightPresetDefinition>={
  'warm-lantern':{label:'Lanterne chaude',color:'#ffb45a',intensity:28,range:14,offsetY:3.7,mode:'night',flicker:{amplitude:.08,speed:.6}},
  'flickering-fire':{label:'Feu vacillant',color:'#ff8a3a',intensity:36,range:12,offsetY:.9,mode:'always',flicker:{amplitude:.35,speed:1.6}},
  'fixed-lamp':{label:'Lampe fixe',color:'#ffe0aa',intensity:22,range:11,offsetY:2.4,mode:'night'},
  'cold-light':{label:'Lumière froide',color:'#a6ccff',intensity:18,range:10,offsetY:2.4,mode:'always'},
};
export const LIGHT_PRESET_IDS=Object.keys(LIGHT_PRESETS) as LightPreset[];
export function lightFromPreset(preset:LightPreset,offsetY?:number):LightComponent{
  const p=LIGHT_PRESETS[preset];
  return {type:'Light',kind:'point',color:p.color,intensity:p.intensity,range:p.range,offset:{x:0,y:offsetY??p.offsetY,z:0},enabled:true,mode:p.mode,...(p.flicker?{flicker:{...p.flicker}}:{}),preset};
}

/** One light as consumed by the renderer. `y` is a height above the ground at (x, z),
 * as for placements; `follow` = attached to a moving character (position resolved per frame). */
export interface RuntimeLight {
  id:string;entityId:string;x:number;y:number;z:number;offset:{x:number;y:number;z:number};
  color:string;intensity:number;range:number;mode:LightMode;stateKey?:string;flicker?:{amplitude:number;speed:number};follow:boolean;
}
/** Offset expressed in the entity's local frame (rotation and scale of its Transform). */
export function worldOffset(t:TransformComponent,o:{x:number;y:number;z:number}){
  const {x:qx,y:qy,z:qz,w:qw}=t.rotation,vx=o.x*t.scale.x,vy=o.y*t.scale.y,vz=o.z*t.scale.z;
  // v' = v + 2w(q×v) + 2q×(q×v)
  const cx=qy*vz-qz*vy,cy=qz*vx-qx*vz,cz=qx*vy-qy*vx,dx=qy*cz-qz*cy,dy=qz*cx-qx*cz,dz=qx*cy-qy*cx;
  return {x:vx+2*(qw*cx+dx),y:vy+2*(qw*cy+dy),z:vz+2*(qw*cz+dz)};
}
/** Disabled lights are dropped here: they never reach the renderer. Sorted by id (stable). */
export function runtimeLights(entities:{id:string;components:{Transform?:TransformComponent;Light?:LightComponent;Character?:unknown}}[]):RuntimeLight[]{
  const out:RuntimeLight[]=[];
  for(const e of entities){
    const t=e.components.Transform,l=e.components.Light;if(!t||!l||!l.enabled||l.intensity<=0)continue;
    const o=worldOffset(t,l.offset);
    out.push({id:'light:'+e.id,entityId:e.id,x:t.position.x+o.x,y:t.position.y+o.y,z:t.position.z+o.z,offset:o,color:l.color,intensity:l.intensity,range:l.range,mode:l.mode,
      ...(l.stateKey?{stateKey:l.stateKey}:{}),...(l.flicker&&l.flicker.amplitude>0?{flicker:{...l.flicker}}:{}),follow:!!e.components.Character});
  }
  return out.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}

/** 0 by day, 1 at night, smooth over dusk/dawn (sun altitude in [-1, 1]). */
export function nightFactor(sunAltitude:number):number{
  const t=Math.max(0,Math.min(1,(sunAltitude+.12)/.24));return 1-t*t*(3-2*t);
}
/** Mode factor in [0, 1]: night lights fade in at dusk, state lights follow their entity state. */
export function modeFactor(mode:LightMode,night:number,state?:boolean):number{
  return mode==='always'?1:mode==='night'?night:state===false?0:1;
}
const hash=(n:number)=>{let h=Math.imul(n|0,0x27d4eb2d);h=Math.imul(h^(h>>>15),0x85ebca6b);return ((h^(h>>>13))>>>0)/4294967296;};
export function lightSeed(id:string):number{let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);return h>>>0;}
/** Deterministic value noise: random levels at `speed` Hz, smoothly interpolated (no per-fire
 * animation loop; evaluated only for the few lights actually rendered). Returns a multiplier. */
export function flickerAt(seed:number,time:number,amplitude:number,speed:number):number{
  if(amplitude<=0)return 1;const s=time*speed,i=Math.floor(s),f=s-i,u=f*f*(3-2*f);
  const a=hash(seed+i),b=hash(seed+i+1);return 1-amplitude*(a+(b-a)*u);
}
