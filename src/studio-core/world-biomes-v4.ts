import {projectGeography} from './geo-context.ts';
/** Environmental masks on owned native recipe cells; no global runtime biome grid. */
import {newRegion,type RegionRecipeV1} from './region-recipes.ts';
import {generatorField} from '../terrain-generator.ts';
import {compilePolygon,polylineDistance,shapeSeed} from '../geography/archipelago.ts';
import {valueNoise} from '../geography/noise.ts';
import {EMPTY_MASK,type MaskLayerId} from '../geography/layers.ts';
import type {Landscape} from './map-requirements.ts';
import type {ProjectDocument} from './types.ts';
export const LANDSCAPE_CODES:Record<Landscape,string>={mountain:'n',hills:'s',plain:'m',plateau:'s',forest:'f',meadow:'m',marsh:'w',lake:'l',coast:'c',volcanic:'v'};
export function naturalRegions(p:ProjectDocument):RegionRecipeV1[]{
 const b=p.world.bounds,span=p.world.chunkSizeM*14,recipes:RegionRecipeV1[]=[];
 // Tiles keep every native ownership record below 256 sectors, even at 8 km.
 for(let z=b.minZ;z<b.maxZ;z+=span)for(let x=b.minX;x<b.maxX;x+=span){
  const right=Math.min(b.maxX,x+span),top=Math.min(b.maxZ,z+span);
  recipes.push(newRegion(p,{id:'composition-natural-'+recipes.length,name:'Milieux naturels '+(recipes.length+1),preset:'forest',coverage:100,transitionM:0,
   points:[{x,z},{x:right,z},{x:right,z:top},{x,z:top}],seed:shapeSeed(p.world.seed,'natural-region-'+recipes.length)}));
 }return recipes;
}
export function alignNaturalBiomes(p:ProjectDocument,skip:ReadonlySet<string>=new Set(),rects?:readonly {minX:number;maxX:number;minZ:number;maxZ:number}[]):void{
 const r=p.world.generation;if(!r||(r.compositionVersion??1)<4)return;
 const selected=new Set(r.landscapes.map(l=>l.kind)),style=r.islandStyle!,field=generatorField(p.world.terrain!,{width:r.width,length:r.length,seed:r.seed,seaLevel:p.world.seaLevel},()=>0),
  waters=Object.values(p.libraries.water),size=p.world.chunkSizeM,cell=size/16,minor=Math.min(r.width,r.length),wind=(shapeSeed(r.seed,'natural-wind')%628)/100,
  shelves=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.filter(f=>f.kind==='plateau').map(f=>compilePolygon(f.kind==='plateau'?f.polygon:[])):[];
 const height=Object.values(p.chunks).some(c=>c.terrainEdits.length)?projectGeography(p).source:field.height;
 const sitePolygons=Object.values(p.libraries.terrainPlans??{}).flatMap(plan=>plan.sites.filter(s=>s.kind!=='lake').map(site=>{const f=p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===site.featureId):undefined;return {site,inside:f?.kind==='plateau'?compilePolygon(f.polygon):()=>-1};}));
 const recipes=Object.values(p.libraries.regions??{}).filter(q=>q.id.startsWith('composition-')&&!skip.has(q.id));
 for(const [id,chunk]of Object.entries(p.chunks)){
  const owners=recipes.filter(q=>q.generated?.masks[id]?.biome);if(!owners.length)continue;
  const [cx,cz]=id.split(':').map(Number),ox=p.world.bounds.minX+cx*size,oz=p.world.bounds.minZ+cz*size,heights=new Float64Array(18*18);
  if(rects&&!rects.some(r=>ox<r.maxX&&ox+size>r.minX&&oz<r.maxZ&&oz+size>r.minZ))continue;
  for(let z=0;z<18;z++)for(let x=0;x<18;x++)heights[z*18+x]=height(ox+(x-.5)*cell,oz+(z-.5)*cell);
  for(const owner of owners){
   const owned=owner.generated!.masks[id],layers:Partial<Record<MaskLayerId,string[]>>={},records:Partial<Record<MaskLayerId,string[]>>={};
   for(let i=0;i<256;i++){
    const old=owned.biome![i];if(old==='.'||chunk.layers?.biome?.[i]!==old)continue;
    const ix=i%16,iz=Math.floor(i/16),x=ox+(ix+.5)*cell,z=oz+(iz+.5)*cell,h=heights[(iz+1)*18+ix+1],
     dx=(heights[(iz+1)*18+ix+2]-heights[(iz+1)*18+ix])/(2*cell),dz=(heights[(iz+2)*18+ix+1]-heights[iz*18+ix+1])/(2*cell),slope=Math.hypot(dx,dz),
     coast=field.coast(x,z),waterDistance=Math.min(Infinity,...waters.map(w=>polylineDistance(w.points,x,z))),
     exposure=.5+.5*(dx*Math.cos(wind)+dz*Math.sin(wind))/(slope||1),noise=valueNoise(r.seed^0xc11a,x/(minor*.20),z/(minor*.20)),
     humid=.45+.23*noise+.18*(1-exposure)+.3*Math.exp(-waterDistance/180);
    let code='.';
    if(h>p.world.seaLevel&&coast>=0){
     code=selected.has('meadow')||selected.has('plain')?'m':selected.has('forest')?'f':selected.has('hills')?'s':'.';
     if(selected.has('forest')&&humid>.56&&slope<.75)code='f';
     if(selected.has('hills')&&slope>.12&&slope<.65&&humid<.65)code='s';
     if(selected.has('plateau')&&shelves.some(inside=>inside(x,z)>0)&&slope<.12)code='s';
     if(selected.has('mountain')&&h>Math.max(180,style.altitudeM*.58)&&(slope>.3||h>style.altitudeM*.83))code='n';
     if(selected.has('volcanic')&&style.volcanism==='active'&&field.volcanic(x,z)>.65&&h>style.altitudeM*.35)code='v';
     // Ancient volcanic geology can carry a forest; exposed rim rock is local.
     if(selected.has('volcanic')&&style.volcanism==='ancient'&&field.volcanic(x,z)>.8&&slope>.7)code='v';
     if(r.biomeMode==='custom'&&r.sequence.length){
      const preferred=r.sequence[Math.min(r.sequence.length-1,Math.floor((1-Math.min(1,h/style.altitudeM))*r.sequence.length))];
      if(preferred==='forest'&&slope<.75&&humid>.4)code='f';
      if((preferred==='plain'||preferred==='meadow')&&slope<.25)code='m';
      if(preferred==='hills'&&slope>.1&&slope<.65)code='s';
      if(preferred==='mountain'&&h>180&&slope>.3)code='n';
     }
     if(selected.has('marsh')&&h<35&&slope<.12&&waterDistance<Math.min(220,minor*.07))code='w';
     if(selected.has('coast')&&coast<Math.min(55,minor*.025))code='c';
    }
    const reservation=sitePolygons.find(s=>s.inside(x,z)>=0);if(reservation&&h>0)code=reservation.site.kind==='farm'?'m':'c';
    const material:Record<string,string>={m:'g',f:'f',s:'y',n:'r',v:'b',w:'m',c:'s','.':'.'},geology=code==='v'?'b':code==='n'?'r':code==='c'?'a':code==='.'?'.':'s',moisture=code==='.'?'.':code==='w'?'9':code==='v'?'2':String(Math.max(1,Math.min(8,Math.round(humid*8))));
    for(const [layer,value]of [['biome',code],['material',material[code]],['moisture',moisture],['geology',geology],...((p.world.generation?.compositionVersion??1)>=5||sitePolygons.length?[['occupation',reservation?(reservation.site.farmZoneId?'f':'p'):'.']]:[])] as [MaskLayerId,string][]){
     const before=owned[layer]?.[i]??'.',current=chunk.layers?.[layer]?.[i]??'.';
     if(current!=='.'&&(before==='.'||current!==before))continue;
     (layers[layer]??=Array.from(chunk.layers?.[layer]??EMPTY_MASK))[i]=value;
     (records[layer]??=Array.from(owned[layer]??EMPTY_MASK))[i]=value;
    }
   }
   for(const layer of Object.keys(layers) as MaskLayerId[]){(chunk.layers??={})[layer]=layers[layer]!.join('');owned[layer]=records[layer]!.join('');}
   for(const layer of Object.keys(owned) as MaskLayerId[])if(!/[^.]/.test(owned[layer]!))delete owned[layer];
   if(!Object.keys(owned).length)delete owner.generated!.masks[id];
  }
  for(const layer of Object.keys(chunk.layers??{}) as MaskLayerId[])if(!/[^.]/.test(chunk.layers![layer]!))delete chunk.layers![layer];
  if(chunk.layers&&!Object.keys(chunk.layers).length)delete chunk.layers;
 }
}
