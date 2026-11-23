# OPT-0 — Baseline de performance (23 novembre 2026)

**Statut : IMPLEMENTED, TESTED, BENCHMARKED-SWIFTSHADER. NOT BENCHMARKED-4GB/8GB** (aucun GPU physique dans cet environnement). Aucune modification du rendu : instrumentation et scènes uniquement (doc 82 §5 « OPT-0 : métriques et fixtures seuls »). Données brutes : [`opt-0-baseline/results.json`](opt-0-baseline/results.json), captures [`opt-0-baseline/captures/`](opt-0-baseline/captures/), bruit d'image A/A [`aa-images.json`](opt-0-baseline/aa-images.json), profils CPU [`profile-summary.txt`](opt-0-baseline/profile-summary.txt). Plan : [PLAN-OPTIMISATION.md](PLAN-OPTIMISATION.md).

## 1. Ce qui a été ajouté

| Élément | Rôle |
| --- | --- |
| `src/render/perf-sampler.ts` | Série GPU séparée (requêtes `EXT_disjoint_timer_query_webgl2` résolues en différé), moyenne/max, images >50 et >100 ms ; `createUploadCounter` enveloppe les appels d'upload WebGL2 (`bufferData/SubData`, `texImage/texSubImage 2D/3D`) : octets de buffers exacts, textures estimées par dimensions |
| `src/render/bench-route.ts` | Parcours **indexés sur le tick de simulation** (`?benchRoute=<nom>`, `?metrics=1` seulement) : la pose est une fonction pure du tick, identique entre exécutions quel que soit le FPS. Courbe Catmull-Rom à abscisse curviligne, vol à dégagement lissé au-dessus du relief |
| `src/main.ts` | Câblage sous `?metrics=1` : compteur d'uploads, `timings.gpuMs`, `timings.metricsMs` (coût du bloc de métriques), `bench` ; crochets `littleWorldDebug.benchStart/benchStop/benchSeek`. Sans `?metrics`, rien ne change |
| `tools/perf/opt-suite.mjs` | `npm run benchmark:opt` (= `benchmark-route.mjs --suite=opt`) : scènes, stabilisation des files, échantillons par image, compteurs de travail, CDP, RSS du navigateur, captures à ticks fixes, A→B→A ; `PROFILE=1` ajoute un profil CPU |
| `tools/perf/report.mjs` | Tableau Markdown d'une exécution (avec bruit A/A) ou comparaison A/B avec verdict de gate |
| `tools/perf/compare-captures.mjs` | Écart d'image par capture (part de pixels > 16/255, écart absolu moyen) |
| `tests/perf-opt0.test.mjs` | Déterminisme des parcours, vitesse nominale, dégagement en vol, aller-retour, stations ; échantillonneur GPU ; compteur d'uploads |

Le mode historique de `benchmark-route.mjs` (HZ-0, utilisé par `benchmark-sky`) est inchangé.

## 2. Conditions

Révision `15e59fb` + instrumentation, build de production (`vite preview`), Chromium 153 headless, **ANGLE/SwiftShader (Vulkan, rendu logiciel)**, timer GPU indisponible, 1280×720 DPR 1, qualité `medium`, `renderTier=0` (adaptation figée), île du volcan 4 × 3 km, stockage vierge par scène, 1 800 ticks (60 s simulées) par scène, **2 répétitions** (bruit A/A). Machine : 4 vCPU Xeon 2,1 GHz, 15,7 Go.

| Scène | Parcours (`src/render/bench-route.ts`) |
| --- | --- |
| `forest` | Forêt dense de l'ouest (−1800…−1100, −400…−100), course 6 m/s, boucle 913 m (100 % boisée, sans eau — validé hors navigateur) |
| `village` | Ville au château (−140, 650), course 6 m/s, boucle 432 m |
| `flight` | Plané **33,3 m/s = 120 km/h**, boucle 6,1 km forêt → ville → prairies → flanc du volcan, virages et épingle, 60 m au-dessus du relief lissé |
| `boat` | Bateau 8 m/s le long de la côte sud, aller-retour 1,9 km, fond ≥ 2,4 m |
| `zones` | Arrivée dans des zones froides : 4 téléportations (forêt, ville, volcan, côte sud), 8 s chacune |
| `travel` | Île du volcan ↔ val forestier ×10 (21 chargements de page, comme le ferry) |

