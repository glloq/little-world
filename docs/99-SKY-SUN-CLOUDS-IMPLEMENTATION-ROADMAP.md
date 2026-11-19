# 99 — Roadmap d'implémentation : soleil visible + nuages 2D/3D LOW-RESOURCE

**Statut : PLANNED — aucune implémentation runtime ni benchmark livrés par cette branche.** 19 novembre 2026.

Spécification de référence : [98 — Ciel vivant LOW-RESOURCE](98-LOW-RESOURCE-SKY-SUN-CLOUDS.md). Conserver les contrats [19 — environnement](19-ENVIRONMENT-WEATHER-SKY.md), [22 — budget PERF](22-RESOURCE-BUDGET-MANAGER.md), [80 — PC anciens](80-OLD-PC-HARDWARE-AUTO-QUALITY.md) et [82 — optimisation graphique](82-PERFORMANCE-GRAPHICS-IMPLEMENTATION-ROADMAP.md). La branche documentation ne prétend ni changer la météo existante ni garantir des FPS.

## Gates, ordre de travail et livrables

| Étape | Priorité | Action code | Gate de sortie |
| --- | --- | --- | --- |
| SKY-0 — baseline | P0 | Script/capture A/B ciel actuel sans nuages; scènes vol rapide, forêt, ville, météo, mine; mesurer p50/p95/p99, GPU timer si présent, draw calls et allocations | Captures + mesures reproductibles, seed/résolution/qualité documentées |
| SKY-1 — direction solaire unique | P0 | Extraire direction solaire partagée dans `sky-lighting.ts`, conserver courbe de lumière et cohérence Studio | Soleil visuel et `DirectionalLight` exactement alignés, aucune régression jour/nuit |
| SKY-2 — disque + halo | P0 | Ajouter `sky-renderer.ts` avec un seul rendu de fond, disque angular stable, halo limité, masque horizon | Visible de jour, couchant progressif, invisible sous horizon; aucune shadow map / bloom |
| SKY-3 — couche 2D | P0 | Ajouter cloud mask 2D léger dans le même shader, vent animé en temps monde et couverture `cloudCover` | 0 passe ajoutée par nuage, occultation solaire directionnelle et transitions douces |
| SKY-4 — benchmark 2D | P0 | Comparaison OFF/soleil/soleil+2D sur GPU intégré, fallback simple si surcoût | Objectif CPU ≤0,10 ms et GPU ≤0,30 ms différentiel, p95/p99 sans dégradation significative |
| SKY-5 — nuages 3D | P1 conditionnelle | `cloud-renderer.ts` + `cloud-presets.ts`, silhouettes opaques instanciées, 8/16 max, 0 en secours | ≤3 draw calls 3D; pas de rebuild par frame, pas de collision/ombres |
| SKY-6 — intégration budget | P0 | Relier `setDetail(level)` à `PresentationBudget` niveaux 0/1/2; futur QualityConsumer si PERF-2 actif | Qualité réduit d'abord la 3D; aucun second automate; simulation inchangée |
| SKY-7 — robustesse | P0 | Tests changement de mode, pluie, nuit, passage mine, eau, île, changement de qualité, WebGL context lost/restored | Aucun nuage visible dans mine, zéro fuite après `dispose`, pas de popping visible en vol |
| SKY-8 — Studio | P2 | Contrôles visuels édition/aperçu seulement après qualification; définir schéma versionné avec migration si persistant | Aucune rupture des anciens mondes/sauvegardes; prévisualisation identique au runtime |
| SKY-9 — qualification | P0 | Capture comparée 4/8 Go, notamment vol rapide et scènes chargées; ajuster presets | Validation QA documentée ou fallback activé; aucune affirmation de performance sans mesure |

### Priorité d'exécution

1. Livrer SKY-0 → SKY-4 d'abord : un soleil visible et une couche 2D doivent déjà améliorer sensiblement le ciel.
2. N'ajouter SKY-5 qu'avec une marge GPU/CPU mesurée; les nuages 3D restent facultatifs.
3. SKY-6 et SKY-7 sont obligatoires avant mise en service, même si seule la 2D est livrée.
4. SKY-8 est une extension Studio distincte; ne pas bloquer une première version correcte du ciel.
5. SKY-9 décide de la configuration par défaut, jamais la préférence esthétique seule.

## Fichiers ciblés

