import test from 'node:test';
import assert from 'node:assert/strict';
import { HOUSE, habitatColliders, housePoint } from '../src/settlements/habitat.ts';
import { WorldCollisionQuery } from '../src/physics/collision-world.ts';
import { transformedCollider } from '../src/physics/definitions.ts';
import { yawQuaternion } from '../src/studio-core/transforms.ts';
const fixture = (yaw = 0) => { const t = { type: 'Transform', position: { x: 0, y: 0, z: 0 }, rotation: yawQuaternion(yaw), scale: { x: 1, y: 1, z: 1 } }, c = new WorldCollisionQuery(() => 0, () => null); let open = false; for (const d of habitatColliders('home', t))
    c.add({ ...d, enabled: () => true }); const door = transformedCollider('door', { shape: 'box', size: { x: HOUSE.doorWidth, y: HOUSE.doorHeight, z: .3 } }, { ...t, position: housePoint(t, 0, 0, -HOUSE.depth / 2) }); c.add({ ...door, enabled: () => !open }); return { t, c, open: () => open = true }; };
test('a hollow house has an independent door, solid walls and a ceiling at every tested angle', () => { for (const yaw of [0, Math.PI / 6, Math.PI / 4, Math.PI / 2]) {
    const { t, c, open } = fixture(yaw), a = housePoint(t, 0, 0, -6), b = housePoint(t, 0, 0, 0);
    const closed = c.sweep(a, b, .4, 1.8);
    assert.ok(Math.hypot(closed.position.x - b.x, closed.position.z - b.z) > 2, 'closed door');
    open();
    const passed = c.sweep(a, b, .4, 1.8);
    assert.ok(Math.hypot(passed.position.x - b.x, passed.position.z - b.z) < .02, 'open door angle ' + yaw);
    const wall = c.sweep(housePoint(t, 0, 0, 1), housePoint(t, 8, 0, 1), .4, 1.8);
    assert.ok(wall.blockedX || wall.blockedZ);
    const up = c.sweep(b, { ...b, y: 8 }, .4, 1.8);
    assert.ok(up.blockedY);
} });
test('walls stop fast gliding and rolling independently from the open barrier', () => { for (const yaw of [0, Math.PI / 4]) {
    const { t, c, open } = fixture(yaw);
    open();
    for (const y of [0, .6, 1]) {
        const m = c.sweep(housePoint(t, -35, y, 1), housePoint(t, 35, y, 1), .4, y ? 1.1 : .7);
        assert.ok(m.blockedX || m.blockedZ);
        assert.ok(Math.hypot(m.position.x, m.position.z) < 8);
    }
} });
test('interaction sightlines use the same enabled physical walls and reject the rear facade', () => { const { c, open } = fixture(), target = { x: 0, y: 1.2, z: -3.5 }; assert.equal(c.occluded({ x: 0, y: 1.2, z: -6 }, target, ['door']), false); assert.equal(c.occluded({ x: 0, y: 1.2, z: 5 }, target, ['door']), true); assert.equal(c.occluded({ x: 0, y: 1.2, z: -6 }, { x: 0, y: 1.2, z: 0 }), true); open(); assert.equal(c.occluded({ x: 0, y: 1.2, z: -6 }, { x: 0, y: 1.2, z: 0 }), false); });
