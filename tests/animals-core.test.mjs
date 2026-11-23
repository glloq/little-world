import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnimal, validateAnimals } from '../src/animals/schema.ts';
import { ANIMAL_SPECIES, teamTurnRadius } from '../src/animals/species.ts';
import {
  stepAnimal, steerToward, trailerBehind, trailerAxle, validateAnimalRoute, teamSpeed, wrapAngle,
} from '../src/animals/locomotion.ts';
import { createAnimalSimulation, expandHerd, vehicleIdOf } from '../src/animals/simulation.ts';
import { parseAnimalsSave } from '../src/animals/save.ts';

const capy = ANIMAL_SPECIES.capybara;
const flat = (extra = {}) => ({ ground: () => 0, water: () => null, inside: (x, z) => Math.abs(x) < 500 && Math.abs(z) < 500, ...extra });
const one = (over = {}) => ({ version: 1, kind: 'individual', id: 'animal:a', species: 'capybara', name: 'Caramel', role: 'mount', x: 0, z: 0, heading: 0,
  loadout: 'saddle', initialState: 'idle', access: 'anyone', roamRadius: 0, persistent: true, ...over });
const body = (over = {}) => ({ x: 0, y: 0, z: 0, heading: 0, speed: 0, turnRate: 0, ...over });
const free = { vehicle: null, load: 0, rider: false };
const DT = 1 / 30;
const ctx = (over = {}) => ({ player: { x: 400, y: 0, z: 400, speed: 0 }, night: false, hoursPerSecond: 24 / 1200, ...over });
const purse = (items) => ({ count: (id) => items[id] ?? 0, max: () => 99,
  apply(changes) { for (const c of changes) if ((items[c.itemId] ?? 0) + c.quantity < 0) return false; for (const c of changes) items[c.itemId] = (items[c.itemId] ?? 0) + c.quantity; return true; } });

test('schema accepts coherent animals and rejects unknown or contradictory data', () => {
  assert.equal(validateAnimal(one()).name, 'Caramel');
  assert.throws(() => validateAnimal({ ...one(), extra: 1 }), /champ inconnu/);
  assert.throws(() => validateAnimal(one({ id: 'capy' })), /animal:/);
  assert.throws(() => validateAnimal(one({ role: 'wild' })), /sauvage/);
  assert.throws(() => validateAnimal(one({ loadout: 'cart' })), /transport/);
  assert.throws(() => validateAnimal(one({ role: 'draft', loadout: 'caravan', initialState: 'sleep' })), /dormir/);
  assert.throws(() => validateAnimal(one({ riderId: 'npc-1' })), /trajet/);
  assert.throws(() => validateAnimal(one({ cargo: [{ itemId: 'apple', quantity: 2 }] })), /sacoches ou un véhicule/);
  assert.throws(() => validateAnimal(one({ acquisition: { mode: 'purchase' } })), /prix/);
  assert.throws(() => validateAnimal(one({ x: 9999 }), { width: 400, length: 400 }), /hors limites/);
  const herd = { version: 1, kind: 'herd', id: 'animal:h', species: 'capybara', name: 'Harde', x: 0, z: 0, radius: 20, count: 5, seed: 7 };
  assert.deepEqual(Object.keys(validateAnimals({ 'animal:h': herd, 'animal:a': one() })), ['animal:h', 'animal:a']);
  assert.throws(() => validateAnimals({ 'animal:b': one() }), /clé/);
});

test('walks on flat ground at gait speed and stops on command', () => {
  const b = body();
  for (let i = 0; i < 90; i++) stepAnimal(b, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, flat(), DT);
  assert.ok(Math.abs(b.speed - capy.speeds.walk) < 1e-6);
  assert.ok(b.z > 3 && Math.abs(b.x) < 1e-9);
  for (let i = 0; i < 30; i++) stepAnimal(b, { throttle: 0, steer: 0, gait: 'walk' }, capy, free, flat(), DT);
  assert.equal(b.speed, 0);
});

