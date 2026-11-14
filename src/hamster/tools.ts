/** Tools held by the hamster (doc 43): real low-poly 3D objects attached to the right-paw socket.
 * Convention: grip at the socket origin, handle along the paw's local +Z (forward when the arm
 * hangs, up when the arm points forward), so the shared swing animations carry every tool.
 * One merged vertex-coloured geometry per tool, built once and shared by every character.
 * TOOL_ITEMS maps the inventory items to the models; the action table says which animation a
 * gameplay action plays with which tool (no per-tool animation). */
import * as THREE from 'three';
import { mergeParts, hamsterMaterial, type PartSpec } from './hamster-model.ts';
import type { ActionName } from './hamster-animation.ts';

export const TOOL_IDS = ['pickaxe', 'pickaxe-steel', 'axe', 'fishing-rod', 'shovel', 'hammer', 'watering-can', 'seed-bag'] as const;
export type ToolId = typeof TOOL_IDS[number];
const W = 0x9a6b42, WD = 0x6e4a2d, IRON = 0x8d9298, STEEL = 0xc4ccd4;
const handle = (len: number, c = W, r = .035): PartSpec => ({ s: 'cyl', c, p: [0, 0, len / 2 - .12], k: [r, len, r], r: [Math.PI / 2, 0, 0] });
const TOOL_PARTS: Record<ToolId, PartSpec[]> = {
  pickaxe: [handle(.9), { s: 'box', c: IRON, p: [0, 0, .72], k: [.06, .62, .07], r: [0, 0, 0] }, { s: 'cone', c: IRON, p: [0, .36, .72], k: [.04, .12, .04] }, { s: 'cone', c: IRON, p: [0, -.36, .72], k: [.04, .12, .04], r: [Math.PI, 0, 0] }],
  'pickaxe-steel': [handle(.9, WD), { s: 'box', c: STEEL, p: [0, 0, .72], k: [.07, .66, .08] }, { s: 'cone', c: STEEL, p: [0, .38, .72], k: [.045, .14, .045] }, { s: 'cone', c: STEEL, p: [0, -.38, .72], k: [.045, .14, .045], r: [Math.PI, 0, 0] }],
  axe: [handle(.85), { s: 'box', c: IRON, p: [0, .14, .66], k: [.04, .26, .2] }, { s: 'box', c: STEEL, p: [0, .28, .66], k: [.03, .04, .24] }],
  'fishing-rod': [handle(1.7, W, .022), { s: 'cyl', c: WD, p: [0, 0, .05], k: [.04, .2, .04], r: [Math.PI / 2, 0, 0] }, { s: 'cyl', c: IRON, p: [.05, 0, .12], k: [.04, .03, .04], r: [0, 0, Math.PI / 2] }],
  shovel: [handle(.9), { s: 'box', c: IRON, p: [0, 0, .82], k: [.2, .02, .24] }],
  hammer: [handle(.6), { s: 'box', c: IRON, p: [0, 0, .45], k: [.08, .22, .08] }],
  'watering-can': [{ s: 'cyl', c: 0x5f8fa6, p: [0, -.1, .22], k: [.13, .22, .13] }, { s: 'cyl', c: 0x5f8fa6, p: [0, -.02, .4], k: [.02, .3, .02], r: [-1.1, 0, 0] }, { s: 'box', c: 0x4b7488, p: [0, .06, .14], k: [.03, .12, .03] }],
  'seed-bag': [{ s: 'ball0', c: 0xd8c08f, p: [0, -.08, .12], k: [.13, .15, .12] }, { s: 'cyl', c: WD, p: [0, .06, .12], k: [.05, .04, .05] }],
};
/** Rod tip in the tool frame (fishing line origin). */
export const ROD_TIP = new THREE.Vector3(0, 0, 1.45);
/** Inventory item → tool model. */
export const TOOL_ITEMS: Record<string, ToolId> = { 'tool:pickaxe': 'pickaxe', 'tool:pickaxe-steel': 'pickaxe-steel', 'tool:axe': 'axe', 'tool:fishing-rod': 'fishing-rod' };
/** Gameplay activity → animation + tool shown (tool null = bare paws). */
export const ACTIVITY_ANIMATIONS: Record<string, { action: ActionName; tool: ToolId | null }> = {
  mine: { action: 'TOOL_SWING_VERTICAL', tool: 'pickaxe' }, fell: { action: 'TOOL_SWING_HORIZONTAL', tool: 'axe' },
  collect: { action: 'PICKUP', tool: null }, pick: { action: 'PICKUP', tool: null },
  'farm-plant': { action: 'PICKUP', tool: 'seed-bag' }, 'farm-water': { action: 'WATERING', tool: 'watering-can' }, 'farm-harvest': { action: 'PICKUP', tool: null }, 'farm-clear': { action: 'TOOL_DIG', tool: 'shovel' },
  'fish-cast': { action: 'FISH_CAST', tool: 'fishing-rod' }, 'fish-wait': { action: 'FISH_WAIT', tool: 'fishing-rod' }, 'fish-reel': { action: 'FISH_REEL', tool: 'fishing-rod' },
  talk: { action: 'INTERACT', tool: null }, interact: { action: 'INTERACT', tool: null },
};
/** Holder of the tool models on one character: one shown at a time, built lazily, shared geometry. */
export function createToolHolder(socket: THREE.Object3D) {
  const meshes = new Map<ToolId, THREE.Mesh>();let current: ToolId | null = null;
  const mesh = (id: ToolId) => { let m = meshes.get(id); if (!m) { m = new THREE.Mesh(mergeParts('tool:' + id, TOOL_PARTS[id]), hamsterMaterial); m.name = 'Tool_' + id; m.visible = false; socket.add(m); meshes.set(id, m); } return m; };
  return {
    /** Shows `id` in the paw (null hides every tool). Geometry is shared: nothing to dispose. */
    show(id: ToolId | null) { if (id === current) return; if (current) mesh(current).visible = false; current = id; if (id) mesh(id).visible = true; },
    get current() { return current; },
    /** World position of the rod tip (fishing line), or null when the rod is not shown. */
    rodTip(out: THREE.Vector3): THREE.Vector3 | null { if (current !== 'fishing-rod') return null; return mesh('fishing-rod').localToWorld(out.copy(ROD_TIP)); },
    /** Head of the shown tool (impact effects). */
    head(out: THREE.Vector3): THREE.Vector3 | null { if (!current) return null; return mesh(current).localToWorld(out.set(0, 0, current === 'fishing-rod' ? 1.45 : .7)); },
    get built() { return meshes.size; },
    dispose() { for (const m of meshes.values()) m.removeFromParent(); meshes.clear(); current = null; },
  };
}
export type ToolHolder = ReturnType<typeof createToolHolder>;
