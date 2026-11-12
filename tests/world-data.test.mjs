import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultWorld, parseWorld, EditHistory } from '../src/world-data.ts';
import { configureTerrain } from '../src/terrain.ts';

const placed = (overrides = {}) => ({
  id: 'tree-a',
  assetId: 'nature.pine',
  x: -24,
  z: -183,
  rotation: 0,
  scale: 1,
  ...overrides,
});
const stroke = (overrides = {}) => ({
  id: 'stroke-a',
  x: -24,
  z: -183,
  radius: 8,
  strength: 2,
  mode: 'raise',
  height: 10,
  ...overrides,
});
const malformed = (edit) => {
  const d = defaultWorld();
  edit(d);
  return d;
};

test('version one maps migrate with placements, seed and density preserved', () => {
  const original = {
    schemaVersion: 1,
    config: { seed: 42, density: 0.5 },
    placements: [placed()],
  };
  const d = parseWorld(original);
  assert.equal(d.schemaVersion, 2);
  assert.equal(d.config.width, 200);
  assert.equal(d.config.length, 600);
  assert.equal(d.config.seed, 42);
  assert.equal(d.config.density, 0.5);
  assert.deepEqual(d.placements, original.placements);
  assert.deepEqual([d.terrain, d.water, d.paths, d.biomes], [[], [], [], []]);
  d.placements[0].x = 0;
  assert.equal(original.placements[0].x, -24);
});

test('legacy placements near the north edge retain their valid coordinates', () => {
  const d = parseWorld({
    schemaVersion: 1,
    config: { seed: 42, density: 1 },
    placements: [placed({ z: -287 })],
  });
  assert.equal(d.placements[0].z, -287);
});

test('all editable layers, dialogue data and stable IDs survive JSON round trip', () => {
  const d = defaultWorld();
  d.placements = [placed()];
  d.terrain = [stroke()];
  d.biomes = [
    {
      id: 'biome-a',
      x: -24,
      z: -183,
      radius: 10,
      biome: 'meadow',
      density: 0.5,
    },
  ];
  d.water = [
    {
      id: 'water-a',
      points: [
        { x: 25, z: 50 },
        { x: 35, z: 65 },
      ],
      width: 8,
      level: 3,
      depth: 2,
    },
  ];
  d.paths = [
    {
      id: 'path-a',
      points: [
        { x: 20, z: 40 },
        { x: 24, z: 60 },
      ],
      width: 3,
    },
  ];
  assert.deepEqual(parseWorld(JSON.parse(JSON.stringify(d))), d);
  const parsed = parseWorld(d);
  parsed.npcs[0].dialogue.lines[0].text = 'Changed';
  assert.notEqual(d.npcs[0].dialogue.lines[0].text, 'Changed');
});

test('malformed and non-finite map values are rejected in every layer', () => {
  for (const d of [
    null,
    [],
    {},
    { schemaVersion: 2, config: null },
    malformed((d) => (d.schemaVersion = 999)),
    malformed((d) => (d.config.seed = NaN)),
    malformed((d) => (d.config.density = Infinity)),
    malformed((d) => (d.config.width = 2001)),
    malformed((d) => (d.config.generatorVersion = 2)),
    malformed((d) => (d.placements = [null])),
    malformed((d) => (d.placements = [placed({ x: Infinity })])),
    malformed(
      (d) =>
        (d.placements = [placed({ assetId: 'https://example.com/model.glb' })]),
    ),
    malformed((d) => (d.terrain = [null])),
    malformed((d) => (d.terrain = [stroke({ strength: NaN })])),
    malformed(
      (d) =>
        (d.biomes = [
          { id: 'b', x: 0, z: 0, radius: 2, biome: 'unknown', density: 1 },
        ]),
    ),
    malformed(
      (d) =>
        (d.water = [
          {
            id: 'w',
            points: [null, { x: 0, z: 0 }],
            width: 5,
            level: 0,
            depth: 2,
          },
        ]),
    ),
    malformed(
      (d) => (d.paths = [{ id: 'p', points: [{ x: 0, z: 0 }], width: 5 }]),
    ),
    malformed((d) => (d.npcs = [null])),
    malformed((d) => (d.npcs[0].dialogue.lines[0].choices[0].next = 'missing')),
  ]) {
    assert.throws(() => parseWorld(d));
  }
});

test('duplicate stable identifiers and excessive collection sizes are rejected', () => {
  for (const d of [
    malformed((d) => (d.placements = [placed(), placed()])),
    malformed((d) => (d.terrain = [stroke(), stroke()])),
    malformed((d) => d.npcs.push(structuredClone(d.npcs[0]))),
    malformed(
      (d) =>
        (d.placements = Array.from({ length: 2001 }, (_, i) =>
          placed({ id: String(i) }),
        )),
    ),
  ])
    assert.throws(() => parseWorld(d));
});

test('new large maps validate against their own bounds rather than the current world', () => {
  configureTerrain({ seed: 1, density: 1, width: 200, length: 600 });
  const d = defaultWorld();
  d.config.width = 1000;
  d.config.length = 1000;
  d.placements = [placed({ x: 450, z: 450 })];
  d.npcs[0].x = 450;
  d.npcs[0].path = [
    { x: 450, z: 450 },
    { x: 460, z: 460 },
  ];
  assert.equal(parseWorld(d).npcs[0].x, 450);
  d.npcs[0].path[1].x = 510;
  assert.throws(() => parseWorld(d));
  d.npcs[0].path[1].x = 460;
  d.placements[0].z = 490;
  assert.throws(() => parseWorld(d));
});

test('undo redo snapshots are isolated and a new edit discards redo history', () => {
  const history = new EditHistory(2),
    state = { objects: [{ id: 'a', x: 0 }] };
  assert.equal(history.undo(state), undefined);
  assert.equal(history.canUndo, false);
  history.record(state);
  state.objects[0].x = 1;
  const restored = history.undo(state);
  assert.equal(restored.objects[0].x, 0);
  assert.equal(history.canRedo, true);
  restored.objects[0].x = -1;
  const redone = history.redo(restored);
  assert.equal(redone.objects[0].x, 1);
  history.record(redone);
  redone.objects[0].x = 2;
  history.undo(redone);
  history.record({ objects: [] });
  assert.equal(history.canRedo, false);
  assert.equal(history.redo(redone), undefined);
});

test('bounded history keeps only its newest checkpoints', () => {
  const history = new EditHistory(2);
  for (let n = 0; n < 3; n++) history.record({ n });
  assert.deepEqual(history.undo({ n: 3 }), { n: 2 });
  assert.deepEqual(history.undo({ n: 2 }), { n: 1 });
  assert.equal(history.undo({ n: 1 }), undefined);
});
