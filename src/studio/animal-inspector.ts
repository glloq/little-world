/** Inspector of an authored animal or herd (doc 110). Sections are contextual: a wild animal
 * shows habitat fields only, a team shows its route and cargo, and so on. Every change is one
 * transaction through `updateElement`, validated by the runtime schema. */
import { node, button, field, input, numberInput, select } from './dom.ts';
import type { ProjectDocument } from '../studio-core/types.ts';
import type { ElementPatch } from '../studio-core/elements.ts';
import { ANIMAL_ACCESS, ANIMAL_INITIAL_STATES, ANIMAL_ROLES, type AnimalAuthorV1, type AnimalInstanceV1 } from '../animals/schema.ts';
import { expandHerd } from '../animals/simulation.ts';
import { teamTurnRadius, isVehicleKind, speciesOf, type AnimalLoadout } from '../animals/species.ts';
import type { AnimalEnvironment } from '../animals/locomotion.ts';
import { animalConflicts, animalKeeperChoices, animalLoadoutPatch, animalRolePatch, inspectAnimalRoute } from '../studio-core/animal-authoring.ts';
import { insideWorld, terrainHeight, waterSurface } from '../terrain.ts';
import type { PolylineTarget } from './viewport/polyline-tool.ts';

export const STUDIO_ANIMAL_ENV: AnimalEnvironment = { ground: terrainHeight, water: waterSurface, inside: insideWorld };
const ROLES: Record<AnimalInstanceV1['role'], string> = { wild: 'Sauvage', domestic: 'Domestique', mount: 'Monture', draft: 'Transport (attelage)' };
const STATES = { idle: 'Debout', graze: 'Broute', rest: 'Au repos', sleep: 'Endormi' } as const;
const LOADOUTS: Record<AnimalLoadout, string> = { none: 'Aucun', saddle: 'Selle', pack: 'Sacoches', cart: 'Charrette', wagon: 'Chariot', caravan: 'Roulotte' };
const ACCESS = { owner: 'Propriétaire seulement', anyone: 'Tout le monde', nobody: 'Personne' } as const;
const ACQUISITIONS = { none: 'Non cessible', granted: 'Adoption libre', purchase: 'Achat', quest: 'Récompense de quête', loan: 'Prêt temporaire' } as const;
const deg = (r: number): number => Math.round(r * 180 / Math.PI), rad = (d: number): number => Math.round(d * Math.PI / 180 * 100) / 100;
const options = <T extends string>(labels: Record<T, string>, keys: readonly T[] = Object.keys(labels) as T[]): [T, string][] => keys.map((k) => [k, labels[k]]);

