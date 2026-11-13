import { isEmotion, type Emotion } from './character-style.ts';

export interface DialogueCondition {
  flag: string;
  equals: boolean;
}
export interface DialogueAction {
  flag: string;
  value: boolean;
}
export interface DialogueChoice {
  text: string;
  next?: string;
  condition?: DialogueCondition;
  action?: DialogueAction;
}
export interface DialogueLine {
  id: string;
  text: string;
  emotion?: Emotion;
  choices: DialogueChoice[];
}
export interface DialogueDefinition {
  start: string;
  lines: DialogueLine[];
}
export type DialogueFlags = Record<string, boolean>;
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
/** Imported conversations contain only bounded declarative data; never executable code. */
export function validDialogue(v: unknown): v is DialogueDefinition {
  if (
    !record(v) ||
    !text(v.start, 80) ||
    !Array.isArray(v.lines) ||
    v.lines.length < 1 ||
    v.lines.length > 100
  )
    return false;
  const ids = new Set<string>();
  for (const line of v.lines) {
    if (
      !record(line) ||
      !text(line.id, 80) ||
      ids.has(line.id) ||
      !text(line.text, 2000) ||
      (line.emotion !== undefined && !isEmotion(line.emotion)) ||
      !Array.isArray(line.choices) ||
      line.choices.length > 8
    )
      return false;
    ids.add(line.id);
    for (const choice of line.choices) {
      if (
        !record(choice) ||
        !text(choice.text, 200) ||
        (choice.next !== undefined && !text(choice.next, 80))
      )
        return false;
      if (
        choice.condition !== undefined &&
        (!record(choice.condition) ||
          !text(choice.condition.flag, 80) ||
          typeof choice.condition.equals !== 'boolean')
      )
        return false;
      if (
        choice.action !== undefined &&
        (!record(choice.action) ||
          !text(choice.action.flag, 80) ||
          typeof choice.action.value !== 'boolean')
      )
        return false;
    }
  }
  return (
    ids.has(v.start) &&
    v.lines.every((line) =>
      (line as unknown as DialogueLine).choices.every(
        (choice) => choice.next === undefined || ids.has(choice.next),
      ),
    )
  );
}
export interface DialogueSession {
  readonly line: DialogueLine;
  readonly choices: DialogueChoice[];
  readonly closed: boolean;
  choose(index: number): boolean;
  close(): void;
  /** Choices that exist but are not available yet (displayed disabled). Optional. */
  readonly locked?: { text: string }[];
  /** Short hint for an available choice (e.g. it starts a mission). Optional. */
  hint?(index: number): string | undefined;
}
export function createDialogue(
  definition: DialogueDefinition,
  flags: DialogueFlags,
): DialogueSession {
  if (!validDialogue(definition)) throw new Error('Dialogue invalide');
  let line = definition.lines.find((item) => item.id === definition.start)!;
  let closed = false;
  const available = () =>
    line.choices.filter(
      (choice) =>
        !choice.condition ||
        (flags[choice.condition.flag] === true) === choice.condition.equals,
    );
  return {
    get line() {
      return line;
    },
    get choices() {
      return available();
    },
    get closed() {
      return closed;
    },
    choose(index) {
      if (closed || !Number.isInteger(index)) return false;
      const choice = available()[index];
      if (!choice) return false;
      if (choice.action)
        Object.defineProperty(flags, choice.action.flag, {
          value: choice.action.value,
          writable: true,
          enumerable: true,
          configurable: true,
        });
      if (choice.next)
        line = definition.lines.find((item) => item.id === choice.next)!;
      else closed = true;
      return true;
    },
    close() {
      closed = true;
    },
  };
}
