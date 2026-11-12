/** Character appearance is serializable and independent from Three.js. */
export const EMOTIONS = [
  'happy',
  'joyful',
  'surprised',
  'sleepy',
  'determined',
  'curious',
  'sad',
  'tired',
  'confused',
] as const;
export type Emotion = (typeof EMOTIONS)[number];
export type Neckwear = 'none' | 'pendant' | 'scarf';

export interface Appearance {
  hat: boolean;
  backpack: boolean;
  neckwear: Neckwear;
  emotion: Emotion;
}
export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  hat: false,
  backpack: false,
  neckwear: 'none',
  emotion: 'happy',
});
export const APPEARANCE_STORAGE_KEY = 'little-world-character-v1';
export type Accessory = 'hat' | 'backpack' | 'pendant' | 'scarf';

export function isEmotion(value: unknown): value is Emotion {
  return (
    typeof value === 'string' && (EMOTIONS as readonly string[]).includes(value)
  );
}
/** Safely parse prior browser data without evaluating user-supplied code. */
export function normalizeAppearance(value: unknown): Appearance {
  if (typeof value !== 'object' || value === null)
    return { ...DEFAULT_APPEARANCE };
  const item = value as Partial<Record<keyof Appearance, unknown>>;
  return {
    hat: typeof item.hat === 'boolean' ? item.hat : false,
    backpack: typeof item.backpack === 'boolean' ? item.backpack : false,
    neckwear:
      item.neckwear === 'pendant' || item.neckwear === 'scarf'
        ? item.neckwear
        : 'none',
    emotion: isEmotion(item.emotion) ? item.emotion : 'happy',
  };
}
export function toggleAccessory(
  current: Appearance,
  item: Accessory,
): Appearance {
  if (item === 'hat' || item === 'backpack')
    return { ...current, [item]: !current[item] };
  return { ...current, neckwear: current.neckwear === item ? 'none' : item };
}
export function setEmotion(current: Appearance, emotion: Emotion): Appearance {
  return { ...current, emotion };
}
export function loadAppearance(): Appearance {
  try {
    return normalizeAppearance(
      JSON.parse(localStorage.getItem(APPEARANCE_STORAGE_KEY) || 'null'),
    );
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
export function storeAppearance(value: Appearance): void {
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(value));
  } catch {
    /* Private browsing may forbid storage. Keep in-memory appearance. */
  }
}
