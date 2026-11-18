/** All speaking/working villagers share the player's hamster rig. Historical 'squirrel'
 * stays readable in V1/V3 source documents, but is never displayed as a squirrel.
 * Wildlife (kind 'animal') is deliberately not converted to a speaking hamster.
 */
export type LegacyNPCSpecies='squirrel'|'hamster'|'animal';
export type VisualNPCSpecies='hamster'|'animal';
export const NPC_HUMANOID_SPECIES='hamster' as const;
export function visualNPCSpecies(species:LegacyNPCSpecies):VisualNPCSpecies{
  return species==='animal'?'animal':NPC_HUMANOID_SPECIES;
}
export function isHumanoidNPC(species:LegacyNPCSpecies):boolean{
  return visualNPCSpecies(species)==='hamster';
}
