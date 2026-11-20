/**
 * Asynchronous composition for the Studio (doc 105): one dedicated worker,
 * latest request wins (an outdated generation is cancelled by terminating its
 * worker — the pipeline is synchronous inside), stage progress callbacks, and
 * a cooperative main-thread fallback where Workers are unavailable (tests,
 * Node). The result is the same WorldComposition as composeWorld.
 */
import type {MapRequirements} from './map-requirements.ts';
import type {WorldComposition} from './world-composition.ts';
import type {RecompositionPreview} from './world-recomposition.ts';
import type {ProjectDocument} from './types.ts';

export interface CompositionRequest {id:number;requirements:MapRequirements;name?:string;identity?:{projectId:string;worldId:string};recompose?:{project:ProjectDocument;mode:'full'|'biomes'}}
export type CompositionMessage=
 |{id:number;type:'stage';stage:string;label:string;index:number;total:number}
 |{id:number;type:'done';plan:WorldComposition}
 |{id:number;type:'recomposed';preview:RecompositionPreview}
 |{id:number;type:'error';message:string};
export interface CompositionProgress {stage:string;label:string;index:number;total:number;elapsedMs:number}
export class CompositionCancelled extends Error {constructor(){super('Génération remplacée par une demande plus récente');this.name='CompositionCancelled';}}

type Pending={id:number;resolve(p:never):void;reject(e:Error):void;onProgress?(p:CompositionProgress):void;started:number};
export interface CompositionClient {
 compose(requirements:MapRequirements,options?:{name?:string;identity?:{projectId:string;worldId:string};onProgress?(p:CompositionProgress):void}):Promise<WorldComposition>;
 /** Recomposition preview (reference + new plan + merge) off the main thread. */
 recompose(project:ProjectDocument,requirements:MapRequirements,mode:'full'|'biomes',options?:{onProgress?(p:CompositionProgress):void}):Promise<RecompositionPreview>;
 cancel():void;
 readonly busy:boolean;
 dispose():void;
}

export function createCompositionClient(factory:(()=>Worker)|null=typeof Worker==='undefined'?null:()=>new Worker(new URL('./composition-worker.ts',import.meta.url),{type:'module',name:'composition'})):CompositionClient{
 let worker:Worker|null=null,pending:Pending|null=null,next=1;
 const stop=()=>{if(pending){pending.reject(new CompositionCancelled());pending=null;}if(worker){worker.terminate();worker=null;}};
 const spawn=()=>{
  const w=factory!();
  w.onmessage=(e:MessageEvent<CompositionMessage>)=>{const m=e.data,p=pending;if(!p||m.id!==p.id)return;
   if(m.type==='stage')p.onProgress?.({stage:m.stage,label:m.label,index:m.index,total:m.total,elapsedMs:performance.now()-p.started});
   else{pending=null;if(m.type==='done')p.resolve(m.plan as never);else if(m.type==='recomposed')p.resolve(m.preview as never);else p.reject(new Error(m.message));}};
  w.onerror=e=>{const p=pending;pending=null;worker=null;w.terminate();p?.reject(new Error(e.message||'Échec du générateur'));};
  return w;
 };
 type StageCb=(s:{id:string;label:string},index:number,total:number)=>void;
 function run<T>(request:Omit<CompositionRequest,'id'>,onProgress:((p:CompositionProgress)=>void)|undefined,inline:(onStage:StageCb)=>Promise<T>):Promise<T>{
  // Latest wins: an outdated generation would only waste the CPU of a small PC.
  if(pending)stop();
  const id=next++;
  return new Promise<T>((resolve,reject)=>{
   const p:Pending={id,resolve:resolve as (v:never)=>void,reject,onProgress,started:performance.now()};pending=p;
   if(!factory){
    // Fallback: yield once so the caller can paint its progress state, then run inline.
    setTimeout(()=>{if(pending!==p)return;inline((s,index,total)=>p.onProgress?.({stage:s.id,label:s.label,index,total,elapsedMs:performance.now()-p.started}))
     .then(v=>{if(pending===p){pending=null;resolve(v);}},e=>{if(pending===p){pending=null;reject(e instanceof Error?e:new Error(String(e)));}});},0);
    return;
   }
   worker??=spawn();
   worker.postMessage({id,...request} satisfies CompositionRequest);
  });
 }
 return {
  get busy(){return pending!==null;},
  cancel:stop,
  dispose:stop,
  compose(requirements,options={}){
   return run<WorldComposition>({requirements,...(options.name?{name:options.name}:{}),...(options.identity?{identity:options.identity}:{})},options.onProgress,
    async onStage=>(await import('./world-composition.ts')).composeWorld(requirements,options.name,options.identity,undefined,{onStage}));
  },
  recompose(project,requirements,mode,options={}){
   return run<RecompositionPreview>({requirements,recompose:{project,mode}},options.onProgress,
    async onStage=>(await import('./world-recomposition.ts')).previewWorldRecomposition(project,requirements,mode,{onStage}));
  },
 };
}
