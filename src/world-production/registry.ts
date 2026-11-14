/** World Production V1 — typed access to the generated asset registry (WP-1).
 * One catalogue for the three uses: manual placement (Studio library), landscape presets and
 * biotope generation. The registry is generated from the real GLB files
 * (`npm run generate:world-assets`) and validated by tests. */
import registryData from '../../assets/world-assets.json' with {type:'json'};
import type {AssetUsage,BiotopeId,AmenityId} from './asset-usage.ts';

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
  return WORLD_ASSETS.assets.filter(a=>a.group!=='legacy'&&a.group!=='boats'&&a.usage).map(a=>({id:a.id,name:a.label,category:groupLabel(a.group),type:'glb' as const,license:a.license,file:a.lods[0].file,source:`${a.origin} — ${a.source}#${a.sourceId}`}));
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
