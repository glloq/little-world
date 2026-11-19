import {settlementSurroundings} from './surroundings.ts';
import {neighborhoodNetwork,networkPattern} from './neighborhood-network.ts';
import {settlementMaritimePort} from './maritime-port.ts';
import {localLife} from './local-life.ts';
import {settlementPopulation} from './population.ts';
import {createResidentAssignmentPlanner} from '../npc-life/assignments.ts';
import {planResidentVillageQuest} from '../npc-life/quest-director.ts';
import {riverCrossing} from './river-crossing.ts';
import {bridgeColliders} from './bridge.ts';
import type {ResidentSurfaces} from '../npc-life/layered-routes.ts';
import {isCorridor,corridorStreet} from './corridor.ts';
import {layoutContext,layoutDimensions,lanePoint,organicStreet,organicArcs} from './layout.ts';
import {fitOrganicLot} from './organic-lots.ts';
import {planServices,amenityChanged} from './services.ts';
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
import { validateSettlementRecipe, type SettlementRecipe, type BuildingRecord,type AmenityRecord } from './schema.ts';
export interface SettlementDiagnostic {
    severity: 'ERROR' | 'WARNING' | 'INFO';
    code: string;
    message: string;
    targetId?: string;
}
export interface SettlementPlan {
    zones?:import('../studio-core/types.ts').ActivityZoneV3[];
    recipe: SettlementRecipe;
    sourceHash: string;
    recipeHash: string;
    entities: EntityDefinitionV3[];
    paths: PathDefinition[];
    buildings: BuildingRecord[];
    amenities?:AmenityRecord[];
    dialogues?:Record<string,import('../gameplay/schema.ts').GameplayDialogue>;
    objectives?:Record<string,import('../gameplay/schema.ts').ObjectiveDefinition>;
    diagnostics: SettlementDiagnostic[];
    preserved: string[];
    removed: string[];
    generationMs: number;
    /** Preview-only, never saved as authoritative authored source. */
    lifeStats?:{homes:number;jobs:number;play:number;assigned:number;unreachable:number;graphNodes:number;graphTruncated:boolean};
}
export function settlementSourceHash(p: ProjectDocument) { return fingerprint({ world: p.world, chunks: p.chunks, chunkIndex: p.chunkIndex, entityIndex: p.entityIndex, libraries: p.libraries, assets: p.assets }); }
export function sourceEntity(p: ProjectDocument, id: string) { const i = p.entityIndex[id]; return i ? p.chunks[i.ownerChunkId]?.entities[id] : undefined; }
export function buildingChanged(p: ProjectDocument, b: BuildingRecord) { return b.locked || fingerprint(p.libraries.interactions[b.interactionId]) !== fingerprint(makeDoor(b.interactionId, b.doorId)) || Object.entries(b.entityHashes).some(([id, h]) => fingerprint(sourceEntity(p, id)) !== h); }
export function settlementPoint(r: SettlementRecipe, x: number, z: number) { const a = r.orientation * Math.PI / 180; return { x: r.center.x + x * Math.cos(a) + z * Math.sin(a), z: r.center.z - x * Math.sin(a) + z * Math.cos(a) }; }
export function planSettlement(p: ProjectDocument, raw: SettlementRecipe): SettlementPlan {
    if(Object.keys(p.chunkIndex).some(id=>!p.chunks[id]))throw Error('Charger tous les secteurs avant de calculer une implantation.');
    const started = performance.now(), r = validateSettlementRecipe(raw, p.world), previous = p.libraries.settlements?.[r.id], baseTerrain=settlementTerrain({...p,libraries:{...p.libraries,zones:Object.fromEntries(Object.entries(p.libraries.zones??{}).filter(([id,z])=>!previous?.zoneHashes?.[id]||fingerprint(z)!==previous.zoneHashes[id]))}}),c = layoutContext(r,baseTerrain), diagnostics: SettlementDiagnostic[] = [], entities: EntityDefinitionV3[] = [], paths: PathDefinition[] = [], buildings: BuildingRecord[] = [], preserved: string[] = [], removed: string[] = [];
    if(r.routeToPath&&!p.libraries.paths[r.routeToPath])diagnostics.push({severity:'ERROR',code:'SET_TARGET_PATH_MISSING',message:'La route à rejoindre est absente.'});
    const protectedBuildings = new Map((previous?.buildings ?? []).filter(b => buildingChanged(p, b)).map(b => [b.slot, b]));
    const removable = new Set((previous?.buildings ?? []).filter(b => !protectedBuildings.has(b.slot)).flatMap(b => [b.id, b.doorId]));
    for(const a of previous?.amenities??[])if(!amenityChanged(p,a))removable.add(a.id);
    const obstacles = collisionDefinitionsFromProject(p).filter(d => !removable.has(d.ownerId ?? d.id)); // protected footprints are checked separately below
    const query = new WorldCollisionQuery(c.height, () => null);
    for (const d of obstacles)
        query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(d.groundAnchor.x, d.groundAnchor.z) }, enabled: () => true });
    const protectedCenters = [...protectedBuildings.values()].map(b => sourceEntity(p, b.id)?.components.Transform?.position).filter((q): q is NonNullable<typeof q> => !!q);
    const {organic,lanes,pairs,step,half,roadZ,gap,streetWidth}=layoutDimensions(r);
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
    if(organic)paths.push(nativePath(r.id+'-civic-square',[settlementPoint(r,-4,0),settlementPoint(r,4,0)],12));
    let amenities:AmenityRecord[]=organic?planServices(p,r,roadZ,c,query,entities,paths,diagnostics,preserved,nativePath):[];
    const clearStreet = (points:{x:number;z:number}[],width:number) => points.slice(1).every((b,i)=>{
        const a=points[i],n=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/24));
        for(let j=0;j<n;j++){const from={x:a.x+(b.x-a.x)*j/n,z:a.z+(b.z-a.z)*j/n},to={x:a.x+(b.x-a.x)*(j+1)/n,z:a.z+(b.z-a.z)*(j+1)/n},m=query.sweep({...from,y:c.height(from.x,from.z)},{...to,y:c.height(to.x,to.z)},width/2,1.8);if(m.blockedX||m.blockedZ||m.pushed||Math.hypot(m.position.x-to.x,m.position.z-to.z)>.05)return false;}return true;
    });
    if(networkPattern(r)){const network=neighborhoodNetwork(r,c,clearStreet);for(const road of network)paths.push(nativePath(road.id,road.points,streetWidth));if(!network.length)diagnostics.push({severity:'ERROR',code:'SET_NETWORK_SITE',message:'Aucun quartier praticable dans cette zone.'});}
    else if(isCorridor(r)){const spine=corridorStreet(p,r,c,clearStreet);if(spine.reason)diagnostics.push({severity:'ERROR',code:'SET_CONTEXT_SITE',message:spine.reason});else paths.push(nativePath(r.id+'-street-0',spine.points,streetWidth));}
    else for(let lane=0;lane<lanes;lane++){
        if(organic){const points=organicStreet(r,lane,{...c,wet:(x,z)=>c.wet(x,z)||query.intersectsVolume({minX:x-.45,maxX:x+.45,minZ:z-.45,maxZ:z+.45,minY:c.height(x,z)+.2,maxY:c.height(x,z)+1.8})},clearStreet);if(points)paths.push(nativePath(r.id+'-street-'+lane,points,streetWidth));else diagnostics.push({severity:'ERROR',code:'SET_ORGANIC_ROAD',message:'Aucune courbe praticable dans cette zone. Réduire la taille, tourner l’implantation ou choisir un autre emplacement.'});}
        else{const x=(lane-(lanes-1)/2)*gap;addRoad(r.id+'-street-'+lane,settlementPoint(r,x,roadZ),settlementPoint(r,x,half+10),3.5);}
    }
    if(organic&&!isCorridor(r)&&!networkPattern(r)){const ring=organicArcs(r,paths,{...c,wet:(x,z)=>c.wet(x,z)||query.intersectsVolume({minX:x-.45,maxX:x+.45,minZ:z-.45,maxZ:z+.45,minY:c.height(x,z)+.2,maxY:c.height(x,z)+1.8})},clearStreet);for(const arc of ring.arcs)paths.push(nativePath(arc.id,arc.points,streetWidth));if(ring.omitted)diagnostics.push({severity:'WARNING',code:'SET_RING_GAP',message:'Certains passages périphériques ne tiennent pas dans le terrain. Les accès sont vérifiés par les autres rues.'});}
    else if(!organic&&lanes>1)addRoad(r.id+'-cross',lanePoint(r,0,roadZ),lanePoint(r,lanes-1,roadZ),3.5);
    if(r.layout?.pattern==='river'&&r.layout.riverBanks&&r.layout.riverBanks!=='single'){
        const crossing=riverCrossing(p,r,c,paths,clearStreet);
        if(crossing.entity&&crossing.paths&&crossing.record){entities.push(crossing.entity);amenities.push(crossing.record);if(crossing.preserved)preserved.push(crossing.entity.id,...crossing.paths.map(p=>p.id));for(const path of crossing.paths)paths.push({...nativePath(path.id,path.points,path.width),...(path.supportId?{supportId:path.supportId,kind:'wood' as const}:{})});for(const d of bridgeColliders(crossing.entity.id,crossing.entity.components.Transform!))query.add({...d,position:{...d.position,y:d.position.y+c.height(d.groundAnchor.x,d.groundAnchor.z)},enabled:()=>true});}
        else diagnostics.push({severity:r.layout.riverBanks==='required'?'ERROR':'WARNING',code:'SET_CROSSING_MISSING',message:crossing.reason??'Pont impraticable'});
    }
    if(r.maritimePort&&!previous?.amenities?.some(a=>a.role==='harbor'&&amenityChanged(p,a))){const port=settlementMaritimePort(p,r,c,paths,clearStreet);if(port){entities.push(port.entity);amenities.push(port.record);query.add({id:port.entity.id+'-reservation',shape:'box',position:{x:port.layout.stand.x,y:port.layout.stand.y,z:port.layout.stand.z},size:{x:6,y:4,z:6},enabled:()=>true});paths.push(nativePath(port.path.id,port.path.points,port.path.width));}else diagnostics.push({severity:'WARNING',code:'SET_MARITIME_SITE',message:'Aucun raccord N1 sûr trouvé avec les réglages portuaires existants. Déplacer le village vers une côte adaptée.'});}
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
        let t:TransformComponent,pos:{x:number;z:number},junction:{x:number;z:number};
        if(organic){const lane=Math.floor(slot/Math.ceil(r.targetBuildings/lanes)),street=paths.find(p=>p.id===r.id+'-street-'+(isCorridor(r)?(paths.some(p=>p.supportId)&&slot>=Math.ceil(r.targetBuildings*.65)?1:0):lane)),fit=paths.some(p=>p.id.includes('-street-'))?fitOrganicLot(r,slot,street?.points??[],c,query,paths):null;
            if(!fit){if(r.layout?.adjustments?.some(a=>a.slot===slot))diagnostics.push({severity:'ERROR',code:'SET_ADJUSTMENT_INVALID',targetId:r.id+'-house-'+slot,message:'Cette retouche ne laisse pas de place ou d’accès praticable pour la maison. Déplacer sa poignée vers un sol libre.'});continue;}t=fit.t;pos=fit.pos;junction=fit.junction;
        }else{
            const lane = Math.floor(slot / (pairs * 2)), pair = Math.floor(slot / 2) % pairs, sign = slot % 2 ? 1 : -1, laneX = (lane - (lanes - 1) / 2) * gap, x = laneX + sign * 9, z = pair * step - half, candidatePos = settlementPoint(r, x, z), yaw = r.orientation * Math.PI / 180 + sign * Math.PI / 2;
        pos=candidatePos;
        if (Math.hypot(x, z) > r.radius - 6)
            continue;
        t = { type: 'Transform', position: { ...pos, y: 0 }, rotation: yawQuaternion(yaw), scale: { x: 1, y: 1, z: 1 } };const samples = [[-3.4, -3.9], [0, -3.9], [3.4, -3.9], [-3.4, 0], [0, 0], [3.4, 0], [-3.4, 3.9], [0, 3.9], [3.4, 3.9]].map(([a, b]) => housePoint(t, a, 0, b)), heights = samples.map(q => c.height(q.x, q.z)), floor = Math.max(...heights);
        if (samples.some(q => q.x < c.bounds.minX + 1 || q.x > c.bounds.maxX - 1 || q.z < c.bounds.minZ + 1 || q.z > c.bounds.maxZ - 1 || c.wet(q.x, q.z)) || Math.min(...heights) <= c.seaLevel + 1 || floor - Math.min(...heights) > .35 || protectedCenters.some(q => Math.hypot(pos.x - q.x, pos.z - q.z) < 9.5))
            continue;
        // Sample the complete footprint against existing logical bodies, at usable body height.
        if (query.intersectsVolume({ minX: Math.min(...samples.map(q => q.x)), maxX: Math.max(...samples.map(q => q.x)), minZ: Math.min(...samples.map(q => q.z)), maxZ: Math.max(...samples.map(q => q.z)), minY: floor + .15, maxY: floor + 5.7 }))
            continue;
        const pathNear = paths.some(path => path.points.slice(1).some((b, i) => { const a = path.points[i], dx = b.x - a.x, dz = b.z - a.z, t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.z - a.z) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(a.x + dx * t - pos.x, a.z + dz * t - pos.z) < 4.7; }));
        if (pathNear)
            continue;
        t.position.y = floor - c.height(pos.x, pos.z);
        const entry = housePoint(t, 0, 0, -HOUSE.depth / 2 - 1.1);junction=settlementPoint(r,laneX,z);
        if (!inspectGroundSegment(entry, junction, c, { maxSlope: .35, widthM: 1.8 }).valid)
            continue;

        }
        const entry=housePoint(t,0,0,-HOUSE.depth/2-1.1),floor=c.height(pos.x,pos.z)+t.position.y,id=r.id+'-house-'+slot,doorId=id+'-door',interactionId=id+'-toggle';
        const variation = parseInt(fingerprint([r.seed, r.houseVariation, slot]).slice(0, 8), 16), style = r.style === 'auto' ? HABITAT_STYLES[variation % HABITAT_STYLES.length] : r.style;
        const house: EntityDefinitionV3 = { id, kind: 'building', name: (r.activity === 'forest' ? 'Maison forestière ' : r.activity === 'agriculture' ? 'Maison de ferme ' : 'Maison ') + (slot + 1), ownerChunkId: chunkAt(p.world, pos.x, pos.z), components: { Transform: t, Visual: { type: 'Visual', assetId: 'settlement.house_' + style }, Habitat: { type: 'Habitat', version: 1, doorId } } };
        const dp = housePoint(t, 0, 0, -HOUSE.depth / 2), door: EntityDefinitionV3 = { id: doorId, kind: 'prop', name: 'Porte · ' + house.name, ownerChunkId: chunkAt(p.world, dp.x, dp.z), parentId: id, components: { Transform: { ...structuredClone(t), position: { x: dp.x, y: floor - c.height(dp.x, dp.z), z: dp.z } }, Visual: { type: 'Visual', assetId: 'settlement.door' }, Collider: { type: 'Collider', shape: 'box', size: { x: HOUSE.doorWidth, y: HOUSE.doorHeight, z: .25 }, layer: 'solid' }, State: { type: 'State', initial: { open: false } }, Persistence: { type: 'Persistence', fields: ['open'] }, Interactable: { type: 'Interactable', prompt: 'Ouvrir / fermer la porte', range: 3, interactionIds: [interactionId] } } };
        entities.push(house, door);
        buildings.push({ id, doorId, interactionId, slot, entry: { x: entry.x, z: entry.z }, entityHashes: { [id]: fingerprint(house), [doorId]: fingerprint(door) }, locked: false });
        paths.push(nativePath(r.id + '-access-' + slot, [{ x: entry.x, z: entry.z }, junction], 1.8));
        if(organic)for(const d of habitatColliders(id,t))query.add({...d,position:{...d.position,y:d.position.y+c.height(pos.x,pos.z)},enabled:()=>true});
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
    for(const e of entities)if(e.components.Habitat&&e.components.Transform)for(const d of habitatColliders(e.id,e.components.Transform))query.add({...d,position:{...d.position,y:d.position.y+c.height(d.groundAnchor.x,d.groundAnchor.z)},enabled:()=>true});
    if(!organic)amenities=planServices(p,r,roadZ,c,query,entities,paths,diagnostics,preserved,nativePath);
    const dialogues:Record<string,import('../gameplay/schema.ts').GameplayDialogue>={};
    for(const a of previous?.amenities??[])if(['bridge','harbor'].includes(a.role)&&amenityChanged(p,a)&&!amenities.some(v=>v.id===a.id)){const e=sourceEntity(p,a.id);if(e){entities.push(structuredClone(e));amenities.push(structuredClone(a));preserved.push(a.id);for(const id of Object.keys(previous!.pathHashes)){const path=p.libraries.paths[id];if((path?.supportId===a.id||a.role==='harbor'&&id===r.id+'-harbor-access')&&!paths.some(p=>p.id===id))paths.push(structuredClone(path));}}}
    for(const a of previous?.amenities??[])if(!amenities.some(v=>v.id===a.id)&&!amenityChanged(p,a))removed.push(a.id);
    // Optional local connection to the nearest authored road, rather than one remote route per house.
    if (r.useExisting) {
        for (const e of entities)
            if (e.components.Habitat && e.components.Transform)
                for (const d of habitatColliders(e.id, e.components.Transform))
                    query.add({ ...d, position: { ...d.position, y: d.position.y + c.height(d.groundAnchor.x, d.groundAnchor.z) }, enabled: () => true });
        const routing = { ...baseTerrain, wet: (x: number, z: number) => baseTerrain.wet(x, z) || query.intersectsVolume({ minX: x - .45, maxX: x + .45, minZ: z - .45, maxZ: z + .45, minY: c.height(x, z) + .2, maxY: c.height(x, z) + 1.8 }) };
        const own = new Set(Object.keys(previous?.pathHashes ?? {})), origin = organic?(paths.find(p=>p.id===r.id+'-street-0')?.points.at(-1)??r.center):settlementPoint(r,0,roadZ), near = Object.values(p.libraries.paths).filter(v => !own.has(v.id) && (!v.id.includes('-access-')||v.id===r.routeToPath)&&(!r.routeToPath||v.id===r.routeToPath)).flatMap(path => path.points).map(q => ({ q, d: Math.hypot(q.x - origin.x, q.z - origin.z) })).filter(v => v.d > 3 && v.d < Math.min(r.radius * 2, 300)).sort((a, b) => a.d - b.d)[0];
        if(r.routeToPath&&!near)diagnostics.push({severity:'ERROR',code:'SET_TARGET_PATH_DISTANCE',message:'La route choisie est trop éloignée pour un raccord local.'});
        if (near) {
            const route = planGroundRoute(origin, near.q, routing, { maxSlope: .35, widthM: 3, maxCells: 4096 });
            if (route.points.length)
                paths.push(nativePath(r.id + '-regional', route.points, 3));
            else
                diagnostics.push({ severity: r.routeToPath?'ERROR':'WARNING', code: 'SET_REGIONAL_ACCESS', message: 'La route voisine ne peut pas être rejointe à pied depuis cette implantation.' });
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
    const zones=settlementSurroundings(p,r,paths,query,entities,amenities,diagnostics,preserved);
    // The source is compiled once: generated access roads + external authored
    // paths, excluding stale paths owned by the previous version of this village.
    const activeLife=!!(r.localLife&&r.residentRoutines);
    const generatedIds=new Set(paths.map(path=>path.id));
    const oldOwned=new Set(Object.keys(previous?.pathHashes??{}));
    const otherPaths=activeLife?Object.values(p.libraries.paths).filter(path=>!oldOwned.has(path.id)&&!generatedIds.has(path.id)):[];
    const bridgeIndex=new Map(entities.filter(e=>e.components.Bridge&&e.components.Transform)
      .map(e=>[e.id,e.components.Transform!] as const));
    const bridgeSurfaces:ResidentSurfaces={
      groundHeight:(x,z)=>c.height(x,z),
      supportHeight:(id,x,z)=>{
        const t=bridgeIndex.get(id)??sourceEntity(p,id)?.components.Transform;
        if(!t)return null;
        const a=2*Math.atan2(t.rotation.y,t.rotation.w),co=Math.cos(a),si=Math.sin(a);
        const dx=x-t.position.x,dz=z-t.position.z;
        if(Math.abs(dx*co-dz*si)>t.scale.x/2+.02||
          Math.abs(dx*si+dz*co)>t.scale.z/2-.12)return null;
        const deck=c.height(t.position.x,t.position.z)+t.position.y;
        if(deck<c.seaLevel+1||c.height(x,z)>deck+.05)return null;
        return deck;
      },
    };
    const assignment=createResidentAssignmentPlanner([...otherPaths,...(activeLife?paths:[])],c,{
      maxOccupantsPerHome:2,maxRouteM:650,surfaces:bridgeSurfaces,
      blocked:(x,z)=>query.intersectsVolume({minX:x-.22,maxX:x+.22,minZ:z-.22,maxZ:z+.22,
        minY:c.height(x,z)+.4,maxY:c.height(x,z)+1.5}),
    });
    const inhabitant=localLife(p,r,amenities,buildings,zones,assignment);
    if(inhabitant){
      entities.push(inhabitant.entity);amenities.push(inhabitant.record);
      if(inhabitant.dialogue)dialogues[inhabitant.dialogue.id]=inhabitant.dialogue;
      if(inhabitant.preserved)preserved.push(inhabitant.entity.id);
      if('warning' in inhabitant&&inhabitant.warning)diagnostics.push({severity:'WARNING',
        code:inhabitant.warning,message:'Le personnage d’accueil reste sur place : aucun trajet professionnel validé.'});
    }
    const population=settlementPopulation(p,r,amenities,buildings,zones,assignment);
    if(population.limited)diagnostics.push({severity:'WARNING',code:'LIFE_NPC_LIMIT',message:'Budget de PNJ atteint : certains habitants ne sont pas générés.'});
    for(const warning of population.warnings)diagnostics.push({severity:'WARNING',...warning});
    entities.push(...population.entities);amenities.push(...population.records);
    Object.assign(dialogues,population.dialogues);preserved.push(...population.preserved);
    for(const id of population.conflicts)diagnostics.push({severity:'ERROR',code:'LIFE_ID_CONFLICT',targetId:id,message:'Un personnage manuel utilise déjà cet identifiant.'});
    const questId=r.id+'-meet-neighbor',hasCollision=!!p.libraries.objectives[questId]&&!previous?.objectiveHashes?.[questId];
    const draftQuest=!hasCollision?planResidentVillageQuest(r,entities,dialogues,amenities,new Set(preserved)):null;
    const objectives=draftQuest?{[draftQuest.objective.id]:draftQuest.objective}:undefined;
    if(hasCollision&&activeLife)diagnostics.push({severity:'WARNING',code:'LIFE_QUEST_ID_CONFLICT',
      targetId:questId,message:'Un objectif auteur utilise déjà cet identifiant : aucune mission sociale générée.'});
    const lifeStats=activeLife?{...population.stats,graphNodes:assignment.graphNodes,graphTruncated:assignment.truncated}:undefined;
    return { zones,dialogues,...(objectives?{objectives}:{}),recipe: r, sourceHash: settlementSourceHash(p), recipeHash: fingerprint(r), entities, paths, buildings,...(r.services||r.waterfront||previous?.amenities?{amenities}:{}), diagnostics, preserved: [...new Set(preserved)], removed, generationMs: performance.now() - started,...(lifeStats?{lifeStats}:{}) };
}
export { HABITAT_ASSETS };
