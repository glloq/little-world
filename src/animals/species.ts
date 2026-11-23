/** Animal species registry — pure data shared by simulation, Studio and views.
 * A new species is one entry here plus a visual adapter in `animals/view.ts`.
 * Distances are WORLD metres (the visual model is scaled by `modelScale`).
 */
export const ANIMAL_LOADOUTS = ['none', 'saddle', 'pack', 'cart', 'wagon', 'caravan'] as const;
export type AnimalLoadout = typeof ANIMAL_LOADOUTS[number];
export const ANIMAL_VEHICLES = ['cart', 'wagon', 'caravan'] as const;
export type AnimalVehicleKind = typeof ANIMAL_VEHICLES[number];
export const isVehicleKind = (v: unknown): v is AnimalVehicleKind => ANIMAL_VEHICLES.includes(v as AnimalVehicleKind);
export const ANIMAL_GAITS = ['walk', 'fast', 'trot'] as const;
export type AnimalGait = typeof ANIMAL_GAITS[number];
export type AnimalHabitat = 'meadow' | 'wetland' | 'river' | 'lake' | 'forest' | 'coast' | 'scrub' | 'mountain' | 'volcanic' | 'village';

export interface VehicleSpec {
  /** Hitch pin to axle, overall length behind the pin, track width, wheel radius (metres). */
  axle: number; length: number; width: number; wheelRadius: number;
  /** Largest angle between animal and vehicle before the shafts bind (radians). */
  maxArticulation: number;
  cargoUnits: number;
  /** Fraction of the free speed when empty; a full load removes `loadPenalty` more. */
  speedFactor: number; loadPenalty: number;
  /** Steepest slope (rise/run) the team climbs empty; a full load removes a third. */
  maxSlope: number;
  reverse: boolean;
  /** Parked vehicles may be entered from the rear steps (interior is future work). */
  habitable: boolean;
}
export interface AnimalSpeciesDefinition {
  id: string; name: string;
  modelScale: number;
  /** Collision circle and half body length used for probes. */
  radius: number; halfLength: number; height: number;
  speeds: Record<AnimalGait, number> & { reverse: number };
  acceleration: number; braking: number;
  /** Yaw rate when moving / pivoting on the spot (rad/s) and tightest circle (m). */
  turnRate: number; pivotRate: number; turnRadius: number;
  maxSlope: number; maxWade: number;
  /** Offsets from the animal origin along its heading (m, world). */
  hitchOffset: number; riderSeat: { back: number; height: number };
  habitats: Partial<Record<AnimalHabitat, number>>;
  /** Needs gained per in-game hour (0..1 scales). */
  needs: { hunger: number; thirst: number; fatigue: number };
  perception: { notice: number; flee: number; calm: number };
  herd: { cohesion: number; max: number };
  loadouts: readonly AnimalLoadout[];
  rideable: boolean; packUnits: number;
  vehicles: Record<AnimalVehicleKind, VehicleSpec>;
}
const S = 0.7;
export const ANIMAL_SPECIES: Record<string, AnimalSpeciesDefinition> = {
  capybara: {
    id: 'capybara', name: 'Capybara', modelScale: S,
    radius: 0.47, halfLength: 1.05, height: 1.3,
    speeds: { walk: 1.3, fast: 2.2, trot: 3.8, reverse: 0.6 },
    acceleration: 2.2, braking: 4.5,
    turnRate: 1.6, pivotRate: 1.1, turnRadius: 1.5,
    maxSlope: 0.6, maxWade: 0.55,
    hitchOffset: 1.65 * S, riderSeat: { back: 0.48 * S, height: 1.73 * S },
    habitats: { wetland: 1, river: 1, lake: 1, meadow: 0.8, coast: 0.35, forest: 0.3, scrub: 0.15, village: 0.1 },
    needs: { hunger: 0.22, thirst: 0.3, fatigue: 0.12 },
    perception: { notice: 12, flee: 3.2, calm: 9 },
    herd: { cohesion: 9, max: 12 },
    loadouts: ANIMAL_LOADOUTS, rideable: true, packUnits: 12,
    vehicles: {
      cart: { axle: 1.53 * S, length: 2.45 * S, width: 1.5 * S, wheelRadius: 0.35 * S, maxArticulation: 1.2, cargoUnits: 30, speedFactor: 0.85, loadPenalty: 0.25, maxSlope: 0.42, reverse: true, habitable: false },
      wagon: { axle: 1.77 * S, length: 2.7 * S, width: 1.8 * S, wheelRadius: 0.43 * S, maxArticulation: 1.0, cargoUnits: 60, speedFactor: 0.75, loadPenalty: 0.35, maxSlope: 0.34, reverse: false, habitable: false },
      caravan: { axle: 1.77 * S, length: 2.95 * S, width: 1.8 * S, wheelRadius: 0.43 * S, maxArticulation: 0.9, cargoUnits: 40, speedFactor: 0.65, loadPenalty: 0.25, maxSlope: 0.28, reverse: false, habitable: true },
    },
  },
};
export const ANIMAL_SPECIES_IDS = Object.keys(ANIMAL_SPECIES);
export function speciesOf(id: string): AnimalSpeciesDefinition {
  const species = ANIMAL_SPECIES[id];
  if (!species) throw new Error(`Espèce animale inconnue : ${id}`);
  return species;
}
/** Tightest circle a team can follow without binding its shafts. */
export function teamTurnRadius(species: AnimalSpeciesDefinition, vehicle: AnimalVehicleKind | null): number {
  if (!vehicle) return species.turnRadius;
  const spec = species.vehicles[vehicle];
  return Math.max(species.turnRadius, (spec.axle + species.hitchOffset) / Math.tan(spec.maxArticulation * 0.8));
}
