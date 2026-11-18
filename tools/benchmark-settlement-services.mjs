/** Services matrix: registry assets and source/collision qualification, no FPS promise. */
import { mkdir, writeFile } from 'node:fs/promises';
import { flatSettlementProject } from './settlement-fixture.mjs';
import { newSettlement } from '../src/settlements/schema.ts';
import { planSettlement } from '../src/settlements/planner.ts';
import { applySettlement } from '../src/settlements/authoring.ts';
import { validateSettlements } from '../src/settlements/validation.ts';
import { collisionDefinitionsFromProject } from '../src/studio-core/collision-adapter.ts';
const output = process.argv[2] ?? '/tmp/little-world-settlement-services';
await mkdir(output, { recursive: true });
const rows = [];
for (const activity of ['mixed', 'agriculture', 'forest', 'commerce'])
    for (const targetBuildings of [12, 60, 80])
        for (const orientation of [0, 45]) {
            const p = flatSettlementProject(), r = { ...newSettlement(p.world, 'services-bench'), services: true, activity, targetBuildings, radius: 180, orientation, seed: 4242 + targetBuildings }, t = performance.now(), plan = planSettlement(p, r), planned = performance.now();
            let errors = [];
            try {
                applySettlement(p, plan);
                errors = validateSettlements(p).filter(d => d.severity === 'ERROR').map(d => d.code);
            }
            catch (e) {
                errors = [String(e)];
            }
            rows.push({ activity, targetBuildings, orientation, houses: plan.buildings.length, amenities: plan.amenities?.map(a => a.role), warnings: plan.diagnostics.map(d => d.code), errors, planMs: planned - t, commitAndValidationMs: performance.now() - planned, colliders: collisionDefinitionsFromProject(p).length, sourceBytes: new TextEncoder().encode(JSON.stringify(p)).length });
            console.log(activity, targetBuildings, orientation, errors);
        }
const summary = { cases: rows.length, valid: rows.filter(r => !r.errors.length).length, fullHouses: rows.filter(r => r.houses === r.targetBuildings).length, maxAmenities: Math.max(...rows.map(r => r.amenities?.length ?? 0)), maxColliders: Math.max(...rows.map(r => r.colliders)), maxSourceBytes: Math.max(...rows.map(r => r.sourceBytes)), maxPlanMs: Math.max(...rows.map(r => r.planMs)), maxCommitAndValidationMs: Math.max(...rows.map(r => r.commitAndValidationMs)) };
await writeFile(output + '/benchmark-report.json', JSON.stringify({ kind: 'CPU/source qualification on a technical plain; no GPU/FPS qualification', summary, rows }, null, 2));
console.log(summary);
if (summary.valid !== summary.cases || summary.fullHouses !== summary.cases)
    process.exitCode = 1;
