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
| 5 — allocations de la boucle critique | `claude/opt-5-zero-alloc` | **retenue partiellement** (cueillette, herbe, chemins) ; partie habillage revertée | allocations (profil échantillonné) **−12 % forêt, −11 % village, −6 % vol** ; `update` p50 −10 à −12 %, p95 −7 % (forêt, village), vol p95 −6,5 %, p99 −9 % | forêt `update` p99 +5,3 % (2–3 images) ; envoi GPU vol +11 % inexpliqué (ni herbe ni habillage) | forêt, village, vol, 1280×720, 2 exécutions, `ALLOC_PROFILE=1` |
| 6 — herbe : plages d'instances stables (variante a) | `claude/opt-grass-stable-slots` | **retenue** | octets d'herbe **−94 % forêt, −90 % village, −75 % vol** ; envoi GPU total −34 à −57 % ; `update` p99 forêt −16 %, `update` p50 village −10 % | vol : intervalle p95 +1 palier vsync (283 → 300 ms) ; triangles +1,5–1,9 % (trous résiduels à échelle nulle) | forêt, village, vol, 1280×720, 2 exécutions |
| 6 — herbe : secteurs cullables (variante b) | — | **non testée** | — | gain attendu uniquement côté sommets GPU (non mesurable ici) ; augmente les appels de rendu | — |
| 7 — OPT-4 streaming : écologie et herbe préchargées par les workers | `claude/opt-4-streaming-workers` | **retenue sous réserve** (décision utilisateur) | `update` p50 −20 % / p95 −10 % (vol), p95 −28 % / p99 −36 % (forêt), p50 −15 % (zones) ; décor écologie/herbe à parité | file d'habillage en vol 281 au lieu de ~175 (triangles −1,5 %) ; zones : `submit` p95 +19 %, allocations +77 % (copie des résultats) | vol, zones, forêt, 1280×720, A/B/A/B |
| 8 — préchauffage des shaders | — | **déjà livré (doc 106), vérifié** | 0 programme compilé pendant tous les parcours mesurés (baseline et A/B) | — | toutes scènes |
| 9 — overdraw (alpha-test / alphaToCoverage) | — | **non retenue (analyse)** | aucun matériau transparent à opacité 1 : eau, mer proche, halos, pluie, ombre de contact et effets sont réellement translucides ; alpha-test changerait l'image | — | inventaire du code |

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

## Étape 5 — zéro allocation dans la boucle critique — retenue partiellement

**Statut : IMPLEMENTED, TESTED, BENCHMARKED-SWIFTSHADER.** Mesure des allocations par **profil d'allocations échantillonné** (CDP `HeapProfiler`, intervalle 16 Kio, objets collectés inclus : `ALLOC_PROFILE=1`), plus fiable que la pente du heap (bruit < 1,5 % ici contre ±30 %).

Profil initial (serveur de dev, attribution indicative) : 17,9 Mo/s en vol, 4,9 Mo/s en forêt ; premiers postes : reconstruction d'habillage (9,5–15,5 %), requêtes de géographie du thread principal (`polygonSignedDistance`, `height`, `lines`, 25–30 % en vol, relèvent de l'étape 7), `hiddenAt` de la cueillette (3–6 %), fermeture `species` (3–4 %), génération d'herbe (3,5 %).

Changements, tous à résultat identique (mêmes instances aux points de capture stabilisés) :
- **retenus** — `gameplay/gathering.ts` : compteur d'éléments récoltés par cellule (clé numérique), le filtre de rendu ne construit plus de clé texte par élément quand rien n'a été récolté dans la cellule ; `render/grass.ts` : tableaux de génération typés réutilisés et une seule copie exacte par cellule, constantes de variantes ; `paths/path-view.ts` : rectangles de secteur mémorisés au lieu de `split/map` + objet par secteur et par image ;
- **reverté** — `dressing-view.ts` (bits d'hystérésis par cellule au lieu d'étiquettes texte, entrées de cellules réutilisées, une fonction `stage()` par reconstruction) : en vol, `update` p50 +10 %, p95 +7,5 %, intervalle p50 +1 vsync et file d'habillage 189 au lieu de 166 ; écarté par mesure (variante B′).

