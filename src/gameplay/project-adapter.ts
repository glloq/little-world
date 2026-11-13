import {defaultEnvironment,type EnvironmentDefinition} from '../environment/climate.ts';
import type {ProjectDocument,EntityIndexEntry,ComponentMap,ProjectLibraries} from '../studio-core/types.ts';
import {parseGameplayData,type GameplayData,type GameplayEntity} from './schema.ts';
/** Logical index metadata, including unloaded sectors, supplies initial gameplay state. */
export function gameplayDataFromProject(project:ProjectDocument,buildVersion='source:'+project.manifest.revision):GameplayData {
  const local=new Map<string,ComponentMap>();for(const chunk of Object.values(project.chunks))for(const entity of Object.values(chunk.entities))local.set(entity.id,entity.components);
  return gameplayDataFromIndex({entityIndex:project.entityIndex,components:local,libraries:project.libraries,environment:project.world.environment??defaultEnvironment(project.world.seed),worldId:project.world.worldId,buildVersion});
}
/** Shared by Studio sources and the compiled-world reader (logic file + loaded sector entities). */
export function gameplayDataFromIndex(input:{entityIndex:Record<string,EntityIndexEntry>;components:ReadonlyMap<string,ComponentMap>;libraries:Pick<ProjectLibraries,'variables'|'interactions'|'items'|'objectives'|'dialogues'|'activities'>;environment:EnvironmentDefinition;worldId:string;buildVersion:string}):GameplayData {
  const {entityIndex,components:local,libraries}=input;
  const entities:GameplayEntity[]=Object.values(entityIndex).map(index=>{
    const components=local.get(index.id),logical=index.logical;
    return {id:index.id,name:index.name,ownerChunkId:index.ownerChunkId,position:logical?.position??index.position,
      initialState:logical?.initialState??components?.State?.initial??{},persistentState:logical?.persistentState??components?.Persistence?.fields??[],dialogueIds:(index.references??[]).filter(id=>!!libraries.dialogues[id]),
      ...((logical?.interactable??components?.Interactable)?{interactable:logical?.interactable??components?.Interactable}:{})};
  });
  return parseGameplayData({environment:input.environment,worldId:input.worldId,buildVersion:input.buildVersion,entities,
    variables:Object.values(libraries.variables),interactions:Object.values(libraries.interactions),items:Object.values(libraries.items),objectives:Object.values(libraries.objectives),dialogues:Object.values(libraries.dialogues),activities:Object.values(libraries.activities)});
}
