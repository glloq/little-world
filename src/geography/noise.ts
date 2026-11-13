/** Seeded, allocation-free noise and relief profiles shared by every generator (no imports). */
export interface VolcanoShape {radiusM:number;heightM:number;craterRadiusM:number;craterDepthM:number}
/** Small seeded lattice value noise (deterministic, allocation-free). */
export function hash2(seed:number,ix:number,iz:number):number{
  let h=Math.imul(ix,0x27d4eb2d)^Math.imul(iz,0x165667b1)^Math.imul(seed,0x9e3779b1);
  h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296*2-1;
}
/** Final avalanche of hash2 (same bits as hash2 once the three products are xored). */
function mix(h:number):number{h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;return (h>>>0)/4294967296*2-1;}
/** Same values as four hash2 calls; the per-axis products are shared between corners. */
export function valueNoise(seed:number,x:number,z:number):number{
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,ux=fx*fx*(3-2*fx),uz=fz*fz*(3-2*fz);
  const s=Math.imul(seed,0x9e3779b1),x0=Math.imul(ix,0x27d4eb2d),x1=Math.imul(ix+1,0x27d4eb2d),z0=Math.imul(iz,0x165667b1)^s,z1=Math.imul(iz+1,0x165667b1)^s;
  const a=mix(x0^z0),b=mix(x1^z0),c=mix(x0^z1),d=mix(x1^z1);
  return a+(b-a)*ux+(c-a)*uz+(a-b-c+d)*ux*uz;
}
export function fbm(seed:number,x:number,z:number,octaves:number):number{
  let sum=0,amp=.5,freq=1,norm=0;
  for(let o=0;o<octaves;o++){sum+=valueNoise(seed+o*1013,x*freq,z*freq)*amp;norm+=amp;amp*=.5;freq*=2.03;}
  return sum/norm;
}
export function volcanoProfile(v:VolcanoShape,distance:number):number{
  if(v.radiusM<=0||distance>=v.radiusM)return 0;
  const cone=(r:number)=>v.heightM*Math.pow(1-r/v.radiusM,1.55);
  if(distance>=v.craterRadiusM)return cone(distance);
  const t=v.craterRadiusM>0?distance/v.craterRadiusM:0;
  return cone(v.craterRadiusM)-v.craterDepthM*(1-t*t*t*t);
}
