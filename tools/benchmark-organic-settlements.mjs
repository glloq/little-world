/** POI-first layouts: actual native sources and access checks; no renderer/FPS claim. */
import { mkdir, writeFile } from 'node:fs/promises';
import { flatSettlementProject } from './settlement-fixture.mjs';
import { newSettlement } from '../src/settlements/schema.ts';
import { DEFAULT_SETTLEMENT_LAYOUT } from '../src/settlements/layout.ts';
import { planSettlement } from '../src/settlements/planner.ts';
import { applySettlement } from '../src/settlements/authoring.ts';
import { validateSettlements } from '../src/settlements/validation.ts';
import { composeWorld } from '../src/studio-core/world-composition.ts';
import { DEFAULT_MAP_REQUIREMENTS } from '../src/studio-core/map-requirements.ts';
import { selectIslandStyle } from '../src/studio-core/island-styles.ts';
import { suggestSettlementSite } from '../src/settlements/site-search.ts';
const out = process.argv[2] ?? '/tmp/little-world-organic-settlements';
await mkdir(out, { recursive: true });
const rows = [];
for (const pattern of ['organic', 'clusters'])
    for (const form of ['village','town','fortified'])
    for (const targetBuildings of [12,60])
        for (let i = 0; i < 2; i++)
            {
                const orientation=i*45;
                const p = flatSettlementProject(), r = { ...newSettlement(p.world, 'poi-bench'), form,seed: 4242 + i * 7919, services: true, activity: 'commerce', targetBuildings, radius: 260, orientation, layout: { ...DEFAULT_SETTLEMENT_LAYOUT, pattern, density: i ? 'loose' : 'balanced', poi: 'market' } }, t = performance.now(), plan = planSettlement(p, r), planned = performance.now();
                let errors = [];
                try {
                    applySettlement(p, plan);
                    errors = validateSettlements(p).filter(d => d.severity === 'ERROR').map(d => d.code);
                }
                catch (e) {
                    errors = [String(e)];
                }
                rows.push({ form,pattern, seed: r.seed, targetBuildings, orientation, density: r.layout.density, houses: plan.buildings.length, sourceBytes: new TextEncoder().encode(JSON.stringify(p)).length, planMs: planned - t, commitAndValidationMs: performance.now() - planned, errors, warnings: plan.diagnostics.map(d => d.code) });
                console.log(pattern, targetBuildings, i, orientation, plan.buildings.length, errors);
            }
const natural = [];
for (const silhouette of ['crescent', 'turtle']) {
    const config = selectIslandStyle(DEFAULT_MAP_REQUIREMENTS, 'gentle');
    config.compositionVersion = 5;
    config.islandStyle.silhouette = silhouette;
    const p = composeWorld(config).project, r = { ...newSettlement(p.world, 'natural-poi'), radius: 110, services: true, activity: 'commerce', layout: structuredClone(DEFAULT_SETTLEMENT_LAYOUT) }, t = performance.now(), found = await suggestSettlementSite(p, r);
    if (found.plan)
        applySettlement(p, found.plan);
    natural.push({ silhouette, seed: config.seed, examined: found.examined, houses: found.plan?.buildings.length ?? 0, valid: !!found.plan && !validateSettlements(p).some(d => d.severity === 'ERROR'), center: found.plan?.recipe.center, ms: performance.now() - t });
}
const summary = { cases: rows.length, valid: rows.filter(r => !r.errors.length).length, fullTargets: rows.filter(r => r.houses === r.targetBuildings).length, maxPlanMs: Math.max(...rows.map(r => r.planMs)), maxCommitAndValidationMs: Math.max(...rows.map(r => r.commitAndValidationMs)), maxSourceBytes: Math.max(...rows.map(r => r.sourceBytes)) };
await writeFile(out + '/benchmark-report.json', JSON.stringify({ kind: 'Native-source CPU qualification, no GPU/FPS claim', summary, rows, natural }, null, 2));
console.log(summary, natural);
if (summary.valid !== summary.cases || natural.some(r => !r.valid))
    process.exitCode = 1;
