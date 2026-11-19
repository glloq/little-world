import {putZone,removeZone} from '../studio-core/zones.ts';
import {assetDefinitionFor} from '../world-production/registry.ts';
import {amenityChanged} from './services.ts';
import { parseProject } from '../studio-core/schema.ts';
/** Preview/commit ownership and transactional mutations. No mutation outside the caller's session. */
import type { ProjectDocument } from '../studio-core/types.ts';
import { ReferenceIndex } from '../studio-core/references.ts';
import { putEntity, removeEntity, putPath, removePath } from '../studio-core/source.ts';
import { lineChunkIds } from '../water/sectors.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
import { makeDoor } from '../gameplay/templates.ts';
import { settlementSourceHash, sourceEntity, buildingChanged, HABITAT_ASSETS, type SettlementPlan } from './planner.ts';
import type { SettlementInstance } from './schema.ts';
import { validateSettlements } from './validation.ts';
export function settlementChunkIds(p: ProjectDocument, plan: SettlementPlan): string[] { const ids = new Set<string>(); for (const e of plan.entities)
    ids.add(e.ownerChunkId); for (const path of plan.paths)
    for (const id of lineChunkIds(p.world, path))
        ids.add(id); const old = p.libraries.settlements?.[plan.recipe.id];for(const a of old?.amenities??[]){const e=p.entityIndex[a.id];if(e)ids.add(e.ownerChunkId);} for (const b of old?.buildings ?? [])
    for (const id of [b.id, b.doorId]) {
        const e = p.entityIndex[id];
        if (e)
            ids.add(e.ownerChunkId);
    } for (const id of Object.keys(old?.pathHashes ?? {})) {
    const path = p.libraries.paths[id];
    if (path)
        for (const k of lineChunkIds(p.world, path))
            ids.add(k);
} return [...ids]; }
function writePlan(p: ProjectDocument, plan: SettlementPlan) {
    const old = p.libraries.settlements?.[plan.recipe.id];
    // Snapshot author changes before mutating source entities. Re-evaluating
    // provenance after removeEntity would dereference a deleted actor.
    const protectedAmenities=new Set((old?.amenities??[])
        .filter(a=>amenityChanged(p,a)).map(a=>a.id));
    const missingZoneHashes=Object.fromEntries(Object.entries(old?.zoneHashes??{}).filter(([id])=>!p.libraries.zones?.[id]));
    p.assets = { ...p.assets };
    for(const e of plan.entities){const id=e.components.Visual?.assetId,asset=id?assetDefinitionFor(id):undefined;if(asset)p.assets[asset.id]=asset;}
    for (const a of HABITAT_ASSETS)
        p.assets[a.id] = structuredClone(a);
    p.libraries.interactions = { ...p.libraries.interactions };
    for (const b of old?.buildings ?? [])
        if (!plan.buildings.some(v => v.id === b.id) && !buildingChanged(p, b)) {
            removeEntity(p, b.doorId);
            removeEntity(p, b.id);
            if (fingerprint(p.libraries.interactions[b.interactionId]) === fingerprint(makeDoor(b.interactionId, b.doorId)))
                delete p.libraries.interactions[b.interactionId];
        }
    for (const id of Object.keys(old?.pathHashes ?? {}))
        if (!plan.paths.some(v => v.id === id) && fingerprint(p.libraries.paths[id]) === old!.pathHashes[id])
            removePath(p, id);
    for(const a of old?.amenities??[])
        if(!plan.amenities?.some(v=>v.id===a.id)&&!protectedAmenities.has(a.id))removeEntity(p,a.id);
    p.libraries.dialogues={...p.libraries.dialogues};
    for(const a of old?.amenities??[]){
        const dialogue=p.libraries.dialogues[a.id+'-talk'];
        if(a.dialogueHash&&!plan.amenities?.some(v=>v.id===a.id)&&!protectedAmenities.has(a.id)
            &&dialogue&&fingerprint(dialogue)===a.dialogueHash)delete p.libraries.dialogues[a.id+'-talk'];
    }
    for(const [id,dialogue]of Object.entries(plan.dialogues??{})){if(p.libraries.dialogues[id]&&!old?.amenities?.some(a=>a.id+'-talk'===id))throw Error('Dialogue déjà utilisé : '+id);p.libraries.dialogues[id]=structuredClone(dialogue);}
    for(const [id,hash]of Object.entries(old?.zoneHashes??{}))if(!plan.zones?.some(z=>z.id===id)&&p.libraries.zones?.[id]&&fingerprint(p.libraries.zones[id])===hash)removeZone(p,id);
    for(const z of plan.zones??[])putZone(p,z);
    for (const e of plan.entities)
        putEntity(p, e);
    for (const b of plan.buildings) {
        const existing = p.libraries.interactions[b.interactionId], expected = makeDoor(b.interactionId, b.doorId);
        if (existing && fingerprint(existing) !== fingerprint(expected) && !old?.buildings.some(o => o.interactionId === b.interactionId))
            throw Error('Identifiant d’interaction déjà utilisé');
        if (!existing)
            p.libraries.interactions[b.interactionId] = expected;
    }
    for (const path of plan.paths)
        putPath(p, path);
    const instance: SettlementInstance = { version: 1, id: plan.recipe.id, recipe: structuredClone(plan.recipe), buildings: structuredClone(plan.buildings),...(plan.amenities?{amenities:structuredClone(plan.amenities)}:{}),...(old?.suppressedAmenities?{suppressedAmenities:[...old.suppressedAmenities]}:{}), ...(plan.zones?.length||Object.keys(old?.zoneHashes??{}).length?{zoneHashes:{...missingZoneHashes,...Object.fromEntries((plan.zones??[]).map(z=>[z.id,plan.preserved.includes(z.id)?old!.zoneHashes![z.id]:fingerprint(z)]))}}:{}), pathHashes: Object.fromEntries(plan.paths.map(path => [path.id, old?.pathHashes[path.id] && plan.preserved.includes(path.id) ? old.pathHashes[path.id] : fingerprint(path)])), ...(old?.suppressedSlots ? { suppressedSlots: [...old.suppressedSlots] } : {}), revision: (old?.revision ?? 0) + 1 };
    p.libraries.settlements = { ...p.libraries.settlements, [instance.id]: instance };
}
export function previewSettlementProject(p: ProjectDocument, plan: SettlementPlan) { const draft = structuredClone(p); writePlan(draft, plan); return draft; }
export function applySettlement(p: ProjectDocument, plan: SettlementPlan): void {
    if (plan.sourceHash !== settlementSourceHash(p) || plan.recipeHash !== fingerprint(plan.recipe))
        throw Error('Aperçu périmé : recalculer avant de créer.');
    if (plan.diagnostics.some(d => d.severity === 'ERROR'))
        throw Error('Résoudre les erreurs du plan avant de créer.');
    for (const e of plan.entities) {
        const old = sourceEntity(p, e.id);
        if (old && !p.libraries.settlements?.[plan.recipe.id]?.buildings.some(b => b.id === e.id || b.doorId === e.id)&&!p.libraries.settlements?.[plan.recipe.id]?.amenities?.some(a=>a.id===e.id))
            throw Error('Identifiant déjà utilisé : ' + e.id);
    }
    const draft = previewSettlementProject(p, plan);
    parseProject(draft);
    const errors = validateSettlements(draft, plan.recipe.id).filter(d => d.severity === 'ERROR');
    if (errors.length)
        throw Error(errors.map(d => d.message).join('\n'));
    writePlan(p, plan);
}
export function lockSettlementBuilding(p: ProjectDocument, settlementId: string, buildingId: string, locked: boolean) { const all = structuredClone(p.libraries.settlements ?? {}), b = all[settlementId]?.buildings.find(b => b.id === buildingId); if (!b)
    throw Error('Maison inconnue'); b.locked = locked; p.libraries.settlements = all; }
