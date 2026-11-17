import {naturalRegions} from './world-biomes-v4.ts';
/** V2 ecological provinces cover the island; WATER is one input, not their outline. */
import {LANDSCAPES,type Landscape,type MapRequirements} from './map-requirements.ts';
import {newRegion,type RegionRecipeV1,type RegionPreset} from './region-recipes.ts';
import {landscapeOrder,randomStream} from './world-terrain-planner.ts';
import {planLegacyWorldBiomes,RIVER_BIOME_SPAN} from './world-biome-legacy.ts';
import {shapeSeed,compilePolygon,polylineDistance,type PointXZ} from '../geography/archipelago.ts';
import {generatorField} from '../terrain-generator.ts';
import type {GeographicProvince} from './world-provinces.ts';
import type {ProjectDocument} from './types.ts';
export {RIVER_BIOME_SPAN};
const presets:Record<Landscape,RegionPreset>={mountain:'mountain',hills:'scrub',plain:'meadow',plateau:'scrub',forest:'forest',meadow:'meadow',marsh:'marsh',lake:'marsh',coast:'coast',volcanic:'volcanic'};
export interface ProvinceEnvironment {altitudeM:number;slope:number;waterDistanceM:number;humidity:number;exposure:number;coastM:number}
/** Cheap terrain/environment sampling shared by planning and acceptance tests. */
export function provinceEnvironment(p:ProjectDocument,province:GeographicProvince,axis:PointXZ[]):ProvinceEnvironment{
 const r=p.world.generation!,field=generatorField(p.world.terrain!,{width:r.width,length:r.length,seed:r.seed,seaLevel:p.world.seaLevel},()=>0);
 const inside=compilePolygon(province.polygon),nearby=axis.filter(q=>inside(q.x,q.z)>=0);
 const point=nearby.length?nearby[Math.floor(nearby.length/2)]:province.center;
 const d=Math.max(3,Math.min(r.width,r.length)/200),dx=(field.height(point.x+d,point.z)-field.height(point.x-d,point.z))/(2*d),dz=(field.height(point.x,point.z+d)-field.height(point.x,point.z-d))/(2*d);
 const altitudeM=field.height(point.x,point.z),slope=Math.hypot(dx,dz),waterDistanceM=r.rivers?polylineDistance(axis,point.x,point.z):Math.max(0,field.coast(point.x,point.z));
 const wind=randomStream(shapeSeed(r.seed,'climate-v2'))()*Math.PI*2,exposure=slope<.001?.5:.5+.5*(dx*Math.cos(wind)+dz*Math.sin(wind))/slope;
 const humidity=Math.max(0,Math.min(1,.2+.55*Math.exp(-waterDistanceM/180)+.2*(1-exposure)-Math.max(0,altitudeM-100)/1500));
 return {altitudeM,slope,waterDistanceM,humidity,exposure,coastM:field.coast(point.x,point.z)};
}
export function biomeSuitability(kind:Landscape,e:ProvinceEnvironment):number{
 switch(kind){
  case 'forest':return e.humidity*2.2+(1-e.exposure)*.7+Math.min(.3,e.altitudeM/400)-e.slope*.5;
  case 'meadow':return 1.2-e.slope*.8+e.exposure*.4-Math.max(0,e.altitudeM-120)/200;
  case 'plain':return 1.5-e.slope*3-Math.max(0,e.altitudeM-35)/120;
  case 'plateau':return 1-e.slope*2+Math.min(.8,e.altitudeM/150);
  case 'marsh':case 'lake':return e.altitudeM>35||e.waterDistanceM>200?-5:1+e.humidity*2-e.slope*3;
  case 'coast':return e.coastM>180?-5:2-e.coastM/180;
  case 'mountain':return Math.min(2,e.altitudeM/100)+e.slope;
  case 'hills':return 1-Math.abs(e.slope-.2)+Math.min(.5,e.altitudeM/150);
  case 'volcanic':return e.altitudeM/200;
 }
}
export function planWorldBiomes(p:ProjectDocument,r:MapRequirements,axis:PointXZ[],provinces:GeographicProvince[]=[]):RegionRecipeV1[]{
 if(r.compositionVersion===4)return naturalRegions(p);
 if((r.compositionVersion??1)===1)return planLegacyWorldBiomes(p,r,axis);
 const order=landscapeOrder(r),recipes:RegionRecipeV1[]=[];
 if(!order.length)return recipes;
 for(const province of provinces){
  const env=provinceEnvironment(p,province,axis);
  const kind=province.station!==undefined?order[province.station]:[...order].sort((a,b)=>biomeSuitability(b,env)-biomeSuitability(a,env))[0];
  const index=province.station,recipe=newRegion(p,{id:index!==undefined?'composition-region-'+index:'composition-side-region-'+province.id,
   name:index!==undefined?LANDSCAPES[kind]:LANDSCAPES[kind]+' · versant',preset:presets[kind],points:province.polygon,
   seed:shapeSeed(r.seed,'province-biome-'+province.id),coverage:100,transitionM:Math.min(45,Math.min(r.width,r.length)*.012),
   vegetation:{trees:kind==='forest'?.8+env.humidity*.4:kind==='mountain'||kind==='coast'?.12:.3,shrubs:.5+env.humidity*.35,ground:kind==='marsh'?.9:.65,deadwood:kind==='forest'?.5:.2}});
  recipes.push(recipe);
 }
 if(r.compositionVersion===3&&r.biomeMode==='automatic'&&r.landscapes.some(l=>l.kind==='volcanic')){
  const volcano=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.kind==='volcano'):undefined;
  if(volcano&&volcano.kind==='volcano'){
   const side=provinces.filter(q=>q.station===undefined).sort((a,b)=>Math.hypot(a.center.x-volcano.x,a.center.z-volcano.z)-Math.hypot(b.center.x-volcano.x,b.center.z-volcano.z))[0];
   const region=side?recipes.find(q=>q.id==='composition-side-region-'+side.id):undefined;
   if(region){region.name=LANDSCAPES.volcanic;region.preset='volcanic';region.vegetation={trees:.05,shrubs:.1,ground:.15,deadwood:0};}
  }
 }
 return recipes;
}
