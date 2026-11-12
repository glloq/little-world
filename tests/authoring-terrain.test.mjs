import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureTerrain,
  terrainHeight,
  waterSurface,
  insideWorld,
  pathDistance,
} from '../src/terrain.ts';
import { spawnPlayer, simulatePlayer } from '../src/player.ts';
import { spawnBoat, boatSurfaceAt } from '../src/boat.ts';
import { defaultWorld } from '../src/world-data.ts';
const config = defaultWorld().config;
const neutral = {
  forward: 0,
  right: 0,
  run: false,
  jumpPressed: false,
  spaceHeld: false,
  dive: false,
  cameraYaw: 0,
};
test('authored relief affects movement, survives configuration and leaves distant terrain unchanged', () => {
  configureTerrain(config);
  const before = terrainHeight(-24, -183),
    far = terrainHeight(70, -50);
  try {
    configureTerrain(config, [
      {
        id: 'hill',
        x: -24,
        z: -183,
        radius: 15,
        strength: 4,
        mode: 'raise',
        height: 0,
      },
    ]);
    const p = spawnPlayer();
    assert.ok(p.position.y > before + 3.9);
    simulatePlayer(p, neutral, 1 / 60);
    assert.ok(p.position.y >= terrainHeight(-24, -183));
    assert.equal(terrainHeight(70, -50), far);
  } finally {
    configureTerrain(config);
  }
  assert.equal(terrainHeight(-24, -183), before);
});
test('authored river shares rendering-independent water and swimming collision data', () => {
  try {
    configureTerrain(
      config,
      [],
      [
        {
          id: 'pool',
          points: [
            { x: -35, z: -190 },
            { x: -35, z: -170 },
          ],
          width: 12,
          level: 15,
          depth: 4,
        },
      ],
    );
    assert.equal(waterSurface(-35, -180), 15);
    assert.ok(terrainHeight(-35, -180) <= 11);
    const p = spawnPlayer();
    p.position.set(-35, 15, -180);
    simulatePlayer(p, neutral, 1 / 60);
    assert.equal(p.mode, 'swim');
    assert.notEqual(waterSurface(-60, -180), 15);
  } finally {
    configureTerrain(config);
  }
});
test('large-map limits, sea level and authored path exclusions use the same configuration', () => {
  try {
    configureTerrain(
      { ...config, width: 2000, length: 2000, seaLevel: 5 },
      [],
      [],
      [
        {
          id: 'road',
          points: [
            { x: 400, z: 0 },
            { x: 450, z: 0 },
          ],
          width: 6,
        },
      ],
    );
    assert.ok(insideWorld(900, 900));
    assert.ok(!insideWorld(999, 999));
    assert.ok(pathDistance(420, 0) < 0);
    assert.equal(waterSurface(700, 800), 5);
    assert.equal(spawnBoat().y, 4.85);
    assert.equal(boatSurfaceAt(-17, 220), 5);
  } finally {
    configureTerrain(config);
  }
});
