# Ground cover V2 — grass-first implementation

Status: first implementation on `feat/ground-cover-grass-density-v2`, awaiting browser and integrated GPU qualification.

## Scope and invariants
- Preserve existing `src/render/grass.ts`: one opaque, non-shadow-casting InstancedMesh, three triangles per tuft, no grass physics or individual draw calls.
- Preserve deterministic seed/cell generation and Studio occupation exclusions.
- Increase ground grass, reduce decorative flowers/pebbles in grassy biomes only; preserve rocky mineral surfaces and volcanic/summit rocks.
- Three tuft silhouettes are produced by instance anisotropic scale and height; geometry, material, shader and draw calls remain shared.
- Never remove collectible resource deposits as part of purely decorative dressing changes.

## Initial values
| Quality | Old density | V2 density | Radius |
|---|---:|---:|---:|
| dense | 2.2 | 2.6 | 42m |
| balanced | 1.6 | 1.9 | 32m |
| ultra | 1.0 | 1.1 | 20m |
| groundOnly | 0 | 0 | 0m |

Density is multiplied by biome coverage; max instance capacity remains 24,000, without raising the overall scene budget.

## Remaining phases
1. Audit the separate procedural/static dressing for decorative rocks and flowers versus harvestable resources; reduce only decor and never strip mineral materials.
2. Run `npm test`, `npm run typecheck`, `npm run build`.
3. Run `npm run test:ground-cover` and `npm run benchmark:ground-cover` with controlled forest, meadow, wetland, night, flight, slope, and panorama views; capture baseline and V2 fixed-seed screenshots.
4. Examine instance-cap hits, CPU generation/upload timings, p95 frame intervals, triangle counts, draw calls, and scene-appropriate occlusion; consider chunked culling only if measurements justify it.
5. Confirm Studio edits/masks/Undo/Redo and reproducibility; test a 4–8GB machine with integrated GPU, since SwiftShader cannot certify real GPU performance.
6. Optional: provide explicit Studio grass-cover override and quality controls after avoiding schema duplication.

## Acceptance gates
- Measurably denser grass near players, without grass on volcanic basalt, snowy summits, roads, buildings, fields or water.
- No more grass draw calls than baseline; no extra material; three triangles per tuft.
- GPU-integrated test: no material regression in p95 frametime at equivalent camera path.
- Preserve existing generated/edited map compatibility and deterministic results.

## Rollback
Revert commits in this branch, or restore original `GRASS_PROFILES`, habitat weights, and silhouette scalars. No data schema changes are introduced.
