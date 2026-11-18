/** Reuse native reservation and activity polygons; settlement generation never consumes fields. */
import type { ProjectDocument } from '../studio-core/types.ts';
import { terrainAccessContext } from '../studio-core/terrain-access.ts';
import { compilePolygon } from '../geography/archipelago.ts';
export function settlementTerrain(p: ProjectDocument) { const c = terrainAccessContext(p), polygons = Object.values(p.libraries.zones ?? {}).map(z => z.polygon); for (const site of Object.values(p.libraries.terrainPlans ?? {}).flatMap(p => p.sites))
    if (site.kind === 'farm') {
        const f = p.world.terrain?.kind === 'archipelago' ? p.world.terrain.archipelago.features.find(f => f.id === site.featureId) : undefined;
        if (f?.kind === 'plateau')
            polygons.push(f.polygon);
    } const exclusions = polygons.map(p => compilePolygon(p)); return { ...c, wet: (x: number, z: number) => c.wet(x, z) || exclusions.some(f => f(x, z) >= 0) }; }
