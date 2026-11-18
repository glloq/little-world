/** Keep the door attached when the normal Studio transform inspector moves a house. */
import type { ProjectDocument, TransformComponent } from '../studio-core/types.ts';
import { projectGeography } from '../studio-core/geo-context.ts';
import { chunkAt } from '../studio-core/schema.ts';
import { putEntity } from '../studio-core/source.ts';
import { HOUSE, housePoint } from './habitat.ts';
export function moveHabitatDoor(p: ProjectDocument, id: string, t: TransformComponent) {
    const index = p.entityIndex[id], house = index ? p.chunks[index.ownerChunkId]?.entities[id] : undefined, h = house?.components.Habitat;
    if (!h)
        return;
    if (Math.abs(t.rotation.x) + Math.abs(t.rotation.z) > .001 || Math.abs(t.scale.x - 1) + Math.abs(t.scale.y - 1) + Math.abs(t.scale.z - 1) > .001)
        throw Error('Maison : déplacement et rotation verticale seulement ; échelle native pour garder la porte praticable.');
    const d = p.entityIndex[h.doorId], door = d ? p.chunks[d.ownerChunkId]?.entities[h.doorId] : undefined;
    if (!door)
        throw Error('Charger la porte de la maison avant déplacement');
    const ground = projectGeography(p).ctx.height, point = housePoint(t, 0, 0, -HOUSE.depth / 2), floor = ground(t.position.x, t.position.z) + t.position.y;
    const updated = structuredClone(door);
    updated.components.Transform = { ...structuredClone(t), position: { x: point.x, y: floor - ground(point.x, point.z), z: point.z } };
    updated.ownerChunkId = chunkAt(p.world, point.x, point.z);
    putEntity(p, updated);
    p.libraries.settlements = structuredClone(p.libraries.settlements ?? {});
    for (const s of Object.values(p.libraries.settlements))
        for (const b of s.buildings)
            if (b.id === id) {
                const entry = housePoint(t, 0, 0, -HOUSE.depth / 2 - 1.1);
                b.entry = { x: entry.x, z: entry.z };
            }
}
