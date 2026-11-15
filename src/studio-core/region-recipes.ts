/** Region authoring V1: polygonal geography + deterministic ecosystem recipes.
 * V3 sector masks remain authoritative; recipes are only editable prescriptions and
 * cell ownership records, never parallel runtime biome maps or per-tree entities. */
import type {ProjectDocument} from './types.ts';
import type {ReliefFeature} from '../geography/archipelago.ts';
import {compilePolygon} from '../geography/archipelago.ts';
import {hash2} from '../geography/noise.ts';
import {EMPTY_MASK,MASK_GRID,setMaskCell,type MaskLayerId} from '../geography/layers.ts';
import {regionCells,paintMask,protectedCells,regionChunkIds,type Region} from './geo-edits.ts';
import {fingerprint} from '../world-production/landscape-schema.ts';
import {ARCHIPELAGO_LIMITS} from '../geography/archipelago-params.ts';

import {REGION_PRESETS,validateRegionRecipe,RECORD_LIMIT,MAX_REGIONS,DEFAULT_REGION_VEGETATION,type RegionRecipeV1,type RegionPreset,type RegionReport,type RegionGenerated} from './region-schema.ts';
export {REGION_PRESETS,validateRegionRecipe} from './region-schema.ts';
export type {RegionRecipeV1,RegionPreset,RegionReport,RegionGenerated} from './region-schema.ts';
export function newRegion(p:ProjectDocument,options:Partial<RegionRecipeV1>={}):RegionRecipeV1 {
 const b=p.world.bounds,cx=(b.minX+b.maxX)/2,cz=(b.minZ+b.maxZ)/2;
 let i=1;while(p.libraries.regions?.['region-'+i])i++;
 const half=Math.min(80,(b.maxX-b.minX)/5,(b.maxZ-b.minZ)/5);
 return {id:'region-'+i,version:1,name:'Nouvelle région '+i,
 points:[{x:cx-half,z:cz-half},{x:cx+half,z:cz-half},{x:cx+half,z:cz+half},{x:cx-half,z:cz+half}],
 preset:'forest',seed:(p.world.seed+i*7919)>>>0,coverage:100,transitionM:24,
 vegetation:{...DEFAULT_REGION_VEGETATION},
 relief:'none',heightM:100,edgeM:25,...options};
}
function pointsRegion(v:RegionRecipeV1):Region{return {kind:'polygon',points:v.points};}
function featureId(id:string){return id+'.plateau';}
function getFeature(p:ProjectDocument,id:string){return p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(x=>x.id===featureId(id)):undefined;}
function updateFeature(p:ProjectDocument,original:RegionRecipeV1|undefined,next:RegionRecipeV1|null,report:RegionReport):string|undefined{
 const previous=original?.generated?.featureHash,feature=getFeature(p,original?.id??next!.id),generator=p.world.terrain;
 const own=!!feature&&!!previous&&fingerprint(feature)===previous;
 if(feature&&!own){report.feature='kept';report.warnings.push('Relief modifié à la main : conservé');return;}
 if(generator?.kind!=='archipelago'){
  if(next?.relief==='plateau')report.warnings.push('Relief polygonal : nécessite le générateur archipel');
  return;
 }
 let features=generator.archipelago.features.filter(x=>!own||x.id!==featureId(original!.id));
 if(next?.relief==='plateau'){
  if(features.length>=ARCHIPELAGO_LIMITS.features){report.warnings.push('Limite de 64 formes de relief atteinte');return;}
  const feature:ReliefFeature={id:featureId(next.id),kind:'plateau',polygon:next.points.map(x=>({...x})),heightM:next.heightM,edgeM:next.edgeM};
  features=[...features,feature];report.feature=own?'updated':'added';
  p.world.terrain={...generator,archipelago:{...generator.archipelago,features}};
  return fingerprint(feature);
 }
 if(own){p.world.terrain={...generator,archipelago:{...generator.archipelago,features}};report.feature='updated';}
}
const layerCodes=(preset:RegionPreset)=>REGION_PRESETS[preset].layers as Partial<Record<MaskLayerId,string>>;
export function regionAffectedChunks(p:ProjectDocument,region:RegionRecipeV1,previous=p.libraries.regions?.[region.id]):string[]{
 const ids=new Set(regionChunkIds(p,pointsRegion(region)));
 for(const id of Object.keys(previous?.generated?.masks??{}))ids.add(id);
 if(previous)for(const id of regionChunkIds(p,pointsRegion(previous)))ids.add(id);
 return [...ids];
}
function buildPlan(p:ProjectDocument,v:RegionRecipeV1){
 const cells=regionCells(p,pointsRegion(v)),grid=(id:string)=>id.split(':').map(Number);
 if(cells.size>RECORD_LIMIT)throw Error('Région trop grande : diviser en zones (256 secteurs maximum)');
 const signed=compilePolygon(v.points),plans=new Map<string,Map<MaskLayerId,Map<number,string>>>();
 let considered=0;
 for(const [chunkId,indexes]of cells){
  const coord=grid(chunkId),side=p.world.chunkSizeM/16;
  const map=new Map<MaskLayerId,Map<number,string>>();
  for(const index of indexes){
   const x=p.world.bounds.minX+coord[0]*p.world.chunkSizeM+((index%16)+.5)*side,z=p.world.bounds.minZ+coord[1]*p.world.chunkSizeM+(Math.floor(index/16)+.5)*side;
   const distance=signed(x,z);
   const transition=v.transitionM===0?1:Math.min(1,Math.max(0,distance/v.transitionM));
   const weight=(v.coverage/100)*transition*transition*(3-2*transition);
   if((hash2(v.seed,Math.floor(x/side),Math.floor(z/side))>>>0)/4294967296>=weight)continue;
   for(const [layer,code]of Object.entries(layerCodes(v.preset)) as [MaskLayerId,string][]){
    const dest=map.get(layer)??new Map<number,string>();dest.set(index,code);map.set(layer,dest);considered++;
   }
  }
  if(map.size)plans.set(chunkId,map);
 }
 return {plans,considered};
}
export function previewRegion(p:ProjectDocument,v:RegionRecipeV1):{sectors:number;cells:number;protected:number}{
 validateRegionRecipe(v,p.world.bounds,p.world.chunkSizeM);
 const {plans,considered}=buildPlan(p,v),old=p.libraries.regions?.[v.id]?.generated?.masks??{};
 let protectedCount=0;
 for(const [id,layers]of plans)for(const [layer,cells]of layers){
  const mask=p.chunks[id]?.layers?.[layer],own=old[id]?.[layer];
  for(const i of cells.keys())if(mask?.[i]!==undefined&&mask[i]!=='.'&&!(own?.[i]===mask[i]))protectedCount++;
 }
 return {sectors:plans.size,cells:considered,protected:protectedCount};
}
/** One atomic authoring command. Generated cells are cleared only if still equal to their
 * last recorded values. Manual masks and unrelated regions never get overwritten. */
