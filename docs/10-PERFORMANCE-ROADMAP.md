# 10 — Performance, chargement spatial et mesures

**12 novembre 2026 — architecture locale implémentée ; aucun gain global de FPS revendiqué.**

**Cible de conception :** carte continue de 100 km² maximum et Studio spécialisé, voir [périmètre](12-PROJECT-SCOPE.md) et [UX](13-STUDIO-UX-ARCHITECTURE.md). Cette campagne conserve une limite expérimentale de 2 km par axe ; aucun test 100 km² n’est revendiqué.

**Référence globale : [Politique LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), cible 30 FPS, secours 20 FPS, simulation indépendante.**

## Mesures de campagne (avant migration de cadence)

Même Chromium 156.0.8078.79, viewport 960 × 640, DPR 1, qualité moyenne, rendu logiciel SwiftShader. Les moyennes proviennent de 90 intervalles réels `requestAnimationFrame`, sans plafonnement du delta. Les sources n’ont pas changé pendant la mesure finale. Les données brutes sont conservées dans [before](benchmarks/2026-11-12-before.json) et [after](benchmarks/2026-11-12-after.json).

| Scène | Frame avant (ms) | Frame après (ms) | FPS après | Appels avant → après | Triangles après | Chunks actifs / résidents |
|---|---:|---:|---:|---:|---:|---:|
| Vallée, départ | 82,51 | 96,85 | 10,33 | 165 → 219 | 47 738 | 24 / 24 |
| Port, caméra après raccourci P | 55,13 | 79,44 | 12,59 | 64 → 89 | 24 586 | 24 / 38 |
| Terrain synthétique 1 × 1 km | non mesuré | 103,70 | 9,64 | non mesuré → 229,41 | 52 646 | 60 / 60 |
| Terrain synthétique 2 × 2 km | non mesuré | 96,85 | 10,33 | non mesuré → 229,73 | 51 579 | 59 / 59 |

Les triangles avant étaient affichés arrondis dans le HUD : environ 65k au départ et 19k au port. Les résultats après moyennent les valeurs exactes ; les comptes géométriques internes de chunks incluent les jupes et diffèrent des triangles effectivement soumis au rendu.

**Le rendu enrichi régresse sur cette machine logicielle**. Les nouveaux personnages, plantes et créatures augmentent les appels ; il ne s’agit pas d’une comparaison isolant uniquement le streaming, puisque le contenu a évolué. Ces mesures ne démontrent ni gain FPS, ni cible GPU PC atteinte. Elles démontrent le démarrage des quatre scènes et un jeu de géométries de terrain actif limité à une zone locale.

Le benchmark a observé 13,5–17,7 Mo de heap JS utilisé selon la scène (API Chrome approximative, pas la mémoire GPU). Le temps jusqu’au début de mesure est 5,4–9,0 s, **incluant navigation de préparation, chargements et attente de stabilisation de 1,2 s** ; ce n’est pas un temps de chargement pur. Les octets de ressources mesurés viennent du serveur Vite de développement et ne constituent pas la taille du site de production. Temps CPU isolé, mémoire VRAM, forêt dense, long vol panoramique et éditeur avec 2000 objets restent non mesurés.

Aucune exception JS ni erreur HTTP observée dans les quatre scénarios. Pas de mesure Firefox ni de validation d’un déploiement public pour cette branche.

## Mesures après migration LOW-RESOURCE et LOD du petit animal

Mesures sur le commit applicatif `7128fc9`, même navigateur/viewport/machine, **12 secondes de stabilisation adaptative**, puis 90 images effectivement présentées (les callbacks RAF sans rendu sont ignorés). Données [LOW-RESOURCE](benchmarks/2026-11-12-low-resource.json). Aucun changement de source pendant cette collecte, aucune erreur JS/HTTP.

| Scène | Intervalle moyen (ms) | FPS mesuré | Appels moyens | Triangles moyens | Chunks actifs / résidents | Cible finale / qualité adaptative |
|---|---:|---:|---:|---:|---:|---|
| Départ | 68,51 | 14,60 | 185,00 | 41219 | 24 / 24 | 20 Hz / niveau 2 |
| Port | 52,40 | 19,08 | 73,00 | 22944 | 24 / 45 | 20 Hz / niveau 2 |
| Terrain 1 km | 66,85 | 14,96 | 188,00 | 45091 | 60 / 60 | 20 Hz / niveau 2 |
| Terrain 2 km | 67,22 | 14,88 | 188,00 | 43979 | 59 / 59 | 20 Hz / niveau 2 |