export function removeSettlement(p: ProjectDocument, id: string) {
    const s = p.libraries.settlements?.[id];
    if (!s)
        return;
    const keepAmenities=(s.amenities??[]).filter(a=>amenityChanged(p,a)),keep = s.buildings.filter(b => buildingChanged(p, b)), owned = new Set([id,...Object.keys(s.pathHashes),...(s.amenities??[]).flatMap(a=>[a.id,...(a.dialogueHash?[a.id+'-talk']:[])]), ...s.buildings.flatMap(b => [b.id, b.doorId, b.interactionId])]), refs = new ReferenceIndex(p);
    for(const [zoneId,hash]of Object.entries(s.zoneHashes??{}))if(p.libraries.zones?.[zoneId]&&fingerprint(p.libraries.zones[zoneId])===hash&&refs.dependents(zoneId).some(v=>v!==id))throw Error('Une logique extérieure utilise cette parcelle : la déconnecter avant suppression');
    for (const b of s.buildings)
        if (!keep.includes(b))
            for (const target of [b.id, b.doorId, b.interactionId])
                if (refs.dependents(target).some(v => !owned.has(v)))
                    throw Error('Une logique extérieure référence cette implantation : la déconnecter avant suppression');
    for(const a of s.amenities??[])if(!keepAmenities.includes(a)){if(refs.dependents(a.id).some(v=>!owned.has(v)))throw Error('Une logique extérieure référence cet équipement');removeEntity(p,a.id);if(a.dialogueHash&&fingerprint(p.libraries.dialogues[a.id+'-talk'])===a.dialogueHash)delete p.libraries.dialogues[a.id+'-talk'];}
    p.libraries.interactions = { ...p.libraries.interactions };
    for (const b of s.buildings)
        if (!keep.includes(b)) {
            removeEntity(p, b.doorId);
            removeEntity(p, b.id);
            if (fingerprint(p.libraries.interactions[b.interactionId]) === fingerprint(makeDoor(b.interactionId, b.doorId)))
                delete p.libraries.interactions[b.interactionId];
        }
    for (const [key, h] of Object.entries(s.pathHashes))
        if (fingerprint(p.libraries.paths[key]) === h && !keep.some(b => key === id + '-access-' + b.slot) && !keep.length&&!keepAmenities.length) {
            if (refs.dependents(key).some(v => v !== id))
                throw Error('Une autre zone utilise ce chemin : la déconnecter avant suppression');
            removePath(p, key);
        }
    for(const [zoneId,hash]of Object.entries(s.zoneHashes??{}))if(p.libraries.zones?.[zoneId]&&fingerprint(p.libraries.zones[zoneId])===hash)removeZone(p,zoneId);
    const all = { ...p.libraries.settlements };
    delete all[id];
    p.libraries.settlements = all;
}
/** Authoring locks remain project data and also protect edits made through other Studio tools. */
export function assertSettlementLocks(before: ProjectDocument, after: ProjectDocument) {for(const s of Object.values(before.libraries.settlements??{}))for(const a of s.amenities??[])if(a.locked&&fingerprint(sourceEntity(before,a.id))!==fingerprint(sourceEntity(after,a.id)))throw Error('Équipement verrouillé : le déverrouiller dans Villages & villes.'); for (const s of Object.values(before.libraries.settlements ?? {}))
    for (const b of s.buildings)
        if (b.locked) {
            for (const id of [b.id, b.doorId])
                if (fingerprint(sourceEntity(before, id)) !== fingerprint(sourceEntity(after, id)))
                    throw Error('Maison verrouillée : la déverrouiller dans Villages & villes.');
        } }
