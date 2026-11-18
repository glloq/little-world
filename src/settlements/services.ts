import { SHOPS } from '../gameplay/economy.ts';
import { projectShopAccess } from '../gameplay/shop-access.ts';
/** Civic furniture and activity equipment use actual registry assets and native paths. */
import type { ProjectDocument, EntityDefinitionV3 } from '../studio-core/types.ts';
import type { PathDefinition } from '../world-data.ts';
import type { GroundRouteContext } from '../paths/terrain-route.ts';
import { inspectGroundSegment } from '../paths/terrain-route.ts';
import { assetDefinitionFor, worldAsset, colliderFor, lightFor } from '../world-production/registry.ts';
import { chunkAt } from '../studio-core/schema.ts';
import { yawQuaternion } from '../studio-core/transforms.ts';
import { transformedCollider } from '../physics/definitions.ts';
import type { WorldCollisionQuery } from '../physics/collision-world.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
import type { AmenityRecord, SettlementRecipe } from './schema.ts';
import type { SettlementDiagnostic } from './planner.ts';
export function amenityChanged(p: ProjectDocument, a: AmenityRecord) { const i = p.entityIndex[a.id], e = i ? p.chunks[i.ownerChunkId]?.entities[a.id] : undefined; return a.locked || fingerprint(e) !== a.entityHash; }
export function planServices(p: ProjectDocument, r: SettlementRecipe, roadZ: number, c: GroundRouteContext, query: WorldCollisionQuery, entities: EntityDefinitionV3[], paths: PathDefinition[], diagnostics: SettlementDiagnostic[], preserved: string[], nativePath: (id: string, points: {
    x: number;
    z: number;
}[], width: number) => PathDefinition): AmenityRecord[] {
    const old = p.libraries.settlements?.[r.id], records: AmenityRecord[] = [], angle = r.orientation * Math.PI / 180, point = (x: number, z: number) => ({ x: r.center.x + x * Math.cos(angle) + z * Math.sin(angle), z: r.center.z - x * Math.sin(angle) + z * Math.cos(angle) }), squareZ = r.layout&&r.layout.pattern!=='linear'?0:roadZ-15;
    const wanted = r.services || old?.amenities?.some(a => amenityChanged(p, a));
    if (!wanted)
        return records;
    const addPath = (suffix: string, points: {
        x: number;
        z: number;
    }[], width: number) => { if (points.slice(1).some((b, i) => !inspectGroundSegment(points[i], b, c, { maxSlope: .35, widthM: width }).valid)) {
        diagnostics.push({ severity: 'ERROR', code: 'SET_SERVICE_ACCESS', message: 'La place ou un équipement ne possède pas de passage sec assez large.' });
        return;
    } const id=r.id+'-civic-'+suffix;if(Math.hypot(points[0].x-points.at(-1)!.x,points[0].z-points.at(-1)!.z)>.1&&!paths.some(p=>p.id===id))paths.push(nativePath(id,points,width)); };
    addPath('square', [point(-4, squareZ), point(4, squareZ)], 12);
    addPath('link', [point(0, squareZ), point(0, roadZ)], 3);
    const hasMine = Object.values(p.libraries.zones ?? {}).some(z => z.kind === 'mine' && z.polygon.some(q => Math.hypot(q.x - r.center.x, q.z - r.center.z) < 300));
    const hasWater = [40, 80, 160, 240].some(radius => Array.from({ length: 16 }, (_, i) => point(Math.cos(i * Math.PI / 8) * radius, Math.sin(i * Math.PI / 8) * radius)).some(q => q.x >= c.bounds.minX && q.x <= c.bounds.maxX && q.z >= c.bounds.minZ && q.z <= c.bounds.maxZ && (c.height(q.x, q.z) <= c.seaLevel || Object.values(p.libraries.water).some(w => w.points.some(v => Math.hypot(q.x - v.x, q.z - v.z) < w.width + 20)))));
    const kind = r.activity === 'agriculture' ? 'farm' : r.activity === 'forest' ? 'forest' : r.activity === 'mine' ? 'mine' : r.activity === 'fishing' ? 'port' : 'market';
    const specs = [{ role: 'counter', asset: kind === 'forest' ? 'structure.counter_forest' : kind === 'mine' ? 'structure.counter_mine' : kind === 'port' ? 'structure.counter_port' : 'structure.market_stall', x: 0, z: squareZ - 12, yaw: Math.PI, shop: kind },
        { role: 'well', asset: 'structure.well', x: -13, z: squareZ, yaw: -Math.PI / 2 }, { role: 'bench', asset: 'structure.bench', x: 13, z: squareZ, yaw: Math.PI / 2 },
        ...(r.activity === 'agriculture' ? [{ role: 'mill', asset: 'architecture.windmill_stone', x: -21, z: squareZ - 19, yaw: Math.PI }] : []),
        ...(r.activity === 'forest' ? [{ role: 'fire', asset: 'structure.campfire', x: -19, z: squareZ - 16, yaw: Math.PI }] : [])];
    const preservedRecords = (old?.amenities ?? []).filter(a => amenityChanged(p, a));
    for (const a of preservedRecords) {
        const index = p.entityIndex[a.id], e = index ? p.chunks[index.ownerChunkId]?.entities[a.id] : undefined;
        if (!e) {
            diagnostics.push({ severity: 'WARNING', code: 'SET_AMENITY_DELETED', message: 'Un équipement supprimé manuellement reste supprimé.' });
            continue;
        }
        entities.push(structuredClone(e));
        const entry = e.components.Transform && e.components.ShopAccess ? serviceEntry(e) : a.entry;
        records.push({ ...structuredClone(a), entry });
        preserved.push(a.id);
        const id = r.id + '-civic-access-' + a.role, path = p.libraries.paths[id];
        if (path && fingerprint(path) !== old?.pathHashes[id]) {
            paths.push(structuredClone(path));
            preserved.push(id);
        }
        else {
            const dx = entry.x - r.center.x, dz = entry.z - r.center.z, localX = dx * Math.cos(angle) - dz * Math.sin(angle);
            addPath('access-' + a.role, [entry, point(Math.max(-4, Math.min(4, localX)), squareZ)], 1.8);
        }
    }
    for (const spec of specs) {
        if (!r.services || preservedRecords.some(a => a.role === spec.role) || old?.suppressedAmenities?.includes(spec.role))
            continue;
        if (spec.role === 'counter' && (kind === 'mine' && !hasMine || kind === 'port' && !hasWater)) {
            diagnostics.push({ severity: 'WARNING', code: 'SET_RESOURCE_MISSING', message: kind === 'mine' ? 'Aucune mine proche : comptoir minier non ajouté.' : 'Aucune eau proche : comptoir de pêche non ajouté.' });
            continue;
        }
        const asset = worldAsset(spec.asset), definition = assetDefinitionFor(spec.asset);
        if (!asset || !definition) {
            diagnostics.push({ severity: 'WARNING', code: 'SET_ASSET_MISSING', message: 'Équipement absent du catalogue : ' + spec.asset });
            continue;
        }
        const id = r.id + '-service-' + spec.role, current = p.entityIndex[id];
        if (current && !old?.amenities?.some(a => a.id === id)) {
            diagnostics.push({ severity: 'ERROR', code: 'SET_ID_CONFLICT', message: 'Un objet utilise déjà l’identifiant de cet équipement.' });
            continue;
        }
        const pos = point(spec.x, spec.z), yaw = angle + spec.yaw, [sx, sy, sz] = asset.size, cos = Math.cos(yaw), sin = Math.sin(yaw), sample = (x: number, z: number) => ({ x: pos.x + x * cos + z * sin, z: pos.z - x * sin + z * cos }), samples = [sample(-sx / 2, -sz / 2), sample(sx / 2, -sz / 2), sample(-sx / 2, sz / 2), sample(sx / 2, sz / 2), pos], heights = samples.map(q => c.height(q.x, q.z)), floor = Math.max(...heights);
        if (Math.hypot(spec.x, spec.z) > r.radius - 8 || samples.some(q => q.x < c.bounds.minX || q.x > c.bounds.maxX || q.z < c.bounds.minZ || q.z > c.bounds.maxZ || c.wet(q.x, q.z)) || Math.min(...heights) <= c.seaLevel + 1 || floor - Math.min(...heights) > .35 || query.intersectsVolume({ minX: Math.min(...samples.map(q => q.x)) - .3, maxX: Math.max(...samples.map(q => q.x)) + .3, minZ: Math.min(...samples.map(q => q.z)) - .3, maxZ: Math.max(...samples.map(q => q.z)) + .3, minY: floor + .1, maxY: floor + sy })) {
            diagnostics.push({ severity: 'WARNING', code: 'SET_AMENITY_NO_SPACE', message: asset.label + ' : pas de place sèche et libre, équipement omis.' });
            continue;
        }
        const collider=colliderFor(spec.asset),light=lightFor(spec.asset,id),extent=collider?transformedCollider(id,collider,{position:{x:0,y:0,z:0},rotation:yawQuaternion(yaw),scale:{x:1,y:1,z:1}}).size:null;
        // The renderer keeps the true orientation, while physics uses conservative world AABBs.
        // Put the use point outside that actual envelope with the full access width clear.
        const distance=Math.max(sz/2+1.1,extent?Math.min(Math.abs(sin)>1e-6?(extent.x/2+1.1)/Math.abs(sin):Infinity,Math.abs(cos)>1e-6?(extent.z/2+1.1)/Math.abs(cos):Infinity):0);
        const entry=sample(0,-distance),junction=point(Math.max(-4,Math.min(4,spec.x)),squareZ);
        const e: EntityDefinitionV3 = { id, kind: spec.role === 'mill' ? 'building' : 'prop', name: spec.role === 'counter' ? SHOPS[kind].name : asset.label, ownerChunkId: chunkAt(p.world, pos.x, pos.z), components: { Transform: { type: 'Transform', position: { ...pos, y: floor - c.height(pos.x, pos.z) }, rotation: yawQuaternion(yaw), scale: { x: 1, y: 1, z: 1 } }, Visual: { type: 'Visual', assetId: spec.asset }, ...(collider ? { Collider: collider } : {}), ...(light ? { Light: light } : {}), ShopAccess: { type: 'ShopAccess', version: 1, offset: { x: 0, y: 0, z: -distance }, yaw: 0, width: 2.4, range: 2.6 }, ...('shop' in spec ? { State: { type: 'State' as const, initial: { shop: spec.shop! } } } : {}) } };
        if (!inspectGroundSegment(entry, junction, c, { maxSlope: .35, widthM: 1.8 }).valid) {
            diagnostics.push({ severity: 'WARNING', code: 'SET_AMENITY_NO_ACCESS', message: asset.label + ' : accès impraticable, équipement omis.' });
            continue;
        }
        entities.push(e);
        records.push({ id, role: spec.role, entityHash: fingerprint(e), entry, locked: false });
        addPath('access-' + spec.role, [entry, junction], 1.8);
        if (collider) {
            const d = transformedCollider(id, collider, e.components.Transform!);
            query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(pos.x, pos.z) }, enabled: () => true });
        }
    }
    return records;
}
export function serviceEntry(e: EntityDefinitionV3) { const t = e.components.Transform!, pose = projectShopAccess(e.components.ShopAccess!, t); return { x: t.position.x + pose.offset.x, z: t.position.z + pose.offset.z }; }
