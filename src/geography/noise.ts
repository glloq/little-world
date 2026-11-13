/** Seeded, allocation-free noise and relief profiles shared by every generator (no imports). */
export interface VolcanoShape {radiusM:number;heightM:number;craterRadiusM:number;craterDepthM:number}
/** Small seeded lattice value noise (deterministic, allocation-free). */
export function hash2(seed:number,ix:number,iz:number):number{
  let h=Math.imul(ix,0x27d4eb2d)^Math.imul(iz,0x165667b1)^Math.imul(seed,0x9e3779b1);
  h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296*2-1;
}
export function valueNoise(seed:number,x:number,z:number):number{
  const ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz,ux=fx*fx*(3-2*fx),uz=fz*fz*(3-2*fz);
  const a=hash2(seed,ix,iz),b=hash2(seed,ix+1,iz),c=hash2(seed,ix,iz+1),d=hash2(seed,ix+1,iz+1);
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
