// CPU benchmark of the animal simulation and animator (Node, no rendering).
// Usage: node --experimental-strip-types tools/bench-animals.mjs
import { createAnimalSimulation } from '../src/animals/simulation.ts';
import { benchAnimals } from '../src/animals/demo.ts';
import { CapybaraAnimator } from '../src/capybara/capybara-animation.ts';

const env = { ground: (x, z) => Math.sin(x * 0.05) * 2 + Math.cos(z * 0.04) * 2, water: () => null, inside: () => true };
const ctx = (player) => ({ player, night: false, hoursPerSecond: 24 / 1200 });
const rows = [];
for (const count of [1, 5, 10, 30, 60]) {
  const row = { animals: count };
  for (const [label, player] of [['nearMs', { x: 0, y: 0, z: 0, speed: 0 }], ['midMs', { x: 110, y: 0, z: 0, speed: 0 }], ['farMs', { x: 900, y: 0, z: 0, speed: 0 }]]) {
    const sim = createAnimalSimulation({ animals: benchAnimals({ x: 0, z: 0 }, env, count), env });
    for (let i = 0; i < 300; i++) sim.tick(1 / 30, ctx(player));
    const start = performance.now(), steps = 3000;
    for (let i = 0; i < steps; i++) sim.tick(1 / 30, ctx(player));
    row[label] = Number(((performance.now() - start) / steps).toFixed(4));
  }
  const animators = Array.from({ length: count }, () => new CapybaraAnimator());
  const start = performance.now();
  for (let i = 0; i < 3000; i++) for (const a of animators) a.update({ speed: 1.2, turnRate: 0.2, lookYaw: 0.3 }, 1 / 30);
  row.animatorMs = Number(((performance.now() - start) / 3000).toFixed(4));
  rows.push(row);
}
console.table(rows);
console.log('ms per 30 Hz step for all animals (budget of one step: 33.3 ms). Node ' + process.version);
