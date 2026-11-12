import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newDialogue,
  editDialogue,
  appendDialogueLine,
  removeDialogueLine,
} from '../src/dialogue-authoring.ts';
import { validDialogue } from '../src/dialogue.ts';

test('dialogue graph edits are atomic and preserve invalid-edit source data', () => {
  const original = newDialogue();
  assert.throws(() =>
    editDialogue(original, (d) => {
      d.lines[0].text = '';
    }),
  );
  assert.equal(original.lines[0].text, 'Bonjour !');
  assert.throws(() =>
    editDialogue(original, (d) => {
      d.lines[0].choices[0].next = 'missing';
    }),
  );
  assert.equal(original.lines[0].choices[0].next, undefined);
});
test('adding and removing lines repairs entry points and incoming choice references', () => {
  const original = newDialogue();
  let graph = appendDialogueLine(original, 'story');
  graph = editDialogue(graph, (d) => {
    d.start = 'story';
    d.lines[0].choices[0].next = 'story';
  });
  const removed = removeDialogueLine(graph, 'story');
  assert.equal(removed.start, 'welcome');
  assert.equal(removed.lines[0].choices[0].next, undefined);
  assert.equal(validDialogue(removed), true);
  assert.equal(graph.lines.length, 2);
  assert.throws(() => removeDialogueLine(removed, 'welcome'));
});
test('choice conditions, flags and emotions remain valid declarative graph data', () => {
  const graph = editDialogue(newDialogue(), (d) => {
    d.lines[0].emotion = 'surprised';
    d.lines[0].choices[0].condition = { flag: 'met', equals: false };
    d.lines[0].choices[0].action = { flag: 'met', value: true };
  });
  assert.equal(validDialogue(JSON.parse(JSON.stringify(graph))), true);
  assert.throws(() => appendDialogueLine(graph, 'welcome'));
});
