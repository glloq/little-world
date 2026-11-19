# 98 — Ciel vivant LOW-RESOURCE : soleil visible et nuages hybrides 2D/3D

**Statut : SPECIFIED — documentation uniquement, non implémenté.** 19 novembre 2026. Base examinée : `main`. Ce document précise le rendu décoratif du ciel, sans remplacer [19 — environnement, météo et ciel](19-ENVIRONMENT-WEATHER-SKY.md), [22 — budget transversal](22-RESOURCE-BUDGET-MANAGER.md), [80 — anciens PC](80-OLD-PC-HARDWARE-AUTO-QUALITY.md), [81 — audit performance](81-RENDER-PERFORMANCE-CODE-AUDIT.md) ou [82 — optimisation graphique](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md). Exécution : [99 — roadmap](99-SKY-SUN-CLOUDS-IMPLEMENTATION-ROADMAP.md).

## Objectif et contraintes non négociables

Créer un ciel vivant dans Little World, compatible WebGL2 / GitHub Pages et PC anciens 4–8 Go, sans ralentir le planage rapide, la végétation, l'eau et les scènes chargées. Priorité absolue au gameplay. Le soleil visible, les nuages lointains 2D et quelques nuages 3D servent uniquement le visuel. Ils ne participent ni à la physique, ni au pathfinding, ni aux collisions, ni aux sauvegardes d'entités.

Interdits V1 : raymarching volumétrique, textures énormes, post-traitement bloom/lens flare, ombres temps réel de nuages, fog masquant la distance, particules de nuages, passes multiples de ciel, réallocation mesh/texture par frame, moteur météo ou adaptateur qualité indépendant.

## Audit des points de raccordement de main

| Fichier | État vérifié | Action prévue |
| --- | --- | --- |
| `src/environment/climate.ts` | `EnvironmentState` expose `worldTime`, `dayPhase`, `sunAltitude`, `weather`, `cloudCover`, `wind`; météo déterministe clear/cloudy/rain | Réutiliser sans modifier le modèle climatique |
| `src/environment/sky-lighting.ts` | `applySkyLighting` pilote la couleur de fond, intensité et position de la lumière solaire | Fournir une direction solaire commune au disque et à l'éclairage; ne pas fabriquer une seconde orbite |
| `src/environment/view.ts` | `scene.background` est une couleur, pas de fog, 192 particules de pluie GPU max, détail 0/1/2, inhibition en mine | Conserver l'API publique et raccorder le ciel |
| `src/main.ts` | `createEnvironmentView`, `environment.update(delta,player.position,budget.level,!!player.space)`, instrumentation optionnelle | Modification minimale de l'initialisation / de la télémétrie |
| `src/frame-clock.ts` | `PresentationBudget` détail 0–2, présentation 30/20 Hz | Réutiliser les niveaux actuels, pas de second automate |
| `src/render/perf-sampler.ts` | p50/p95/p99 CPU et requêtes GPU asynchrones optionnelles | A/B coût différentiel nuages et soleil |
| `src/studio/environment-view.ts` | Éditeur jour/nuit, seed et période météo uniquement | Studio différé, paramètres graphiques non obligatoires en V1 |

Le système `ResourceBudgetManager` est actuellement décrit comme une **cible d'architecture**, pas comme un gestionnaire déjà livré : raccorder la V1 à `PresentationBudget`, puis adapter une fois PERF-2/PERF-3 disponibles. Éviter toute boucle d'auto-dégradation locale du ciel.

## Architecture cible minimale

```text
WorldClock + ClimateHistory (source logique unique)
          |
          v
EnvironmentView -- applySkyLighting -> DirectionalLight existant
          |                            |
          +-- SkyRenderer --------------+ (même direction solaire)
          |    +-- gradient / soleil (une seule passe de fond)
          |    +-- nuages 2D lointains (même passe)
          |
          +-- CloudRenderer (géométries 3D facettées partagées)
          |
          +-- pluie existante (inchangée)
          |
          +-- PresentationBudget 0/1/2 (futur QualityBudgetSnapshot)
```

Proposition de fichiers : `src/environment/sky-renderer.ts`, `src/environment/cloud-renderer.ts`, `src/environment/cloud-presets.ts`. Ne créer un fichier supplémentaire que si le profilage le justifie. `createEnvironmentView` doit conserver `update`, `metrics` et `dispose`; `dispose` détruit strictement ses allocations propres. Les matériaux/géométries partagés doivent avoir un propriétaire explicite.

### Soleil visible

- Le soleil est un disque angulaire dessiné dans le shader du ciel avec bord doux et halo discret calculé dans cette **même passe** (pas de bloom).
- Utiliser une direction solaire unique cohérente avec le `DirectionalLight` de `applySkyLighting`, idéalement via une fonction partagée renvoyant la direction; aucune divergence Studio/runtime.
- Le disque reste fixe en direction mondiale quand la caméra tourne et ne varie pas de taille angulaire quand le joueur vole. Sous l'horizon il est masqué; hauteur, couleur et halo évoluent continûment sur jour/aube/crépuscule/nuit.
- À couvert, la couche 2D masque progressivement le disque **dans sa direction**; ne pas se contenter de multiplier sa luminosité par `1-cloudCover` globalement.
- Éviter l'effet soleil à travers montagne : le rendu du fond doit respecter l'occlusion de la géométrie opaque du monde. Vérifier aussi l'ordre de rendu avec les nuages 3D.

### Nuages 2D lointains

