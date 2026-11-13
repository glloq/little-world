# 38 — Inventaire audio V2 (généré)

> **Fichier généré** par `npm run generate:audio` depuis [`src/audio/catalog-source.ts`](../src/audio/catalog-source.ts). Ne pas éditer à la main : modifier la source puis régénérer. Architecture et contrats : [37 — Audio V2](37-AUDIO-V2-CATALOGUE.md). Manifeste de production : [`assets/audio/production-manifest.json`](../assets/audio/production-manifest.json).

## Résumé

- Catalogue `2.0.0-aud-v2` : **107 événements**, **19 thèmes musicaux**, **19 profils d’ambiance**.
- Jouables dès maintenant : **22/107 événements** (ressources disponibles ou repli explicite) ; les autres restent silencieux sans erreur.
- Ressources disponibles : 8 fichiers de la bibliothèque V1 (6 WAV + 2 MIDI, statut GENERATED) et 5 sons procéduraux (GENERATED, écoute non qualifiée).
- **À produire : 160 fichiers** (143 échantillons, 17 MIDI) — vague 1 / B1 : **54**, vague 2 : 63 (bêta enrichie = 117), vague 3 optionnelle : 43.
- Un événement n’est pas un fichier : plusieurs événements réutilisent les mêmes fichiers avec un gain/une hauteur différents (colonne « Réutilisation »).

Légende « État réel » : *Disponible* = prises jouables ; *Repli* = joue le son indiqué en attendant ; *Silencieux* = aucune ressource, diagnostic sans exception ; *non émis* = événement défini mais pas encore déclenché par le jeu.

## Sons V1 conservés

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `step` | Pas générique V1 | Repli de player.footstep | — | 1 disponible(s) | B1 | sample | — | joueur (40 m) | random, max 16 | — | Disponible (1/1) |
| `collect` | Collecte V1 | Action playSound des modèles d’interaction | — | 1 disponible(s) | B1 | sample | — | monde (40 m) | random, max 16 | — | Disponible (1/1) |
| `mission` | Mission V1 | Action playSound de livraison | — | 1 disponible(s) | B1 | sample | — | monde (40 m) | random, max 16 | — | Disponible (1/1) |
| `lever` | Mécanisme V1 | Action playSound levier | — | 1 disponible(s) | B1 | sample | — | monde (40 m) | random, max 16 | — | Disponible (1/1) |
| `water` | Eau V1 (bruit filtré) | Repli de ambience.water.river | — | 1 disponible(s) | B1 | sample | — | boucle globale (40 m) | random, max 16 | — | Disponible (1/1) |
| `rain` | Pluie V1 (bruit blanc) | Repli de weather.rain | — | 1 disponible(s) | B1 | sample | — | boucle globale (40 m) | random, max 16 | — | Disponible (1/1) |

