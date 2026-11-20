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

test('explicit comparison tier freezes the existing budget without changing simulation cadence',()=>{
 const b=new PresentationBudget(1);for(let i=0;i<300;i++)assert.equal(b.observe(150,.15),false);assert.equal(b.level,1);assert.equal(b.rate,30);assert.equal(b.resources.sectors,24);
 const normal=new PresentationBudget(99);for(let i=0;i<100;i++)normal.observe(150,.15);assert.equal(normal.level,2);
});

/** Presented intervals for a display at `hz`, with timestamp jitter and optional 1 ms quantization. */
function cadence(hz, {jitter = 0, quantize = false, rate = 30, seconds = 6} = {}) {
  const clock = new FrameClock();
  clock.rate = rate;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const intervals = [];
  let lastRender = null;
  for (let i = 0; i <= hz * seconds; i++) {
    let t = (i * 1000) / hz + rnd() * jitter;
    if (quantize) t = Math.round(t);
    if (clock.advance(t).render) {
      if (lastRender !== null && i > hz) intervals.push(t - lastRender);
      lastRender = t;
    }
  }
  return intervals;
}
test('presentation locks to whole refresh multiples: no 17/33/50 ms mix under jitter', () => {
  for (const [hz, options, expected] of [
    [60, {jitter: 0.3}, 1000 / 30],
    [60, {jitter: 1.2}, 1000 / 30],
    [60, {quantize: true}, 1000 / 30],
    [120, {jitter: 0.3}, 1000 / 30],
    [144, {jitter: 0.3}, 5000 / 144],
    [75, {jitter: 0.3}, 3000 / 75],
    [60, {jitter: 0.3, rate: 20}, 50],
  ]) {
    const intervals = cadence(hz, options);
    const regular = intervals.filter((v) => Math.abs(v - expected) <= 2.6).length / intervals.length;
    assert.ok(regular >= 0.99, `${hz} Hz ${JSON.stringify(options)}: ${(regular * 100).toFixed(1)}% regular`);
  }
});
test('a missed refresh presents at the next one instead of waiting a full extra interval', () => {
  const clock = new FrameClock();
  let t = 0;
  for (let i = 0; i < 60; i++) clock.advance((t += 1000 / 60));
  // One late callback (a dropped vsync): the next refresh must present.
  clock.advance((t += 1000 / 60));
  const late = clock.advance((t += 2000 / 60)).render;
  const next = clock.advance((t += 1000 / 60)).render;
  assert.ok(late || next);
});
test('a restore followed by immediate overload backs off instead of oscillating', () => {
  const b = new PresentationBudget();
  const run = (work, interval, seconds) => { for (let t = 0; t < seconds; t += interval) b.observe(work, interval); };
  run(100, 0.05, 4);
  assert.equal(b.level, 1);
  run(1, 1 / 30, 14);
  assert.equal(b.level, 0, 'restored after 12 s of headroom');
  run(100, 0.05, 4);
  assert.equal(b.level, 1, 'overloaded again right after the restore');
  run(1, 1 / 30, 14);
  assert.equal(b.level, 1, 'the next restore now needs more than 12 s');
  run(1, 1 / 30, 14);
  assert.equal(b.level, 0);
});
