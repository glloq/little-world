# 10 — Performance, chargement spatial et mesures

**12 novembre 2026 — architecture locale implémentée ; aucun gain global de FPS revendiqué.**

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
- `npc.ts` / `npc-view.ts` : simulation complète proche, réduite à distance intermédiaire, dormante au loin. Rig complet jusqu’à 18 m, silhouette de cinq meshes jusqu’à 160 m, aucun rendu au-delà. Ressources de silhouette partagées ; articulations mises en cache.
- Les modèles GLB et géométries/matériaux partagés restent mutualisés. Les ressources uniques, buffers d’instances et rigs sont libérés lors des régénérations. La caméra n’alloue plus ses deux vecteurs à chaque frame.

Les caches de modèles sont encore bornés par le petit catalogue, sans LRU de textures. Le terrain analytique est une configuration unique par page. Les bâtiments, forêt principale et rivière de démonstration gardent leurs positions historiques ; les grandes cartes sont des tests de terrain étendu, pas des mondes entièrement peuplés. Les secteurs proches génèrent leur géométrie de façon synchrone répartie entre frames : aucun worker n’est encore implémenté. Les LOD n’ont pas de morphing.

## Suite prioritaire

1. Réduire les appels du personnage et regrouper les sous-meshes statiques par matériau/articulation, puis mesurer sur les mêmes scènes.
2. Profiler séparément CPU et GPU sur PC ; comparer moteur seul et contenu enrichi avec des interrupteurs de benchmark explicites.
3. Étendre la forêt et les objets statiques avec le même registre spatial, ajouter des LOD du bâti et de la végétation principale.
4. Déplacer les calculs coûteux de relief vers un worker ou la compilation statique après profilage.
5. Tester mémoire et réactivité de l’éditeur chargé, longues traversées et renouvellement des caches.

Aucun objectif de performance chiffré n’est considéré atteint sur matériel utilisateur.