export function applyRegion(p:ProjectDocument,input:RegionRecipeV1):RegionReport{
 const v=validateRegionRecipe(structuredClone(input),p.world.bounds,p.world.chunkSizeM),
 old=p.libraries.regions?.[v.id],before=old?.generated?.masks??{};
 const {plans}=buildPlan(p,v);
 const report:RegionReport={painted:0,cleared:0,protected:0,preserved:0,feature:'none',sectors:plans.size,warnings:[]};
 const next:Record<string,Partial<Record<MaskLayerId,string>>>={};
 // Release only unchanged previous generated cells.
 for(const [id,layers]of Object.entries(before))for(const [layer,owned]of Object.entries(layers) as [MaskLayerId,string][]){
  if(!p.chunks[id])throw Error('Charger le secteur possédant les cellules générées : '+id);
  const current=p.chunks[id].layers?.[layer];
  const toClear:number[]=[];
  for(let i=0;i<MASK_GRID*MASK_GRID;i++)if(owned[i]!=='.'){
   if(current?.[i]===owned[i])toClear.push(i);else report.preserved++;
  }
  if(toClear.length)report.cleared+=paintMask(p,layer,'.',new Map([[id,toClear]]));
 }
 for(const [id,layers]of plans)for(const [layer,cells]of layers){
  if(!p.chunks[id]&&p.chunkIndex[id])throw Error('Charger le secteur avant régénération : '+id);
  const available=protectedCells(p,layer,new Map([[id,[...cells.keys()]]])).get(id)??[];
  report.protected+=cells.size-available.length;
  if(!available.length)continue;
  const owned=next[id]??(next[id]={});
  let generated=owned[layer]??EMPTY_MASK;
  const grouped=new Map<string,number[]>();
  for(const index of available){
   const code=cells.get(index)!;generated=setMaskCell(generated,index,code);
   const list=grouped.get(code)??[];list.push(index);grouped.set(code,list);
  }
  for(const [code,indices]of grouped)report.painted+=paintMask(p,layer,code,new Map([[id,indices]]));
  owned[layer]=generated;
 }
 const hash=updateFeature(p,old,v,report);
 const generated:RegionGenerated={revision:(old?.generated?.revision??0)+1,masks:next,...(hash?{featureHash:hash}:{})};
 p.libraries.regions={...(p.libraries.regions??{}),[v.id]:{...v,generated}};
 if(Object.keys(p.libraries.regions).length>MAX_REGIONS)throw Error('Limite de 250 régions');
 return report;
}
export function removeRegion(p:ProjectDocument,id:string):RegionReport{
 const old=p.libraries.regions?.[id];if(!old)throw Error('Région inconnue');
 const report:RegionReport={painted:0,cleared:0,protected:0,preserved:0,feature:'none',sectors:0,warnings:[]};
 for(const [chunk,layers]of Object.entries(old.generated?.masks??{})){
  if(!p.chunks[chunk])throw Error('Charger les secteurs de la région avant suppression');
  for(const [layer,owned]of Object.entries(layers) as [MaskLayerId,string][]){
   const mask=p.chunks[chunk].layers?.[layer],indices:number[]=[];
   for(let i=0;i<MASK_GRID*MASK_GRID;i++)if(owned[i]!=='.'){if(mask?.[i]===owned[i])indices.push(i);else report.preserved++;}
   if(indices.length)report.cleared+=paintMask(p,layer,'.',new Map([[chunk,indices]]));
  }
 }
 updateFeature(p,old,null,report);
 const next={...(p.libraries.regions??{})};delete next[id];p.libraries.regions=next;
 return report;
}
