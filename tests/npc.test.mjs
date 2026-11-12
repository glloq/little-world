import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_NPCS,
  canNPCWalk,
  createNPCState,
  updateNPC,
  validateNPCs,
  npcActivity,
  npcVisualTier,
  npcDecisionInterval,
  npcInterpolationAlpha,
} from '../src/npc.ts';
import { createDialogue, validDialogue } from '../src/dialogue.ts';
import { terrainHeight, waterSurface } from '../src/terrain.ts';

test('NPC catalogue and malformed imported data are validated', () => {
  assert.equal(validateNPCs(DEFAULT_NPCS), true);
  for (const value of [
    null,
    {},
    [null],
    [{}],
    [...DEFAULT_NPCS, DEFAULT_NPCS[0]],
  ])
    assert.equal(validateNPCs(value), false);
  const invalid = structuredClone(DEFAULT_NPCS);
  invalid[0].speed = Infinity;
  assert.equal(validateNPCs(invalid), false);
  const dialogue = structuredClone(DEFAULT_NPCS[0].dialogue);
  dialogue.lines[0].choices[0].next = 'missing';
  assert.equal(validDialogue(dialogue), false);
});
test('dialogue choices follow nodes, filter conditions, set flags and close', () => {
  const flags = Object.create(null);
  const session = createDialogue(
    {
      start: 'a',
      lines: [
        {
          id: 'a',
          text: 'Bonjour',
          choices: [
            { text: 'Secret', condition: { flag: 'met', equals: true } },
            { text: 'Suite', next: 'b', action: { flag: 'met', value: true } },
          ],
        },
        {
          id: 'b',
          text: 'Bienvenue',
          choices: [{ text: 'Retour', next: 'a' }, { text: 'Fin' }],
        },
      ],
    },
    flags,
  );
  assert.equal(session.choices.length, 1);
  assert.equal(session.choose(0), true);
  assert.equal(session.line.id, 'b');
  assert.equal(flags.met, true);
  session.choose(0);
  assert.equal(session.choices.length, 2);
  session.choose(1);
  session.choose(1);
  assert.equal(session.closed, true);
  assert.equal(session.choose(0), false);
});
test('deterministic wander remains in activity zone and on dry ground', () => {
  const a = createNPCState(DEFAULT_NPCS[3]),
    b = createNPCState(DEFAULT_NPCS[3]);
  const observer = { x: a.x + 20, z: a.z };
  for (let i = 0; i < 1800; i++) {
    updateNPC(a, 1 / 60, observer);
    updateNPC(b, 1 / 60, observer);
    assert.equal(a.x, b.x);
    assert.equal(a.z, b.z);
    assert.ok(
      Math.hypot(a.x - a.definition.x, a.z - a.definition.z) <=
        a.definition.radius + 0.001,
    );
    const water = waterSurface(a.x, a.z);
    assert.ok(water === null || water - terrainHeight(a.x, a.z) <= 0.3);
  }
  assert.ok(Math.hypot(a.x - a.definition.x, a.z - a.definition.z) > 0.1);
});
test('navigation rejects water, boundaries and authored obstacles', () => {
  assert.equal(canNPCWalk(0, -100, 0, -101), false);
  assert.equal(canNPCWalk(999, 0, 998, 0), false);
  const p = DEFAULT_NPCS[3];
  assert.equal(
    canNPCWalk(p.x, p.z, p.x, p.z, [{ x: p.x, z: p.z, radius: 2 }]),
    false,
  );
});
test('near NPC greets, dialogue pauses it, distant NPC sleeps', () => {
  assert.deepEqual(
    [npcActivity(2), npcActivity(100), npcActivity(300)],
    ['full', 'reduced', 'dormant'],
  );
  const npc = createNPCState(DEFAULT_NPCS[3]);
  updateNPC(npc, 0.02, { x: npc.x + 2, z: npc.z });
  assert.equal(npc.phase, 'greet');
  npc.phase = 'talk';
  updateNPC(npc, 0.02, { x: npc.x + 20, z: npc.z });
  assert.equal(npc.phase, 'talk');
  assert.equal(npc.vx, 0);
  const old = [npc.x, npc.z];
  updateNPC(npc, 0.02, { x: 999, z: 999 });
  assert.equal(npc.activity, 'dormant');
  assert.deepEqual([npc.x, npc.z], old);
});
test('importing NPCs for a larger map is independent of the active terrain', () => {
  const definition = {
    ...structuredClone(DEFAULT_NPCS[0]),
    x: 450,
    path: [{ x: 460, z: 0 }],
  };
  assert.equal(validateNPCs([definition]), true);
  assert.equal(validateNPCs([definition], { width: 1000, length: 1000 }), true);
  assert.equal(validateNPCs([definition], { width: 200, length: 600 }), false);
  definition.path[0].x = 510;
  assert.equal(
    validateNPCs([definition], { width: 1000, length: 1000 }),
    false,
  );
});

test('NPC visual detail keeps interaction range rigged and caps distant draw calls', () => {
  assert.equal(npcVisualTier(0), 'rig');
  assert.equal(npcVisualTier(5.5), 'rig');
  assert.equal(npcVisualTier(18), 'rig');
  assert.equal(npcVisualTier(18.01), 'silhouette');
  assert.equal(npcVisualTier(160), 'silhouette');
  assert.equal(npcVisualTier(160.01), 'hidden');
});

test('NPC decision budgets are 10 Hz nearby and 2 Hz at reduced activity', () => {
  for (const [distance, decisions] of [
    [20, 10],
    [100, 2],
  ]) {
    for (const hz of [20, 30, 60]) {
      const state = createNPCState(DEFAULT_NPCS[3]),
        observer = { x: state.x + distance, z: state.z };
      for (let i = 0; i < hz; i++) updateNPC(state, 1 / hz, observer);
      assert.equal(
        state.decisions,
        decisions,
        `${hz} presentation Hz at ${distance}m`,
      );
    }
  }
  assert.deepEqual(['full', 'reduced', 'dormant'].map(npcDecisionInterval), [
    0.1,
    0.5,
    Infinity,
  ]);
});
test('wander trajectories and interpolation clocks agree across 20, 30 and 60 FPS', () => {
  for (const distance of [20, 100]) {
    const states = [20, 30, 60].map((hz) => {
      const state = createNPCState(DEFAULT_NPCS[3]),
        observer = { x: state.x + distance, z: state.z };
      for (let i = 0; i < hz * 30; i++) updateNPC(state, 1 / hz, observer);
      assert.ok(
        npcInterpolationAlpha(state) >= 0 && npcInterpolationAlpha(state) <= 1,
      );
      return state;
    });
    for (const state of states.slice(1)) {
      assert.equal(state.decisions, states[0].decisions);
      assert.ok(Math.abs(state.x - states[0].x) < 1e-9);
      assert.ok(Math.abs(state.z - states[0].z) < 1e-9);
      assert.ok(Math.abs(state.coarseTime - states[0].coarseTime) < 1e-9);
    }
  }
});
test('greetings react before the next decision while slow-frame catch-up stays bounded', () => {
  const state = createNPCState(DEFAULT_NPCS[3]);
  updateNPC(state, 0.01, { x: state.x + 2, z: state.z });
  assert.equal(state.phase, 'greet');
  assert.equal(state.decisions, 0);
  updateNPC(state, 60, { x: state.x + 20, z: state.z });
  assert.ok(state.decisions <= 2);
});
