# 82 — Roadmap d'optimisation du moteur : FPS, vieux PC et marge graphique

**Statut : PLANNED — roadmap d'exécution, aucun changement runtime livré ici.** Baseline de code : `main@f37d7767` (18 novembre 2026). Priorité : **meilleure qualité à FPS stables**, et non suppression automatique des détails. Voir [80 — cible 4–8 Go et Auto](80-OLD-PC-HARDWARE-AUTO-QUALITY.md) et [81 — audit fichier par fichier](81-RENDER-PERFORMANCE-CODE-AUDIT.md).

Cette roadmap **complète** [22 — PERF-0…PERF-9](22-RESOURCE-BUDGET-MANAGER.md) et [10 — benchmarks](10-PERFORMANCE-ROADMAP.md), elle ne les remplace pas. [PR #29 — roadmap artistique GFX-0…GFX-10](https://github.com/glloq/little-world/pull/29) est un travail graphique encore ouvert à la date de cet audit : reprendre ses objectifs lors de sa fusion, sans prétendre que ce document est déjà sur `main`. Le volet OPT ci-dessous fournit les optimisations préalables et les gates matériels nécessaires à ces améliorations.

## 1. Règles d'exécution

1. **Une PR = un mécanisme mesurable** ; éviter une refonte monolithique de `world.ts` ou du renderer. Conserver tests, APIs, compatibilité Pages, Studio V3 et sauvegardes.
2. **Mesurer avant de modifier**, avec scène fixe et déplacement reproductible, source identique, résolution identique et `renderTier` fixe pour la comparaison. Répéter A/B et A/B/A lorsque possible.
3. **Priorité aux optimisations sans perte d'image** : index, dirty flags, réutilisation, cache, batching, scheduling, culling conservateur. Les LOD/imposteurs restent des stratégies soumises à contrôle artistique.
4. **Pas de deuxième régulateur** : `FrameClock` reste l'horloge, `PresentationBudget` évolue progressivement vers l'arbitre décrit doc 22. Pas de serveur, cloud ni télémétrie distante.
5. **Aucun chiffre FPS « atteint » sans GPU physique identifié** : séparer tests unitaires, intégration navigateur SwiftShader, Chrome/Firefox GPU natif et mémoire système.
6. **Étiquettes de suivi** pour chaque phase : `SPECIFIED` → `IMPLEMENTED` → `TESTED` → `BENCHMARKED-4GB` / `BENCHMARKED-8GB` → `QUALIFIED`. Les deux benchmarks matériels sont indépendants.

## 2. Roadmap priorisée OPT-0 à OPT-9

| Jalon | Priorité | Fichiers / modification à livrer | Critère avant passage |
| --- | --- | --- | --- |
| **OPT-0** — baseline | P0 | `tools/benchmark-route.mjs`, `tools/benchmark-hybrid.mjs`, `main.ts`, `render/perf-sampler.ts` ; scènes reproductibles sol/forêt/village/vol, fix quality/seed et export JSON, GPU optionnel | Profil chiffré sur `main`, pas de mélange CPU submit/GPU, captures de référence |
| **OPT-1** — végétation incrémentale | P0 | `dressing-view.ts`, helpers cache/dirty ; préserver matrices stables, évictions cohérentes, optimiser allocations, upload partiel par cellule ou secteur | Image identique à qualité fixe, aucun arbre récoltable perdu, uploads/rebuilds non régressifs, A/B |
| **OPT-2** — géologie et structures | P0 | `render/cliff-view.ts`, `structures/natural-view.ts` ; index spatial, cache mesh et LOD, invalidation locale Studio | Traversées rapides, grottes/arches/rochers sans popping ni reconstructions massives ; état logique inchangé |
| **OPT-3** — culling statique | P1 | `world.ts`, `world-production/placed-instances.ts`, `render/asset-culling.ts` ; requêtes spatiales et groupes stables | Village dense sans scan global récurrent à densité égale, objets interactifs inchangés |
| **OPT-4** — terrain/flight streaming | P1 | `chunks.ts`, `terrain-view.ts`, `geography/geo-workers.ts` ; anticipation d'après vitesse/charge, ordonnancement et budget d'intégration | Test vol rapide 120 km/h et virages : pas de trou terrain/collision ; p99 de préparation non régressif |
| **OPT-5** — ressources et cycles de vie | P1 | `render/resource-cache.ts`, loaders GLB/terrain/atlas/audio ; comptage octets, ownership/refcounts, éviction inactive, cancellation jobs périmés | A→B→A×10, Studio playtest/reload, pas de fuite mesurable ni de dispose prématuré |
| **OPT-6** — Auto diagnostic | P1 | `frame-clock.ts`, `main.ts`, adaptateurs rendus ; un seul arbitre CPU/GPU/mémoire, raisons et profils 4/8 Go, UI simple | CPU-limité ≠ baisse DPR automatique ; pas d'oscillation, 30→20 en dernier recours, simulation constante |
| **OPT-7** — culling/LOD perceptuels | P2 | `representation-policy.ts`, terrain, herbes, arbres, bâtiments ; écran/importance, hystérésis, transitions | Silhouettes et masse forestière préservées, captures avant/après acceptées |
| **OPT-8** — marge graphique | P2 | Améliorations `GFX-*` : couleurs/normales/ombres de contact, ciel, eau, végétation, bâtiments, animation | Effet visible positif et coût additionnel documenté sous profils 4/8 Go |
| **OPT-9** — qualification | P0 continu | Matrice matériel/navigateurs, longues sessions, CI et tableau régression perf/visuel ; documentation statut | Cibles réellement testées, résultats reproductibles et limites matérielles publiées |

**Ordre recommandé pour délivrer vite sans duplication** : OPT-0 → OPT-1 → OPT-2 → OPT-3 → OPT-4 → OPT-5 → OPT-6 → OPT-7 → OPT-8 ; OPT-9 à chaque jalon. OPT-5/6 peuvent avancer parallèlement **après** les métriques de OPT-0, avec APIs stables et sans deux arbitres.

## 3. Valeurs initiales à tester, pas des constantes garanties

| Groupe | Point de départ | Fichier de référence | Comment mesurer |
| --- | --- | --- | --- |
| Temps de présentation | 30 FPS = 33,3 ms, secours 20 FPS = 50 ms ; simulation 30 Hz fixe | `frame-clock.ts` | Temps p50/p95/p99, vitesse physique identique à 20/30 |
| Profil matériel | 4 Go compatibilité conditionnelle, 8 Go référence, GPU intégré WebGL2 ; départ 1280×720 sur 8 Go puis 1600×900 | [80](80-OLD-PC-HARDWARE-AUTO-QUALITY.md) | Tests sur RAM totale et GPU documentés ; aucune promesse |
| Adaptation Auto | Surcharge 3 s, récupération 12 s provisoires ; pas de changement de plusieurs leviers simultanés | `PresentationBudget` | Mesures en GPU-limité, CPU-limité, mémoire et frame unique lente |
| Terrain | 3 LOD ; build budget 4 ms, max 2 intégrations actuellement | `world.ts`, `terrain-view.ts` | Coût réel maximal build/upload, holes 0, latence entrée chunk |
| Prévision | 2–4 s nominal, décalage borné actuel `maxAheadShift=0.5` | `chunks.ts` | Distance de préchargement effectivement utile au boost/virage |
| Végétation | 8 familles de base, 1200 cellules cache, 250 ms reconstruire si dirty actuellement | `dressing-view.ts` | `rebuildMs`, données transférées, `dirtyCells`, fréquence |
| Herbe | 42/32/20/0 m pour `dense/balanced/ultra/groundOnly` | `render/grass.ts` | Captures au sol et en vol, coût de buffer, aucun downgrade visible |
| Falaises | Rayon 250 m, max 32, max 3 builds/update actuellement | `render/cliff-view.ts` | Nombre de candidats et coût CPU par segment, cache hit-rate |
| Audio et effets | Son critique toujours audible ; décor pur sous budget commun | `audio/*`, `environment/view.ts` | Glitches et latence action, mémoire audio décodée |
| Imposteurs | `off` par défaut ; tester `trees` et `all` séparément | `world.ts`, `impostor-sectors.ts` | Temps GPU, appels, overdraw, qualité jour/nuit |

**Principe d'acceptation** : n'augmenter les plafonds artistiques (arbres, végétation, bâtiments, eau, nouveaux shaders) qu'après mesure de la marge conservée, plutôt que verrouiller les plafonds actuels.

## 4. Protocole de benchmark reproductible

### Matrice matérielle minimale

| Banc | RAM totale | GPU / navigateur | Cible à tester |
| --- | --- | --- | --- |
| `PC-4G-IGPU` | 4 Go physiques | iGPU WebGL2 ancien + Chrome/Firefox compatibles | Priorité stabilité et mémoire, 20 FPS de secours, tenter 30 si possible |
| `PC-8G-IGPU` | 8 Go physiques | iGPU entrée de gamme + Chrome/Firefox | 30 FPS nominal, 1280×720 puis 1600×900 |
| `PC-FAST` | 8 Go ou plus | GPU plus rapide, Chrome/Firefox | Vérifier que Auto remonte qualité, mesurer marge GFX |

Pour chaque banc conserver **OS/version, CPU, GPU et pilote, navigateur/version, écran, DPR/framebuffer, charge en arrière-plan, alimentation et qualité effective**. Mesurer RAM processus depuis OS quand possible (sinon noter indisponible), heap JS séparément, GPU mémoire estimée séparément. Ne jamais déduire « 4 Go » d'une valeur `navigator.deviceMemory` seule.

### Scènes obligatoires

1. Départ à froid sur l'île 4 × 3 km, temps jusqu'à monde visible et premier contrôle utilisable.
2. Forêt dense au sol (herbes et récolte), puis forêt depuis 100 m d'altitude.
3. Traversée planeur ≥120 km/h (si atteignable par physique de la version testée), piqué, virage serré, demi-tour et retour.
4. Village/port dense, éclairage diurne et nocturne, interaction PNJ/maison/bateau.
5. Grandes falaises, arches, grottes, panorama depuis un sommet, arrivée au relief.
6. Mer/rivière/cascade, nage/plongée ; vérifier les volumes d'eau séparément du niveau visuel.
7. Itinéraire long et répétitions A→B→A entre îles actives, ouverture/fermeture Studio et « Jouer ici ».
8. Mode Auto avec surcharge CPU synthétique **contrôlée**, surcharge GPU contrôlée, RAM sous pression, onglet masqué, retour et redimensionnement.

### Mesures et gates (cibles **provisoires**, à calibrer)

- **Fonctionnalité : tolérance zéro** aux collisions ratées, lignes d'horizon trouées, géométries interactives disparues, perte de sauvegarde/échanges d'île ou ralentissement du temps logique. Comparaison visuelle A/B faite à qualité effective identique ; différences artistiques intentionnelles documentées.
- **Rendu** : sur PC-8G viser 30 FPS ; sur PC-4G essayer 30 et accepter 20 uniquement si 30 n'est pas soutenable avec qualité maximale compatible. Proposition de seuils exploratoires : p95 frame ≤40 ms en mode 30, ≤60 ms en mode 20 ; p99 et longues images >100 ms doivent diminuer par rapport au baseline. Ce sont **gates de départ**, pas des obligations validées.
- **Streaming** : 0 trou de terrain visible, 0 job obsolète publié ; priorité sécurité conservée, files bornées, pas de nouveau pic récurrent >100 ms lié au chargement.
- **Mémoire** : pas de croissance monotone injustifiée sur 10 cycles d'île ou traversée répétée, caches actifs bornés, ownership GLB/texture/geometries fiable ; documenter pics de RAM réelle/heap/estimation GPU sans les confondre.
- **Qualité** : masses de forêt, grands arbres, falaises, bâtiments/repères, couleurs d'herbe, lumière et horizons restent lisibles ; pas de crossfade par double rendu permanent coûteux, transitions LOD validées.
- **Performance** : publier pour chaque scène p50/p95/p99, long frames, draw calls, triangles, CPU sim/update/submit, GPU `available/unavailable`, bytes uploads, chunks résident/en attente, niveau effectif et moteur de rendu (SwiftShader vs GPU physique).
- **Analyse comparative** : toute optimisation visuellement identique doit montrer un gain statistiquement convaincant sur sa métrique cible, sans régression significative ailleurs. Si gain seulement théorique, feature flag OFF ou revert.

### Commandes existantes à réutiliser

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run benchmark:route
npm run benchmark:hybrid
npm run benchmark:ground-cover
npm run test:render-budget
npm run test:impostor-optimization
npm run bench:physics
```

Pour lancer une comparaison navigateur, ajouter les paramètres d'essai documentés `?metrics=1&renderTier=1` puis comparer les conditions `impostors=off/trees`, `grass=balanced/groundOnly`, `tile=64/128/256`, `workers=0`. Les profils forcés servent à l'**A/B**, pas au mode Auto final. Des scripts existants peuvent dépendre de Vite et Playwright ; les résultats SwiftShader sont des régressions comparatives, pas un benchmark iGPU réel.

**Contrat de données pour chaque rapport JSON** : révision Git, monde/seed, parcours, pose caméra, version navigateur/renderer GPU, matériel, résolution/DPR, choix qualité fixe/Auto, politique appliquée, date, durée, métriques par sous-système, captures/références, erreurs, conclusion et limitations. Éviter des comparaisons entre des scénarios ou résolutions différents.

## 5. Déploiement par petites PR et rollback

- `OPT-0` : métriques et fixtures seuls, **aucune** adaptation nouvelle.
- `OPT-1/2/3` : changements internes et tests d'image ; garder un flag temporaire A/B si un renderer est profondément modifié.
- `OPT-4/5` : mesure des pics CPU et transfert GPU, tests de long déplacement et retour île ; précharger de manière bornée.
- `OPT-6` : migration de l'unique régulateur derrière compatibilité des préférences; conserver `low/medium/high` et la politique 30/20 d'origine tant que Auto n'a pas passé les gates.
- `OPT-7/8` : n'activer par défaut **que** les effets qui améliorent la qualité sans briser PC-4G/PC-8G ; sinon option avancée et fallback équivalent.

Chaque PR doit inclure un bref tableau **avant/après, statut, scénario, même qualité ?**, liens vers captures et rapport, mesures et limitations, tests d'unitaire/typecheck/build/Pages, et un mécanisme de désactivation/rollback si le changement porte un risque de performance.

## 6. Critère « prêt pour futures améliorations graphiques »

Le moteur est **GFX-READY** uniquement lorsque les 4 points sont démontrés :
- `OPT-1…OPT-6` stabilisent CPU, uploads, caches, streaming et adaptation sans perte de fonctionnalités ni visuel à niveau égal.
- Les jeux de scènes montrent un budget résiduel réel sur PC-8G, sans saccades répétées sur PC-4G (qui peut utiliser son propre compromis Auto).
- Le Studio peut afficher/profiler les coûts ajoutés par famille de matériaux/objets/secteurs, puis exporter un rapport local.
- Chaque nouveau shader, matériau, eau/ombre/vegetation plus riche possède une variante économique **artistiquement acceptable**, plutôt qu'une simple désactivation brutale.

**Prochaines actions immédiates** : OPT-0 puis OPT-1 sur une branche de code dédiée ; mesurer `dressing-view.ts` avant d'envisager une modification graphique globale. **Cet ajout documentaire ne réalise aucune phase OPT.**