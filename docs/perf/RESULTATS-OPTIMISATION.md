# Résultats de la campagne d'optimisation mesurée

Tenu à jour à chaque étape. Protocole et gate : [PLAN-OPTIMISATION.md](PLAN-OPTIMISATION.md) §2 ; baseline : [OPT-0-BASELINE.md](OPT-0-BASELINE.md). **Toutes les mesures : Chromium 153 headless, ANGLE/SwiftShader (rendu logiciel, pas de timer GPU), 4 vCPU Xeon 2,1 GHz, 15,7 Go, build de production.** Aucun résultat n'est qualifié sur PC 4/8 Go (`NOT BENCHMARKED-4GB/8GB`).

## Tableau récapitulatif

| Étape | Branche / commit | Décision | Gain mesuré | Coût / régression mesurée | Scènes, résolution |
| --- | --- | --- | --- | --- | --- |
| OPT-0 baseline | `claude/wonderful-edison-7sew0s` `37343fe` | livrée (instrumentation) | — | bloc de métriques 0,3–0,5 ms p95/image, uniquement sous `?metrics` | 5 scènes + A→B→A, 1280×720 |
| 1 — OPT-6 diagnostic CPU/GPU | `claude/opt-6-cpu-gpu-diagnostic` | **retenue (gain de qualité)** | Goulot CPU : pixel ratio **1,0 conservé au lieu de 0,65** (×2,4 pixels) à `update`, p95 et p99 égaux | p50 d'intervalle +6 % sous SwiftShader (rastérisation logicielle sur les mêmes CPU) — à requalifier sur GPU réel | bateau 640×360 + charge CPU 250 ms ; forêt 1280×720 auto |
| 2 — OPT-1 habillage, upload partiel | `claude/opt-1-dressing-partial-upload` (code `c1e612a`, reverté) | **testée, non retenue** | octets d'habillage −13 à −44 %, envoi GPU total −6 à −11 % | `submit` p95 **+21 à +36 %**, `update` p95 forêt +12 %, p99 forêt +31 %, vol +5 % ; seul le village s'améliore | forêt, village, vol, 1280×720, 2×2 exécutions |
| 3 — OPT-2 falaises / structures naturelles | — | **non applicable (pas de code)** | aucun : 0 falaise `rl-cliff-*` et 0 structure naturelle dans les 5 îles publiées ; 0 falaise construite dans tous les parcours | — | analyse du contenu + compteurs baseline |
| 4 — OPT-3 objets statiques | — | **testée (mesure), non retenue** | boucle des objets + code propre de `world.update` : **0,08 ms/image** (9,4 ms / 121 images au village, profil) ; 3–32 objets testés par image | — | profil CPU village/vol/forêt |

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

## Étape 2 — OPT-1 : habillage, upload partiel — testée, non retenue

**Statut : IMPLEMENTED puis REVERTED ; TESTED ; BENCHMARKED-SWIFTSHADER.** Code mesuré : commit `c1e612a` (branche `claude/opt-1-dressing-partial-upload`), puis retour au `dressing-view.ts` de l'étape 1.

- **Ce qui a été essayé** : comparer chaque instance avant écriture (familles `InstancedMesh` et `BatchedMesh` d'espèces), coalescer les plages modifiées (écart ≤ 32 instances, ≤ 8 plages sinon une seule) et n'envoyer que ces plages (`addUpdateRange`) ; pour les textures de matrices/couleurs des `BatchedMesh`, des plages découpées par ligne (envoi complet pour un premier envoi, un redimensionnement, plus de 50 % modifié ou plus de 8 segments). Un premier essai (écart 8, sans plafond) donnait le même profil.
- **Mesure** (A = build de l'étape 1, B = build `c1e612a`, deux serveurs, même session, 2 répétitions ; [`opt-1/ab.md`](opt-1/ab.md)) :

| Scène | octets d'habillage envoyés | envoi GPU total | `update` p95 | `update` p99 | `submit` p95 | intervalle p99 |
| --- | --- | --- | --- | --- | --- | --- |
| forêt | 21,8 → 19,0 Mo (−13 %) | −6 % | **+12 %** | **+31 %** | **+21 %** | +7 % |
| village | 16,0 → 9,0 Mo (−44 %) | −7 % | −14 % | = | **+33 %** | −6 % |
| vol | 32,1 → 20,7 Mo (−36 %) | −11 % | +5 % | = | **+36 %** | +7 % |

- **Images** : écart A/B 0,04–2,0 % de pixels, dans le bruit A/A ([`opt-1/images.json`](opt-1/images.json)).
- **Pourquoi non retenue** : la règle du gate (p95/p99 ou CPU meilleurs sans régression) n'est pas remplie : l'envoi par plages multiplie les appels GL (`bufferSubData`, `texSubImage2D` par segment de ligne et lectures d'état d'unpack dans le moteur), ce qui coûte plus en soumission que les octets économisés ; la comparaison avant écriture ajoute du CPU dans le job de reconstruction. Sous SwiftShader, un octet de moins vaut moins qu'un appel de moins ; sur iGPU réel, le rapport peut différer — **non démontré**.
- **Conservé** : les compteurs (`dressing.uploadedBytes` est retiré avec le code ; la suite garde `ALLOC_PROFILE=1`, `BUILD_LABEL` et le libellé de build dans les rapports).
- **Piste future** : des emplacements d'instances stables par cellule (comme l'étape 6 pour l'herbe) plutôt qu'une comparaison ; à ne retenter qu'avec mesure sur GPU réel.

## Étape 3 — OPT-2 : falaises et structures naturelles — non applicable

Le contenu publié ne contient **aucune** falaise `rl-cliff-*` (l'île du volcan et les quatre autres îles : 0) ni aucune structure naturelle (`naturalStructure` : 0). `cliff-view.ts` et `natural-view.ts` tournent donc sur des listes vides ; aucun parcours ne peut montrer de gain. Pas de code. À reconsidérer quand le Studio produira de telles formations dans une île publiée, avec un parcours dédié.

## Étape 4 — OPT-3 : objets statiques — non retenue (coût négligeable)

Mesure : temps propre de `world.update` (qui contient la boucle `objects.children`, `assetInFrustum`, `representationFor`) dans les profils OPT-0 : **9,4 ms sur 121 images au village (0,08 ms/image)**, 5,0 ms en vol, 4,7 ms en forêt ; 3 à 32 objets testés par image. Sous le seuil de 0,1 ms/image fixé dans le plan : un index spatial n'apporterait pas de gain mesurable. Pas de code.
