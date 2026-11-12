import {
  insideWorld,
  mulberry32,
  riverX,
  terrainHeight,
  waterSurface,
} from './terrain.ts';
import {
  DEFAULT_APPEARANCE,
  EMOTIONS,
  type Appearance,
} from './character-style.ts';
import {
  validDialogue,
  type DialogueDefinition,
  type DialogueFlags,
} from './dialogue.ts';
export type { DialogueDefinition } from './dialogue.ts';
export interface NPCPoint {
  x: number;
  z: number;
}
export interface NPCBounds {
  width?: number;
  length?: number;
}
export interface NavigationObstacle extends NPCPoint {
  radius: number;
}
export interface NPCDefinition {
  id: string;
  name: string;
  kind: 'squirrel' | 'animal';
  x: number;
  z: number;
  behavior: 'idle' | 'wander' | 'patrol' | 'work';
  radius: number;
  speed: number;
  path?: NPCPoint[];
  appearance: Appearance;
  dialogue?: DialogueDefinition;
}
export type NPCActivity = 'full' | 'reduced' | 'dormant';
export type NPCVisualTier = 'rig' | 'silhouette' | 'hidden';
/** Rendering detail is separate from behavior scheduling and conversation range. */
export function npcVisualTier(distance: number, kind:NPCDefinition['kind']='squirrel'): NPCVisualTier {
  return distance <= (kind==='animal'?8:18) ? 'rig' : distance <= 160 ? 'silhouette' : 'hidden';
}
export interface NPCState {
  definition: NPCDefinition;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  phase: 'idle' | 'walk' | 'greet' | 'work' | 'talk';
  activity: NPCActivity;
  target: NPCPoint | null;
  waypoint: number;
  wait: number;
  coarseTime: number;
  decisions: number;
  previousX: number;
  previousY: number;
  previousZ: number;
  random: () => number;
  flags: DialogueFlags;
}
const finite = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const point = (v: unknown, bounds: NPCBounds): v is NPCPoint =>
  typeof v === 'object' &&
  v !== null &&
  finite((v as NPCPoint).x) &&
  finite((v as NPCPoint).z) &&
  Math.abs((v as NPCPoint).x) <= (bounds.width ?? 2000) / 2 - 3 &&
  (v as NPCPoint).z >= -(bounds.length ?? 2000) / 2 + 12 &&
  (v as NPCPoint).z <= (bounds.length ?? 2000) / 2 - 14;