test('same distance at 30 Hz and 15 Hz once cruising (render independent)', () => {
  const a = body({ speed: capy.speeds.walk }), b = body({ speed: capy.speeds.walk });
  for (let i = 0; i < 60; i++) stepAnimal(a, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, flat(), 1 / 30);
  for (let i = 0; i < 30; i++) stepAnimal(b, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, flat(), 1 / 15);
  assert.ok(Math.abs(a.z - b.z) < 1e-9);
});

test('follows relief, refuses steep slopes, deep water, world edge and solids', () => {
  const hill = flat({ ground: (x, z) => z * 0.2 });
  const b = body();
  for (let i = 0; i < 60; i++) stepAnimal(b, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, hill, DT);
  assert.ok(Math.abs(b.y - b.z * 0.2) < 1e-9 && b.z > 1);
  const cliff = body();
  let result;
  for (let i = 0; i < 60; i++) result = stepAnimal(cliff, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, flat({ ground: (x, z) => Math.max(0, z - 1) * 2 }), DT);
  assert.equal(result.blocked, 'slope'); assert.equal(cliff.speed, 0);
  const pond = body();
  for (let i = 0; i < 200; i++) result = stepAnimal(pond, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, flat({ water: (x, z) => (z > 3 ? 1 : null), ground: (x, z) => (z > 3 ? -1 : 0) }), DT);
  assert.equal(result.blocked, 'water'); assert.ok(pond.z < 3);
  const wall = body();
  const env = flat({ move: (from, x, z) => (z > 2 ? { x: from.x, z: from.z, blocked: true } : { x, z, blocked: false }) });
  for (let i = 0; i < 200; i++) result = stepAnimal(wall, { throttle: 1, steer: 0, gait: 'walk' }, capy, free, env, DT);
  assert.equal(result.blocked, 'solid'); assert.ok(wall.z <= 2.05);
});

test('turning respects the turn radius; a free animal pivots, a team does not', () => {
  const b = body({ speed: capy.speeds.walk });
  let minX = 0, maxX = 0;
  for (let i = 0; i < 400; i++) { stepAnimal(b, { throttle: 1, steer: 1, gait: 'walk' }, capy, free, flat(), DT); minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); }
  assert.ok((maxX - minX) / 2 >= capy.turnRadius - 0.05, 'circle at least as wide as the turn radius');
  const pivot = body();
  stepAnimal(pivot, { throttle: 0, steer: 1, gait: 'walk' }, capy, free, flat(), DT);
  assert.ok(pivot.heading > 0 && pivot.z === 0);
  const team = body(), trailer = trailerBehind(team, capy);
  stepAnimal(team, { throttle: 0, steer: 1, gait: 'walk' }, capy, { vehicle: 'caravan', load: 0, rider: false }, flat(), DT, trailer);
  assert.equal(team.heading, 0);
  assert.ok(teamTurnRadius(capy, 'caravan') > teamTurnRadius(capy, 'cart') && teamTurnRadius(capy, 'cart') >= capy.turnRadius);
});

test('vehicle trails on the hitch, rolls its wheels and never jackknifes', () => {
  for (const kind of ['cart', 'wagon', 'caravan']) {
    const spec = capy.vehicles[kind], limits = { vehicle: kind, load: 0.5, rider: false };
    const b = body(), trailer = trailerBehind(b, capy);
    let worst = 0;
    for (let i = 0; i < 900; i++) {
      stepAnimal(b, { throttle: 1, steer: i < 450 ? 1 : -1, gait: 'fast' }, capy, limits, flat(), DT, trailer);
      worst = Math.max(worst, Math.abs(wrapAngle(b.heading - trailer.heading)));
      const pin = { x: b.x - Math.sin(b.heading) * capy.hitchOffset, z: b.z - Math.cos(b.heading) * capy.hitchOffset };
      assert.ok(Math.hypot(pin.x - trailer.x, pin.z - trailer.z) < 1e-9, 'pin stays on the hitch');
    }
    assert.ok(worst > 0.2 && worst <= spec.maxArticulation, `${kind} articulation ${worst}`);
    assert.ok(trailer.rolled > 5, 'wheels rolled forward');
    const axle = trailerAxle(trailer, spec);
    assert.ok(Math.abs(Math.hypot(axle.x - trailer.x, axle.z - trailer.z) - spec.axle) < 1e-9);
    assert.ok(b.speed <= teamSpeed(capy, 'fast', limits) + 1e-9 && b.speed < capy.speeds.fast);
  }
});