## 3. Résultats

Valeurs = moyenne des 2 répétitions ; `±` = demi-écart relatif entre répétitions.

| Scène | p50 ms | p95 ms | p99 ms | update p50 | update p95 | update p99 | submit p95 | sim p95 | upload Ko/s | alloc Mo/s | heap fin Mo | appels | tris k |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| forest | 358 ±2% | 417 ±0% | 442 ±2% | 6,35 ±1% | 16,1 ±2% | 22,1 ±3% | 5,00 ±6% | 0,20 | 1038 ±2% | 2,9 ±4% | 49,0 ±4% | 125 | 126 |
| village | 317 ±0% | 392 ±2% | 408 ±2% | 7,30 ±3% | 18,4 ±2% | 26,0 ±3% | 4,40 ±2% | 0,25 | 1112 ±1% | 5,1 ±29% | 51,2 ±1% | 124 | 88,5 |
| flight | 233 ±0% | 300 ±0% | 333 ±0% | **17,6** ±2% | **33,3** ±1% | **46,1** ±5% | 5,15 ±1% | 0,20 | **1649** ±2% | **14,3** ±29% | 73,2 ±14% | 155 | 83,7 |
| boat | 175 ±5% | 208 ±4% | 225 ±4% | 3,05 ±2% | 7,10 ±3% | 10,3 ±16% | 3,70 ±5% | 0,25 | 403 ±4% | 3,6 ±3% | 46,1 ±2% | 98 | 62,5 |
| zones | 242 ±3% | 483 ±3% | 525 ±2% | 8,30 ±2% | 23,0 ±3% | 26,4 ±3% | 5,85 ±11% | 0,30 | 1196 ±2% | 8,1 ±1% | 75,8 ±2% | 138 | 92,1 |

- **GPU : non mesuré** (`gpuMs = null`, extension absente sous SwiftShader). `submit` = durée JS de `renderer.render()`, pas un temps GPU.
- **Intervalles** : toutes les images dépassent 100 ms (2,8–5,7 FPS). Le profil CPU montre que 90–97 % du temps du thread principal est **natif** (encodage GL, attente du processus GPU qui rastérise en logiciel) : sous SwiftShader, p50/p95/p99 d'intervalle mesurent surtout la charge géométrique/fragments, pas le JS. Les métriques **CPU (`update`, `submit`, uploads, allocations)** sont les signaux fiables ici ; les seuils 30/20 FPS du doc 11 ne sont **pas** évaluables sans GPU.
- Le monde ralentit quand une image dépasse 250 ms (rattrapage borné, comportement voulu) : 60 s simulées ont pris 63–87 s (`simulatedSpeedRatio` 0,69–1,0). Les parcours restant indexés sur le tick, les trajectoires sont identiques.
- Coût du bloc de métriques : p95 0,3–0,5 ms/image (constant entre A et B).

### Compteurs de travail pendant le parcours (répétition 0, identiques à ±2 % en répétition 1)

| Scène | programmes compilés | falaises construites | herbe uploadée | tuiles terrain construites | objets testés (culling) | file habillage max |
| --- | --- | --- | --- | --- | --- | --- |
| forest | **0** | 0 | 54,9 Mo | 100 | 8 | 27 |
| village | **0** | 0 | 49,4 Mo | 108 | 12 | 27 |
| flight | **0** | 0 | 48,7 Mo | 399 | 20 | **167** |
| boat | **0** | 0 | 0 | 97 | 3 | 15 |
| zones | **0** | 0 | 24,0 Mo | 108 | 32 | **680** |

### Profil CPU (serveur de dev, 900 ticks ; temps JS inclusifs du thread principal)