export function validNPC(
  v: unknown,
  bounds: NPCBounds = {},
): v is NPCDefinition {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as NPCDefinition,
    a = d.appearance;
  return (
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    d.id.length <= 80 &&
    typeof d.name === 'string' &&
    d.name.length > 0 &&
    d.name.length <= 80 &&
    (d.kind === 'squirrel' || d.kind === 'animal') &&
    point(d, bounds) &&
    ['idle', 'wander', 'patrol', 'work'].includes(d.behavior) &&
    finite(d.radius) &&
    d.radius >= 0 &&
    d.radius <= 100 &&
    finite(d.speed) &&
    d.speed >= 0 &&
    d.speed <= 5 &&
    !!a &&
    typeof a.hat === 'boolean' &&
    typeof a.backpack === 'boolean' &&
    ['none', 'pendant', 'scarf'].includes(a.neckwear) &&
    EMOTIONS.includes(a.emotion) &&
    (d.path === undefined ||
      (Array.isArray(d.path) &&
        d.path.length <= 100 &&
        d.path.every((p) => point(p, bounds)))) &&
    (d.dialogue === undefined || validDialogue(d.dialogue))
  );
}
export function validateNPCs(
  v: unknown,
  bounds: NPCBounds = {},
): v is NPCDefinition[] {
  return (
    Array.isArray(v) &&
    v.length <= 100 &&
    v.every((d) => validNPC(d, bounds)) &&
    new Set(v.map((d) => d.id)).size === v.length
  );
}
export function createNPCState(definition: NPCDefinition): NPCState {
  if (!validNPC(definition)) throw new Error('PNJ invalide');
  let seed = 2166136261;
  for (const c of definition.id)
    seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  return {
    definition,
    x: definition.x,
    y: terrainHeight(definition.x, definition.z),
    z: definition.z,
    vx: 0,
    vz: 0,
    heading: 0,
    phase: 'idle',
    activity: 'dormant',
    target: null,
    waypoint: 0,
    wait: 0,
    coarseTime: 0,
    decisions: 0,
    previousX: definition.x,
    previousY: terrainHeight(definition.x, definition.z),
    previousZ: definition.z,
    random: mulberry32(seed),
    flags: Object.create(null) as DialogueFlags,
  };
}
export function npcActivity(distance: number): NPCActivity {
  return distance < 65 ? 'full' : distance < 160 ? 'reduced' : 'dormant';
}
/** Cheap sampled heightfield navigation. Static discs block building footprints; no per-frame path search. */
export function canNPCWalk(
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  obstacles: readonly NavigationObstacle[] = [],
): boolean {
  if (!insideWorld(x, z)) return false;
  const height = terrainHeight(x, z),
    water = waterSurface(x, z);
  if (water !== null && water - height > 0.3) return false;
  const step = Math.hypot(x - fromX, z - fromZ);
  if (
    step > 0.001 &&
    Math.abs(height - terrainHeight(fromX, fromZ)) / step > 0.85
  )
    return false;
  return !obstacles.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius);
}
function nextTarget(s: NPCState): NPCPoint | null {
  const d = s.definition;
  if (d.behavior === 'patrol' && d.path?.length) {
    const p = d.path[s.waypoint % d.path.length];
    s.waypoint++;
    return p;
  }
  if (d.behavior === 'wander') {
    const angle = s.random() * Math.PI * 2,
      r = Math.sqrt(s.random()) * d.radius;
    return { x: d.x + Math.cos(angle) * r, z: d.z + Math.sin(angle) * r };
  }
  return null;
}
/** Decision budgets are independent of the browser's presentation frequency. */
export function npcDecisionInterval(activity: NPCActivity): number {
  return activity === 'full' ? 0.1 : activity === 'reduced' ? 0.5 : Infinity;
}
export function npcInterpolationAlpha(state: NPCState): number {
  return Math.min(1, state.coarseTime / npcDecisionInterval(state.activity));
}
function decideNPC(
  s: NPCState,
  stepTime: number,
  obstacles: readonly NavigationObstacle[],
): void {
  s.vx = 0;
  s.vz = 0;
  s.wait = Math.max(0, s.wait - stepTime);
  if (s.wait > 0) {
    s.phase = 'idle';
    return;
  }
  const d = s.definition;
  if (!s.target) s.target = nextTarget(s);
  if (!s.target) {
    s.phase = d.behavior === 'work' ? 'work' : 'idle';
    return;
  }
  const dx = s.target.x - s.x,
    dz = s.target.z - s.z,
    distanceToTarget = Math.hypot(dx, dz);
  if (distanceToTarget < 0.2) {
    s.target = null;
    s.wait = 1 + s.random() * 3;
    s.phase = 'idle';
    return;
  }
  const step = Math.min(distanceToTarget, d.speed * stepTime),
    x = s.x + (dx / distanceToTarget) * step,
    z = s.z + (dz / distanceToTarget) * step;
  if (!canNPCWalk(x, z, s.x, s.z, obstacles)) {
    s.target = null;
    s.wait = 1;
    s.phase = 'idle';
    return;
  }
  s.vx = (x - s.x) / stepTime;
  s.vz = (z - s.z) / stepTime;
  s.x = x;
  s.z = z;
  s.y = terrainHeight(x, z);
  s.heading = Math.atan2(dx, dz);
  s.phase = 'walk';
}
export function updateNPC(
  s: NPCState,
  dt: number,
  player: NPCPoint,
  obstacles: readonly NavigationObstacle[] = [],
): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const distance = Math.hypot(player.x - s.x, player.z - s.z),
    activity = npcActivity(distance);
  if (activity !== s.activity) {
    s.coarseTime = 0;
    s.previousX = s.x;
    s.previousY = s.y;
    s.previousZ = s.z;
    s.vx = 0;
    s.vz = 0;
    s.activity = activity;
  }
  if (activity === 'dormant') {
    s.vx = 0;
    s.vz = 0;
    return;
  }
  // Proximity reactions and conversation facing stay responsive between decisions.
  const paused = s.phase === 'talk' || distance < 7;
  if (paused) {
    if (s.phase !== 'talk') s.phase = 'greet';
    s.heading = Math.atan2(player.x - s.x, player.z - s.z);
    s.vx = 0;
    s.vz = 0;
    s.previousX = s.x;
    s.previousY = s.y;
    s.previousZ = s.z;
  }
  const interval = npcDecisionInterval(activity);
  // Bound catch-up after a slow frame; background pauses never produce a CPU spiral.
  s.coarseTime = Math.min(s.coarseTime + Math.min(dt, 0.25), interval * 2);
  let steps = 0;
  while (s.coarseTime + 1e-9 >= interval && steps++ < 2) {
    s.coarseTime = Math.max(0, s.coarseTime - interval);
    s.previousX = s.x;
    s.previousY = s.y;
    s.previousZ = s.z;
    s.decisions++;
    s.y = terrainHeight(s.x, s.z);
    if (paused) {
      s.previousY = s.y;
      continue;
    }
    decideNPC(s, interval, obstacles);
  }
}

