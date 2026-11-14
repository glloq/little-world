/** World Production V1 — applying, regenerating and removing landscape presets (WP-4).
 * Every operation mutates a project DRAFT (call it inside one StudioSession.change /
 * editDocument: one undoable transaction) or a generator script's project.
 * Manual-priority policy (explicit, doc 41 § 5):
 *  1. An element/mask cell produced by an instance is "owned" while its current canonical
 *     fingerprint equals the one recorded at generation time.
 *  2. Owned content may be replaced or removed by a regeneration.
 *  3. Modified content is NEVER overwritten silently: it is reported as a conflict and detached
 *     (handed over to the author) unless `overwrite: true` was explicitly confirmed.
 *  4. Content deleted by the author is not recreated unless `overwrite: true`.
 *  5. Mask cells already corrected by the author ('.' excepted) are never repainted. */
import type {ProjectDocument,EntityDefinitionV3,ActivityZoneV3} from '../studio-core/types.ts';
import type {WaterBody,PathDefinition} from '../world-data.ts';
import type {ReliefFeature} from '../geography/archipelago.ts';
import {MASK_GRID,cellCenter,isEmptyMask,setMaskCell,categoryById,type MaskLayerId} from '../geography/layers.ts';
import {classifyPoint,type GeoSample} from '../geography/classify.ts';
import {putEntity,removeEntity,putWater,removeWater,putPath,removePath,ensureChunk} from '../studio-core/source.ts';
import {chunkAt} from '../studio-core/schema.ts';
import {putZone,removeZone} from '../studio-core/zones.ts';
import {sectorGrid} from '../studio-core/geo-edits.ts';
import {projectGeography} from '../studio-core/geo-context.ts';
import {compileWaterNetwork} from '../water/profile.ts';
import {hash2} from '../geography/noise.ts';
import {ARCHIPELAGO_LIMITS} from '../geography/archipelago-params.ts';
import {assetDefinitionFor,colliderFor,lightFor} from './registry.ts';
import type {LandscapeRegion} from './biotopes.ts';
import {LANDSCAPE_PRESETS,frameOf,normalizeParams,type ContentEnv,type LandscapeContent} from './landscape-presets.ts';
import {emptyGenerated,fingerprint,validateLandscape,type LandscapeGenerated,type LandscapeInstanceV1,type LandscapePresetId} from './landscape-schema.ts';

