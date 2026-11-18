import {networkPattern} from '../settlements/neighborhood-network.ts';
import {isCorridor} from '../settlements/corridor.ts';
/** Direct manipulation of the draft recipe. Source changes still use the shared Studio commit. */
import type { SettlementRecipe } from '../settlements/schema.ts';
import { validateSettlementRecipe } from '../settlements/schema.ts';
import type { SettlementPlan } from '../settlements/planner.ts';
import { DEFAULT_SETTLEMENT_LAYOUT, sectorWeight, moduleCenter, layoutDimensions, recipeForBoundary } from '../settlements/layout.ts';
import type { WorldDefinitionV3 } from '../studio-core/types.ts';
type Point = {
    x: number;
    z: number;
};
interface Handle extends Point {
    kind: 'center' | 'radius' | 'rotation' | 'house' | 'module' | 'boundary';
    index?: number;
}
export function placementTool(canvas: HTMLCanvasElement, ctx: {
    world: WorldDefinitionV3;
    recipe: () => SettlementRecipe;
    plan: () => SettlementPlan | null;
    view: () => {
        minX: number;
        maxX: number;
        minZ: number;
        maxZ: number;
    };
    change: (r: SettlementRecipe, reframe: boolean) => void;
    redraw: () => void;
    message: (s: string) => void;
}) {
    let drawing: Point[] | null = null, drag: {
        handle: Handle;
        from: Point;
        to: Point;
        recipe: SettlementRecipe;
    } | null = null, suppressClick = false;
    const point = (e: {
        clientX: number;
        clientY: number;
    }) => { const b = canvas.getBoundingClientRect(), v = ctx.view(); return { x: v.minX + (e.clientX - b.left) / b.width * (v.maxX - v.minX), z: v.minZ + (e.clientY - b.top) / b.height * (v.maxZ - v.minZ) }; };
    function handles(): Handle[] {
        const r = ctx.recipe(), angle = r.orientation * Math.PI / 180, all: Handle[] = [{ kind: 'center', ...r.center }, { kind: 'rotation', x: r.center.x + Math.sin(angle) * (r.radius + 13), z: r.center.z + Math.cos(angle) * (r.radius + 13) }];
        if (r.layout?.boundary)
            all.push(...r.layout.boundary.map((q, index) => ({ kind: 'boundary' as const, ...q, index })));
        else
            all.push({ kind: 'radius', x: r.center.x + r.radius, z: r.center.z });
        const plan = ctx.plan();
        if (r.layout?.pattern !== 'linear' && r.layout) {
            const d = layoutDimensions(r);
            for (let lane = 0; !isCorridor(r) && !networkPattern(r) && lane < d.lanes; lane++)
                all.push({ kind: 'module', ...moduleCenter(r, lane), z: moduleCenter(r, lane).z + (lane === 0 ? 8 : 0), index: lane });
            for (const b of plan?.buildings ?? []) {
                if (plan?.preserved.includes(b.id))
                    continue;
                const e = plan?.entities.find(e => e.id === b.id), t = e?.components.Transform;
                if (t)
                    all.push({ kind: 'house', x: t.position.x, z: t.position.z, index: b.slot });
            }
        }
        return all;
    }
    function apply(r: SettlementRecipe) { try {
        validateSettlementRecipe(r, ctx.world);
        ctx.change(r, false);
    }
    catch (e) {
        ctx.message(e instanceof Error ? e.message : String(e));
        ctx.redraw();
    } }
    canvas.onpointerdown = e => { if (drawing)
        return; const q = point(e), rect = canvas.getBoundingClientRect(), v = ctx.view(), ppm = rect.width / (v.maxX - v.minX), hit = handles().map(h => ({ h, d: Math.hypot(h.x - q.x, h.z - q.z) * ppm })).sort((a, b) => a.d - b.d)[0]; if (!hit || hit.d > 12)
        return; canvas.setPointerCapture(e.pointerId); drag = { handle: hit.h, from: q, to: q, recipe: structuredClone(ctx.recipe()) }; suppressClick = true; e.preventDefault(); };
    canvas.onpointermove = e => { if (drag) {
        drag.to = point(e);
        ctx.redraw();
    } };
    canvas.onpointerup = () => {
        if (!drag)
            return;
        const { handle, from, to, recipe: r } = drag;
        drag = null;
        const dx = to.x - from.x, dz = to.z - from.z;
        if (Math.hypot(dx, dz) < .3) {
            ctx.redraw();
            return;
        }
        const layout = { ...DEFAULT_SETTLEMENT_LAYOUT, pattern: r.layout?.pattern ?? 'linear', ...r.layout };
        if (handle.kind === 'center') {
            r.center = { x: r.center.x + dx, z: r.center.z + dz };
            if (layout.boundary)
                layout.boundary = layout.boundary.map(q => ({ x: q.x + dx, z: q.z + dz }));
        }
        else if (handle.kind === 'radius')
            r.radius = Math.max(20, Math.min(600, Math.hypot(to.x - r.center.x, to.z - r.center.z)));
        else if (handle.kind === 'rotation') {
            const next = Math.atan2(to.x - r.center.x, to.z - r.center.z) * 180 / Math.PI, a = (next - r.orientation) * Math.PI / 180, rotate = <T extends {
                dx: number;
                dz: number;
            }>(v: T): T => ({ ...v, dx: v.dx * Math.cos(a) + v.dz * Math.sin(a), dz: -v.dx * Math.sin(a) + v.dz * Math.cos(a) });
            r.orientation = next;
            if (layout.modules)
                layout.modules = layout.modules.map(rotate);
            if (layout.adjustments)
                layout.adjustments = layout.adjustments.map(rotate);
        }
        else if (handle.kind === 'boundary' && layout.boundary)
            layout.boundary = layout.boundary.map((q, i) => i === handle.index ? { x: q.x + dx, z: q.z + dz } : q);
        else if (handle.kind === 'module') {
            const old = layout.modules?.find(m => m.lane === handle.index) ?? { lane: handle.index!, dx: 0, dz: 0 };
            layout.modules = [...(layout.modules ?? []).filter(m => m.lane !== handle.index), { ...old, dx: old.dx + dx / sectorWeight(.58), dz: old.dz + dz / sectorWeight(.58) }];
        }
        else if (handle.kind === 'house') {
            const old = layout.adjustments?.find(a => a.slot === handle.index) ?? { slot: handle.index!, dx: 0, dz: 0 };
            layout.adjustments = [...(layout.adjustments ?? []).filter(a => a.slot !== handle.index), { ...old, dx: old.dx + dx, dz: old.dz + dz }];
        }
        r.layout = layout;
        apply(r);
    };
    canvas.onpointercancel = () => { drag = null; ctx.redraw(); };
    canvas.onclick = e => { if (suppressClick) {
        suppressClick = false;
        return;
    } const q = point(e); if (drawing) {
        if (drawing.length < 32)
            drawing.push(q);
        ctx.redraw();
        return;
    } if (q.x < ctx.world.bounds.minX || q.x > ctx.world.bounds.maxX || q.z < ctx.world.bounds.minZ || q.z > ctx.world.bounds.maxZ)
        return; const r = structuredClone(ctx.recipe()), dx = q.x - r.center.x, dz = q.z - r.center.z; r.center = { x: Math.round(q.x), z: Math.round(q.z) }; if (r.layout?.boundary)
        r.layout.boundary = r.layout.boundary.map(p => ({ x: p.x + dx, z: p.z + dz })); try {
        validateSettlementRecipe(r, ctx.world);
        ctx.change(r, true);
    }
    catch (e) {
        ctx.message(String(e));
    } };
    const finish = () => { if (!drawing || drawing.length < 3) {
        ctx.message('Tracer au moins trois points pour définir la zone.');
        return;
    } try {
        const r = recipeForBoundary(ctx.recipe(), drawing);
        validateSettlementRecipe(r, ctx.world);
        drawing = null;
        ctx.change(r, true);
    }
    catch (e) {
        ctx.message(e instanceof Error ? e.message : String(e));
    } };
    const key = (e: KeyboardEvent) => { if (!drawing)
        return; if (e.key === 'Enter') {
        e.preventDefault();
        finish();
    }
    else if (e.key === 'Escape') {
        drawing = null;
        ctx.redraw();
    } };
    document.addEventListener('keydown', key);
    return { handles, ghost: () => drag, draftBoundary: () => drawing, startBoundary() { drawing = []; suppressClick = false; ctx.message('Cliquer les sommets de la zone, puis Entrée ou « Terminer la zone ».'); ctx.redraw(); }, finishBoundary: finish, cancelBoundary() { drawing = null; ctx.redraw(); }, dispose() { document.removeEventListener('keydown', key); canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onclick = null; } };
}