**Le gate global 30/20 FPS reste non atteint sur SwiftShader** et le PC de référence n’est pas choisi. L’adaptation réduit réellement la résolution sur un écran DPR1 (facteurs 0,8 puis 0,65 après application du plafond utilisateur/appareil) et les petits éléments éloignés ; elle ne garantit pas la cadence cible. La physique conserve sa vitesse normale à 20, 30, 60 et même 10 callbacks/s dans les tests déterministes.

Les timers CPU instrumentés et le heap Chrome sont conservés dans les données brutes ; le temps de soumission WebGL **n’est pas** un temps GPU. L’évolution des moyennes FPS reflète aussi la qualité et le contenu adaptatifs : aucun gain à qualité/contenu identiques n’est démontré. Le LOD du petit animal s’applique après 8 m, celui des personnages interactifs après 18 m ; tous utilisent une silhouette jusqu’à 160 m puis sont masqués.

Les cibles de présentation sont des plafonds, pas des FPS annoncés comme atteints. Les durées surcharge/restauration (3/12 secondes) et le lissage des charges irrégulières restent à calibrer sur matériel réel. Les onglets masqués suspendent le rendu/simulation ; l’éditeur actif est plafonné à 30 Hz mais son rendu à la demande reste à réaliser.

## Reproduire

```bash
npm ci
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
# Dans un autre terminal, sans autre navigateur de test ni édition des sources :
npm run benchmark -- http://127.0.0.1:5173/little-world/ /tmp/world-bench
```

Le script utilise Chromium système et SwiftShader ; `CHROMIUM_PATH` permet un autre exécutable. `BENCHMARK_SCENARIOS` filtre les scènes et `BENCHMARK_FRAMES` change le nombre d’échantillons. La comparaison ci-dessus utilise les valeurs par défaut. Le script capture caméra/scène, erreurs, heap, géométries, intervalles bruts et empreintes des sources. Les FPS du HUD ont également été corrigés pour utiliser le temps réel ; l’ancien HUD plafonnait le delta et surestimait les faibles FPS.

## Architecture livrée

- `chunks.ts` : grille finie, IDs stables, AABB, planification limitée à la distance d’affichage et hystérésis de LOD.
- `terrain-view.ts` : trois résolutions, échantillons de bord alignés, normales analytiques, jupes, deux nouveaux meshes maximum par mise à jour. Cache borné, réutilisation des secteurs récemment visités, éviction des géométries et rafraîchissement local après sculpture.
- `terrain.ts` : dimensions/niveau marin/configuration active, overrides de relief, eau et distances aux chemins partagés avec la physique. Les niveaux marin, bateau et port suivent la même configuration.
- `ecology.ts` : secteurs locaux de 48 m, génération d’un secteur par mise à jour, cache limité, instancing et activation proche. Habitats et eau contrôlés ; tracés de chemins exclus.
- `npc.ts` / `npc-view.ts` : simulation complète proche, réduite à distance intermédiaire, dormante au loin. Rig complet jusqu’à 18 m (8 m pour le petit animal), silhouette de cinq meshes jusqu’à 160 m, aucun rendu au-delà. Ressources de silhouette partagées ; articulations mises en cache.
- Les modèles GLB et géométries/matériaux partagés restent mutualisés. Les ressources uniques, buffers d’instances et rigs sont libérés lors des régénérations. La caméra n’alloue plus ses deux vecteurs à chaque frame.

Les caches de modèles sont encore bornés par le petit catalogue, sans LRU de textures. Le terrain analytique est une configuration unique par page. Les bâtiments, forêt principale et rivière de démonstration gardent leurs positions historiques ; les grandes cartes sont des tests de terrain étendu, pas des mondes entièrement peuplés. Les secteurs proches génèrent leur géométrie de façon synchrone répartie entre frames : aucun worker n’est encore implémenté. Les LOD n’ont pas de morphing.

## Future campagne multijoueur — mesures à préparer, pas à exécuter aujourd'hui

La [spécification 16](16-FUTURE-MULTIPLAYER.md) distingue **nombre total connecté, densité de foule, affichage GPU et charge serveur**. Les 30/200/500 joueurs sont des objectifs de charge **non mesurés**.