export function removeSettlementBuilding(p: ProjectDocument, id: string, buildingId: string) {
    const original = p.libraries.settlements?.[id], b = original?.buildings.find(b => b.id === buildingId);
    if (!original || !b)
        throw Error('Maison inconnue');
    if (b.locked)
        throw Error('Déverrouiller la maison avant suppression');
    const refs = new ReferenceIndex(p), owned = new Set([b.id, b.doorId, b.interactionId]);
    for (const target of owned)
        if (refs.dependents(target).some(v => !owned.has(v) && v !== id))
            throw Error('Une logique extérieure référence cette maison : la déconnecter avant suppression');
    removeEntity(p, b.doorId);
    removeEntity(p, b.id);
    const interaction = p.libraries.interactions[b.interactionId];
    if (fingerprint(interaction) !== fingerprint(makeDoor(b.interactionId, b.doorId)))
        throw Error('Interaction retouchée : la déconnecter avant suppression');
    p.libraries.interactions = { ...p.libraries.interactions };
    delete p.libraries.interactions[b.interactionId];
    const pathId = id + '-access-' + b.slot;
    if (p.libraries.paths[pathId] && fingerprint(p.libraries.paths[pathId]) !== original.pathHashes[pathId])
        throw Error('Accès retouché : le détacher avant suppression');
    removePath(p, pathId);
    const all = structuredClone(p.libraries.settlements!), s = all[id];
    s.buildings = s.buildings.filter(v => v.id !== buildingId);
    s.suppressedSlots = [...new Set([...s.suppressedSlots ?? [], b.slot])];
    delete s.pathHashes[pathId];
    p.libraries.settlements = all;
}

export function lockSettlementAmenity(p:ProjectDocument,id:string,amenityId:string,locked:boolean){const all=structuredClone(p.libraries.settlements??{}),a=all[id]?.amenities?.find(a=>a.id===amenityId);if(!a)throw Error('Équipement inconnu');a.locked=locked;p.libraries.settlements=all;}
export function removeSettlementAmenity(p:ProjectDocument,id:string,amenityId:string){const old=p.libraries.settlements?.[id],a=old?.amenities?.find(a=>a.id===amenityId);if(!old||!a)throw Error('Équipement inconnu');if(a.locked)throw Error('Déverrouiller cet équipement avant suppression');const refs=new ReferenceIndex(p);if(refs.dependents(a.id).some(v=>v!==id))throw Error('Déconnecter les liens extérieurs avant suppression');const pathId=id+'-civic-access-'+a.role;if(p.libraries.paths[pathId]&&fingerprint(p.libraries.paths[pathId])!==old.pathHashes[pathId])throw Error('Accès retouché : le détacher avant suppression');removeEntity(p,a.id);removePath(p,pathId);const all=structuredClone(p.libraries.settlements!),s=all[id];s.amenities=s.amenities!.filter(v=>v.id!==a.id);s.suppressedAmenities=[...new Set([...s.suppressedAmenities??[],a.role])];delete s.pathHashes[pathId];p.libraries.settlements=all;}
