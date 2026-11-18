import type { WorldDefinitionV3 } from '../studio-core/types.ts';
import { HABITAT_STYLES, type HabitatStyle } from './habitat.ts';
export interface SettlementRecipe {
    version: 1;
    id: string;
    name: string;
    seed: number;
    form: 'hamlet' | 'village' | 'town';
    center: {
        x: number;
        z: number;
    };
    radius: number;
    orientation: number;
    targetBuildings: number;
    style: 'auto' | HabitatStyle;
    wealth: 0 | 1 | 2;
    activity: 'mixed' | 'agriculture' | 'forest' | 'mine' | 'fishing' | 'commerce';
    services?:boolean;
    houseVariation: number;
    useExisting: boolean;
}
export interface BuildingRecord {
    id: string;
    doorId: string;
    interactionId: string;
    slot: number;
    entry: {
        x: number;
        z: number;
    };
    entityHashes: Record<string, string>;
    locked: boolean;
}
export interface AmenityRecord {id:string;role:string;entityHash:string;entry:{x:number;z:number};locked:boolean}
export interface SettlementInstance {
    amenities?:AmenityRecord[];
    suppressedAmenities?:string[];
    version: 1;
    id: string;
    recipe: SettlementRecipe;
    buildings: BuildingRecord[];
    pathHashes: Record<string, string>;
    suppressedSlots?: number[];
    revision: number;
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v) && [null, Object.prototype].includes(Object.getPrototypeOf(v));
const num = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,100}$/.test(v);
function fields(v: Record<string, unknown>, list: string[]) { if (Object.keys(v).some(k => !list.includes(k)))
    throw Error('Établissement : champ inconnu'); }
