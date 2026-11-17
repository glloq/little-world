/** Stepped-island biomes follow actual shelf heights, rock faces and watercourses.
 * Update native owned cells only; manual cells remain protected on regeneration. */
import type {ProjectDocument} from './types.ts';
import {generatorField} from '../terrain-generator.ts';
import {polylineDistance} from '../geography/archipelago.ts';
import {EMPTY_MASK,setMaskCell,type MaskLayerId} from '../geography/layers.ts';
export function alignSteppedBiomes(p:ProjectDocument,skip:ReadonlySet<string>=new Set()):void{
 const r=p.world.generation;if(r?.compositionVersion!==3||r.biomeMode!=='automatic')return;
 const selected=new Set(r.landscapes.map(l=>l.kind)),field=generatorField(p.world.terrain!,{width:r.width,length:r.length,seed:r.seed,seaLevel:p.world.seaLevel},()=>0),
  waters=Object.values(p.libraries.water).filter(w=>w.kind!=='lake'),materials:Record<string,string>={n:'r',f:'f',m:'g',w:'m',c:'s',v:'b'},size=p.world.chunkSizeM,cell=size/16;
 for(const [id,chunk]of Object.entries(p.chunks)){
  const owners=Object.values(p.libraries.regions??{}).filter(q=>q.id.startsWith('composition-')&&!skip.has(q.id)&&q.generated?.masks[id]?.biome);
  if(!owners.length)continue;
  const [cx,cz]=id.split(':').map(Number),ox=p.world.bounds.minX+cx*size,oz=p.world.bounds.minZ+cz*size,heights=new Float64Array(18*18);
  for(let z=0;z<18;z++)for(let x=0;x<18;x++)heights[z*18+x]=field.height(ox+(x-.5)*cell,oz+(z-.5)*cell);
  for(const owner of owners){
   const owned=owner.generated!.masks[id],wetReach=Math.min(350,Math.max(80,Math.min(r.width,r.length)*.085));
   for(let i=0;i<256;i++){
    const old=owned.biome![i];if(old==='.'||chunk.layers?.biome?.[i]!==old)continue;
    const ix=i%16,iz=Math.floor(i/16),x=ox+(ix+.5)*cell,z=oz+(iz+.5)*cell,h=heights[(iz+1)*18+ix+1],
     slope=Math.hypot(heights[(iz+1)*18+ix+2]-heights[(iz+1)*18+ix],heights[(iz+2)*18+ix+1]-heights[iz*18+ix+1])/(2*cell);
    let code=old;
    if(selected.has('volcanic')&&field.volcanic(x,z)>.35)code='v';
    else if(selected.has('coast')&&field.coast(x,z)<60)code='c';
    else if(selected.has('mountain')&&(slope>.7||h>450))code='n';
    else if(selected.has('forest')&&h>150)code='f';
    else if(h<=150&&(selected.has('meadow')||selected.has('plain'))){
     code='m';
     if(selected.has('marsh')&&h<40&&waters.some(w=>polylineDistance(w.points,x,z)<wetReach))code='w';
    }
    const write=(layer:MaskLayerId,value:string)=>{
     const before=owned[layer]?.[i]??'.',current=chunk.layers?.[layer]?.[i]??'.';
     if(current!=='.'&&(before==='.'||current!==before))return;
     (chunk.layers??={})[layer]=setMaskCell(chunk.layers?.[layer]??EMPTY_MASK,i,value);
     owned[layer]=setMaskCell(owned[layer]??EMPTY_MASK,i,value);
    };
    if(code===old)continue;
    write('biome',code);write('material',materials[code]);
    if(code==='w')write('moisture','9');if(code==='v'){write('moisture','2');write('geology','b');}if(code==='n')write('geology','r');
   }
  }
 }
}
