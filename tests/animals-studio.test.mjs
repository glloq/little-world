import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject } from '../src/studio-core/schema.ts';
import { createCharacter } from '../src/studio-core/character-authoring.ts';
import {
  ANIMAL_PRESETS, animalConflicts, animalKeeperChoices, animalLoadoutPatch, animalRolePatch, createAnimal, inspectAnimalRoute, putAnimal, removeAnimal,
} from '../src/studio-core/animal-authoring.ts';
import {
  deleteElements, duplicateElements, elementAnchor, elementChunkIds, elementData, elementDependents, elementExists, elementLabel, elementsAt, listElements, moveElements, updateElement,
} from '../src/studio-core/elements.ts';
import { editDocument } from '../src/studio-core/edit.ts';
import { CommandBus } from '../src/studio-core/commands.ts';

const project = () => createProject({ name: 'Animaux Studio', width: 640, length: 640, seed: 5 });
const place = (p, preset, at, name) => putAnimal(p, createAnimal(p, preset, at, name));
const flat = { ground: () => 0, water: () => null, inside: () => true };

test('every preset creates a valid animal and an empty library is removed again', () => {
  const p = project();
  const ids = Object.keys(ANIMAL_PRESETS).map((preset, i) => place(p, preset, { x: i * 20 - 80, z: 0 }).id);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotThrow(() => parseProject(structuredClone(p)));
  assert.equal(p.libraries.animals[ids[0]].kind, 'herd');
  assert.equal(p.libraries.animals[ids.at(-1)].loadout, 'caravan');
  for (const id of ids) removeAnimal(p, id);
  assert.equal('animals' in p.libraries, false, 'project identical to one that never had animals');
  assert.throws(() => place(p, 'mount', { x: 9999, z: 0 }), /hors/);
});

test('animals are elements of the universal selection: pick, label, move, duplicate, delete, list', () => {
  const p = project();
  const herd = place(p, 'herd', { x: 0, z: 0 }), mount = place(p, 'mount', { x: 3, z: 2 }, 'Caramel');
  const ref = { kind: 'animal', id: mount.id };
  assert.ok(elementExists(p, ref)); assert.equal(elementExists(p, { kind: 'animal', id: 'animal:none' }), false);
  assert.deepEqual(elementAnchor(p, ref), { x: 3, z: 2 });
  assert.match(elementLabel(p, ref), /Caramel · monture · saddle/);
  assert.match(elementLabel(p, { kind: 'animal', id: herd.id }), /harde de 5/);
  assert.deepEqual(elementChunkIds(p, [ref]), [], 'library element: no sector to hydrate');
  assert.deepEqual(elementsAt(p, 3.2, 2.1)[0], ref, 'an individual is picked before the herd zone around it');
  assert.deepEqual(elementsAt(p, -10, 6)[0], { kind: 'animal', id: herd.id });
  assert.deepEqual(elementsAt(p, 200, 200), []);
  moveElements(p, [ref], { x: 10, z: -4 });
  assert.deepEqual(elementAnchor(p, ref), { x: 13, z: -2 });
  assert.throws(() => moveElements(p, [ref], { x: 5000, z: 0 }), /hors/);
  const [copy] = duplicateElements(p, [ref], { x: 4, z: 0 });
  assert.notEqual(copy.id, mount.id); assert.equal(elementData(p, copy).x, 17);
  assert.equal(listElements(p, 'caramel', 'animal').length, 2);
  assert.equal(listElements(p, '', 'animal').length, 3);
  deleteElements(p, [copy, ref]);
  assert.deepEqual(Object.keys(p.libraries.animals), [herd.id]);
});