- **AOI** : entités pertinentes par client, transitions, hystérésis et fréquence de réabonnement.
- **Réplication** : mouvements de 2–20 Hz selon priorité, 0 Hz hors intérêt, événements importants priorisés ; quantification, delta, files et overhead à mesurer.
- **Serveur** : tick CPU p50/p95/p99, encodage, débit sortant, mémoire/GC, validation d'interaction, latence de transmission.
- **Client** : FPS/frametime p50/p95/p99 sur GPU intégré, coût des rigs/LOD/ombres, nombre de joueurs détaillés/silhouettes, interpolation à 2–3 Hz.
- **Scénarios distincts** : 30 regroupés, 100/50 regroupés, 200/100 regroupés, 500/200–300 regroupés et 500 dispersés.
- **Vérifications distinctes** : bots headless pour charge serveur vs navigateurs réels pour coût graphique. Les deux sont indispensables avant d'annoncer une capacité.
- **Pas de charge réseau en jeu solo pour simuler une future optimisation** ; l'architecture de données reste compatible, sans dépendance réseau au runtime actuel.

## Campagne HZ — profondeur de vue sans brouillard (non mesurée)

La [spécification 17](17-DISTANT-VIEW-RENDERING.md) définit **HZ-0 à HZ-6** pour construire une vue lointaine de montagnes, îles, côtes, ruines et forêts **sans fog de masquage**. La vue détaillée (terrain LOD0/1/2) doit être distincte de **l'horizon à faible polygones et imposteurs**.

| Étape | Validation attendue |
| --- | --- |
| HZ-0 | Baseline identique (seed/caméra/résolution/contenu) vallée, hauteur, planage, océan, forêt |
| HZ-1 | Maillage de relief d'horizon indépendant du rayon de terrain actif |
| HZ-2 | Transitions LOD/hystérésis, budgets et préchargement directionnel en planage |
| HZ-3 | LOD de forêts/arbres, bâtiments et repères ; instancing par zones |
| HZ-4 | Imposteurs et panoramas précalculés seulement lorsque la parallaxe reste correcte |
| HZ-5 | Proxy indexés/hachés/invalidation locale par le compilateur V3 et le Studio |
| HZ-6 | Benchmark GPU intégré 30/20 FPS, popping, alpha overdraw, mémoire et transfert |

**Ne pas confondre** terrain synthétique de 2 km testé en logiciel avec la **performance d'une vue effective à plusieurs kilomètres**. Les chiffres LOD 100 m/400 m/1,5 km/5 km de la spec 17 restent illustratifs. Tous les gains doivent être comparés à **contenu identique**.

## Campagne GR — coût de l'herbe ultra-économique (non mesuré)

Référence : [18 — Herbe courte/haute et réaction GPU](18-GRASS-LOW-RESOURCE.md). Comparer **sol seul**, **touffes sans animation**, **vent GPU**, **réaction un joueur**, **réaction deux joueurs**, puis **végétation + forêt/village/planage** sur **les mêmes coordonnées, mêmes ressources et même résolution**.

**Objectifs indicatifs :** < 0,1 ms CPU/frame hors génération, < 0,5 ms GPU additionnel, 1–4 draw calls et < 2 Mio GPU de buffers/textures d'herbe. Les budgets sont **à mesurer**, non des valeurs constatées.

Ne pas mesurer seulement les triangles : relever charge CPU de la création d'instances/streaming et coût récurrent, GPU lorsque timer disponible, mémoire, uploads, alpha overdraw, animations, transitions de profils et absence de régression 30/20 FPS. Vérifier le profil de secours **`groundOnly` (aucune touffe 3D)**.

**Point essentiel :** attribuer un **budget global à la végétation et aux détails** ; ne pas dégrader le rendu d'horizon sans brouillard pour préserver de l'herbe facultative.

## Campagne ENV — météo, astres et ombres : mesures à réaliser

La [spécification 19](19-ENVIRONMENT-WEATHER-SKY.md) prescrit **ENV-0…ENV-7**, avec un ciel à faible coût (jour/nuit, étoiles, lunes indépendantes, nuages), neige par masques et ombres dynamiques limitées.

**Scènes comparables** : midi clair, aube/coucher, nuit étoilée avec 1 puis 2 lunes à phases différentes, ciel couvert, pluie, tempête, neige + terrain/toits/sapins enneigés, fog météorologique actif/inactif, planage au-dessus d'une forêt/village, panorama de montagne, foule simulée.

