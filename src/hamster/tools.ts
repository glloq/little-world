/** Tools held by the hamster (doc 43): real low-poly 3D objects bound to their own bone under the
 * right paw, inside the single hamster mesh (models in hamster-model.ts, TOOL_PARTS).
 * Convention: grip at the socket origin, handle along the paw's local +Z (forward when the arm
 * hangs, up when the arm points forward), so the shared swing animations carry every tool.
 * TOOL_ITEMS maps the inventory items to the models; the action table says which animation a
 * gameplay action plays with which tool (no per-tool animation). */
import * as THREE from 'three';
import { TOOL_IDS, TOOL_PARTS, type ToolId, type HamsterRig } from './hamster-model.ts';
import type { ActionName } from './hamster-animation.ts';

export { TOOL_IDS, TOOL_PARTS, type ToolId };
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
/** Which held object is shown: one tool bone at scale 1 at a time, inside the single hamster mesh. */
export function createToolHolder(rig: HamsterRig) {
  let current: ToolId | null = null;
  return {
    /** Shows `id` in the paw (null hides every tool). */
    show(id: ToolId | null) { if (id === current) return; if (current) rig.tools[current].visible = false; current = id; if (id) rig.tools[id].visible = true; },
    get current() { return current; },
    /** World position of the rod tip (fishing line), or null when the rod is not shown. */
    rodTip(out: THREE.Vector3): THREE.Vector3 | null { if (current !== 'fishing-rod') return null; return rig.toolBones['fishing-rod'].localToWorld(out.copy(ROD_TIP)); },
    /** Head of the shown tool (impact effects). */
    head(out: THREE.Vector3): THREE.Vector3 | null { if (!current) return null; return rig.toolBones[current].localToWorld(out.set(0, 0, current === 'fishing-rod' ? 1.45 : .7)); },
    dispose() { if (current) rig.tools[current].visible = false; current = null; },
  };
}
export type ToolHolder = ReturnType<typeof createToolHolder>;