test('reverse is refused for wagon and caravan, slow for a cart; a blocked vehicle stops the team', () => {
  const b = body(), trailer = trailerBehind(b, capy);
  for (let i = 0; i < 30; i++) stepAnimal(b, { throttle: -1, steer: 0, gait: 'walk' }, capy, { vehicle: 'caravan', load: 0, rider: false }, flat(), DT, trailer);
  assert.equal(b.z, 0);
  const c = body(), cart = trailerBehind(c, capy);
  for (let i = 0; i < 30; i++) stepAnimal(c, { throttle: -1, steer: 0, gait: 'walk' }, capy, { vehicle: 'cart', load: 0, rider: false }, flat(), DT, cart);
  assert.ok(c.z < 0 && c.speed >= -capy.speeds.reverse - 1e-9);
  // A post catches the wheel while the animal itself passes.
  const d = body(), wagon = trailerBehind(d, capy);
  const post = flat({ blocked: (x, z) => Math.hypot(x - capy.vehicles.wagon.width / 2, z - 1) < 0.3 });
  let result;
  for (let i = 0; i < 200; i++) { result = stepAnimal(d, { throttle: 1, steer: 0, gait: 'walk' }, capy, { vehicle: 'wagon', load: 0, rider: false }, post, DT, wagon); if (result.blocked) break; }
  assert.equal(result.blocked, 'vehicle'); assert.equal(d.speed, 0);
});

test('load slows a team and lowers the slope it can climb', () => {
  const empty = { vehicle: 'wagon', load: 0, rider: false }, full = { vehicle: 'wagon', load: 1, rider: false };
  assert.ok(teamSpeed(capy, 'walk', full) < teamSpeed(capy, 'walk', empty));
  const ramp = flat({ ground: (x, z) => z * 0.3 });
  const a = body(), b = body();
  let ra, rb;
  for (let i = 0; i < 60; i++) { ra = stepAnimal(a, { throttle: 1, steer: 0, gait: 'walk' }, capy, empty, ramp, DT, trailerBehind(a, capy)); rb = stepAnimal(b, { throttle: 1, steer: 0, gait: 'walk' }, capy, full, ramp, DT, trailerBehind(b, capy)); }
  assert.equal(ra.blocked, null); assert.equal(rb.blocked, 'slope');
});

test('steerToward reaches a target, including one behind the animal', () => {
  const b = body();
  for (let i = 0; i < 900; i++) { const cmd = steerToward(b, { x: -3, z: -8 }, 'walk'); if (cmd.arrived) break; stepAnimal(b, cmd, capy, free, flat(), DT); }
  assert.ok(Math.hypot(b.x + 3, b.z + 8) < 0.7);
});

test('route validation reports slope, narrow bridge, tight corner and turn-round room', () => {
  const straight = [{ x: 0, z: 0 }, { x: 0, z: 40 }];
  assert.deepEqual(validateAnimalRoute(straight, capy, 'caravan', flat()), []);
  const codes = (points, vehicle, env) => validateAnimalRoute(points, capy, vehicle, env).map((d) => d.code);
  assert.ok(codes(straight, 'caravan', flat({ ground: (x, z) => z * 0.4 })).includes('slope'));
  // A 0.8 m wide bridge over deep water: fine for a free animal's centre line, too narrow for a wagon.
  const bridge = flat({ water: (x, z) => (z > 10 && z < 20 && Math.abs(x) > 0.4 ? 0 : null), ground: (x, z) => (z > 10 && z < 20 && Math.abs(x) > 0.4 ? -2 : 0) });
  assert.ok(codes(straight, 'wagon', bridge).includes('width'));
  assert.ok(!codes(straight, 'wagon', flat()).includes('width'));
  assert.ok(codes([{ x: 0, z: 0 }, { x: 0, z: 3 }, { x: 0.5, z: 0.5 }], 'caravan', flat()).includes('turn'));
  const walled = flat({ blocked: (x) => Math.abs(x) > 1.2 });
  assert.ok(codes(straight, 'caravan', walled).includes('turnaround'));
  assert.ok(codes([{ x: 0, z: 0 }], null, flat()).includes('short'));
});

