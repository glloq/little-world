# 22 — PERF : ResourceBudgetManager transversal et budgets LOW-RESOURCE

**Cadrage du 12 novembre 2026, approuvé pour documentation et préparation du développement.**
Objectif : permettre à Little World de représenter une carte continue (plafond de format 10 × 10 km), de belles vues jusqu'à l'horizon **sans brouillard de camouflage**, de l'eau, une météo complète, de la végétation, des PNJ et des lieux Blender, avec un **coût CPU/GPU/RAM/download stable**, sur un PC à GPU intégré, puis dans une déclinaison mobile si viable.

**Cible : 30 FPS de présentation normalement, secours à 20 FPS, simulation joueur à pas fixe 30 Hz indépendante ; ce sont des exigences à mesurer, pas des performances promises.** Les ressources s'ajustent **sans réduire la géographie du monde, sans couper ses silhouettes lointaines et sans changer les règles de gameplay**.

**Statut : contrat d'architecture et plan PERF-0…PERF-9, non implémenté dans le code par ce document.** Le prototype possède déjà `FrameClock`, `PresentationBudget`, `presentationPixelRatio`, caches de terrain, instancing écologique, LOD PNJ et métriques. **Les faire évoluer sans deuxième régulateur concurrent.**

Références : [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [07 — Roadmap](07-ROADMAP.md), [09 — Tests](09-BROWSER-TEST-PLAN.md), [10 — Performance et benchmarks](10-PERFORMANCE-ROADMAP.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md), [16 — Réseau futur](16-FUTURE-MULTIPLAYER.md), [17 — Profondeur de vue](17-DISTANT-VIEW-RENDERING.md), [18 — Herbe](18-GRASS-LOW-RESOURCE.md), [19 — Environnement](19-ENVIRONMENT-WEATHER-SKY.md), [20 — Blender](20-BLENDER-STUDIO-INTERCHANGE.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

## 1. Objectifs, invariants et anti-objectifs

1. **Un seul arbitre** `ResourceBudgetManager` décide des niveaux de qualité et des quotas globaux ; les **sous-systèmes restent propriétaires** de leur rendu, cache et logique. Interdire des boucles adaptatives contradictoires (`PresentationBudget` parallèle au nouveau manager).
2. **Observabilité honnête** : durée des callbacks, cadence réelle, simulation CPU, mise à jour CPU, soumission WebGL CPU, draw calls/triangles, caches/queues, éventuellement durée GPU si supportée. Le temps de `renderer.render()` mesuré en JS **n'est pas la durée GPU** ; `renderer.info.memory` compte des objets, **pas les octets VRAM**.
3. **Limiter les pics**, pas seulement la moyenne FPS : p50/p95/p99, longues images >100 ms, GC, compilation shader, upload de buffers, changement de secteur, import GLB et réinitialisation de ressources.
4. **Conserver les invariants gameplay** : horloge/simulation stable, entrée immédiate, position et volume d'eau corrects, collisions, bateau, dialogues, interactions et états persistants. Les PNJ éloignés peuvent avoir une cadence logique réduite **suivant la politique gameplay déjà établie**, mais une baisse du FPS ne doit ni changer les règles ni perdre un événement.
5. **Vue lointaine préservée** : réduire uniquement le détail et les animations inutiles des îles, relief, bâtiments remarquables, océans et cascades distants ; **jamais remplacer une géométrie approchable par du brouillard-cache**.
6. **Adaptation douce** : baisse contrôlée, remontée plus lente, hystérésis et cooldown ; ne pas changer les shaders/LOD/résolution à chaque frame. Toute intervention doit avoir **un motif diagnostique** et être réversible.
7. **Budget unifié mais non arbitrairement partagé** : terrain, eau, végétation, météo, ombres, PNJ, assets, audio, Studio et futures foules demandent des budgets ; réserver la priorité aux éléments nécessaires. Le manager pilote les **plafonds** ; chaque système décide comment les respecter.
8. **Source Studio V3 indépendante des performances** : LOD, qualité et caches sont dérivés et locaux. Le projet/ZIP ne stocke pas l'état adaptatif de l'appareil qui le consulte.
9. **Pas de dépendance serveur, SaaS ni collecte télémétrique distante** dans le solo. Diagnostics locaux et export de benchmark contrôlé par l'utilisateur.
10. **Ne pas ajouter Worker, WebGPU, occlusion GPU, compression universelle ou framework complexe avant preuve de nécessité.** Commencer par les mécanismes Three.js et TypeScript existants.

## 2. Audit des mécanismes réels sur `main`

**Observation du code le 12 novembre 2026 ; ces faits n'attestent pas un gate matériel réussi.**

| Élément déjà présent | Contrat actuel | À faire évoluer |
| --- | --- | --- |
| `src/frame-clock.ts::FrameClock` | Pas de simulation **1/30 s**, présentation 30/20, accumulateur et rattrapage plafonné | Le **garder** propriétaire de l'horloge et de la cadence, sans nouveau RAF |
| `src/frame-clock.ts::PresentationBudget` | Niveaux `0–2`, baisse après **3 s** de surcharge, remontée après **12 s** de marge, 30 → 20 FPS | **Migrer** vers contrôleur/compatibilité unique PERF ; pas de deux automates adaptatifs |
| `presentationPixelRatio` + `src/main.ts` | Ratio au plafond appareil/utilisateur × **1, 0,8 ou 0,65** ; modes low/medium/high | Exposer mode **Auto**, plafond et état courant ; mesurer vrai pixel ratio/framebuffer |
| `src/main.ts::draw` | Boucle sim, mise à jour, `renderer.render`, métriques optionnelles `littleWorldMetrics`, `budget.observe(cost, wallDrawDelta)` | Découper métriques correctement ; éviter d'assimiler temps JS total à temps GPU |
| `src/chunks.ts::planChunks` | Terrain LOD 0/1/2 selon distance à chunk, hystérésis ; distance configurable | Ajouter à terme taille projetée/importance, anticiper direction/planage, préserver les silhouettes |
| `src/terrain-view.ts` | Géométrie cache bornée, **deux constructions max par update**, éviction LRU approximative, `dispose()` | Budget **temps CPU + octets estimés**, files priorisées, admission/cancellation ; pas seulement nombre de meshes |
| `src/ecology.ts` | Instances par secteur, apparition locale, un secteur construit par mise à jour, `setDetail` | Consommer un budget commun ; végétation/herbe cosmétique sacrifiable avant visibilité lointaine |
| `src/npc.ts` / `npc-view.ts` | Logique PNJ à cadence adaptée, rig proche/silhouette lointaine | Maintenir l'état logique indépendant de la qualité de rendu ; choisir le LOD par importance et charge |
| `src/world.ts` | Caches partagés géométrie/matériaux, instances de forêt, `GLTFLoader`, promesses de GLB, `dispose` | Registre d'**ownership/refcounts** GLB/texture/geometry, ressources partagées, cache à capacité contrôlée et requêtes obsolètes |
| `src/editor.ts` | `FrameClock` mais rendu à boucle continue, pixel ratio fixé à ≤1,35 | Rendu **à la demande si idle**, rendu interactif/preview et tâches de compilation séparés |
| `tools/benchmark-world.mjs` | Scénarios Chromium/SwiftShader, métriques présentées, tests à qualité donnée | Ajouter scènes lourdes et baselines matérielles ; durée GPU **si** extension disponible ; tests d'oscillation et mémoire |

**Constats prioritaires :**
- `renderer.info.render.calls/triangles` est utile, mais **nombre de draw calls ≠ temps GPU** ; `renderer.info.memory.geometries/textures` n'est pas une mesure d'octets.
- Le compteur `renderSubmitMs` est **CPU pour soumettre les commandes** ; WebGL est asynchrone. S'il est utilisé pour une décision GPU, signaler `gpuTimeMs=null`.
- Le cache de terrain limite des **enregistrements**, pas la mémoire réelle ; un chunk LOD0 et un LOD2 n'ont pas le même coût.
- Le chargement de **deux meshes de terrain par mise à jour** peut produire un pic si les deux sont coûteux ; la limite doit tenir aussi compte du **temps de travail** et de l'urgence.
- Les **GLB chargés et clonés** ont des géométries/matériaux mutualisés ; leur suppression ne doit **pas** libérer une ressource encore référencée par d'autres instances.
- Les boucles d'éditeur et de jeu n'ont pas exactement les mêmes besoins : préserver la réactivité d'un gizmo ou d'un pinceau tout en évitant de rendre continuellement un plan statique.

## 3. Architecture cible : un arbitre, des services indépendants

```text
FrameClock / fixed-step simulation ──► PerfSampler ◄── WebGLRenderer.info
          │                                  ▲
          │                                  ├── GPU timer ASYNCHRONE (optionnel)
          │                                  ├── ResourceRegistry (estimations)
          │                                  └── WorkScheduler (files/durées)
          ▼
     FrameTelemetry ───────────────────► ResourceBudgetManager
                                               │
                                       QualityBudgetSnapshot
                                       (versionné, readonly)
                                               │
                   ┌─────────────┬─────────────┼──────────────┬───────────────┐
                   ▼             ▼             ▼              ▼               ▼
                Renderer     Terrain/LOD     Ecology/GR     Water/ENV      NPC/Assets
              pixel ratio     + horizon     + Shadow       + FX             + Audio
                   │             │             │              │               │
                   └─────────────┴─────────────┴──────────────┴───────────────┘
                                               │
                                         Studio/debug panel
```

**Répartition précise :**
- `PerfSampler` collecte des chiffres **par frame présentée**, évite les allocations inutiles, étiquette l'origine des mesures et fournit des fenêtres temporelles.
- `ResourceBudgetManager` n'instancie pas de `Mesh` et ne gère aucun `texture.dispose()` ; il **élabore une politique**, les plafonds et les causes de dégradation.
- `ResourceRegistry` conserve l'ownership et les estimations de ressources partagées ; il n'est **pas** une API de télémétrie GPU réelle.
- `WorkScheduler` contrôle la dépense de création/compilation/décodage/upload par frame et la priorité des tâches ; intégrable progressivement aux constructeurs existants.
- Les **consommateurs** implémentent `applyQualityBudget(snapshot)` ou un adaptateur equivalent ; ils gardent leurs caches, LOD, shaders et invariants.
- Un **seul** `QualityBudgetSnapshot` est publié lors d'un changement pertinent. L'accepter comme **plafond**, pas comme commande de refaire tous les meshes.
- Les hooks de qualité ne doivent pas générer un travail de recompilation global : **diff de valeurs**, invalidation locale, opérations réparties.

**Éviter le surdesign** : au premier incrément, `PerfSampler`, `ResourceBudgetManager` et quelques adaptateurs suffisent. Séparer registre/scheduler en modules seulement quand l'audit a montré une responsabilité réelle.

## 4. Contrats TypeScript indicatifs (non encore API publiée)

```ts
type UserQuality = "auto" | "eco" | "balanced" | "quality";
type PerfMode = "normal" | "saving" | "emergency";
type Cause = "gpu" | "cpu" | "memory" | "streaming" | "unknown";

interface FrameSample {
  atMs: number;                 // performance.now, horloge MONOTONE locale
  presentationIntervalMs: number; // écart entre frames réellement présentées
  simCpuMs: number;
  updateCpuMs: number;
  submitCpuMs: number;          // NE PAS appeler gpuMs
  gpuElapsedMs: number | null;  // extension dispo, disjoint vérifié, lecture asynchrone
  drawCalls: number;
  triangles: number;
  activeChunks: number;
  queuedWork: number;
  longFrame: boolean;
  visibility: "visible" | "hidden";
}

interface PerfWindow {
  windowSeconds: number;
  count: number;
  frameIntervalP50Ms: number | null;
  frameIntervalP95Ms: number | null;
  frameIntervalP99Ms: number | null;
  simCpuP95Ms: number | null;
  renderSubmitCpuP95Ms: number | null;
  gpuP95Ms: number | null;
  gpuSamplesValid: boolean;
  longFrameCount: number;
  estimatedGpuBytes: number | null;
  estimatedCpuCacheBytes: number | null;
  queuedUrgent: number;
}

interface QualityBudgetSnapshot {
  version: number;
  mode: PerfMode;
  userCeiling: UserQuality;
  targetRenderFps: 30 | 20;
  internalResolutionScale: number;  // multiplicateur du DPR effectivement plafonné
  terrainDetail: 0 | 1 | 2;         // plafond LOD local, NON suppression d'horizon
  objectDetail: 0 | 1 | 2;
  vegetationDetail: 0 | 1 | 2;
  grassProfile: "groundOnly" | "ultra" | "balanced" | "dense";
  shadowProfile: "off" | "near512" | "near1024";
  waterProfile: "minimal" | "balanced" | "enhanced";
  precipitationProfile: "off" | "minimal" | "balanced";
  maxDetailedNpcViews: number;      // rendu seulement
  prefetchRadiusScale: number;      // ne peut pas rendre un collider proche indisponible
  buildCpuBudgetMs: number;         // quotas pour tâches NON critiques
  maxGpuUploadsPerFrame: number;    // quota initial, à affiner par taille/temps
  cacheSoftLimitBytes: number;      // estimations, pas mesure VRAM réelle
  reason: Cause;
}

interface QualityConsumer {
  readonly subsystemId: string;
  applyQualityBudget(next: Readonly<QualityBudgetSnapshot>): void;
}

interface PerfController {
  observe(sample: FrameSample): void;
  evaluate(nowMs: number, window: PerfWindow): Readonly<QualityBudgetSnapshot> | null;
  setUserCeiling(quality: UserQuality): void;
  resetAfterVisibilityChange(): void;
}
```

**Type de données distinct des schémas Studio :** ce snapshot est **runtime et appareil-dépendant**, non écrit dans `WorldDefinitionV3`. On peut sauver la **préférence utilisateur**, mais pas les décisions adaptatives instantanées. Les nombres du modèle sont des champs d'exemple, pas des limites définitives.

**Propriété des valeurs :** `FrameClock` continue de choisir *quand* mettre à jour la simulation et rendre ; `ResourceBudgetManager` conseille le taux de présentation, le plafond de résolution et les budgets ; les modules choisissent leurs objets et clips compatibles avec ces contraintes.

## 5. Échantillonnage et diagnostic fiables

**Distinguer quatre temps** :
- `presentationIntervalMs` : temps **mur** entre deux frames effectivement affichées/présentées ; inclut ordonnancement du navigateur et d'autres facteurs.
- `simCpuMs` : pas fixes réellement exécutés, par frame RAF, y compris frames non rendues ; le coût de simulation ne doit pas être perdu lorsque `frame.render === false`.
- `updateCpuMs` et `submitCpuMs` : travail JS et soumission WebGL (CPU), sans prétendre que la soumission est la consommation GPU.
- `gpuElapsedMs` : **facultatif**, lu en différé via `EXT_disjoint_timer_query_webgl2` si exposé ; contrôler `GPU_DISJOINT_EXT`, disponibilité et destruction des queries. **Ne pas appeler `gl.finish()` pour mesurer** en temps normal et ne pas bloquer la frame en attendant une mesure.

**Règles d'échantillonnage :**
- Compteurs de base une fois par frame rendue ; **fenêtre glissante de plusieurs secondes** et statistiques p50/p95/p99 sur des échantillons bornés (ring buffer préalloué).
- Enregistrer p95/p99 des intervalles mais **ne pas comparer directement un intervalle 20 FPS avec un budget 30 FPS** : normaliser contre le **taux réellement choisi**.
- Retirer des décisions la phase de démarrage, le chargement initial volontaire, **redimensionnement, changement d'onglet, arrêt/retour de focus, écran de pause, timer disjoint, longue suspension** ; conserver ces événements comme diagnostics distincts.
- Conserver `renderer.info.render.calls/triangles` et `memory.geometries/textures` avec étiquettes « compteurs », non estimation VRAM ; pour les **multipasses**, configurer `renderer.info.autoReset` et `reset` sur une fenêtre de frame **seulement si** les passes l'exigent.
- Enregistrer résolution CSS, résolution interne réelle, DPR, caméra/vitesse/altitude, profile qualité, densité/LOD et statut des files.
- **Limite de charge du diagnostic** : HUD résumé rafraîchi environ 1 Hz ; instrumentation approfondie et trace détaillée uniquement sous option bêta.
- **Pas de télémétrie distante** par défaut : scénario reproductible exportable localement, avec anonymisation des chemins/personnages du projet au besoin.
- **Sensibilité aux erreurs** : pas de décision à partir d'un GPU timer absent ou de `performance.memory` non portable ; rapporter `unavailable` plutôt qu'inventer zéro ou des octets « exacts ».

**Références d'API à relire avant implémentation** :
- Three.js `WebGLRenderer.info` (draw calls, triangles, nombres de ressources) : https://threejs.org/docs/pages/WebGLRenderer
- MDN `EXT_disjoint_timer_query` / WebGL2 : https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query_webgl2

## 6. Budget de frame et décision adaptative

**30 FPS** = ~33,33 ms entre frames, **20 FPS** = 50 ms ; ces temps sont des contraintes de présentation, **pas** des temps de CPU disponibles à dépenser entièrement. La cadence du navigateur et l'overlap CPU/GPU empêchent de simplement additionner `cpuMs+gpuMs` et de considérer le résultat comme la durée réelle.

### Politique d'état

| État | Entrée | Sortie / comportement |
| --- | --- | --- |
| `normal` | Charge basse et files sous contrôle | Restaurer lentement les détails dans les plafonds du profil utilisateur |
| `saving` | Surcharge répétée ou pression du streaming/mémoire | Réduire **un levier à la fois** et mesurer son effet, conserver l'horizon |
| `emergency` | Blocage de frames soutenu, allocations/queues hors limites ou risque de perte de contexte WebGL | Qualité minimale temporaire, pause des tâches non critiques, coupes cosmétiques ; gameplay et rendu essentiel conservés |

**Cadences initiales indicatives :**
- Observer le rendu sans allocation importante chaque frame, **évaluer** le budget ~**1 Hz** avec un échantillonnage glissant.
- Baisser après **≈3 s** de surcharge durable, restaurer après **≈12 s** de marge (politique existante) ; après un changement, **cooldown** et nouvelle fenêtre de mesure avant l'action suivante.
- Éviter le ping-pong avec seuils différents à la baisse et à la hausse, au plus **un cran par période de décision** ; les valeurs définitives seront issues de benchmarks.
- La surcharge détectée **CPU** oriente d'abord les tâches/LOD/animation secondaires ; une surcharge **GPU** identifiée oriente d'abord résolution/shaders/ombres. Lorsque cause indéterminée, commencer par le **levier réversible** le moins nuisible et comparer la fenêtre suivante.
- L'**échelle interne** baisse avant le passage 30→20 FPS, conformément à la politique 11. Le passage 20 FPS est **dernier recours**, sans changement de vitesse logique.
- **Profil manuel** = plafond demandé pour la qualité, **pas obligation de sacrifier la stabilité** ; en mode strict pour tests (bêta uniquement), désactiver l'autoadaptation et afficher la surcharge.
- Limiter les décisions de changement de variant shader aux transitions **précompilées et peu fréquentes** pour éviter les compilations en plein jeu.

**Ordre initial de dégradation, adaptable selon goulot** :
1. Diminuer **résolution interne** en étapes mesurées si GPU/fill-rate ou cause inconnue, tout en gardant UI texte/contrôles nets.
2. Couper éclaboussures, pluie/neige cosmétique, petites particules, effets secondaires et herbe haute éloignée ; conserver ciel/jour/nuit, sol et eau nécessaires.
3. Réduire objets de détail et LOD d'arbres/ruines, eau/océan shader lointain, PNJ **visuels** secondaires, fréquence d'animation non pertinente.
4. Réduire casters/portée/résolution d'**une shadow map locale**, puis OFF ; jamais créer des lumières/ombres pour chaque lune ou objet.
5. Réduire budget de génération non critique, replanifier préchargements ; si la **mémoire** est en cause, **évincer en priorité caches non actifs** et réduire qualité des ressources futures.
6. Si la cadence reste impossible, **20 FPS de présentation**, simulation inchangée ; éviter des rafales de transitions de niveau lors du basculement.
7. **Interdits à toutes les étapes** : retirer la silhouette d'une île du panorama par brouillard, réduire la précision des collisions proches, ignorer les interactions, supprimer les données de biome/eau/PNJ, modifier physiquement l'eau selon le LOD.

Une baisse de résolution doit être mesurée en **nombre réel de pixels** et qualité de l'interface ; si le GPU ne semble pas en cause, sa réduction n'aura pas forcément d'effet. Le cap du DPR propre à l'utilisateur reste respecté.

## 7. Priorité d'écran, LOD et objets importants

**Ne pas choisir uniquement par distance métrique.** Les critères possibles, évalués par index spatial et non par scan global à chaque frame :
- **taille projetée à l'écran / erreur de silhouette** en pixels, avec seuils par famille ;
- distance, cône de vision, frustum et opportunités simples d'occlusion **CPU** si prouvées rentables ;
- altitude et vitesse/direction de déplacement (planage, bateau) pour anticiper les secteurs devant le joueur ;
- importance sémantique : joueur, PNJ interactif, entrée/porte, pont, destination, maison, monument, silhouette de falaise ;
- visibilité de la météo, chute d'eau ou océan couvrant beaucoup de pixels ; **fill-rate** avant nombre de triangles lorsque pertinent ;
- hystérésis, saison/biome, priorité du Studio à une sélection en cours.

**Ce qui demeure en vue lointaine :** îles/montagnes/côtes, grandes constructions repérables, océan/cascades simplifiés et horizon sans brouillard. **Ce qui s'efface** : touffes, petites fleurs, gouttes, écume, accessoires minuscules, rig/animation de PNJ éloigné, petites ombres.

**Objectifs de comportement** :
- changer de LOD **sans changement d'identité/position d'entité ni déclenchement de physique** ;
- ne pas calculer l'erreur projetée précise de millions d'objets chaque frame : **culling hiérarchique**, classes d'importance et caches des résultats, mises à jour seulement sur changements significatifs ;
- prévoir **garde anti-popping** : seuils/hystérésis, préchargement du LOD requis avant bascule, fallback visible si retard ;
- rendre les grands ensembles/instances **par groupes spatiaux** assez petits pour un culling efficace (éviter un `InstancedMesh` géant monolithique non cullable).
- les règles du Studio pour les **repères d'importance** sont des données auteur ; les distances/LODs effectifs demeurent du rendu runtime.

## 8. ResourceRegistry : mémoire, partage et cycle de vie

**Objectif : ne pas faire de faux « mètres VRAM ».** Trois compteurs séparés :
1. **Mémoire CPU connue ou estimée** : `ArrayBuffer`, géométries source, données cache, image décodée si observable, structures JS (approximation).
2. **Mémoire GPU estimée** : attributs/index de géométries, textures internes selon formats/mipmaps/compression, render targets/MSAA éventuels et buffers d'instances. **Estimation**, avec incertitude et allocations driver/Three.js non observables.
3. **Quantité de ressources et références** : `resourceId`, `kind`, `sizeEstimateBytes`, `ownerIds`, `refCount`, `pinned/active`, `lastUsed`, `pendingDispose`.

**Règles de propriété** :
- Ressource partagée GLB (geometrie, matériau, texture) comptabilisée **une seule fois** pour le budget mémoire même si clonée dans 500 objets.
- `dispose()` uniquement lorsque le **dernier propriétaire** a libéré sa référence, aucune tâche de chargement en attente ne peut réanimer un monde retiré.
- **Caches par secteur avec limites souples/dures** : actif/pinné pour collision/rendu proche, résidents récemment utilisés évincés en premier, sources rééditables conservées ailleurs (IndexedDB/fichiers) indépendamment des objets GPU.
- Si limite **soft** atteinte : éviction LRU des éléments non actifs ; si limite **hard** estimée atteinte : arrêter admission de caches non critiques, élargir éviction, réduire nouveaux LOD/ressources et remonter l'alerte. **Ne jamais libérer un Mesh encore utilisé**.
- Enregistrer **l'origine** : terrain, asset, eau, végétation, personnages, shadow, météo, Studio preview ; bilan par catégorie pour diagnostic.
- Les contraintes liées à **WebGL context lost/restored** doivent être testées : conserver/recharger les sources nécessaires, restaurer shaders/buffers et les registres, ne pas considérer un reset GPU comme succès de performance.
- Ne pas lire une API navigateur de mémoire comme vérité : `performance.memory` n'est pas portable, `navigator.deviceMemory` n'est qu'un indice approximatif s'il existe.

**Ordre des travaux mémoire** : instrumenter les caches **déjà présents** ; introduire ensuite un registre de propriété sur les GLB/texture avant de remplacer tous les caches. Ne pas ajouter une copie complète de tout le monde dans le registre.

## 9. WorkScheduler : éviter les saccades de génération et streaming

**Une opération ≠ un coût fixe.** « Deux chunks par frame » ne protège pas contre un chunk très coûteux ou deux imports GLB simultanés.

**Classes de priorité** :
- **P0 — Critique** : collisions et terrain à portée immédiate, input, commande d'interaction, éléments déjà attendus par la simulation. Doivent disposer d'un fallback fonctionnel et sont traités **sans bloquer un frame entier** si génération lourde.
- **P1 — Visible/proche** : géométrie dans le frustum ou prochain secteur devant le joueur, LOD requis, objets de navigation utiles.
- **P2 — Prédictif** : secteurs vers lesquels va le joueur, trajets probables de bateau/planage, preload d'assets de lieux, shaders connus si précompilation rentable.
- **P3 — Opportuniste** : panorama secondaire, cache lointain, mipmaps/LOD futurs, imports ou miniatures de Studio non urgents.

**Contrat de tâche indicatif** :
```ts
interface BudgetedJob {
  id: string;
  sourceVersion: number;                // invalider après édition/reset
  priority: 0 | 1 | 2 | 3;
  estimatedCostMs?: number;             // appris/ajusté, jamais garantie
  estimatedAllocBytes?: number;
  cancellable: boolean;
  runSlice(budgetMs: number): "done" | "yield" | "cancelled";
}
```

**Scheduling** :
- Coût CPU résiduel alloué aux tâches **non critiques** à partir d'un quota par frame, **pas** du temps de simulation; charge GPU/upload gérée séparément car `buffer upload` peut avoir un coût non reflété par `performance.now()`.
- Commencer avec **quantité max + temps max** (par exemple quota CPU `1–2 ms de travail non critique` et au plus une ou deux créations), **valeurs provisoires**, puis adapter selon mesures. Replanifier les tâches non urgentes plutôt que tout exécuter au même moment.
- **Découper les tâches coûteuses** en étapes coopératives ; si l'étape de géométrie est monolithique et reste longue, envisager un Web Worker **seulement après mesure**. Les tâches GPU/render restent sur le contexte approprié.
- Prioriser selon position prédite + marge d'avance, sans sur-précharger derrière le joueur ; limiter IO et décompression simultanés, nombre de fetch et cache.
- Invalidation/cancel : changement de monde, modification terrain, remplacement d'un asset, téléportation, changement de priorité. Chaque résultat porte `sourceVersion` ; une tâche obsolète ne doit pas publier un mesh après la destruction de la carte.
- Éviter famine : temps d'attente maximum des tâches P2/P3 et reprise lorsque P0/P1 se calment, mais **pas au prix d'une collision manquante**.
- **Fallback** : conserver le dernier mesh valide ou un LOD/proxy simple jusqu'à la construction du nouveau ; aucun trou d'horizon.
- Studio : pinceau/gizmo instantané, compilation incrémentale en tâche différée, annulation/rollback et conservation de l'édition auteur.

## 10. Décomposition par système : budgets adaptables

| Système consommateur | Commandes de qualité/budget | À ne jamais toucher |
| --- | --- | --- |
| **Renderer & caméra** | DPR/résolution interne, cadence 30/20, quality shader variant stable | Positions, input, caméra logique, UI floue |
| **Terrain & horizon** | Erreur projetée LOD, distance de détail, build quota, cache mémoire, streaming directionnel | Limites géographiques, silhouettes approchables, collisions |
| **GLB/prefabs** | Instances par zone, variantes de LOD, seuil petit objet, cache textures/asset | IDs, transforms, scripts déclaratifs, objet sélectionné |
| **Herbe/végétation** | `groundOnly`→dense, densité visible, vent, distances, nombre d'instances | Biotope source, changements persistants, silhouette forêt à distance |
| **Ombres** | OFF / 512 / 1024, rayon, nombre de casters prioritaires, cadence dirty flags | Éclairage diurne de base |
| **Eau & océan** | LOD0–3, vague locale, écume, transparence, shader lointain opaque | Réseau, niveau, nage/plongée, bateau, courants |
| **Météo / ciel** | particules pluie/neige, couches de nuage, reflets cosmétiques, effets d'orage | Horaire, lumière lisible, étoiles/lunes correctes, neige accumulée |
| **Joueur, PNJ et faune** | rigs visibles, silhouettes, animation secondaire, cadence faune purement cosmétique | Simulation joueur, interactions, dialogues et état logique pertinent |
| **Audio** | nombre voix/sources, spatialisation simplifiée, distance | Indices de gameplay nécessaires et sons critiques |
| **Studio** | rendu à la demande, preview LOD, cache de miniatures, tâches d'export/import et compilations différées | Undo/Redo, sélection, précision auteur, sauvegarde intègre |
| **Futur réseau** | adapter rendu des avatars/foules localement sans envoyer le LOD de détail | Autorité serveur et cadence des événements critiques |

**Un moteur d'eau ne règle pas seul ses ombres/particules indépendamment du budget global**. Chaque système déclare un **coût courant estimé**, ses **leviers disponibles** et sa **qualité minimale sûre**. Un domaine peut ne pas proposer de levier sans bloquer le manager.

## 11. Profils utilisateur, mode Auto et Studio

**Interface joueur normale** :
- `Auto` **par défaut** : sélection initiale prudente et adaptation progressive.
- `Éco`, `Équilibré`, `Qualité` : plafonds de qualité **révisables pour stabilité** ; un « mode forçage strict » n'existe qu'en bêta.
- Résolution interne / limite FPS avancés seulement si nécessaire ; ne pas exposer les dizaines de microparamètres en écran de jeu.
- UI texte/menus **à résolution native** lorsque possible, même si la scène 3D est rendue plus bas.

**Bêta → panneau « Ressources / Performance »** :
- Onglets compacts **Résumé**, **Qualité/LOD**, **Chargement/mémoire**, **Mesures/Tests**.
- Compteurs FPS réel + cible, p50/p95/p99, longue frame, CPU simulation/mise à jour/soumission, GPU (afficher indisponible si absent), résolution interne/DPR, triangles/draw calls, secteurs actifs/résidents/attente, poids de cache estimé et nombre de ressources.
- Filtre par domaine terrain/arbres/GLB/eau/ombres/PNJ/météo, avec pour chaque domaine **profil réellement appliqué**, demande du contrôleur et cause du changement.
- Commandes **Auto**, `freezeAuto`, réduction ciblée de chaque levier, profils de qualité, plafond de mémoire test (virtuel), plafond de génération, distances LOD de test et réinitialiser ; paramètres **locaux et réversibles**.
- Boutons « **Capturer un scénario** » et « **Exporter mesures JSON** » : seed, révision Git, navigateur/GPU déclaré si disponible, résolution, capture de caméra/trajectoire et paramètres de qualité ; aucune collecte distante.
- Qualité d'éditeur distincte : préserver précision visuelle pour modifications et résolutions ; exécution playtest prend le même runtime manager, **sans dupliquer l'algorithme**.
- Tous les contrôles techniques détaillés sont **masqués en jeu normal**. Une source de monde ZIP/V3 réimportée ne doit pas imposer le profil d'une autre machine.

## 12. Tests, scènes et critères de qualification

### Tests unitaires déterministes du contrôleur

- **30/20 FPS sans ralentissement** du pas de simulation, même si présentation rend une image sur deux et si intervalle RAF fluctue.
- Décisions stables lorsque la charge oscille autour du seuil ; **baisse après surcharge durable, remontée plus lente, cooldown**, au maximum un cran par fenêtre.
- Timer GPU absent/disjoint → état `unavailable`, jamais 0 ; le temps CPU de soumission n'est pas utilisé comme `gpuMs`.
- Changement qualité manuel, plafonds et mode strict bêta, changement d'onglet et redimensionnement → **réinitialisation sûre** des fenêtres sans adaptation intempestive.
- Aucun budget consommateur ne peut dépasser son **min/max** ; toute publication de snapshot est versionnée, immuable pour les clients.
- Caches : partage 100 instances/1 GLB, suppression de 99 copies **sans dispose de la dernière géométrie**, puis déchargement complet sans fuite ; double dispose interdit.
- Queue : P0 avant P2/P3, annulation de source obsolète, téléportation et retour rapide, quotas CPU respectés **si tâches effectivement yieldables**, aucun résultat publié après monde détruit.
- Test mémoire : pression soft/hard estimée → éviction correcte uniquement des ressources non actives ; aucun trou de terrain ni artefact d'eau dû au cache.
- LOD selon taille écran et vitesse : une île/château important demeure visible au loin ; le petit objet peut passer en silhouette/être masqué.
- Tous budgets graphiques désactivés ou minima → contrôles, nage/cascades, PNJ et monde V3 **continuent à fonctionner**.

### Scènes d'intégration CPU/GPU

1. **Vallée actuelle** avec métriques baseline à qualité constante et changement automatique.
2. **Forêt dense** + herbe GPU + passage d'écureuil + faune, depuis le sol et le planage.
3. **Village/ruines Blender** avec beaucoup d'instances de prefabs et PNJ proches ; répéter sans faire croître les ressources GPU.
4. **Océan plein écran** à midi, nuit et orage, vue rive, planage et plongée ; mesurer fill-rate et coût des shaders LOD.
5. **Cascade** proche/lointaine, jonction rivière/lac ; LOD graphique n'affecte pas volumes, bateau ni courant.
6. **Horizon 360°** îles, falaises, montagne sous ciel étoilé/lunes et météo neige ; aucune disparition de relief ni fog-cache.
7. **Traversée rapide** en bateau/planage, succession de secteurs, demi-tour, téléportation et changement de caméra ; mesurer pics >100ms et retards de chargement.
8. **Studio** : importer GLB/preset, peindre biotope, sculpter, modifier rivière, exporter ZIP, undo/redo avec 100–2 000 objets ; être réactif et sans fuite.
9. **Longue session** (scène en boucle, plusieurs dizaines de minutes) : vérifier montée des caches, heap, ressources, GC et perte/restauration de contexte WebGL.
10. **Multisystème en surcharge** : météo + herbe + ombres + océan + PNJ + horizon, vérifier décisions coordonnées et minimum lisible.

### Protocole de benchmark

- Comparer **même seed, caméra/trajectoire, durée, contenu, viewport CSS, DPR/interne, navigateurs et commit** ; lors du test « adaptatif », enregistrer **chaque changement de qualité**.
- Séparer **détection de régression logicielle** sous Chromium/SwiftShader et **qualification matériel GPU intégré** sous Firefox/Chromium avec GPU réel.
- Mesurer **p50/p95/p99**, pas seulement FPS moyen ; garder trace des temps de chargement, shader compile, appels, mémoire estimée et frames longues.
- Comparer référence « optimisations off / qualité fixe » et « auto » **à qualité effectivement équivalente** quand on attribue un gain au code ; une baisse de qualité n'est pas un gain à rendu identique.
- **Le gate 30 FPS normal / 20 FPS secours reste non démontré** avant benchmark sur une machine explicitement choisie. Documenter les scènes où la cible est impossible plutôt que cacher une baisse de contenu.
- En cas de worker, mesurer aussi son **temps de travail, messages et transferts** ; éviter de prétendre qu'un travail ne coûte plus rien parce qu'il quitte le thread principal.
- Vérifier événements/bugs : double dispose, context loss, GLB tardif, collisions, qualité oscillante, UI floue, trou de terrain et buffer qui augmente sans borne.

## Contrat transversal AUD : AudioBudgetManager sous la politique PERF

Le [document 23 — Audio MIDI LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md) définit le moteur audio **hybride, limité à 5–10 instruments MIDI** (palette fixe de patches), plus petit synthétiseur et lecteur d'échantillons naturels.

- `AudioBudgetManager` est **un `QualityConsumer` de `ResourceBudgetManager`**, avec plafonds de **polyphonie totale (musique+SFX+ambiance)**, notes musicales, émetteurs spatialisés, couches d'ambiance, réverbération, et cache PCM.
- Profils expérimentaux **12/16/24 voix totales**, **2/4/6** spatialisation et **2–4/4–8/8–16 Mio PCM** par Eco/Équilibré/Qualité ; pas des résultats démontrés. Les **5–10 instruments restent les mêmes** quel que soit le profil.
- Les **événements sonores importants** restent fonctionnels même si les animations et les PNJ lointains sont réduits ; les effets audio décoratifs les moins importants peuvent être ignorés/fondus, sans changer la simulation.
- La **mesure audio** n'est pas le temps de soumission WebGL ni le FPS GPU : compteur de voix/nœuds actifs, PCM décodé estimé, décodage, latence et glitches/underruns si observables ; coût réel backend seulement si le navigateur/profiler le permet.
- L'horloge `AudioContext.currentTime` programme les notes **indépendamment du rendu 30/20 FPS** et de `WorldClock` accélérée en bêta ; changements de biotope/météo sont des événements logiques, pas une nouvelle simulation sonore.
- Gérer le **cycle de vie mémoire** des `AudioBuffer` comme ressources partageables via `ResourceRegistry` ou adaptateur, et les admissions de décodage audio dans `WorkScheduler` lorsque nécessaire, sans faire de décodage synchrone à chaque note.
- Le contrôle audio reste dans un panneau **Ressources / Performance** existant (sous-section Audio), **pas un second régulateur graphique**. La qualification AUD-0…AUD-8 fait partie des scénarios PERF globaux.
- Pas de backend audio, banque GM complète, accès MIDI matériel obligatoire ou télémétrie audio distante.

## 13. Plan de développement incrémental PERF-0…PERF-9

| Phase | Développement minimal et artefact testable | Gate |
| --- | --- | --- |
| **PERF-0** | Audit des services existants (`PresentationBudget`, `FrameClock`, `chunks`, GLB, `ecology`, PNJ, editor), état des mesures/limites et scènes répétables | **Aucune** régression en présentation/simulation ; baseline publiée |
| **PERF-1** | `PerfSampler` : ring buffer, p50/p95/p99, causes, temps CPU séparés ; GPU optionnel asynchrone | GPU absent signalé, CPU ≠ GPU, collecte légère et testable |
| **PERF-2** | **`ResourceBudgetManager`** + politique de qualité, **remplacement progressif** de `PresentationBudget` et adaptateurs `FrameClock`/pixel ratio/écologie | **Un seul contrôleur**, 3/12 s et hystérésis préservées, 30/20 et gameplay stables |
| **PERF-3** | `QualityConsumer` pour terrain, eau, ombres, herbe, météo, PNJ, assets avec minima sûrs et raisons de changement | Le monde reste lisible et jouable au niveau minimum |
| **PERF-4** | Registre mémoire/ownership sur GLB/cache terrain, profils de cache, tests dispose et import répété | Pas de ressource partagée détruite trop tôt ni croissance permanente non justifiée |
| **PERF-5** | `WorkScheduler` quotas CPU et admissions upload/cache, prioritisation spatiale, tâches périmées et fallbacks | Traversée rapide sans pics extrêmes ni chunks manquants par décision qualité |
| **PERF-6** | Évaluation LOD par taille projetée/importance + streaming directionnel/culling hiérarchique ciblé | Monde/horizon conservés et pas de pop critique |
| **PERF-7** | **Panel bêta Ressources**, forçage/freeze, scénarios JSON, rapport par sous-système ; Studio rendu idle | Diagnostics utilisables et pas d'écriture accidentelle dans le projet V3 |
| **PERF-8** | Stress/scènes couplées, tests d'acceptation longs, benchmarks GPU réel Firefox/Chromium, profils calibrés | 30/20 cible **mesurée par scénario**, régressions attribuées |
| **PERF-9** | Finalisation des seuils, garde-fous de release, documentation des budgets et suivi de régression | Baseline, critères et stratégies de fallback vérifiés par tests |

**Ordre de contribution recommandé** : PERF-0→1→2 d'abord, car un arbitrage de qualité sans mesure fiable est un problème. Branches et PRs de taille limitée ; ne pas convertir tous les renderers en une seule PR. **Aucune de ces phases n'est considérée livrée** par l'ajout de ce document.

### Livrables obligatoires par PR PERF

- Changement de code **minimal et localisé**, migrations si nécessaire, compatibilité V2/V3 et preuves de non-régression.
- **Mesure** sur scènes fixes avant/après : p95/p99, FPS, draw calls/triangles, coûts CPU et GPU si disponible, mémoire estimée, files/chunks.
- **Tests unitaires** de la politique et **au moins un scénario navigateur d'intégration** qui vérifie la fonctionnalité visée.
- Inventaire des options déjà en place vs ajoutées : **pas de règle SHADOW/perf invisible au développeur** et pas de paramètre marqué qualifié sans benchmark.
- État explicite `SPECIFIED` / `IMPLEMENTED` / `TESTED` / `BENCHMARKED` / `RELEASED`, ne pas confondre réussite TypeScript avec performance réelle.

## 14. Décisions à ne pas figer trop tôt

**Déjà décidés** : manager transversal unique, réutilisation de `FrameClock`, adaptation progressive, priorité au gameplay et aux silhouettes, qualité locale, monitoring honnête, budgets mémoire/streaming, panel bêta et benchmarks.

**Encore à calibrer** : seuils de p95/p99, headroom CPU/GPU, exact ratio min de rendu, plafonds de draw calls/triangles/VRAM, plage de cache, taille des chunks, quotas de jobs et uploads, seuils d'erreur écran, éventuel worker, stratégie de compression, profils matériels, perf réelle 1600×900/1920×1080/mobile. **Aucune valeur illustrative ne devient une promesse de performance.**

**Anti-objectifs** : nouveau moteur graphique, moteur physique fluide, télémétrie obligatoire, serveur pour adapter la qualité, baisser la vitesse du monde sous 20 FPS, disparition de paysages lointains, crash silencieux par pression mémoire, convertir tout le code à un framework de tâches avant instrumentation.

**Décision directrice** : *un budget unique pilote les priorités et les limites ; chaque système reste modulaire et conserve un minimum de fidélité logique. Mesurer, limiter les pics, simplifier l'invisible, et maintenir un monde lointain réel.*