- `src/environment/sky-lighting.ts` : direction unique soleil/rayonnement.
- `src/environment/view.ts` : branchement, métriques et `dispose` sans changer sa signature publique.
- `src/environment/sky-renderer.ts` : NOUVEAU, shader de fond soleil + nuages 2D.
- `src/environment/cloud-renderer.ts` : NOUVEAU, 3D instanciée optionnelle.
- `src/environment/cloud-presets.ts` : NOUVEAU, capacités, formes/palettes partagées.
- `src/main.ts` : intégration et instrumentation minimale, respecter les deux paths mine/plein air.
- `src/studio/environment-view.ts` et schéma Studio : seulement SKY-8.
- Tests unitaires et scènes/benchmarks existants à étendre, sans créer un deuxième environnement de simulation.

## Contrat technique de rendu

Une seule source `climate.state(clock.time)`. Le soleil est déterminé par la même direction que les lumières. Le 2D est dessiné dans le fond en même passe (évaluer réellement coût du fragment shader); le 3D est opaque avec `InstancedMesh`, instance reuse au changement de secteur, animation par temps absolu. L'absence de temps GPU mesurable n'est jamais interprétée comme un coût nul. En mine, aucune partie du ciel ne doit se superposer à la roche. Sur GPU limité : 3D OFF, puis masque 2D simplifié, puis fond uni + disque si nécessaire.

Les profils sont les plafonds provisoires suivants :

| Niveau | Nuages 3D max | Nuages 2D | Soleil visible | Ombres nuages |
| --- | ---: | --- | --- | --- |
| 2 — éco | 0 | 1 léger ou OFF | oui | jamais |
| 1 — réduit | 8 | 1 léger | oui | jamais |
| 0 — qualité | 16 | 1 léger | oui | jamais |

Cibles de coût additionnel **provisoires et non mesurées** sur machine de référence : CPU moyen ≤0,10 ms/frame et GPU ≤0,30 ms/frame. Comparer aussi p95/p99; le coût marginal doit être acceptable pendant le vol rapide, et non simplement au repos.

## Plan de test automatisé

- Test calcul solaire : midi, lever/coucher, nuit et angles de caméra; position stable en direction mondiale.
- Test état climatique : météo `clear/cloudy/rain` déterministe, seed stable, vent sans jump lors de la pause et du saut de temps; interpolation cosmétique ne modifie pas la météo logique.
- Test qualité : niveaux 0/1/2, 3D immédiatement coupée en économie, retour sans réallocation systématique.
- Test lifecycle : répétition création/destruction et changement d'île, `dispose` ressources possédées une seule fois; WebGL context lost/restored.
- Test parcours : rapidité de vol, changement direction, grandes altitudes, terrain montagneux, secteurs monde, pluie, mine et sous-marin.
- Test captures : golden/capture snapshots jour-couvert-pluie-coucher-nuit avec soleil visible si horizon dégagé et occulté si montagne ou nuage.
- Mesurer les scénarios avec option `clouds=off|2d|hybrid` **à ajouter pour benchmark**, non promise comme paramètre déjà implémenté.

## Risques bloquants

| Risque | Prévention |
| --- | --- |
| 1 draw call mais shader de ciel plein écran coûteux | mesurer temps GPU; réduire bruit/overdraw, fallback shader économique |
| Soleil qui perce montagne/nuages | respecter depth/background et masque directionnel |
| Nuages 3D collés à la caméra ou popping en planeur | ancrage monde stable, recyclage par secteurs + transition bornée |
| Instancing culling inefficace | petits lots spatiaux si nécessaire; éviter 1 grand volume hors champ |
| Qualité concurrente avec adaptation globale | une seule décision issue de `PresentationBudget` / futur `ResourceBudgetManager` |
| Changement de météo brutal | interpolation **visuelle** avec durée bornée et aucun impact sur le gameplay |
| Fuites en sortie île/mine ou perte du contexte | propriété explicite, test de destruction/recréation |

## Checklist de livraison

- [ ] Baseline et méthode A/B documentées.
- [ ] Direction solaire partagée.
- [ ] Soleil visible + halo sans bloom.
- [ ] Nuages 2D lointains, continus et directionnellement occultants.
- [ ] 2D benchmark qualifié (ou fallback).
- [ ] Nuages 3D instanciés uniquement si budget résiduel.
- [ ] Qualité intégrée sans second gestionnaire.
- [ ] Contrôles mine, caméra, météo, plongée, transition îles, lifecycle.
- [ ] Tests automatisés + capture manuelle reproductible.
- [ ] Profil PC 8 Go qualifié, PC 4 Go qualifié ou limitation explicitement documentée.
- [ ] Studio plus tard, sans bloquer le rendu de base.

**Critère de décision final :** l'amélioration cosmétique est désactivable et n'empiète jamais sur la simulation, le déplacement, l'eau ou la visibilité du monde. Aucune étape ne doit être marquée « done » sur la seule base de sa documentation.