## Déplacements

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `player.footstep` | Pas du joueur selon la surface | Routeur : distance parcourue au sol (0,9 m marche / 1,25 m course, ≥ 200 ms) | surface, movement, intensity, wet | 27 prévue(s) | B1 | sample | 0.12–0.45 s | joueur (25 m) | shuffle, max 3, ±0.4 demi-ton, ±10 % gain | partagé avec `water.exit` | Repli → `step` |
| `player.jump` | Impulsion de saut | Routeur : passage sol → air avec vitesse verticale > 1,5 m/s | surface, movement | 2 prévue(s) | B1 | sample | 0.15–0.35 s | joueur (25 m) | shuffle, cooldown 150 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `player.land` | Atterrissage | Routeur : air/planage → sol ; intensité selon la vitesse de chute | surface, intensity | 3 prévue(s) | B1 | sample | 0.2–0.6 s | joueur (25 m) | shuffle, cooldown 120 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Repli → `step` |
| `player.glide.deploy` | Déploiement des membranes de planage | Routeur : air → planage | movement | 2 prévue(s) | B1 | sample | 0.2–0.45 s | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | partagé avec `player.glide.fold` | Silencieux (à produire) |
| `player.glide.fold` | Repli des membranes | Routeur : planage → air/sol | movement | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×0.9 hauteur ×0.8 gain | Silencieux (à produire) |
| `player.glide.wind` | Souffle d’air pendant le planage (boucle) | Routeur : boucle d’état tant que le mode est « glide », gain selon la vitesse | movement | 0 (réutilisation) | B1 | sample | — | non | random, max 3, ±10 % gain | réutilise `amb-wind-light` ×1.15 hauteur ×0.8 gain | Silencieux (à produire) |
| `player.slide` | Glissade | Futur : glissade sur pente/neige (pas encore de mode « slide ») | surface | 1 prévue(s) | post-B1 | sample | 0.5–1 s | joueur (25 m) | shuffle, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Eau

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `water.enter` | Entrée dans l’eau | Routeur : sol/air → nage/plongée ; intensité selon la chute | intensity | 3 prévue(s) | B1 | sample | 0.4–1.2 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `water.swim` | Brasse de nage | Routeur : distance en nage (1,6 m, ≥ 450 ms) | movement | 3 prévue(s) | B1 | sample | 0.4–0.8 s | joueur (30 m) | shuffle, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | partagé avec `fauna.fish.splash` | Silencieux (à produire) |
| `water.dive` | Plongée sous la surface | Routeur : nage → plongée | — | 1 prévue(s) | B1 | sample | 0.5–1 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `water.surface` | Remontée à la surface | Routeur : plongée → nage | — | 1 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `water.exit` | Sortie de l’eau | Routeur : nage/plongée → sol/air | surface | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `fs-water` ×0.95 hauteur ×1.1 gain | Silencieux (à produire) |
| `water.lap` | Clapotis ponctuel au bord de l’eau | Couche ponctuelle des ambiances lac/rivière/côte | place | 2 prévue(s) | post-B1 | sample | 0.5–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.6 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `water.rapids` | Rapides (boucle locale) | Émetteur sur un tronçon de rapides (réseau d’eau) | place | 0 (réutilisation) | post-B1 | sample | — | monde (40 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `amb-waterfall` ×1.15 hauteur ×0.7 gain | Silencieux (à produire) · non émis (prévu) |

## Ambiances

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ambience.underwater` | Ambiance sous-marine (boucle) | Routeur : caméra immergée ou plongée | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | non | random, max 2 | — | Silencieux (à produire) |
| `ambience.cave` | Fond de mine/grotte (boucle) | Profil d’ambiance « mine » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.cave.drip` | Gouttes souterraines | Couche ponctuelle du profil « mine » | place | 2 prévue(s) | B1 | sample | 0.2–0.8 s | non | random, cooldown 1500 ms, max 2, ±1 demi-ton, ±30 % gain | — | Silencieux (à produire) |
| `ambience.cave.air` | Courant d’air souterrain | Couche du profil « mine » | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.7 hauteur ×0.5 gain | Silencieux (à produire) |
| `ambience.cave.rumble` | Grondement lointain | Couche ponctuelle du profil « mine » | place | 1 prévue(s) | post-B1 | sample | 1.5–3 s | non | random, cooldown 1500 ms, max 2, ±0.5 demi-ton | — | Silencieux (à produire) |
| `ambience.windmill` | Moulin à vent (boucle) | Émetteur lié au moulin à vent | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.watermill` | Moulin à eau (boucle) | Émetteur lié au moulin de la rivière | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.fire` | Feu (boucle) | Émetteur sur feu de camp/cheminée | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (20 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.forest` | Forêt (fond) | Profil « forêt » | place, time | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.plain` | Plaine / vallée / ferme (fond) | Profils « plaine », « vallée », « ferme » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.swamp` | Marais (fond) | Profil « marais » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.desert` | Désert (fond) | Profil « désert » | place | 0 (réutilisation) | post-B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-strong` ×1.05 hauteur ×0.8 gain | Silencieux (à produire) |
| `ambience.volcano` | Volcan (fond) | Profil « volcan » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.sea` | Plage / océan / côte (fond) | Profils « côte », « plage », « océan » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.water.river` | Rivière (fond) | Profil global : eau proche | nearWater, place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | partagé avec `farm.irrigate` | Repli → `water` |
| `ambience.waterfall` | Cascade (fond/émetteur) | Profil « cascade » ou émetteur WaterNetwork | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | partagé avec `water.rapids` | Silencieux (à produire) |
| `ambience.lake` | Lac (fond) | Profil « lac » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.village` | Village (fond) | Profil « village » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.ruins` | Ruines (fond) | Profil « ruines » | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.85 hauteur ×0.7 gain | Silencieux (à produire) |
| `ambience.night` | Nuit (grillons) | Profil global : time = night | time | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |

## Navigation

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `boat.move` | Bateau en déplacement (boucle) | Routeur : boucle d’état à bord si vitesse > 0,4 m/s | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | non | random, cooldown 300 ms, max 2, ±10 % gain | — | Silencieux (à produire) |
| `boat.board` | Embarquement | Routeur : à bord = vrai | — | 1 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | partagé avec `boat.disembark` | Silencieux (à produire) |
| `boat.disembark` | Débarquement | Routeur : à bord = faux | — | 0 (réutilisation) | B1 | sample | — | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | réutilise `boat-board` ×0.92 hauteur | Silencieux (à produire) |
| `boat.creak` | Craquement de coque | Couche ponctuelle du profil « navigation » | activity | 2 prévue(s) | post-B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 3000 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `boat.collision` | Collision du bateau | Futur : choc de la coque contre un rivage/obstacle | intensity | 1 prévue(s) | post-B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Mines

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mine.hit` | Coup d’outil selon la matière | Creusement validé (ActivityRuntime.dig) ; matière de la cellule visée | material, tool | 10 prévue(s) | B1 | sample | 0.2–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-hit-softrock` ×0.9 gain | Silencieux (à produire) |
| `mine.crack` | Fissuration | Futur : creusement en plusieurs coups (non utilisé, une action creuse une cellule) | material | 1 prévue(s) | post-B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `mine.cell.excavated` | Cellule excavée (éboulis) | Creusement validé (après mine.hit) | material | 2 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `mine.resource.collect` | Récolte de pierre/minerai | Creusement validé avec récompense | material | 1 prévue(s) | B1 | sample | 0.25–0.5 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `mine.resource.crystal` | Récolte de cristal | Creusement validé d’une cellule de cristal | — | 1 prévue(s) | post-B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `mine.tool.switch` | Changement d’outil | Futur : sélection d’outil | tool | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `tools` | Silencieux (à produire) · non émis (prévu) |
| `mine.action.denied` | Action impossible (roche mère, hors de portée) | Creusement refusé | material | 1 prévue(s) | post-B1 | sample | 0.2–0.4 s | non | avoid-repeat, cooldown 400 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Repli → `ui.error` |
| `mine.enter` | Entrée dans une mine | Routeur : espace de mine atteint | place | 1 prévue(s) | post-B1 | sample | 0.8–1.6 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | partagé avec `mine.exit` | Silencieux (à produire) |
| `mine.exit` | Sortie de mine | Routeur : retour en surface | place | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-enter` ×1.1 hauteur | Silencieux (à produire) |
| `mine.level.change` | Escalier / puits / échelle | Routeur : changement de niveau de mine | surface | 1 prévue(s) | post-B1 | sample | 0.5–1 s | joueur (25 m) | avoid-repeat, cooldown 500 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Repli → `step` |
| `mine.discovery` | Découverte souterraine (chatoiement) | Futur : première découverte de cristal d’un niveau (complète le thème « discovery ») | — | 1 prévue(s) | post-B1 | sample | 1–2 s | non | avoid-repeat, cooldown 5000 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Agriculture

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `farm.till` | Travail du sol | Futur : action « préparer le sol » | surface | 1 prévue(s) | post-B1 | sample | 0.4–0.8 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.plant` | Semis | Action ferme « plant » validée | objectKind | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | partagé avec `farm.fertilize` | Silencieux (à produire) |
| `farm.water` | Arrosage à l’arrosoir | Action ferme « water » validée | objectKind | 2 prévue(s) | B1 | sample | 0.8–1.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `farm.irrigate` | Irrigation (rigole, boucle) | Futur : émetteur de canal d’irrigation | — | 0 (réutilisation) | B1 | sample | — | monde (20 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `amb-river` ×1.3 hauteur ×0.5 gain | Silencieux (à produire) · non émis (prévu) |
| `farm.weed` | Désherbage | Futur : action désherber | — | 1 prévue(s) | B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | partagé avec `farm.clear` | Silencieux (à produire) · non émis (prévu) |
| `farm.clear` | Nettoyage de parcelle | Action ferme « clear » validée | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `weed` | Silencieux (à produire) |
| `farm.fertilize` | Fertilisation | Futur : action fertiliser | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `plant` ×0.9 hauteur | Silencieux (à produire) · non émis (prévu) |
| `farm.cut` | Coupe (sécateur) | Futur : taille/coupe | — | 1 prévue(s) | post-B1 | sample | 0.2–0.4 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.pick` | Cueillette | Futur : cueillette fruits/légumes | objectKind | 2 prévue(s) | post-B1 | sample | 0.25–0.5 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.harvest` | Récolte | Action ferme « harvest » validée ; objectKind = culture | objectKind | 3 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `farm.basket` | Panier | Futur : dépôt dans un panier/coffre de ferme | — | 1 prévue(s) | post-B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.seedbag` | Sac de graines | Changement de culture sélectionnée | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `bag` ×1.1 hauteur | Silencieux (à produire) |
| `farm.tools` | Outils | Futur : prise/rangement d’outil | tool | 1 prévue(s) | post-B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | partagé avec `mine.tool.switch` | Silencieux (à produire) · non émis (prévu) |
| `farm.ripe` | Signal de maturité | Futur : parcelle mûre à proximité | — | 1 disponible(s) | B1 | procedural | 0.6 s | non | avoid-repeat, cooldown 5000 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |

## PNJ

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `npc.vocalize` | Vocalisation de dialogue | Ouverture d’un dialogue avec un PNJ | species | 3 prévue(s) | B1 | sample | 0.2–0.6 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `npc.squirrel.chatter` | Écureuil (cri, PNJ) | Futur : activité/émotion d’un PNJ écureuil | species, state | 3 prévue(s) | post-B1 | sample | 0.3–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `npc.expression` | Expressions des personnages | Futur : changement d’émotion (A maintenu, dialogues) | state, species | 3 prévue(s) | post-B1 | sample | 0.2–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `npc.activity` | Activités des PNJ (fouiller, grignoter) | Futur : routines PNJ | state | 2 prévue(s) | post-B1 | sample | 0.5–1.2 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Faune

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fauna.bird.song` | Chants d’oiseaux | Couche ponctuelle forêt/plaine (jour) | time, place | 3 prévue(s) | B1 | sample | 0.8–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.bird.flock` | Envol d’oiseaux | Futur : fuite des oiseaux décoratifs | — | 1 prévue(s) | post-B1 | sample | 0.8–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `fauna.owl` | Chouette (nuit) | Couche ponctuelle forêt de nuit | time | 1 prévue(s) | post-B1 | sample | 1–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.frog` | Grenouilles | Couche ponctuelle marais/lac | place, time | 1 prévue(s) | post-B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.insects` | Insectes (bourdonnement) | Couche ponctuelle plaine/ferme (jour) | place, time | 1 prévue(s) | post-B1 | sample | 1–2.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.fish.splash` | Poisson qui saute | Couche ponctuelle lac/rivière | place | 0 (réutilisation) | B1 | sample | — | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | réutilise `swim` ×1.3 hauteur ×0.5 gain | Silencieux (à produire) |
| `fauna.gull` | Mouettes (côte) | Couche ponctuelle plage/côte | place | 1 prévue(s) | post-B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.mammal` | Mammifères (renard, cerf…) | Futur : faune mammifère | species | 2 prévue(s) | post-B1 | sample | 0.5–1.5 s | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | partagé avec `mount.vocalize` | Silencieux (à produire) · non émis (prévu) |
| `mount.vocalize` | Animal montable (futur) | Futur : montures | species | 0 (réutilisation) | post-B1 | sample | — | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | réutilise `mammal` ×0.85 hauteur | Silencieux (à produire) · non émis (prévu) |

## Objets et interactions

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `interaction.door.open` | Ouverture de porte | Interaction « door » (état open = vrai) | objectKind | 2 prévue(s) | B1 | sample | 0.5–1.1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.door.close` | Fermeture de porte | Interaction « door » (état open = faux) | objectKind | 1 prévue(s) | B1 | sample | 0.4–0.9 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.chest.open` | Coffre | Futur : coffre interactif | — | 1 prévue(s) | post-B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.lever` | Levier | Modèle « levier » (choix dans Interactions) | — | 1 prévue(s) | B1 | sample | 0.3–0.7 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Repli → `lever` |
| `interaction.gears` | Engrenages (boucle) | Émetteur sur mécanisme actif | — | 1 prévue(s) | post-B1 | sample | 2–4 s (boucle) | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | partagé avec `ruins.mechanism` | Silencieux (à produire) · non émis (prévu) |
| `interaction.bridge` | Pont (grincement/abaissement) | Futur : pont mobile / passage | — | 1 prévue(s) | post-B1 | sample | 0.8–1.6 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.torch` | Torche allumée | Futur : allumer une torche | — | 1 prévue(s) | post-B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.collect` | Collecte de matériaux | Action playSound de collecte (V2) | objectKind | 2 prévue(s) | B1 | sample | 0.25–0.5 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Repli → `collect` |
| `ruins.mechanism` | Mécanisme de ruines | Futur : porte/dalle de ruine | — | 0 (réutilisation) | post-B1 | sample | — | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | réutilise `gears` ×0.7 hauteur | Silencieux (à produire) · non émis (prévu) |

## Interface

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ui.inventory.open` | Ouverture de l’inventaire | Ouverture du sac (panneau partie) | — | 1 prévue(s) | post-B1 | sample | 0.25–0.5 s | non | random, cooldown 60 ms, max 2 | partagé avec `farm.seedbag`, `ui.inventory.close` | Silencieux (à produire) · non émis (prévu) |
| `ui.inventory.close` | Fermeture de l’inventaire | Fermeture du sac | — | 0 (réutilisation) | post-B1 | sample | — | non | random, cooldown 60 ms, max 2 | réutilise `bag` ×0.9 hauteur | Silencieux (à produire) · non émis (prévu) |
| `ui.confirm` | Validation interface | Bouton de confirmation | — | 1 disponible(s) | B1 | procedural | 0.18 s | non | random, cooldown 60 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ui.cancel` | Annulation interface | Bouton retour/annuler | — | 1 disponible(s) | B1 | procedural | 0.16 s | non | random, cooldown 60 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ui.error` | Action impossible | Action refusée (ferme, mine…) | — | 1 disponible(s) | B1 | procedural | 0.22 s | non | random, cooldown 300 ms, max 2 | — | Disponible (1/1) |
| `ui.save` | Sauvegarde | Partie sauvegardée | — | 1 disponible(s) | B1 | procedural | 0.5 s | non | random, cooldown 1000 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |

## Missions et énigmes

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mission.accept` | Mission acceptée | Futur : début de mission (dialogue) | — | 1 prévue(s) | post-B1 | sample | 0.6–1.2 s | non | avoid-repeat, cooldown 300 ms, max 1 | — | Repli → `mission` · non émis (prévu) |
| `mission.complete` | Mission réussie (bruitage) | Livraison/objectif terminé, accompagne le thème « mission.success » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Pas de fichier propre : repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |
| `puzzle.step` | Étape d’énigme | Futur : mécanisme d’énigme correct | — | 1 prévue(s) | post-B1 | sample | 0.3–0.6 s | monde (30 m) | avoid-repeat, cooldown 300 ms, max 1 | — | Silencieux (à produire) · non émis (prévu) |
| `puzzle.solved` | Énigme résolue (bruitage) | Futur : énigme résolue, accompagne le thème « puzzle.solved » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |

## Magie

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `magic.activate` | Activation magique | Futur : phénomène/objet magique | — | 1 prévue(s) | post-B1 | sample | 0.8–1.6 s | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `magic.shimmer` | Aura magique (boucle) | Futur : émetteur de lieu magique | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Météo

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `weather.rain` | Pluie (boucle) | Profil global météo : weather = rain/storm | weather | 2 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Repli → `rain` |
| `weather.thunder` | Tonnerre | Couche ponctuelle météo : storm (état futur du climat) | weather | 2 prévue(s) | post-B1 | sample | 2–4 s | non | random, cooldown 8000 ms, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `weather.wind` | Vent (boucle) | Profils plaine/montagne/désert/ruines et météo venteuse | weather, place | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | partagé avec `player.glide.wind`, `ambience.cave.air`, `ambience.ruins`, `ambience.desert` | Silencieux (à produire) |

## Musique (MusicCue)

Sélection par contexte (priorité puis spécificité), transition sur la mesure, silences optionnels entre deux lectures ; un thème sans partition disponible est ignoré et la musique courante continue.

| Thème | Description | Condition | Priorité | Type | Partitions | Silence | Transition |
|---|---|---|---|---|---|---|---|
| `menu` | Menu principal | place=menu | 9 | loop | `music-menu` (PLANNED) | — | immediate |
| `explore.day` | Exploration de jour | time=dawn/day/dusk | 1 | loop | `day` (disponible), `music-day-b` (PLANNED) | — | bar |
| `explore.night` | Exploration de nuit | time=night | 1 | loop | `night` (disponible), `music-night-b` (PLANNED) | — | bar |
| `forest` | Forêt | place=forest, time=dawn/day/dusk | 2 | loop | `music-forest` (PLANNED) | 20–60 s | bar |
| `village` | Village | place=village | 2 | loop | `music-village` (PLANNED) | 15–45 s | bar |
| `farm` | Agriculture | activity=farming | 3 | loop | `music-farm` (PLANNED) | 20–60 s | bar |
| `mine` | Mine | place=mine | 3 | loop | `music-mine` (PLANNED) | 30–90 s | bar |
| `coast` | Côte / navigation | place=coast/beach/ocean | 2 | loop | `music-coast` (PLANNED) | 20–60 s | bar |
| `sailing` | Navigation (activité) | activity=sailing | 3 | loop | `music-coast` (PLANNED) | 20–60 s | bar |
| `swamp` | Marais | place=swamp | 2 | loop | `music-swamp` (PLANNED) | 30–90 s | bar |
| `desert` | Désert | place=desert | 2 | loop | `music-desert` (PLANNED) | 30–90 s | bar |
| `mountain` | Montagne / volcan | place=mountain/volcano | 2 | loop | `music-mountain` (PLANNED) | 30–90 s | bar |
| `ruins` | Ruines | place=ruins | 2 | loop | `music-ruins` (PLANNED) | 30–90 s | bar |
| `mission` | Mission / énigme en cours | activity=mission/puzzle | 4 | loop | `music-mission` (PLANNED) | — | bar |
| `magic` | Magie / phénomène | activity=magic | 4 | loop | `music-magic` (PLANNED) | — | bar |
| `discovery` | Découverte (jingle) | — | 8 | stinger | `music-discovery` (PLANNED) | — | bar |
| `mission.success` | Réussite de mission (jingle) | — | 8 | stinger | `music-success` (PLANNED) | — | bar |
| `puzzle.solved` | Énigme résolue (jingle) | — | 8 | stinger | `music-success` (PLANNED) | — | bar |
| `rare.phenomenon` | Phénomène rare (jingle) | — | 8 | stinger | `music-rare` (PLANNED) | — | immediate |

## Ambiances (AmbienceProfile)

Profils globaux (météo, eau proche, nuit) + **un seul** profil de lieu (le plus prioritaire/spécifique). Les couches en boucle sont plafonnées par `ambienceLayers` du budget (1 ou 2) ; les ponctuelles suivent un intervalle aléatoire.

| Profil | Condition | Global | Couches | Fondu |
|---|---|---|---|---|
| `weather` | — | oui | weather:`weather.rain` (weather=rain/storm) · oneshot:`weather.thunder` [12–40 s] (weather=storm) · weather:`weather.wind` (weather=wind/storm) | 2 s |
| `water-near` | — | oui | source:`ambience.water.river` (nearWater=true) | 1.5 s |
| `night` | — | oui | bed:`ambience.night` (time=night) | 3 s |
| `underwater` | place=underwater | non | bed:`ambience.underwater` | 0.5 s |
| `forest` | place=forest | non | bed:`ambience.forest` · oneshot:`fauna.bird.song` [4–14 s] (time=dawn/day) · oneshot:`fauna.owl` [15–45 s] (time=night) | 2 s |
| `plain` | place=plain/valley | non | bed:`ambience.plain` · oneshot:`fauna.bird.song` [8–24 s] (time=dawn/day) · oneshot:`fauna.insects` [10–30 s] (time=day) | 2 s |
| `farm` | place=farm | non | bed:`ambience.plain` · oneshot:`fauna.insects` [8–24 s] (time=day) | 2 s |
| `swamp` | place=swamp | non | bed:`ambience.swamp` · oneshot:`fauna.frog` [3–10 s] | 2 s |
| `desert` | place=desert | non | bed:`ambience.desert` | 2 s |
| `mountain` | place=mountain | non | bed:`weather.wind` | 2 s |
| `volcano` | place=volcano | non | bed:`ambience.volcano` · oneshot:`ambience.cave.rumble` [10–30 s] | 2 s |
| `coast` | place=coast/beach/ocean | non | bed:`ambience.sea` · oneshot:`fauna.gull` [10–30 s] (time=dawn/day/dusk) · oneshot:`water.lap` [5–15 s] | 2 s |
| `river` | place=river | non | bed:`ambience.plain` · oneshot:`fauna.fish.splash` [15–45 s] | 2 s |
| `lake` | place=lake | non | bed:`ambience.lake` · oneshot:`water.lap` [5–15 s] · oneshot:`fauna.frog` [8–20 s] (time=dusk/night) | 2 s |
| `waterfall` | place=waterfall | non | bed:`ambience.waterfall` | 2 s |
| `village` | place=village | non | bed:`ambience.village` · oneshot:`fauna.bird.song` [10–30 s] (time=dawn/day) | 2 s |
| `mine` | place=mine/cave | non | bed:`ambience.cave` · source:`ambience.cave.air` · oneshot:`ambience.cave.drip` [3–9 s] · oneshot:`ambience.cave.rumble` [25–70 s] | 1.5 s |
| `ruins` | place=ruins | non | bed:`ambience.ruins` | 2 s |
| `sailing` | activity=sailing | non | bed:`ambience.sea` · oneshot:`boat.creak` [6–16 s] | 2 s |

## Rapport — ressources audio à produire

Format, normalisation, boucles, licences et règles MIDI : section `conventions` du manifeste. Chaque ligne = un fichier ; les identifiants sont stables.

### Vague 1 — B1 (première tranche) : 54 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/movement/fs-grass-01.ogg` | fs-grass (1/3) | `player.footstep` | 0.15–0.3 s | non | Pas léger de petit animal sur herbe courte : froissement doux, attaque nette, aucune réverbération. |
| `audio/sfx/movement/fs-grass-02.ogg` | fs-grass (2/3) | `player.footstep` | 0.15–0.3 s | non | Pas léger de petit animal sur herbe courte : froissement doux, attaque nette, aucune réverbération. |
| `audio/sfx/movement/fs-grass-03.ogg` | fs-grass (3/3) | `player.footstep` | 0.15–0.3 s | non | Pas léger de petit animal sur herbe courte : froissement doux, attaque nette, aucune réverbération. |
| `audio/sfx/movement/fs-dirt-01.ogg` | fs-dirt (1/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur terre sèche tassée : contact mat, légère poussière, sans grain de gravier. |
| `audio/sfx/movement/fs-dirt-02.ogg` | fs-dirt (2/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur terre sèche tassée : contact mat, légère poussière, sans grain de gravier. |
| `audio/sfx/movement/fs-stone-01.ogg` | fs-stone (1/3) | `player.footstep` | 0.12–0.28 s | non | Pas sur pierre/roche : clic sec et court, petite queue sans écho de grotte (l’écho viendra de l’ambiance). |
| `audio/sfx/movement/fs-stone-02.ogg` | fs-stone (2/3) | `player.footstep` | 0.12–0.28 s | non | Pas sur pierre/roche : clic sec et court, petite queue sans écho de grotte (l’écho viendra de l’ambiance). |
| `audio/sfx/movement/fs-wood-01.ogg` | fs-wood (1/2) | `player.footstep` | 0.15–0.3 s | non | Pas sur planche de bois (pont, ponton, pont de bateau) : toc creux et chaleureux. |
| `audio/sfx/movement/fs-wood-02.ogg` | fs-wood (2/2) | `player.footstep` | 0.15–0.3 s | non | Pas sur planche de bois (pont, ponton, pont de bateau) : toc creux et chaleureux. |
| `audio/sfx/movement/fs-water-01.ogg` | fs-water (1/2) | `player.footstep` + `water.exit` | 0.2–0.4 s | non | Pas dans l’eau peu profonde : petite éclaboussure, gouttes, sans immersion. |
| `audio/sfx/movement/fs-water-02.ogg` | fs-water (2/2) | `player.footstep` + `water.exit` | 0.2–0.4 s | non | Pas dans l’eau peu profonde : petite éclaboussure, gouttes, sans immersion. |
| `audio/sfx/movement/jump-01.ogg` | jump (1/2) | `player.jump` | 0.15–0.35 s | non | Souffle d’impulsion très court (petit animal), léger « hop » sans voix humaine. |
| `audio/sfx/movement/land-soft-01.ogg` | land-soft (1/2) | `player.land` | 0.2–0.4 s | non | Réception souple sur pattes : contact feutré + petit frottement, générique toutes surfaces. |
| `audio/sfx/movement/land-soft-02.ogg` | land-soft (2/2) | `player.land` | 0.2–0.4 s | non | Réception souple sur pattes : contact feutré + petit frottement, générique toutes surfaces. |
| `audio/sfx/movement/glide-deploy-01.ogg` | glide-deploy (1/2) | `player.glide.deploy` + `player.glide.fold` | 0.2–0.45 s | non | Membrane/tissu qui se tend d’un coup : « flap » vif, aérien. |
| `audio/sfx/water/splash-small-01.ogg` | splash-small (1/2) | `water.enter` | 0.4–0.8 s | non | Éclaboussure moyenne d’un petit animal qui entre dans l’eau, gouttes retombantes. |
| `audio/sfx/water/splash-small-02.ogg` | splash-small (2/2) | `water.enter` | 0.4–0.8 s | non | Éclaboussure moyenne d’un petit animal qui entre dans l’eau, gouttes retombantes. |
| `audio/sfx/water/swim-01.ogg` | swim (1/3) | `water.swim` + `fauna.fish.splash` | 0.4–0.8 s | non | Brasse en surface : eau poussée, petit clapot régulier, sans respiration humaine. |
| `audio/sfx/water/swim-02.ogg` | swim (2/3) | `water.swim` + `fauna.fish.splash` | 0.4–0.8 s | non | Brasse en surface : eau poussée, petit clapot régulier, sans respiration humaine. |
| `audio/sfx/water/dive-01.ogg` | dive (1/1) | `water.dive` | 0.5–1 s | non | Passage sous l’eau : « bloup » feutré et bulles qui montent. |
| `audio/sfx/water/resurface-01.ogg` | resurface (1/1) | `water.surface` | 0.4–0.9 s | non | Sortie de tête hors de l’eau : ruissellement + petite inspiration animale. |
| `audio/sfx/water/boat-move-01.ogg` | boat-move (1/1) | `boat.move` | 4–8 s | oui | Boucle : eau qui glisse le long d’une petite coque en bois, régulière. |
| `audio/sfx/water/boat-board-01.ogg` | boat-board (1/1) | `boat.board` + `boat.disembark` | 0.4–0.9 s | non | Saut sur une barque : toc de bois + léger roulis d’eau. |
| `audio/sfx/mine/mine-hit-soil-01.ogg` | mine-hit-soil (1/2) | `mine.hit` | 0.2–0.45 s | non | Pioche dans la terre : impact mat, motte qui se détache. |
| `audio/sfx/mine/mine-hit-softrock-01.ogg` | mine-hit-softrock (1/2) | `mine.hit` | 0.2–0.45 s | non | Pioche sur roche tendre : choc sec, éclats fins. |
| `audio/sfx/mine/mine-hit-softrock-02.ogg` | mine-hit-softrock (2/2) | `mine.hit` | 0.2–0.45 s | non | Pioche sur roche tendre : choc sec, éclats fins. |
| `audio/sfx/mine/mine-hit-hardrock-01.ogg` | mine-hit-hardrock (1/2) | `mine.hit` | 0.2–0.45 s | non | Pioche sur roche dure : tintement plus aigu, résistance, peu de débris. |
| `audio/sfx/mine/mine-hit-ore-01.ogg` | mine-hit-ore (1/2) | `mine.hit` | 0.25–0.5 s | non | Pioche sur filon métallique : timbre métallique léger mêlé à la roche. |
| `audio/sfx/mine/mine-hit-crystal-01.ogg` | mine-hit-crystal (1/2) | `mine.hit` | 0.3–0.7 s | non | Pioche sur cristal : impact clair avec résonance cristalline courte. |
| `audio/sfx/mine/mine-rubble-01.ogg` | mine-rubble (1/2) | `mine.cell.excavated` | 0.4–1 s | non | Petits gravats qui tombent au sol de la galerie, bref. |
| `audio/sfx/mine/mine-collect-01.ogg` | mine-collect (1/1) | `mine.resource.collect` | 0.25–0.5 s | non | Pierre/minerai rangé dans le sac : clic + tissu. |
| `audio/ambience/amb-cave-01.ogg` | amb-cave (1/1) | `ambience.cave` | 6–8 s | oui | Boucle sans couture : air immobile, très légère rumeur grave. |
| `audio/ambience/drip-01.ogg` | drip (1/2) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/sfx/farm/plant-01.ogg` | plant (1/2) | `farm.plant` + `farm.fertilize` | 0.4–0.9 s | non | Graines qui tombent dans un sillon + petite tape de terre. |
| `audio/sfx/farm/watering-01.ogg` | watering (1/2) | `farm.water` | 0.8–1.6 s | non | Arrosoir qui verse en pluie fine sur la terre. |
| `audio/sfx/farm/weed-01.ogg` | weed (1/1) | `farm.weed` + `farm.clear` | 0.3–0.7 s | non | Arrachage de mauvaises herbes : racines + froissement. |
| `audio/sfx/farm/harvest-grain-01.ogg` | harvest-grain (1/2) | `farm.harvest` | 0.5–1 s | non | Faucille dans les épis de céréales : « swish » sec. |
| `audio/sfx/farm/harvest-01.ogg` | harvest (1/1) | `farm.harvest` | 0.4–0.9 s | non | Récolte générique : légume arraché + terre qui tombe. |
| `audio/sfx/npc/voc-squirrel-01.ogg` | voc-squirrel (1/3) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/npc/voc-squirrel-02.ogg` | voc-squirrel (2/3) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/fauna/bird-01.ogg` | bird (1/3) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/fauna/bird-02.ogg` | bird (2/3) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/objects/door-open-01.ogg` | door-open (1/2) | `interaction.door.open` | 0.5–1.1 s | non | Petite porte en bois qui pivote : grincement court + loquet. |
| `audio/sfx/objects/door-close-01.ogg` | door-close (1/1) | `interaction.door.close` | 0.4–0.9 s | non | Porte en bois qui se referme : toc + loquet. |
| `audio/sfx/objects/lever-01.ogg` | lever (1/1) | `interaction.lever` | 0.3–0.7 s | non | Levier en bois/métal qui bascule avec un cran. |
| `audio/sfx/objects/pickup-01.ogg` | pickup (1/2) | `interaction.collect` | 0.25–0.5 s | non | Ramassage d’un petit objet naturel (gland, branche) : froissement + clic doux. |
| `audio/ambience/amb-wind-light-01.ogg` | amb-wind-light (1/1) | `weather.wind` + `player.glide.wind`, `ambience.cave.air`, `ambience.ruins` | 6–8 s | oui | Boucle sans couture : brise légère, sans sifflement. |
| `audio/ambience/amb-forest-01.ogg` | amb-forest (1/1) | `ambience.forest` | 6–8 s | oui | Boucle sans couture : feuillage qui bruisse, air calme, sans oiseau marquant (les oiseaux sont une couche séparée). |
| `audio/ambience/amb-plain-01.ogg` | amb-plain (1/1) | `ambience.plain` | 6–8 s | oui | Boucle : espace ouvert, herbe agitée, très doux. |
| `audio/ambience/amb-river-01.ogg` | amb-river (1/1) | `ambience.water.river` + `farm.irrigate` | 6–8 s | oui | Boucle sans couture : ruisseau/rivière qui coule sur des galets. |
| `audio/ambience/amb-night-01.ogg` | amb-night (1/1) | `ambience.night` | 6–8 s | oui | Boucle sans couture : grillons lointains réguliers, calme nocturne. |
| `audio/music/music-mine.mid` | mine (1/1) | `music:mine` | 45–90 s | oui | Ambiance souterraine : clochette grave, harpe espacée, mystère doux, jamais angoissant. (60–72 BPM) |
| `audio/music/music-discovery.mid` | discovery (1/1) | `music:discovery` | 3–6 s | non | Jingle de découverte, 2 mesures, harpe montante + clochette finale. (libre) |
| `audio/music/music-success.mid` | mission.success (1/1) | `music:mission.success` + `music:puzzle.solved` | 3–6 s | non | Jingle de réussite chaleureux, cadence parfaite, flûte + pluck. (libre) |

### Vague 2 — bêta enrichie : 63 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/movement/fs-dirt-03.ogg` | fs-dirt (3/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur terre sèche tassée : contact mat, légère poussière, sans grain de gravier. |
| `audio/sfx/movement/fs-stone-03.ogg` | fs-stone (3/3) | `player.footstep` | 0.12–0.28 s | non | Pas sur pierre/roche : clic sec et court, petite queue sans écho de grotte (l’écho viendra de l’ambiance). |
| `audio/sfx/movement/fs-grass-wet-01.ogg` | fs-grass-wet (1/2) | `player.footstep` | 0.18–0.32 s | non | Pas sur herbe mouillée : froissement plus humide et légèrement collant que fs-grass. |
| `audio/sfx/movement/fs-grass-wet-02.ogg` | fs-grass-wet (2/2) | `player.footstep` | 0.18–0.32 s | non | Pas sur herbe mouillée : froissement plus humide et légèrement collant que fs-grass. |
| `audio/sfx/movement/fs-tallgrass-01.ogg` | fs-tallgrass (1/2) | `player.footstep` | 0.25–0.45 s | non | Passage dans herbe haute : froissement plus long, tiges qui frottent. |
| `audio/sfx/movement/fs-tallgrass-02.ogg` | fs-tallgrass (2/2) | `player.footstep` | 0.25–0.45 s | non | Passage dans herbe haute : froissement plus long, tiges qui frottent. |
| `audio/sfx/movement/fs-mud-01.ogg` | fs-mud (1/2) | `player.footstep` | 0.2–0.4 s | non | Pas dans la boue / terre détrempée : succion légère, humide. |
| `audio/sfx/movement/fs-mud-02.ogg` | fs-mud (2/2) | `player.footstep` | 0.2–0.4 s | non | Pas dans la boue / terre détrempée : succion légère, humide. |
| `audio/sfx/movement/fs-sand-01.ogg` | fs-sand (1/2) | `player.footstep` | 0.18–0.35 s | non | Pas sur sable sec de plage : crissement fin et étouffé. |
| `audio/sfx/movement/fs-sand-02.ogg` | fs-sand (2/2) | `player.footstep` | 0.18–0.35 s | non | Pas sur sable sec de plage : crissement fin et étouffé. |
| `audio/sfx/movement/fs-gravel-01.ogg` | fs-gravel (1/2) | `player.footstep` | 0.18–0.35 s | non | Pas sur gravier de chemin : petits cailloux qui roulent. |
| `audio/sfx/movement/fs-gravel-02.ogg` | fs-gravel (2/2) | `player.footstep` | 0.18–0.35 s | non | Pas sur gravier de chemin : petits cailloux qui roulent. |
| `audio/sfx/movement/jump-02.ogg` | jump (2/2) | `player.jump` | 0.15–0.35 s | non | Souffle d’impulsion très court (petit animal), léger « hop » sans voix humaine. |
| `audio/sfx/movement/land-heavy-01.ogg` | land-heavy (1/1) | `player.land` | 0.3–0.6 s | non | Réception lourde après une longue chute : impact plus grave, sans dégâts ni cri. |
| `audio/sfx/movement/glide-deploy-02.ogg` | glide-deploy (2/2) | `player.glide.deploy` + `player.glide.fold` | 0.2–0.45 s | non | Membrane/tissu qui se tend d’un coup : « flap » vif, aérien. |
| `audio/sfx/water/splash-big-01.ogg` | splash-big (1/1) | `water.enter` | 0.6–1.2 s | non | Plongeon depuis une hauteur : impact plus ample, bulles. |
| `audio/sfx/water/swim-03.ogg` | swim (3/3) | `water.swim` + `fauna.fish.splash` | 0.4–0.8 s | non | Brasse en surface : eau poussée, petit clapot régulier, sans respiration humaine. |
| `audio/sfx/water/lap-01.ogg` | lap (1/2) | `water.lap` | 0.5–1.5 s | non | Petite vague qui lèche une berge ou une coque, calme. |
| `audio/sfx/water/lap-02.ogg` | lap (2/2) | `water.lap` | 0.5–1.5 s | non | Petite vague qui lèche une berge ou une coque, calme. |
| `audio/ambience/amb-underwater-01.ogg` | amb-underwater (1/1) | `ambience.underwater` | 6–8 s | oui | Boucle sans couture : grondement grave étouffé, bulles rares, aucune musique. |
| `audio/sfx/water/boat-creak-01.ogg` | boat-creak (1/2) | `boat.creak` | 0.6–1.5 s | non | Grincement de bois de petite barque, doux. |
| `audio/sfx/water/boat-creak-02.ogg` | boat-creak (2/2) | `boat.creak` | 0.6–1.5 s | non | Grincement de bois de petite barque, doux. |
| `audio/sfx/mine/mine-hit-soil-02.ogg` | mine-hit-soil (2/2) | `mine.hit` | 0.2–0.45 s | non | Pioche dans la terre : impact mat, motte qui se détache. |
| `audio/sfx/mine/mine-hit-hardrock-02.ogg` | mine-hit-hardrock (2/2) | `mine.hit` | 0.2–0.45 s | non | Pioche sur roche dure : tintement plus aigu, résistance, peu de débris. |
| `audio/sfx/mine/mine-hit-ore-02.ogg` | mine-hit-ore (2/2) | `mine.hit` | 0.25–0.5 s | non | Pioche sur filon métallique : timbre métallique léger mêlé à la roche. |
| `audio/sfx/mine/mine-hit-crystal-02.ogg` | mine-hit-crystal (2/2) | `mine.hit` | 0.3–0.7 s | non | Pioche sur cristal : impact clair avec résonance cristalline courte. |
| `audio/sfx/mine/mine-rubble-02.ogg` | mine-rubble (2/2) | `mine.cell.excavated` | 0.4–1 s | non | Petits gravats qui tombent au sol de la galerie, bref. |
| `audio/sfx/mine/mine-crystal-01.ogg` | mine-crystal (1/1) | `mine.resource.crystal` | 0.5–1.2 s | non | Petit carillon cristallin, gratifiant, sans mélodie. |
| `audio/sfx/mine/mine-denied-01.ogg` | mine-denied (1/1) | `mine.action.denied` | 0.2–0.4 s | non | Coup qui rebondit sur une roche indestructible : « tonk » mat. |
| `audio/sfx/mine/mine-enter-01.ogg` | mine-enter (1/1) | `mine.enter` + `mine.exit` | 0.8–1.6 s | non | Changement d’air : souffle qui se resserre, très discret. |
| `audio/sfx/mine/ladder-01.ogg` | ladder (1/1) | `mine.level.change` | 0.5–1 s | non | Échelle en bois qui grince sous de petites pattes. |
| `audio/ambience/drip-02.ogg` | drip (2/2) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/ambience/rumble-01.ogg` | rumble (1/1) | `ambience.cave.rumble` | 1.5–3 s | non | Grondement sourd et lointain, rassurant (pas d’effondrement). |
| `audio/sfx/farm/plant-02.ogg` | plant (2/2) | `farm.plant` + `farm.fertilize` | 0.4–0.9 s | non | Graines qui tombent dans un sillon + petite tape de terre. |
| `audio/sfx/farm/watering-02.ogg` | watering (2/2) | `farm.water` | 0.8–1.6 s | non | Arrosoir qui verse en pluie fine sur la terre. |
| `audio/sfx/farm/harvest-grain-02.ogg` | harvest-grain (2/2) | `farm.harvest` | 0.5–1 s | non | Faucille dans les épis de céréales : « swish » sec. |
| `audio/ambience/amb-windmill-01.ogg` | amb-windmill (1/1) | `ambience.windmill` | 4–8 s | oui | Boucle : ailes qui tournent, bois qui grince en rythme lent. |
| `audio/ambience/amb-watermill-01.ogg` | amb-watermill (1/1) | `ambience.watermill` | 4–8 s | oui | Boucle : roue à aubes, eau qui retombe, axe en bois. |
| `audio/sfx/npc/voc-squirrel-03.ogg` | voc-squirrel (3/3) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/fauna/bird-03.ogg` | bird (3/3) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/fauna/owl-01.ogg` | owl (1/1) | `fauna.owl` | 1–2 s | non | Hululement lointain et doux. |
| `audio/sfx/fauna/frog-01.ogg` | frog (1/1) | `fauna.frog` | 0.5–1.2 s | non | Coassement isolé de grenouille. |
| `audio/sfx/fauna/insect-01.ogg` | insect (1/1) | `fauna.insects` | 1–2.5 s | non | Bourdon qui passe, doppler léger. |
| `audio/sfx/fauna/gull-01.ogg` | gull (1/1) | `fauna.gull` | 0.6–1.5 s | non | Cri de mouette lointain. |
| `audio/sfx/objects/door-open-02.ogg` | door-open (2/2) | `interaction.door.open` | 0.5–1.1 s | non | Petite porte en bois qui pivote : grincement court + loquet. |
| `audio/ambience/amb-fire-01.ogg` | amb-fire (1/1) | `ambience.fire` | 4–8 s | oui | Boucle : crépitement de petit feu de bois. |
| `audio/sfx/objects/pickup-02.ogg` | pickup (2/2) | `interaction.collect` | 0.25–0.5 s | non | Ramassage d’un petit objet naturel (gland, branche) : froissement + clic doux. |
| `audio/sfx/ui/bag-01.ogg` | bag (1/1) | `ui.inventory.open` + `farm.seedbag`, `ui.inventory.close` | 0.25–0.5 s | non | Sac en tissu qu’on ouvre. |
| `audio/ambience/amb-rain-light-01.ogg` | amb-rain-light (1/1) | `weather.rain` | 6–8 s | oui | Boucle sans couture : pluie modérée sur feuillage et sol. |
| `audio/ambience/amb-wind-strong-01.ogg` | amb-wind-strong (1/1) | `weather.wind` + `ambience.desert` | 6–8 s | oui | Boucle : vent fort d’altitude, rafales lentes. |
| `audio/ambience/amb-swamp-01.ogg` | amb-swamp (1/1) | `ambience.swamp` | 6–8 s | oui | Boucle : eau stagnante, bulles rares, insectes très lointains. |
| `audio/ambience/amb-sea-01.ogg` | amb-sea (1/1) | `ambience.sea` | 6–8 s | oui | Boucle sans couture : vagues régulières sur le sable, ressac doux. |
| `audio/ambience/amb-waterfall-01.ogg` | amb-waterfall (1/1) | `ambience.waterfall` + `water.rapids` | 6–8 s | oui | Boucle : chute d’eau continue, large bande mais sans souffle agressif. |
| `audio/ambience/amb-lake-01.ogg` | amb-lake (1/1) | `ambience.lake` | 6–8 s | oui | Boucle : eau calme qui clapote très doucement. |
| `audio/ambience/amb-village-01.ogg` | amb-village (1/1) | `ambience.village` | 6–8 s | oui | Boucle : vie de village animal paisible, bois, outils lointains, aucune voix humaine. |
| `audio/music/music-menu.mid` | menu (1/1) | `music:menu` | 32–64 s | oui | Thème d’accueil chaleureux, flûte + harpe, boucle propre sur 8–16 mesures. (72–84 BPM) |
| `audio/music/music-forest.mid` | forest (1/1) | `music:forest` | 45–90 s | oui | Motif boisé à la flûte, pizzicati, mode dorien, sans percussion forte. (76–88 BPM) |
| `audio/music/music-village.mid` | village (1/1) | `music:village` | 45–90 s | oui | Air de village enjoué, pluck + percussion douce, carrure régulière. (92–104 BPM) |
| `audio/music/music-farm.mid` | farm (1/1) | `music:farm` | 45–90 s | oui | Motif pastoral, harpe + flûte, rythme de travail paisible. (88–100 BPM) |
| `audio/music/music-coast.mid` | coast (1/1) | `music:coast` + `music:sailing` | 45–90 s | oui | Houle en 6/8, flûte ample et harpe ondulante. (80–92 BPM) |
| `audio/music/music-mountain.mid` | mountain (1/1) | `music:mountain` | 45–90 s | oui | Grand espace : harpe en arpèges larges, flûte lointaine. (64–76 BPM) |
| `audio/music/music-ruins.mid` | ruins (1/1) | `music:ruins` | 45–90 s | oui | Mystère ancien : clochettes, intervalles de quarte, rares percussions. (60–70 BPM) |
| `audio/music/music-mission.mid` | mission (1/1) | `music:mission` | 32–64 s | oui | Motif de réflexion léger, pizzicati, boucle courte non lassante. (96–108 BPM) |

### Vague 3 — optionnelle / ultérieure : 43 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/movement/fs-metal-01.ogg` | fs-metal (1/2) | `player.footstep` | 0.15–0.3 s | non | Pas sur grille/plaque métallique : tintement court et sourd, sans résonance longue. |
| `audio/sfx/movement/fs-metal-02.ogg` | fs-metal (2/2) | `player.footstep` | 0.15–0.3 s | non | Pas sur grille/plaque métallique : tintement court et sourd, sans résonance longue. |
| `audio/sfx/movement/fs-snow-01.ogg` | fs-snow (1/2) | `player.footstep` | 0.2–0.4 s | non | Pas dans neige fraîche : compression feutrée (neige éventuelle). |
| `audio/sfx/movement/fs-snow-02.ogg` | fs-snow (2/2) | `player.footstep` | 0.2–0.4 s | non | Pas dans neige fraîche : compression feutrée (neige éventuelle). |
| `audio/sfx/movement/slide-01.ogg` | slide (1/1) | `player.slide` | 0.5–1 s | non | Glissade sur terre/herbe : frottement continu court. |
| `audio/sfx/water/boat-bump-01.ogg` | boat-bump (1/1) | `boat.collision` | 0.4–0.9 s | non | Coque en bois qui heurte la rive : toc sourd sans casse. |
| `audio/sfx/mine/mine-crack-01.ogg` | mine-crack (1/1) | `mine.crack` | 0.3–0.7 s | non | Roche qui se fend : craquement sec. |
| `audio/sfx/mine/shimmer-hit-01.ogg` | shimmer-hit (1/1) | `mine.discovery` | 1–2 s | non | Scintillement montant très doux, complète le jingle MIDI. |
| `audio/sfx/farm/till-01.ogg` | till (1/1) | `farm.till` | 0.4–0.8 s | non | Binette dans la terre meuble. |
| `audio/sfx/farm/cut-01.ogg` | cut (1/1) | `farm.cut` | 0.2–0.4 s | non | Coup de sécateur sur tige tendre. |
| `audio/sfx/farm/pick-01.ogg` | pick (1/2) | `farm.pick` | 0.25–0.5 s | non | Fruit/légume détaché à la main : petit « pop » végétal. |
| `audio/sfx/farm/pick-02.ogg` | pick (2/2) | `farm.pick` | 0.25–0.5 s | non | Fruit/légume détaché à la main : petit « pop » végétal. |
| `audio/sfx/farm/basket-01.ogg` | basket (1/1) | `farm.basket` | 0.3–0.6 s | non | Osier qui reçoit des légumes. |
| `audio/sfx/farm/tools-01.ogg` | tools (1/1) | `farm.tools` + `mine.tool.switch` | 0.3–0.6 s | non | Outils en bois et métal qui s’entrechoquent doucement. |
| `audio/sfx/npc/squirrel-01.ogg` | squirrel (1/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/npc/squirrel-02.ogg` | squirrel (2/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/npc/squirrel-03.ogg` | squirrel (3/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/npc/expr-happy-01.ogg` | expr-happy (1/1) | `npc.expression` | 0.3–0.7 s | non | Petit son joyeux non verbal. |
| `audio/sfx/npc/expr-surprised-01.ogg` | expr-surprised (1/1) | `npc.expression` | 0.2–0.5 s | non | Petit sursaut non verbal. |
| `audio/sfx/npc/expr-sad-01.ogg` | expr-sad (1/1) | `npc.expression` | 0.4–0.8 s | non | Soupir doux non verbal. |
| `audio/sfx/npc/npc-activity-01.ogg` | npc-activity (1/2) | `npc.activity` | 0.5–1.2 s | non | Petit animal qui grignote/fouille les feuilles. |
| `audio/sfx/npc/npc-activity-02.ogg` | npc-activity (2/2) | `npc.activity` | 0.5–1.2 s | non | Petit animal qui grignote/fouille les feuilles. |
| `audio/sfx/fauna/flock-01.ogg` | flock (1/1) | `fauna.bird.flock` | 0.8–1.5 s | non | Battements d’ailes d’un petit groupe qui s’envole. |
| `audio/sfx/fauna/mammal-01.ogg` | mammal (1/2) | `fauna.mammal` + `mount.vocalize` | 0.5–1.5 s | non | Appel lointain d’un mammifère forestier, non agressif. |
| `audio/sfx/fauna/mammal-02.ogg` | mammal (2/2) | `fauna.mammal` + `mount.vocalize` | 0.5–1.5 s | non | Appel lointain d’un mammifère forestier, non agressif. |
| `audio/sfx/objects/chest-01.ogg` | chest (1/1) | `interaction.chest.open` | 0.5–1 s | non | Couvercle de coffre en bois, charnières. |
| `audio/sfx/objects/gears-01.ogg` | gears (1/1) | `interaction.gears` + `ruins.mechanism` | 2–4 s | oui | Boucle : engrenages en bois qui tournent lentement. |
| `audio/sfx/objects/bridge-01.ogg` | bridge (1/1) | `interaction.bridge` | 0.8–1.6 s | non | Pont en bois qui grince et se pose. |
| `audio/sfx/objects/torch-01.ogg` | torch (1/1) | `interaction.torch` | 0.5–1 s | non | Embrasement court d’une torche (« fwoosh »). |
| `audio/sfx/objects/mission-accept-01.ogg` | mission-accept (1/1) | `mission.accept` | 0.6–1.2 s | non | Petit motif d’engagement (2 notes boisées), distinct du succès. |
| `audio/sfx/objects/puzzle-step-01.ogg` | puzzle-step (1/1) | `puzzle.step` | 0.3–0.6 s | non | Pierre qui s’enclenche, clic net. |
| `audio/sfx/objects/magic-01.ogg` | magic (1/1) | `magic.activate` | 0.8–1.6 s | non | Activation douce : carillon + souffle scintillant. |
| `audio/sfx/objects/amb-shimmer-01.ogg` | amb-shimmer (1/1) | `magic.shimmer` | 4–8 s | oui | Boucle : nappe scintillante très légère. |
| `audio/ambience/amb-rain-heavy-01.ogg` | amb-rain-heavy (1/1) | `weather.rain` | 6–8 s | oui | Boucle : averse dense, sans tonnerre intégré. |
| `audio/ambience/thunder-01.ogg` | thunder (1/2) | `weather.thunder` | 2–4 s | non | Tonnerre lointain roulant, sans claquement violent. |
| `audio/ambience/thunder-02.ogg` | thunder (2/2) | `weather.thunder` | 2–4 s | non | Tonnerre lointain roulant, sans claquement violent. |
| `audio/ambience/amb-volcano-01.ogg` | amb-volcano (1/1) | `ambience.volcano` | 6–8 s | oui | Boucle : grondement tellurique grave, bouillonnement lointain. |
| `audio/music/music-day-b.mid` | explore.day (1/1) | `music:explore.day` | 40–80 s | oui | Variante jour légère et aérée, mêmes timbres que midi-day, tonalité voisine. (84–96 BPM) |
| `audio/music/music-night-b.mid` | explore.night (1/1) | `music:explore.night` | 40–80 s | oui | Variante nocturne clairsemée : clochette, harpe, longues respirations. (60–72 BPM) |
| `audio/music/music-swamp.mid` | swamp (1/1) | `music:swamp` | 45–90 s | oui | Motif lent et humide, notes tenues de flûte grave. (66–76 BPM) |
| `audio/music/music-desert.mid` | desert (1/1) | `music:desert` | 45–90 s | oui | Mode phrygien doux, pluck répétitif, espace. (70–80 BPM) |
| `audio/music/music-magic.mid` | magic (1/1) | `music:magic` | 32–64 s | oui | Nappe de clochettes et harpe en gammes par tons. (libre) |
| `audio/music/music-rare.mid` | rare.phenomenon (1/1) | `music:rare.phenomenon` | 4–8 s | non | Jingle étrange et merveilleux, clochettes en tons entiers. (libre) |

## Diagnostics du catalogue livré

149 diagnostics (85 avertissements : événements encore silencieux). Aucun n’est bloquant.

- « player.jump » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « player.glide.deploy » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « player.glide.fold » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « player.glide.wind » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « player.slide » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.enter » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.swim » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.dive » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.surface » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.exit » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.lap » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.underwater » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.rapids » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.move » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.board » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.disembark » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.creak » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.collision » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.hit » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.crack » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.cell.excavated » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.resource.collect » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.resource.crystal » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.tool.switch » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.enter » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.exit » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave.drip » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave.air » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave.rumble » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.discovery » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.till » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.plant » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.water » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.irrigate » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.weed » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.clear » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.fertilize » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.cut » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.pick » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.harvest » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.basket » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.seedbag » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.tools » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.windmill » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.watermill » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « npc.vocalize » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « npc.squirrel.chatter » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « npc.expression » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « npc.activity » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.bird.song » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.bird.flock » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.owl » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.frog » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.insects » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.fish.splash » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.gull » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « fauna.mammal » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mount.vocalize » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.door.open » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.door.close » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.chest.open » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.gears » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.bridge » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.fire » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « interaction.torch » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ui.inventory.open » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ui.inventory.close » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « puzzle.step » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ruins.mechanism » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « magic.activate » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « magic.shimmer » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « weather.thunder » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « weather.wind » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.forest » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.plain » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.swamp » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.desert » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.volcano » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.sea » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.waterfall » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.lake » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.village » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.ruins » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.night » n’a encore aucune ressource disponible : l’événement reste silencieux.
