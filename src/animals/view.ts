/** Animal presentation — reads the simulation, never writes it.
 * Visuals are created lazily near the camera and released far away. Three levels:
 * full rig (nearest, within the rig budget), reduced-rate rig, frozen pose; hidden beyond.
 * No RAF: `update` is called from the host's existing render step.
 */
import * as THREE from 'three';
import { createCapybaraModel, type CapybaraModel } from '../capybara/capybara-model.ts';
import { buildCapybaraVehicle, type CapybaraVehicleVisual } from '../capybara/capybara-accessories.ts';
import { wrapAngle } from './locomotion.ts';
import type { AnimalSimulation, AnimalState, VehicleState } from './simulation.ts';
import { speciesOf } from './species.ts';

export const ANIMAL_VIEW = { fullM: 26, reducedM: 80, visibleM: 170, releaseM: 230 } as const;
export interface AnimalViewOptions { ground: (x: number, z: number) => number; rigBudget: () => number }
interface Visual { model: CapybaraModel | null; loading: boolean; animation: string; yaw: number }
interface Wagon { visual: CapybaraVehicleVisual; rolled: number }

export function createAnimalView(scene: THREE.Object3D, sim: AnimalSimulation, options: AnimalViewOptions) {
  const root = new THREE.Group(); root.name = 'Animals'; scene.add(root);
  const visuals = new Map<string, Visual>(), wagons = new Map<string, Wagon>();
  const look = new THREE.Vector3(), near: { a: AnimalState; d: number }[] = [];
  let disposed = false, rigs = 0, shown = 0;
  const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t;

  function place(a: AnimalState, visual: Visual, model: CapybaraModel, alpha: number, detailed: boolean): void {
    const p = a.previous, b = a.body, x = p.x + (b.x - p.x) * alpha, z = p.z + (b.z - p.z) * alpha;
    const heading = lerpAngle(p.heading, b.heading, alpha), s = Math.sin(heading), c = Math.cos(heading);
    const group = model.group;
    let pitch = 0, roll = 0, y = p.y + (b.y - p.y) * alpha;
    if (detailed) {
      // Feet follow the relief: the body is laid on the ground under its four supports.
      const half = a.species.halfLength * 0.75, side = a.species.radius * 0.8;
      const front = options.ground(x + s * half, z + c * half), rear = options.ground(x - s * half, z - c * half);
      const left = options.ground(x - c * side, z + s * side), right = options.ground(x + c * side, z - s * side);
      pitch = Math.atan2(front - rear, 2 * half); roll = -Math.atan2(left - right, 2 * side);
      y = Math.max(y, (front + rear) / 2);
    }
    group.position.set(x, y, z);
    group.rotation.set(roll, heading - Math.PI / 2, pitch, 'YZX');
    visual.yaw = pitch;
  }
  function placeVehicle(v: VehicleState, wagon: Wagon, alpha: number): void {
    const spec = speciesOf('capybara').vehicles[v.kind], scale = speciesOf('capybara').modelScale;
    const x = v.previous.x + (v.trailer.x - v.previous.x) * alpha, z = v.previous.z + (v.trailer.z - v.previous.z) * alpha;
    const heading = lerpAngle(v.previous.heading, v.trailer.heading, alpha), s = Math.sin(heading), c = Math.cos(heading);
    const pin = options.ground(x, z), ax = x - s * spec.axle, az = z - c * spec.axle, half = spec.width / 2;
    const left = options.ground(ax - c * half, az + s * half), right = options.ground(ax + c * half, az - s * half);
    const group = wagon.visual.group;
    group.position.set(x, pin, z);
    group.rotation.set(-Math.atan2(left - right, spec.width), heading - Math.PI / 2, Math.asin(Math.max(-0.5, Math.min(0.5, (pin - (left + right) / 2) / spec.axle))), 'YZX');
    wagon.visual.roll((v.trailer.rolled - wagon.rolled) / scale); wagon.rolled = v.trailer.rolled;
  }
  function update(dt: number, alpha: number, camera: THREE.Vector3, player: THREE.Vector3): void {
    if (disposed) return;
    near.length = 0; rigs = 0; shown = 0;
    for (const a of sim.animals.values()) {
      const d = Math.hypot(a.body.x - camera.x, a.body.z - camera.z);
      let visual = visuals.get(a.id);
      if (d > ANIMAL_VIEW.visibleM) {
        if (visual?.model) { visual.model.group.visible = false; if (d > ANIMAL_VIEW.releaseM) { visual.model.group.removeFromParent(); visual.model.dispose(); visuals.delete(a.id); } }
        continue;
      }
      if (!visual) {
        visual = { model: null, loading: true, animation: '', yaw: 0 }; visuals.set(a.id, visual);
        const entry = visual, scale = a.species.modelScale;
        void createCapybaraModel(a.loadout).then((model) => {
          if (disposed || visuals.get(a.id) !== entry) { model.dispose(); return; }
          model.group.scale.setScalar(scale); model.group.name = `Animal:${a.id}`; model.group.userData.animalId = a.id;
          entry.model = model; entry.loading = false; root.add(model.group);
        });
      }
      if (visual.model) near.push({ a, d });
    }
    // The nearest animals get the full rig; the budget is shared with the other characters.
    near.sort((p, q) => p.d - q.d);
    const budget = Math.max(1, options.rigBudget());
    near.forEach(({ a, d }, i) => {
      const visual = visuals.get(a.id)!, model = visual.model!;
      model.group.visible = true; shown++;
      const ridden = sim.ridden === a;
      model.lod = ridden || (d < ANIMAL_VIEW.fullM && i < budget) ? 0 : d < ANIMAL_VIEW.reducedM ? 1 : 2;
      if (model.lod === 0) rigs++;
      if (model.loadout !== a.loadout) model.setLoadout(a.loadout);
      place(a, visual, model, alpha, model.lod < 2);
      if (visual.animation !== a.animation) { if (model.play(a.animation)) visual.animation = a.animation; }
      model.setLookTarget(a.lookAtPlayer && model.lod === 0 ? look.copy(player).setY(player.y + 0.6) : null);
      const scale = a.species.modelScale;
      model.update(dt, { speed: a.body.speed / scale, turnRate: a.body.turnRate, load: a.vehicleId ? 0.35 + 0.65 * sim.loadOf(a) : sim.loadOf(a) * 0.5, rider: a.rider !== null && a.riderMounted, groundPitch: visual.yaw });
    });
    for (const v of sim.vehicles.values()) {
      const d = Math.hypot(v.trailer.x - camera.x, v.trailer.z - camera.z);
      let wagon = wagons.get(v.id);
      if (d > ANIMAL_VIEW.visibleM) { if (wagon) { wagon.visual.group.removeFromParent(); wagons.delete(v.id); } continue; }
      if (!wagon) {
        wagon = { visual: buildCapybaraVehicle(v.kind), rolled: v.trailer.rolled };
        wagon.visual.group.scale.setScalar(speciesOf('capybara').modelScale); wagon.visual.group.userData.vehicleId = v.id;
        root.add(wagon.visual.group); wagons.set(v.id, wagon);
      }
      placeVehicle(v, wagon, alpha);
    }
  }
  /** World position of an animal's rider socket (follows the animation), or null when not shown. */
  function riderSocket(id: string, out: THREE.Vector3): THREE.Vector3 | null {
    const model = visuals.get(id)?.model;
    if (!model || !model.group.visible) return null;
    model.group.updateMatrixWorld(true);
    return model.riderSocket.getWorldPosition(out);
  }
  return {
    root, update, riderSocket,
    get stats() { return { visuals: visuals.size, shown, rigs, vehicles: wagons.size }; },
    dispose() {
      disposed = true;
      for (const v of visuals.values()) v.model?.dispose();
      visuals.clear(); wagons.clear(); root.removeFromParent(); root.clear();
    },
  };
}
export type AnimalView = ReturnType<typeof createAnimalView>;
