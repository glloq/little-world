# 105 — Audit fluidité : 30 FPS réguliers, zéro à-coup, raccords invisibles à toute vitesse

**Statut : AUDITED puis IMPLEMENTED/TESTED en grande partie (20 novembre 2026, voir §6) — NOT BENCHMARKED sur GPU intégré.** Base : `main@ea4c96e` (20 novembre 2026). Complète [81 — audit](81-RENDER-PERFORMANCE-CODE-AUDIT.md) et [82 — roadmap OPT-0…9](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md) ; les constats de 81 encore vrais sont signalés, les nouveaux portent un ID `PACE/HITCH/SEAM/SPEED/QUAL`. Aucun gain FPS n'est revendiqué : toutes les estimations sont **à mesurer** (doc 22, doc 82 §4).

Objectif utilisateur : présentation **calée à 30 FPS sans irrégularité**, **aucune saccade** (hitch, GC, compilation), **aucun artefact** entre zones chargées (fentes, trous, pops de LOD, discontinuités de densité), **fluide à toute vitesse** (marche, roulade, plané boosté, bateau, ski, surf), **qualité correcte de près comme de loin** — sans brouillard-cache.

## 0. Mesures effectuées pour cet audit

| Mesure | Résultat | Portée |
| --- | --- | --- |
| Sonde Playwright île 4×3 km, sommet du volcan → roulade → plané, Chromium SwiftShader | 96 draw calls max, 41 k triangles moyens, sim p95 0,9 ms, update p95 6 ms / p99 10,8 ms, submit p95 3 ms | Signal de régression ; rendu logiciel, **pas** un temps GPU |
| Profil CPU CDP pendant 13,7 s de jeu | JS ≈ 8 % du temps (≈ 5 ms/frame), le reste = rendu natif SwiftShader. Points chauds : `world.update` 320 ms, `dressing.update/rebuild` 163/127 ms, `ecology.update` 73 ms (`creaturePosition`, `habitatAllows`), `horizon-occlusion.sweep` 25 ms, `tree-colliders.sync → generateDressingCell` sur le thread principal, **`getProgramInfoLog` 12 ms pendant le jeu** (compilation de shaders à la première apparition) | Conclusion robuste : les à-coups CPU viennent de travaux ponctuels (rebuild, compilation, génération), pas du coût moyen |
| Intervalles de présentation | Tous multiples exacts de 16,7 ms (50 / 66,7 / 83,3) : la cadence est quantifiée par la vsync | Confirme PACE-1 |
| Banc Node du terrain (île réelle) | `terrainHeight` ≈ 2,3 µs ; tuile LOD0 12,7 ms, LOD1 2,5 ms, LOD2 0,65 ms (pas 2/4/8 m) ; horizon 32 m | Coût worker, pas iGPU |
| Écarts géométriques mesurés | Horizon > 4 m au-dessus du bord LOD2 en 446 points (> 12 m : 45 pts, max 23 m) ; écart LOD0/LOD2 > 12 m (profondeur de jupe) en 12 points ; erreur d'interpolation 8 m → 2 m jusqu'à 28,5 m | Preuve des fentes/pops SEAM-1…3 |
| Réplique de `FrameClock.advance` | 60 Hz ±0,3 ms : 72 % à 33 ms, le reste 17/34/50 ms ; horodatage quantifié 1 ms (Firefox) : 1/3 de 17, 33, 50 ms ; 144 Hz : 28/35 ms alternés | Confirme PACE-1 |

## 1. Diagnostic en une page

