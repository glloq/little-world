/** Studio « Animaux » (doc 110): place a capybara or a wild herd at the view centre, pick one
 * from the list, and preview the real runtime animations. Detailed fields live in the shared
 * inspector (selection), so the same element is edited from the 3D view, the map and here. */
import { node, button, field, input, select } from './dom.ts';
import type { StudioSession } from './session.ts';
import type { StudioViewport } from './viewport/editor-viewport.ts';
import { ANIMAL_PRESETS, animalElementLabel, createAnimal, putAnimal, type AnimalPreset } from '../studio-core/animal-authoring.ts';
import { ANIMAL_PREVIEW_IDS, ANIMAL_PREVIEWS, type AnimalPreview, type AnimalPreviewMode } from './animals-preview.ts';
import { STUDIO_ANIMAL_ENV } from './animal-inspector.ts';

export interface AnimalsPanelContext { session: StudioSession; viewport: StudioViewport; status(message: string, error?: boolean): void }
let preview: AnimalPreview | null = null, previewKey = '', timer: ReturnType<typeof setInterval> | null = null, mode: AnimalPreviewMode = 'idle';
const stopClock = (): void => { if (timer) clearInterval(timer); timer = null; };
async function refreshPreview(ctx: AnimalsPanelContext): Promise<void> {
  const animals = Object.values(ctx.session.document.libraries.animals ?? {}), key = JSON.stringify(animals);
  if (key === previewKey) return;
  previewKey = key; stopClock();
  preview?.dispose(); preview = null; ctx.viewport.setOverlay('animals', null);
  if (!animals.length) return;
  const { createAnimalPreview } = await import('./animals-preview.ts');
  const next = await createAnimalPreview(animals, STUDIO_ANIMAL_ENV);
  if (key !== previewKey) { next.dispose(); return; }
  preview = next; ctx.viewport.setOverlay('animals', next.group);
  ctx.viewport.canvas.dataset.animalPreview = String(next.count);
}
/** Plays a bounded preview (the Studio returns to on-demand rendering afterwards). */
function play(ctx: AnimalsPanelContext, next: AnimalPreviewMode, id: string | null, seconds = 6): void {
  if (!preview) return;
  mode = next; stopClock(); preview.play(next, id);
  let time = 0;
  timer = setInterval(() => {
    time += 1 / 30;
    if (!preview || time > seconds) { stopClock(); if (preview) { preview.play('idle', null); preview.update(1 / 30, time); ctx.viewport.invalidate(2); } return; }
    preview.update(1 / 30, time); ctx.viewport.invalidate(2);
    ctx.viewport.canvas.dataset.animalPreviewMode = next;
  }, 33);
}
/** Called by the shell when the module closes. */
export function disposeAnimalsPreview(ctx: Pick<AnimalsPanelContext, 'viewport'>): void {
  stopClock(); preview?.dispose(); preview = null; previewKey = ''; ctx.viewport.setOverlay('animals', null);
}
export function mountAnimalsPanel(host: HTMLElement, ctx: AnimalsPanelContext): void {
  const document = ctx.session.document, animals = Object.values(document.libraries.animals ?? {});
  const selected = ctx.session.selection.state.selected, selectedId = selected?.kind === 'animal' ? selected.id : null;
  host.append(node('h3', 'Animaux'), node('p', 'Capybaras sauvages, domestiques, montures et attelages. Sélectionnez un animal pour régler son type, son équipement, son propriétaire et son trajet dans l’inspecteur.', 'muted'));
  let preset: AnimalPreset = 'mount', name = '';
  const create = node('fieldset'); create.append(node('legend', 'Ajouter'));
  const hint = node('p', ANIMAL_PRESETS[preset].hint, 'muted');
  create.append(field('Modèle', select(preset, (Object.keys(ANIMAL_PRESETS) as AnimalPreset[]).map((id) => [id, ANIMAL_PRESETS[id].label] as const), (v) => { preset = v as AnimalPreset; hint.textContent = ANIMAL_PRESETS[preset].hint; })), hint,
    field('Nom (facultatif)', input('', (v) => { name = v.trim(); })),
    button('Créer au centre de la vue', async () => {
      const t = ctx.viewport.camera.target;
      try {
        const animal = createAnimal(ctx.session.document, preset, { x: Math.round(t.x * 10) / 10, z: Math.round(t.z * 10) / 10 }, name || undefined);
        await ctx.session.change('Créer un animal', [], (d) => { putAnimal(d, animal); });
        ctx.session.selection.select({ kind: 'animal', id: animal.id });
        ctx.status(`${animal.name} placé : réglez-le dans l’inspecteur puis « Jouer ici ».`);
      } catch (e) { ctx.status(String(e instanceof Error ? e.message : e), true); }
    }, 'primary-button'));
  host.append(create);
  const list = node('fieldset'); list.append(node('legend', `Dans ce projet (${animals.length})`)); list.dataset.animalCount = String(animals.length);
  if (!animals.length) list.append(node('p', 'Aucun animal : le projet se compile exactement comme avant.', 'muted'));
  for (const a of animals) {
    const row = button(animalElementLabel(document, a.id), () => { ctx.session.selection.select({ kind: 'animal', id: a.id }); ctx.viewport.goTo(a.x, a.z, a.kind === 'herd' ? a.radius : 8); });
    if (a.id === selectedId) row.setAttribute('aria-current', 'true');
    list.append(row);
  }
  host.append(list);
  if (animals.length) {
    const anim = node('fieldset'); anim.append(node('legend', 'Aperçu des animations'));
    anim.append(node('p', selectedId ? 'Joue sur l’animal sélectionné.' : 'Joue sur tous les animaux affichés.', 'muted'),
      field('Animation', select(mode, ANIMAL_PREVIEW_IDS.map((id) => [id, ANIMAL_PREVIEWS[id].label] as const), (v) => { mode = v as AnimalPreviewMode; })),
      button('Lire l’aperçu', () => play(ctx, mode, selectedId), 'primary-button'));
    host.append(anim);
  }
  void refreshPreview(ctx);
}