test('herds expand deterministically, within habitat capacity, never in water', () => {
  const herd = { version: 1, kind: 'herd', id: 'animal:h', species: 'capybara', name: 'Harde', x: 0, z: 0, radius: 25, count: 8, seed: 3 };
  const a = expandHerd(herd, flat()), b = expandHerd(herd, flat());
  assert.deepEqual(a, b); assert.equal(a.length, 8);
  assert.deepEqual(a.map((m) => m.id), [0, 1, 2, 3, 4, 5, 6, 7].map((i) => 'animal:h#' + i));
  const half = flat({ habitat: (x) => (x > 12 ? 1 : 0) });
  const few = expandHerd(herd, half);
  assert.ok(few.length > 0 && few.length < 8 && few.every((m) => m.x > 12));
  assert.equal(expandHerd(herd, flat({ habitat: () => 0 })).length, 0, 'unsuitable biome: no population');
  const lake = flat({ water: (x) => (x < 0 ? 1 : null), ground: (x) => (x < 0 ? -1 : 0) });
  assert.ok(expandHerd(herd, lake).every((m) => m.x >= 0));
  // Building the simulation twice never duplicates: ids are stable keys.
  const sim = createAnimalSimulation({ animals: { 'animal:h': herd }, env: flat() });
  assert.equal(sim.animals.size, 8);
});

test('wild capybaras live near home, flee an approaching player and settle again', () => {
  const herd = { version: 1, kind: 'herd', id: 'animal:h', species: 'capybara', name: 'Harde', x: 0, z: 0, radius: 18, count: 5, seed: 11 };
  const sim = createAnimalSimulation({ animals: { 'animal:h': herd }, env: flat() });
  const far = ctx({ player: { x: 40, y: 0, z: 0, speed: 0 } });
  const modes = new Set();
  for (let i = 0; i < 30 * 240; i++) { sim.tick(DT, far); for (const a of sim.animals.values()) modes.add(a.mode); }
  for (const a of sim.animals.values()) assert.ok(Math.hypot(a.body.x, a.body.z) < 18 + 12, 'stays around the herd zone');
  assert.ok(modes.has('graze') && modes.has('wander') && modes.has('idle'));
  const victim = [...sim.animals.values()][0];
  const start = { x: victim.body.x, z: victim.body.z };
  const close = ctx({ player: { x: start.x + 1.5, y: 0, z: start.z, speed: 2 } });
  sim.tick(DT, close);
  assert.equal(victim.mode, 'flee'); assert.equal(victim.animation, 'afraid');
  for (let i = 0; i < 150; i++) sim.tick(DT, close);
  assert.ok(Math.hypot(victim.body.x - close.player.x, victim.body.z - close.player.z) > 6, 'moved away');
  for (let i = 0; i < 30 * 30; i++) sim.tick(DT, far);
  assert.ok(!['flee', 'alert'].includes(victim.mode), 'returned to its activity');
  assert.equal(sim.canMount(victim).ok, false, 'wild animals are not rideable');
});