1. **La cadence 30 FPS est irrégulière par construction** (PACE-1) et la caméra suit le joueur avec un lissage dépendant du pas (PACE-2) : même à 30 FPS « moyens », l'œil perçoit du judder, d'autant plus fort que la vitesse est élevée.
2. **Les saccades viennent de travaux ponctuels sur le thread principal** : reconstruction complète de l'habillage 4×/s en mouvement avec ~1–2 Mo d'upload (HITCH-1), herbe générée par touffe sur le thread principal et ré-uploadée en entier (HITCH-3), shaders compilés à la volée (HITCH-4), falaises/PNJ/écologie construits de façon synchrone (HITCH-6…8), occlusion de relief 1 600 `terrainHeight`/frame (HITCH-5).
3. **Les artefacts entre zones sont géométriques et temporels** : fente horizon/tuile, jupes trop courtes, LOD terrain sans geomorphing, et **tous** les changements de LOD d'objets sont instantanés et décidés par cellule de 64 m (SEAM-*).
4. **À grande vitesse**, seul le terrain anticipe (et faiblement) ; habillage, herbe, falaises, objets, écologie et occlusion chargent au plus proche du joueur (SPEED-*).
5. **Qualité lointaine** : le détail terrain s'arrête à 240 m, au-delà grille d'horizon 32 m facettée ; objets posés sur `terrainHeight` exact alors que le sol affiché est grossier (flottement jusqu'à ~20 m) ; précision de profondeur faible au loin (QUAL-*).

## 2. Catalogue des points d'optimisation

Sévérité : **H** = perceptible en jeu normal, **M** = perceptible dans certains cas, **L** = coût ou finition. « 81 » = déjà signalé par le doc 81 et toujours vrai.

### 2.1 Cadence et lissage (PACE)

| ID | Sév. | Où | Constat | Correction proposée |
| --- | --- | --- | --- | --- |
| PACE-1 | H | `frame-clock.ts:42-56` | Porte de présentation `acc + 1e-9 >= 1/30` posée exactement sur la frontière de 2 vsyncs à 60 Hz → 17/33/50 ms mêlés ; 144 Hz → 28/35 ms alternés | Estimer la période vsync (médiane des deltas RAF bornée 4–34 ms) ; présenter si `acc >= interval − vsync/2`, puis `acc -= interval` borné à ±vsync/2 (pas de `%`) ; choisir un diviseur entier stable (60 Hz → 2, 144 Hz → 5 = 28,8 FPS réguliers, 75 Hz → 2 ou 3) |
| PACE-2 | H | `main.ts:1254` | `camera.position.lerp(desired, min(1, dt*6))` en coordonnées monde : retard ≈ v·(1−k·dt)/k (8 m à 60 m/s) qui varie avec `dt` → le héros « pompe » à l'écran | Lisser l'**offset** caméra/cible avec `1−exp(−k·dt)` et suivre exactement `renderPosition` ; contrainte terrain appliquée après lissage, seule la correction montante lissée |
| PACE-3 | H | `main.ts:1831-1836`, `gameplay/fleet.ts:63-70` | Bateaux, télésiège, port/ferry et animations pilotées par `elapsed` (pas de 33 ms) non interpolés alors que le cavalier l'est → décalage 0,33 m à 10 m/s qui scintille avec α ; à 20 FPS alternance 1/2 ticks | `renderTime = elapsed − step + α·step` transmis à toutes les vues ; `prev*` par bateau et lerp dans `sync(b, α)` |
| PACE-4 | M | `frame-clock.ts:39,45` | Rattrapage jusqu'à 8 ticks dans une seule RAF après une pause → cascade de frames lentes | 2–3 ticks max par RAF, reste conservé dans l'accumulateur (borné 0,25 s) : le monde ne ralentit pas |
| PACE-5 | M | `main.ts:1747-1758` | Tick + update + rendu dans la même RAF, la suivante vide → dépassement de 16,7 ms = vsync ratée | Déphaser l'accumulateur de simulation de `step/2` au `reset()` : les ticks tombent sur la RAF non présentée |
| PACE-6 | M | `main.ts:172-180,2013-2016`, `frame-clock.ts:99-120` | `setPixelRatio` puis `setSize` → double réallocation du canvas ; remontée après 12 s sans mémoire d'échec → oscillation possible toutes les ~15 s, chaque palier change aussi herbe/habillage | Ne rien appeler si taille/DPR inchangés ; doubler le délai de remontée après un échec < 10 s ; repli 20 FPS collant 30–60 s ; un seul levier par changement (doc 22) |
| PACE-7 | M | `PresentationBudget.observe` | Ne distingue pas CPU/GPU : baisse la résolution même si le goulot est CPU (81) | Utiliser `timings.updateMs/submitMs` + `gpuTimer.stats.ms` quand disponible ; baisse DPR seulement si GPU/fill-rate |
| PACE-8 | L | `hamster/hamster.ts:104`, `audio/view.ts:42`, `world-probe.ts:11` | Rotation du hamster en `min(1,dt*rate)` ; écouteur audio mis à jour toutes les 200 ms (panoramique en escalier) ; sonde de sol invalidée par 250 ms ET 2 m (recalcul chaque frame > 40 m/s) | `1−exp(−k·dt)` ; `setTargetAtTime(…,0.02)` chaque frame présentée ; invalider après 250 ms **ou** 8 m |
| PACE-9 | L | `npc-view`/`main.ts:1831` | `npcs.update(delta)` au rythme de présentation | Déplacer la logique PNJ dans le tick, interpolation de présentation seulement |

### 2.2 Saccades ponctuelles (HITCH)

| ID | Sév. | Où | Constat | Correction proposée |
| --- | --- | --- | --- | --- |
| HITCH-1 | H | `dressing-view.ts:156-263`, déclenché `:291,301,329` et `world.ts:993-995` | Chaque rebuild retrie 1 200 cellules et réécrit **toutes** les instances des 8 familles + 2 `BatchedMesh` (`addUpdateRange(0,n*16)`, textures matrices/couleurs entières) ≈ 1–2 Mo ; déclenché par changement de cellule 64 m, résultat worker **et** chaque rafraîchissement d'occlusion (tous les 12 m) → jusqu'à 4×/s en vol (81, aggravé) | Slots stables par cellule et par famille ; dirty seulement si la cellule franchit une bande de distance ; upload des plages modifiées ; déclenchement à la distance parcourue (≈ 8 m), pas à l'occlusion ; à défaut, rebuild découpé sur plusieurs frames dans des tableaux de staging puis swap |
| HITCH-2 | H | `dressing-view.ts:160-168,256,261` | 2 `new Vector3` par instance + `Box3`×8, `Sphere`, tableau de cellules, `Object.values` à chaque rebuild → ~100 k objets jetables → pauses GC (81) | Min/max en scalaires, tableaux réutilisés triés en place, `stats.bytes` incrémental |
| HITCH-3 | H | `render/grass.ts:104-149,194-199`, `world.ts:799` | `exactPlacement` : classification géographique complète **par touffe** (≤ 650/cellule de 16 m) sur le thread principal, budget 1 ms vérifié seulement entre cellules ; rebuild toutes les 100 ms qui retrie et ré-uploade jusqu'à 1,8 Mo | Génération dans le pool `geo-workers` ; slots fixes par cellule (matrices d'échelle nulle pour les vides) ; upload des seules nouvelles plages ; pas de tri (le shader fond déjà le bord) |
| HITCH-4 | H | aucun `compile/compileAsync` dans `src` ; `lighting/light-view.ts:51-55`, `render/underwater-view.ts:30-34`, mine-helmet | Programmes compilés à la première apparition (espèces `BatchedMesh`, imposteurs, rigs, structures naturelles) ; pool de lumières créé tardivement → change `NUM_POINT_LIGHTS` et **recompile tous les matériaux éclairés** ; `scene.fog` null↔Fog sous l'eau sans hystérésis ; spot de casque minier qui change le nombre de lumières. Mesuré : 12 ms de `getProgramInfoLog` pendant le jeu | Écran de chargement : instancier un exemplaire de chaque variante (pool de lumières à taille finale, fog sous-marin, spot à intensité 0) puis `await renderer.compileAsync(scene,camera)` ; `renderer.debug.checkShaderErrors=false` hors `?metrics/?beta` (évite les lectures synchrones de statut) ; hystérésis ±0,15 m sous l'eau ; spot toujours présent, intensité 0 |
| HITCH-5 | M | `render/horizon-occlusion.ts:9,29-35`, `world.ts:993` | 16 secteurs × 100 pas = 1 600 `terrainHeight`/frame (1,47 ms Node, 3–5 ms CPU faible) pendant 4 frames tous les 12 m → quasi continu à 45 m/s | Balayage dans un geo worker (Float32Array transféré), calculé depuis la position prédite |
| HITCH-6 | M | `render/cliff-view.ts:151-168` | Jusqu'à 3 `buildCliffGeometry` synchrones/frame ; `map/filter/sort` de tous les segments tous les 12 m (81) | Index spatial en grille, cache `(segment,lod,révision)`, build en worker |
| HITCH-7 | M | `npc-view.ts:543-571`, `squirrel.ts:105,122,728` | Rig construit de façon synchrone à l'approche (Tube/Cylinder/Torus uniques par écureuil, Skeleton par hamster), détruit après 3 s ou 32 m → reconstruit en va-et-vient | Pool de `rigBudget` rigs réaffectés, géométries partagées, précompilés au chargement |
| HITCH-8 | M | `ecology.ts:201-283`, `biomes.ts:57-124` | Secteurs 48 m construits en synchrone (nouveaux `InstancedMesh`) et détruits ; `creaturePosition/habitatAllows` chaque frame ; `key.split(':').map(Number)` par résident et par frame | Pool de secteurs, clés numériques, positions de créatures en cadence réduite + interpolation |
| HITCH-9 | M | `structures/natural-mesh.ts:40`, `natural-view.ts:16,35` | Un `MeshLambertMaterial` par instance, détruit en sortie de rayon → le dernier `dispose` libère le programme, retour = recompilation + reconstruction | Matériau partagé, cache de géométrie par spec |
| HITCH-10 | M | `gameplay/tree-colliders.ts:9-34` → `gathering.ts:25` | `generateDressingCell` (classification, `pathDistance`) appelé dans le **tick** pour les collisions d'arbres | Réutiliser les cellules déjà produites par les workers d'habillage ; sinon budget/cellule et pré-calcul anticipé |
| HITCH-11 | M | `dressing-view.ts` (`perObjectFrustumCulled`) | `BatchedMesh` : culling CPU de jusqu'à 18 k instances par frame + `indirectTexture.needsUpdate` chaque frame | Mesurer, puis découper en secteurs ~256 m avec sphères propres et `perObjectFrustumCulled=false` |
| HITCH-12 | L | `terrain-view.ts:307` | Sans worker (échec, `?workers=0`) : au moins une tuile LOD0 (~13 ms) par frame | Repli : LOD2 synchrone (0,65 ms), raffinement étalé |
| HITCH-13 | L | `geo-workers.ts:17,45,49,97` | Tri de toute la file à chaque job ; jobs d'habillage/canopée peuvent occuper tous les slots (1–2 workers) | Tas binaire ; un slot réservé par worker aux jobs `tile`/`horizon` ; plafond d'habillage en vol |
| HITCH-14 | L | `world.ts:1014-1026`, `terrain-view.ts:245`, objets placés | Parcours de `objects.children` chaque frame avec allocations ; `matrixAutoUpdate=true` sur tuiles, GLB posés, falaises, structures (81) | Index spatial réévalué après 8 m / 5° ; `updateMatrix()` puis `matrixAutoUpdate=false` sur le statique |
| HITCH-15 | L | `main.ts:1929-2004` | `?metrics` fait 2 `getObjectByName`, spreads et analyse audio chaque frame → fausse les benchs | Blocs lourds à 2–4 Hz, seuls `frameId` et timings par frame |
| HITCH-16 | L | `horizon-view.ts:88,114,123`, `chunks.ts:165,215`, `terrain-view.ts:203-206,308` | NearSea ré-uploadée entière (98 Ko) et tableau par quad ; clés de chunks reconstruites 2×/frame, spreads, `Set`/`map` par replan ; `computeBoundingBox/Sphere` sur le thread principal | Plages d'upload, clés précalculées, bornes renvoyées par le worker |
| HITCH-17 | L | `underwater-view.ts:37`, `mine-rhythm-hud.ts:48`, `game-ui.ts:449-470`, `cloud-renderer.ts:83`, `sky-lighting.ts:14` | Écriture d'une variable CSS sur `body` chaque frame (restyle global), `style.left` par frame (layout), HUD réécrit sans changement, `Color.set('#…')` par frame | Écrire seulement sur changement (quantifié), `transform`, couleurs pré-parsées |

