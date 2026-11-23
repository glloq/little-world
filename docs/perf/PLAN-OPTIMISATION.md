# Plan d'optimisation mesurée — OPT-0 → étapes 1 à 12

**Statut : PLANNED** (23 novembre 2026). Base de code : `main@15e59fb` + instrumentation OPT-0 (branche `claude/wonderful-edison-7sew0s`). Références : [11 — LOW-RESOURCE](../11-LOW-RESOURCE-POLICY.md), [81 — audit](../81-RENDER-PERFORMANCE-CODE-AUDIT.md), [82 — roadmap OPT](../82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md), [106 — fluidité 30 FPS](../106-SMOOTH-30FPS-STREAMING-AUDIT.md). Baseline : [OPT-0-BASELINE.md](OPT-0-BASELINE.md).

Règles appliquées à chaque étape : qualité constante, simulation 30 Hz inchangée, présentation 30/20, aucun objet ni gameplay perdu, WebGL2 obligatoire, un seul arbitre (`PresentationBudget`). Une étape sans gain mesuré au-delà du bruit, ou avec régression visuelle/gameplay/mémoire, est **revertée** et notée « testée, non retenue ».

## 1. Constat préalable : une partie de la liste est déjà livrée sur `main`

Le lot du doc 106 (fusionné) a déjà réalisé plusieurs points demandés. Ils ne seront **pas** refaits ; l'étape correspondante devient « mesurer le résiduel, ne coder que ce qui reste ».

