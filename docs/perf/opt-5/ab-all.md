**A** : Build A: 4172c48 (étape 1) ; outils Révision `5ef4a4ca` (claude/opt-5-zero-alloc), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Build B: opt-5 ; outils Révision `7784b503` (claude/opt-4-streaming-workers), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier 0, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| forest | p50 ms | 367 | 350 | -4.5 % | 0.0 % | = |
| forest | p95 ms | 433 | 417 | -3.8 % | 0.0 % | = |
| forest | p99 ms | 475 | 450 | -5.3 % | 1.8 % | **mieux** |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 7.15 | 5.75 | -19.6 % | 0.7 % | **mieux** |
| forest | update p95 | 17.6 | 15.3 | -12.5 % | 1.4 % | **mieux** |
| forest | update p99 | 23.5 | 22.1 | -5.7 % | 1.3 % | **mieux** |
| forest | submit p95 | 5.25 | 4.65 | -11.4 % | 4.8 % | **mieux** |
| forest | sim p95 | 0.30 | 0.30 | -0.0 % | 0.0 % | = |
| forest | upload KB/s | 1009 | 1086 | 7.6 % | 0.8 % | **pire** |
| forest | alloc MB/s | 3.05 | 2.56 | -16.1 % | 14.4 % | = |
| forest | heap end MB | 51.4 | 50.7 | -1.4 % | 0.4 % | = |
| forest | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | calls | 125 | 125 | -0.1 % | 0.0 % | = |
| forest | tris k | 126 | 127 | 0.7 % | 0.0 % | = |
| village | p50 ms | 317 | 300 | -5.2 % | 0.0 % | **mieux** |
| village | p95 ms | 392 | 392 | -0.0 % | 2.1 % | = |
| village | p99 ms | 433 | 417 | -3.9 % | 7.7 % | = |
| village | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| village | update p50 | 8.05 | 6.85 | -14.9 % | 3.1 % | **mieux** |
| village | update p95 | 20.5 | 19.8 | -3.9 % | 2.7 % | = |
| village | update p99 | 27.7 | 25.0 | -9.6 % | 1.6 % | **mieux** |
| village | submit p95 | 5.20 | 4.75 | -8.7 % | 0.0 % | **mieux** |
| village | sim p95 | 0.30 | 0.30 | 0.0 % | 0.0 % | = |
| village | upload KB/s | 1099 | 1156 | 5.1 % | 0.3 % | **pire** |
| village | alloc MB/s | 4.15 | 3.01 | -27.4 % | 0.4 % | **mieux** |
| village | heap end MB | 53.8 | 52.6 | -2.4 % | 4.2 % | = |
| village | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| village | calls | 124 | 124 | -0.0 % | 0.0 % | = |
| village | tris k | 88.4 | 88.5 | 0.1 % | 0.0 % | = |
| flight | p50 ms | 233 | 250 | 7.1 % | 0.0 % | **pire** |
| flight | p95 ms | 317 | 325 | 2.7 % | 0.0 % | = |
| flight | p99 ms | 367 | 367 | 0.0 % | 4.5 % | = |
| flight | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | update p50 | 19.4 | 21.3 | 9.8 % | 0.3 % | **pire** |
| flight | update p95 | 39.8 | 42.8 | 7.5 % | 2.1 % | **pire** |
| flight | update p99 | 57.3 | 51.0 | -10.8 % | 1.5 % | **mieux** |
| flight | submit p95 | 5.15 | 5.55 | 7.8 % | 4.9 % | = |
| flight | sim p95 | 0.30 | 0.40 | 33.3 % | 0.0 % | **pire** |
| flight | upload KB/s | 1573 | 1708 | 8.6 % | 1.0 % | **pire** |
| flight | alloc MB/s | 13.9 | 7.78 | -44.2 % | 32.2 % | = |
| flight | heap end MB | 76.8 | 64.3 | -16.4 % | 8.3 % | = |
| flight | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| flight | calls | 155 | 156 | 0.4 % | 0.0 % | = |
| flight | tris k | 83.1 | 84.4 | 1.6 % | 0.0 % | = |

Synthèse : 11 métrique(s) meilleure(s), 7 pire(s) au-delà du seuil max(2×bruit, 5 %).
