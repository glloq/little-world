/**
 * World plan: the single staged pipeline every generated world goes through
 * (doc 104 §C2). A stage reads the shared context, appends its own layer and
 * diagnostics, and never rewrites what an earlier stage produced except through
 * the explicit terrain-grading layer. Stages are plain data + one function, so
 * the order is inspectable, timed and testable without a framework.
 */
import type {MapRequirements} from './map-requirements.ts';
import type {ProjectDocument} from './types.ts';

export type PlanSeverity='ERROR'|'WARNING';
export interface PlanDiagnostic {severity:PlanSeverity;code:string;message:string}
export interface StageReport {id:string;label:string;ms:number;diagnostics:number}

/** Behaviour switches derived once from the stored composition version. Older
 * versions are frozen: they only exist so stored worlds replay identically. */
export interface CompositionProfile {
 version:1|2|3|4|5;
 /** V<4 regenerate the terrace joins when no river reaches the sea. */
 terraceRetry:boolean;
 /** Province/sequence diagnostics (V2+) and coverage metrics. */
 provinces:boolean;
 /** Island styles, natural biome alignment and natural quality (V4+). */
 natural:boolean;
 /** Silhouettes, useful zones, maritime start and activities (V5). */
 complete:boolean;
}
export function compositionProfile(r:Pick<MapRequirements,'compositionVersion'>):CompositionProfile {
 const version=r.compositionVersion??1;
 return {version,terraceRetry:version<4,provinces:version>=2,natural:version>=4,complete:version===5};
}

export interface WorldStage<C> {id:string;label:string;run(ctx:C):void}
export interface StagedContext {diagnostics:PlanDiagnostic[];stages:StageReport[]}

/** Run stages in order, recording time and the diagnostics each one added. */
/** `onStage` is called before each stage (index, total) — progress UIs and worker messages. */
export function runStages<C extends StagedContext>(stages:readonly WorldStage<C>[],ctx:C,now:()=>number=()=>performance.now(),onStage?:(stage:WorldStage<C>,index:number,total:number)=>void):C {
 const ids=new Set<string>();
 for(const [index,stage]of stages.entries()){
  onStage?.(stage,index,stages.length);
  if(ids.has(stage.id))throw Error('Étape de plan dupliquée : '+stage.id);ids.add(stage.id);
  const started=now(),before=ctx.diagnostics.length;
  stage.run(ctx);
  ctx.stages.push({id:stage.id,label:stage.label,ms:now()-started,diagnostics:ctx.diagnostics.length-before});
 }
 return ctx;
}

/** Group diagnostics per stage for the Studio preview and reports. */
export function diagnosticsByStage(ctx:StagedContext):{stage:string;diagnostics:PlanDiagnostic[]}[] {
 let at=0;return ctx.stages.map(s=>{const d=ctx.diagnostics.slice(at,at+s.diagnostics);at+=s.diagnostics;return {stage:s.id,diagnostics:d};});
}

export type {ProjectDocument};
