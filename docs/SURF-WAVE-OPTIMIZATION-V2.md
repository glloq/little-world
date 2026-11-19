# SURF-WAVE-OPTIMIZATION-V2 — refonte graphique et optimisation du moteur de vagues

**Branche :** `feat/surf-wave-render-optimization-v2` (depuis `main@1e87184`).
**Statut global :** IN_PROGRESS. Aucune qualification sur GPU intégré réel (voir §6).
Les mesures de ce document sont **CPU Node/V8** ou **Chromium + SwiftShader** (rendu logiciel) :
elles servent de régression et de comparaison entre commits, **jamais** de preuve de FPS sur iGPU.

## 1. Architecture réellement identifiée (audit `main@1e87184`)

| Module | Rôle | Constat |
| --- | --- | --- |
| `src/surf/wave-field.ts` | Champ de hauteur pur, 30 Hz, `sin(p)+0.22·sin(2p)` × enveloppe (profondeur × bord) | `sample()` appelle `height()` 5 fois + `info()` 1 fois : **6 échantillons terrain** et 10 `sin` par échantillon. Gradient par différences centrées (ε = 0,45 m) sur la hauteur complète. |
| `src/surf/surf-controller.ts` | Planche arcade (rame, glisse, saut, chute) | 2 `sample()` par tick (début + position finale). |
| `src/surf/surf-barrel.ts` | Volume analytique du tube (clairance, entrée, sortie, fermeture) | Pur, cohérent avec la lèvre ; 1 terrain par appel de profil. |
| `src/surf/barrel-wash.ts` | Brassage du hamster dans l'écume | Pur, borné, déterministe. |
| `src/render/surf-water-view.ts` | 3 grilles pré-calculées (160/84/44), enveloppe statique par sommet, vagues animées en vertex shader | Sélection par **distance au joueur** sans hystérésis ; espacement plancher 2 m ⇒ le tier 1 n'économise que ~27 % sur une zone de 140 m ; matériau **non éclairé**, aucune normale, aucune mousse lisible ; `discard` des cellules sèches ; `DoubleSide`. Teinte différente de `NearSea` (Lambert éclairé). |
| `src/render/surf-barrel-view.ts` | Lèvre 3D low-poly, 4 fronts × 31 × 11 sommets, un buffer dynamique | Reconstruit **chaque tick** (0,10–0,19 ms CPU p95), **16 Kio uploadés par tick**, 2 400 triangles toujours dessinés même si un seul front est actif, `frustumCulled=false`, 124 échantillons terrain par tick. |
| `src/render/surf-board-view.ts` | Planche orientée sur la normale CPU | Sans sillage. |
| `src/horizon-view.ts` (`NearSea`) | Mer plate proche, trouée par les rectangles de surf | Le raccord dépend des deux couleurs ; aucune transition de teinte. |
| `src/main.ts` | Sélection de la zone sous le joueur, LOD, tubes, métriques | 1 zone simulée (celle du joueur) ; toutes les vues d'eau mises à jour chaque frame. |

Données Studio/compilées : `SurfZone` (`id, bounds, dir, seaLevel, amplitude, wavelength, speed, seed,
shoreFadeDepth?, edgeFade?, barrelStrength?`), validées par `validateSurfZone` ; l'île Surf A/B/C est
générée par `planThreeSurfBeaches` (`tools/generate-surf-island.mjs`).

## 2. Défauts graphiques constatés (captures SwiftShader de référence)

1. Surface qui paraît **plate** : la couleur ne dépend que de la hauteur, sans éclairage ni pente.
2. Crêtes sans écume lisible ; aucune mousse après déferlement ; aucun sillage de planche.
3. Rectangle de zone visible au loin (teinte surf ≠ teinte `NearSea`).
4. Profil identique pour toutes les vagues (même amplitude, même forme).
5. Lèvre de tube : une seule couleur interpolée, extrémités rigides, pas de cycle de vie lisible.

## 3. Coûts mesurés — référence V1

Commande : `npm run benchmark:surf-cpu -- --out docs/perf/<fichier>.json`
(fichier de référence : `docs/perf/surf-cpu-baseline-v1.json`, Xeon 2,1 GHz, Node 22).

| Mesure (V1) | Bande analytique | Île Surf A | Île Surf B (tube) | Île Surf C |
| --- | --- | --- | --- | --- |
| `sample()` µs p50 | 0,67–0,86 | 1,8–3,2 | 1,7–2,3 | 1,7–2,3 |
| Terrain / `sample()` | 6 | 6 | 6 | 6 |
| Tick physique surf p95 (stepSurf+tube) | 0,004 ms | 0,010 ms | 0,006 ms | 0,005 ms |
| Mise à jour lèvre p95 | 0,10 ms | — | 0,14 ms | 0,19 ms |
| Cuisson 3 LOD d'eau (chargement) | 14 ms | 11 ms | 10 ms | 9 ms |
| Triangles tier 0/1/2 | 16 200 / 14 112 / 3 872 | 9 702 / 7 056 / 1 936 | idem | idem |