### 2.3 Artefacts entre zones (SEAM)

| ID | Sév. | Où | Constat | Correction proposée |
| --- | --- | --- | --- | --- |
| SEAM-1 | H | `horizon-view.ts:29-35`, `horizon-data.ts:51-58` | Pas de jupe côté horizon : là où l'horizon (32 m) passe au-dessus du bord de tuile, fente ouverte vers la caméra à ~240 m (mesuré jusqu'à 23 m) → ciel visible au travers sur les collines | Aligner les sommets de bord des tuiles voisines de l'horizon sur l'interpolation de l'horizon (attribut `yHorizon` calculé en worker + masque 4 bits d'arêtes) ; correctif immédiat : jupe verticale montante côté horizon |
| SEAM-2 | H | `terrain-data.ts:37,46` | Jupe fixe de 12 m < écarts réels LOD0/LOD2 (falaises, lits creusés) ; LOD0 voisin d'un LOD2 possible (ancien LOD conservé, bande LOD1 ~48 m en qualité 2) → fissures | Profondeur de jupe par tuile = erreur max de bord + marge, calculée en worker ; contrainte « au plus un niveau d'écart entre voisines » dans `planView` ; à terme snapping d'arêtes |
| SEAM-3 | H | `terrain-view.ts:191-200`, `chunks.ts:208-213` | Remplacement instantané du maillage LOD (relief qui saute jusqu'à 28 m, couleurs échantillonnées à 2/4/8 m qui changent) | Geomorphing type CDLOD : attributs `morphY`/`morphColor` (valeur sur la grille parente) calculés en worker, facteur `smoothstep` sur la distance caméra-sommet ; même principe LOD2 → horizon |
| SEAM-4 | H | `dressing-view.ts:173,183,189,224` | Changements LOD0 (60 m) / LOD1 (170 m) / silhouette / anneau canopée 900 m / éclaircissement ×2 (320 m) ×4 (560 m) **instantanés**, décidés depuis le centre de cellule 64 m → bloc entier qui perd la moitié de ses arbres | Fondu en tramage (screen-door) partagé dans `onBeforeCompile` (même calcul que `grass.ts:86`), bande de recouvrement ±10 m élargie par vitesse × latence ; éclaircissement par hash d'instance comparé à `keep(d)` continu |
| SEAM-5 | H | `dressing-view.ts:32,163,183,235,247-248` | Cailloux (40 m), éboulis (55 m) et repli procédural (90 m) testés au centre de cellule (demi-diagonale 45 m) → blocs 64×64 m qui apparaissent à ~10 m du joueur | Sélection par instance (`hypot`), comme la flore GLB (`:232`), + fondu SEAM-4 |
| SEAM-6 | M | `dressing-view.ts:110-111` | Coupure par capacité `BATCH_CAP × CLASS_SHARE` dans l'ordre de remplissage → rayon de coupure qui bouge à chaque rebuild, clignotement en bordure | Rayons fixes dérivés du cap avec hystérésis |
| SEAM-7 | M | `render/cliff-view.ts:9,159`, `structures/natural-view.ts:34`, `npc-view.ts:543-571`, `world.ts:1014-1026` | Falaises : LOD à 105 m sans hystérésis, apparition à 250 m ; structures coupées net à 260 m ; PNJ proxy↔rig à 18/8 m et disparition à 160 m ; bâtiments coupés à `viewDistance` | Même fondu tramé + hystérésis ±10 m sur toutes ces bascules |
| SEAM-8 | M | `ecology.ts:222-283` | Plantes visibles par blocs 3×3 de 48 m (apparition carrée à 48–96 m ; à détail ≥ 2, seulement le secteur du joueur) | Rayon circulaire + fondu shader |
| SEAM-9 | M | `render/grass.ts:156,180`, `world.ts:906-912`, `chunks.ts:155-157,227` | Changement de palier qualité : herbe vidée puis regénérée depuis le centre, rayons d'habillage changés net, vague de rebuild/pop terrain (hystérésis 9,6 m < décalage de 35 %) — précisément quand la machine est surchargée | Densité par seuil de hash en uniform, rayon interpolé sur ~1 s, masquer sans vider ; ne jamais dégrader une tuile dont le LOD fin est résident, qualité appliquée aux nouvelles requêtes |
| SEAM-10 | M | `horizon-view.ts:79` vs `horizon-data.ts:35,38` | Mer proche transparente 0,9 sur tuiles vs mer d'horizon opaque → carrés de teinte suivant la grille | Cuire le même mélange dans les sommets mer de l'horizon, ou fondre NearSea vers l'opaque en bord |
| SEAM-11 | L | `cloud-renderer.ts:52-79`, `sky-lighting.ts:12-14` | Nuages = N plus proches retriés à chaque cellule → apparitions/disparitions en vol ; fond/soleil sur `cloudCover` brut, dôme sur la valeur lissée → saut de lumière au changement de météo | Sélection par hash de cellule vs seuil de couverture + fondu d'échelle ; une seule couverture lissée pour tous |
| SEAM-12 | L | `lighting/light-view.ts:74-78` | Lumières du pool réaffectées instantanément | Rampe d'intensité ~0,3 s |

### 2.4 Vitesse (SPEED)

| ID | Sév. | Où | Constat | Correction proposée |
| --- | --- | --- | --- | --- |
| SPEED-1 | H | `world.ts:997-1003` | Seul le terrain reçoit `physicalVelocity` ; habillage, herbe, objets, structures, falaises, écologie chargent au plus proche (≤ 4 cellules d'habillage en vol) → pops devant le joueur en plané (`GLIDE.max=60`) ou boost | Transmettre la vitesse ; planifier depuis `focus + v·lookahead` ; tri `d − k·dot(v̂,dir)` ; rayons d'inclusion + `|v|·latence observée` |
| SPEED-2 | M | `chunks.ts:170-173,204,214` | `maxAheadShift=0.5` plafonne le point prédit à 120 m : à 45 m/s l'anticipation réelle ≈ 2,7 s au lieu de 4 s ; « ahead » (rang 2) passe après toutes les tuiles « view » latérales ; temps d'arrivée ignoré (81) | Priorité = temps d'arrivée estimé vs latence de build observée (`maxTileMs` + attente) ; tuiles sans maillage en premier ; demander directement LOD0/1 sur la trajectoire au lieu de LOD2→1→0 |
| SPEED-3 | M | `terrain-view.ts:152-153,164` | Résultat worker jeté s'il n'est plus exactement la clé désirée (LOD1 arrivé après bascule en LOD0) | Le garder et l'afficher s'il est plus fin que l'affiché ou si rien n'est affiché |
| SPEED-4 | M | `render/horizon-occlusion.ts:9,20,30` | Champ relevé de 6 m seulement, rafraîchi tous les 12 m + 4 frames puis repris par l'habillage au rebuild suivant (≤ 250 ms) → forêts derrière les crêtes qui apparaissent par vagues en montée rapide | Marge = vitesse verticale × (rafraîchissement + rebuild), ou occlusion désactivée pour habillage/objets en vol > 15 m/s |
| SPEED-5 | L | `terrain-view.ts:207-213` | Tuiles hors frustum + 0,3 rad au-delà de 120 m retirées ; rotation > 0,47 rad/frame → horizon montré une frame | Anneau de rotation élargi selon la vitesse angulaire caméra |

### 2.5 Qualité proche/lointaine (QUAL)

| ID | Sév. | Où | Constat | Correction proposée |
| --- | --- | --- | --- | --- |
| QUAL-1 | H | `maps/island.project.json` (`viewDistance` 240), `horizon-data.ts:12-18` | Plus aucune tuile détaillée au-delà de 240 m ; horizon uniforme 32 m facetté et flou dès le plan moyen ; front de pop qui suit la caméra | LOD2 jusqu'à ~400 m (max schéma `world-data.ts:174` ; 0,65 ms worker et ~160 triangles par tuile) ; fusion des tuiles lointaines 4 par 4 (128 m) pour limiter les draw calls ; niveau d'horizon intermédiaire 16 m jusqu'à ~1 km ; **mesurer** draw calls sur iGPU |
| QUAL-2 | M | habillage/objets/herbe posés via `terrainHeight` exact | Sol affiché grossier (8 m / 32 m) → arbres et bâtiments qui flottent/s'enfoncent jusqu'à ~20 m au loin | Résolu par SEAM-3/QUAL-1 ; sinon caler les instances lointaines sur la hauteur bilinéaire de la grille affichée |
| QUAL-3 | M | `main.ts:148,265` | near 0,1 / far ≈ 7 500 m : précision de profondeur ~2,4 m à 2 km, ~15 m à 5 km → scintillement de côtes, rivières, pieds d'arbres, NearSea (+0,02 m) | `reverseDepthBuffer:true` (three r180, si `EXT_clip_control`) à tester sur iGPU ; sinon near dépendant du mode (0,5 m en vol/altitude, 0,1 m en mine). Pas de `logarithmicDepthBuffer` (règle doc 17) |
| QUAL-4 | L | `horizon-data.ts:39-40` | Normales et classification de l'horizon échantillonnées sur un gradient de 2 m avec un pas de 32 m → paysage lointain tacheté (aliasing) | Pré-filtrer (moyenne de 4 échantillons) pour l'horizon |
| QUAL-5 | L | `terrain-view.ts:100-103` | Terrain `DoubleSide` → faces arrière rastérisées (overdraw) | Corriger l'enroulement des jupes et passer en `FrontSide` (gain GPU à mesurer, réinvestissable en qualité) |

## 3. Plan de livraison recommandé

Chaque lot = une PR mesurable (doc 82 §1), avec A/B à trajectoire fixe et **critère d'acceptation explicite**. Les lots 1–3 visent la sensation de fluidité avant tout ; ils ne réduisent aucune qualité.

| Lot | Contenu | Rattachement | Critère d'acceptation |
| --- | --- | --- | --- |
| **L1 — Cadence** | PACE-1, PACE-5, PACE-4, PACE-2, PACE-3, PACE-8 ; tests unitaires `frame-clock` sur 60/75/120/144 Hz avec jitter et horodatage quantifié | OPT-6 | ≥ 95 % des intervalles présentés à ±2 ms de la cible (multiple de vsync choisi) en réplique ; distance caméra/hamster constante à ±5 cm à vitesse constante ; simulation inchangée (tests existants) |
| **L2 — Zéro compilation en jeu** | HITCH-4 (pré-compilation + pool de lumières dimensionné + fog/spot stables), HITCH-9, `checkShaderErrors` | OPT-5 | 0 appel `getProgramInfoLog`/`linkProgram` dans un profil de 60 s après chargement (vol, mine, plongée, village) |
| **L3 — Raccords terrain** | SEAM-1 (jupe montante immédiate puis snapping), SEAM-2, SEAM-3 (geomorphing), QUAL-5 | OPT-4/7 | Métrique `holeFraction` du banc route = 0 ; banc Node des écarts : 0 point > jupe ; captures avant/après validées |
| **L4 — Fondu unifié des objets** | Chunk shader de tramage partagé + hystérésis : SEAM-4…8, SEAM-12 | OPT-7 | Aucun changement de LOD visible en capture vidéo de vol à 60 m/s ; densité continue au passage d'une frontière de cellule |
| **L5 — Habillage/herbe incrémentaux** | HITCH-1, HITCH-2, HITCH-3, SEAM-9, HITCH-11 | OPT-1 | Octets uploadés par seconde en vol ÷ 5 minimum ; aucune frame > 2× la médiane due au rebuild ; image identique à qualité fixe |
| **L6 — Streaming conscient de la vitesse** | SPEED-1…5, HITCH-5, HITCH-13 | OPT-4 | Vol boosté rectiligne et virages : 0 cellule d'habillage/tuile manquante dans le cône avant à < 2 s d'arrivée |
| **L7 — Portée et qualité lointaine** | QUAL-1, QUAL-2, QUAL-3, QUAL-4, SEAM-10, SEAM-11 | OPT-7/8 | Draw calls et temps GPU iGPU mesurés avant/après ; silhouettes et côtes stables sans scintillement |
| **L8 — Nettoyage CPU** | HITCH-6…8, HITCH-10, HITCH-12, HITCH-14…17, PACE-6, PACE-7, PACE-9 | OPT-2/3/6 | p99 `updateMs` non régressif, compteurs d'allocations/rebuild en baisse |

**Ordre conseillé** : L1 → L2 → L3 → L4 → L5 → L6 → L7, L8 en continu. L1 et L2 sont courts, à faible risque et améliorent la sensation immédiatement ; L3/L4 suppriment les artefacts les plus visibles ; L5/L6 suppriment les à-coups en mouvement ; L7 n'est engagé qu'avec une mesure iGPU.

## 4. Instrumentation à ajouter avant les lots

- Distribution des intervalles présentés par rapport à la cible (part à ±2 ms), pas seulement p50/p95.
- Compteurs par frame : programmes compilés (`renderer.info.programs.length` delta), octets uploadés (`addUpdateRange` cumulés), rebuilds habillage/herbe et leur durée, cellules manquantes dans le cône avant, tuiles affichées par l'horizon faute de maillage.
- Scénario de banc « vol boosté » ajouté à `tools/benchmark-route.mjs` (départ sommet du volcan `spawn=1060,-770`) ; lors de cet audit le script a expiré en attendant `locator('canvas')` sur l'île (à corriger, p. ex. viser `#viewport canvas` comme `test-motion-browser.mjs`).

## 5. Limites de cet audit

- Mesures sous **SwiftShader** et Node : elles valident les coûts CPU relatifs et les artefacts géométriques, **pas** les FPS ni le temps GPU sur GPU intégré.
- Les coûts annoncés « estimés » (uploads, GC, culling `BatchedMesh`) sont déduits du code ; à confirmer par l'instrumentation du §4.
- Pas d'étude des îles autres que le Volcan ; les mêmes chemins de code s'appliquent, mais les relief/densités diffèrent.

## 6. Mise en œuvre (branche `claude/focused-davinci-elgp04`)

Statuts : **IMPLEMENTED** = code livré sur la branche ; **TESTED** = tests unitaires et/ou navigateur ; **VISU** = captures avant/après comparées (8 points de vue fixes de l'île, `renderTier=0`, SwiftShader). Aucun résultat GPU intégré : **NOT BENCHMARKED-4GB/8GB** pour tout le lot.

| ID | Statut | Ce qui a été fait | Preuve |
| --- | --- | --- | --- |
| PACE-1 | IMPLEMENTED, TESTED | `FrameClock` estime la période d'affichage (quartile bas des deltas RAF) et présente tous les N rafraîchissements (`round(cible/vsync)`) avec tolérance d'une demi-période | `tests/frame-clock.test.mjs` : ≥ 99 % d'intervalles réguliers à 60/120/144/75 Hz avec gigue et horodatage au ms. Ancien code, horodatage au ms : 60 Hz = 1/3 de 17/33/50 ms → nouveau 33/34 ms ; 144 Hz 28/34/35 ms → 34/35 ms |
| PACE-2 | IMPLEMENTED | Caméra : lissage de l'**offset** autour de `renderPosition` en `1−exp(−k·dt)`, contrainte au sol après lissage | Distance caméra/hamster indépendante de la vitesse et du pas |
| PACE-3 | IMPLEMENTED, TESTED | `fleet.capture()` avant chaque pas, `sync(b, renderTime, alpha)` ; ferry, port et télésiège reçoivent `renderTime` (même instant que le joueur) | `tests/fleet.test.mjs` inchangé et vert |
| PACE-4 | NOT DONE (justifié) | Le rattrapage reste borné à 0,25 s : la simulation mesurée coûte p95 0,9 ms/pas, 7 pas ≈ 6 ms ; le test « sans dette » existant encode ce choix | — |
| PACE-5 | NOT DONE | Le déphasage tick/rendu ne se stabilise pas à 60 Hz (chaque RAF ajoute exactement ½ pas) ; gain CPU faible face au risque | — |
| PACE-6 | IMPLEMENTED, TESTED | Pas de `setPixelRatio`/`setSize` ni de `setDetail` si rien ne change ; un passage 30↔20 ne touche plus au détail ; remontée doublée (≤ 96 s) après un échec < 10 s | nouveau test « backs off instead of oscillating » |
| PACE-7 | NOT DONE | Diagnostic CPU/GPU de l'arbitre : nécessite des mesures iGPU | — |
| PACE-8 | IMPLEMENTED | Rotation du hamster en `1−exp`, sonde audio du sol ≥ 100 ms entre échantillons, écouteur audio glissant (`setTargetAtTime`, 70 ms) | `tests/audio.test.mjs` vert |
| PACE-9 | NOT DONE | PNJ dans le tick : changement de comportement à valider avec le doc 96/97 | — |
| HITCH-1 | IMPLEMENTED, TESTED | Rebuild d'habillage en **job reprenable** (générateur) ≤ budget/frame, remplissage CPU puis commit atomique ; écritures `BatchedMesh` mises en attente et appliquées au commit ; buffers agrandis échangés au commit | SwiftShader : rebuild 4,1 ms en 2 tranches, commit 0,1 ms ; `test:dressing-stability` vert |
| HITCH-2 | IMPLEMENTED | Bornes en scalaires, liste de cellules réutilisée, octets du cache incrémentaux | — |
| HITCH-3 | PARTIAL | Herbe : tri sans allocation ; génération **mesurée** à 0,26 ms/cellule → pas déplacée en worker | sonde `?metrics` |
| HITCH-4 | IMPLEMENTED, TESTED | `render/shader-warmup.ts` : `compileAsync` de toutes les matières (état normal, brouillard sous-marin, lampe frontale) au chargement et à l'arrivée des espèces ; `checkShaderErrors` désactivé hors dev/`?metrics` ; hystérésis du brouillard sous-marin et teinte CSS écrite seulement au changement | Programmes compilés pendant un parcours de jeu : 1 (base : 1–2), sans plus de compilation à l'entrée dans l'eau/la mine. Coût : ~100 programmes au chargement au lieu de 21 (variantes préparées) |
| HITCH-5 | IMPLEMENTED | Occlusion du relief : 8 azimuts/frame au lieu de 16 | `tests/occlusion.test.mjs` vert |
| HITCH-6 | NOT DONE | Index spatial/caches des falaises : non retenu dans ce lot (île de démonstration sans falaise active dans les vues mesurées) | — |
| HITCH-7 | IMPLEMENTED | Rigs PNJ conservés 20 s / 96 m (au plus 2× le budget de rigs) au lieu d'être reconstruits à chaque passage du rayon | — |
| HITCH-8 | NOT DONE | Écologie : pool de secteurs à faire | — |
| HITCH-9 | IMPLEMENTED, TESTED | Structures naturelles sorties du rayon mises en réserve (LRU 64), invalidées si la source change | `tests/studio-natural-view.test.mjs` vert |
| HITCH-10 | IMPLEMENTED, TESTED | Cueillette et troncs-colliders réutilisent les cellules d'habillage déjà générées en worker (cellules intérieures où les bornes coïncident) | `tests/gameplay.test.mjs` vert |
| HITCH-11…17 | PARTIAL | Terrain : `matrixAutoUpdate=false` ; structures : idem ; HUD minier, métriques et NearSea non modifiés | — |
| SEAM-1 | IMPLEMENTED, TESTED, VISU | Jupes montantes vers l'horizon (rehaussées seulement sur les côtés sans voisin affiché) | test `terrain-geomorph` ; plus de fente horizon/tuile |
| SEAM-2 | IMPLEMENTED, TESTED, VISU | Profondeur de jupe par tuile = plus grand écart possible (2 m, grilles 4/8 m, horizon) ; bords des tuiles fines **cousus** sur la grille du voisin plus grossier (T-junctions étanches) | captures : disparition des pointillés sombres le long des tuiles (volcan, côte, colline du lac) |
| SEAM-3 | IMPLEMENTED, TESTED | Geomorphing temporel (0,6 s) : cibles `morphY/morphColor/morphNormal` (grille parente, horizon exact pour le LOD 2) ; une tuile plus grossière remplace la fine **après** que celle-ci a rejoint sa forme parente ; LOD 2 apparaît/disparaît en se fondant dans l'horizon | tests : cibles = tuile parente/horizon exactes, swap différé observé |
| SEAM-4 | IMPLEMENTED | Fondu tramé complémentaire (screen-door) LOD0↔LOD1 GLB et LOD1↔silhouette, piloté par la distance instance↔focus courant (paramètre en alpha de la texture couleur `BatchedMesh` / attribut `instanceFade`) ; doublons seulement si la capacité le permet | captures sans régression ; à valider en mouvement sur iGPU (coût du `discard`) |
| SEAM-5 | IMPLEMENTED, VISU | Rochers, basalte, éboulis, cailloux sélectionnés par élément (rayon ×1,15) | instances ≥ base dans toutes les vues (volcan 4 083 → 4 565) |
| SEAM-6, 7, 8 | NOT DONE | Coupure de capacité, falaises/structures/PNJ/bâtiments, écologie : à traiter avec le même fondu | — |
| SEAM-9 | IMPLEMENTED, TESTED | Herbe : changement de profil régénéré sur place (anciennes cellules dessinées en attendant), masquage en altitude sans vider les cellules | `tests/grass.test.mjs` vert |
| SEAM-10 | NOT DONE | Mer proche transparente vs horizon opaque : la correction change la teinte de la mer au bord de carte (anneau océan) | — |
| SEAM-11 | IMPLEMENTED, TESTED | Nuages : forme stable par cellule, bord qui s'estompe, reconstruction après 20 m ; éclairage du ciel lissé (τ 6 s) comme le dôme | `tests/cloud-renderer.test.mjs` vert |
| SEAM-12 | IMPLEMENTED, TESTED | Lumières du pool réaffectées : rampe 0,3 s | `tests/lights.test.mjs` vert |
| SPEED-1 | IMPLEMENTED | Habillage généré d'abord le long de la trajectoire (`setMotion`) | — |
| SPEED-2 | IMPLEMENTED, TESTED | `maxAheadShift` 1 ; en mouvement, tuiles de vue et prédites dans le même rang, ordonnées par temps d'arrivée | `tests/view-planning.test.mjs` vert |
| SPEED-3 | IMPLEMENTED, TESTED | Résultats worker conservés (≤ 24, purgés par une édition) et intégrés dès qu'ils redeviennent utiles | idem |
| SPEED-4 | IMPLEMENTED, TESTED | Œil de l'occlusion relevé de 6 m + 0,5 × vitesse caméra (≤ 40 m) | `tests/occlusion.test.mjs` vert |
| SPEED-5 | NOT DONE | — | — |
| QUAL-1 | NOT DONE (mesure iGPU requise) | Portée détaillée 240 m conservée : le raccord est désormais invisible (SEAM-1/3), l'extension à 400 m multiplierait les draw calls (~44 → ~120 tuiles) | — |
| QUAL-2 | PARTIAL | Résolu là où le geomorphing s'applique ; sinon inchangé | — |
| QUAL-3 | IMPLEMENTED | Plan proche 0,3 m hors galeries et tube de surf (0,1 m) : précision ×3 au loin | — |
| QUAL-4 | NOT DONE | Préfiltrage de l'horizon : modifierait l'aspect lointain, à arbitrer visuellement | — |
| QUAL-5 | IMPLEMENTED, VISU | Terrain `FrontSide`, jupes orientées vers l'extérieur | captures |

**Vérifications** : `npm test` 1 120/1 120, `npm run typecheck`, `npm run build` verts ; navigateur (SwiftShader) : voir le message de commit/PR pour la liste des suites exécutées. Captures de contrôle : aucune vue avec moins d'instances que la base ; différences d'image < 2 % des pixels, dues au vent/à l'heure, sauf la disparition voulue des coutures de tuiles.

**Limites** : tout est mesuré en rendu logiciel ; le coût GPU réel du fondu tramé (`discard`) et des ~100 programmes préchargés reste à mesurer sur GPU intégré avant de qualifier les cibles 30/20 FPS.
