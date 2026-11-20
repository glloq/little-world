/**
 * Web Worker running the composition pipeline off the main thread (doc 105).
 * The Studio stays responsive during the 3–60 s of a full generation; stage
 * progress is streamed back so the author always sees what is happening.
 */
import {composeWorld} from './world-composition.ts';
import {previewWorldRecomposition} from './world-recomposition.ts';
import type {CompositionRequest,CompositionMessage} from './composition-client.ts';

const scope=self as unknown as {onmessage:((e:MessageEvent<CompositionRequest>)=>void)|null;postMessage(m:CompositionMessage):void};
scope.onmessage=e=>{
 const {id,requirements,name,identity}=e.data;
 const onStage=(stage:{id:string;label:string},index:number,total:number)=>scope.postMessage({id,type:'stage',stage:stage.id,label:stage.label,index,total});
 try{
  if(e.data.recompose){scope.postMessage({id,type:'recomposed',preview:previewWorldRecomposition(e.data.recompose.project,requirements,e.data.recompose.mode,{onStage})});return;}
  const plan=composeWorld(requirements,name,identity,undefined,{onStage});
  scope.postMessage({id,type:'done',plan});
 }catch(error){scope.postMessage({id,type:'error',message:error instanceof Error?error.message:String(error)});}
};
