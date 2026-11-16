# Rendu distant hybride — phases A à F

Branche issue de `main` b761b23 (PR #25 déplacements et évolutions Studio déjà intégrées).

## A — audit et baseline avant modification

- Terrain LOD0/1/2, planification caméra/direction/vitesse dans `chunks.ts`, cache temps/octets
  dans `terrain-view.ts` : conservés. Horizon géométrique et masque de couverture conservés.
- `dressing-view.ts` : deux BatchedMesh GLB, huit familles procédurales instanciées, cache proche
  et canopée collective issus du même classificateur. La canopée n'est pas à recréer.
- `placed-instances.ts` : deux lots GLB, hystérésis et culling individuel ; monuments individuels
  et animations de moulins dans `world.ts`. Pas d'atlas imposé aux petits objets/parties animées.
- PNJ : logique distincte, rig proche et proxy à cinq parties. Présentation distante v1 déjà
  disponible pour le hamster ; ni tampon de snapshots ni atlas animé présents avant ce travail.
- `FrameClock` et `PresentationBudget` sont l'unique régulateur réel. Le document 22 décrit une
  cible, pas un ResourceBudgetManager déjà implémenté : étendre cet arbitre, sans le doubler.
- Incohérence corrigée : `updateCamera` était appelé après `world.update`, qui consommait donc
  la caméra précédente pour LOD, frustum et occlusion. Déplacé avant les consommateurs visuels ;
  aucune modification de simulation/contrôles.

Baseline versionnée : `docs/benchmarks/hybrid/baseline/route.json` et `horizon.png`.
Commande existante, avant changement :

```sh
BENCHMARK_SCENARIOS=island-3x8 \
BENCHMARK_EXTRA_QUERY='world=maps/production-reference/manifest.json&spawn=-250,230&yaw=.2&pitch=.3&dist=35' \
node tools/benchmark-route.mjs http://127.0.0.1:5173/little-world/ /tmp/hybrid-baseline
```

Le nom historique de scénario reste island-3x8, mais la query surcharge le monde par la
référence World Production. Chromium/SwiftShader 960×640 : p50 83,4 ms, p95 183,4 ms,
p99 300 ms, appels moyens 73,64, triangles moyens 66 621 ; huit vues de contrôle sans trou
mesuré, aucune erreur. Ce n'est pas une qualification GPU ni une promesse de FPS.
