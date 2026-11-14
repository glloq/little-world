/** Roadside campfires (doc 42 §H4): spots every `spacing` metres along a route, offset to one
 * side, on dry, free, gentle ground and away from other authored objects. Pure: the generator
 * turns the spots into regular entities (campfire + log seats, authored light and colliders). */
export interface RoadsideSpot {x:number;z:number;yaw:number}
export function roadsideSpots(points:{x:number;z:number}[],o:{spacing?:number;offset?:number;ok(x:number,z:number):boolean;avoid?:{x:number;z:number}[];clearance?:number}):RoadsideSpot[]{
  const spacing=o.spacing??320,offset=o.offset??7,clear=o.clearance??25,out:RoadsideSpot[]=[];let carried=spacing*.5;
  for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],len=Math.hypot(b.x-a.x,b.z-a.z);if(len<1e-6)continue;const ux=(b.x-a.x)/len,uz=(b.z-a.z)/len;
    for(let d=carried;d<len;d+=spacing){
      const side=out.length%2?1:-1,x=a.x+ux*d-uz*offset*side,z=a.z+uz*d+ux*offset*side;
      if(!o.ok(x,z)||(o.avoid??[]).some(p=>Math.hypot(p.x-x,p.z-z)<clear)||out.some(p=>Math.hypot(p.x-x,p.z-z)<spacing*.6))continue;
      out.push({x,z,yaw:Math.atan2(ux,uz)});
    }
    carried=(carried-len)%spacing;if(carried<0)carried+=spacing;
  }
  return out;
}
