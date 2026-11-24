**A** : Build A: 4172c48 (étape 1) ; outils Révision `5ef4a4ca` (claude/opt-5-zero-alloc), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Build B prime: opt-5 sans habillage ; outils Révision `5ef4a4ca` (claude/opt-5-zero-alloc), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| forest | p50 ms | 367 | 358 | -2.3 % | 0.0 % | = |
| forest | p95 ms | 433 | 433 | -0.0 % | 0.0 % | = |
| forest | p99 ms | 475 | 475 | -0.0 % | 1.8 % | = |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 7.15 | 6.30 | -11.9 % | 0.7 % | **mieux** |
| forest | update p95 | 17.6 | 16.3 | -7.1 % | 1.4 % | **mieux** |
| forest | update p99 | 23.5 | 24.7 | 5.3 % | 1.3 % | **pire** |
| forest | submit p95 | 5.25 | 5.35 | 1.9 % | 4.8 % | = |
| forest | sim p95 | 0.30 | 0.30 | 0.0 % | 0.0 % | = |
| forest | upload KB/s | 1009 | 1042 | 3.4 % | 0.8 % | = |
| forest | alloc MB/s | 3.05 | 2.46 | -19.2 % | 14.4 % | = |
| forest | heap end MB | 51.4 | 49.6 | -3.5 % | 0.4 % | = |
| forest | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | calls | 125 | 125 | -0.1 % | 0.0 % | = |
| forest | tris k | 126 | 126 | 0.5 % | 0.0 % | = |
| village | p50 ms | 317 | 308 | -2.6 % | 0.0 % | = |
| village | p95 ms | 392 | 383 | -2.1 % | 2.1 % | = |
| village | p99 ms | 433 | 408 | -5.8 % | 7.7 % | = |
| village | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| village | update p50 | 8.05 | 7.25 | -9.9 % | 3.1 % | **mieux** |
| village | update p95 | 20.5 | 19.1 | -7.1 % | 2.7 % | **mieux** |
| village | update p99 | 27.7 | 28.0 | 1.3 % | 1.6 % | = |
| village | submit p95 | 5.20 | 4.80 | -7.7 % | 0.0 % | **mieux** |
| village | sim p95 | 0.30 | 0.30 | 0.0 % | 0.0 % | = |
| village | upload KB/s | 1099 | 1139 | 3.6 % | 0.3 % | = |
| village | alloc MB/s | 4.15 | 3.37 | -19.0 % | 0.4 % | **mieux** |
| village | heap end MB | 53.8 | 54.9 | 2.0 % | 4.2 % | = |
| village | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| village | calls | 124 | 124 | 0.1 % | 0.0 % | = |
| village | tris k | 88.4 | 88.5 | 0.1 % | 0.0 % | = |
| flight | p50 ms | 233 | 233 | 0.0 % | 0.0 % | = |
| flight | p95 ms | 317 | 317 | 0.0 % | 0.0 % | = |
| flight | p99 ms | 367 | 342 | -6.8 % | 4.5 % | = |
| flight | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | update p50 | 19.4 | 18.8 | -2.8 % | 0.3 % | = |
| flight | update p95 | 39.8 | 37.1 | -6.5 % | 2.1 % | **mieux** |
| flight | update p99 | 57.3 | 52.0 | -9.1 % | 1.5 % | **mieux** |
| flight | submit p95 | 5.15 | 4.95 | -3.9 % | 4.9 % | = |
| flight | sim p95 | 0.30 | 0.30 | -0.0 % | 0.0 % | = |
| flight | upload KB/s | 1573 | 1744 | 10.9 % | 1.0 % | **pire** |
| flight | alloc MB/s | 13.9 | 16.8 | 20.3 % | 32.2 % | = |
| flight | heap end MB | 76.8 | 73.1 | -4.8 % | 8.3 % | = |
| flight | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | calls | 155 | 155 | 0.1 % | 0.0 % | = |
| flight | tris k | 83.1 | 84.4 | 1.5 % | 0.0 % | = |

Synthèse : 8 métrique(s) meilleure(s), 2 pire(s) au-delà du seuil max(2×bruit, 5 %).