test('wild capybaras sleep at night, wake by day, and go to water when thirsty', () => {
  const herd = { version: 1, kind: 'herd', id: 'animal:h', species: 'capybara', name: 'Harde', x: 0, z: 0, radius: 10, count: 3, seed: 2 };
  const river = flat({ water: (x) => (x > 14 ? 0.5 : null), ground: (x) => (x > 14 ? Math.max(-1, (14 - x) * 0.5) : 0) });
  const sim = createAnimalSimulation({ animals: { 'animal:h': herd }, env: river });
  const near = { x: 0, y: 0, z: 30, speed: 0 };
  for (const a of sim.animals.values()) { a.needs.fatigue = 0.6; a.timer = 0; }
  for (let i = 0; i < 30 * 20; i++) sim.tick(DT, ctx({ player: near, night: true }));
  assert.ok([...sim.animals.values()].every((a) => a.mode === 'sleep'));
  for (const a of sim.animals.values()) { a.needs.fatigue = 0; }
  for (let i = 0; i < 30 * 5; i++) sim.tick(DT, ctx({ player: near }));
  assert.ok([...sim.animals.values()].every((a) => a.mode !== 'sleep'));
  const thirsty = [...sim.animals.values()][0];
  thirsty.needs.thirst = 0.9; thirsty.needs.hunger = 0; thirsty.timer = 0; thirsty.mode = 'idle';
  let drank = false;
  for (let i = 0; i < 30 * 60 && !drank; i++) { sim.tick(DT, ctx({ player: near })); drank = thirsty.mode === 'drink' && thirsty.animation === 'drink'; }
  assert.ok(drank && thirsty.body.x > 8, 'walked to the bank and drinks');
  const level = river.water(thirsty.body.x, thirsty.body.z);
  assert.ok(level === null || level - river.ground(thirsty.body.x, thirsty.body.z) <= capy.maxWade);
});

test('distance tiers: far animals are not stepped every frame but still progress', () => {
  let steps = 0;
  const counted = flat({ ground: () => { steps++; return 0; } });
  const animals = { 'animal:h': { version: 1, kind: 'herd', id: 'animal:h', species: 'capybara', name: 'Harde', x: 0, z: 0, radius: 20, count: 8, seed: 5 } };
  const sim = createAnimalSimulation({ animals, env: counted });
  steps = 0;
  for (let i = 0; i < 300; i++) sim.tick(DT, ctx({ player: { x: 0, y: 0, z: 0, speed: 0 } }));
  const nearCost = steps; steps = 0;
  assert.equal(sim.stats.full, 8);
  for (let i = 0; i < 300; i++) sim.tick(DT, ctx());
  assert.equal(sim.stats.dormant, 8);
  assert.ok(steps < nearCost / 10, `dormant cost ${steps} vs near ${nearCost}`);
  const before = [...sim.animals.values()].map((a) => a.mode + a.body.x.toFixed(1));
  for (let i = 0; i < 30 * 600; i++) sim.tick(DT, ctx());
  assert.notDeepEqual([...sim.animals.values()].map((a) => a.mode + a.body.x.toFixed(1)), before, 'abstract life goes on');
});

test('mount, drive, dismount on a free accessible spot only', () => {
  const walls = flat({ blocked: (x) => x < -0.8 });
  const events = [];
  const sim = createAnimalSimulation({ animals: { 'animal:a': one() }, env: walls, onEvent: (e) => events.push(e.type) });
  assert.deepEqual(sim.mount('animal:a'), { ok: true });
  assert.equal(sim.mount('animal:a').ok, false, 'already riding');
  sim.setDrive({ throttle: 1, steer: 0, gait: 'trot' });
  for (let i = 0; i < 90; i++) sim.tick(DT, ctx());
  const a = sim.ridden;
  assert.ok(a.body.z > 4 && a.mode === 'ridden');
  const seat = sim.seat(a);
  assert.ok(seat.y > 0.9 && seat.z < a.body.z);
  assert.match(sim.dismount().reason, /Arrêtez/);
  sim.setDrive({ throttle: 0, steer: 0, gait: 'walk' });
  for (let i = 0; i < 60; i++) sim.tick(DT, ctx());
  const down = sim.dismount();
  assert.ok(down.ok && down.position.x > 0.5, 'left side is walled: lands on the free side');
  assert.equal(sim.ridden, null); assert.equal(a.rider, null);
  assert.deepEqual(events, ['animal.mounted', 'animal.dismounted']);
  const boxed = createAnimalSimulation({ animals: { 'animal:a': one() }, env: flat({ blocked: () => true }) });
  boxed.mount('animal:a');
  assert.match(boxed.dismount().reason, /Pas de place/);
  assert.ok(boxed.ridden, 'stays mounted rather than landing in a wall');
  const lake = createAnimalSimulation({ animals: { 'animal:a': one() }, env: flat({ water: (x, z) => (Math.hypot(x, z) > 0.6 ? 1 : null), ground: (x, z) => (Math.hypot(x, z) > 0.6 ? -1 : 0) }) });
  lake.mount('animal:a');
  assert.equal(lake.dismount().ok, false, 'never dismounts into water');
});

