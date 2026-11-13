import type {AnyAudioDefinition} from '../audio/migrate.ts';
import type {EnvironmentDefinition} from '../environment/climate.ts';
/** Runtime output contracts are deliberately separate from Studio source schemas.
 * This compiler emits validated data descriptors, not baked GPU meshes/navmeshes.
 */
export interface CompiledBounds {minX:number;maxX:number;minZ:number;maxZ:number}
export interface CompiledChunkDescriptor {
  chunkId:string;
  cx:number;
  cz:number;
  bounds:CompiledBounds;
  url:string;
  hash:string;
  sourceHash:string;
  byteLength:number;
  entityIds:string[];
  dependencies:string[];
}
export interface CompiledEntityLocator {id:string;kind:string;ownerChunkId:string;chunkUrl:string}
export interface CompiledAssetDescriptor {
  id:string;
  type:'glb'|'procedural';
  file?:string;
  hash?:string;
  byteLength?:number;
  license:string;
}
export interface CompiledWorldManifest {
  audio?:AnyAudioDefinition;
  environment?:EnvironmentDefinition;
  schemaVersion:1;
  kind:'compiled-world';
  compilerVersion:string;
  projectId:string;
  worldId:string;
  sourceHash:string;
  buildVersion:string;
  bounds:CompiledBounds;
  seed:number;
  generatorVersion:string;
  seaLevel:number;
  chunkSizeM:number;
  /** Base relief generator, so sectors without an authored package keep their terrain. */
  terrain:import('../terrain-generator.ts').TerrainGeneratorDefinition;
  density:number;
  coordinateSystem:'meters-y-up';
  chunks:CompiledChunkDescriptor[];
  entityIndex:CompiledEntityLocator[];
  logic:{url:string;hash:string;byteLength:number};
  assets:CompiledAssetDescriptor[];
  capabilities:{
    bakedMeshes:false;
    bakedLOD:false;
    navigation:'source-descriptors';
    collisions:'source-descriptors';
    sparseSourceChunks:true;
  };
}
export interface CompilationDiagnostic {
  severity:'ERROR'|'WARNING'|'INFO';
  code:string;
  message:string;
  targetId?:string;
  chunkId?:string;
  locator?:string;
}
export interface CompileResult {
  manifest:CompiledWorldManifest;
  /** Relative local paths -> UTF-8 JSON. The caller decides archive/disk transport. */
  files:Record<string,string>;
  rebuiltChunkIds:string[];
  diagnostics:CompilationDiagnostic[];
}
export const COMPILER_VERSION='little-world-descriptors-6';

/** Stable object key order; array order remains semantically meaningful. */
export function canonicalJSON(value:unknown):string {
  if(value===null||typeof value!=='object'){
    if(typeof value==='number'&&!Number.isFinite(value))throw Error('Non-finite compiled value');
    const result=JSON.stringify(value);
    if(result===undefined)throw Error('Unsupported compiled value');
    return result;
  }
  if(Array.isArray(value))return '['+value.map(canonicalJSON).join(',')+']';
  const record=value as Record<string,unknown>;
  return '{'+Object.keys(record).filter(key=>record[key]!==undefined).sort().map(key=>JSON.stringify(key)+':'+canonicalJSON(record[key])).join(',')+'}';
}
export async function hashText(text:string):Promise<string>{
  const bytes=new TextEncoder().encode(text);
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
export const jsonFile=(value:unknown):string=>canonicalJSON(value)+'\n';
export const utf8Bytes=(value:string):number=>new TextEncoder().encode(value).byteLength;

export interface CompiledRuntimeEntity {
  id:string;kind:string;name:string;ownerChunkId:string;parentId?:string;
  components:import('../studio-core/types.ts').ComponentMap;
}
export interface CompiledChunkData {
  schemaVersion:1;kind:'compiled-chunk';worldId:string;chunkId:string;
  bounds:CompiledBounds;
  generator:{seed:number;version:string;density:number;seaLevel:number};
  entities:CompiledRuntimeEntity[];
  /** Geography corrections (sector masks) authored in the Studio. */
  layers?:import('../geography/layers.ts').SectorLayers;
  terrain:{mode:'procedural-with-ordered-overrides';edits:import('../studio-core/types.ts').TerrainEdit[]};
  biomes:{edits:import('../studio-core/types.ts').BiomeEdit[]};
  water:import('../world-data.ts').WaterBody[];
  paths:import('../world-data.ts').PathDefinition[];
  collision:{mode:'analytic-terrain-and-shape-descriptors';shapes:{entityId:string;transform:import('../studio-core/types.ts').TransformComponent;collider:import('../studio-core/types.ts').ColliderComponent}[]};
  navigation:{mode:'agent-and-path-descriptors';agents:{entityId:string;navigation:import('../studio-core/types.ts').NavigationComponent}[];pathIds:string[];neighborChunkIds:string[]};
  dependencyHashes:Record<string,string>;
}
export interface CompiledLogicData {
  schemaVersion:1;kind:'compiled-logic';worldId:string;
  libraries:import('../studio-core/types.ts').ProjectLibraries;
  entityIndex:Record<string,import('../studio-core/types.ts').EntityIndexEntry>;
  initialStates:Record<string,unknown>;
}
