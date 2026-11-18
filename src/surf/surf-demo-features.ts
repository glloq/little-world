import type {SurfDemoSite} from './surf-demo.ts';
import type {SurfFeature} from './surf-features.ts';
export function makeDemoSurfFeatures(site:SurfDemoSite):SurfFeature[]{
 const {start,zone}=site,d={x:zone.dirX,z:zone.dirZ};
 const at=(id:string,kind:SurfFeature['kind'],along:number,side:number,radius:number,power:number):SurfFeature=>({
   id:'surf-feature:'+id,kind,
   x:start.x+d.x*along-d.z*side,z:start.z+d.z*along+d.x*side,
   dirX:d.x,dirZ:d.z,radius,power,cooldownTicks:kind==='buoy'?25:150
 });
 return [
  at('boost-1','boost',24,0,5,6.5),
  at('ramp-1','ramp',48,0,4.5,1.5),
  at('buoy-1','buoy',75,12,2,0),
 ];
}