test('ownership: owner-only animals, purchase, loan, quest and rider loss recovery', () => {
  const merchant = one({ access: 'owner', ownerId: 'npc-merchant', acquisition: { mode: 'purchase', price: 30 } });
  const sim = createAnimalSimulation({ animals: { 'animal:a': merchant }, env: flat(), ownerName: () => 'Noisette' });
  assert.match(sim.mount('animal:a').reason, /Noisette/);
  const poor = purse({ coin: 10 }), rich = purse({ coin: 50 });
  assert.match(sim.acquire('animal:a', poor).reason, /30 pièces/); assert.equal(poor.count('coin'), 10);
  assert.ok(sim.acquire('animal:a', rich).ok); assert.equal(rich.count('coin'), 20);
  assert.equal(sim.acquire('animal:a', rich).ok, false, 'no double purchase'); assert.equal(rich.count('coin'), 20);
  assert.ok(sim.mount('animal:a').ok);
  sim.abandon();
  assert.equal(sim.ridden, null); assert.equal(sim.animals.get('animal:a').mode, 'stay');
  let done = false;
  const quest = createAnimalSimulation({ animals: { 'animal:a': one({ access: 'owner', acquisition: { mode: 'quest', questId: 'q1' } }) }, env: flat(), questDone: () => done });
  assert.equal(quest.acquire('animal:a', rich).ok, false); done = true; assert.ok(quest.acquire('animal:a', rich).ok);
  const loan = createAnimalSimulation({ animals: { 'animal:a': one({ access: 'owner', ownerId: 'npc-1', acquisition: { mode: 'loan' } }) }, env: flat() });
  assert.ok(loan.acquire('animal:a', rich).ok); assert.equal(loan.animals.get('animal:a').ownerId, 'npc-1'); assert.ok(loan.canMount(loan.animals.get('animal:a')).ok);
});

test('state rules: no sleeping while hitched, no rider with panniers, one vehicle per animal', () => {
  const draft = one({ id: 'animal:d', role: 'draft', loadout: 'caravan', dwelling: true });
  const pony = one({ id: 'animal:p', x: 30, loadout: 'none' });
  const sim = createAnimalSimulation({ animals: { 'animal:d': draft, 'animal:p': pony }, env: flat() });
  const d = sim.animals.get('animal:d'), p = sim.animals.get('animal:p');
  d.needs.fatigue = 1; d.timer = 0;
  for (let i = 0; i < 300; i++) sim.tick(DT, ctx({ player: { x: 0, y: 0, z: 20, speed: 0 }, night: true }));
  assert.ok(d.mode !== 'sleep' && d.mode !== 'rest', 'a hitched animal stays up');
  const caravan = sim.vehicles.get(vehicleIdOf('animal:d'));
  assert.equal(caravan.dwelling, true);
  assert.match(sim.hitch('animal:d', caravan.id).reason, /déjà/);
  assert.ok(sim.equip('animal:p', 'pack').ok);
  assert.match(sim.canMount(p).reason, /sacoches/);
  assert.ok(sim.transfer('animal:p', 'apple', 3, purse({ apple: 3 })).ok);
  assert.match(sim.equip('animal:p', 'saddle').reason, /Videz/);
  assert.match(sim.equip('animal:d', 'saddle').reason, /Dételez/);
  assert.match(sim.equip('animal:p', 'cart').reason, /s’attelle/);
});

