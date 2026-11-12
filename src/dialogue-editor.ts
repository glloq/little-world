import { EMOTIONS, type Emotion } from './character-style.ts';
import type { NPCDefinition } from './npc.ts';
import type {
  DialogueDefinition,
  DialogueLine,
  DialogueChoice,
} from './dialogue.ts';
import {
  appendDialogueLine,
  editDialogue,
  newDialogue,
  removeDialogueLine,
} from './dialogue-authoring.ts';
import './dialogue-editor.css';
interface Options {
  getNPC: () => NPCDefinition | undefined;
  commit: (edit: () => void) => void;
  preview: () => void;
}
const emotionNames: Record<Emotion, string> = {
  happy: 'Joyeux',
  joyful: 'Ravi',
  surprised: 'Surpris',
  sleepy: 'Apaisé',
  determined: 'Déterminé',
  curious: 'Curieux',
  sad: 'Triste',
  tired: 'Fatigué',
  confused: 'Confus',
};
function button(text: string, action: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'light-button';
  b.textContent = text;
  b.onclick = action;
  return b;
}
function label(text: string, input: HTMLElement) {
  const l = document.createElement('label');
  l.textContent = text;
  l.append(input);
  return l;
}
function textInput(
  value: string,
  max: number,
  onChange: (value: string) => void,
) {
  const i = document.createElement('input');
  i.value = value;
  i.maxLength = max;
  i.onchange = () => onChange(i.value);
  return i;
}
function boolSelect(value: boolean, onChange: (value: boolean) => void) {
  const s = document.createElement('select');
  s.add(new Option('Oui', 'true'));
  s.add(new Option('Non', 'false'));
  s.value = String(value);
  s.onchange = () => onChange(s.value === 'true');
  return s;
}
/** Compact graph authoring for data-only conversations; no scripts or raw JSON controls. */
export function createDialogueEditor(container: HTMLElement, options: Options) {
  container.classList.add('dialogue-authoring');
  let selectedLine: string | null = null,
    selectedNPC: string | null = null,
    expanded = true;
  let error = '';
  function change(
    edit: (definition: DialogueDefinition) => DialogueDefinition,
  ) {
    try {
      const npc = options.getNPC();
      if (!npc) throw Error('Sélectionner un PNJ.');
      const id = npc.id,
        next = edit(npc.dialogue ?? newDialogue());
      options.commit(() => {
        const current = options.getNPC();
        if (!current || current.id !== id)
          throw Error('La sélection a changé.');
        current.dialogue = next;
      });
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    refresh();
  }
  function lineEdit(id: string, edit: (line: DialogueLine) => void) {
    change((d) =>
      editDialogue(d, (draft) => {
        const line = draft.lines.find((l) => l.id === id);
        if (!line) throw Error('Réplique introuvable.');
        edit(line);
      }),
    );
  }
  function choiceEdit(
    id: string,
    index: number,
    edit: (choice: DialogueChoice) => void,
  ) {
    lineEdit(id, (line) => {
      const choice = line.choices[index];
      if (!choice) throw Error('Réponse introuvable.');
      edit(choice);
    });
  }
  function lineOptions(
    select: HTMLSelectElement,
    d: DialogueDefinition,
    allowEnd = false,
  ) {
    if (allowEnd) select.add(new Option('Fin de conversation', ''));
    for (const [index, line] of d.lines.entries())
      select.add(
        new Option(`${index + 1} · ${line.text.slice(0, 38)}`, line.id),
      );
  }
  function refresh() {
    const npc = options.getNPC();
    container.replaceChildren();
    container.hidden = !npc;
    if (!npc) {
      selectedNPC = null;
      selectedLine = null;
      return;
    }
    if (selectedNPC !== npc.id) {
      selectedNPC = npc.id;
      selectedLine = null;
      error = '';
    }
    const details = document.createElement('details');
    details.open = expanded;
    details.ontoggle = () => {
      expanded = details.open;
    };
    const summary = document.createElement('summary');
    summary.textContent = 'Dialogues · répliques et réponses';
    details.append(summary);
    container.append(details);
    const status = document.createElement('p');
    status.className = 'dialogue-authoring-status';
    status.setAttribute('role', 'status');
    status.textContent = error;
    details.append(status);
    const d = npc.dialogue;
    if (!d) {
      details.append(
        button('Ajouter un dialogue', () => change(() => newDialogue())),
      );
      return;
    }
    if (!d.lines.some((l) => l.id === selectedLine)) selectedLine = d.start;
    const start = document.createElement('select');
    lineOptions(start, d);
    start.value = d.start;
    start.onchange = () =>
      change((data) =>
        editDialogue(data, (draft) => {
          draft.start = start.value;
        }),
      );
    details.append(label('Première réplique', start));
    const select = document.createElement('select');
    lineOptions(select, d);
    select.value = selectedLine!;
    select.onchange = () => {
      selectedLine = select.value;
      error = '';
      refresh();
    };
    details.append(label('Réplique à modifier', select));
    const tools = document.createElement('div');
    tools.className = 'dialogue-authoring-row';
    const add = button('+ Réplique', () => {
      const id = crypto.randomUUID();
      selectedLine = id;
      change((data) => appendDialogueLine(data, id));
    });
    add.disabled = d.lines.length >= 100;
    const remove = button('Supprimer', () => {
      const id = selectedLine!;
      change((data) => removeDialogueLine(data, id));
    });
    remove.disabled = d.lines.length <= 1;
    tools.append(add, remove);
    details.append(tools);
    const line = d.lines.find((l) => l.id === selectedLine) ?? d.lines[0],
      lineId = line.id;
    const text = document.createElement('textarea');
    text.value = line.text;
    text.maxLength = 2000;
    text.rows = 3;
    text.onchange = () =>
      lineEdit(lineId, (l) => {
        l.text = text.value;
      });
    details.append(label('Texte du PNJ', text));
    const emotion = document.createElement('select');
    emotion.add(new Option('Apparence habituelle', ''));
    for (const id of EMOTIONS) emotion.add(new Option(emotionNames[id], id));
    emotion.value = line.emotion ?? '';
    emotion.onchange = () =>
      lineEdit(lineId, (l) => {
        if (emotion.value) l.emotion = emotion.value as Emotion;
        else delete l.emotion;
      });
    details.append(label('Expression', emotion));
    const title = document.createElement('strong');
    title.textContent = `Réponses (${line.choices.length}/8)`;
    details.append(title);
    for (const [index, choice] of line.choices.entries()) {
      const field = document.createElement('fieldset'),
        legend = document.createElement('legend');
      legend.textContent = `Réponse ${index + 1}`;
      field.append(legend);
      field.append(
        label(
          'Texte',
          textInput(choice.text, 200, (value) =>
            choiceEdit(lineId, index, (c) => {
              c.text = value;
            }),
          ),
        ),
      );
      const next = document.createElement('select');
      lineOptions(next, d, true);
      next.value = choice.next ?? '';
      next.onchange = () =>
        choiceEdit(lineId, index, (c) => {
          if (next.value) c.next = next.value;
          else delete c.next;
        });
      field.append(label('Suite', next));
      const advanced = document.createElement('details'),
        advancedSummary = document.createElement('summary');
      advancedSummary.textContent = 'Condition et effet';
      advanced.open = !!choice.condition || !!choice.action;
      advanced.append(advancedSummary);
      advanced.append(
        label(
          'Visible si flag (vide = toujours)',
          textInput(choice.condition?.flag ?? '', 80, (value) =>
            choiceEdit(lineId, index, (c) => {
              const flag = value.trim();
              if (flag)
                c.condition = { flag, equals: c.condition?.equals ?? true };
              else delete c.condition;
            }),
          ),
        ),
      );
      if (choice.condition)
        advanced.append(
          label(
            'Valeur nécessaire',
            boolSelect(choice.condition.equals, (value) =>
              choiceEdit(lineId, index, (c) => {
                if (c.condition) c.condition.equals = value;
              }),
            ),
          ),
        );
      advanced.append(
        label(
          'Après le choix : modifier le flag',
          textInput(choice.action?.flag ?? '', 80, (value) =>
            choiceEdit(lineId, index, (c) => {
              const flag = value.trim();
              if (flag) c.action = { flag, value: c.action?.value ?? true };
              else delete c.action;
            }),
          ),
        ),
      );
      if (choice.action)
        advanced.append(
          label(
            'Nouvelle valeur',
            boolSelect(choice.action.value, (value) =>
              choiceEdit(lineId, index, (c) => {
                if (c.action) c.action.value = value;
              }),
            ),
          ),
        );
      field.append(
        advanced,
        button('Retirer cette réponse', () =>
          lineEdit(lineId, (l) => {
            l.choices.splice(index, 1);
          }),
        ),
      );
      details.append(field);
    }
    const addChoice = button('+ Réponse', () =>
      lineEdit(lineId, (l) => {
        l.choices.push({ text: 'Continuer' });
      }),
    );
    addChoice.disabled = line.choices.length >= 8;
    details.append(
      addChoice,
      button('Prévisualiser la conversation', options.preview),
    );
    const hint = document.createElement('p');
    hint.className = 'muted';
    hint.textContent =
      'Sans réponse, la réplique reste affichée jusqu’à Fermer. Les flags sont locaux à cette session de jeu.';
    details.append(hint);
  }
  refresh();
  return {
    refresh,
    dispose() {
      container.replaceChildren();
    },
  };
}
