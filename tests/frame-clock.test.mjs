import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FrameClock,
  PresentationBudget,
  presentationPixelRatio,
} from '../src/frame-clock.ts';
import { spawnPlayer, simulatePlayer } from '../src/player.ts';
import { spawnBoat, updateBoat } from '../src/boat.ts';
const controls = {
  forward: 1,
  right: 0,
  run: false,
  jumpPressed: false,
  spaceHeld: false,
  dive: false,
  cameraYaw: 0,
};
function run(fps, rate) {
  const clock = new FrameClock();
  clock.rate = rate;
  clock.advance(0);
  const player = spawnPlayer(),
    boat = spawnBoat();
  let frames = 0,
    steps = 0;
  for (let i = 1; i <= fps * 4; i++) {
    const f = clock.advance((i * 1000) / fps);
    for (let j = 0; j < f.steps; j++) {
      simulatePlayer(player, controls, clock.step);
      updateBoat(boat, { throttle: 1, steer: 0 }, clock.step);
      steps++;
    }
    if (f.render) frames++;
  }
  return { steps, frames, player, boat };
}
test('presentation20/30 and refresh20/30/60 never alter fixed-step movement or boat speed', () => {
  const baseline = run(60, 30);
  assert.equal(baseline.steps, 120);
  assert.equal(baseline.frames, 120);
  for (const [fps, rate] of [
    [20, 20],
    [30, 30],
    [60, 20],
    [10, 20],
  ]) {
    const r = run(fps, rate);
    assert.equal(r.steps, 120);
    assert.equal(r.player.position.z, baseline.player.position.z);
    assert.equal(r.boat.z, baseline.boat.z);
    if (fps >= rate) assert.equal(r.frames, rate * 4);
  }
});
test('hidden tabs pause and long stalls have bounded recovery without simulation time debt', () => {
  const c = new FrameClock();
  c.advance(0);
  assert.equal(c.advance(50).steps, 1);
  assert.equal(c.advance(600000, false).steps, 0);
  assert.equal(c.advance(700000).steps, 0);
  assert.equal(c.advance(700050).steps, 1);
  const f = c.advance(800000);
  assert.ok(f.steps <= 8);
  assert.ok(f.alpha < 1);
  assert.ok(c.advance(800017).steps <= 1);
});
test('adaptive presentation lowers quality before rate and restores only after sustained headroom', () => {
  const b = new PresentationBudget();
  assert.equal(b.observe(100, 0.05), false);
  assert.equal(b.level, 0);
  for (let stage = 0; stage < 3; stage++)
    for (let i = 0; i < 80; i++) b.observe(100, 0.05);
  assert.equal(b.level, 2);
  assert.equal(b.rate, 20);
  for (let i = 0; i < 200; i++) b.observe(1, 0.05);
  assert.equal(b.rate, 20);
  for (let i = 0; i < 80; i++) b.observe(1, 0.05);
  assert.equal(b.rate, 30);
  assert.equal(b.level, 2);
  for (let i = 0; i < 400; i++) b.observe(1, 1 / 30);
  assert.equal(b.level, 1);
});
test('30Hz migration preserves approximate jump height and walking distance versus old60Hz', () => {
  const simulate = (hz) => {
    const p = spawnPlayer();
    let peak = p.position.y;
    for (let i = 0; i < hz; i++) {
      simulatePlayer(p, { ...controls, jumpPressed: i === 0 }, 1 / hz);
      peak = Math.max(peak, p.position.y);
    }
    return { p, peak };
  };
  const a = simulate(30),
    b = simulate(60);
  assert.ok(Math.abs(a.peak - b.peak) < 0.2);
  assert.ok(Math.abs(a.p.position.z - b.p.position.z) < 0.25);
});

test('adaptive resolution reduces DPR1 displays immediately after the user/device ceiling', () => {
  assert.equal(presentationPixelRatio(1, 1.35, 0), 1);
  assert.equal(presentationPixelRatio(1, 1.35, 1), 0.8);
  assert.equal(presentationPixelRatio(1, 1.35, 2), 0.65);
  assert.equal(presentationPixelRatio(2, 2, 2), 1.3);
});

test('alternating fast and GPU-delayed frames still trigger sustained overload fallback', () => {
  const b = new PresentationBudget();
  for (let i = 0; i < 180; i++) {
    b.observe(2, 0.016);
    b.observe(2, 0.1);
  }
  assert.equal(b.level, 2);
  assert.equal(b.rate, 20);
});
