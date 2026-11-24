**A** : Révision `d245973d` (claude/opt-6-cpu-gpu-diagnostic), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 640×360 DPR 1, qualité medium, renderTier null, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

**B** : Révision `d245973d` (claude/opt-1-dressing-partial-upload), 2026-11-23, 153.0.8010.12, ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver), 640×360 DPR 1, qualité medium, renderTier null, 1800 ticks/scène, 2 répétition(s), 4 CPU Intel(R) Xeon(R) Processor @ 2.10GHz, 15.7 Go.

| Scène | Métrique | A | B | Δ | bruit A/A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| boat | p50 ms | 267 | 283 | 6.2 % | 0.0 % | **pire** |
| boat | p95 ms | 292 | 300 | 2.8 % | 2.9 % | = |
| boat | p99 ms | 308 | 308 | -0.0 % | 8.1 % | = |
| boat | >100 ms % | 100 | 100 | 0.0 % | 0.0 % | = |
| boat | update p50 | 203 | 203 | 0.1 % | 0.0 % | = |
| boat | update p95 | 206 | 207 | 0.3 % | 0.0 % | = |
| boat | update p99 | 210 | 209 | -0.1 % | 1.0 % | = |
| boat | submit p95 | 3.00 | 3.35 | 11.7 % | 3.3 % | **pire** |
| boat | sim p95 | 0.25 | 0.30 | 20.0 % | 20.0 % | = |
| boat | upload KB/s | 226 | 215 | -5.1 % | 1.5 % | **mieux** |
| boat | alloc MB/s | 3.32 | 1.97 | -40.7 % | 2.1 % | **mieux** |
| boat | heap end MB | 62.5 | 41.8 | -33.0 % | 2.9 % | **mieux** |
| boat | long tasks | 100 | 100 | 0.2 % | 0.0 % | = |
| boat | calls | 88.6 | 88.7 | 0.1 % | 0.0 % | = |
| boat | tris k | 44.6 | 45.4 | 1.6 % | 0.0 % | = |

Synthèse : 3 métrique(s) meilleure(s), 2 pire(s) au-delà du seuil max(2×bruit, 5 %).
