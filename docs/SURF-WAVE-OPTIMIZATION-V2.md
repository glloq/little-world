# SURF-WAVE-OPTIMIZATION-V2 — refonte graphique et optimisation du moteur de vagues

**Branche :** `feat/surf-wave-render-optimization-v2` (depuis `main@1e87184`).
**Statut global :** IMPLEMENTED + TESTED (Node, Chromium/SwiftShader). **Qualification GPU intégré : NOT_VERIFIED** (voir §6).
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
| 2 — WaveField CPU | DONE | hauteur/vitesse verticale/crête/déferlement/waveId bit-identiques à V1 ; gradient analytique ; 1 terrain en eau profonde ; `sample()` 3,4–4,7× plus rapide |
| 3 — LOD | DONE | hystérésis ±18 %, distance caméra 3D, grilles imbriquées, quads secs retirés ; physique indépendante du LOD |
| 4 — Forme des vagues | DONE | 7 styles (`classic` = V1 exact), séries + pics le long de la crête, shoaling ; CPU = GPU (2e-5) |
| 5 — Tubes | DONE | peel latéral déterministe (opt-in par style), cycle formation → ouverture → fermeture, lèvre éclairée translucide, gameplay tube conservé |
| 6 — Mousse/sillage | DONE | écume de crête/après déferlement/rivage analytique, liée au peel ; sillage 1 draw call |
| 7 — CPU/GPU | DONE | 0 GC mineur sur la reconstruction du tube, upload/frame 16 → 4 Kio, cadences séparées |
| 8 — Intégration | DONE | bord = couleur NearSea, rivage par test de profondeur, `style` Studio/compilation/archives, 3 zones |
| 9 — Profils & validation | DONE (iGPU NOT_VERIFIED) | Low/Medium/HQ dérivés de la qualité + `PresentationBudget`, captures, tests, PR |

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

## 8. Phase 2 — WaveField CPU (modèle physique 2)

**Décision.** La hauteur n'est pas modifiée (même expression, même ordre d'évaluation flottant) :
`height`, `velocityY`, `crest`, `breaking`, `waveId` restent **bit-identiques** au V1 gelé.
Seul le **gradient** change de méthode, versionné `SURF_WAVE_MODEL = 2` (`field.model`) :

