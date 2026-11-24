**A** : Révision `37343fe6` (claude/opt-6-cpu-gpu-diagnostic), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier null, 1800 ticks/scène, 1 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Révision `37343fe6` (claude/opt-6-cpu-gpu-diagnostic), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 1280×720 DPR 1, qualité medium, renderTier null, 1800 ticks/scène, 1 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| forest | p50 ms | 183 | 183 | 0.0 % | 0.0 % | = |
| forest | p95 ms | 233 | 217 | -7.1 % | 0.0 % | **mieux** |
| forest | p99 ms | 250 | 233 | -6.6 % | 0.0 % | **mieux** |
| forest | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | update p50 | 3.50 | 3.20 | -8.6 % | 0.0 % | **mieux** |
| forest | update p95 | 9.90 | 10.3 | 4.0 % | 0.0 % | = |
| forest | update p99 | 14.9 | 14.1 | -5.4 % | 0.0 % | **mieux** |
| forest | submit p95 | 4.20 | 3.90 | -7.1 % | 0.0 % | **mieux** |
| forest | sim p95 | 0.20 | 0.20 | 0.0 % | 0.0 % | = |
| forest | upload KB/s | 544 | 639 | 17.4 % | 0.0 % | **pire** |
| forest | alloc MB/s | 4.56 | 4.66 | 2.2 % | 0.0 % | = |
| forest | heap end MB | 45.0 | 48.0 | 6.7 % | 0.0 % | **pire** |
| forest | long tasks | 100 | 100 | 0.0 % | 0.0 % | = |
| forest | calls | 99.6 | 100 | 0.5 % | 0.0 % | = |
| forest | tris k | 86.7 | 87.3 | 0.6 % | 0.0 % | = |

Synthèse : 5 métrique(s) meilleure(s), 2 pire(s) au-delà du seuil max(2×bruit, 5 %).