test('inspector patches keep the animal coherent and reject unknown fields', () => {
  const p = project();
  createCharacter(p, { id: 'npc-carter', name: 'Charretier', x: 0, z: 0, species: 'hamster' });
  const a = place(p, 'mount', { x: 10, z: 10 }), ref = { kind: 'animal', id: a.id }, get = () => p.libraries.animals[a.id];
  updateElement(p, ref, { name: 'Praline', heading: 1.5 });
  assert.equal(get().name, 'Praline');
  assert.throws(() => updateElement(p, ref, { wings: 2 }), /non modifiable/);
  assert.throws(() => updateElement(p, ref, { loadout: 'cart' }), /transport/, 'a raw incoherent change is refused');
  updateElement(p, ref, animalLoadoutPatch(get(), 'caravan'));
  assert.equal(get().role, 'draft'); assert.equal(get().loadout, 'caravan');
  updateElement(p, ref, { dwelling: true, cargo: [{ itemId: 'wheat', quantity: 3 }] });
  updateElement(p, ref, animalLoadoutPatch(get(), 'saddle'));
  assert.equal(get().role, 'domestic'); assert.equal(get().cargo, undefined); assert.equal(get().dwelling, undefined);
  updateElement(p, ref, { ownerId: 'npc-carter', access: 'owner', acquisition: { mode: 'purchase', price: 40 } });
  assert.throws(() => updateElement(p, ref, { ownerId: 'npc-ghost' }), /introuvable/);
  updateElement(p, ref, animalRolePatch(get(), 'wild'));
  assert.equal(get().ownerId, undefined); assert.equal(get().loadout, 'none'); assert.equal(get().acquisition, undefined); assert.equal(get().persistent, false);
  updateElement(p, ref, animalRolePatch(get(), 'draft'));
  assert.equal(get().loadout, 'cart'); assert.equal(get().access, 'anyone');
  assert.doesNotThrow(() => parseProject(structuredClone(p)));
});

test('NPC assignment: keeper choices, route with its driver, one team per driver, deletion warning', () => {
  const p = project();
  createCharacter(p, { id: 'npc-carter', name: 'Charretier', x: 0, z: 0, species: 'hamster' });
  assert.deepEqual(animalKeeperChoices(p), [{ id: 'npc-carter', name: 'Charretier' }]);
  const cart = place(p, 'cart', { x: 0, z: 0 }), ref = { kind: 'animal', id: cart.id };
  assert.throws(() => updateElement(p, ref, { riderId: 'npc-carter' }), /trajet/);
  updateElement(p, ref, { riderId: 'npc-carter', ownerId: 'npc-carter', path: [{ x: 0, z: 0 }, { x: 0, z: 60 }], pauseSeconds: 15 });
  assert.deepEqual(inspectAnimalRoute(p, cart.id, flat), []);
  assert.ok(inspectAnimalRoute(p, cart.id, { ...flat, ground: (x, z) => z * 0.6 }).some((d) => d.code === 'slope'));
  moveElements(p, [ref], { x: 5, z: 5 });
  assert.deepEqual(p.libraries.animals[cart.id].path[1], { x: 5, z: 65 }, 'the route follows the moved team');
  const [copy] = duplicateElements(p, [ref], { x: 10, z: 0 });
  assert.equal(p.libraries.animals[copy.id].riderId, undefined, 'a copy never shares the driver');
  assert.equal(p.libraries.animals[copy.id].ownerId, 'npc-carter');
  assert.deepEqual(animalConflicts(p, cart.id), []);
  updateElement(p, copy, { riderId: 'npc-carter', path: [{ x: 15, z: 5 }, { x: 40, z: 5 }] });
  assert.equal(animalConflicts(p, cart.id).length, 1);
  assert.ok(elementDependents(p, [{ kind: 'entity', id: 'npc-carter' }]).some((d) => /animal/.test(d)), 'deleting the NPC warns about its animals');
});

test('edits are undoable transactions: create, change, undo, redo', () => {
  const p = project(), bus = new CommandBus(p);
  editDocument(bus, 'Créer un animal', [], (d) => { putAnimal(d, createAnimal(d, 'mount', { x: 1, z: 1 })); });
  const [id] = Object.keys(bus.document.libraries.animals);
  editDocument(bus, 'Renommer', [], (d) => updateElement(d, { kind: 'animal', id }, { name: 'Caramel' }));
  assert.equal(bus.document.libraries.animals[id].name, 'Caramel');
  assert.ok(bus.undo()); assert.notEqual(bus.document.libraries.animals[id].name, 'Caramel');
  assert.ok(bus.undo()); assert.equal('animals' in bus.document.libraries, false, 'undo restores a project without the library');
  assert.ok(bus.redo()); assert.ok(bus.redo()); assert.equal(bus.document.libraries.animals[id].name, 'Caramel');
});