- dérivée exacte de la houle : `A·env·(cos p + 0.44 cos 2p)·k·dir` (4 trigonométries au lieu de 12) ;
- dérivée exacte de l'enveloppe : `smooth'(u)=6u(1−u)` pour la profondeur et pour la marge de zone
  (gradient ±1 du côté le plus proche) ; nulle là où `smooth` est saturé ;
- la pente du fond (`∇depth = −∇ground`, différence centrée ε = 0,45 m) n'est échantillonnée **que**
  dans la bande peu profonde (`depth < shoreFadeDepth`) : en eau profonde, 1 seul appel terrain ;
- mémo exact à deux entrées du fond (clé `x,z` strictement égale) : le cavalier rééchantillonne la
  même position en fin de tick puis au tick suivant ; `invalidateGround()` après édition du relief.

**Cache de bathymétrie (étudié, non retenu pour la physique)** : une grille interpolée changerait les
valeurs (approximation) ; avec 1 appel terrain en eau profonde et le mémo exact, le gain résiduel
(< 0,3 µs/échantillon) ne justifie pas un cache spatial borné à invalider. Le cache est en revanche
utilisé pour la lèvre purement visuelle (phase 5/7).

**Écarts mesurés V2 − V1** (tests `tests/surf-wave-field-v2.test.mjs`, outil de diff) :

| Région | max \|Δgradient\| | Cause |
| --- | --- | --- |
| Intérieur de zone, île A/B/C | 0,0035 / 0,0077 / 0,0088 | erreur de troncature de la différence finie V1 |
| Voisin V1 hors zone ou sec | ≤ 0,015 | V1 remplaçait le voisin par la hauteur centrale (dérivée faussée) |
| Diagonales des coins (bande < ε) | ≤ 0,12 | `min()` des marges non dérivable : V1 moyennait les deux côtés |

Le dérivé analytique est vérifié contre une différence centrée fine (h = 1e-5) de la même hauteur
(< 2e-5). Effet de jeu : après 10 s de glisse scriptée, 4 cm d'écart de position.

| Mesure (Node, Xeon 2,1 GHz) | V1 | V2 |
| --- | --- | --- |
| Terrain / `sample()` (île A/B/C) | 6 | 1,8 / 2,1 / 2,0 |
| Terrain / tick de glisse (eau profonde) | 12 | 1,0 |
| `sample()` µs p50 île A/B/C | 1,7–2,3 | 0,46–0,58 |
| `sample()` µs p50 bande analytique | 0,66–0,70 | 0,18–0,22 |

Fichier : `docs/perf/surf-cpu-phase2.json`. Le tick physique surf complet reste de l'ordre de
quelques µs : il n'a jamais été le goulot ; les gains réels attendus sont côté rendu.

## 9. Phase 3 — LOD de l'eau surf

**Comparaison des approches** (critère : coût réel / simplicité / stabilité) :

| Approche | Verdict |
| --- | --- |
| Grilles statiques pré-calculées (existant) | **Conservée** : 0 upload CPU, 1 draw call par zone, shader partagé |
| Grilles en tuiles par zone | Rejetée pour l'instant : jointures T entre tiers, +N draw calls ; zones de 140–180 m déjà petites |
| Résolution spatiale adaptative dynamique | Rejetée : reconstruction CPU + upload qui annuleraient le gain sur iGPU |
| LOD statiques + découpage local | Retenue partiellement : **retrait des quads entièrement secs** (plages), pas de découpage dynamique |

**Implémentation** (`src/render/surf-water-view.ts`) :
- **Grilles imbriquées** : un seul passage terrain (`surfWaterLattice`), tiers 1/2 = un sommet sur 2/4 du
  tier 0. Les sommets grossiers sont exactement des sommets fins (même enveloppe) : un changement de
  tier ne déplace que les sommets intermédiaires, pas les crêtes partagées.
- **Résolution liée à la houle** : 14 échantillons par longueur d'onde (7 par harmonique),
  espacement 1,25–4 m, plafond 26 000 sommets au tier 0.
- **Distance caméra 3D** (`surfZoneViewDistance`, altitude incluse) au lieu de la distance joueur.
- **Hystérésis** ±18 % autour des seuils historiques 150 / 400 m (`selectSurfWaterTier`) ;
  le plancher `PresentationBudget.level` reste prioritaire ; la zone sous un surfeur reste au tier 0.
- `stats.wetRatio`, `stats.tierChanges` exposés.

| Géométrie (triangles tier 0 / 1 / 2) | V1 | Phase 3 |
| --- | --- | --- |
| Île A (λ 25 m) | 9 702 / 7 056 / 1 936 | 12 544 / 3 136 / 784 |
| Île B (λ 36 m) | 9 702 / 7 056 / 1 936 | 6 400 / 1 600 / 400 |
| Île C (λ 29 m) | 9 702 / 7 056 / 1 936 | 9 216 / 2 304 / 576 |
| Bande analytique (plage sèche incluse) | 16 200 / 14 112 / 3 872 | 7 454 / 1 882 / 484 |
| Cuisson des 3 tiers (île A/B/C) | 11 / 10 / 9 ms | 9 / 4 / 5 ms |

Le tier 0 de la zone A est plus dense qu'avant (λ courte) : choix volontaire pour la forme des vagues.

**Raccords** : la hauteur au bord du rectangle vaut `seaLevel + 0,02` (enveloppe nulle), comme
`NearSea` (troué sur le même rectangle) ⇒ continuité géométrique. Tests : `tests/surf-render.test.mjs`
(hystérésis, imbrication, quads secs, égalité CPU/GPU conservée à 1e-5).

## 10. Phase 4 — Forme des vagues (`src/surf/wave-shape.ts`)

Une seule famille analytique, partagée par la physique (`wave-field.ts`), le tube et le shader :

```
f(p) = sin p + a·sin 2p − c·cos 2p        a = skew + shoal·breaking(depth)
m    = 1 + setVariation·sin Ps + peakVariation·sin Pc
h    = seaLevel + amplitude · envelope · m · f
```

- `skew` raidit la face avant (V1 : 0,22) ; `sharpness` (c) relève les crêtes et arrondit les creux
  (terme de Stokes d'ordre 2, moyenne nulle) ; `shoal` raidit la face à l'approche du déferlement.
- `m` : séries de vagues qui voyagent avec la houle (`Ps`, longueur `setLength` longueurs d'onde)
  et pics statiques le long de la crête (`Pc`). Aucun hasard par frame, tout est continu et dérivable.
- Styles réutilisables : `classic` (historique, **bit-identique au V1**), `gentle` (houle douce),
  `long`, `fast`, `powerful`, `tubular`, `shorebreak`. Champ **optionnel** `SurfZone.style` :
  anciennes zones, cartes compilées et sauvegardes inchangées ; le schéma Studio l'accepte, le panneau
  Surf le propose, les préréglages Studio l'écrivent, le planificateur A/B/C choisit
  `gentle` / `tubular` / `fast` (île Surf régénérée par `npm run build`).
- La crête logique (`crest`) reste une fonction de phase (seuils de jeu inchangés) ; le tube vise
  le maximum réel de `f` (`crestPhase`, Newton) et sa hauteur suit `m` (grosses séries → tubes plus hauts).
- Le shader d'eau reproduit exactement la même formule ; test JS/GLSL sur les 3 LOD et 3 styles
  (< 2e-5 m, y compris tick 1 000 000). Gradient analytique vérifié contre une différence fine.

## 11. Phase 5 — Déferlement et tubes

**Physique (`surf-barrel.ts`)** — déferlement latéral progressif (*peel*) **opt-in** par style
(`fast`, `powerful`, `tubular`, `shorebreak`) ; `classic/gentle/long` gardent la lèvre historique
pleine largeur. Le point de déferlement parcourt la crête à `peel.speed` (4–6,5 m/s), chaque crête
démarrant à un endroit déterministe : épaule montante devant (`shoulder`), section ouverte (`open`),
section qui se referme puis eau blanche derrière (`collapse`). La clairance du tube est multipliée
par ce facteur : la fermeture émerge naturellement. Sortir par l'épaule après ≥ 3 m et 10 ticks est
une **réussite** ; se laisser rattraper par la section qui se ferme est une **chute** (brassage
inchangé) ; un nageur sur l'épaule non déferlée n'est pas brassé. Tests : `tests/surf-peel.test.mjs`.

**Lèvre 3D (`surf-barrel-view.ts`)** — cycle de vie lisible : crête qui se redresse (épaule : crochet
sans lèvre jetée), lèvre lancée au-dessus du creux (section ouverte), lèvre qui retombe vers l'avant
(fermeture), puis écume dans le shader d'eau. Matériau Lambert facetté (éclairage, jour/nuit) avec
**translucidité simulée** (émission côté cavité), dégradé dos profond → écume de crête → rideau
turquoise. Extrémités effilées par le peel. Un seul buffer / matériau / draw call pour ≤ 4 crêtes.

**Optimisations** : cache bathymétrique local de la bande de déferlement (interpolation bilinéaire,
visuel uniquement, `invalidate()`), **translation GPU** de la lèvre entre deux reconstructions
(collée à la crête à toute cadence, interpolation de rendu incluse), reconstruction 30 / 15 / 7,5 Hz
selon la distance caméra, culling frustum (sphère calculée) et saut complet hors champ,
`drawRange` + `addUpdateRange` limités aux fronts actifs.

## 12. Phase 6 — Mousse, écume, sillage, matériau

**Matériau d'eau (`surf-water-material.ts`)** : `MeshLambertMaterial` étendu (`onBeforeCompile`) ⇒
même éclairage, espace colorimétrique, tone mapping et jour/nuit que `NearSea`. Le bord de zone
reçoit **exactement** la couleur de `NearSea` (fondu visuel ×2,5 plus large que l'enveloppe
physique), d'où la disparition du rectangle. Couleur selon profondeur, creux plus sombres, crêtes
claires, face avant plus sombre, normale analytique (enveloppe statique + houle).

**Écume analytique** (aucune texture, aucune particule) :
- crête : seuil selon hauteur relative, déferlement, taille de la série, rompu par un bruit de valeur
  périodique (6 cellules par longueur d'onde, donc continu au repli du temps) ;
- après déferlement : traînée derrière la crête qui décroît avec le temps écoulé depuis son passage,
  **seulement là où le point de peel était déjà passé** (même index de crête et même point de
  déferlement que le tube CPU, test JS/GLSL < 0,25 m) ;
- ligne de jet de rive sur les derniers mètres, pulsée par chaque vague.
- Niveaux : 0 = bande de crête seule, 1 = bruit + traînée, 2 = second octave.

**Sillage (`surf-wake-view.ts`)** : deux traces de rails qui suivent la surface, s'élargissent et
s'estompent ; gouttes balistiques analytiques dans les virages serrés (hash du tick, pas de
`Math.random`) ; 1 draw call, buffers fixes ; supprimé dès que le joueur ne surfe plus ;
Low = trace courte sans gouttes. Tests : `tests/surf-wake.test.mjs`.

**Outils de validation** : `tools/capture-surf-views.mjs` (caméras fixes, tick de présentation figé,
météo forcée « soleil » et horloge en pause, erreurs de compilation GLSL détectées) ; crochets
`littleWorldDebug.surfCamera / surfRenderTick / surfOpenTubeTick / surfPlace / surfWaterHeight`
(mode métriques uniquement, jamais la physique). Les tests navigateur surf signalent désormais aussi
les erreurs de shader de la console. `test:surf` suit l'UX actuelle (dépôt puis embarquement).

## 13. Phase 7 — Mises à jour CPU/GPU

- **Fréquences séparées** : physique 30 Hz inchangée ; eau = uniformes seulement (0 upload) ;
  lèvre reconstruite à 30 / 15 / 7,5 Hz selon la distance caméra et **translatée sur GPU** entre deux
  reconstructions (interpolation de rendu comprise) ; sillage : hauteurs d'eau recalculées une fois
  par tick, positions par frame ; rien n'est reconstruit hors champ.
- **Buffers** : `Float32Array` alloués une fois ; `addUpdateRange` + `drawRange` limités aux crêtes
  actives ; aucun `BufferGeometry`/matériau recréé ; un seul programme d'eau partagé par toutes les zones
  (`customProgramCacheKey`).
- **Allocations** : `barrelPeelInto` (sortie fournie), liste de crêtes triée par insertion dans des
  tableaux typés, échantillons de bathymétrie mis en cache. Benchmark : **0 GC mineur** pendant 1 500
  reconstructions de lèvre (`tubeScavenges`), contre des allocations par colonne avant.
- `?surfPerf=1` reste le seul surcoût de mesure, désactivé par défaut.

## 14. Phase 8 — Intégration NearSea, rivages, Studio

- **Couleur** : le bord de zone prend la couleur exacte de `NearSea` sous le même éclairage Lambert ;
  fondu visuel 2,5 × `edgeFade` ; la hauteur au bord vaut `seaLevel + 0,02` comme `NearSea`, troué sur
  le même rectangle ⇒ ni trou, ni chevauchement, ni z-fighting.
- **Rivage** : les sommets secs s'enfoncent sous la plage (plus de `discard`, test de profondeur
  anticipé conservé sur GPU réel) ; la lèvre disparaît avant le sable (contrat existant) ; les quais et
  falaises restent hors des zones (validation Studio/planificateur existante).
- **Studio / données** : `SurfZone.style` optionnel ; anciennes zones, archives V3, mondes compilés et
  sauvegardes inchangés (tests `surf-compiled`, `surf-compat`, `surf-island-source`) ; style invalide
  refusé avant compilation. Aucun paramètre graphique obligatoire n'a été ajouté.
- **Plusieurs zones** : île Surf A/B/C (3 zones, styles différents) testée en navigateur ; seule la zone
  sous le joueur est simulée ; LOD par zone selon la caméra ; la lèvre n'est mise à jour que pour les
  zones dont la bande de déferlement est dans le champ (`tests/surf-quality.test.mjs`).

## 15. Phase 9 — Profils de qualité (`src/render/surf-quality.ts`)

Aucune configuration parallèle : le profil se **déduit** de la qualité choisie par le joueur
(`low/medium/high`) et du niveau adaptatif de `PresentationBudget` (chaque niveau abaisse d'un cran).

| Profil | Écume | Crêtes de tube dessinées | Sillage | Tier d'eau minimal (zones non surfées) |
| --- | --- | --- | --- | --- |
| Low | bande de crête seule | 1 (la plus proche) | trace courte, sans gouttes | 1 |
| Medium | bruit + traînée de déferlement | 2 | traces + gouttes | 0 |
| HQ | 2 octaves de bruit | 4 | traces longues + plus de gouttes | 0 |

Physique et gameplay identiques dans tous les profils : test `changing every presentation setting never
changes the simulated ride` (trajectoire sérialisée identique sur 240 ticks avec tube actif).

## 16. Résultats et mesures

### CPU (Node 22, Xeon 2,1 GHz — `docs/perf/surf-cpu-baseline-v1.json` → `surf-cpu-phase7.json`)

| Mesure | V1 (main) | V2 | Cible |
| --- | --- | --- | --- |
| `sample()` µs p50 (île A/B/C) | 1,7–3,2 | 0,46–0,74 | — |
| Terrain / `sample()` | 6 | 1,8–2,1 | — |
| Terrain / tick de glisse (eau profonde) | 12 | 1 | — |
| Tick physique surf p95 | ≤ 0,010 ms | ≤ 0,006 ms | ≤ 0,5 ms ✔ |
| Reconstruction lèvre p95 (à chaque tick) | 0,10–0,19 ms | 0,13–0,16 ms | ≤ 0,5 ms ✔ |
| GC mineurs pendant la reconstruction | non mesuré | 0 | 0 ✔ |
| Sillage par frame p95 | — | 0,03 ms | — |
| Cuisson des 3 LOD (chargement, île A/B/C) | 11 / 10 / 9 ms | 9 / 4 / 5 ms | — |

La reconstruction de la lèvre coûte autant qu'avant **par reconstruction** (elle fait plus : peel,
cycle de vie) mais elle a lieu 1 à 4 fois moins souvent hors du premier plan et jamais hors champ.

### Navigateur — Chromium + **SwiftShader** (rendu logiciel, île Surf plage B, même parcours)

| Mesure par frame | V1 (main) | V2 |
| --- | --- | --- |
| Échantillons terrain surf | 91,8 | 29,1 |
| CPU mise à jour de la lèvre (moyenne) | 0,28 ms | 0,13 ms |
| Upload GPU surf | 16 Kio | 4 Kio |
| Triangles surf visibles | 15 974 | 7 874 |
| Draw calls surf (max) | 4 | 5 (sillage inclus) |
| FPS présentés (A/B même session, 3 passes V2) | 10,6–11,0 | 10,1–10,7 |

**Interprétation honnête** : sous SwiftShader, l'écart de FPS est dans le bruit de mesure (± 5–8 %
entre deux passes identiques) ; le nouveau shader d'eau (éclairage + écume) coûte davantage par pixel,
compensé par moins de triangles et d'uploads. Aucune conclusion sur un vrai GPU n'est possible ici.
Fichiers : `docs/perf/surf-browser-baseline-v1-swiftshader.json`, `docs/perf/surf-browser-v2-swiftshader.json`.

### Qualification matérielle

`NOT_VERIFIED`. Procédure à exécuter sur un PC cible 4–8 Go avec iGPU Intel/AMD :

```bash
SURF_NATIVE_GPU=1 SURF_BENCH_QUALITY=medium npm run benchmark:surf
```

Répéter avec `low` et `high`, 3 passes chacune, et comparer à `main`.

## 17. Tests

| Commande | Résultat (dernière exécution) |
| --- | --- |
| `npm test` | 977 / 977 |
| `npm run typecheck` | OK |
| `npm run build` | OK |
| `npm run benchmark:surf-cpu` | OK (rapport JSON) |
| `npm run test:surf` | 18 vérifications OK (flux dépôt → embarquement aligné sur l'UX actuelle) |
| `npm run test:surf-island` | OK (A/B/C, tube jouable en B) |
| `npm run test:swim`, `test:boats`, `test:water` | OK |
| `npm run test:gameplay` (fixtures préparées) | OK |
| `npm run test:motion` | **échec préexistant** identique sur `main` (`'air' !== 'roll'`, roulade) |
| `npm run benchmark:surf` | OK (SwiftShader, non qualifiant) |

Nouveaux tests : `surf-perf`, `surf-wave-field-v2` (références V1 gelées), `surf-peel`, `surf-wake`,
`surf-quality`, extensions de `surf-render` (LOD, imbrication, quads secs, GLSL ↔ CPU pour 3 styles,
écume ↔ peel) et `surf-compiled` (style).

## 18. Captures (`docs/images/surf-v2/`)

- Avant / après, même parcours de benchmark : `before-main-board-*.jpg` / `after-board-*.jpg`.
- Vues fixes (tick figé, météo forcée) : `after-01…10-*.jpg` ; ancienne lèvre (mur uniforme) :
  `v1-tube-wall-before.jpg`.
- Profils : `quality-low|medium|hq-overview.jpg`.
- Reproduire : `SURF_VIEW_QUALITY=high SURF_VIEW_QUERY='&renderTier=0' node tools/capture-surf-views.mjs <dossier> <tag>`.

## 19. Limitations et risques

- Temps GPU **par mesh surf** non isolé ; aucune mesure sur iGPU réel.
- Le maillage d'eau reste une interpolation linéaire entre sommets : écart visuel de quelques cm avec
  la hauteur physique continue (inchangé depuis V1, plus fin en zone A).
- Le peel modifie volontairement le gameplay des zones stylées (`fast/powerful/tubular/shorebreak`),
  dont les plages B et C de l'île Surf : il faut désormais suivre le déferlement. Les zones sans style
  gardent exactement le comportement historique.
- Le modèle physique 2 change le gradient (≤ 0,009 à l'intérieur des zones, ≤ 0,12 sur les
  diagonales des coins) : les trajectoires divergent de quelques cm sur 10 s par rapport à `main`.
- La lèvre ne dessine que la section de peel la plus proche du joueur sur chaque crête ; les sections
  lointaines restent signalées par l'écume du shader.
- Les crochets de capture `littleWorldDebug.surf*` n'existent qu'avec `?metrics=1`.

## 20. Retour de revue : lèvre sur toute la crête, zones longues et organiques

**Constat 1 — un seul tube visible.** Ce n'était pas l'angle de vue : la lèvre ne dessinait que la
section de *peel* la plus proche du joueur, et ~40 % de chaque crête n'avait aucune lèvre.
Désormais la lèvre couvre **toute la crête visible** (fenêtre de 260 m autour du joueur, 72 colonnes),
avec toutes les sections de déferlement ; l'épaule montante remplit l'intervalle entre deux sections
(`shoulder = period − open − collapse − 6 m`) : la ligne entière déferle progressivement.
Budget : ≤ 3 212 sommets / 5 760 triangles pour 4 crêtes (HQ), 2 crêtes en Medium, 1 en Low ;
reconstruction p95 0,30–0,34 ms (Node), toujours sans GC.

**Constat 2 — zones rectangulaires, crêtes droites, trop petites.** Nouveau champ optionnel
`SurfZone.form` (absent = rectangle et crêtes droites historiques, bit-identiques) :
- `organic` : contour en super-ellipse d'ordre 3 avec ondulation statique, jamais au-delà du rectangle
  (marge nulle sur ses côtés, donc raccord `NearSea` inchangé), gradient analytique ;
- `curvature` (‰/m) et `meander` / `meanderLength` : crêtes **courbées et ondulantes** par un décalage
  de phase statique le long de la crête ; la direction locale de propagation suit la courbure
  (planche, porté de vague) ; même formule dans la physique, le tube, le shader et l'écume
  (tests CPU ↔ GLSL, gradient vs dérivée numérique fine).
- `edgeFade` plus large par défaut pour les zones organiques ; fondu visuel borné (`edgeFade + 30 m`).
- Studio : nouvelles zones organiques par défaut (220 × 300 m), réglages contour / courbure /
  ondulation / fondu dans le panneau Surf ; schéma, archives et compilation acceptent `form`.
- Île Surf : le planificateur essaie d'abord des zones longues et larges (jusqu'à 300 × 260 m),
  vérifie aussi les bords latéraux (port, passages), et garde un repère de port calme cherché sur
  la liste dense des côtes. Résultat : A/B/C ≈ **260 × 293 m** (≈ 76 000 m², ×3,9) au lieu de 98 × 198 m.

| Mesure (île Surf, zone élargie) | Valeur |
| --- | --- |
| Triangles tier 0 / 1 / 2 | 24 128–36 864 / 6 032–9 216 / 1 508–2 304 |
| Draw calls surf | 5 (inchangé) |
| Triangles surf visibles (benchmark SwiftShader) | 30 094 |
| Échantillons terrain, upload lèvre | 0 lecture terrain en rendu (cache), ≤ 19 Kio par reconstruction |

Le benchmark navigateur (`docs/perf/surf-browser-wide-swiftshader.json`, 9,1 FPS SwiftShader) n'est
pas comparable aux mesures précédentes : le point de départ de la plage B a changé et la caméra voit
maintenant l'île (draw calls de la scène 82 → 170, hors surf). **Suite possible** : LOD par tuiles
pour les très grandes zones (seule la partie proche au tier 0) — non fait, à mesurer sur iGPU.
La bande plus claire de `NearSea` (transparente) contre l'anneau d'océan opaque, visible en vue
aérienne loin des zones, est préexistante sur `main`.

Captures : `wide-zone-aerial.jpg`, `wide-curved-crests-full-lip.jpg`, `wide-side-view.jpg`.

## 21. Optimisation pour des zones plus grandes (éclairage par sommet, tuiles, écume)

Objectif : une plus grande surface de vagues sans augmenter le coût. Mesures SwiftShader (rendu
logiciel : seules les tendances relatives comptent), parcours identique, qualité Medium.

**Ce qui a changé**
- **Éclairage par sommet** : l'eau surf est un `ShaderMaterial` (`lights:true`) qui reprend les
  termes Lambert de three (directionnelles, hémisphère, ambiante, BRDF 1/π) **dans le vertex shader**,
  face avant et arrière ; le pixel ne fait que mélanger des couleurs puis applique le tone mapping et
  l'espace colorimétrique de three. Un bord plat reçoit toujours exactement l'éclairage de `NearSea`.
  Limite : les lumières ponctuelles (lanternes) n'éclairent plus l'eau surf.
- **LOD par tuiles** : un seul maillage par zone, découpé en tuiles de 16 cellules ; chaque tuile
  choisit son pas (1/2/4) selon la distance caméra (70 / 260 m, hystérésis ±18 %), deux tuiles voisines
  diffèrent d'un niveau au plus ; des **jupes** verticales (sous la surface) ne sont dessinées qu'entre
  deux pas différents, donc aucune fissure. Seul l'index est réécrit, et seulement au changement de tier.
- **Densité** : 10 échantillons par longueur d'onde (au lieu de 14) ; les normales restent analytiques.
- **Repliement au loin** : la phase de la vague (crête, écume) est calculée **par pixel** (exacte même
  sur une tuile grossière) et l'amplitude **dessinée** s'aplatit avec la distance (−75 % entre 160 et
  360 m, eau et lèvre). Présentation seulement : la physique et la hauteur logique ne changent pas.
- **Écume** : Low = bande de crête ; Medium = + traînée de déferlement et ligne de rivage, sans bruit ;
  HQ = + un octave de bruit (le second octave est supprimé).
- **Houle longue** : préréglage Studio « Houle longue (72 m) » (style `long`, vitesse 9 m/s), qui divise
  encore les triangles d'une zone par 2 à 3 ; c'est un choix de style (moins de vagues, plus rapides).
- **Île Surf** : plages A/B/C ≈ 420 × 413, 420 × 353 et 293 × 420 m (≈ 444 000 m² au total, ×2).

| Mesure | Avant (`e87e7a8`) | Après |
| --- | --- | --- |
| Zone démo (même zone, 3 passes A/B) — FPS | 8,3–8,5 (7,3 machine chargée) | 9,1 (7,9) : ≈ +8 % |
| Île Surf, parcours plage B — FPS / p95 travail | 8,94 / 7,8 ms | **9,59 / 6,6 ms** |
| Île Surf — triangles surf visibles | 28 654 (zones 260 × 293 m) | **15 384** (zones ≈ 2× plus grandes) |
| Triangles d'une zone, caméra au centre (Node) | 33 728 pour 76 000 m² | 17 642 pour 173 000 m² |
| Cuisson d'une grande zone au chargement | 9–11 ms | 16–28 ms |

Captures : `tiles-zone-aerial.jpg`, `tiles-overview.jpg`, `tiles-side-view.jpg`. Qualification iGPU
toujours **NOT_VERIFIED**. Rapport : `docs/perf/surf-browser-tiles-swiftshader.json`, `surf-cpu-tiles.json`.

## 22. Surf arcade : vagues plus hautes, prise facile, saut, boost, bateau et poissons

Retour de jeu : la vague allait trop vite pour le hamster, elle était difficile à prendre et peu
amusante. Refonte du contrôleur (`src/surf/surf-controller.ts`), dans l'esprit des anciens jeux de surf
low-poly. Pas de physique de fluide, toujours pur, déterministe et à 30 Hz.

- **Vagues** : plus hautes, plus longues et plus lentes que la planche (île A 1,1 m / 34 m / 4 m/s,
  B 2 m / 46 m / 5,2 m/s, C 1,8 m / 40 m / 5,6 m/s ; démo 1,6 m / 40 m / 5 m/s ; préréglages Studio
  recalés). Longueurs d'onde plus grandes ⇒ moins de triangles.
- **Prise de vague** : la rame est volontairement plus lente que la houle (3,2 m/s), donc la vague arrive
  toujours vite ; il suffit de ramer vers la plage (Z) : partout sauf sur le haut de l'arrière d'une
  crête, la planche « décolle » à la vitesse de la vague (aucun seuil de vitesse).
- **Verrouillage sur la face** : la vitesse dans le sens de la vague revient vers celle de la houle,
  plus vite en haut de face et plus lentement devant, d'où un équilibre aux deux tiers de la face ; dans
  un creux, la planche attend la face suivante. Détection de face par la montée de l'eau (indépendante
  de l'enveloppe de zone).
- **Glisse le long de la vague** : Q/D orientent la planche (angle borné à ~95° : maintenir une touche
  file le long de la vague au lieu de repartir vers le large) ; la pente nourrit la vitesse (6 à 15 m/s).
  **S** quitte la vague volontairement ; plus aucune perte silencieuse.
- **Espace** : saut partout sur la vague, aussi pendant la rame (4,2 m/s) ; en glisse, grand saut
  (+ bonus sur la lèvre) ; un peu de contrôle en l'air ; réception tolérante (14 m/s).
- **Shift** : mêmes impulsions de gaz que la nage/le vol (réserve, coût, recharge) ; l'excès de vitesse
  se dissipe lentement. La jauge « Boosts » s'affiche en surf.
- **Bateau** (`src/surf/boat-swell.ts`) : dans une zone de surf, la coque prend la hauteur et la pente
  de la houle (tangage/roulis), une face raide la pousse un peu vers la plage, jamais vers des
  hauts-fonds non navigables ; les bateaux laissés dans une zone flottent aussi. Correction : les vagues
  ne se figent plus quand on est à bord (le tick de simulation avance) ; le bateau de départ n'est plus
  placé dans un couloir de surf.
- **Poissons** (`ecology.ts`) : ils restent sous la surface mobile des vagues et se cachent là où il
  faudrait plonger trop bas : plus de poisson dans le vide d'un creux.

Validation : `tests/surf-arcade.test.mjs` (prise en ≤ 5 s depuis tout départ, > 50 % du temps sur la
face, > 80 m le long de la vague, saut en rame et en glisse, boost borné et déterministe, braquage
borné et sortie volontaire), `tests/surf-boat-fauna.test.mjs` ; partie scriptée sur la plage B en
navigateur : saut pendant la rame, vague prise en 0,3 s, glisse jusqu'à 56 km/h avec 5 boosts.
Limite : le collider d'un bateau laissé dans une zone de surf reste à sa hauteur de départ.
