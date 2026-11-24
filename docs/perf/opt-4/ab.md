**A** : Build A: main thread ; outils Révision `42f1fdf3` (claude/opt-4-streaming-workers), 2026-11-24, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Build B: workers ; outils Révision `42f1fdf3` (claude/opt-4-streaming-workers), 2026-11-24, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| flight | p50 ms | 250 | 242 | -3.3 % | 0.0 % | = |
| flight | p95 ms | 317 | 308 | -2.6 % | 0.0 % | = |
| flight | p99 ms | 358 | 342 | -4.6 % | 2.3 % | = |
| flight | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | update p50 | 18.2 | 14.6 | -19.8 % | 1.1 % | **mieux** |
| flight | update p95 | 34.0 | 30.5 | -10.4 % | 1.0 % | **mieux** |
| flight | update p99 | 47.0 | 43.5 | -7.4 % | 10.2 % | = |
| flight | submit p95 | 5.00 | 5.05 | 1.0 % | 4.0 % | = |
| flight | sim p95 | 0.25 | 0.25 | 0.0 % | 20.0 % | = |
| flight | upload KB/s | 1206 | 1234 | 2.3 % | 1.2 % | = |
| flight | alloc MB/s | 13.2 | 12.0 | -9.1 % | 28.9 % | = |
| flight | heap end MB | 62.2 | 67.4 | 8.4 % | 5.7 % | = |
| flight | long tasks | 100 | 100 | -0.2 % | 0.2 % | = |
| flight | calls | 155 | 155 | 0.1 % | 0.0 % | = |
| flight | tris k | 85.6 | 84.3 | -1.5 % | 0.1 % | = |
| zones | p50 ms | 242 | 242 | 0.0 % | 3.4 % | = |
| zones | p95 ms | 458 | 458 | -0.0 % | 1.8 % | = |
| zones | p99 ms | 508 | 500 | -1.6 % | 1.6 % | = |
| zones | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| zones | update p50 | 8.15 | 6.95 | -14.7 % | 4.3 % | **mieux** |
| zones | update p95 | 24.0 | 23.4 | -2.7 % | 6.0 % | = |
| zones | update p99 | 32.2 | 31.0 | -3.7 % | 10.2 % | = |
| zones | submit p95 | 5.05 | 6.00 | 18.8 % | 3.0 % | **pire** |
| zones | sim p95 | 0.45 | 0.40 | -11.1 % | 11.1 % | = |
| zones | upload KB/s | 713 | 697 | -2.2 % | 1.1 % | = |
| zones | alloc MB/s | 2.78 | 4.92 | 77.2 % | 1.8 % | **pire** |
| zones | heap end MB | 56.9 | 51.9 | -8.9 % | 1.5 % | **mieux** |
| zones | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| zones | calls | 139 | 139 | -0.0 % | 0.0 % | = |
| zones | tris k | 92.2 | 91.8 | -0.5 % | 0.2 % | = |
| forest | p50 ms | 375 | 358 | -4.4 % | 2.2 % | = |
| forest | p95 ms | 433 | 433 | 0.0 % | 0.0 % | = |
| forest | p99 ms | 458 | 458 | 0.0 % | 1.8 % | = |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 5.80 | 5.20 | -10.3 % | 1.7 % | **mieux** |
| forest | update p95 | 14.6 | 10.5 | -27.8 % | 6.5 % | **mieux** |
| forest | update p99 | 20.8 | 13.3 | -35.8 % | 2.4 % | **mieux** |
| forest | submit p95 | 4.45 | 4.85 | 9.0 % | 1.1 % | **pire** |
| forest | sim p95 | 0.25 | 0.20 | -20.0 % | 20.0 % | = |
| forest | upload KB/s | 449 | 462 | 2.9 % | 0.2 % | = |
| forest | alloc MB/s | 2.66 | 2.44 | -8.3 % | 9.8 % | = |
| forest | heap end MB | 52.9 | 51.6 | -2.6 % | 7.0 % | = |
| forest | long tasks | 100 | 100 | 0.2 % | 0.0 % | = |
| forest | calls | 124 | 125 | 0.2 % | 0.0 % | = |
| forest | tris k | 128 | 129 | 0.3 % | 0.0 % | = |

Synthèse : 7 métrique(s) meilleure(s), 3 pire(s) au-delà du seuil max(2×bruit, 5 %).