test('unhitch parks the vehicle with its cargo; hitch needs alignment; nothing is duplicated', () => {
  const draft = one({ role: 'draft', loadout: 'wagon', cargo: [{ itemId: 'wheat', quantity: 20 }] });
  const sim = createAnimalSimulation({ animals: { 'animal:a': draft }, env: flat() });
  const a = sim.animals.get('animal:a'), v = sim.vehicles.get(vehicleIdOf('animal:a'));
  const bag = purse({ wheat: 5 });
  assert.ok(sim.transfer('animal:a', 'wheat', 5, bag).ok); assert.equal(v.cargo.wheat, 25); assert.equal(bag.count('wheat'), 0);
  assert.match(sim.transfer('animal:a', 'wheat', 1, bag).reason, /sac/);
  assert.match(sim.transfer('animal:a', 'wheat', -200, bag).reason, /contient/);
  assert.ok(sim.unhitch('animal:a').ok);
  assert.equal(a.vehicleId, null); assert.equal(a.loadout, 'none'); assert.equal(v.hitchedTo, null); assert.equal(v.cargo.wheat, 25);
  assert.equal(sim.capacityOf(a), 0, 'the goods stay with the wagon, not the animal');
  assert.ok(sim.transferVehicle(v.id, 'wheat', -5, bag).ok); assert.equal(v.cargo.wheat + bag.count('wheat'), 25);
  // Walk away: too far to hitch; come back in front of the shafts: allowed.
  sim.mount('animal:a'); sim.setDrive({ throttle: 1, steer: 0, gait: 'walk' });
  for (let i = 0; i < 120; i++) sim.tick(DT, ctx());
  assert.match(sim.hitch('animal:a', v.id).reason, /timon/);
  assert.equal(sim.hitchable(a), null);
  a.body.x = 0; a.body.z = 0; a.body.heading = 0; a.body.speed = 0;
  assert.equal(sim.hitchable(a), v);
  assert.ok(sim.hitch('animal:a', v.id).ok);
  assert.equal(a.loadout, 'wagon'); assert.equal(v.hitchedTo, 'animal:a'); assert.equal(sim.vehicles.size, 1);
  sim.setDrive({ throttle: 1, steer: 0, gait: 'walk' });
  for (let i = 0; i < 5; i++) sim.tick(DT, ctx());
  assert.match(sim.unhitch('animal:a').reason, /Arrêtez/);
});

test('NPC team follows its route with real travel time, pauses at each end, even far away', () => {
  const trader = one({ role: 'draft', loadout: 'cart', access: 'owner', ownerId: 'npc-1', riderId: 'npc-1', path: [{ x: 0, z: 0 }, { x: 0, z: 30 }, { x: 20, z: 50 }], pauseSeconds: 5 });
  for (const player of [{ x: 0, y: 0, z: 10, speed: 0 }, { x: 400, y: 0, z: 400, speed: 0 }]) {
    const sim = createAnimalSimulation({ animals: { 'animal:a': trader }, env: flat() });
    const a = sim.animals.get('animal:a');
    let paused = 0, maxJump = 0, last = { x: 0, z: 0 }, seconds = 0;
    while (paused === 0 && seconds < 400) { sim.tick(DT, ctx({ player })); seconds += DT; maxJump = Math.max(maxJump, Math.hypot(a.body.x - last.x, a.body.z - last.z)); last = { x: a.body.x, z: a.body.z }; if (a.mode === 'pause') paused = seconds; }
    assert.ok(Math.hypot(a.body.x - 20, a.body.z - 50) < 3, 'reached the far end');
    assert.ok(paused > 58 / capy.speeds.fast, `no shortcut in time (${paused.toFixed(1)} s)`);
    assert.ok(maxJump < capy.speeds.walk * 7, 'no teleport');
    assert.equal(a.riderMounted, false, 'the driver is on foot during the pause');
    assert.match(sim.mount('animal:a').reason, /appartient/);
    for (let i = 0; i < 30 * 200 && a.mode !== 'route'; i++) sim.tick(DT, ctx({ player }));
    for (let i = 0; i < 30 * 30; i++) sim.tick(DT, ctx({ player }));
    assert.equal(a.routeDirection, -1);
    const v = sim.vehicleOf(a);
    assert.ok(Math.hypot(v.trailer.x - a.body.x, v.trailer.z - a.body.z) < capy.hitchOffset + 0.01, 'cart still attached');
  }
});

