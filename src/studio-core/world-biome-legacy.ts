/** Frozen V1 bank recipes, retained to reproduce saved projects and ownership. */
import {LANDSCAPES,type Landscape,type MapRequirements} from './map-requirements.ts';
import {newRegion,type RegionRecipeV1,type RegionPreset} from './region-recipes.ts';
import {randomStream} from './world-terrain-legacy.ts';
import {shapeSeed,type PointXZ} from '../geography/archipelago.ts';
import type {ProjectDocument} from './types.ts';
export const RIVER_BIOME_SPAN=.96;
const preset:Record<Landscape,RegionPreset>={mountain:'mountain',hills:'scrub',plain:'meadow',plateau:'scrub',forest:'forest',meadow:'meadow',marsh:'marsh',lake:'marsh',coast:'coast',volcanic:'volcanic'};
export function planLegacyWorldBiomes(p:ProjectDocument,r:MapRequirements,axis:PointXZ[]):RegionRecipeV1[]{
 const rng=randomStream(shapeSeed(r.seed,'biomes')),recipes:RegionRecipeV1[]=[];
 const order=r.biomeMode==='custom'?r.sequence:[...r.landscapes.map(l=>l.kind)].sort((a,b)=>['mountain','volcanic','hills','plateau','forest','plain','meadow','lake','marsh','coast'].indexOf(a)-['mountain','volcanic','hills','plateau','forest','plain','meadow','lake','marsh','coast'].indexOf(b));
 const b=p.world.bounds,clip=(q:PointXZ)=>({x:Math.max(b.minX+.1,Math.min(b.maxX-.1,q.x)),z:Math.max(b.minZ+.1,Math.min(b.maxZ-.1,q.z))});
 const width=Math.min(r.width,r.length)*.037;
 for(const [i,kind]of order.entries()){
  // Equal arc-length river sections, cropped before the offshore mouth.
  const from=Math.floor(i/order.length*axis.length*RIVER_BIOME_SPAN),to=Math.max(from+1,Math.floor((i+1)/order.length*axis.length*RIVER_BIOME_SPAN));
  const line=axis.slice(from,to+1),left:PointXZ[]=[],right:PointXZ[]=[];
  for(let j=0;j<line.length;j++){
   const before=line[Math.max(0,j-1)],after=line[Math.min(line.length-1,j+1)],dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz)||1,w=width*(.85+rng()*.3);
   left.push(clip({x:line[j].x-dz/len*w,z:line[j].z+dx/len*w}));right.push(clip({x:line[j].x+dz/len*w,z:line[j].z-dx/len*w}));
  }
  // Native recipe <=48 vertices; bank ribbons follow the same corridor as WATER.
  const points=[...left,...right.reverse()];
  const stride=Math.max(1,Math.ceil(points.length/46)),poly=points.filter((_,k)=>k%stride===0);
  recipes.push(newRegion(p,{id:'composition-region-'+i,name:LANDSCAPES[kind],preset:preset[kind],points:poly,seed:shapeSeed(r.seed,'biome-'+kind),coverage:100,transitionM:Math.min(35,width*.2),vegetation:{trees:kind==='forest'?1.1:.35,shrubs:.7,ground:.6,deadwood:.35}}));
 }
 // Side regions break the upstream/downstream stripe pattern on banks and slopes.
 for(let i=0;i<2&&order.length;i++){
  const kind=order[(i+Math.floor(rng()*order.length))%order.length],q=axis[Math.floor(axis.length*(.25+i*.23))],next=axis[Math.floor(axis.length*(.25+i*.23))+1],len=Math.hypot(next.x-q.x,next.z-q.z)||1;
  const sign=i?1:-1,c={x:q.x-(next.z-q.z)/len*width*3*sign,z:q.z+(next.x-q.x)/len*width*3*sign};
  const points=Array.from({length:12},(_,k)=>{const a=k*Math.PI/6,rad=width*(.8+rng()*.18);return clip({x:c.x+Math.cos(a)*rad,z:c.z+Math.sin(a)*rad});});
  recipes.push(newRegion(p,{id:'composition-side-region-'+i,name:LANDSCAPES[kind]+' · versant',preset:preset[kind],points,seed:shapeSeed(r.seed,'lateral-'+i),transitionM:20}));
 }
 return recipes;
}