export interface LandscapeReport {
  instanceId:string;added:number;updated:number;removed:number;unchanged:number;
  /** Author-modified content kept (and detached) instead of being overwritten. */
  conflicts:{kind:string;id:string}[];
  /** Author-deleted content not recreated. */
  respectedDeletions:{kind:string;id:string}[];
  maskCells:{painted:number;erased:number;protected:number;/** Cells left to the generator (same value). */alreadyGenerated:number};
  diagnostics:string[];chunks:string[];
}
type Kind='features'|'water'|'paths'|'entities'|'zones'|LibKind;
type LibKind='behaviors'|'dialogues'|'objectives'|'items'|'interactions';
const LIB_KINDS:LibKind[]=['behaviors','dialogues','objectives','items','interactions'];
const ALL_KINDS:Kind[]=['features','water','paths','entities','zones',...LIB_KINDS];
const libraryOf=(p:ProjectDocument,kind:LibKind)=>(p.libraries[kind]??{}) as Record<string,unknown>;
const KIND_LABEL:Record<Kind,string>={features:'relief',water:'eau',paths:'chemin',entities:'objet',zones:'zone',behaviors:'routine',dialogues:'dialogue',objectives:'quête',items:'objet d’inventaire',interactions:'interaction'};
/** Current state of an element (undefined = absent) — the thing fingerprints are taken of. */
function current(p:ProjectDocument,kind:Kind,id:string):unknown{
  switch(kind){
    case 'features':return p.world.terrain?.kind==='archipelago'?p.world.terrain.archipelago.features.find(f=>f.id===id):undefined;
    case 'water':return p.libraries.water[id];case 'paths':return p.libraries.paths[id];case 'zones':return p.libraries.zones?.[id];
    case 'entities':{const e=p.entityIndex[id];return e?p.chunks[e.ownerChunkId]?.entities[id]:undefined;}
    default:return libraryOf(p,kind)[id];
  }
}
function remove(p:ProjectDocument,kind:Kind,id:string){
  switch(kind){
    case 'features':if(p.world.terrain?.kind==='archipelago'){const a=p.world.terrain.archipelago;p.world.terrain={...p.world.terrain,archipelago:{...a,features:a.features.filter(f=>f.id!==id)}};}break;
    case 'water':removeWater(p,id);break;case 'paths':removePath(p,id);break;case 'zones':removeZone(p,id);break;case 'entities':removeEntity(p,id);break;
    default:{const next={...libraryOf(p,kind)};delete next[id];(p.libraries as unknown as Record<string,unknown>)[kind]=next;}
  }
}
function put(p:ProjectDocument,kind:Kind,value:unknown){
  switch(kind){
    case 'features':{if(p.world.terrain?.kind!=='archipelago')return;const a=p.world.terrain.archipelago,f=value as ReliefFeature;p.world.terrain={...p.world.terrain,archipelago:{...a,features:[...a.features.filter(x=>x.id!==f.id),structuredClone(f)]}};break;}
    case 'water':putWater(p,value as WaterBody);break;case 'paths':putPath(p,value as PathDefinition);break;case 'zones':putZone(p,value as ActivityZoneV3);break;
    case 'entities':{const e=value as EntityDefinitionV3,asset=e.components.Visual?assetDefinitionFor(e.components.Visual.assetId):undefined;if(asset&&!p.assets[asset.id])p.assets={...p.assets,[asset.id]:asset};putEntity(p,e);break;}
    default:{const v=value as {id:string};(p.libraries as unknown as Record<string,unknown>)[kind]={...libraryOf(p,kind),[v.id]:structuredClone(v)};}
  }
}
/** Sectors an instance may touch (footprint + margin): hydrate them before editing. */
export function landscapeChunkIds(p:ProjectDocument,i:Pick<LandscapeInstanceV1,'center'|'width'|'length'|'rotation'>,margin=40):string[]{
  const r=Math.hypot(i.width,i.length)/2+margin,g=sectorGrid(p),out:string[]=[];
  const c0=Math.max(0,Math.floor((i.center.x-r-g.minX)/g.chunkSizeM)),c1=Math.min(g.columns-1,Math.floor((i.center.x+r-g.minX)/g.chunkSizeM));
  const r0=Math.max(0,Math.floor((i.center.z-r-g.minZ)/g.chunkSizeM)),r1=Math.min(g.rows-1,Math.floor((i.center.z+r-g.minZ)/g.chunkSizeM));
  for(let z=r0;z<=r1;z++)for(let x=c0;x<=c1;x++)out.push(`${x}:${z}`);return out;
}
/** Dressing regions of every landscape of a library (runtime, Studio map, compiler). */
export function landscapeRegions(landscapes:Record<string,LandscapeInstanceV1>|undefined):LandscapeRegion[]{
  const out:LandscapeRegion[]=[];
  for(const inst of Object.values(landscapes??{}).sort((a,b)=>a.id.localeCompare(b.id))){
    const preset=LANDSCAPE_PRESETS[inst.presetId];if(!preset)continue;
    preset.regions(frameOf(inst),normalizeParams(inst.presetId,inst.params)).forEach((r,k)=>out.push({...r,id:`${inst.id}#${k}`}));
  }
  return out;
}
export function newLandscape(p:ProjectDocument,presetId:LandscapePresetId,center:{x:number;z:number},options:{id?:string;name?:string;seed?:number;width?:number;length?:number;rotation?:number;params?:Record<string,number|boolean>}={}):LandscapeInstanceV1{
  const preset=LANDSCAPE_PRESETS[presetId],existing=p.libraries.landscapes??{};
  let n=1;while(existing[`ls-${presetId}-${n}`])n++;
  return {id:options.id??`ls-${presetId}-${n}`,presetId,presetVersion:preset.version,name:options.name??`${preset.label} ${n}`,seed:(options.seed??(p.world.seed*31+n*7919))>>>0,
    center:{x:Math.round(center.x),z:Math.round(center.z)},width:options.width??preset.defaultSize[0],length:options.length??preset.defaultSize[1],rotation:options.rotation??0,
    params:normalizeParams(presetId,options.params??{})};
}
/** Apply (first time) or regenerate an instance in a draft. */
export function applyLandscape(draft:ProjectDocument,input:LandscapeInstanceV1,options:{overwrite?:boolean}={}):LandscapeReport{
  const b=draft.world.bounds,inst=validateLandscape(structuredClone({...input,params:normalizeParams(input.presetId,input.params)}),b),preset=LANDSCAPE_PRESETS[inst.presetId];
  const previous:LandscapeGenerated=draft.libraries.landscapes?.[inst.id]?.generated??inst.generated??emptyGenerated();
  const report:LandscapeReport={instanceId:inst.id,added:0,updated:0,removed:0,unchanged:0,conflicts:[],respectedDeletions:[],maskCells:{painted:0,erased:0,protected:0,alreadyGenerated:0},diagnostics:[],chunks:[]};
  const overwrite=!!options.overwrite,next:LandscapeGenerated={...emptyGenerated(),revision:previous.revision+1};
  const nextOf=(kind:Kind)=>(next[kind]??(next[kind]={})) as Record<string,string>;
  // Phase 1 — release owned content of the previous generation (modified content is detached).
  const owned=new Map<Kind,Set<string>>(),blocked=new Set<string>();
  for(const kind of ALL_KINDS){
    owned.set(kind,new Set());
    for(const [id,hash]of Object.entries(previous[kind]??{})){
      const now=current(draft,kind,id);
      if(now===undefined){if(!overwrite){report.respectedDeletions.push({kind:KIND_LABEL[kind],id});blocked.add(kind+':'+id);}continue;}
      if(fingerprint(now)!==hash&&!overwrite){report.conflicts.push({kind:KIND_LABEL[kind],id});blocked.add(kind+':'+id);continue;}
      // A library entry still referenced by content kept for the author is not removed.
      if(LIB_KINDS.includes(kind as LibKind)&&referencedElsewhere(draft,id,inst.id)){blocked.add(kind+':'+id);continue;}
      remove(draft,kind,id);owned.get(kind)!.add(id);
    }
  }
  const maskCode=(chunk:string,layer:MaskLayerId,i:number)=>draft.chunks[chunk]?.layers?.[layer]?.[i]??'.';
  const writeCell=(chunk:string,layer:MaskLayerId,i:number,code:string)=>{const c=draft.chunks[chunk]??ensureChunk(draft,chunk);const layers={...(c.layers??{})},mask=setMaskCell(layers[layer],i,code);if(isEmptyMask(mask))delete layers[layer];else layers[layer]=mask;if(Object.keys(layers).length)c.layers=layers;else delete c.layers;};
  const previousCells=new Map<string,string>();
  for(const [chunk,layers]of Object.entries(previous.masks))for(const [layer,mask]of Object.entries(layers))for(let i=0;i<mask!.length;i++)if(mask![i]!=='.')previousCells.set(`${chunk}|${layer}|${i}`,mask![i]);
  // Phase 2 — relief shapes (archipelago generator only).
  const frame=frameOf(inst),params=inst.params;
  const before=projectGeography(draft);
  const features=preset.relief(frame,params,before.ctx.height,draft.world.seaLevel).map(({key,...f})=>({...f,id:`${inst.id}.${key}`}) as ReliefFeature);
  if(features.length){
    if(draft.world.terrain?.kind!=='archipelago')report.diagnostics.push('Relief non appliqué : le monde n’utilise pas le générateur archipel (convertir l’île depuis la carte globale).');
    else for(const f of features){
      if(blocked.has('features:'+f.id))continue;
      const list=draft.world.terrain.archipelago.features;if(list.length>=ARCHIPELAGO_LIMITS.features){report.diagnostics.push(`Relief ${f.id} non ajouté : ${ARCHIPELAGO_LIMITS.features} formes au maximum.`);continue;}
      const clamped=clampFeature(f,b);put(draft,'features',clamped);next.features[f.id]=fingerprint(current(draft,'features',f.id));
      owned.get('features')!.delete(f.id)?report.updated++:report.added++;
    }
  }
  // Phase 3 — content on the new relief.
  const after=projectGeography(draft),inWorld=(x:number,z:number)=>x>b.minX+1&&x<b.maxX-1&&z>b.minZ+1&&z<b.maxZ-1;
  const env:ContentEnv={...frame,height:after.ctx.height,seaLevel:draft.world.seaLevel,inWorld,water:(x,z)=>after.ctx.water(x,z,after.ctx.height(x,z)),rand:k=>(hash2(frame.seed,k,0x5eed)+1)/2,ref:key=>`${inst.id}.${key}`};
  const content:LandscapeContent=preset.content(env,params);report.diagnostics.push(...content.diagnostics);
  const add=(kind:Kind,id:string,value:unknown)=>{
    if(blocked.has(kind+':'+id))return;
    if(current(draft,kind,id)!==undefined){report.conflicts.push({kind:KIND_LABEL[kind],id});return;} // id taken by author content
    try{put(draft,kind,value);}catch(error){report.diagnostics.push(`${KIND_LABEL[kind]} ${id} ignoré : ${error instanceof Error?error.message:String(error)}`);return;}
    nextOf(kind)[id]=fingerprint(current(draft,kind,id));owned.get(kind)!.delete(id)?report.updated++:report.added++;
  };
  const clampPoint=(q:{x:number;z:number})=>({x:Math.max(b.minX+1,Math.min(b.maxX-1,q.x)),z:Math.max(b.minZ+1,Math.min(b.maxZ-1,q.z))});
  // WATER coherence: a generated river must pass the same hydrographic compilation as the
  // compiler (descending profile, no relief crossing, consistent falls). Try the reverse
  // direction (rivers drawn upstream), then without falls; otherwise do not create it.
  for(const {key,...w}of content.water){
    const id=`${inst.id}.${key}`,base:WaterBody={...w,id,points:w.points.map(clampPoint)} as WaterBody,others=Object.values(draft.libraries.water).filter(o=>o.id!==id) as WaterBody[];
    const errors=(cand:WaterBody)=>compileWaterNetwork([...others,cand],after.source,draft.world.seaLevel).at(-1)!.diagnostics.filter(d=>d.severity==='ERROR');
    const reversed=(cand:WaterBody):WaterBody=>{const {falls:_f,...rest}=cand;return {...rest,points:[...cand.points].reverse()};};
    const candidates=base.kind==='lake'?[base]:[base,reversed(base),...(base.falls?[{...base,falls:undefined}]:[])];let chosen:WaterBody|null=null,last:string[]=[];
    for(const cand of candidates){const e=errors(cand);if(!e.length){chosen=cand;break;}if(!last.length)last=e.map(d=>d.message);} // report the error of the authored direction
    if(!chosen){report.diagnostics.push(`Eau ${id} non créée (incohérence hydrographique) : ${last[0]}`);continue;}
    if(chosen!==base)report.diagnostics.push(`Eau ${id} : tracé ${chosen.points[0]===base.points[0]?'sans cascade':'inversé (écoulement vers l’aval)'} pour rester cohérent.`);
    const {falls,...clean}=chosen;add('water',id,falls?chosen:clean);
  }
  for(const {key,...path}of content.paths){const id=`${inst.id}.${key}`;add('paths',id,{...path,id,points:path.points.map(clampPoint)});}
  for(const {key,...z}of content.zones){const id=`${inst.id}.${key}`;add('zones',id,{...z,id,polygon:z.polygon.map(clampPoint)});}
  for(const kind of LIB_KINDS)for(const {key,value}of content.libraries?.[kind]??[]){const id=key.startsWith('@')?key.slice(1):`${inst.id}.${key}`;add(kind,id,{...value,id});}
  for(const e of content.entities){
    if(!inWorld(e.x,e.z))continue;const id=`${inst.id}.${e.key}`,asset=assetDefinitionFor(e.assetId);
    if(!e.character&&!asset&&!draft.assets[e.assetId]){report.diagnostics.push(`Asset absent du registre : ${e.assetId}`);continue;}
    const role=e.assetId.startsWith('architecture.')?'building':'prop',s=e.scale3??[e.scale??1,e.scale??1,e.scale??1];
    const transform={type:'Transform' as const,position:{x:e.x,y:e.y??0,z:e.z},rotation:{x:0,y:Math.sin(e.rotation/2),z:0,w:Math.cos(e.rotation/2)},scale:{x:s[0],y:s[1],z:s[2]}};
    const state={...(e.state?{State:{type:'State' as const,initial:{...e.state}}}:{}),
      ...(e.interact?{Interactable:{type:'Interactable' as const,prompt:e.interact.prompt,range:e.interact.range,interactionIds:e.interact.interactionKeys.map(k=>`${inst.id}.${k}`)},
        ...(e.interact.persist.length?{Persistence:{type:'Persistence' as const,fields:[...e.interact.persist]}}:{})}:{})};
    if(e.character){const c=e.character,behaviorId=`${inst.id}.${c.behaviorKey}`;
      add('entities',id,{id,name:e.name,kind:'character',ownerChunkId:chunkAt(draft.world,e.x,e.z),components:{Transform:transform,Character:{type:'Character',species:c.species,rigId:c.species==='hamster'?'hamster-rigid':'squirrel-rigid',appearance:{...c.appearance}},
        Navigation:{type:'Navigation',behaviorId,speed:c.speed,radius:c.radius},BehaviorRef:{type:'BehaviorRef',behaviorId},...(c.dialogueKeys.length?{DialogueActor:{type:'DialogueActor',dialogueIds:c.dialogueKeys.map(k=>`${inst.id}.${k}`)}}:{}),...state}} satisfies EntityDefinitionV3);continue;}
    const collider=colliderFor(e.assetId),light=lightFor(e.assetId,id);
    add('entities',id,{id,name:e.name,kind:role,ownerChunkId:chunkAt(draft.world,e.x,e.z),components:{Transform:transform,Visual:{type:'Visual',assetId:e.assetId},...state,...(collider?{Collider:collider}:{}),...(light?{Light:light}:{})}} satisfies EntityDefinitionV3);
  }
  // Phase 4 — mask corrections, cell by cell, author corrections first.
  const g=sectorGrid(draft),touched=new Set<string>();
  const painted=new Map<string,string>();
  for(const chunk of landscapeChunkIds(draft,inst,0)){
    for(let i=0;i<MASK_GRID*MASK_GRID;i++){
      const c=cellCenter(g,chunk,i),l=frame.toLocal(c.x,c.z);
      if(Math.abs(l.u)>inst.width/2||Math.abs(l.v)>inst.length/2)continue;
      for(const rule of content.masks)if(rule.test(l.u,l.v,c.x,c.z))painted.set(`${chunk}|${rule.layer}|${i}`,rule.code);
    }
  }
  // A correction equal to what the Geography Engine already computes is not stored (no duplicated
  // classification, fewer sector packages): only real differences become mask cells.
  const samples=new Map<string,GeoSample>();
  const generated=(chunk:string,i:number,layer:MaskLayerId):string=>{
    const k=chunk+'|'+i;let s=samples.get(k);if(!s){const c=cellCenter(g,chunk,i);s=classifyPoint(after.ctx,c.x,c.z);samples.set(k,s);}
    if(layer==='moisture')return String(Math.round(s.moisture*9));
    return categoryById(layer,s[layer] as string)?.code??'.';
  };
  for(const [key,code]of painted){
    const [chunk,layer,index]=key.split('|'),i=Number(index),now=maskCode(chunk,layer as MaskLayerId,i),mine=previousCells.get(key);
    if(now!=='.'&&now!==mine&&!overwrite){report.maskCells.protected++;continue;}
    if(now==='.'&&generated(chunk,i,layer as MaskLayerId)===code){report.maskCells.alreadyGenerated++;continue;}
    if(now!==code){writeCell(chunk,layer as MaskLayerId,i,code);touched.add(chunk);}
    report.maskCells.painted++;
    const rec=next.masks[chunk]??(next.masks[chunk]={});rec[layer as MaskLayerId]=setMaskCell(rec[layer as MaskLayerId],i,code);
  }
  for(const [key,code]of previousCells){
    if(painted.has(key))continue;const [chunk,layer,index]=key.split('|'),i=Number(index);
    if(maskCode(chunk,layer as MaskLayerId,i)===code){writeCell(chunk,layer as MaskLayerId,i,'.');touched.add(chunk);report.maskCells.erased++;}
  }
  // Phase 5 — what was owned and not regenerated is now removed for good; record the instance.
  for(const ids of owned.values())report.removed+=ids.size;
  const {generated:_,...rest}=inst;
  draft.libraries.landscapes={...(draft.libraries.landscapes??{}),[inst.id]:{...rest,generated:next}};
  report.chunks=[...new Set([...touched,...landscapeChunkIds(draft,inst)])];
  return report;
}
/** Remove an instance and the content it still owns (modified content is detached). */
export function removeLandscape(draft:ProjectDocument,id:string,options:{overwrite?:boolean}={}):LandscapeReport{
  const inst=draft.libraries.landscapes?.[id];
  const report:LandscapeReport={instanceId:id,added:0,updated:0,removed:0,unchanged:0,conflicts:[],respectedDeletions:[],maskCells:{painted:0,erased:0,protected:0,alreadyGenerated:0},diagnostics:[],chunks:[]};
  if(!inst)return report;const g=inst.generated??emptyGenerated();
  for(const kind of ALL_KINDS)for(const [eid,hash]of Object.entries(g[kind]??{})){
    const now=current(draft,kind,eid);if(now===undefined)continue;
    if(fingerprint(now)!==hash&&!options.overwrite){report.conflicts.push({kind:KIND_LABEL[kind],id:eid});continue;}
    if(LIB_KINDS.includes(kind as LibKind)&&referencedElsewhere(draft,eid,id))continue;
    remove(draft,kind,eid);report.removed++;
  }
  for(const [chunk,layers]of Object.entries(g.masks))for(const [layer,mask]of Object.entries(layers)){
    const c=draft.chunks[chunk];if(!c)continue;let m=c.layers?.[layer as MaskLayerId];if(!m)continue;
    for(let i=0;i<mask!.length;i++)if(mask![i]!=='.'&&m[i]===mask![i]){m=setMaskCell(m,i,'.');report.maskCells.erased++;}
    const next={...(c.layers??{})};if(isEmptyMask(m))delete next[layer as MaskLayerId];else next[layer as MaskLayerId]=m;if(Object.keys(next).length)c.layers=next;else delete c.layers;
  }
  const rest={...draft.libraries.landscapes};delete rest[id];draft.libraries.landscapes=rest;
  report.chunks=landscapeChunkIds(draft,inst);return report;
}
/** Dry run on a copy: counts for the Studio preview (nothing is modified). */
export function previewLandscape(p:ProjectDocument,inst:LandscapeInstanceV1,options:{overwrite?:boolean}={}):LandscapeReport{
  const copy=structuredClone(p);return applyLandscape(copy,inst,options);
}
function clampFeature(f:ReliefFeature,b:{minX:number;maxX:number;minZ:number;maxZ:number}):ReliefFeature{
  const cx=(v:number)=>Math.max(b.minX,Math.min(b.maxX,v)),cz=(v:number)=>Math.max(b.minZ,Math.min(b.maxZ,v)),pt=(q:{x:number;z:number})=>({x:cx(q.x),z:cz(q.z)});
  if('points'in f)return {...f,points:f.points.map(pt)};if('polygon'in f)return {...f,polygon:f.polygon.map(pt)};return {...f,x:cx(f.x),z:cz(f.z)};
}
/** True when an id is mentioned by entities or libraries that do not belong to the instance
 * (content detached for the author, or other authored data): such library entries are kept. */
function referencedElsewhere(p:ProjectDocument,id:string,instanceId:string):boolean{
  const needle=JSON.stringify(id);
  for(const c of Object.values(p.chunks))for(const e of Object.values(c.entities))if(!e.id.startsWith(instanceId+'.')&&JSON.stringify(e.components).includes(needle))return true;
  for(const [name,lib]of Object.entries(p.libraries)){if(name==='landscapes')continue;for(const [k,v]of Object.entries(lib??{}))if(k!==id&&!k.startsWith(instanceId+'.')&&JSON.stringify(v).includes(needle))return true;}
  return false;
}