test('save keeps position, owner, cargo, pairing and a mounted rider; corrupt pairings are repaired', () => {
  const animals = { 'animal:a': one({ role: 'draft', loadout: 'cart', access: 'owner', acquisition: { mode: 'granted' } }), 'animal:w': { version: 1, kind: 'herd', id: 'animal:w', species: 'capybara', name: 'Harde', x: 80, z: 0, radius: 10, count: 3, seed: 1 } };
  const sim = createAnimalSimulation({ animals, env: flat() });
  sim.acquire('animal:a', purse({})); sim.transfer('animal:a', 'apple', 4, purse({ apple: 4 }));
  sim.mount('animal:a'); sim.setDrive({ throttle: 1, steer: 0.4, gait: 'walk' });
  for (let i = 0; i < 200; i++) sim.tick(DT, ctx());
  const saved = parseAnimalsSave(JSON.parse(JSON.stringify(sim.save())));
  assert.deepEqual(Object.keys(saved.animals), ['animal:a'], 'wild herds are deterministic, not saved');
  const again = createAnimalSimulation({ animals, env: flat(), saved });
  const a = again.animals.get('animal:a'), before = sim.animals.get('animal:a');
  assert.ok(Math.abs(a.body.x - before.body.x) < 1e-9 && Math.abs(a.body.heading - before.body.heading) < 1e-9);
  assert.equal(a.ownerId, 'player'); assert.equal(again.ridden, a); assert.equal(a.vehicleId, vehicleIdOf('animal:a'));
  assert.deepEqual(again.cargoOf(a), { apple: 4 }); assert.equal(again.vehicles.size, 1); assert.equal(again.animals.size, 4);
  const trailer = again.vehicleOf(a).trailer, old = sim.vehicleOf(before).trailer;
  assert.ok(Math.abs(trailer.heading - old.heading) < 1e-9);
  // Unhitched save: the cart stays where it was parked.
  sim.setDrive({ throttle: 0, steer: 0, gait: 'walk' }); for (let i = 0; i < 60; i++) sim.tick(DT, ctx());
  sim.unhitch('animal:a');
  const parked = createAnimalSimulation({ animals, env: flat(), saved: parseAnimalsSave(sim.save()) });
  assert.equal(parked.animals.get('animal:a').vehicleId, null); assert.equal(parked.vehicles.get(vehicleIdOf('animal:a')).hitchedTo, null);
  assert.deepEqual(parked.vehicles.get(vehicleIdOf('animal:a')).cargo, { apple: 4 });
  // Corrupt: animal claims a vehicle that names nobody.
  const broken = sim.save(); broken.animals['animal:a'].vehicleId = vehicleIdOf('animal:a'); broken.animals['animal:a'].loadout = 'cart';
  const repaired = parseAnimalsSave(broken);
  assert.equal(repaired.animals['animal:a'].vehicleId, null); assert.equal(repaired.animals['animal:a'].loadout, 'none');
  assert.throws(() => parseAnimalsSave({ version: 1, animals: { a: { x: 0 } }, vehicles: {} }), /champ manquant/);
  assert.throws(() => parseAnimalsSave({ version: 2, animals: {}, vehicles: {} }), /version/);
  // A save from another map (unknown ids) is ignored without creating anything.
  const other = createAnimalSimulation({ animals: { 'animal:z': one({ id: 'animal:z' }) }, env: flat(), saved });
  assert.equal(other.animals.size, 1); assert.equal(other.vehicles.size, 0);
});

test('a called animal comes to its owner and then waits', () => {
  const sim = createAnimalSimulation({ animals: { 'animal:a': one({ loadout: 'none' }) }, env: flat() });
  const player = { x: 0, y: 0, z: 25, speed: 0 };
  assert.ok(sim.call('animal:a').ok);
  for (let i = 0; i < 30 * 30; i++) sim.tick(DT, ctx({ player }));
  const a = sim.animals.get('animal:a');
  assert.ok(Math.hypot(a.body.x - player.x, a.body.z - player.z) < 3.5);
  sim.stay('animal:a'); assert.equal(a.mode, 'stay');
});
