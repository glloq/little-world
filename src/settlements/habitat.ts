/** Small hollow surface house. These dimensions drive BOTH visuals and physical openings. */
import { transformedCollider, type CollisionDefinition } from '../physics/definitions.ts';
import type { TransformComponent, AssetDefinition } from '../studio-core/types.ts';
export interface HabitatComponent {
    type: 'Habitat';
    version: 1;
    doorId: string;
}
export const HOUSE = { width: 6, depth: 7, height: 3.5, wall: .3, doorWidth: 2.4, doorHeight: 2.8 };
/** Historical three first (legacy 'auto' draws only those); themed looks from doc 104 §C6 after. */
export const HABITAT_STYLES = ['timber', 'stone', 'white', 'chalet', 'fisher', 'tropical', 'adobe', 'medieval'] as const;
export type HabitatStyle = typeof HABITAT_STYLES[number];
export const HABITAT_ASSETS: AssetDefinition[] = [{id:'settlement.bridge',name:'Pont piéton bois',type:'procedural',license:'project-original',source:'Little World flat supported bridge V1'},...HABITAT_STYLES.map(style => ({ id: 'settlement.house_' + style, name: 'Maison ' + style, type: 'procedural' as const, license: 'project-original', source: 'Little World original hollow habitat V1' })), { id: 'settlement.door', name: 'Porte de maison', type: 'procedural', license: 'project-original', source: 'Little World original door V1' }];
export interface HouseBox {
    key: string;
    x: number;
    z: number;
    bottom: number;
    sx: number;
    sy: number;
    sz: number;
}
export function houseBoxes(): HouseBox[] {
    const h = HOUSE, parts: HouseBox[] = [];
    const wall = (key: string, x: number, z: number, sx: number, sy: number, sz: number, bottom = 0) => parts.push({ key, x, z, bottom, sx, sy, sz });
    // Short pieces keep conservative rotated AABBs out of the doorway at 30–45 degrees.
    const strip = (key: string, x: number, z: number, length: number, alongX: boolean) => { const n = Math.ceil(length / .75); for (let i = 0; i < n; i++) {
        const a = (i + .5) * length / n - length / 2;
        wall(key + i, x + (alongX ? a : 0), z + (alongX ? 0 : a), alongX ? length / n : h.wall, h.height, alongX ? h.wall : length / n);
    } };
    strip('back', 0, h.depth / 2, h.width, true);
    strip('left', -h.width / 2, 0, h.depth, false);
    strip('right', h.width / 2, 0, h.depth, false);
    const side = (h.width - h.doorWidth) / 2;
    for (const sign of [-1, 1])
        strip('front' + sign, sign * (h.doorWidth / 2 + side / 2), -h.depth / 2, side, true);
    wall('lintel', 0, -h.depth / 2, h.doorWidth, h.height - h.doorHeight, h.wall, h.doorHeight);
    wall('floor', 0, 0, h.width, .16, h.depth, -.16);
    wall('roof', 0, 0, h.width + .5, .25, h.depth + .5, h.height);
    return parts;
}
export function housePoint(t: TransformComponent, x: number, y: number, z: number) { const q = t.rotation, px = x * t.scale.x, py = y * t.scale.y, pz = z * t.scale.z, tx = 2 * (q.y * pz - q.z * py), ty = 2 * (q.z * px - q.x * pz), tz = 2 * (q.x * py - q.y * px); return { x: t.position.x + px + q.w * tx + q.y * tz - q.z * ty, y: t.position.y + py + q.w * ty + q.z * tx - q.x * tz, z: t.position.z + pz + q.w * tz + q.x * ty - q.y * tx }; }
export function habitatColliders(id: string, t: TransformComponent): CollisionDefinition[] { return houseBoxes().map(b => { const d = transformedCollider(id + '::habitat:' + b.key, { shape: 'box', size: { x: b.sx, y: b.sy, z: b.sz } }, { ...t, position: housePoint(t, b.x, b.bottom, b.z) }); return { ...d, ownerId: id, groundAnchor: { x: t.position.x, z: t.position.z } }; }); }