**Bruit** : deux exécutions identiques diffèrent jusqu'à ±20 % sur les µs ; seules des
différences supérieures sont interprétées.

Navigateur (`docs/perf/surf-browser-baseline-v1-swiftshader.json`, île Surf, plage B, SwiftShader) :
4 draw calls surf, ~16 000 triangles surf visibles, 3 zones visibles simultanément (LOD `[2,0,2]`),
16 Kio d'upload par tick, ~92 échantillons terrain par frame (mode métriques compris).
La résolution de `performance.now()` du navigateur (0,1 ms sans isolation cross-origin) rend
les petites durées navigateur quantifiées : les µs se lisent dans le benchmark Node.

**Connu / inconnu** : le temps GPU **par mesh surf est inconnu** (seul le temps GPU de la frame
complète existe via `EXT_disjoint_timer_query_webgl2`, absent sous SwiftShader).

## 4. Risques de régression

- Toute formule de hauteur/gradient alimente `stepSurf`, `stepSurfBarrel`, `stepBarrelWash`,
  les replays `movement-state` et les courses : changement = changement de gameplay.
- Le shader d'eau doit rester identique au CPU (`tests/surf-render.test.mjs`).
- `NearSea` est troué par les rectangles de zone : retirer de la surface de surf ouvre un trou.
- Anciennes zones sans nouveaux champs : rendu et physique historiques à conserver.

## 5. Suivi des phases

| Phase | État | Critères d'acceptation |
| --- | --- | --- |
| 1 — Instrumentation | DONE | `?surfPerf=1` (désactivé par défaut), canaux CPU séparés, draw calls/sommets/triangles/upload/zones/LOD, benchmark CPU Node + navigateur JSON v2, référence enregistrée |
| 2 — WaveField CPU | TODO | même résultat physique (références V1), moins d'échantillons terrain, gain mesuré |
| 3 — LOD | TODO | hystérésis, distance caméra, culling tube, physique identique entre LOD |
| 4 — Forme des vagues | TODO | profils variés et déterministes, CPU = GPU, anciennes zones inchangées |
| 5 — Tubes | TODO | cycle de vie de la lèvre, gameplay tube préservé |
| 6 — Mousse/sillage | TODO | écume analytique, sillage borné, ≤ +1 draw call |
| 7 — CPU/GPU | TODO | uploads/draws bornés, 0 allocation récurrente évitable |
| 8 — Intégration | TODO | raccords NearSea/rivage, Studio et anciennes cartes |
| 9 — Profils & validation | TODO | Low/Medium/HQ via `PresentationBudget`, captures, PR |

## 6. Qualification matérielle

`NOT_VERIFIED` : aucun GPU intégré réel n'est disponible dans l'environnement de développement.
Procédure : `SURF_NATIVE_GPU=1 npm run benchmark:surf` sur PC cible 4–8 Go (doc 95).

## 7. Instrumentation (phase 1)

- `src/surf/surf-perf.ts` : `SurfPerfRecorder` (anneau borné, aucune allocation en enregistrement),
  canaux `physicsTick, waveSample, waveHeight, ground, barrelSample, waterUpdate, tubeUpdate, foamUpdate`.
  Décorateurs `instrumentSurfField` / `instrumentGround` **posés seulement avec `?surfPerf=1`** ;
  valeurs bit-identiques (test `tests/surf-perf.test.mjs`).
- `src/render/surf-render-stats.ts` : draw calls / triangles visibles par test de frustum.
- `window.littleWorldMetrics.surfPerf` (avec `?metrics=1&surfPerf=1`) : p50/p95/max par frame,
  jauges, `gpu:'not-isolated'`. `physicsTick` couvre tout `simulatePlayer` pendant un tick surf.
- `tools/benchmark-surf-cpu.mjs` (`npm run benchmark:surf-cpu`) : µs par appel, ticks physiques,
  mise à jour de lèvre, cuisson LOD, GC mineurs/100k appels, somme de contrôle déterministe et
  comparaison numérique avec la copie gelée `tests/fixtures/surf/wave-field-v1.ts`.
- `tools/benchmark-surf-browser.mjs` : schéma 2, `SURF_BENCH_OUT`, commit, diagnostics surf ;
  correction du parcours d'embarquement (dépôt de la planche puis montée, UX actuelle).