- Une seule couche animée dans le shader de ciel (ou un dôme de fond minimal si les tests GPU le favorisent), 1–2 formes de bruit bon marché / texture atlas basse résolution partagée; éviter le bruit procédural multi-octaves coûteux par pixel.
- UV / directions dans l'espace monde, vent dérivé de l'horloge et de la seed; déplacement continu sans recréer des textures; une couche en toutes qualités.
- `cloudCover` commande une couverture/épaisseur visuelle progressive; le climat déterministe reste la source de vérité. Éviter les sauts lors du changement instantané de profil clair/couvert/pluie : interpolation **cosmétique** non utilisée par le gameplay.
- Permettre un fallback simple : soleil + ciel sans nuages 2D si shader ciel trop coûteux sur un GPU faible.

### Nuages 3D proches

- Modèles opaques low-poly stricts : 2–3 silhouettes fusionnées, environ 24–72 triangles par nuage selon qualité, couleurs mates / matériau sans transparence; géométries et matériaux partagés.
- Au plus un `InstancedMesh` par silhouette/matériau (cible 1–3 draw calls). Attention : culling par mesh d'instances, pas par nuage individuel. Le positionnement doit rester borné, les instances trop loin étant réutilisées sans allocations.
- Animation du vent via temps global / shader léger; ne pas réécrire toutes les matrices chaque frame. Mise à jour d'instances seulement lors d'un changement de secteur/qualité ou transition visible.
- Distribution déterministe seed + coordonnées mondiales, anchor caméra pour précision, sans effet « nuages collés au joueur ». Recyclage visuel discret, sans popping aux frontières et sans régénération lors du vol rapide.
- Traversables sans collisions. Aucun voile de traversée en V1; à évaluer seulement après budget GPU mesuré. Aucune ombre portée / shadow map, même en qualité haute.
- En mine / intérieur totalement occulté : ne pas dessiner les nuages ou disque; réactiver sans allocation au retour à l'air libre.

## Profils V1 (plafonds initiaux, non mesurés)

| Profil `PresentationBudget.level` | 2D ciel | Nuages 3D visibles max | Triangles/nuage | Draw calls additionnels ciblés |
| --- | --- | ---: | ---: | ---: |
| 2 — économie / surcharge | soleil + couche 2D économique, ou fallback uniforme | 0 | — | ≤ 1 |
| 1 — normal réduit | soleil + couche 2D | 8 | 24–48 | ≤ 3 |
| 0 — qualité | soleil + couche 2D | 16 | 48–72 | ≤ 4 |

Ces valeurs sont des **hypothèses à mesurer**, pas des budgets alloués de plein droit. Elles peuvent être réduites si le GPU intégré est contraint. Ne jamais ajouter une shadow pass pour les nuages.

Objectifs A/B initiaux sur matériel de référence (non garantis) : supplément CPU moyen ≤ 0,10 ms/frame présentée, supplément GPU ≤ 0,30 ms/frame au rendu nuages+soleil, sans hausse significative de p95/p99 ni longue frame pendant le vol. Si non tenus : d'abord couper la 3D, puis simplifier les nuages 2D et enfin utiliser un fond simple avec soleil; ne pas baisser la résolution globale **à cause du ciel** sans essayer son propre fallback. L'arbitre global décide du niveau de détail.

## Cohérence avec le monde

- Soleil/nuages liés au même état de temps; aucune simulation séparée dans Studio, les îles, la plongée, la météo ou le multijoueur.
- Le vent exploite le champ existant; la phase des nuages vient du temps logique absolu pour reproduire une scène, y compris après une pause ou un saut de temps.
- L'éclairage environnemental déjà dépendant de `cloudCover` ne doit pas être multiplié une seconde fois par le rendu des nuages.
- Le système de ciel suit une seule île active; pendant les voyages / changements d'île, libérer les ressources associées à l'ancienne scène. Pas d'objets permanents accumulés.
- Vue sous-marine : conserver le rendu/atténuation spécifique à l'eau; ne pas y substituer un brouillard atmosphérique.
- Les paramètres d'apparence (taille angulaire solaire, style nuages, altitude/densité esthétique) peuvent ensuite être édités dans Studio, **sans modifier** `EnvironmentDefinition.schemaVersion=1` ni la simulation historique tant qu'un schéma/migration explicite n'est pas prévu.
- Le ciel « actif » reste optionnel : absence du module / fallback visuel n'altère ni météo, ni heure, ni jeu.

## Tests et instrumentation obligatoires

Comparer depuis la **même** seed, heure, météo, trajectoire caméra, qualité, résolution et GPU : ciel actuel OFF / soleil seul / soleil+2D / hybride. Capturer : horizon montagne, plein midi, aube, coucher, nuit, pluie/couvert, ville/forêt, vol rapide + changement de direction, mine, transition île. Mesurer FPS, p50/p95/p99, longues frames, draw calls, triangles, GPU timer si disponible, mémoire GPU estimée et absence de reconstructions.

Ne pas déclarer `QUALIFIED` sans capture reproductible et comparaison matérielle sur PC 8 Go GPU intégré, idéalement aussi 4 Go. Tester perte/restauration contexte WebGL, changement de qualité 0↔1↔2 et `dispose()`. Les mesures « GPU unavailable » restent explicitement inconnues, jamais 0 ms.

## Décision

Commencer par **soleil visible + ciel 2D en une passe**, qualifier son coût, puis ajouter les nuages 3D **uniquement** avec budget résiduel démontré. Les nuages sont esthétiques; l'ensemble doit pouvoir revenir automatiquement au soleil simple sans dégrader le gameplay.
