import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject } from '../src/studio-core/schema.ts';
import { ReferenceIndex } from '../src/studio-core/references.ts';
import { createCharacter } from '../src/studio-core/character-authoring.ts';
import { compileProject } from '../src/world-compiler/compile.ts';
import { openCompiledWorld, playableFromCompiled } from '../src/runtime/compiled-world.ts';
import { parsePlayableWorld } from '../src/gameplay/playable.ts';
import { writeProjectArchive, readProjectArchive } from '../src/studio-core/archive.ts';
import { parseGameSave } from '../src/gameplay/save.ts';
import { GAMEPLAY_EVENTS, questFields } from '../src/gameplay/events.ts';
import { animalTarget, promptText } from '../src/ui/interactions/targets.ts';

const mount = (over = {}) => ({ version: 1, kind: 'individual', id: 'animal:caramel', species: 'capybara', name: 'Caramel', role: 'mount', x: 10, z: 10, heading: 0,
  loadout: 'saddle', initialState: 'idle', access: 'anyone', roamRadius: 0, persistent: true, ...over });
const project = () => createProject({ name: 'Animaux', width: 640, length: 640, seed: 4 });
const resolver = async () => ({ hash: '0'.repeat(64), byteLength: 100 });
const fetcher = (files) => async (url) => { const path = new URL(url).pathname.replace(/^\/an\//, ''); return Object.hasOwn(files, path) ? new Response(files[path]) : new Response('', { status: 404 }); };
const play = async (document) => playableFromCompiled(await openCompiledWorld('http://localhost/an/manifest.json', fetcher((await compileProject(parseProject(document), { resolveAsset: resolver })).files)));

test('animals survive archive, compilation and playable load with their associations', async () => {
  const p = project();
  createCharacter(p, { id: 'npc-owner', name: 'Noisette', x: 5, z: 5, species: 'hamster' });
  const cart = mount({ id: 'animal:cart', role: 'draft', loadout: 'cart', access: 'owner', ownerId: 'npc-owner', riderId: 'npc-owner', path: [{ x: 0, z: 0 }, { x: 40, z: 0 }], pauseSeconds: 12, cargo: [{ itemId: 'wheat', quantity: 6 }] });
  const herd = { version: 1, kind: 'herd', id: 'animal:herd', species: 'capybara', name: 'Harde', x: -40, z: -40, radius: 20, count: 6, seed: 9 };
  p.libraries = { ...p.libraries, animals: { 'animal:caramel': mount(), 'animal:cart': cart, 'animal:herd': herd } };
  const archived = readProjectArchive(writeProjectArchive(parseProject(p)));
  assert.deepEqual(archived.libraries.animals, p.libraries.animals);
  const playable = await play(archived);
  assert.deepEqual(playable.animals, p.libraries.animals, 'ids, owner, rider, equipment, route and cargo are preserved');
  assert.ok(playable.world.npcs.some((n) => n.id === 'npc-owner'), 'the owner NPC exists at runtime under the same id');
  const legacy = JSON.parse(JSON.stringify(playable)); delete legacy.world.config.terrain;
  assert.deepEqual(parsePlayableWorld(legacy).animals, playable.animals);
  assert.throws(() => parsePlayableWorld({ ...legacy, animals: { 'animal:x': { ...mount(), id: 'animal:x', wings: 1 } } }), /champ inconnu/);
});

test('projects without animals compile exactly as before (no field)', async () => {
  assert.equal('animals' in await play(project()), false);
});

test('projects without animals keep the exact same shape (no key added)', () => {
  const p = project();
  assert.equal('animals' in p.libraries, false);
  assert.doesNotThrow(() => parseProject(structuredClone(p)));
});

test('libraries.animals is validated strictly and its owner references are tracked', () => {
  const p = project();
  createCharacter(p, { id: 'npc-owner', name: 'Noisette', x: 5, z: 5, species: 'hamster' });
  p.libraries = { ...p.libraries, animals: { 'animal:caramel': mount({ access: 'owner', ownerId: 'npc-owner' }) } };
  assert.doesNotThrow(() => parseProject(structuredClone(p)));
  const index = new ReferenceIndex(p);
  assert.deepEqual(index.diagnostics().filter((d) => d.severity === 'error'), []);
  const broken = structuredClone(p); broken.libraries.animals['animal:caramel'].ownerId = 'npc-missing';
  assert.throws(() => parseProject(broken), /npc-missing|référence|introuvable/i);
  const unknown = structuredClone(p); unknown.libraries.animals['animal:caramel'].wings = 2;
  assert.throws(() => parseProject(unknown), /champ inconnu/);
  const outside = structuredClone(p); outside.libraries.animals['animal:caramel'].x = 5000;
  assert.throws(() => parseProject(outside), /hors limites/);
  const mismatch = structuredClone(p); mismatch.libraries.animals = { 'animal:other': mount() };
  assert.throws(() => parseProject(mismatch), /clé|ID/);
});

test('playable world and saves accept the optional animal sections and reject bad ones', () => {
  const base = { version: 1, animals: {}, vehicles: {} };
  const save = { schemaVersion: 2, worldId: 'w', worldBuildVersion: 'b', slotId: 's', savedAt: 1, time: 0, position: { x: 0, y: 0, z: 0 }, inventory: {}, variables: {}, objectives: {},
    entities: {}, executed: {}, cooldowns: {}, dialogueFlags: {}, pending: [], mines: {}, farms: {} };
  assert.equal(parseGameSave(save).animals, undefined, 'old saves stay valid');
  assert.deepEqual(parseGameSave({ ...save, animals: base }).animals, base);
  assert.throws(() => parseGameSave({ ...save, animals: { version: 9, animals: {}, vehicles: {} } }), /animaux/);
  assert.equal(typeof parsePlayableWorld, 'function');
});

test('animal events are declared in the single gameplay registry', () => {
  for (const type of ['animal.mounted', 'animal.acquired', 'animal.hitched']) assert.ok(GAMEPLAY_EVENTS[type]);
  assert.deepEqual(questFields({ type: 'animal.mounted', animalId: 'animal:a' }), { targetId: 'animal:a' });
  assert.deepEqual(questFields({ type: 'animal.hitched', animalId: 'animal:a', vehicleId: 'animal:a:vehicle' }), { targetId: 'animal:a', source: 'animal:a:vehicle' });
});

test('animal targets use the shared interaction contract', () => {
  assert.equal(promptText(animalTarget({ id: 'animal:a', name: 'Caramel', label: 'Monter', enabled: true })), '[E] Monter — Caramel');
  const refused = animalTarget({ id: 'animal:a', name: 'Caramel', label: 'Monter', enabled: false, reason: 'Il dort.' });
  assert.equal(refused.primaryAction.enabled, false); assert.match(promptText(refused), /Il dort/);
});
