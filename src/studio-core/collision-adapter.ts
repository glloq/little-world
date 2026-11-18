import {bridgeColliders} from '../settlements/bridge.ts';
import {habitatColliders} from '../settlements/habitat.ts';
import {transformedCollider,type CollisionDefinition} from '../physics/definitions.ts';
import {naturalColliders} from '../structures/natural-collision.ts';
import {resolveEntity} from './references.ts';
import type {ProjectDocument} from './types.ts';
/** Only loaded source sectors contribute colliders; the compiled chunk has the same ownership. */
export function collisionDefinitionsFromProject(project:ProjectDocument):CollisionDefinition[]{
 const result:CollisionDefinition[]=[];for(const chunk of Object.values(project.chunks))for(const source of Object.values(chunk.entities)){const c=resolveEntity(project,source).components;if(c.Collider?.layer==='solid')result.push(transformedCollider(source.id,c.Collider,c.Transform!));if(c.Bridge&&c.Transform)result.push(...bridgeColliders(source.id,c.Transform));if(c.Habitat&&c.Transform)result.push(...habitatColliders(source.id,c.Transform));if(c.NaturalStructure&&c.Transform)result.push(...naturalColliders(source.id,c.NaturalStructure,c.Transform));}return result;
}