export interface AnimalInspectorContext {
  document: ProjectDocument;
  apply(label: string, patch: ElementPatch): void;
  editPath(target: PolylineTarget): void;
  view(x: number, z: number): void;
}
export function animalSection(box: HTMLElement, a: AnimalAuthorV1, ctx: AnimalInspectorContext): void {
  const { apply } = ctx, section = (title: string): HTMLFieldSetElement => { const f = node('fieldset'); f.dataset.animalSection = title; f.append(node('legend', title)); box.append(f); return f; };
  const check = (label: string, value: boolean, change: (on: boolean) => void): HTMLElement => { const c = node('input'); c.type = 'checkbox'; c.checked = value; c.onchange = () => change(c.checked); return field(label, c); };
  const identity = section(a.kind === 'herd' ? 'Harde sauvage' : 'Animal');
  identity.append(field('Nom', input(a.name, (v) => { if (v.trim()) apply('Renommer un animal', { name: v.trim() }); })),
    field('X (m)', numberInput(a.x, (v) => apply('Déplacer un animal', { x: v }))), field('Z (m)', numberInput(a.z, (v) => apply('Déplacer un animal', { z: v }))));
  if (a.kind === 'herd') {
    const species = speciesOf(a.species), members = expandHerd(a, { ...STUDIO_ANIMAL_ENV, habitat: undefined }).length;
    identity.append(field('Rayon de la zone (m)', numberInput(a.radius, (v) => apply('Rayon de la harde', { radius: Math.max(4, Math.min(200, v)) }), 4, 200)),
      field('Individus souhaités', numberInput(a.count, (v) => apply('Taille de la harde', { count: Math.max(1, Math.min(species.herd.max, Math.round(v))) }), 1, species.herd.max, '1')),
      field('Graine', numberInput(a.seed, (v) => apply('Graine de la harde', { seed: Math.max(0, Math.round(v)) }), 0, 4294967295, '1')),
      node('p', `${members} emplacement(s) praticable(s) ici ; en jeu la population dépend aussi de l’habitat (berges, prairies humides, marais).`, 'muted'));
    return;
  }
  const species = speciesOf(a.species), vehicle = isVehicleKind(a.loadout) ? a.loadout : null, wild = a.role === 'wild';
  identity.append(field('Orientation (°)', numberInput(deg(a.heading), (v) => apply('Orienter un animal', { heading: rad(v) }), -360, 360, '1')),
    field('Type', select(a.role, options(ROLES, ANIMAL_ROLES), (v) => apply('Type d’animal', animalRolePatch(a, v as AnimalInstanceV1['role'])))),
    field('État initial', select(a.initialState, options(STATES, vehicle ? ['idle', 'graze'] : ANIMAL_INITIAL_STATES), (v) => apply('État initial', { initialState: v }))));
  if (!wild) identity.append(field('Équipement', select(a.loadout, options(LOADOUTS, species.loadouts), (v) => apply('Équipement', animalLoadoutPatch(a, v as AnimalLoadout)))));
  if (vehicle) { const spec = species.vehicles[vehicle];
    identity.append(node('p', `Encombrement : ${(spec.length + species.hitchOffset + species.halfLength).toFixed(1)} × ${spec.width.toFixed(1)} m · rayon de braquage ${teamTurnRadius(species, vehicle).toFixed(1)} m · pente max ${Math.round(spec.maxSlope * 100)} % · ${spec.cargoUnits} unités${spec.reverse ? '' : ' · pas de marche arrière'}`, 'muted')); }

  const life = section(wild ? 'Habitat' : 'Stationnement et déplacement');
  life.append(field('Rayon de déplacement (m)', numberInput(a.roamRadius, (v) => apply('Rayon de déplacement', { roamRadius: Math.max(0, Math.min(200, v)) }), 0, 200)),
    button(a.home ? 'Point de retour : ici' : 'Définir le point de retour ici', () => apply('Point de retour', { home: { x: a.x, z: a.z } })));
  if (a.home) life.append(button('Voir le point de retour', () => ctx.view(a.home!.x, a.home!.z)));
  if (wild) return;

  const keepers = animalKeeperChoices(ctx.document), keeperOptions: [string, string][] = [['', '— aucun —'], ['player', 'Le joueur'], ...keepers.map((k) => [k.id, k.name] as [string, string])];
  const owner = section('Propriété et accès');
  owner.append(field('Propriétaire', select(a.ownerId ?? '', keeperOptions, (v) => apply('Propriétaire de l’animal', { ownerId: v || null }))),
    field('Peut l’utiliser', select(a.access, options(ACCESS, ANIMAL_ACCESS), (v) => apply('Accès à l’animal', { access: v }))),
    field('Obtention par le joueur', select(a.acquisition?.mode ?? 'none', options(ACQUISITIONS), (v) => apply('Obtention de l’animal',
      { acquisition: v === 'none' ? null : v === 'purchase' ? { mode: v, price: a.acquisition?.price ?? 30 } : v === 'quest' ? { mode: v, questId: a.acquisition?.questId ?? 'quest:a-definir' } : { mode: v } }))));
  if (a.acquisition?.mode === 'purchase') owner.append(field('Prix (pièces)', numberInput(a.acquisition.price ?? 0, (v) => apply('Prix de l’animal', { acquisition: { mode: 'purchase', price: Math.max(0, Math.round(v)) } }), 0, 99999, '1')));
  if (a.acquisition?.mode === 'quest') owner.append(field('Quête liée (id)', input(a.acquisition.questId ?? '', (v) => { if (v.trim()) apply('Quête de l’animal', { acquisition: { mode: 'quest', questId: v.trim() } }); })));
  if (!a.path) owner.append(check('Suit son propriétaire', a.follows === true, (on) => apply('Suivi du propriétaire', { follows: on || null })));
  owner.append(check('État conservé dans les sauvegardes', a.persistent, (on) => apply('Persistance de l’animal', { persistent: on })));
  if (a.loadout === 'caravan') owner.append(check('Roulotte habitable (préparé, intérieur à venir)', a.dwelling === true, (on) => apply('Roulotte habitable', { dwelling: on || null })));

  if (a.loadout !== 'pack') {
    const route = section('Trajet et conducteur');
    route.append(field('Cavalier / conducteur (PNJ)', select(a.riderId ?? '', [['', '— aucun —'], ...keepers.map((k) => [k.id, k.name] as [string, string])],
      (v) => { if (v && !a.path) apply('Conducteur et trajet', { riderId: v, path: [{ x: a.x, z: a.z }, { x: a.x + 12, z: a.z }], pauseSeconds: 20 }); else apply('Conducteur de l’animal', { riderId: v || null }); })));
    route.append(button(a.path ? `Modifier le trajet (${a.path.length} points)` : 'Tracer un trajet', () => ctx.editPath({ label: 'Trajet : ' + a.name, points: a.path ?? [{ x: a.x, z: a.z }, { x: a.x + 12, z: a.z }], min: 2, max: 64, color: 0xf2c14e,
      commit: async (points) => { ctx.apply('Trajet de l’animal', { path: points.map((p) => ({ x: p.x, z: p.z })), x: points[0].x, z: points[0].z, pauseSeconds: a.pauseSeconds ?? 20 }); } }), 'primary-button'));
    if (a.path) {
      route.append(field('Pause à chaque extrémité (s)', numberInput(a.pauseSeconds ?? 20, (v) => apply('Pause du trajet', { pauseSeconds: Math.max(0, Math.min(3600, v)) }), 0, 3600, '1')),
        button('Supprimer le trajet', () => apply('Supprimer le trajet', { path: null, pauseSeconds: null, riderId: null })));
      const issues = [...inspectAnimalRoute(ctx.document, a.id, STUDIO_ANIMAL_ENV)], diag = node('div', '', 'path-diagnostics'); diag.dataset.count = String(issues.length);
      for (const d of issues) { const at = a.path[Math.min(a.path.length - 1, d.index)]; diag.append(button((d.severity === 'error' ? '⛔ ' : '⚠ ') + d.message, () => ctx.view(at.x, at.z), 'diagnostic ' + (d.severity === 'error' ? 'ERROR' : 'WARNING'))); }
      for (const message of animalConflicts(ctx.document, a.id)) diag.append(node('p', '⚠ ' + message, 'muted'));
      if (!issues.length) diag.append(node('p', 'Trajet praticable : pentes, largeur, virages et demi-tours vérifiés.', 'muted'));
      route.append(diag);
    }
  }
  const capacity = vehicle ? species.vehicles[vehicle].cargoUnits : a.loadout === 'pack' ? species.packUnits : 0;
  if (capacity) {
    const cargo = section('Chargement initial'), lines = a.cargo ?? [], used = lines.reduce((sum, c) => sum + c.quantity, 0), items = Object.values(ctx.document.libraries.items);
    cargo.append(node('p', `${used} / ${capacity} unités`, 'muted'));
    lines.forEach((line, i) => { const row = node('div', '', 'row');
      row.append(node('span', (items.find((item) => item.id === line.itemId)?.name ?? line.itemId) + ' × '), numberInput(line.quantity, (v) => apply('Quantité chargée', { cargo: lines.map((c, j) => (j === i ? { ...c, quantity: Math.max(1, Math.round(v)) } : c)) }), 1, capacity, '1'),
        button('Retirer', () => apply('Retirer du chargement', { cargo: lines.length > 1 ? lines.filter((_, j) => j !== i) : null })));
      cargo.append(row); });
    const free = items.filter((item) => !lines.some((c) => c.itemId === item.id));
    if (free.length && used < capacity) { let pick = free[0].id;
      cargo.append(field('Objet', select(pick, free.map((item) => [item.id, item.name] as [string, string]), (v) => { pick = v; })), button('Ajouter au chargement', () => apply('Ajouter au chargement', { cargo: [...lines, { itemId: pick, quantity: 1 }] }))); }
    if (!items.length) cargo.append(node('p', 'Aucun objet défini dans le projet.', 'muted'));
  }
}
