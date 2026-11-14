/** World Production V1 — typed access to the generated asset registry (WP-1).
 * One catalogue for the three uses: manual placement (Studio library), landscape presets and
 * biotope generation. The registry is generated from the real GLB files
 * (`npm run generate:world-assets`) and validated by tests. */
import registryData from '../../assets/world-assets.json' with {type:'json'};
import type {AssetUsage,BiotopeId,AmenityId} from './asset-usage.ts';
import {lightFromPreset} from '../lighting/light-data.ts';
import type {LightComponent} from '../studio-core/types.ts';

export interface WorldAssetLod {level:number;file:string;bytes:number;sha256:string;triangles:number;vertices:number;bounds:{min:number[];max:number[]};materials:number;textures:number;vertexColors:boolean;animations:number}
export interface WorldAsset {
  id:string;label:string;group:string;source:string;sourceId:string;license:string;origin:string;
  artStatus:string;runtimeStatus:string;size:number[];pivot:{base:string;centred:boolean};lods:WorldAssetLod[];
  anchors?:unknown;usage?:AssetUsage;
}
export interface WorldAssetRegistry {format:string;version:string;totals:{assets:number;glbFiles:number;bytes:number;withUsage:number};assets:WorldAsset[];diagnostics:{severity:string;code:string;id:string;message:string}[]}
export const WORLD_ASSETS=registryData as unknown as WorldAssetRegistry;
const byId=new Map(WORLD_ASSETS.assets.map(a=>[a.id,a]));
export function worldAsset(id:string):WorldAsset|undefined{return byId.get(id);}
/** Assets usable by generators (usage table + at least one LOD). */
export function generatorAssets():WorldAsset[]{return WORLD_ASSETS.assets.filter(a=>a.usage);}
export function assetsForHabitat(h:BiotopeId|AmenityId):WorldAsset[]{return generatorAssets().filter(a=>a.usage!.habitats.includes(h));}
/** Height at scale 1 (m). */
export const assetHeight=(a:WorldAsset)=>a.size[1];
/** Placeable catalogue entries (Studio / compiler), legacy procedural ones excluded: LOD0 is
 * the reference file (`models/...glb`), other LODs are resolved from the registry by id. */
export interface PlaceableAssetEntry {id:string;name:string;category:string;type:'glb';license:string;file:string;source:string}
const CATEGORY_LABEL:Record<string,string>={trees:'Arbres',shrubs:'Arbustes',ground:'Petites plantes',deadwood:'Bois mort',hedges:'Haies',fences:'Clôtures',walls:'Murets',bridges:'Ponts',dock:'Ponton',buildings:'Bâtiments',boats:'Bateaux',legacy:'Historique'};
export const groupLabel=(group:string)=>CATEGORY_LABEL[group]??group;
export function placeableWorldAssets():PlaceableAssetEntry[]{
  return WORLD_ASSETS.assets.filter(a=>a.group!=='legacy'&&a.usage).map(a=>({id:a.id,name:a.label,category:groupLabel(a.group),type:'glb' as const,license:a.license,file:a.lods[0].file,source:`${a.origin} — ${a.source}#${a.sourceId}`}));
}
/** Logical collider of a registry asset from its usage (doc 42 §H3): buildings and walls block by
 * their footprint (slightly inset for eaves), props/rocks/hedges by their box, trees and the
 * world-tree landmark by their trunk only; boats, docks, ground flora: none. Written into the V3
 * source as a regular `Collider` component (editable, compiled like any authored collider). */
export function colliderFor(assetId:string):{type:'Collider';shape:'box';size:{x:number;y:number;z:number};layer:'solid'}|null{
  const a=worldAsset(assetId),u=a?.usage;if(!a||!u||u.collision==='none'||u.role==='dock'||u.role==='boat'||u.role==='ground')return null;
  const [sx,sy,sz]=a.size,r=(v:number)=>Math.round(v*100)/100;
  const trunk=u.collision==='trunk'||/tree/.test(assetId);
  if(trunk){const w=Math.max(.4,Math.min(sx,sz)*(assetId==='landmark.world_tree'?.16:.12));return {type:'Collider',shape:'box',size:{x:r(w),y:r(Math.min(sy,8)),z:r(w)},layer:'solid'};}
  const inset=u.collision==='footprint'?.88:.92;
  return {type:'Collider',shape:'box',size:{x:r(Math.max(.2,sx*inset)),y:r(Math.max(.3,sy)),z:r(Math.max(.2,sz*inset))},layer:'solid'};
}
/** Authored light of a registry asset (doc 42 §H4), written as a regular `Light` component:
 * street lamps glow at night, campfires flicker all the time, the inn and one house in two light
 * their door at night (front = −Z of the kit models). `key` makes the house choice deterministic. */
