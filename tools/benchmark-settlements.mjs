/** CPU/authoring qualification, not a GPU/FPS benchmark. No public map writes. */
import { mkdir, writeFile } from 'node:fs/promises';
import { flatSettlementProject } from './settlement-fixture.mjs';
import { newSettlement } from '../src/settlements/schema.ts';
import { planSettlement } from '../src/settlements/planner.ts';
import { applySettlement } from '../src/settlements/authoring.ts';
import { validateSettlements } from '../src/settlements/validation.ts';
import { collisionDefinitionsFromProject } from '../src/studio-core/collision-adapter.ts';
import { WorldCollisionQuery } from '../src/physics/collision-world.ts';
import { CommandBus } from '../src/studio-core/commands.ts';
import { editDocument } from '../src/studio-core/edit.ts';
import { settlementChunkIds } from '../src/settlements/authoring.ts';
const output = process.argv[2] ?? '/tmp/little-world-settlements';
await mkdir(output, { recursive: true });
const rows = [];
for (const targetBuildings of [12, 60, 80])
    for (let seed = 0; seed < 10; seed++) {
        const p = flatSettlementProject(), r = { ...newSettlement(p.world, 'settlement-bench'), seed: seed * 7919 + 4242, form: targetBuildings === 12 ? 'hamlet' : 'village', targetBuildings, radius: 180, orientation: [0, 30, 45, 90][seed % 4] }, a = performance.now(), plan = planSettlement(p, r), planned = performance.now(), bus = new CommandBus(p);
        editDocument(bus, 'Benchmark village', settlementChunkIds(p, plan), d => applySettlement(d, plan));
        const committed = performance.now(), diagnostics = validateSettlements(p), colliders = collisionDefinitionsFromProject(p), query = new WorldCollisionQuery(() => 12, () => null);
        for (const d of colliders)
            query.add({ ...d, position: { ...d.position, y: d.position.y + 12 }, enabled: () => !d.id.endsWith('-door') });
        const timings = [];
        for (let i = 0; i < 120; i++) {
            const z = (i / 120 - .5) * 150, t = performance.now();
            query.sweep({ x: 0, y: 12, z }, { x: 0, y: 12, z: z + 1 }, .4, 1.8);
            timings.push(performance.now() - t);
        }
        timings.sort((a, b) => a - b);
        rows.push({ seed: r.seed, orientation: r.orientation, targetBuildings, buildings: plan.buildings.length, entities: Object.keys(p.entityIndex).length, paths: plan.paths.length, sharedPaths: plan.paths.filter(p => !p.id.includes('-access-')).length, colliders: colliders.length, sourceBytes: new TextEncoder().encode(JSON.stringify(p)).length, planMs: planned - a, commitMs: committed - planned, queryP95Ms: timings[Math.floor(timings.length * .95)], errors: diagnostics.filter(d => d.severity === 'ERROR').map(d => d.code), undoBytes: JSON.stringify(bus.serialize()).length });
        console.log(targetBuildings, seed, rows.at(-1).errors);
    }
const max = key => Math.max(...rows.map(r => r[key])), summary = { scenarios: rows.length, fullyPlaced: rows.filter(r => r.buildings === r.targetBuildings).length, valid: rows.filter(r => !r.errors.length).length, maxBuildings: max('buildings'), maxColliders: max('colliders'), maxSourceBytes: max('sourceBytes'), maxPlanMs: max('planMs'), maxCommitMs: max('commitMs'), maxQueryP95Ms: max('queryP95Ms'), maxUndoBytes: max('undoBytes') };
await writeFile(output + '/benchmark-report.json', JSON.stringify({ kind: 'CPU and source qualification; no FPS or GPU claim', summary, rows }, null, 2));
console.log(summary);
if (summary.valid !== summary.scenarios || summary.fullyPlaced !== summary.scenarios)
    process.exitCode = 1;