**Variantes isolées** : pas d'ombres / ombres 512² / ombres 1024² ; pluie 0/peu/beaucoup ; ciel fixe/shader ; neige terrain seulement/arbres/toits/horizon ; nuages 1/2 couches. Comparer à graine, caméra, scène, résolution et trajectoire identiques.

**Cibles expérimentales non mesurées** : CPU météo **< 0,2 ms/frame**, GPU ciel/particules **< 1 ms/frame hors ombres**, **1–4** draw calls supplémentaires hors shadow pass et **1–4 Mio** de textures/buffers météo hors shadow map. Les **shadow maps ont un budget distinct**, parce que leur coût est dépendant des casters/draw calls additionnels/texels.

**Mesurer** frame p50/p95/p99, shadow pass calls, nombre de casters/receivers, coût CPU/GPU des shaders et particules, overdraw, uploads, recompilations de shaders, popping de l'horizon, neige sur proxies. Vérifier mode shadow OFF et menu bêta sans état persistant involontaire. **Ne pas revendiquer les cibles avant des tests sur GPU intégré réel.**

## Campagne BL — coûts des imports Blender, presets et cartes

**Spécification à mettre à l'épreuve :** [20 — Échange Blender ↔ Studio](20-BLENDER-STUDIO-INTERCHANGE.md).

Tester **assets simples, prefab composite, ruine à 100 copies, village, massif de végétation et zone heightfield**. Distinguer coût en **édition/import/compilation** du coût **runtime** après mutualisation GLB, LOD et instancing ; un export compact n'est pas automatiquement rapide à charger.

**Mesures** : poids total/transféré initial et par secteur, textures et mémoire GPU, nombre de matériaux/meshes/draw calls, triangles, temps de décodage glTF/texture, allocations/GC, latence import/aperçu, fluidité des gizmos, vitesse d'export/import ZIP et recompilation locale. Mesurer **avant/après réutilisation d'un même prefab** et après simplification des LOD, à scène/résolution identiques.

**Gate** : la carte 10 × 10 km ne précharge ni tous ses GLB ni son zip auteur au spawn ; archives portables utilisables hors ligne ; import ZIP/GLB non fiable borné en mémoire et temps ; **30/20 FPS** visés sur PC GPU intégré seulement après mesures, pas supposés. Les sources `.blend` et archives de projets ne figurent pas dans le bundle client jouable.

## Campagne WAT — océan plein écran, rendu immergé et LOD

Référence : [21 — Eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md). Comparer **rive, rivière, cascade proche/lointaine, lac, embouchure, bateau, caméra sous-marine, planage sur vaste océan** à scène/graine/résolution/caméra identiques.

**Variantes d'essai** :
- surfaces eau actuelle translucides vs surface **opaque stylisée** avec profondeur précalculée et transparence **locale** ;
- effets près (vagues, écume, sillages) **ON/OFF**, LOD0/1/2/3, transition caméra, océan en patches/anneaux ou géométrie sectorisée ;
- shader eau proche vs shader **lointain réellement simplifié** ; nombre de triangles **et coût fragmentaire/fill-rate**, alpha overdraw et multiplicité des surfaces ;
- scènes couplées au ciel, météo, neige, arbres, PNJ et horizons du monde.

**Cibles d'essai non mesurées** : CPU eau récurrent **< 0,1–0,2 ms/frame hors compilation**, GPU eau supplémentaire **< 0,5–1 ms** en scène représentative si possible ; **ces chiffres ne garantissent rien pour une mer plein écran**. Ne pas remplacer le benchmark GPU par un simple compteur de triangles.

Mesurer **temps CPU de compilation/streaming**, GPU si timer disponible, frametimes p50/p95/p99, draw calls/matériaux par LOD, surcouches transparentes, textures/transferts, courants/nage/bateau inchangés et horizon sans fog-cache. **Budget partagé** avec météo, herbes, terrain et ombres.

## Campagne PERF — mesures et gates pour le budget global

Le document [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) prescrit un **contrôleur unique** utilisant les systèmes déjà existants : `src/frame-clock.ts::PresentationBudget` (0–2, 3 s de surcharge / 12 s de marge, 30→20 FPS), `src/main.ts` (DPR 1 / 0,8 / 0,65), `src/terrain-view.ts` (cache borné mais pas compté en octets, **deux** constructions max par update), `src/ecology.ts` et LOD PNJ.

