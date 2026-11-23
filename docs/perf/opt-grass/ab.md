**A** : Build A: grassUpload=full ; outils Révision `ffc0b6fb` (claude/opt-grass-stable-slots), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Build B: plages stables ; outils Révision `ffc0b6fb` (claude/opt-grass-stable-slots), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| forest | p50 ms | 350 | 350 | 0.0 % | 0.0 % | = |
| forest | p95 ms | 408 | 400 | -2.0 % | 2.0 % | = |
| forest | p99 ms | 433 | 425 | -1.9 % | 0.0 % | = |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 5.50 | 5.30 | -3.6 % | 0.0 % | = |
| forest | update p95 | 14.3 | 14.3 | 0.0 % | 5.3 % | = |
| forest | update p99 | 21.1 | 17.8 | -15.9 % | 3.8 % | **mieux** |
| forest | submit p95 | 4.65 | 4.45 | -4.3 % | 5.4 % | = |
| forest | sim p95 | 0.20 | 0.25 | 25.0 % | 0.0 % | **pire** |
| forest | upload KB/s | 1112 | 477 | -57.2 % | 2.5 % | **mieux** |
| forest | alloc MB/s | 3.77 | 2.71 | -28.3 % | 18.1 % | = |
| forest | heap end MB | 63.7 | 54.7 | -14.1 % | 20.8 % | = |
| forest | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | calls | 125 | 125 | 0.0 % | 0.0 % | = |
| forest | tris k | 127 | 129 | 1.5 % | 0.1 % | = |
| village | p50 ms | 292 | 300 | 2.9 % | 2.8 % | = |
| village | p95 ms | 358 | 367 | 2.3 % | 2.3 % | = |
| village | p99 ms | 392 | 400 | 2.1 % | 2.1 % | = |
| village | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| village | update p50 | 6.65 | 5.95 | -10.5 % | 3.8 % | **mieux** |
| village | update p95 | 16.8 | 16.8 | -0.3 % | 0.6 % | = |
| village | update p99 | 23.6 | 24.0 | 2.1 % | 2.3 % | = |
| village | submit p95 | 4.60 | 4.25 | -7.6 % | 6.5 % | = |
| village | sim p95 | 0.20 | 0.20 | 0.0 % | 0.0 % | = |
| village | upload KB/s | 1186 | 556 | -53.1 % | 0.3 % | **mieux** |
| village | alloc MB/s | 3.91 | 3.35 | -14.3 % | 0.1 % | **mieux** |
| village | heap end MB | 54.6 | 53.4 | -2.2 % | 1.9 % | = |
| village | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| village | calls | 124 | 124 | 0.1 % | 0.0 % | = |
| village | tris k | 88.4 | 90.3 | 2.1 % | 0.1 % | = |
| flight | p50 ms | 233 | 233 | 0.0 % | 0.0 % | = |
| flight | p95 ms | 283 | 300 | 5.9 % | 0.0 % | **pire** |
| flight | p99 ms | 342 | 325 | -4.9 % | 2.4 % | = |
| flight | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | update p50 | 16.3 | 16.9 | 4.0 % | 0.3 % | = |
| flight | update p95 | 30.7 | 30.0 | -2.0 % | 3.4 % | = |
| flight | update p99 | 37.2 | 38.5 | 3.5 % | 4.2 % | = |
| flight | submit p95 | 4.75 | 5.20 | 9.5 % | 5.3 % | = |
| flight | sim p95 | 0.20 | 0.25 | 25.0 % | 0.0 % | **pire** |
| flight | upload KB/s | 1993 | 1315 | -34.0 % | 0.1 % | **mieux** |
| flight | alloc MB/s | 18.3 | 13.7 | -25.1 % | 0.6 % | **mieux** |
| flight | heap end MB | 68.7 | 57.6 | -16.2 % | 4.4 % | **mieux** |
| flight | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | calls | 155 | 155 | 0.1 % | 0.0 % | = |
| flight | tris k | 85.0 | 85.7 | 0.8 % | 0.1 % | = |

Synthèse : 8 métrique(s) meilleure(s), 3 pire(s) au-delà du seuil max(2×bruit, 5 %).