export function validateSettlementRecipe(raw: unknown, world: WorldDefinitionV3): SettlementRecipe {
    if (!obj(raw))
        throw Error('Recette d’établissement invalide');
    fields(raw, ['version', 'id', 'name', 'seed', 'form', 'center', 'radius', 'orientation', 'targetBuildings', 'style', 'wealth', 'activity', 'houseVariation', 'useExisting','services']);
    if (raw.version !== 1 || !id(raw.id) || String(raw.id).length > 64 || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 100 || !num(raw.seed, 0, 0xffffffff) || !Number.isInteger(raw.seed) || !['hamlet', 'village', 'town'].includes(String(raw.form)) || !['auto', ...HABITAT_STYLES].includes(String(raw.style)) || ![0, 1, 2].includes(raw.wealth as number) || !['mixed', 'agriculture', 'forest','mine','fishing','commerce'].includes(String(raw.activity)) || !num(raw.targetBuildings, 1, 80) || !Number.isInteger(raw.targetBuildings) || !num(raw.houseVariation, 0, 0xffffffff) || !Number.isInteger(raw.houseVariation) || !num(raw.radius, 20, 600) || !num(raw.orientation, -360, 360) || typeof raw.useExisting !== 'boolean')
        throw Error('Recette d’établissement hors limites');
    if(raw.services!==undefined&&typeof raw.services!=='boolean')throw Error('Services invalides');
    if (!obj(raw.center))
        throw Error('Centre absent');
    fields(raw.center, ['x', 'z']);
    const b = world.bounds;
    if (!num(raw.center.x, b.minX, b.maxX) || !num(raw.center.z, b.minZ, b.maxZ))
        throw Error('Centre hors du monde');
    return structuredClone(raw) as unknown as SettlementRecipe;
}
export function validateSettlement(raw: unknown, world: WorldDefinitionV3): SettlementInstance {
    if (!obj(raw))
        throw Error('Établissement invalide');
    fields(raw, ['version', 'id', 'recipe', 'buildings', 'pathHashes', 'suppressedSlots', 'revision','amenities','suppressedAmenities']);
    if (raw.version !== 1 || !id(raw.id) || !num(raw.revision, 1, 1e9) || !Number.isInteger(raw.revision) || !Array.isArray(raw.buildings) || raw.buildings.length > 80 || !obj(raw.pathHashes))
        throw Error('Établissement hors limites');
    if (raw.suppressedSlots !== undefined && (!Array.isArray(raw.suppressedSlots) || raw.suppressedSlots.length > 80 || new Set(raw.suppressedSlots).size !== raw.suppressedSlots.length || raw.suppressedSlots.some(v => !num(v, 0, 79) || !Number.isInteger(v))))
        throw Error('Suppressions de parcelles invalides');
    if(raw.amenities!==undefined){if(!Array.isArray(raw.amenities)||raw.amenities.length>12)throw Error('Équipements hors limites');const seen=new Set<string>();for(const a of raw.amenities){if(!obj(a))throw Error('Équipement invalide');fields(a,['id','role','entityHash','entry','locked']);if(!id(a.id)||seen.has(String(a.id))||!['counter','well','bench','mill','fire'].includes(String(a.role))||typeof a.entityHash!=='string'||!/^[a-f0-9]{16}$/.test(a.entityHash)||typeof a.locked!=='boolean'||!obj(a.entry))throw Error('Équipement invalide');fields(a.entry,['x','z']);if(!num(a.entry.x,world.bounds.minX,world.bounds.maxX)||!num(a.entry.z,world.bounds.minZ,world.bounds.maxZ))throw Error('Entrée équipement hors monde');seen.add(String(a.id));}}
    if(raw.suppressedAmenities!==undefined&&(!Array.isArray(raw.suppressedAmenities)||raw.suppressedAmenities.length>5||new Set(raw.suppressedAmenities).size!==raw.suppressedAmenities.length||raw.suppressedAmenities.some(v=>!['counter','well','bench','mill','fire'].includes(String(v)))))throw Error('Suppressions équipements invalides');
    const recipe = validateSettlementRecipe(raw.recipe, world);
    if (recipe.id !== raw.id)
        throw Error('Recette non liée');
    const ids = new Set<string>(), slots = new Set<number>();
    const hashes = (v: unknown, max: number) => { if (!obj(v) || Object.keys(v).length > max || Object.entries(v).some(([k, h]) => !id(k) || typeof h !== 'string' || !/^[a-f0-9]{16}$/.test(h)))
        throw Error('Provenance invalide'); };
    hashes(raw.pathHashes, 256);
    for (const v of raw.buildings) {
        if (!obj(v))
            throw Error('Bâtiment invalide');
        fields(v, ['id', 'doorId', 'interactionId', 'slot', 'entry', 'entityHashes', 'locked']);
        if (!id(v.id) || !id(v.doorId) || !id(v.interactionId) || typeof v.locked !== 'boolean' || !num(v.slot, 0, 79) || !Number.isInteger(v.slot) || slots.has(v.slot as number) || ids.has(String(v.id)) || ids.has(String(v.doorId)) || !obj(v.entry))
            throw Error('Bâtiment invalide');
        fields(v.entry, ['x', 'z']);
        if (!num(v.entry.x, world.bounds.minX, world.bounds.maxX) || !num(v.entry.z, world.bounds.minZ, world.bounds.maxZ))
            throw Error('Entrée hors monde');
        hashes(v.entityHashes, 2);
        if (Object.keys(v.entityHashes as object).sort().join('|') !== [v.id, v.doorId].sort().join('|'))
            throw Error('Provenance maison incomplète');
        ids.add(String(v.id));
        ids.add(String(v.doorId));
        slots.add(v.slot as number);
    }
    return structuredClone(raw) as unknown as SettlementInstance;
}
export function newSettlement(world: WorldDefinitionV3, id: string, center = { x: 0, z: 0 }): SettlementRecipe { return { version: 1, id, name: 'Nouveau village', seed: world.seed >>> 0, form: 'hamlet', center, radius: 90, orientation: 0, targetBuildings: 12, style: 'auto', wealth: 1, activity: 'mixed', houseVariation: 0, useExisting: true }; }