**Mesures distinctes** : temps **mur** entre frames présentées, `simCpuMs`, `updateCpuMs`, `renderSubmitCpuMs`, p50/p95/p99, longues frames >100 ms, calls/triangles, pending queue/chunks, octets **estimés** CPU/GPU, GPU timers uniquement via mesure WebGL **asynchrone et valide**. `renderSubmitMs` actuel **n'est pas la durée GPU**, `renderer.info.memory` mesure des **comptes**, pas la VRAM.

**Scènes et trajectoires** : vallée, village de prefabs, forêt/herbe/PNJ, océan plein écran (rive, bateau, planage, plongée), îles/montagnes/horizon, cascade et neige/orage, traversées rapides/retours/téléportation, Studio avec nombreux assets, session longue cache/GC.

**Protocole** :
1. Même `seed/caméra/trajectoire/résolution/contenu/navigateur/commit` ; comparer modes **qualité fixe** et **adaptatif** avec suivi des changements de niveau.
2. Séparer gains réels du code à rendu égal, baisse de qualité volontaire et surcharge/erreur de cadence du navigateur. **SwiftShader ≠ GPU intégré** ; refaire le gate sur matériel réel.
3. Vérifier p95/p99, perte/restauration du contexte, file de streaming et latence de l'édition, **non-régression 30 Hz logique**, pas de trou d'horizon et absence de dispose prématuré sur GLB partagé.
4. Seuils de mémoire, LOD et quota génération **non figés** sans mesure. Les objectifs actuels **30/20 FPS, ≈200 Mio GPU estimés, ≈250k triangles** restent provisoires.

**PERF-0…PERF-9** : audit → sampler → contrôleur unique → adaptateurs → registre mémoire → scheduler → LOD/anticipation → panel bêta → benchmarks → qualification release.

## Campagne AUD — polyphonie MIDI, échantillons et coût audio

La [spécification 23](23-MIDI-AUDIO-LOW-RESOURCE.md) définit **5–10 patches musicaux**, un **synthétiseur Web Audio partagé** et un **lecteur d'échantillons** peu nombreux, avec `AudioBudgetManager` sous PERF.

**Scénarios de mesure reproductibles** : aucune lecture → 1/5/10 patches présents, puis **0/8/16/24 voix réellement actives** ; musique MIDI seule, notes courtes/longues, 1–2 couches de biotope, cascade/rivière/pluie, 100 émetteurs virtuels vs 2/4/6 audibles ; passage forêt/côte/nuit/orage, plusieurs reprises onglet.

**Mesures** : latence de démarrage/unlock, notes manquées/accumulées, glitch et clicks audible/test enregistré, compteur voix/nœuds/Panner, CPU audio **si profiler le permet**, temps JS de scheduling/décodage, PCM estimé par nombre de canaux/frames (48 kHz mono Float32 ≈192 ko/s), poids compressé réseau, mémoire après plusieurs changements de biome.

**Cibles expérimentales, non validées** : **12/16/24 voix totales**, **6–8/10–12/12–16 notes musicales**, **2/4/6** sources 3D, **2–4/4–8/8–16 Mio de PCM décodé** (Eco/Équilibré/Qualité). La palette de **5–10 instruments ne change pas** avec le mode qualité : seule la polyphonie/les effets diminuent.

**Ne pas inventer de CPU audio en ms à partir du FPS** ; rendu/WebGL et traitement Web Audio ne sont pas le même budget. Mesurer sous Firefox/Chromium et sur PC réel ; sous SwiftShader, seuls certains aspects fonctionnels/latence sont informatifs. Aucune SoundFont GM entière nécessaire.

**Gates AUD-0…AUD-8** : audio engine → MIDI → synth/voice pool → sample player → spatial/ambience → budgets PERF → UI/ZIP Studio → qualification matérielle.

## Suite prioritaire

1. Réduire les appels du personnage et regrouper les sous-meshes statiques par matériau/articulation, puis mesurer sur les mêmes scènes.
2. Profiler séparément CPU et GPU sur PC ; comparer moteur seul et contenu enrichi avec des interrupteurs de benchmark explicites.
3. Étendre la forêt et les objets statiques avec le même registre spatial, ajouter des LOD du bâti et de la végétation principale.
4. Déplacer les calculs coûteux de relief vers un worker ou la compilation statique après profilage.
5. Tester mémoire et réactivité de l’éditeur chargé, longues traversées et renouvellement des caches.

Aucun objectif de performance chiffré n’est considéré atteint sur matériel utilisateur.
