import {worldAsset} from '../world-production/registry.ts';
/** One Studio module: native sources, Canvas preview and the shared viewport/history. */
import { node, button, field, input, numberInput, select } from './dom.ts';
import type { StudioSession } from './session.ts';
import { newSettlement, type SettlementRecipe } from '../settlements/schema.ts';
import { planSettlement, type SettlementPlan } from '../settlements/planner.ts';
import { applySettlement, previewSettlementProject, settlementChunkIds, lockSettlementBuilding, removeSettlement, removeSettlementBuilding,lockSettlementAmenity,removeSettlementAmenity } from '../settlements/authoring.ts';
import { validateSettlements } from '../settlements/validation.ts';
import { terrainAccessContext } from '../studio-core/terrain-access.ts';
import { fingerprint } from '../world-production/landscape-schema.ts';
export function mountSettlements(host: HTMLElement, s: StudioSession, options: {
    status: (text: string, error?: boolean) => void;
    open3D: (view?: {
        x: number;
        z: number;
        radius: number;
    }) => void;
    play: () => void;
}) {
    const p = s.document, b = p.world.bounds, center = s.selection.state.camera.target ?? { x: 0, z: 0 }, root = node('div', '', 'settlements-view'), form = node('section', '', 'section-card'), preview = node('section', '', 'section-card'), list = node('section', '', 'section-card'), canvas = node('canvas'), result = node('div');
    canvas.width = 900;
    canvas.height = 610;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.touchAction = 'none';
    canvas.setAttribute('aria-label', 'Plan des villages et villes');
    preview.append(canvas, result);
    root.append(form, preview, list);
    host.replaceChildren(root);
    const fresh = () => newSettlement(p.world, 'settlement-' + crypto.randomUUID().slice(0, 8), { x: Math.min(b.maxX, Math.max(b.minX, center.x)), z: Math.min(b.maxZ, Math.max(b.minZ, center.z)) });
    let recipe = fresh(), plan: SettlementPlan | null = null, disposed = false, busy = false, globalView = false, step = 1, view = { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
    const report = (text: string, error = false) => options.status(text, error);
    async function run(fn: () => Promise<void> | void) { if (busy)
        return; busy = true; try {
        await fn();
    }
    catch (e) {
        report(e instanceof Error ? e.message : String(e), true);
    }
    finally {
        busy = false;
        if (!disposed)
            render();
    } }
    function update(change: Partial<SettlementRecipe>) { recipe = { ...recipe, ...change }; plan = null; result.replaceChildren(node('p', 'Réglages modifiés : recalculer l’aperçu avant de créer.')); draw(); }
    function draw() {
        if (disposed)
            return;
        const c = canvas.getContext('2d')!, span = globalView ? Math.max(b.maxX - b.minX, (b.maxZ - b.minZ) * canvas.width / canvas.height) : Math.max(150, recipe.radius * 2.6), depth = span * canvas.height / canvas.width, cx = globalView ? (b.minX + b.maxX) / 2 : recipe.center.x, cz = globalView ? (b.minZ + b.maxZ) / 2 : recipe.center.z;
        view = { minX: cx - span / 2, maxX: cx + span / 2, minZ: cz - depth / 2, maxZ: cz + depth / 2 };
        canvas.dataset.view = JSON.stringify(view);
        const ctx = terrainAccessContext(p), px = (x: number) => (x - view.minX) / span * canvas.width, pz = (z: number) => (z - view.minZ) / depth * canvas.height;
        for (let y = 0; y < canvas.height; y += 7)
            for (let x = 0; x < canvas.width; x += 7) {
                const wx = view.minX + x / canvas.width * span, wz = view.minZ + y / canvas.height * depth, h = ctx.height(wx, wz);
                c.fillStyle = wx < b.minX || wx > b.maxX || wz < b.minZ || wz > b.maxZ ? '#e1e5e1' : ctx.wet(wx, wz) || h <= p.world.seaLevel ? '#3b7f9e' : `hsl(83 26% ${Math.max(37, 72 - h * .07)}%)`;
                c.fillRect(x, y, 7, 7);
            }
        const path = (points: {
            x: number;
            z: number;
        }[], color: string, width: number) => { c.strokeStyle = color; c.lineWidth = Math.max(1, width / span * canvas.width); c.beginPath(); points.forEach((q, i) => i ? c.lineTo(px(q.x), pz(q.z)) : c.moveTo(px(q.x), pz(q.z))); c.stroke(); };
        for (const v of Object.values(p.libraries.paths))
            path(v.points, '#8b806b', v.width);
        for (const v of plan?.paths ?? [])
            path(v.points, '#a76234', v.width);
        c.strokeStyle = '#305f45';
        c.lineWidth = 2;
        c.setLineDash([6, 4]);
        c.beginPath();
        c.ellipse(px(recipe.center.x), pz(recipe.center.z), recipe.radius / span * canvas.width, recipe.radius / depth * canvas.height, 0, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        const entities = plan?.entities ?? Object.values(p.chunks).flatMap(c => Object.values(c.entities));
        for (const e of entities) {
            const t = e.components.Transform;
            if(!t)continue;if(!e.components.Habitat){if(e.id.includes('-service-')){const size=worldAsset(e.components.Visual?.assetId??'')?.size??[2,2,2];c.save();c.translate(px(t.position.x),pz(t.position.z));c.rotate(-2*Math.atan2(t.rotation.y,t.rotation.w));c.fillStyle=e.components.State?.initial.shop?'#d39851':'#608db0';c.fillRect(-size[0]/2/span*canvas.width,-size[2]/2/depth*canvas.height,size[0]/span*canvas.width,size[2]/depth*canvas.height);c.restore();c.fillStyle='#23382e';c.font='11px sans-serif';c.fillText(e.name,px(t.position.x)+5,pz(t.position.z)-6);}continue;}
            const a = 2 * Math.atan2(t.rotation.y, t.rotation.w);
            c.save();
            c.translate(px(t.position.x), pz(t.position.z));
            c.rotate(-a);
            c.fillStyle = plan?.buildings.find(b => b.id === e.id)?.locked ? '#5a5b68' : '#f5d7a0';
            c.strokeStyle = '#563c2b';
            c.lineWidth = 1;
            c.fillRect(-3 / span * canvas.width, -3.5 / depth * canvas.height, 6 / span * canvas.width, 7 / depth * canvas.height);
            c.strokeRect(-3 / span * canvas.width, -3.5 / depth * canvas.height, 6 / span * canvas.width, 7 / depth * canvas.height);
            c.restore();
        }
        c.fillStyle = '#71381e';
        c.beginPath();
        c.arc(px(recipe.center.x), pz(recipe.center.z), 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#19372e';
        c.font = '14px sans-serif';
        c.fillText('N ↑ · Cliquer pour choisir le centre', 12, 22);
        canvas.dataset.planHash = plan ? fingerprint([plan.entities, plan.paths]) : '';
    }
    async function calculate() { await s.fullDocument(); const generated = planSettlement(p, recipe); const checked = generated.diagnostics.some(d => d.severity === 'ERROR') ? [] : validateSettlements(previewSettlementProject(p, generated), recipe.id); generated.diagnostics.push(...checked); plan = generated; step = 4; showPlan(); }
    function showPlan() {
        if (!plan)
            return;
        result.replaceChildren(node('strong', `${plan.buildings.length} maisons · ${plan.amenities?.length??0} équipements · ${plan.paths.filter(v => !v.id.includes('-access-')).length} voies partagées · ${plan.paths.filter(v => v.id.includes('-access-')&&!v.id.includes('-civic-')).length} accès privés · ${plan.paths.filter(v=>v.id.includes('-civic-access-')).length} accès aux équipements`), node('p', `${plan.preserved.length} éléments protégés · ${plan.removed.length} suppressions · calcul ${Math.round(plan.generationMs)} ms`, 'muted'), ...plan.diagnostics.map(d => node('p', d.message, 'diagnostic ' + d.severity)));
        const commit = button(p.libraries.settlements?.[recipe.id] ? 'Appliquer les changements' : 'Créer dans le monde', () => void run(async () => { const current = plan!; await s.change('Créer / modifier ' + recipe.name, settlementChunkIds(p, current), d => applySettlement(d, current)); recipe = structuredClone(p.libraries.settlements![recipe.id].recipe); plan = null; result.replaceChildren(node('p', 'Implantation enregistrée · une opération annulable.', 'status-success'), button('Modifier dans Studio', () => { const id = p.libraries.settlements![recipe.id].buildings[0]?.id; if (id)
            s.selection.select({ kind: 'entity', id }); options.open3D(); }), button('Jouer ici', () => { const b = p.libraries.settlements?.[recipe.id]?.buildings[0]; if (b)
            s.selection.select({ kind: 'entity', id: b.id }); options.play(); })); }), 'primary-button');
        commit.disabled = plan.diagnostics.some(d => d.severity === 'ERROR');
        result.append(commit);
    }
    function render() {
        if (disposed)
            return;
        form.replaceChildren(node('h2', 'Villages & villes'), node('p', 'Choisir une implantation, prévisualiser puis créer. Les maisons ont des portes indépendantes et des murs solides.', 'muted'));
        const steps = node('nav');
        for (const [n, label] of [[1, '1. Type'], [2, '2. Emplacement'], [3, '3. Personnalisation'], [4, '4. Aperçu']] as const) {
            const v = button(label, () => { step = n; render(); });
            v.setAttribute('aria-pressed', String(step === n));
            steps.append(v);
        }
        form.append(steps);
        if (step === 1) {
            form.append(field('Type d’implantation', select(recipe.form, [['hamlet', 'Hameau'], ['village', 'Village'], ['town', 'Bourg / petite ville (80 maisons maximum)']], v => { const form = v as SettlementRecipe['form']; update({ form, targetBuildings: form === 'hamlet' ? 12 : form === 'village' ? 40 : 70, radius: form === 'hamlet' ? 90 : 150 }); render(); })), node('p', 'Campements, ports bâtis, fortifications et grottes habitables : pas encore disponibles.', 'muted'));
        }
        if (step === 2) {
            const toggle = button(globalView ? 'Zoomer sur l’implantation' : 'Voir toute l’île', () => { globalView = !globalView; draw(); });
            form.append(node('p', 'Cliquer sur le plan pour placer le centre. Choisir une plaine ou un replat ; aucune terrasse n’est creusée silencieusement.', 'muted'), toggle, button('Chercher un emplacement', () => void run(async () => { await s.fullDocument(); const ctx = terrainAccessContext(p), candidates: {
                x: number;
                z: number;
                score: number;
            }[] = []; for (let ix = 1; ix < 20; ix++)
                for (let iz = 1; iz < 20; iz++) {
                    const x = b.minX + (b.maxX - b.minX) * ix / 20, z = b.minZ + (b.maxZ - b.minZ) * iz / 20, h = ctx.height(x, z), slope = Math.hypot(ctx.height(x + 12, z) - ctx.height(x - 12, z), ctx.height(x, z + 12) - ctx.height(x, z - 12)) / 24;
                    if (h > p.world.seaLevel + 2 && !ctx.wet(x, z) && slope < .08)
                        candidates.push({ x, z, score: slope * 100 + Math.hypot(x - recipe.center.x, z - recipe.center.z) / 1000 });
                } candidates.sort((a, b) => a.score - b.score); let best: SettlementPlan | null = null; for (const q of candidates.slice(0, 12)) {
                const v = planSettlement(p, { ...recipe, center: { x: q.x, z: q.z } });
                if (!v.diagnostics.some(d => d.severity === 'ERROR') && (!best || v.buildings.length > best.buildings.length))
                    best = v;
                if (v.buildings.length === recipe.targetBuildings)
                    break;
            } if (best) {
                recipe = best.recipe;
                plan = null;
                globalView = false;
                report('Emplacement suggéré : ' + best.buildings.length + ' maisons possibles. Prévisualiser pour vérifier les accès.');
            }
            else
                report('Aucun emplacement compatible trouvé : choisir ou aménager une zone plus plate.', true); })));
        }
        if (step === 3) {
            const sizes = recipe.form === 'hamlet' ? [8, 12, 15] : recipe.form === 'village' ? [20, 40, 60] : [60, 70, 80];
            form.append(field('Taille', select(String(recipe.targetBuildings), sizes.map((v, i) => [String(v), ['Petite', 'Moyenne', 'Grande'][i] + ' · ' + v + ' maisons']), v => update({ targetBuildings: Number(v) }))), field('Style architectural', select(recipe.style, [['auto', 'Automatique / mixte'], ['timber', 'Bois'], ['stone', 'Pierre'], ['white', 'Enduit clair']], v => update({ style: v as SettlementRecipe['style'] }))), field('Richesse', select(String(recipe.wealth), [['0', 'Modeste'], ['1', 'Équilibrée'], ['2', 'Prospère']], v => update({ wealth: Number(v) as 0 | 1 | 2 }))), field('Activité dominante', select(recipe.activity, [['mixed', 'Mixte'], ['agriculture', 'Agriculture'], ['forest', 'Forêt'],['mine','Mine'],['fishing','Pêche'],['commerce','Commerce']], v => update({ activity: v as SettlementRecipe['activity'] }))), node('p', 'Les équipements dépendent de l’activité et des ressources proches. Aucun PNJ ni économie simulée n’est ajouté.', 'muted'));
        }
        if(step===3){const services=node('input');services.type='checkbox';services.checked=!!recipe.services;services.onchange=()=>{update({services:services.checked,radius:services.checked?Math.max(110,recipe.radius):recipe.radius});render();};form.append(field('Ajouter une place et des équipements',services));}
        const advanced = node('details');
        advanced.append(node('summary', 'Plus de réglages'), field('Nom de l’implantation', input(recipe.name, v => update({ name: v }))), field('Centre X (m)', numberInput(recipe.center.x, x => update({ center: { ...recipe.center, x } }), b.minX, b.maxX)), field('Centre Z (m)', numberInput(recipe.center.z, z => update({ center: { ...recipe.center, z } }), b.minZ, b.maxZ)), field('Rayon (m)', numberInput(recipe.radius, radius => update({ radius }), 20, 600)), field('Orientation des rues (°)', numberInput(recipe.orientation, orientation => update({ orientation }), -360, 360)), field('Graine de l’implantation', numberInput(recipe.seed, seed => update({ seed }), 0, 0xffffffff, '1')));
        form.append(advanced);
        if (step < 4)
            form.append(button('Continuer →', () => { step++; render(); }));
        form.append(button('Prévisualiser l’implantation', () => void run(calculate)), button('Varier les maisons', () => void run(async () => { recipe = { ...recipe, houseVariation: recipe.houseVariation + 1 }; await calculate(); })));
        if (step === 4 && !plan)
            form.append(node('p', 'Recalculer l’aperçu pour afficher les contraintes et activer la création.', 'muted'));
        list.replaceChildren(node('h3', 'Implantations du projet'));
        for (const s0 of Object.values(p.libraries.settlements ?? {})) {
            const row = node('div', '', 'section-card');
            row.append(node('strong', s0.recipe.name + ' · ' + s0.buildings.length + ' maisons'), button('Modifier ' + s0.recipe.name, () => { recipe = structuredClone(s0.recipe); plan = null; step = 3; result.replaceChildren(); render(); }), button('Voir en 3D', () => { const b = s0.buildings[0]; if (b)
                s.selection.select({ kind: 'entity', id: b.id }); options.open3D({ ...s0.recipe.center, radius: s0.recipe.radius * .7 }); }), button('Supprimer ' + s0.recipe.name, () => void run(async () => { const ids = Object.keys(p.chunkIndex); await s.change('Supprimer ' + s0.recipe.name, ids, d => removeSettlement(d, s0.id)); plan = null; if (recipe.id === s0.id)
                recipe = fresh(); report('Implantation retirée ; retouches et éléments verrouillés conservés.'); })));
            const buildings = select('', [['', 'Choisir une maison'], ...s0.buildings.map(b => [b.id, p.entityIndex[b.id]?.name ?? b.id] as const)], id => { if (id) {
                s.selection.select({ kind: 'entity', id });
                render();
            } });
            row.append(field('Maison à modifier', buildings));
            const selected = s.selection.state.selected?.id, b = s0.buildings.find(b => b.id === selected);
            if (b) {
                const lock = node('input');
                lock.type = 'checkbox';
                lock.checked = b.locked;
                lock.onchange = () => void run(async () => { await s.change('Verrouiller une maison', [], d => lockSettlementBuilding(d, s0.id, b.id, lock.checked)); plan = null; });
                row.append(field('Verrouiller cette maison', lock), button('Modifier cette maison en 3D', options.open3D), button('Supprimer cette maison', () => void run(async () => { await s.change('Supprimer une maison', Object.keys(p.chunkIndex), d => removeSettlementBuilding(d, s0.id, b.id)); plan = null; })));
            }
            if(s0.amenities?.length){const picker=select('',[['','Choisir un équipement'],...s0.amenities.map(a=>[a.id,p.entityIndex[a.id]?.name??a.id] as const)],id=>{if(id){s.selection.select({kind:'entity',id});render();}});row.append(field('Équipement à modifier',picker));const a=s0.amenities.find(a=>a.id===selected);if(a){const lock=node('input');lock.type='checkbox';lock.checked=a.locked;lock.onchange=()=>void run(async()=>{await s.change('Verrouiller un équipement',[],d=>lockSettlementAmenity(d,s0.id,a.id,lock.checked));plan=null;});row.append(field('Verrouiller cet équipement',lock),button('Modifier cet équipement en 3D',options.open3D),button('Supprimer cet équipement',()=>void run(async()=>{await s.change('Supprimer un équipement',Object.keys(p.chunkIndex),d=>removeSettlementAmenity(d,s0.id,a.id));plan=null;})));}}
            list.append(row);
        }
        list.append(button('Nouvelle implantation', () => { recipe = fresh(); plan = null; step = 1; result.replaceChildren(); render(); }));
        draw();
    }
    canvas.onclick = e => { if (busy)
        return; const box = canvas.getBoundingClientRect(), x = view.minX + (e.clientX - box.left) / box.width * (view.maxX - view.minX), z = view.minZ + (e.clientY - box.top) / box.height * (view.maxZ - view.minZ); if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)
        return; update({ center: { x: Math.round(x), z: Math.round(z) } }); globalView = false; step = 2; render(); };
    const stop = s.commands.subscribe(() => { if (disposed)
        return; plan = null; result.replaceChildren(node('p', 'Projet modifié : recalculer l’aperçu.')); render(); });
    void run(async () => { await s.fullDocument(); });
    return () => { disposed = true; stop(); canvas.onclick = null; };
}