export function lightFor(assetId:string,key:string):LightComponent|null{
  const a=worldAsset(assetId);if(!a)return null;const [,sy,sz]=a.size;
  if(assetId==='structure.lamp_post')return lightFromPreset('warm-lantern',Math.round(sy*.9*100)/100);
  if(assetId==='structure.campfire')return lightFromPreset('flickering-fire',.9);
  const door=(preset:'fixed-lamp'|'warm-lantern')=>({...lightFromPreset(preset,2.4),offset:{x:0,y:2.4,z:-Math.round((sz/2+.6)*100)/100}});
  if(assetId==='architecture.inn')return door('warm-lantern');
  if(/^architecture\.(house|cottage|stone_house|farmhouse)/.test(assetId)){let h=2166136261;for(let i=0;i<key.length;i++)h=Math.imul(h^key.charCodeAt(i),16777619);return (h>>>0)%2===0?door('fixed-lamp'):null;}
  return null;
}
/** Indicative cost class for the Studio library (LOD0 triangles). */
export function costClass(a:WorldAsset):'léger'|'moyen'|'lourd'{const t=a.lods[0].triangles;return t<=200?'léger':t<=800?'moyen':'lourd';}
/** Registry diagnostics + structural checks (missing LOD, pivot, licence, weight). */
export function registryDiagnostics(){
  const out=[...WORLD_ASSETS.diagnostics];
  for(const a of WORLD_ASSETS.assets){
    if(!a.license)out.push({severity:'ERROR',code:'ASSET_LICENSE_MISSING',id:a.id,message:'Licence manquante'});
    if(a.usage?.instancing&&a.pivot.base==='above-ground')out.push({severity:'WARNING',code:'ASSET_PIVOT',id:a.id,message:`Pivot ${a.lods[0].bounds.min[1]} m sous la base du modèle : compensé à l’instanciation (GLB inchangé)`});
    for(let i=1;i<a.lods.length;i++)if(a.lods[i].triangles>a.lods[i-1].triangles)out.push({severity:'ERROR',code:'ASSET_LOD_INVALID',id:a.id,message:`LOD${a.lods[i].level} plus lourd que LOD${a.lods[i-1].level}`});
  }
  return out;
}
/** V3 asset definition of a registry asset (added to a project when it is first used). */
export function assetDefinitionFor(id:string):{id:string;name:string;type:'glb';file:string;license:string;source:string}|undefined{
  const entry=placeableWorldAssets().find(a=>a.id===id);return entry?{id:entry.id,name:entry.name,type:'glb',file:entry.file,license:entry.license,source:entry.source}:undefined;
}
/** LOD switch distances (m) of a placed registry asset: proportional to its size, benchmark knobs. */
export function lodDistances(a:WorldAsset):number[]{const r=Math.max(...a.size);return a.lods.map((_,i)=>i===0?0:Math.round((i===1?25:70)+r*(i===1?6:14)));}
/** Vegetation exclusion radius of a placed object (m), or null when it excludes nothing.
 * Legacy procedural buildings keep their historical 6 m; registry buildings and structures use
 * their measured footprint plus a small margin (doors, eaves, paths around). */
export function exclusionRadius(assetId:string,scale=1):number|null{
  const a=worldAsset(assetId);
  if(!a||a.group==='legacy')return assetId.startsWith('architecture.')?6*scale:null;
  const u=a.usage;if(!u)return null;
  if(u.role==='building'||u.role==='landmark')return (u.footprintM+2)*scale;
  if(u.role==='bridge'||u.role==='dock'||u.role==='wall'||u.role==='counter'||u.role==='rock'||u.role==='prop')return (u.footprintM+.6)*scale;
  return null;
}
/** Vertical correction applied to instanced copies so that the model base touches the ground
 * (some bush GLBs start 0.1–0.2 m above their pivot). The GLB files stay untouched. */
export function groundOffset(a:WorldAsset):number{return a.usage?.instancing&&a.lods[0].bounds.min[1]>0?-a.lods[0].bounds.min[1]:0;}
