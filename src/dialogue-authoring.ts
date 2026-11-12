import { validDialogue, type DialogueDefinition } from './dialogue.ts';
/** Apply authoring operations atomically: invalid edits never alter the source graph. */
export function editDialogue(
  definition: DialogueDefinition,
  edit: (draft: DialogueDefinition) => void,
): DialogueDefinition {
  const draft = structuredClone(definition);
  edit(draft);
  if (!validDialogue(draft))
    throw Error('Dialogue invalide : vérifier les textes, liens et limites.');
  return draft;
}
export function newDialogue(): DialogueDefinition {
  return {
    start: 'welcome',
    lines: [
      { id: 'welcome', text: 'Bonjour !', choices: [{ text: 'À bientôt !' }] },
    ],
  };
}
export function appendDialogueLine(
  definition: DialogueDefinition,
  id: string,
): DialogueDefinition {
  return editDialogue(definition, (d) => {
    d.lines.push({ id, text: 'Nouvelle réplique', choices: [] });
  });
}
/** Removing a node also repairs incoming edges and the entry point. */
export function removeDialogueLine(
  definition: DialogueDefinition,
  id: string,
): DialogueDefinition {
  return editDialogue(definition, (d) => {
    if (d.lines.length === 1) throw Error('Conserver au moins une réplique.');
    d.lines = d.lines.filter((line) => line.id !== id);
    if (d.start === id) d.start = d.lines[0].id;
    for (const line of d.lines)
      for (const choice of line.choices)
        if (choice.next === id) delete choice.next;
  });
}