const conversation = (subject: string, detail: string): DialogueDefinition => ({
  start: 'hello',
  lines: [
    {
      id: 'hello',
      text: `Bonjour ! ${subject}`,
      emotion: 'happy',
      choices: [
        { text: 'Raconte-moi.', next: 'story' },
        { text: 'Comment rejoindre le port ?', next: 'port' },
        { text: 'À bientôt !', action: { flag: 'met', value: true } },
      ],
    },
    {
      id: 'story',
      text: detail,
      emotion: 'joyful',
      choices: [{ text: 'Merci !', next: 'hello' }],
    },
    {
      id: 'port',
      text: 'Suis le sentier vers le sud, en longeant la rivière. Le ponton est juste après le village.',
      choices: [
        {
          text: 'Merci pour le chemin !',
          action: { flag: 'directions', value: true },
        },
      ],
    },
  ],
});
export const DEFAULT_NPCS: NPCDefinition[] = [
  {
    id: 'miller',
    name: 'Noisette · meunière',
    kind: 'squirrel',
    x: riverX(-57) - 18,
    z: -39,
    behavior: 'work',
    radius: 0,
    speed: 1,
    appearance: { ...DEFAULT_APPEARANCE, hat: true },
    dialogue: conversation(
      'Tu entends la roue du moulin ?',
      "La rivière fait tourner la roue toute seule. J'aime écouter son rythme pendant que je prépare la farine.",
    ),
  },
  {
    id: 'villager',
    name: 'Miel · du village',
    kind: 'squirrel',
    x: -39,
    z: 87,
    behavior: 'patrol',
    radius: 15,
    speed: 1.2,
    path: [
      { x: -39, z: 87 },
      { x: -43, z: 97 },
      { x: -41, z: 110 },
    ],
    appearance: { ...DEFAULT_APPEARANCE, neckwear: 'scarf', emotion: 'joyful' },
    dialogue: conversation(
      'Bienvenue dans notre vallée !',
      'Les maisons se blottissent à côté du sentier. Tu peux prendre le temps de te promener et de planer au-dessus des arbres.',
    ),
  },
  {
    id: 'fisher',
    name: 'Galet · pêcheur',
    kind: 'squirrel',
    x: -31,
    z: 174,
    behavior: 'idle',
    radius: 0,
    speed: 1,
    appearance: { ...DEFAULT_APPEARANCE, hat: true, neckwear: 'pendant' },
    dialogue: conversation(
      "J'observe les poissons près de l'estuaire.",
      'La mer commence au bout de la rivière. Approche du bateau et appuie sur E pour embarquer, puis E pour redescendre.',
    ),
  },
  {
    id: 'woodland-animal',
    name: 'Petit compagnon',
    kind: 'animal',
    x: -29,
    z: -165,
    behavior: 'wander',
    radius: 9,
    speed: 1.8,
    appearance: { ...DEFAULT_APPEARANCE, emotion: 'surprised' },
  },
];
export const DEFAULT_NPC_OBSTACLES: NavigationObstacle[] = [
  { x: riverX(-57) - 24, z: -57, radius: 9 },
  { x: riverX(70) - 31, z: 70, radius: 7 },
  { x: riverX(94) - 30, z: 94, radius: 7 },
  { x: riverX(118) - 29, z: 118, radius: 7 },
];
