**A** : Build A: opt-6 8bb323e ; outils Révision `c1e612aa` (claude/opt-1-dressing-partial-upload), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Build B: opt-1 c1e612a ; outils Révision `c1e612aa` (claude/opt-1-dressing-partial-upload), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| forest | p50 ms | 350 | 358 | 2.4 % | 0.0 % | = |
| forest | p95 ms | 417 | 433 | 4.0 % | 0.0 % | = |
| forest | p99 ms | 450 | 483 | 7.4 % | 0.0 % | **pire** |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 6.15 | 6.70 | 8.9 % | 0.8 % | **pire** |
| forest | update p95 | 14.0 | 15.6 | 11.8 % | 0.4 % | **pire** |
| forest | update p99 | 19.3 | 25.3 | 31.4 % | 9.1 % | **pire** |
| forest | submit p95 | 4.70 | 5.70 | 21.3 % | 4.3 % | **pire** |
| forest | sim p95 | 0.25 | 0.30 | 20.0 % | 20.0 % | = |
| forest | upload KB/s | 1053 | 992 | -5.8 % | 0.1 % | **mieux** |
| forest | alloc MB/s | 3.79 | 2.50 | -33.9 % | 24.0 % | = |
| forest | heap end MB | 62.9 | 52.1 | -17.1 % | 16.3 % | = |
| forest | long tasks | 100 | 100 | 0.2 % | 0.0 % | = |
| forest | calls | 125 | 125 | -0.0 % | 0.1 % | = |
| forest | tris k | 126 | 126 | -0.1 % | 0.0 % | = |
| village | p50 ms | 300 | 308 | 2.8 % | 0.0 % | = |
| village | p95 ms | 392 | 367 | -6.4 % | 2.1 % | **mieux** |
| village | p99 ms | 425 | 400 | -5.9 % | 2.0 % | **mieux** |
| village | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| village | update p50 | 7.25 | 7.00 | -3.4 % | 2.1 % | = |
| village | update p95 | 20.6 | 17.7 | -14.1 % | 0.5 % | **mieux** |
| village | update p99 | 28.3 | 26.6 | -6.0 % | 9.2 % | = |
| village | submit p95 | 4.50 | 6.00 | 33.3 % | 8.9 % | **pire** |
| village | sim p95 | 0.30 | 0.20 | -33.3 % | 0.0 % | **mieux** |
| village | upload KB/s | 1101 | 1027 | -6.7 % | 0.3 % | **mieux** |
| village | alloc MB/s | 3.71 | 4.04 | 8.7 % | 2.8 % | **pire** |
| village | heap end MB | 52.9 | 51.5 | -2.7 % | 1.6 % | = |
| village | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| village | calls | 124 | 124 | 0.0 % | 0.0 % | = |
| village | tris k | 88.4 | 88.4 | -0.1 % | 0.0 % | = |
| flight | p50 ms | 250 | 250 | 0.0 % | 0.0 % | = |
| flight | p95 ms | 308 | 325 | 5.4 % | 2.7 % | = |
| flight | p99 ms | 342 | 367 | 7.3 % | 2.4 % | **pire** |
| flight | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | update p50 | 18.7 | 18.9 | 0.8 % | 1.9 % | = |
| flight | update p95 | 35.4 | 37.2 | 5.4 % | 0.4 % | **pire** |
| flight | update p99 | 45.7 | 48.0 | 5.0 % | 6.8 % | = |
| flight | submit p95 | 5.05 | 6.85 | 35.6 % | 1.0 % | **pire** |
| flight | sim p95 | 0.20 | 0.30 | 50.0 % | 0.0 % | **pire** |
| flight | upload KB/s | 1587 | 1410 | -11.2 % | 2.4 % | **mieux** |
| flight | alloc MB/s | 14.4 | 9.44 | -34.4 % | 27.9 % | = |
| flight | heap end MB | 73.0 | 56.5 | -22.6 % | 25.7 % | = |
| flight | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | calls | 155 | 155 | -0.2 % | 0.0 % | = |
| flight | tris k | 83.4 | 83.0 | -0.5 % | 0.1 % | = |

Synthèse : 7 métrique(s) meilleure(s), 11 pire(s) au-delà du seuil max(2×bruit, 5 %).