| Scène | allocations A → B′ | `update` p50 | `update` p95 | `update` p99 | autres |
| --- | --- | --- | --- | --- | --- |
| forêt | 4,79 → 4,22 Mo/s (−12 %) | −12 % | −7 % | +5,3 % | — |
| village | 7,01 → 6,26 Mo/s (−11 %) | −10 % | −7 % | = | `submit` p95 −8 % |
| vol | 27,7 → 26,1 Mo/s (−6 %) | −3 % (=) | −6,5 % | −9 % | envoi GPU +11 % (inexpliqué) |

Détail : [`opt-5/ab-retained.md`](opt-5/ab-retained.md) (A = build de l'étape 1, B′ = retenu), [`opt-5/ab-all.md`](opt-5/ab-all.md) (B = avec la partie habillage). **Limites** : le p99 forêt (+5,3 %) porte sur 2–3 images par exécution, juste au-dessus du seuil de 5 % ; la hausse des envois GPU en vol ne provient ni de l'herbe ni de l'habillage (compteurs égaux) et reste à expliquer ; les requêtes de géographie restent la principale source d'allocations en vol (étape 7).

## Étape 6 — herbe — variante (a) retenue : plages d'instances stables

**Statut : IMPLEMENTED, TESTED, BENCHMARKED-SWIFTSHADER.** `src/render/slot-allocator.ts` (nouveau, pur), `src/render/grass.ts`. Le fondu et le rejet par distance existaient déjà dans le vertex shader (`uRadius`).

- **Avant** : chaque reconstruction (dès qu'une cellule de 16 m entre ou sort) réécrivait **toutes** les touffes dans l'ordre plus-proche-d'abord et marquait tout le tampon pour l'envoi (≈ 55 Mo par minute de course en forêt, 60 % des octets envoyés au GPU).
- **Après** : chaque cellule garde une plage d'instances stable (`SlotAllocator` : first fit, fusion des trous, plafond = nombre d'instances dessinées) ; une reconstruction n'écrit et n'envoie que les cellules ajoutées, met à l'échelle 0 les cellules sortantes et **tasse** la plage dessinée en déplaçant la dernière cellule dans un trou qui la contient (seule la cellule déplacée est envoyée) ; recompactage complet si aucun trou ne convient ou si plus d'un quart de la plage est vide. Même ensemble de touffes (plus proches d'abord, même capacité, même troncature) ; ordre de dessin différent sans effet (matériau opaque). `?grassUpload=full` rétablit l'ancien comportement (A/B dans le même build).
- **Mesure** (A = `?grassUpload=full`, B = défaut, même build, 2 répétitions ; [`opt-grass/ab.md`](opt-grass/ab.md)) :

| Scène | herbe envoyée | envoi GPU total | `update` p50 / p95 / p99 | intervalle p95 | triangles |
| --- | --- | --- | --- | --- | --- |
| forêt | 54,7 → 3,3 Mo (−94 %) | −57 % | = / = / **−16 %** | = | +1,5 % |
| village | 48,5 → 5,1 Mo (−90 %) | −53 % | **−10 %** / = / = | = | +1,9 % |
| vol | 50,6 → 12,8 Mo (−75 %) | −34 % | = / = / = | +5,9 % (283 → 300 ms, un palier) | +0,8 % |

- **Images** : écarts A/B dans le bruit A/A ([`opt-grass/images.json`](opt-grass/images.json)).
- Un premier essai sans tassement ([`first-B-stable-unpacked.json`](opt-grass/first-B-stable-unpacked.json)) réduisait autant les envois mais laissait jusqu'à 25 % de la plage en trous (+5,6 % de triangles au village, intervalle +5 à +6 % en forêt et au village) : d'où le tassement.
- **Limites** : la hausse d'un palier de vsync du p95 en vol (où l'herbe est presque toujours masquée par l'altitude) est probablement une dérive entre le bloc A et le bloc B, mesurés à 30 min d'intervalle : les étapes suivantes alternent A/B/A/B. Sous SwiftShader un octet envoyé coûte peu ; sur iGPU réel la réduction de trafic devrait compter davantage — **non démontré**. La variante (b) « secteurs cullables par frustum » n'a pas été codée : son gain porte uniquement sur les sommets traités par le GPU (non mesurable sans GPU) et elle multiplie les appels de rendu ; à tester avec `GPU=1`.

## Étape 7 — OPT-4 streaming : écologie et herbe hors du thread principal — retenue sous réserve

**Statut : IMPLEMENTED, TESTED (unitaires), BENCHMARKED-SWIFTSHADER.** `biomes.ts` (`ecologySectorData`, `sampleCreaturePath`, `biomeSamplerWith`), `render/grass-cell.ts` (génération pure), jobs `ecology` et `grass` des workers de géographie, `ecology.ts`, `render/grass.ts`. Flags A/B : `?opt4eco=0`, `?opt4grass=0`. Métriques ajoutées : `ecology.missing/missingNear` (secteurs manquants dans le rayon), `streamingLag` dans la suite, stabilisation incluant écologie et herbe.

Quatre variantes mesurées (A/B alternés, même build) :
1. **Tout dans les workers** : `update` p95 −65 % en vol, mais −23 % d'appels de rendu et −16 % de triangles : décor manquant (workers saturés sous SwiftShader). **Rejetée.**
2. **+ filet synchrone près du joueur** : encore 5,7 secteurs d'écologie manquants en vol (1,3 en A). **Rejetée.**
3. **Contenu d'abord + préchargement prioritaire** : écologie à parité, mais la file d'habillage passe à 639 cellules en vol (−10 % de triangles). **Rejetée.**
4. **Contenu d'abord + préchargement basse priorité (retenue)** : chaque image construit le secteur/la cellule le plus proche comme avant, sauf si un worker l'a déjà livré ; les workers préchargent quand ils sont libres.

| Scène | `update` p50 | p95 | p99 | écologie manquante (moy.) | triangles | file habillage max |
| --- | --- | --- | --- | --- | --- | --- |
| vol | −20 % | −10 % | = | 1,39 → 1,08 | −1,5 % | ~175 → 281–296 |
| zones | −15 % | = | = | 3,2 → 3,2 | −0,7 % | = |
| forêt | −10 % | −28 % | −36 % | = | = | = |

Coûts mesurés : en zones, `submit` p95 +19 % et allocations +77 % (copie structurée des résultats des workers) ; en vol, l'habillage attend davantage les workers (triangles −1,5 %). Détail : [`opt-4/ab.md`](opt-4/ab.md). **Pourquoi « sous réserve »** : gain CPU net, mais la règle « aucune perte » n'est respectée qu'à 1,5 % près en vol ; sur un vrai PC (workers non concurrencés par la rastérisation logicielle) l'écart devrait disparaître — **non démontré**.

## Étape 8 — préchauffage des shaders — déjà livré, vérifié

`render/shader-warmup.ts` (doc 106, HITCH-4) compile toutes les matières au chargement et à l'arrivée des espèces. Mesuré : **0 programme compilé** pendant les parcours forêt, village, vol, bateau, zones (baseline et toutes les A/B). Aucun code ajouté.

## Étape 9 — overdraw — non retenue (analyse)

Inventaire des matériaux `transparent` du jeu : mer proche (`NearSeaMaterial`, 0,9), eau intérieure (`water-look.ts`, déjà `forceSinglePass`), halos de lumière, pluie, disque d'ombre du hamster (0,18), effets (gaz, sillage, pêche, vitesse), mer/rivière de la vallée historique. Tous sont réellement translucides : un alpha-test les rendrait opaques ou crénelés, et `alphaToCoverage` exige le MSAA (non activé). Aucun candidat « sans changement visuel » ⇒ pas de code. Les assets du catalogue n'ont aucune texture (doc 81), donc pas de feuillage à alpha.