| Étape demandée | Déjà sur `main` (doc 106 §6) | Reste réellement à faire |
| --- | --- | --- |
| 2. OPT-1 habillage | Rebuild en job reprenable + commit atomique (HITCH-1), bornes scalaires, liste réutilisée (HITCH-2) | Upload **partiel** : aujourd'hui chaque commit marque `addUpdateRange(0,n)` sur 8 familles + 2 `BatchedMesh` ; tri complet des cellules à chaque rebuild |
| 3. OPT-2 falaises/structures | LRU de géométries (48) + hystérésis LOD (HITCH-6), réserve LRU des structures (HITCH-9) | Index spatial (aujourd'hui `map/filter/sort` de tous les segments tous les 12 m) ; clé de cache sans révision terrain explicite |
| 4. OPT-3 objets statiques | — (mesuré « ~21 objets au village, pas un point chaud » dans 106) | Index spatial + réévaluation sur déplacement/rotation significatifs, **si** la mesure montre un coût |
| 6. Herbe | Fondu/rejet par distance **déjà** dans le vertex shader (`uRadius`, tuft d'échelle 0 → triangles dégénérés) | Test « secteurs cullables » vs `InstancedMesh` global `frustumCulled=false` ; génération par cellule allouant des tableaux JS (`mats.push`) |
| 7. OPT-4 streaming | Anticipation vitesse (SPEED-1/2/3), résultats worker conservés | Premier build de tuile autorisé même au-delà du budget (`built===0`), SPEED-5 (rotation rapide), intégration GPU étalée |
| 8. Préchauffage shaders | `render/shader-warmup.ts` : `compileAsync` au chargement et à l'arrivée des espèces (HITCH-4) | Vérifier par la mesure (`programsCompiledDuringRun`) qu'aucune compilation n'a lieu en parcours ; sinon couvrir les assets/zones manquants |
| 1. OPT-6 diagnostic CPU/GPU | — (PACE-7 « NOT DONE ») | Tout |
| 5, 9, 10, 11, 12 | — | Tout |

## 2. Protocole commun (gate)

1. **Une branche + une PR par étape**, depuis la branche précédente retenue (ou `main` si fusionnée). Flag de désactivation `?opt<N>=0` tant que la PR n'est pas fusionnée, pour l'A/B dans la même session.
2. **A/B même session, même machine** : `npm run build`, puis `REPEAT=2 npm run benchmark:opt -- <url> <out>` avec le flag OFF (A) et ON (B) ; scènes `forest, village, flight, boat, zones` (+ `travel` si l'étape touche chargement/mémoire). Parcours indexés sur le tick ⇒ trajectoires identiques.
3. **Bruit** : l'écart A/A (deux répétitions de la baseline) fixe le seuil. Une métrique « s'améliore » si `|B−A| > max(2 × bruit A/A, 5 %)` dans le bon sens ; elle « régresse » au-delà du même seuil.
4. **Images** : `node tools/perf/compare-captures.mjs A/captures B/captures` ; l'écart B/A doit rester dans l'enveloppe A/A (vent, pluie, eau animés), sinon explication ou revert.
5. **Gameplay** : `npm test`, `npm run typecheck`, `npm run build` + tests navigateur pertinents listés par étape.
6. **Statut doc 82** mis à jour : `IMPLEMENTED` → `TESTED` → `BENCHMARKED-SWIFTSHADER` ; `BENCHMARKED-4GB/8GB` **uniquement** après un passage `GPU=1` sur matériel réel identifié.

### Limite majeure de cet environnement

Le conteneur n'a **pas de GPU** : rendu Chromium/SwiftShader, `EXT_disjoint_timer_query_webgl2` absent (`gpuMs = null`). Conséquences :
- Les étapes à gain **CPU** (1 partiellement, 2, 3, 4, 5, 7, 8) sont mesurables ici (`cpuUpdate`, `cpuRenderSubmit`, uploads, allocations, longues tâches).
- Les étapes à gain **GPU** (6 culling herbe, 9 overdraw, 11 effets, 12 WebGPU, et la décision DPR de l'étape 1) n'ont ici qu'un **proxy** : SwiftShader rastérise sur le CPU, donc l'intervalle de présentation reflète grossièrement triangles/fragments, mais pas un iGPU. Ces étapes resteront `NOT BENCHMARKED` sur GPU tant qu'un passage `GPU=1` n'est pas fait sur un PC réel.


## 3. Ce que la baseline change dans les priorités

Mesures : [OPT-0-BASELINE.md](OPT-0-BASELINE.md) §3–4. Les métriques CPU et d'uploads sont **reproductibles à ±1–5 %** entre deux exécutions : un gain de 10 % est détectable. Les allocations (±29 % en vol/village) sont trop bruitées : l'étape 5 utilisera un profil d'allocations échantillonné plutôt que la pente du heap.

| Constat mesuré | Conséquence |
| --- | --- |
| 0 programme compilé pendant tous les parcours | Étape 8 déjà effective ⇒ vérification seulement |
| 0 falaise construite sur les parcours | Étape 3 : ajouter d'abord un parcours `cliffs`, sinon aucun gain mesurable |
| 3–32 objets testés par image | Étape 4 : micro-mesure avant de coder ; gain probablement négligeable |
| Herbe ≈ 55 Mo/min uploadés en forêt (~60 % des octets) | Étape 6 (upload partiel de l'herbe) est le plus gros levier d'uploads, avant l'habillage |
| Vol : `update` p95 33 ms, dont écologie 0,96 s + herbe 0,49 s sur 2,8 s de JS | Le levier CPU n°1 est la **classification géographique synchrone** (écologie, herbe) — rattachée à l'étape 7 (streaming) et à l'étape 5 |

## 4. Étapes détaillées

Notation : **Cible** = métrique de gate principale (scènes) ; **Tests** = en plus de `npm test`, `typecheck`, `build`.

### Étape 1 — OPT-6 diagnostic CPU/GPU (`frame-clock.ts`, `main.ts`)
- **Changement** : `PresentationBudget.observe(workMs, seconds, gpuMs?)` classe le goulot : *GPU/présentation* si l'intervalle dépasse nettement le travail CPU (ou `gpuMs` connu > CPU), *CPU* si le travail CPU ≈ l'intervalle. Deux niveaux internes : `resolution` (DPR) et `detail` (habillage/petits éléments) ; la résolution ne baisse **que** si goulot GPU ; en goulot CPU, baisse du détail puis 30→20 en dernier recours. Hystérésis 3 s / 12 s et recul ×2 conservés, un seul arbitre ; `level` reste exposé pour compatibilité (doc 22).
- **Mesure** : nouvelle option bench `?cpuLoad=<ms>` (metrics seulement, attente active contrôlée dans `update`) + `RENDER_TIER` non figé. Cas CPU (charge 40 ms) : avant = DPR 0,65 sans gain d'intervalle ; après = DPR 1 conservé, même cadence. Cas GPU (SwiftShader seul, déjà limité par la rastérisation) : la baisse de DPR doit toujours se produire.
- **Cible** : résolution conservée en goulot CPU à intervalle p95 égal (±bruit) ; aucune oscillation sur 120 s. **Tests** : `tests/frame-clock.test.mjs` (nouveaux cas CPU/GPU/mixte), `test:environment`, `test:gameplay`.

### Étape 2 — OPT-1 habillage incrémental (`dressing-view.ts`)
- **Changement** : écriture « comparer puis écrire » des 16+3+1 flottants par instance avec plages sales coalescées (≤ 8 par famille) → `addUpdateRange` seulement sur ce qui change ; tri des cellules par insertion sur un ordre quasi trié réutilisé (pas de `sort` complet) ; mêmes règles « plus proche d'abord » et mêmes capacités, donc mêmes instances.
- **Cible** : upload Ko/s et `update` p95 de `forest`, `village`, `flight` ; images dans le bruit A/A. **Tests** : `test:dressing-stability`, `test:gameplay` (cueillette/abattage), `tests/dressing*.test.mjs`.

### Étape 3 — OPT-2 falaises et structures naturelles (`render/cliff-view.ts`, `structures/natural-view.ts`)
- **Préalable** : parcours `cliffs` (falaise est ~1700, −300 et volcan) validé hors navigateur, ajouté à la baseline (A = code actuel).
- **Changement** : grille spatiale des segments/placements (requête des cellules voisines au lieu de `map/filter/sort` global) ; clé de cache `(segment, lod, révision terrain)` ; ancien LOD gardé jusqu'à la géométrie suivante prête.
- **Cible** : `update` p95/p99 de `cliffs`, `cliffsBuilt`. **Tests** : `tests/cliff-view.test.mjs`, `tests/studio-natural-view.test.mjs`, `test:island`.

### Étape 4 — OPT-3 objets statiques (`world.ts`, `placed-instances.ts`, `render/asset-culling.ts`)
- **Préalable** : micro-mesure du coût de la boucle `objects.children` (compteur `performance.now()` sous `?metrics`) sur `village`. Si < 0,1 ms p95, l'étape est notée « testée, non retenue : coût mesuré négligeable » **sans** code.
- **Sinon** : grille des objets statiques, réévaluation après 8 m / rotation significative, objets interactifs/dynamiques inchangés. **Tests** : `test:paths`, `test:economy`, `test:lights`.

### Étape 5 — zéro allocation dans la boucle critique
- **Mesure ajoutée** : `ALLOC_PROFILE=1` (CDP `HeapProfiler.startSampling`) → octets alloués par fonction pendant le parcours ; nombre de GC par la trace `v8.gc` si disponible.
- **Changement** : supprimer les allocations par image/par cellule identifiées (tableaux `push` de l'herbe, clés de chaînes, spreads, `Vector3` temporaires) en commençant par le top 10 mesuré.
- **Cible** : octets alloués par seconde (profil) −30 % ou plus en `flight`, GC moins fréquents, `update` p99 non régressif. **Tests** : suite complète des tests unitaires concernés.

### Étape 6 — herbe (`render/grass.ts`)
- Déjà présent : fondu/rejet par distance dans le vertex shader. **Variantes à mesurer** : (a) upload partiel — cellules dans des plages d'instances stables, seule la cellule ajoutée/retirée est écrite (cible : −80 % des 55 Mo/min) ; (b) découpe en secteurs cullables par frustum vs maillage global actuel (draw calls +, sommets traités −) ; garder la meilleure, (a) et (b) jugées séparément.
- **Cible** : upload Ko/s et `update` p95 `forest`/`village` ; intervalle p95 comme proxy de sommets traités pour (b) — **non qualifiable sans GPU réel**. **Tests** : `tests/grass.test.mjs`, `test:dressing-stability`.

### Étape 7 — OPT-4 streaming (`chunks.ts`, `terrain-view.ts`, `ecology.ts`, `render/grass.ts`, `geography/geo-workers.ts`)
- **Changement** : (a) déplacer la classification des secteurs d'écologie et des cellules d'herbe vers le pool de workers existant (même file versionnée, pas de seconde file) — ou à défaut budget temps par image strict ; (b) budget d'intégration GPU : plus de premier build forcé au-delà du budget (`built===0`), intégration étalée ; (c) anneau de rotation rapide (SPEED-5).
- **Cible** : `flight` `update` p95/p99 (base 33/46 ms), file d'habillage max, `zones` p99 ; **0 trou** (métrique `holeFraction` du mode historique et captures). **Tests** : `test:island`, `test:dressing-stability`, `tests/ecology.test.mjs`, `tests/view-planning.test.mjs`.

### Étape 8 — préchauffage des shaders
- Déjà livré ; mesuré : 0 compilation pendant les parcours. **Action** : ajouter à la suite une assertion `programsCompiledDuringRun === 0` et une scène plongée/mine (variantes brouillard sous-marin et lampe). PR seulement si une compilation résiduelle apparaît.

### Étape 9 — overdraw
- Matériaux transparents recensés : mer proche (`NearSeaMaterial`), eau intérieure (`water-look.ts`), halos de lumière, pluie, disque d'ombre du hamster, effets (gaz, sillage, pêche, vitesse). La plupart sont réellement translucides : `alphaTest`/`alphaToCoverage` changerait l'image. Candidats sans changement visible attendu : objets à opacité 1 marqués `transparent`, faces arrière inutiles (`DoubleSide`).
- **Cible** : intervalle p95 `boat` (eau) comme proxy logiciel + images dans le bruit ; **qualification GPU impossible ici**.

### Étape 10 — OffscreenCanvas (`?offscreen=1`) — **validation demandée avant de commencer**
Prototype Worker derrière flag ; refactor lourd (entrées, UI, audio, `window.littleWorldMetrics`, GLB loaders dans le worker).

### Étape 11 — marge graphique (OPT-8), après 1–10
AO cuite en vertex colors, ombres de contact (disque), perspective atmosphérique légère dans le shader de terrain, résolution interne réduite + FXAA/sharpen : chacun derrière un flag, coût mesuré (CPU ici, GPU à qualifier), captures avant/après.

### Étape 12 — prototype WebGPURenderer — **validation demandée avant de commencer**
`three/webgpu` + repli WebGL2, flag uniquement, comparaison ; jamais par défaut.

## 5. Ce qui ne peut pas être prouvé ici

Sans GPU physique : temps GPU, effet du DPR, overdraw, coût réel de l'herbe en sommets, OffscreenCanvas (gain surtout lié au thread GPU/compositeur) et WebGPU (indisponible sous SwiftShader headless). Pour ces étapes, je livrerai le code derrière flag, les mesures CPU/proxy et la commande `GPU=1` à lancer sur un PC 4/8 Go ; le statut restera `NOT BENCHMARKED-4GB/8GB` jusqu'à ces mesures.
