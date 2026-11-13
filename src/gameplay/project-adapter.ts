import type {ProjectDocument,EntityDefinitionV3} from '../studio-core/types.ts';
import {parseGameplayData,type GameplayData,type GameplayEntity} from './schema.ts';
/** Logical index metadata, including unloaded sectors, supplies initial gameplay state. */
export function gameplayDataFromProject(project:ProjectDocument,buildVersion='source:'+project.manifest.revision):GameplayData {
  const local=new Map<string,EntityDefinitionV3>();for(const chunk of Object.values(project.chunks))for(const entity of Object.values(chunk.entities))local.set(entity.id,entity);
  const entities:GameplayEntity[]=Object.values(project.entityIndex).map(index=>{
    const components=local.get(index.id)?.components,logical=index.logical;
    return {id:index.id,ownerChunkId:index.ownerChunkId,position:logical?.position??index.position,
      initialState:logical?.initialState??components?.State?.initial??{},persistentState:logical?.persistentState??components?.Persistence?.fields??[],
      ...((logical?.interactable??components?.Interactable)?{interactable:logical?.interactable??components?.Interactable}:{})};
  });
  return parseGameplayData({worldId:project.world.worldId,buildVersion,entities,
    variables:Object.values(project.libraries.variables),interactions:Object.values(project.libraries.interactions),items:Object.values(project.libraries.items),objectives:Object.values(project.libraries.objectives),dialogues:Object.values(project.libraries.dialogues),activities:Object.values(project.libraries.activities)});
}
