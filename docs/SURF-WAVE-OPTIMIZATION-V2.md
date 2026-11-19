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
| 2 — WaveField CPU | DONE | hauteur/vitesse verticale/crête/déferlement/waveId bit-identiques à V1 ; gradient analytique ; 1 terrain en eau profonde ; `sample()` 3,4–4,7× plus rapide |
| 3 — LOD | DONE (eau) / culling tube → phase 5 | hystérésis ±18 %, distance caméra 3D, grilles imbriquées, quads secs retirés ; physique indépendante du LOD |
| 4 — Forme des vagues | DONE | 7 styles (`classic` = V1 exact), séries + pics le long de la crête, shoaling ; CPU = GPU (2e-5) |
| 5 — Tubes | DONE | peel latéral déterministe (opt-in par style), cycle formation → ouverture → fermeture, lèvre éclairée translucide, gameplay tube conservé |
| 6 — Mousse/sillage | DONE | écume de crête/après déferlement/rivage analytique, liée au peel ; sillage 1 draw call |
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
