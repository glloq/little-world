/** Studio preview of authored animals: the SAME runtime model, rig, animator and vehicles as
 * the game, posed on the project relief. Presentation only — nothing here is simulated. */
import * as THREE from 'three';
import { createCapybaraModel, type CapybaraModel, type CapybaraBehavior } from '../capybara/capybara-model.ts';
import { buildCapybaraVehicle, type CapybaraVehicleVisual } from '../capybara/capybara-accessories.ts';
import type { AnimalAuthorV1 } from '../animals/schema.ts';
import { expandHerd } from '../animals/simulation.ts';
import type { AnimalEnvironment } from '../animals/locomotion.ts';
import { isVehicleKind, speciesOf } from '../animals/species.ts';

interface PreviewSpec { label: string; speed: number; play?: CapybaraBehavior; look?: boolean; rider?: boolean; load?: number }
export const ANIMAL_PREVIEW_IDS = ['idle', 'walk', 'trot', 'rest', 'sleep', 'wake', 'look', 'mount', 'draft'] as const;
export type AnimalPreviewMode = typeof ANIMAL_PREVIEW_IDS[number];
export const ANIMAL_PREVIEWS: Record<AnimalPreviewMode, PreviewSpec> = {
  idle: { label: 'Au repos debout', speed: 0 }, walk: { label: 'Marche', speed: 1.3 }, trot: { label: 'Trot', speed: 3.8 },
  rest: { label: 'Repos couché', speed: 0, play: 'lie_down' }, sleep: { label: 'Sommeil', speed: 0, play: 'sleep' }, wake: { label: 'Réveil', speed: 0, play: 'wake_up' },
  look: { label: 'Suivi de tête', speed: 0, look: true }, mount: { label: 'Monture (cavalier)', speed: 1.3, rider: true }, draft: { label: 'Attelage (traction)', speed: 1, load: 0.8 },
};
interface Part { id: string; model: CapybaraModel; vehicle: CapybaraVehicleVisual | null; scale: number }

export async function createAnimalPreview(defs: readonly AnimalAuthorV1[], env: AnimalEnvironment) {
  const group = new THREE.Group(); group.name = 'AnimalPreview';
  const parts: Part[] = [], line = new THREE.LineBasicMaterial({ color: 0xf2c14e }), zone = new THREE.LineBasicMaterial({ color: 0x8fd18a });
  const ring = (x: number, z: number, radius: number, material: THREE.LineBasicMaterial): void => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2, px = x + Math.cos(a) * radius, pz = z + Math.sin(a) * radius; points.push(new THREE.Vector3(px, env.ground(px, pz) + 0.25, pz)); }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  };
  async function add(id: string, a: { species: string; x: number; z: number; heading: number; loadout: Parameters<typeof createCapybaraModel>[0] }): Promise<void> {
    const species = speciesOf(a.species), model = await createCapybaraModel(a.loadout), scale = species.modelScale;
    model.group.scale.setScalar(scale); model.group.position.set(a.x, env.ground(a.x, a.z), a.z); model.group.rotation.y = a.heading - Math.PI / 2;
    model.group.traverse((o) => { o.userData.animalId = id; });
    let vehicle: CapybaraVehicleVisual | null = null;
    if (isVehicleKind(a.loadout)) {
      vehicle = buildCapybaraVehicle(a.loadout);
      const hx = a.x - Math.sin(a.heading) * species.hitchOffset, hz = a.z - Math.cos(a.heading) * species.hitchOffset;
      vehicle.group.scale.setScalar(scale); vehicle.group.position.set(hx, env.ground(hx, hz), hz); vehicle.group.rotation.y = a.heading - Math.PI / 2; group.add(vehicle.group);
    }
    model.update(0, 0); group.add(model.group); parts.push({ id, model, vehicle, scale });
  }
  for (const def of defs) {
    try {
      if (def.kind === 'herd') { ring(def.x, def.z, def.radius, zone); for (const member of expandHerd(def, env)) await add(def.id, member); continue; }
      await add(def.id, def);
      if (def.roamRadius > 1) ring(def.home?.x ?? def.x, def.home?.z ?? def.z, def.roamRadius, zone);
      if (def.path) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(def.path.map((p) => new THREE.Vector3(p.x, env.ground(p.x, p.z) + 0.3, p.z))), line));
    } catch (e) { console.warn('Aperçu d’animal impossible', def.id, e); }
  }
  let mode: AnimalPreviewMode = 'idle', target: string | null = null;
  const look = new THREE.Vector3();
  return {
    group,
    /** Animals shown (herd members included), for tests and the status line. */
    get count() { return parts.length; },
    /** Plays one of the real runtime animations on one animal (or all when id is null). */
    play(next: AnimalPreviewMode, id: string | null): void {
      mode = next; target = id;
      const spec = ANIMAL_PREVIEWS[next];
      for (const p of parts) if (!id || p.id === id) p.model.play(spec.play ?? 'idle');
    },
    /** Advances the previewed animation in place (the animal does not travel in the Studio). */
    update(dt: number, time: number): void {
      const spec = ANIMAL_PREVIEWS[mode];
      for (const p of parts) {
        const active = !target || p.id === target, speed = active ? spec.speed : 0;
        if (active && spec.look) { const g = p.model.group; p.model.setLookTarget(look.set(g.position.x + Math.sin(time * 0.9) * 4, g.position.y + 1, g.position.z + Math.cos(time * 0.9) * 4)); } else p.model.setLookTarget(null);
        p.model.update(dt, { speed: speed / p.scale, load: active ? spec.load ?? 0 : 0, rider: active && spec.rider === true });
        p.vehicle?.roll(speed * dt / p.scale);
      }
    },
    dispose(): void { for (const p of parts) p.model.dispose(); parts.length = 0; group.removeFromParent(); group.clear(); line.dispose(); zone.dispose(); },
  };
}
export type AnimalPreview = Awaited<ReturnType<typeof createAnimalPreview>>;
