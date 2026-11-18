import {terrainAccessContext} from '../studio-core/terrain-access.ts';
import {pathSupport} from './bridge.ts';
import {layoutContext} from './layout.ts';
import {SHOPS} from '../gameplay/economy.ts';
import {serviceEntry} from './services.ts';
import type { ProjectDocument } from '../studio-core/types.ts';
import type { PathDefinition } from '../world-data.ts';
import { resolveEntity } from '../studio-core/references.ts';
import { settlementTerrain } from './terrain.ts';
import { inspectGroundSegment } from '../paths/terrain-route.ts';
import { WorldCollisionQuery } from '../physics/collision-world.ts';
import { collisionDefinitionsFromProject } from '../studio-core/collision-adapter.ts';
import { HOUSE, housePoint, HABITAT_STYLES } from './habitat.ts';
import type { SettlementDiagnostic } from './planner.ts';
export interface TransportGraph {
    nodes: {
        id: string;
        position: {
            x: number;
            y: number;
            z: number;
        };
    }[];
    edges: {
        id: string;
        from: string;
        to: string;
        pathId: string;
        mode: 'foot';
    }[];
}
/** Reconstruct only authored surface connections: crossings do not connect unless an endpoint
 * is explicitly on the other segment. No bridge or stacked-level inference from XZ. */
