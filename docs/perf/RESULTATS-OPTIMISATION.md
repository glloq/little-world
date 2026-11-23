# Résultats de la campagne d'optimisation mesurée

Tenu à jour à chaque étape. Protocole et gate : [PLAN-OPTIMISATION.md](PLAN-OPTIMISATION.md) §2 ; baseline : [OPT-0-BASELINE.md](OPT-0-BASELINE.md). **Toutes les mesures : Chromium 153 headless, ANGLE/SwiftShader (rendu logiciel, pas de timer GPU), 4 vCPU Xeon 2,1 GHz, 15,7 Go, build de production.** Aucun résultat n'est qualifié sur PC 4/8 Go (`NOT BENCHMARKED-4GB/8GB`).

## Tableau récapitulatif

| Étape | Branche / commit | Décision | Gain mesuré | Coût / régression mesurée | Scènes, résolution |
| --- | --- | --- | --- | --- | --- |
| OPT-0 baseline | `claude/wonderful-edison-7sew0s` `37343fe` | livrée (instrumentation) | — | bloc de métriques 0,3–0,5 ms p95/image, uniquement sous `?metrics` | 5 scènes + A→B→A, 1280×720 |
| 1 — OPT-6 diagnostic CPU/GPU | `claude/opt-6-cpu-gpu-diagnostic` | **retenue (gain de qualité)** | Goulot CPU : pixel ratio **1,0 conservé au lieu de 0,65** (×2,4 pixels) à `update`, p95 et p99 égaux | p50 d'intervalle +6 % sous SwiftShader (rastérisation logicielle sur les mêmes CPU) — à requalifier sur GPU réel | bateau 640×360 + charge CPU 250 ms ; forêt 1280×720 auto |

## Étape 1 — OPT-6 : diagnostic CPU/GPU de l'arbitre

**Statut : IMPLEMENTED, TESTED, BENCHMARKED-SWIFTSHADER.** `src/frame-clock.ts`, `src/main.ts`.

- `PresentationBudget` sépare trois leviers (résolution, détail, cadence 30→20) et diagnostique le goulot à chaque palier : **CPU** si le travail du thread principal (mise à jour + soumission + simulation) représente ≥ 60 % de l'intervalle — le navigateur parallélise CPU et GPU, l'intervalle vaut à peu près le plus grand des deux —, ou si un temps GPU mesuré lui est inférieur ; sinon **GPU/remplissage/présentation**. Goulot GPU : résolution d'abord, puis détail, puis 20 FPS (ordre du doc 11). Goulot CPU : détail puis 20 FPS, **jamais la résolution**. Retour dans l'ordre inverse (dernier levier d'abord) ; hystérésis 3 s / 12 s et recul ×2 inchangés ; un seul arbitre ; simulation intacte.
- `budget.level` garde son sens de niveau de détail pour tous les consommateurs existants ; `budget.resolutionLevel` pilote le pixel ratio. `?renderTier=N` fige les deux.
- Flags : `?opt6=0` (ancien couplage, A/B), `?cpuLoad=<ms>` (charge CPU synthétique, `?metrics` seulement), `?gpuTimer=1` (timer GPU hors `?metrics` ; désactivé par défaut faute de qualification des pilotes). `littleWorldMetrics.budget` expose leviers, goulot et raison.
- Tests : `tests/frame-clock.test.mjs` (+6 cas : CPU, GPU, temps GPU mesuré, ordre de retour, palier figé, mode historique) ; `npm test` 1316/1316, typecheck, build.

**Mesures** (A = même build avec `?opt6=0`, B = nouveau ; `RENDER_TIER=auto`) — détail : [`opt-6/ab-cpu.md`](opt-6/ab-cpu.md), [`opt-6/ab-forest.md`](opt-6/ab-forest.md).

| Cas | A (historique) | B (OPT-6) |
| --- | --- | --- |
| Goulot CPU (bateau 640×360, +250 ms/image, 2 répétitions) | pixel ratio **0,65**, détail 2, 20 FPS ; intervalle p50 267 ms, p95 292 ms ; update p95 206 ms | pixel ratio **1,0**, détail 2, 20 FPS ; intervalle p50 283 ms (+6 %), p95 300 ms (=, bruit) ; update p95 207 ms (=) |
| Goulot GPU (forêt 1280×720, SwiftShader seul) | 0,65 / 2 / 20 FPS | 0,65 / 2 / 20 FPS (la résolution baisse toujours) |

Images : à pixel ratio différent, l'écart A/B (1,4–1,8 % de pixels > 16/255) mesure la perte de définition que A s'imposait ; même scène et même contenu.

**Limites** : sous SwiftShader, toute scène est déjà limitée « GPU » (rastérisation logicielle, 3–6 FPS), si bien que l'ordre des paliers n'apparaît qu'en transitoire pendant le chargement ; il est vérifié par les tests unitaires. Le +6 % de p50 dans le cas CPU vient de la rastérisation logicielle à pleine définition qui partage les CPU ; sur un vrai GPU, le cas limité CPU laisse le GPU inactif et la résolution ne devrait rien coûter — **non démontré ici**, à mesurer avec `GPU=1`.
