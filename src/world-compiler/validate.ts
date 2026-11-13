import {createTerrainSource} from '../terrain.ts';
import {compileWaterBody} from '../water/profile.ts';
import {parseProject} from '../studio-core/schema.ts';
import {ReferenceIndex} from '../studio-core/references.ts';
import {validateGameplayLibraries} from '../gameplay/schema.ts';
import type {ProjectDocument} from '../studio-core/types.ts';
import {canonicalJSON,hashText,type CompilationDiagnostic,type CompiledAssetDescriptor} from './manifests.ts';
import {verifyAssets,type AssetResolver} from './assets.ts';

export interface CompileOptions {previous?:import('./manifests.ts').CompiledWorldManifest;resolveAsset?:AssetResolver}
export interface ProjectPreflight {project?:ProjectDocument;diagnostics:CompilationDiagnostic[];assets:CompiledAssetDescriptor[]}
export class ProjectCompilationError extends Error {
  readonly diagnostics:CompilationDiagnostic[];
  constructor(diagnostics:CompilationDiagnostic[]){super(diagnostics.filter(d=>d.severity==='ERROR').map(d=>d.message).join('\n'));this.name='ProjectCompilationError';this.diagnostics=diagnostics;}
}
/** Full preflight is intentionally stricter than an editor's unloaded-header parser. */
export async function preflightProject(input:unknown,options:CompileOptions={}):Promise<ProjectPreflight>{
  const diagnostics:CompilationDiagnostic[]=[];
  let project:ProjectDocument;
  try{
    const legacy=input as {schemaVersion?:unknown}|null;
    if(legacy&&(legacy.schemaVersion===1||legacy.schemaVersion===2)){
      const hash=await hashText(canonicalJSON(input));
      const {migrateWorldToV3}=await import('../studio-core/migration.ts');
      project=migrateWorldToV3(input,{projectId:'legacy-project-'+hash.slice(0,32),worldId:'legacy-world-'+hash.slice(0,32)}).project;
      diagnostics.push({severity:'INFO',code:'MIGRATED_SOURCE',message:`Source V${legacy.schemaVersion} migrated non-destructively to V3`});
    }else project=parseProject(input);
  }catch(error){return {diagnostics:[{severity:'ERROR',code:'PROJECT_SCHEMA',message:error instanceof Error?error.message:String(error)}],assets:[]};}
  const references=new ReferenceIndex(project);
  for(const diagnostic of references.diagnostics())diagnostics.push({severity:diagnostic.severity,code:diagnostic.code,message:diagnostic.message,
    ...(diagnostic.id?{targetId:diagnostic.id}:{}),...(diagnostic.chunkId?{chunkId:diagnostic.chunkId}:{})});
  try{validateGameplayLibraries(project.libraries,Object.keys(project.entityIndex),Object.keys(project.chunkIndex));}
  catch(error){diagnostics.push({severity:'ERROR',code:'GAMEPLAY_SCHEMA',message:error instanceof Error?error.message:String(error)});}
  if(Object.keys(project.libraries.water).length){
   const edits=Object.values(project.chunks).flatMap(c=>c.terrainEdits).sort((a,b)=>a.order-b.order);
   const source=createTerrainSource({seed:project.world.seed,density:project.world.density,seaLevel:project.world.seaLevel},edits);
   for(const water of Object.values(project.libraries.water))for(const d of compileWaterBody(water,source).diagnostics)diagnostics.push({...d,targetId:water.id});
  }
  const verified=await verifyAssets(project,options.resolveAsset);diagnostics.push(...verified.diagnostics);
  diagnostics.push({severity:'INFO',code:'DESCRIPTOR_COMPILATION',message:'Output contains source/runtime entity, analytic terrain, collision and navigation descriptors; GPU meshes, terrain LOD geometry and navmeshes are not baked.'});
  return {project,diagnostics,assets:verified.assets};
}
