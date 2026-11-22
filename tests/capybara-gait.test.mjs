import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceCapybaraGait,
  makeCapybaraGait,
  CAPYBARA_STRIDE_METRES,
} from '../src/capybara/capybara-gait.ts';

test('capybara gait stays idle when speed is zero', () => {
  let gait = makeCapybaraGait();
  for (let i = 0; i < 60; i++) gait = advanceCapybaraGait(gait, { dt: 1 / 60, speed: 0 });
  assert.equal(gait.phase, 0);
  assert.equal(gait.influence, 0);
});

test('capybara gait follows travelled distance, independent of frame rate', () => {
  let a = makeCapybaraGait(), b = makeCapybaraGait();
  for (let i = 0; i < 60; i++) a = advanceCapybaraGait(a, { dt: 1 / 60, speed: CAPYBARA_STRIDE_METRES / 2 });
  for (let i = 0; i < 30; i++) b = advanceCapybaraGait(b, { dt: 1 / 30, speed: CAPYBARA_STRIDE_METRES / 2 });
  assert.ok(Math.abs(a.phase - Math.PI) < 1e-10);
  assert.ok(Math.abs(a.phase - b.phase) < 1e-10);
  assert.ok(Math.abs(a.influence - b.influence) < 1e-10);
});

test('capybara gait blends back to idle smoothly', () => {
  let gait = makeCapybaraGait();
  for (let i = 0; i < 40; i++) gait = advanceCapybaraGait(gait, { dt: 1 / 60, speed: 1 });
  const moving = gait.influence;
  gait = advanceCapybaraGait(gait, { dt: 1 / 60, speed: 0 });
  assert.ok(moving > 0.95);
  assert.ok(gait.influence < moving && gait.influence > 0);
});

test('capybara gait rejects invalid inputs and limits dt spikes', () => {
  const initial = makeCapybaraGait();
  const gait = advanceCapybaraGait(initial, { dt: Number.POSITIVE_INFINITY, speed: NaN });
  assert.deepEqual(gait, initial);
  const stepped = advanceCapybaraGait(initial, { dt: 100, speed: 1 });
  assert.ok(stepped.phase > 0 && stepped.phase <= (2 * Math.PI / CAPYBARA_STRIDE_METRES) * 0.1);
});