export function settlementTransportGraph(paths: PathDefinition[], height: (x: number, z: number) => number, supportHeight?:(path:PathDefinition,x:number,z:number)=>number): TransportGraph {
    const graph: TransportGraph = { nodes: [], edges: [] }, nodes = new Map<string, TransportGraph['nodes'][number]>(), anchors = paths.flatMap(p => [p.points[0], p.points.at(-1)!]);
    const node = (q: {
        x: number;
        z: number;
    },path:PathDefinition) => { const y = supportHeight?supportHeight(path,q.x,q.z):height(q.x, q.z), id = [q.x, y, q.z].map(v => Math.round(v * 100)).join(':'); if (!nodes.has(id))
        nodes.set(id, { id, position: { ...q, y } }); return id; };
    for (const path of paths)
        for (let i = 1; i < path.points.length; i++) {
            const a = path.points[i - 1], b = path.points[i], dx = b.x - a.x, dz = b.z - a.z, len = dx * dx + dz * dz;
            if (len < 1e-8)
                continue;
            const cuts = [{ q: a, t: 0 }, { q: b, t: 1 }];
            for (const q of anchors) {
                const t = ((q.x - a.x) * dx + (q.z - a.z) * dz) / len;
                if (t > 1e-6 && t < 1 - 1e-6 && Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz) < .02)
                    cuts.push({ q, t });
            }
            cuts.sort((a, b) => a.t - b.t);
            for (let j = 1; j < cuts.length; j++) {
                const from = node(cuts[j - 1].q,path), to = node(cuts[j].q,path);
                if (from !== to)
                    graph.edges.push({ id: path.id + ':' + i + ':' + j, from, to, pathId: path.id, mode: 'foot' });
            }
        }
    graph.nodes = [...nodes.values()];
    return graph;
}
export function validateHabitats(p: ProjectDocument): SettlementDiagnostic[] {
    const out: SettlementDiagnostic[] = [];
    if (!Object.values(p.chunks).some(c => Object.values(c.entities).some(e => e.components.Habitat || e.prefabId)))
        return out;
    const c = settlementTerrain(p);
    for (const chunk of Object.values(p.chunks))
        for (const source of Object.values(chunk.entities)) {
            const e = resolveEntity(p, source), h = e.components.Habitat, t = e.components.Transform;
            if (!h || !t)
                continue;
            const fail = (message: string) => out.push({ severity: 'ERROR', code: 'SET_HABITAT_INVALID', targetId: e.id, message });
            if (!HABITAT_STYLES.some(s => e.components.Visual?.assetId === 'settlement.house_' + s) || Math.abs(t.rotation.x) + Math.abs(t.rotation.z) > .001 || Math.abs(t.scale.x - 1) + Math.abs(t.scale.y - 1) + Math.abs(t.scale.z - 1) > .001) {
                fail('Maison : rotation verticale et échelle native requises pour conserver l’ouverture.');
                continue;
            }
            const idx = p.entityIndex[h.doorId], door = idx ? p.chunks[idx.ownerChunkId]?.entities[h.doorId] : undefined, dc = door ? resolveEntity(p, door).components : undefined, point = housePoint(t, 0, 0, -HOUSE.depth / 2);
            if (!dc?.Transform || !dc.Interactable || !dc.Collider || dc.Visual?.assetId !== 'settlement.door' || door?.parentId !== e.id || dc.Collider.layer !== 'solid' || dc.Collider.shape !== 'box' || Math.abs(dc.Collider.size.x - HOUSE.doorWidth) + Math.abs(dc.Collider.size.y - HOUSE.doorHeight) + Math.abs(dc.Collider.size.z - .25) > .001 || typeof dc.State?.initial.open !== 'boolean' || !dc.Persistence?.fields.includes('open')) {
                fail('Maison : porte indépendante, collision et interaction requises.');
                continue;
            }
            const dt = dc.Transform, a = c.height(t.position.x, t.position.z) + point.y, b = c.height(dt.position.x, dt.position.z) + dt.position.y;
            if (Math.hypot(dt.position.x - point.x, dt.position.z - point.z) > .05 || Math.abs(a - b) > .05 || Math.abs(dt.rotation.y - t.rotation.y) + Math.abs(dt.rotation.w - t.rotation.w) > .001)
                fail('La porte ne correspond plus à l’ouverture de la maison. Repositionner la maison avec son groupe.');
        }
    return out;
}
export function validateSettlements(p: ProjectDocument, onlyId?: string): SettlementDiagnostic[] {
    const all = Object.values(p.libraries.settlements ?? {}).filter(s => !onlyId || s.id === onlyId), out = validateHabitats(p);
    if (!all.length)
        return out;
    const c = settlementTerrain(p), doorIds = new Set(Object.values(p.chunks).flatMap(c => Object.values(c.entities)).flatMap(e => e.components.Habitat ? [e.components.Habitat.doorId] : [])), query = new WorldCollisionQuery(c.height, () => null);
    for (const d of collisionDefinitionsFromProject(p))
        query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(d.groundAnchor.x, d.groundAnchor.z) }, enabled: () => !doorIds.has(d.id) });
    for (const s of all) {
        const raw=terrainAccessContext(p);
        for(const id of Object.keys(s.zoneHashes??{})){const z=p.libraries.zones?.[id];if(!z)continue;const center={x:z.polygon.reduce((v,q)=>v+q.x,0)/z.polygon.length,z:z.polygon.reduce((v,q)=>v+q.z,0)/z.polygon.length},samples=[...z.polygon,center],heights=samples.map(q=>raw.height(q.x,q.z));if(z.kind!=='farm-plot'||samples.some(q=>raw.wet(q.x,q.z))||Math.min(...heights)<=raw.seaLevel+1.3||Math.max(...heights)-Math.min(...heights)>.7)out.push({severity:'ERROR',code:'SET_FIELD_TERRAIN',targetId:id,message:'Une parcelle ne repose plus sur un sol sec et cultivable.'});}
        const bounded=layoutContext(s.recipe,c);
        const error = (code: string, message: string, targetId = s.id) => out.push({ severity: 'ERROR', code, targetId, message }), paths = Object.keys(s.pathHashes).map(id => p.libraries.paths[id]).filter((v): v is PathDefinition => !!v);
        if (paths.length !== Object.keys(s.pathHashes).length)
            error('SET_PATH_MISSING', 'Un chemin de la colonie a été supprimé.');
        for (const path of paths) {
            let support;try{support=pathSupport(p,path,path.id.endsWith('-regional')?c:bounded);}catch(e){error('SET_SUPPORT_INVALID',String(e),path.id);continue;}
            for (let i = 1; i < path.points.length; i++) {
                const a = path.points[i - 1], b = path.points[i];
                if (!inspectGroundSegment(a, b, support, { maxSlope: .35, widthM: path.width }).valid) {
                    error('SET_ACCESS_TERRAIN', 'Une rue ou un accès ne respecte plus l’eau, la pente ou la largeur.', path.id);
                    break;
                }
                const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/24)),strips=Math.max(1,Math.ceil(path.width/4)),stripWidth=path.width/strips,nx=length?-(b.z-a.z)/length:0,nz=length?(b.x-a.x)/length:0;
                let blocked=false;
                for(let k=0;k<strips&&!blocked;k++){const offset=-path.width/2+(k+.5)*stripWidth;
                    for(let j=0;j<steps;j++){const from={x:a.x+(b.x-a.x)*j/steps+nx*offset,z:a.z+(b.z-a.z)*j/steps+nz*offset},to={x:a.x+(b.x-a.x)*(j+1)/steps+nx*offset,z:a.z+(b.z-a.z)*(j+1)/steps+nz*offset},moved=query.sweep({...from,y:support.height(from.x,from.z)},{...to,y:support.height(to.x,to.z)},stripWidth/2,1.8);
                        if(moved.blockedX||moved.blockedZ||moved.pushed||Math.hypot(moved.position.x-to.x,moved.position.z-to.z)>.05){blocked=true;break;}}
                }
                if(blocked)error('SET_ACCESS_OBSTACLE','Un obstacle solide ou une hauteur libre insuffisante coupe un accès du village.',path.id);

            }
        }
        const graph = settlementTransportGraph(paths, c.height,(path,x,z)=>{try{const own=pathSupport(p,path,c).height(x,z);if(path.supportId)return own;for(const elevated of paths.filter(p=>p.supportId))for(const q of [elevated.points[0],elevated.points.at(-1)!])if(Math.hypot(q.x-x,q.z-z)<.02){const h=pathSupport(p,elevated,c).height(x,z);if(Math.abs(h-own)<=.2)return h;}return own;}catch{return c.height(x,z);}}), adj = new Map<string, string[]>();
        for (const edge of graph.edges) {
            adj.set(edge.from, [...adj.get(edge.from) ?? [], edge.to]);
            adj.set(edge.to, [...adj.get(edge.to) ?? [], edge.from]);
        }
        const visited = new Set<string>(), pending = graph.nodes.length ? [graph.nodes[0].id] : [];
        while (pending.length) {
            const id = pending.pop()!;
            if (visited.has(id))
                continue;
            visited.add(id);
            pending.push(...adj.get(id) ?? []);
        }
        for(const a of s.amenities??[]){const i=p.entityIndex[a.id],e=i?p.chunks[i.ownerChunkId]?.entities[a.id]:undefined;if(!e){error('SET_AMENITY_MISSING','Un équipement référencé est absent.',a.id);continue;}if(['shore-hut','shore-boat'].includes(a.role))continue;if(a.role==='counter'&&(!e.components.ShopAccess||typeof e.components.State?.initial.shop!=='string'||!Object.hasOwn(SHOPS,e.components.State.initial.shop)))error('SET_SERVICE_UNUSABLE','Le comptoir a perdu son type commercial ou sa pose d’usage.',a.id);if(e.components.ShopAccess){const current=serviceEntry(e);if(Math.hypot(current.x-a.entry.x,current.z-a.entry.z)>.05)error('SET_SERVICE_MOVED','Le comptoir a été déplacé : recalculer son accès.',a.id);}const node=graph.nodes.find(n=>Math.hypot(n.position.x-a.entry.x,n.position.z-a.entry.z)<.05);if(!node||!visited.has(node.id))error('SET_SERVICE_DISCONNECTED','Un équipement ne rejoint plus la place et les rues.',a.id);}
        for (const b of s.buildings) {
            const idx = p.entityIndex[b.id], source = idx ? p.chunks[idx.ownerChunkId]?.entities[b.id] : undefined;
            if (!source) {
                error('SET_BUILDING_MISSING', 'Une maison référencée a disparu.', b.id);
                continue;
            }
            if(s.recipe.layout&&source.components.Transform){const t=source.components.Transform,floor=c.height(t.position.x,t.position.z)+t.position.y,samples=[[-3,-3.5],[3,-3.5],[-3,3.5],[3,3.5],[0,0]].map(([x,z])=>housePoint(t,x,0,z));if(samples.some(q=>bounded.wet(q.x,q.z)||c.height(q.x,q.z)<=c.seaLevel+1))error('SET_LOT_TERRAIN','Une maison dépasse la zone ou empiète sur un milieu réservé ou humide.',b.id);if(samples.some(q=>floor-c.height(q.x,q.z)>.45||c.height(q.x,q.z)-floor>.15))error('SET_LOT_SUPPORT','La maison ne repose plus sur un sol adapté. Corriger sa position ou sa hauteur.',b.id);}
            if (!p.entityIndex[b.doorId] || !p.libraries.interactions[b.interactionId])
                error('SET_ENTRY_MISSING', 'Une porte ou son interaction est absente.', b.id);
            const node = graph.nodes.find(n => Math.hypot(n.position.x - b.entry.x, n.position.z - b.entry.z) < .05);
            if (!node || !visited.has(node.id))
                error('SET_DISCONNECTED', 'Une entrée de maison ne rejoint plus les rues partagées.', b.id);
        }
    }
    return out;
}
