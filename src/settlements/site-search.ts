/** Bounded search scored with the shared terrain and validated with the real access checker. */
import type { ProjectDocument } from '../studio-core/types.ts';
import type { SettlementRecipe } from './schema.ts';
import { settlementTerrain } from './terrain.ts';
import { planSettlement, settlementSourceHash, type SettlementPlan } from './planner.ts';
import { previewSettlementProject } from './authoring.ts';
import { validateSettlements } from './validation.ts';
import { compilePolygon } from '../geography/archipelago.ts';
export async function suggestSettlementSite(p: ProjectDocument, recipe: SettlementRecipe, options: {
    yield?: () => Promise<void>;
    progress?: (done: number, total: number) => void;
    maxCandidates?: number;
} = {}) {
    const hash = settlementSourceHash(p), c = settlementTerrain(p), polygon = recipe.layout?.boundary, inside = polygon ? compilePolygon(polygon) : () => 1, b = polygon ? { minX: Math.min(...polygon.map(q => q.x)), maxX: Math.max(...polygon.map(q => q.x)), minZ: Math.min(...polygon.map(q => q.z)), maxZ: Math.max(...polygon.map(q => q.z)) } : p.world.bounds;
    const candidates: {
        x: number;
        z: number;
        score: number;
    }[] = [];
    for (let ix = 1; ix < 20; ix++)
        for (let iz = 1; iz < 20; iz++) {
            const x = b.minX + (b.maxX - b.minX) * ix / 20, z = b.minZ + (b.maxZ - b.minZ) * iz / 20, h = c.height(x, z), slope = Math.hypot(c.height(x + 12, z) - c.height(x - 12, z), c.height(x, z + 12) - c.height(x, z - 12)) / 24;
            if (h > p.world.seaLevel + 2 && !c.wet(x, z) && inside(x, z) >= 0 && slope < .08)
                candidates.push({ x, z, score: slope * 100 + Math.hypot(x - recipe.center.x, z - recipe.center.z) / 1000 });
        }
    candidates.sort((a, b) => a.score - b.score);
    const sample = candidates.slice(0, Math.min(12, Math.max(1, options.maxCandidates ?? 12)));
    let plan: SettlementPlan | null = null, examined = 0;
    for (const q of sample) {
        if (settlementSourceHash(p) !== hash)
            throw Error('Le projet a changé pendant la recherche : relancer la proposition.');
        examined++;
        options.progress?.(examined, sample.length);
        await options.yield?.();
        const candidate = planSettlement(p, { ...structuredClone(recipe), center: { x: q.x, z: q.z } });
        if (candidate.diagnostics.some(d => d.severity === 'ERROR') || plan && candidate.buildings.length <= plan.buildings.length)
            continue;
        if (validateSettlements(previewSettlementProject(p, candidate), recipe.id).some(d => d.severity === 'ERROR'))
            continue;
        plan = candidate;
        if (plan.buildings.length === recipe.targetBuildings)
            break;
    }
    return { plan, examined, candidateCount: candidates.length };
}
