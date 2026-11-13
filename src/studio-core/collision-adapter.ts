import {transformedCollider,type CollisionDefinition} from '../physics/definitions.ts';
import {resolveEntity} from './references.ts';
import type {ProjectDocument} from './types.ts';
/** Only loaded source sectors contribute colliders; the compiled chunk has the same ownership. */
export function collisionDefinitionsFromProject(project:ProjectDocument):CollisionDefinition[]{
 const result:CollisionDefinition[]=[];for(const chunk of Object.values(project.chunks))for(const source of Object.values(chunk.entities)){const c=resolveEntity(project,source).components;if(c.Collider?.layer==='solid')result.push(transformedCollider(source.id,c.Collider,c.Transform!));}return result;
}
