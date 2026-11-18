/** Authored local use pose; projection is shared by source and compiled gameplay. */
import type { TransformComponent, Vector3 } from '../studio-core/types.ts';
import type { GameplayEntity, Point3 } from './schema.ts';
import type { WorldCollisionQuery } from '../physics/collision-world.ts';
import { SHOPS, type ShopKind } from './economy.ts';
export interface ShopAccessComponent {
    type: 'ShopAccess';
    version: 1;
    offset: Vector3;
    yaw: number;
    width: number;
    range: number;
}
export interface ShopAccessPose {
    offset: Point3;
    forward: {
        x: number;
        z: number;
    };
    width: number;
    range: number;
}
export function projectShopAccess(c: ShopAccessComponent, t: TransformComponent): ShopAccessPose {
    const q = t.rotation, v = { x: c.offset.x * t.scale.x, y: c.offset.y * t.scale.y, z: c.offset.z * t.scale.z }, tx = 2 * (q.y * v.z - q.z * v.y), ty = 2 * (q.z * v.x - q.x * v.z), tz = 2 * (q.x * v.y - q.y * v.x), yaw = 2 * Math.atan2(q.y, q.w) + c.yaw;
    return { offset: { x: v.x + q.w * tx + q.y * tz - q.z * ty, y: v.y + q.w * ty + q.z * tx - q.x * tz, z: v.z + q.w * tz + q.x * ty - q.y * tx }, forward: { x: -Math.sin(yaw), z: -Math.cos(yaw) }, width: c.width * Math.min(t.scale.x, t.scale.z), range: c.range };
}
export function validShopPose(v: unknown): v is ShopAccessPose { const p = v as ShopAccessPose; return !!p && !!p.offset && !!p.forward && [p.offset.x, p.offset.y, p.offset.z, p.forward.x, p.forward.z, p.width, p.range].every(Number.isFinite) && Math.hypot(p.offset.x, p.offset.y, p.offset.z) <= 1000 && Math.abs(Math.hypot(p.forward.x, p.forward.z) - 1) < .001 && p.width >= .1 && p.width <= 600 && p.range >= .5 && p.range <= 6; }
/** Derived trigonometric projections may differ by an ulp across JS engines. Authored state stays exact. */
export function sameProjectedShopPose(a:ShopAccessPose|undefined,b:ShopAccessPose|undefined):boolean{
 if(a===undefined||b===undefined)return a===b;
 if(!validShopPose(a)||!validShopPose(b))return false;
 // Preserve strict shape checking: unknown data is not hidden by numeric tolerance.
 const sameKeys=(x:object,y:object)=>JSON.stringify(Object.keys(x).sort())===JSON.stringify(Object.keys(y).sort());
 if(!sameKeys(a,b)||!sameKeys(a.offset,b.offset)||!sameKeys(a.forward,b.forward))return false;
 const values=(p:ShopAccessPose)=>[p.offset.x,p.offset.y,p.offset.z,p.forward.x,p.forward.z,p.width,p.range];
 const bv=values(b);return values(a).every((v,i)=>Math.abs(v-bv[i])<=1e-9);
}
export function accessibleShop(entity: GameplayEntity, position: Point3, collision: WorldCollisionQuery, facing?: {
    x: number;
    z: number;
}): {
    id: string;
    kind: ShopKind;
    distance: number;
} | null {
    const kind = entity.initialState.shop;
    if (typeof kind !== 'string' || !Object.hasOwn(SHOPS, kind) || !entity.position)
        return null;
    const pose = entity.shopAccess, anchor = { x: entity.position.x + (pose?.offset.x ?? 0), y: entity.position.y + (pose?.offset.y ?? 0), z: entity.position.z + (pose?.offset.z ?? 0) }, dx = anchor.x - position.x, dz = anchor.z - position.z, d = Math.hypot(dx, anchor.y - position.y, dz);
    if (d > (pose?.range ?? 3.2))
        return null;
    if (pose) {
        const ox = position.x - anchor.x, oz = position.z - anchor.z;
        if (ox * pose.forward.x + oz * pose.forward.z < -.15 || Math.abs(ox * pose.forward.z - oz * pose.forward.x) > pose.width / 2)
            return null;
    }
    if (facing && d > .5 && (dx * facing.x + dz * facing.z) / (Math.hypot(dx, dz) || 1) < .6)
        return null;
    if (collision.occluded({ ...position, y: position.y + 1.2 }, { ...anchor, y: anchor.y + 1.2 }, [entity.id]))
        return null;
    return { id: entity.id, kind: kind as ShopKind, distance: d };
}
