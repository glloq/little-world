import { makeDoor } from '../gameplay/templates.ts';
/** Bounded surface settlement planner. Native entities/paths are the sole geometric source. */
import type { ProjectDocument, EntityDefinitionV3, TransformComponent } from '../studio-core/types.ts';
import type { PathDefinition } from '../world-data.ts';
import { chunkAt } from '../studio-core/schema.ts';
import { yawQuaternion } from '../studio-core/transforms.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
import { settlementTerrain } from './terrain.ts';
import { inspectGroundSegment, planGroundRoute } from '../paths/terrain-route.ts';
import { collisionDefinitionsFromProject } from '../studio-core/collision-adapter.ts';
import { WorldCollisionQuery } from '../physics/collision-world.ts';
import { HOUSE, HABITAT_STYLES, housePoint, HABITAT_ASSETS, habitatColliders } from './habitat.ts';
import { validateSettlementRecipe, type SettlementRecipe, type BuildingRecord } from './schema.ts';
export interface SettlementDiagnostic {
    severity: 'ERROR' | 'WARNING' | 'INFO';
    code: string;
    message: string;
    targetId?: string;
}
export interface SettlementPlan {
    recipe: SettlementRecipe;
    sourceHash: string;
    recipeHash: string;
    entities: EntityDefinitionV3[];
    paths: PathDefinition[];
    buildings: BuildingRecord[];
    diagnostics: SettlementDiagnostic[];
    preserved: string[];
    removed: string[];
    generationMs: number;
}
export function settlementSourceHash(p: ProjectDocument) { return fingerprint({ world: p.world, chunks: p.chunks, chunkIndex: p.chunkIndex, entityIndex: p.entityIndex, libraries: p.libraries, assets: p.assets }); }
export function sourceEntity(p: ProjectDocument, id: string) { const i = p.entityIndex[id]; return i ? p.chunks[i.ownerChunkId]?.entities[id] : undefined; }
export function buildingChanged(p: ProjectDocument, b: BuildingRecord) { return b.locked || fingerprint(p.libraries.interactions[b.interactionId]) !== fingerprint(makeDoor(b.interactionId, b.doorId)) || Object.entries(b.entityHashes).some(([id, h]) => fingerprint(sourceEntity(p, id)) !== h); }
export function settlementPoint(r: SettlementRecipe, x: number, z: number) { const a = r.orientation * Math.PI / 180; return { x: r.center.x + x * Math.cos(a) + z * Math.sin(a), z: r.center.z - x * Math.sin(a) + z * Math.cos(a) }; }
export function planSettlement(p: ProjectDocument, raw: SettlementRecipe): SettlementPlan {
    const started = performance.now(), r = validateSettlementRecipe(raw, p.world), previous = p.libraries.settlements?.[r.id], c = settlementTerrain(p), diagnostics: SettlementDiagnostic[] = [], entities: EntityDefinitionV3[] = [], paths: PathDefinition[] = [], buildings: BuildingRecord[] = [], preserved: string[] = [], removed: string[] = [];
    const protectedBuildings = new Map((previous?.buildings ?? []).filter(b => buildingChanged(p, b)).map(b => [b.slot, b]));
    const removable = new Set((previous?.buildings ?? []).filter(b => !protectedBuildings.has(b.slot)).flatMap(b => [b.id, b.doorId]));
    const obstacles = collisionDefinitionsFromProject(p).filter(d => !removable.has(d.ownerId ?? d.id)); // protected footprints are checked separately below
    const query = new WorldCollisionQuery(c.height, () => null);
    for (const d of obstacles)
        query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(d.groundAnchor.x, d.groundAnchor.z) }, enabled: () => true });
    const protectedCenters = [...protectedBuildings.values()].map(b => sourceEntity(p, b.id)?.components.Transform?.position).filter((q): q is NonNullable<typeof q> => !!q);
    const lanes = r.targetBuildings <= 16 ? 1 : r.targetBuildings <= 40 ? 2 : 3, pairs = Math.ceil(r.targetBuildings / (lanes * 2)), step = r.activity === 'agriculture' ? 18 : 15, half = (pairs - 1) * step / 2, roadZ = -half - 10;
    const nativePath = (id: string, points: {
        x: number;
        z: number;
    }[], width: number) => { const old = p.libraries.paths[id], owned = previous?.pathHashes[id]; if (old && !owned) {
        diagnostics.push({ severity: 'ERROR', code: 'SET_ID_CONFLICT', targetId: id, message: 'Un chemin manuel utilise déjà cet identifiant. Choisir une nouvelle implantation.' });
        return structuredClone(old);
    } if (old && fingerprint(old) !== owned) {
        preserved.push(id);
        return structuredClone(old);
    } const candidate: PathDefinition = { id, points, width, kind: r.wealth === 2 ? 'stone' : 'dirt', smooth: false }; return candidate; };
    const addRoad = (id: string, a: {
        x: number;
        z: number;
    }, b: {
        x: number;
        z: number;
    }, width = 3) => {
        let points = [a, b];
        if (!inspectGroundSegment(a, b, c, { maxSlope: .35, widthM: width }).valid) {
            const route = planGroundRoute(a, b, c, { maxSlope: .35, widthM: width, maxCells: 4096 });
            if (!route.points.length) {
                diagnostics.push({ severity: 'ERROR', code: 'SET_ROAD_TERRAIN', message: 'Une rue partagée traverse un relief ou une eau impraticable. Déplacer ou réduire la zone.' });
                return;
            }
            points = route.points;
        }
        const path = nativePath(id, points, width);
        paths.push(path);
    };
    for (let lane = 0; lane < lanes; lane++) {
        const x = (lane - (lanes - 1) / 2) * 28;
        addRoad(r.id + '-street-' + lane, settlementPoint(r, x, roadZ), settlementPoint(r, x, half + 10), 3.5);
    }
    if (lanes > 1)
        addRoad(r.id + '-cross', settlementPoint(r, -(lanes - 1) * 14, roadZ), settlementPoint(r, (lanes - 1) * 14, roadZ), 3.5);
    for (let slot = 0; slot < r.targetBuildings; slot++) {
        if (previous?.suppressedSlots?.includes(slot))
            continue;
        const kept = protectedBuildings.get(slot);
        if (kept) {
            const a = sourceEntity(p, kept.id), b = sourceEntity(p, kept.doorId);
            if (a && b) {
                entities.push(structuredClone(a), structuredClone(b));
                buildings.push(structuredClone(kept));
                preserved.push(kept.id, kept.doorId);
                const pid = r.id + '-access-' + slot, oldPath = p.libraries.paths[pid];
                if (oldPath && fingerprint(oldPath) !== previous?.pathHashes[pid]) {
                    paths.push(structuredClone(oldPath));
                    preserved.push(pid);
                }
                else {
                    const candidates = paths.filter(v => v.id.includes('-street-')).flatMap(path => path.points.slice(1).map((b, i) => { const a = path.points[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((kept.entry.x - a.x) * dx + (kept.entry.z - a.z) * dz) / (dx * dx + dz * dz))); return { x: a.x + dx * t, z: a.z + dz * t }; })).sort((a, b) => Math.hypot(a.x - kept.entry.x, a.z - kept.entry.z) - Math.hypot(b.x - kept.entry.x, b.z - kept.entry.z));
                    const junction = candidates[0];
                    if (junction)
                        paths.push(nativePath(pid, [kept.entry, junction], 1.8));
                }
            }
            else
                diagnostics.push({ severity: 'WARNING', code: 'SET_MANUAL_DELETION', message: 'Une maison supprimée manuellement reste supprimée.' });
            continue;
        }
        const lane = Math.floor(slot / (pairs * 2)), pair = Math.floor(slot / 2) % pairs, sign = slot % 2 ? 1 : -1, laneX = (lane - (lanes - 1) / 2) * 28, x = laneX + sign * 9, z = pair * step - half, pos = settlementPoint(r, x, z), yaw = r.orientation * Math.PI / 180 + sign * Math.PI / 2;
        if (Math.hypot(x, z) > r.radius - 6)
            continue;
        const t: TransformComponent = { type: 'Transform', position: { ...pos, y: 0 }, rotation: yawQuaternion(yaw), scale: { x: 1, y: 1, z: 1 } }, samples = [[-3.4, -3.9], [0, -3.9], [3.4, -3.9], [-3.4, 0], [0, 0], [3.4, 0], [-3.4, 3.9], [0, 3.9], [3.4, 3.9]].map(([a, b]) => housePoint(t, a, 0, b)), heights = samples.map(q => c.height(q.x, q.z)), floor = Math.max(...heights);
        if (samples.some(q => q.x < c.bounds.minX + 1 || q.x > c.bounds.maxX - 1 || q.z < c.bounds.minZ + 1 || q.z > c.bounds.maxZ - 1 || c.wet(q.x, q.z)) || Math.min(...heights) <= c.seaLevel + 1 || floor - Math.min(...heights) > .35 || protectedCenters.some(q => Math.hypot(pos.x - q.x, pos.z - q.z) < 9.5))
            continue;
        // Sample the complete footprint against existing logical bodies, at usable body height.
        if (query.intersectsVolume({ minX: Math.min(...samples.map(q => q.x)), maxX: Math.max(...samples.map(q => q.x)), minZ: Math.min(...samples.map(q => q.z)), maxZ: Math.max(...samples.map(q => q.z)), minY: floor + .15, maxY: floor + 5.7 }))
            continue;
        const pathNear = paths.some(path => path.points.slice(1).some((b, i) => { const a = path.points[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(a.x + dx * t - pos.x, a.z + dz * t - pos.z) < 4.7; }));
        if (pathNear)
            continue;
        t.position.y = floor - c.height(pos.x, pos.z);
        const entry = housePoint(t, 0, 0, -HOUSE.depth / 2 - 1.1), junction = settlementPoint(r, laneX, z), id = r.id + '-house-' + slot, doorId = id + '-door', interactionId = id + '-toggle';
        if (!inspectGroundSegment(entry, junction, c, { maxSlope: .35, widthM: 1.8 }).valid)
            continue;
        const variation = parseInt(fingerprint([r.seed, r.houseVariation, slot]).slice(0, 8), 16), style = r.style === 'auto' ? HABITAT_STYLES[variation % HABITAT_STYLES.length] : r.style;
        const house: EntityDefinitionV3 = { id, kind: 'building', name: (r.activity === 'forest' ? 'Maison forestière ' : r.activity === 'agriculture' ? 'Maison de ferme ' : 'Maison ') + (slot + 1), ownerChunkId: chunkAt(p.world, pos.x, pos.z), components: { Transform: t, Visual: { type: 'Visual', assetId: 'settlement.house_' + style }, Habitat: { type: 'Habitat', version: 1, doorId } } };
        const dp = housePoint(t, 0, 0, -HOUSE.depth / 2), door: EntityDefinitionV3 = { id: doorId, kind: 'prop', name: 'Porte · ' + house.name, ownerChunkId: chunkAt(p.world, dp.x, dp.z), parentId: id, components: { Transform: { ...structuredClone(t), position: { x: dp.x, y: floor - c.height(dp.x, dp.z), z: dp.z } }, Visual: { type: 'Visual', assetId: 'settlement.door' }, Collider: { type: 'Collider', shape: 'box', size: { x: HOUSE.doorWidth, y: HOUSE.doorHeight, z: .25 }, layer: 'solid' }, State: { type: 'State', initial: { open: false } }, Persistence: { type: 'Persistence', fields: ['open'] }, Interactable: { type: 'Interactable', prompt: 'Ouvrir / fermer la porte', range: 3, interactionIds: [interactionId] } } };
        entities.push(house, door);
        buildings.push({ id, doorId, interactionId, slot, entry: { x: entry.x, z: entry.z }, entityHashes: { [id]: fingerprint(house), [doorId]: fingerprint(door) }, locked: false });
        paths.push(nativePath(r.id + '-access-' + slot, [{ x: entry.x, z: entry.z }, junction], 1.8));
    }
    // Protected buildings outside a reduced target remain authored, along with their access.
    for (const [slot, b] of protectedBuildings)
        if (slot >= r.targetBuildings) {
            for (const id of [b.id, b.doorId]) {
                const e = sourceEntity(p, id);
                if (e)
                    entities.push(structuredClone(e));
            }
            buildings.push(structuredClone(b));
            preserved.push(b.id, b.doorId);
            const path = p.libraries.paths[r.id + '-access-' + slot];
            if (path)
                paths.push(structuredClone(path));
        }
    // Optional local connection to the nearest authored road, rather than one remote route per house.
    if (r.useExisting) {
        for (const e of entities)
            if (e.components.Habitat && e.components.Transform)
                for (const d of habitatColliders(e.id, e.components.Transform))
                    query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(d.groundAnchor.x, d.groundAnchor.z) }, enabled: () => true });
        const routing = { ...c, wet: (x: number, z: number) => c.wet(x, z) || query.intersectsVolume({ minX: x - .45, maxX: x + .45, minZ: z - .45, maxZ: z + .45, minY: c.height(x, z) + .2, maxY: c.height(x, z) + 1.8 }) };
        const own = new Set(Object.keys(previous?.pathHashes ?? {})), origin = settlementPoint(r, 0, roadZ), near = Object.values(p.libraries.paths).filter(v => !own.has(v.id) && !v.id.includes('-access-')).flatMap(path => path.points).map(q => ({ q, d: Math.hypot(q.x - origin.x, q.z - origin.z) })).filter(v => v.d > 3 && v.d < Math.min(r.radius * 2, 300)).sort((a, b) => a.d - b.d)[0];
        if (near) {
            const route = planGroundRoute(origin, near.q, routing, { maxSlope: .35, widthM: 3, maxCells: 4096 });
            if (route.points.length)
                paths.push(nativePath(r.id + '-regional', route.points, 3));
            else
                diagnostics.push({ severity: 'WARNING', code: 'SET_REGIONAL_ACCESS', message: 'La route voisine ne peut pas être rejointe à pied depuis cette implantation.' });
        }
    }
    if (!buildings.length)
        diagnostics.push({ severity: 'ERROR', code: 'SET_NO_SITE', message: 'Aucune maison ne tient sur un sol sec et assez plat. Choisir une plaine ou un replat plus large.' });
    else if (buildings.length < r.targetBuildings)
        diagnostics.push({ severity: 'WARNING', code: 'SET_PARTIAL', message: `${buildings.length} maisons possibles sur ${r.targetBuildings} souhaitées ; les autres emplacements sont trop pentus, humides ou occupés.` });
    for (const b of previous?.buildings ?? [])
        if (!entities.some(e => e.id === b.id) && !buildingChanged(p, b))
            removed.push(b.id, b.doorId);
    for (const id of Object.keys(previous?.pathHashes ?? {}))
        if (!paths.some(v => v.id === id) && p.libraries.paths[id] && fingerprint(p.libraries.paths[id]) !== previous!.pathHashes[id]) {
            paths.push(structuredClone(p.libraries.paths[id]));
            preserved.push(id);
        }
    return { recipe: r, sourceHash: settlementSourceHash(p), recipeHash: fingerprint(r), entities, paths, buildings, diagnostics, preserved: [...new Set(preserved)], removed, generationMs: performance.now() - started };
}
export { HABITAT_ASSETS };