| Scène | JS total | `world.update` | écologie (`ecology.update` → `build`) | herbe (`grass.update` → `generate`) | habillage (`dressing.update`) | occlusion relief | `renderer.render` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| flight | 2,8 s / 33 s | 2,16 s | **0,96 s** (0,94 s de construction de secteurs) | **0,51 s** (0,49 s de génération) | 0,33 s | 0,19 s | 0,48 s |
| forest | 1,3 s / 42 s | 0,77 s | 0,17 s | 0,17 s | 0,19 s | 0,14 s | — |
| village | 1,5 s / 38 s | 0,96 s | 0,18 s | **0,32 s** | 0,22 s | — | — |

Sous l'écologie et l'herbe, le temps part dans la **classification géographique synchrone** (`generatedSample`, `classifyPoint`, `terrainHeight` → `carveWaterBeds`, `pathDistance`, `archipelago.height`) sur le thread principal.

### Images (bruit A/A)

Écart entre les deux répétitions aux mêmes ticks, après stabilisation : 0,06–1,7 % de pixels > 16/255 et écart moyen 0,12–1,8 pour toutes les captures, sauf `zones-t740` (volcan) : 5,3 % / 2,8 (pluie, fumée et eau animées). Ce sont les **seuils de bruit** des comparaisons A/B futures, capture par capture.

### Traversées A→B→A ×10

Île du volcan prête (page → files vidées) en **96,8 s p50** (max 107 s), val forestier 48,5 s. Programmes 124–126 et géométries 115–117 identiques à chaque arrivée (pas d'accumulation). Heap JS à l'arrivée 31–83 Mo selon le moment du GC (pas de tendance). RSS de l'arbre de processus du navigateur 1 086–1 250 Mo, premier → dernier 1 206 → 1 227 Mo, pente 6,4 Mo/cycle **dans le bruit** (±80 Mo d'un saut à l'autre) : aucune croissance monotone démontrée sur 10 cycles.

## 4. Lecture pour la suite

1. **Préchauffage des shaders (étape 8)** : 0 programme compilé pendant tous les parcours et les arrivées de zone ⇒ déjà effectif (doc 106 HITCH-4). Pas de gain mesurable à attendre sur ces scènes.
2. **Falaises (étape 3)** : 0 construction sur les cinq parcours (aucune grande falaise près des trajets) ⇒ le gain d'un index spatial n'est pas mesurable sur ces scènes ; un parcours « falaises » devra être ajouté avant de coder.
3. **Objets statiques (étape 4)** : 3–32 objets testés par image ⇒ coût de la boucle faible ; à confirmer par micro-mesure avant de coder.
4. **Uploads** : l'herbe représente ~55 Mo par minute de forêt (≈ 60 % des octets envoyés), réécrite **en entier** à chaque reconstruction (`addUpdateRange(0, n)`) ; l'habillage fait de même par famille. Cible prioritaire des étapes 2 et 6.
5. **Vol rapide** : `update` p95 33 ms (×2 du sol), allocations 14 Mo/s, file d'habillage jusqu'à 167 cellules ; le coût est dominé par l'**écologie et l'herbe générées sur le thread principal**, pas par le rendu. Cible prioritaire des étapes 5 et 7.

## 5. Reproduire

```bash
npm ci
npm run build
npx vite preview --port 4173 --strictPort
```

```bash
CHROMIUM_PATH=/opt/pw-browsers/chromium REPEAT=2 npm run benchmark:opt -- http://127.0.0.1:4173/little-world/ ../little-world-artifacts/opt
```

```bash
node tools/perf/report.mjs ../little-world-artifacts/opt/results.json
```

Sur un PC réel avec GPU : ajouter `GPU=1` (ne force pas SwiftShader ; le timer GPU est alors mesuré s'il est exposé). Variables : `SCENES`, `REPEAT`, `TICKS`, `CYCLES`, `WIDTH`, `HEIGHT`, `QUALITY`, `RENDER_TIER`, `SETTLE_MS`, `EXTRA_QUERY`, `PROFILE=1`.
