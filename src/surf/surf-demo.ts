/** Bounded, deterministic search for an opt-in surf testing area on generated islands.
 * Does not edit the Studio project, published island, or hydrographic datum. */
import type {SurfZone} from './wave-field.ts';
export interface SurfBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface SurfDemoSite {
  zone:SurfZone;
  start:{x:number;z:number};
  heading:number;
}
export function findDemoSurfSite(height:(x:number,z:number)=>number,
 bounds:SurfBounds,seaLevel:number,seed=1):SurfDemoSite|null {
  const directions=[{x:0,z:1},{x:0,z:-1},{x:1,z:0},{x:-1,z:0}];
  const inside=(x:number,z:number,margin=20)=>x>=bounds.minX+margin&&x<=bounds.maxX-margin&&z>=bounds.minZ+margin&&z<=bounds.maxZ-margin;
  let best:SurfDemoSite|null=null,bestScore=-Infinity;
  for(const out of directions)for(const offset of [-220,0,220]){
    const tx=-out.z,tz=out.x,baseX=tx*offset,baseZ=tz*offset;
    if(!inside(baseX,baseZ))continue;
    let coast=-1;
    for(let d=0;d<1450;d+=10){
      const x=baseX+out.x*d,z=baseZ+out.z*d;
      if(!inside(x,z))break;
      if(height(x,z)<seaLevel-.12){coast=d;break;}
    }
    if(coast<0)continue;
    let ok=true,deep=0;
    for(const d of [coast+30,coast+110,coast+210,coast+280]){
      for(const shift of [-45,0,45]){
        const x=baseX+out.x*d+tx*shift,z=baseZ+out.z*d+tz*shift;
        if(!inside(x,z)||height(x,z)>seaLevel-.85){ok=false;break;}
        deep+=seaLevel-height(x,z);
      }
      if(!ok)break;
    }
    if(!ok)continue;
    const ax=baseX+out.x*(coast+8),az=baseZ+out.z*(coast+8);
    const bx=baseX+out.x*(coast+300),bz=baseZ+out.z*(coast+300);
    const zone:SurfZone={id:'surf:demo',minX:Math.min(ax,bx)-Math.abs(tx)*62,
      maxX:Math.max(ax,bx)+Math.abs(tx)*62,
      minZ:Math.min(az,bz)-Math.abs(tz)*62,
      maxZ:Math.max(az,bz)+Math.abs(tz)*62,
      dirX:-out.x,dirZ:-out.z,seaLevel,
      amplitude:1.25,wavelength:31,speed:6.2,seed,shoreFadeDepth:3,edgeFade:9};
    const x=baseX+out.x*(coast+125),z=baseZ+out.z*(coast+125);
    const score=deep/12-Math.abs(offset)*.0005;
    if(score>bestScore){bestScore=score;best={zone,start:{x,z},heading:Math.atan2(-out.x,-out.z)};}
  }
  return best;
}
