# 38 — Inventaire audio V2 (généré)

> **Fichier généré** par `npm run generate:audio` depuis [`src/audio/catalog-source.ts`](../src/audio/catalog-source.ts). Ne pas éditer à la main : modifier la source puis régénérer. Architecture et contrats : [37 — Audio V2](37-AUDIO-V2-CATALOGUE.md). Manifeste de production : [`assets/audio/production-manifest.json`](../assets/audio/production-manifest.json).

## Résumé

- Catalogue `2.0.0-aud-v2` : **117 événements**, **19 thèmes musicaux**, **19 profils d’ambiance**.
- Jouables dès maintenant : **117/117 événements** (ressources disponibles ou repli explicite) ; les autres restent silencieux sans erreur.
- Ressources disponibles : 8 fichiers de la bibliothèque V1 (6 WAV + 2 MIDI, statut GENERATED) et 5 sons procéduraux (GENERATED, écoute non qualifiée).
- **À produire : 0 fichiers** (0 échantillons, 0 MIDI) — vague 1 / B1 : **0**, vague 2 : 0 (bêta enrichie = 0), vague 3 optionnelle : 0.
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
| `player.footstep` | Pas du joueur selon la surface | Routeur : distance parcourue au sol (0,9 m marche / 1,25 m course, ≥ 200 ms) | surface, movement, intensity, wet | 40 prévue(s) | B1 | sample | 0.12–0.45 s | joueur (25 m) | shuffle, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (43/43) |
| `player.jump` | Impulsion de saut | Routeur : passage sol → air avec vitesse verticale > 1,5 m/s | surface, movement | 2 prévue(s) | B1 | sample | 0.15–0.35 s | joueur (25 m) | shuffle, cooldown 150 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `player.land` | Atterrissage | Routeur : air/planage → sol ; intensité selon la vitesse de chute | surface, intensity | 5 prévue(s) | B1 | sample | 0.2–0.6 s | joueur (25 m) | shuffle, cooldown 120 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (5/5) |
| `player.glide.deploy` | Déploiement des membranes de planage | Routeur : air → planage | movement | 2 prévue(s) | B1 | sample | 0.2–0.45 s | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `player.glide.fold` | Repli des membranes | Routeur : planage → air/sol | movement | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×0.9 hauteur ×0.8 gain | Disponible (2/2) |
| `player.glide.wind` | Souffle d’air pendant le planage (boucle) | Routeur : boucle d’état tant que le mode est « glide », gain selon la vitesse | movement | 0 (réutilisation) | B1 | sample | — | non | random, max 3, ±10 % gain | réutilise `amb-wind-light` ×1.15 hauteur ×0.8 gain | Disponible (1/1) |
| `player.roll.start` | Le hamster se met en boule | Événement d’animation « roll-start » (sol → boule) | surface | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | shuffle, cooldown 250 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×0.8 hauteur ×0.8 gain | Disponible (2/2) |
| `player.roll.loop` | Roulade en boule (boucle) | Routeur : boucle d’état tant que le mode est « roll », gain selon la vitesse | surface | 0 (réutilisation) | B1 | sample | — | non | random, max 3, ±10 % gain | réutilise `slide` ×0.9 hauteur ×0.8 gain | Disponible (2/2) |
| `player.roll.stop` | Sortie de la boule | Événement d’animation « roll-stop » | surface | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | shuffle, cooldown 250 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×1.1 hauteur ×0.7 gain | Disponible (2/2) |
| `player.slide` | Glissade | Futur : glissade sur pente/neige (pas encore de mode « slide ») | surface | 2 prévue(s) | B1 | sample | 0.5–1 s | joueur (25 m) | shuffle, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |

## Eau

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `water.enter` | Entrée dans l’eau | Routeur : sol/air → nage/plongée ; intensité selon la chute | intensity | 5 prévue(s) | B1 | sample | 0.4–1.2 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (5/5) |
| `water.swim` | Brasse de nage | Routeur : distance en nage (1,6 m, ≥ 450 ms) | movement | 3 prévue(s) | B1 | sample | 0.4–0.8 s | joueur (30 m) | shuffle, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `water.dive` | Plongée sous la surface | Routeur : nage → plongée | — | 2 prévue(s) | B1 | sample | 0.5–1 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `water.surface` | Remontée à la surface | Routeur : plongée → nage | — | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `water.exit` | Sortie de l’eau | Routeur : nage/plongée → sol/air | surface | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `fs-water` ×0.95 hauteur ×1.1 gain | Disponible (3/3) |
| `water.lap` | Clapotis ponctuel au bord de l’eau | Couche ponctuelle des ambiances lac/rivière/côte | place | 3 prévue(s) | B1 | sample | 0.5–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.6 demi-ton, ±20 % gain | — | Disponible (3/3) |
| `water.rapids` | Rapides (boucle locale) | Émetteur sur un tronçon de rapides (réseau d’eau) | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | monde (40 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | Émetteurs WaterNetwork à brancher. | Disponible (1/1) · non émis (prévu) |
| `fishing.cast` | Lancer de canne | Événement d’animation « release » du lancer | — | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×1.35 hauteur ×0.8 gain | Disponible (2/2) |
| `fishing.float` | Le flotteur touche l’eau | Après le lancer (bouchon posé) | — | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `fish` ×1.3 hauteur ×0.7 gain | Disponible (2/2) |
| `fishing.bite` | Touche du poisson | Phase « bite » de la pêche | — | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `fish` ×0.9 hauteur ×1 gain | Disponible (2/2) |
| `fishing.reel` | Ferrage et moulinet | Événement d’animation « reel » | — | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `tools` ×1.5 hauteur ×0.8 gain | Disponible (2/2) |

## Ambiances

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ambience.underwater` | Ambiance sous-marine (boucle) | Routeur : caméra immergée ou plongée | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | non | random, max 2 | — | Disponible (1/1) |
| `ambience.cave` | Fond de mine/grotte (boucle) | Profil d’ambiance « mine » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.cave.drip` | Gouttes souterraines | Couche ponctuelle du profil « mine » | place | 4 prévue(s) | B1 | sample | 0.2–0.8 s | non | random, cooldown 1500 ms, max 2, ±1 demi-ton, ±30 % gain | — | Disponible (4/4) |
| `ambience.cave.air` | Courant d’air souterrain | Couche du profil « mine » | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.7 hauteur ×0.5 gain | Disponible (1/1) |
| `ambience.cave.rumble` | Grondement lointain | Couche ponctuelle du profil « mine » | place | 2 prévue(s) | B1 | sample | 1.5–3 s | non | random, cooldown 1500 ms, max 2, ±0.5 demi-ton | — | Disponible (2/2) |
| `ambience.windmill` | Moulin à vent (boucle) | Émetteur lié au moulin à vent | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.watermill` | Moulin à eau (boucle) | Émetteur lié au moulin de la rivière | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.fire` | Feu (boucle) | Émetteur sur feu de camp/cheminée | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | monde (20 m) | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.forest` | Forêt (fond) | Profil « forêt » | place, time | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (2/2) |
| `ambience.plain` | Plaine / vallée / ferme (fond) | Profils « plaine », « vallée », « ferme » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.swamp` | Marais (fond) | Profil « marais » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.desert` | Désert (fond) | Profil « désert » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.volcano` | Volcan (fond) | Profil « volcan » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.sea` | Plage / océan / côte (fond) | Profils « côte », « plage », « océan » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.water.river` | Rivière (fond) | Profil global : eau proche | nearWater, place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.waterfall` | Cascade (fond/émetteur) | Profil « cascade » ou émetteur WaterNetwork — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ambience.lake` | Lac (fond) | Profil « lac » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.village` | Village (fond) | Profil « village » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.ruins` | Ruines (fond) | Profil « ruines » — lieu pas encore fourni par la sonde de terrain | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.85 hauteur ×0.7 gain | Disponible (1/1) · non émis (prévu) |
| `ambience.night` | Nuit (grillons) | Profil global : time = night | time | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |

## Navigation

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `boat.move` | Bateau en déplacement (boucle) | Routeur : boucle d’état à bord si vitesse > 0,4 m/s | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | non | random, cooldown 300 ms, max 2, ±10 % gain | — | Disponible (1/1) |
| `boat.board` | Embarquement | Routeur : à bord = vrai | — | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `boat.disembark` | Débarquement | Routeur : à bord = faux | — | 0 (réutilisation) | B1 | sample | — | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | réutilise `boat-board` ×0.92 hauteur | Disponible (2/2) |
| `boat.creak` | Craquement de coque | Couche ponctuelle du profil « navigation » | activity | 3 prévue(s) | B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 3000 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `boat.collision` | Collision du bateau | Futur : choc de la coque contre un rivage/obstacle | intensity | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |

## Mines

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mine.tool.strike` | Frappe de l’outil (indépendante de la matière) | Creusement tenté : précède la réponse de la matière | tool | 3 prévue(s) | B1 | sample | 0.12–0.3 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `mine.hit` | Coup d’outil selon la matière | Creusement validé (ActivityRuntime.dig) ; matière de la cellule visée | material, tool | 17 prévue(s) | B1 | sample | 0.2–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-hit-softrock` ×0.9 gain | Disponible (21/21) |
| `mine.crack` | Fissuration | Futur : creusement en plusieurs coups (non utilisé, une action creuse une cellule) | material | 2 prévue(s) | B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `mine.cell.excavated` | Cellule excavée (éboulis) | Creusement validé (après mine.hit) | material | 3 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `mine.resource.collect` | Récolte de pierre/minerai | Creusement validé avec récompense | material | 2 prévue(s) | B1 | sample | 0.25–0.5 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.resource.crystal` | Récolte de cristal | Creusement validé d’une cellule de cristal | — | 2 prévue(s) | B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.tool.switch` | Changement d’outil | Futur : sélection d’outil | tool | 0 (réutilisation) | B1 | sample | — | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `tools` | Disponible (2/2) · non émis (prévu) |
| `tool.equip` | Sortir / ranger un outil (pioche, hache, canne…) | Événements d’animation « equip » / « unequip » | tool | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 200 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `tools` ×1.1 hauteur | Disponible (2/2) |
| `mine.action.denied` | Action impossible (roche mère, hors de portée) | Creusement refusé | material | 2 prévue(s) | B1 | sample | 0.2–0.4 s | non | avoid-repeat, cooldown 400 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.enter` | Entrée dans une mine | Routeur : espace de mine atteint | place | 1 prévue(s) | B1 | sample | 0.8–1.6 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (1/1) |
| `mine.exit` | Sortie de mine | Routeur : retour en surface | place | 0 (réutilisation) | B1 | sample | — | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-enter` ×1.1 hauteur | Disponible (1/1) |
| `mine.level.change` | Escalier / puits / échelle | Routeur : changement de niveau de mine | surface | 2 prévue(s) | B1 | sample | 0.5–1 s | joueur (25 m) | avoid-repeat, cooldown 500 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.discovery` | Découverte souterraine (chatoiement) | Futur : première découverte de cristal d’un niveau (complète le thème « discovery ») | — | 1 prévue(s) | B1 | sample | 1–2 s | non | avoid-repeat, cooldown 5000 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |

## Agriculture

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `tool.chop` | Coup de hache dans un tronc | Événement d’animation « impact » de la frappe latérale | tool | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 120 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `mine-strike` ×0.62 hauteur ×1 gain | Disponible (3/3) |
| `farm.till` | Travail du sol | Futur : action « préparer le sol » | surface | 3 prévue(s) | B1 | sample | 0.4–0.8 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) · non émis (prévu) |
| `farm.plant` | Semis | Action ferme « plant » validée | objectKind | 3 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `farm.water` | Arrosage à l’arrosoir | Action ferme « water » validée | objectKind | 3 prévue(s) | B1 | sample | 0.8–1.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `farm.irrigate` | Irrigation (rigole, boucle) | Futur : émetteur de canal d’irrigation | — | 1 prévue(s) | B1 | sample | 4–6 s (boucle) | monde (20 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |
| `farm.weed` | Désherbage | Futur : action désherber | — | 2 prévue(s) | B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `farm.clear` | Nettoyage de parcelle | Action ferme « clear » validée | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `weed` | Disponible (2/2) |
| `farm.fertilize` | Fertilisation | Futur : action fertiliser | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `plant` ×0.9 hauteur | Disponible (3/3) · non émis (prévu) |
| `farm.cut` | Coupe (sécateur) | Futur : taille/coupe | — | 2 prévue(s) | B1 | sample | 0.2–0.4 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `farm.pick` | Cueillette | Futur : cueillette fruits/légumes | objectKind | 3 prévue(s) | B1 | sample | 0.25–0.5 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) · non émis (prévu) |
| `farm.harvest` | Récolte | Action ferme « harvest » validée ; objectKind = culture | objectKind | 6 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (6/6) |
| `farm.basket` | Panier | Futur : dépôt dans un panier/coffre de ferme | — | 2 prévue(s) | B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `farm.seedbag` | Sac de graines | Changement de culture sélectionnée | — | 2 prévue(s) | B1 | sample | 0.3–0.6 s | non | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `farm.tools` | Outils | Futur : prise/rangement d’outil | tool | 2 prévue(s) | B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `farm.ripe` | Signal de maturité | Futur : parcelle mûre à proximité | — | 1 disponible(s) | B1 | procedural | 0.6 s | non | avoid-repeat, cooldown 5000 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |

## PNJ

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `npc.vocalize` | Vocalisation de dialogue | Ouverture d’un dialogue avec un PNJ | species | 4 prévue(s) | B1 | sample | 0.2–0.6 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Disponible (4/4) |
| `npc.squirrel.chatter` | Écureuil (cri, PNJ) | Futur : activité/émotion d’un PNJ écureuil | species, state | 3 prévue(s) | B1 | sample | 0.3–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Disponible (3/3) · non émis (prévu) |
| `npc.expression` | Expressions des personnages | Futur : changement d’émotion (A maintenu, dialogues) | state, species | 12 prévue(s) | B1 | sample | 0.2–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Disponible (12/12) · non émis (prévu) |
| `npc.activity` | Activités des PNJ (fouiller, grignoter) | Futur : routines PNJ | state | 2 prévue(s) | B1 | sample | 0.5–1.2 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |

## Faune

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fauna.bird.song` | Chants d’oiseaux | Couche ponctuelle forêt/plaine (jour) | time, place | 4 prévue(s) | B1 | sample | 0.8–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (4/4) |
| `fauna.bird.flock` | Envol d’oiseaux | Futur : fuite des oiseaux décoratifs | — | 1 prévue(s) | B1 | sample | 0.8–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (1/1) · non émis (prévu) |
| `fauna.owl` | Chouette (nuit) | Couche ponctuelle forêt de nuit | time | 2 prévue(s) | B1 | sample | 1–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (2/2) |
| `fauna.frog` | Grenouilles | Couche ponctuelle marais/lac | place, time | 3 prévue(s) | B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (3/3) |
| `fauna.insects` | Insectes (bourdonnement) | Couche ponctuelle plaine/ferme (jour) | place, time | 2 prévue(s) | B1 | sample | 1–2.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (2/2) |
| `fauna.fish.splash` | Poisson qui saute | Couche ponctuelle lac/rivière | place | 2 prévue(s) | B1 | sample | 0.3–0.7 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (2/2) |
| `fauna.gull` | Mouettes (côte) | Couche ponctuelle plage/côte | place | 2 prévue(s) | B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (2/2) |
| `fauna.mammal` | Mammifères (renard, cerf…) | Futur : faune mammifère | species | 2 prévue(s) | B1 | sample | 0.5–1.5 s | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Disponible (2/2) · non émis (prévu) |
| `mount.vocalize` | Animal montable (futur) | Futur : montures | species | 0 (réutilisation) | B1 | sample | — | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | réutilise `mammal` ×0.85 hauteur | Disponible (2/2) · non émis (prévu) |

## Objets et interactions

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `interaction.door.open` | Ouverture de porte | Interaction « door » (état open = vrai) | objectKind | 2 prévue(s) | B1 | sample | 0.5–1.1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (2/2) · non émis (prévu) |
| `interaction.door.close` | Fermeture de porte | Interaction « door » (état open = faux) | objectKind | 2 prévue(s) | B1 | sample | 0.4–0.9 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (2/2) · non émis (prévu) |
| `interaction.chest.open` | Coffre | Futur : coffre interactif | — | 2 prévue(s) | B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (2/2) · non émis (prévu) |
| `interaction.lever` | Levier | Modèle « levier » (choix dans Interactions) | — | 2 prévue(s) | B1 | sample | 0.3–0.7 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (2/2) |
| `interaction.gears` | Engrenages (boucle) | Émetteur sur mécanisme actif | — | 1 prévue(s) | B1 | sample | 2–4 s (boucle) | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (1/1) · non émis (prévu) |
| `interaction.bridge` | Pont (grincement/abaissement) | Futur : pont mobile / passage | — | 2 prévue(s) | B1 | sample | 0.8–1.6 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (2/2) · non émis (prévu) |
| `interaction.torch` | Torche allumée | Futur : allumer une torche | — | 1 prévue(s) | B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (1/1) · non émis (prévu) |
| `interaction.collect` | Collecte de matériaux | Action playSound de collecte (V2) | objectKind | 3 prévue(s) | B1 | sample | 0.25–0.5 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (3/3) |
| `ruins.mechanism` | Mécanisme de ruines | Futur : porte/dalle de ruine | — | 0 (réutilisation) | B1 | sample | — | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | réutilise `gears` ×0.7 hauteur | Disponible (1/1) · non émis (prévu) |

## Interface

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ui.inventory.open` | Ouverture de l’inventaire | Ouverture du sac (panneau partie) | — | 2 prévue(s) | B1 | sample | 0.25–0.5 s | non | random, cooldown 60 ms, max 2 | — | Disponible (2/2) · non émis (prévu) |
| `ui.inventory.close` | Fermeture de l’inventaire | Fermeture du sac | — | 0 (réutilisation) | B1 | sample | — | non | random, cooldown 60 ms, max 2 | réutilise `bag` ×0.9 hauteur | Disponible (2/2) · non émis (prévu) |
| `ui.confirm` | Validation interface | Bouton de confirmation | — | 1 disponible(s) | B1 | procedural | 0.18 s | non | random, cooldown 60 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ui.cancel` | Annulation interface | Bouton retour/annuler | — | 1 disponible(s) | B1 | procedural | 0.16 s | non | random, cooldown 60 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |
| `ui.error` | Action impossible | Action refusée (ferme, mine…) | — | 1 disponible(s) | B1 | procedural | 0.22 s | non | random, cooldown 300 ms, max 2 | — | Disponible (1/1) |
| `ui.save` | Sauvegarde | Partie sauvegardée | — | 1 disponible(s) | B1 | procedural | 0.5 s | non | random, cooldown 1000 ms, max 2 | — | Disponible (1/1) · non émis (prévu) |

## Missions et énigmes

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mission.accept` | Mission acceptée | Futur : début de mission (dialogue) | — | 1 prévue(s) | B1 | sample | 0.6–1.2 s | non | avoid-repeat, cooldown 300 ms, max 1 | — | Disponible (1/1) · non émis (prévu) |
| `mission.complete` | Mission réussie (bruitage) | Livraison/objectif terminé, accompagne le thème « mission.success » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Pas de fichier propre : repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |
| `puzzle.step` | Étape d’énigme | Futur : mécanisme d’énigme correct | — | 2 prévue(s) | B1 | sample | 0.3–0.6 s | monde (30 m) | avoid-repeat, cooldown 300 ms, max 1 | — | Disponible (2/2) · non émis (prévu) |
| `puzzle.solved` | Énigme résolue (bruitage) | Futur : énigme résolue, accompagne le thème « puzzle.solved » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |

## Magie

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `magic.activate` | Activation magique | Futur : phénomène/objet magique | — | 2 prévue(s) | B1 | sample | 0.8–1.6 s | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `magic.shimmer` | Aura magique (boucle) | Futur : émetteur de lieu magique | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |

## Météo

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `weather.rain` | Pluie (boucle) | Profil global météo : weather = rain/storm | weather | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (2/2) |
| `weather.thunder` | Tonnerre | Couche ponctuelle météo : storm (état futur du climat) | weather | 2 prévue(s) | B1 | sample | 2–4 s | non | random, cooldown 8000 ms, max 2 | — | Disponible (2/2) · non émis (prévu) |
| `weather.wind` | Vent (boucle) | Profils plaine/montagne/désert/ruines et météo venteuse | weather, place | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (4/4) |

## Musique (MusicCue)

Sélection par contexte (priorité puis spécificité), transition sur la mesure, silences optionnels entre deux lectures ; un thème sans partition disponible est ignoré et la musique courante continue.

| Thème | Description | Condition | Priorité | Type | Partitions | Silence | Transition |
|---|---|---|---|---|---|---|---|
| `menu` | Menu principal | place=menu | 9 | loop | `music-menu` (disponible) | — | immediate |
| `explore.day` | Exploration de jour | time=dawn/day/dusk | 1 | loop | `music-day-a` (disponible), `music-day-b` (disponible) | 4–12 s | bar |
| `explore.night` | Exploration de nuit | time=night | 1 | loop | `music-night-a` (disponible), `music-night-b` (disponible) | 6–16 s | bar |
| `forest` | Forêt | place=forest, time=dawn/day/dusk | 2 | loop | `music-forest` (disponible) | 20–60 s | bar |
| `village` | Village | place=village | 2 | loop | `music-village` (disponible) | 15–45 s | bar |
| `farm` | Agriculture | activity=farming | 3 | loop | `music-farm` (disponible) | 20–60 s | bar |
| `mine` | Mine | place=mine | 3 | loop | `music-mine` (disponible) | 30–90 s | bar |
| `coast` | Côte / navigation | place=coast/beach/ocean | 2 | loop | `music-coast` (disponible) | 20–60 s | bar |
| `sailing` | Navigation (activité) | activity=sailing | 3 | loop | `music-coast` (disponible) | 20–60 s | bar |
| `swamp` | Marais | place=swamp | 2 | loop | `music-swamp` (disponible) | 30–90 s | bar |
| `desert` | Désert | place=desert | 2 | loop | `music-desert` (disponible) | 30–90 s | bar |
| `mountain` | Montagne / volcan | place=mountain/volcano | 2 | loop | `music-mountain` (disponible) | 30–90 s | bar |
| `ruins` | Ruines | place=ruins | 2 | loop | `music-ruins` (disponible) | 30–90 s | bar |
| `mission` | Mission / énigme en cours | activity=mission/puzzle | 4 | loop | `music-mission` (disponible) | — | bar |
| `magic` | Magie / phénomène | activity=magic | 4 | loop | `music-magic` (disponible) | — | bar |
| `discovery` | Découverte (jingle) | — | 8 | stinger | `music-discovery` (disponible) | — | bar |
| `mission.success` | Réussite de mission (jingle) | — | 8 | stinger | `music-success` (disponible) | — | bar |
| `puzzle.solved` | Énigme résolue (jingle) | — | 8 | stinger | `music-success` (disponible) | — | bar |
| `rare.phenomenon` | Phénomène rare (jingle) | — | 8 | stinger | `music-rare` (disponible) | — | immediate |

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

### Vague 1 — B1 (première tranche) : 0 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|

### Vague 2 — bêta enrichie : 0 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|

### Vague 3 — optionnelle / ultérieure : 0 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|

### Déjà produits : 249 fichiers

| Fichier | Statut | Événements |
|---|---|---|
| `audio/sfx/footsteps/fs-grass-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-04.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-dirt-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-dirt-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-dirt-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-dirt-04.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-stone-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-stone-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-stone-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-stone-04.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-wood-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-wood-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-wood-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-wood-04.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-water-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-water-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-water-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-wet-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-wet-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-grass-wet-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-tallgrass-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-tallgrass-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-tallgrass-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-mud-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-mud-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-mud-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-sand-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-sand-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-sand-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-gravel-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-gravel-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-gravel-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-metal-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-metal-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-metal-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-snow-01.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-snow-02.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/footsteps/fs-snow-03.wav` | TECHNICALLY_VALID | `player.footstep` |
| `audio/sfx/player/jump-01.wav` | TECHNICALLY_VALID | `player.jump` |
| `audio/sfx/player/jump-02.wav` | TECHNICALLY_VALID | `player.jump` |
| `audio/sfx/player/land-soft-01.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-soft-02.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-soft-03.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-heavy-01.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-heavy-02.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/glide-deploy-01.wav` | TECHNICALLY_VALID | `player.glide.deploy` |
| `audio/sfx/player/glide-deploy-02.wav` | TECHNICALLY_VALID | `player.glide.deploy` |
| `audio/sfx/player/slide-01.wav` | TECHNICALLY_VALID | `player.slide` |
| `audio/sfx/player/slide-02.wav` | TECHNICALLY_VALID | `player.slide` |
| `audio/sfx/water/splash-small-01.wav` | TECHNICALLY_VALID | `water.enter` |
| `audio/sfx/water/splash-small-02.wav` | TECHNICALLY_VALID | `water.enter` |
| `audio/sfx/water/splash-small-03.wav` | TECHNICALLY_VALID | `water.enter` |
| `audio/sfx/water/splash-big-01.wav` | TECHNICALLY_VALID | `water.enter` |
| `audio/sfx/water/splash-big-02.wav` | TECHNICALLY_VALID | `water.enter` |
| `audio/sfx/water/swim-01.wav` | TECHNICALLY_VALID | `water.swim` |
| `audio/sfx/water/swim-02.wav` | TECHNICALLY_VALID | `water.swim` |
| `audio/sfx/water/swim-03.wav` | TECHNICALLY_VALID | `water.swim` |
| `audio/sfx/water/dive-01.wav` | TECHNICALLY_VALID | `water.dive` |
| `audio/sfx/water/dive-02.wav` | TECHNICALLY_VALID | `water.dive` |
| `audio/sfx/water/resurface-01.wav` | TECHNICALLY_VALID | `water.surface` |
| `audio/sfx/water/resurface-02.wav` | TECHNICALLY_VALID | `water.surface` |
| `audio/sfx/water/lap-01.wav` | TECHNICALLY_VALID | `water.lap` |
| `audio/sfx/water/lap-02.wav` | TECHNICALLY_VALID | `water.lap` |
| `audio/sfx/water/lap-03.wav` | TECHNICALLY_VALID | `water.lap` |
| `audio/ambience/water/amb-underwater-01.wav` | TECHNICALLY_VALID | `ambience.underwater` |
| `audio/ambience/water/amb-rapids-01.wav` | TECHNICALLY_VALID | `water.rapids` |
| `audio/sfx/water/boat-move-01.wav` | TECHNICALLY_VALID | `boat.move` |
| `audio/sfx/water/boat-board-01.wav` | TECHNICALLY_VALID | `boat.board` |
| `audio/sfx/water/boat-board-02.wav` | TECHNICALLY_VALID | `boat.board` |
| `audio/sfx/water/boat-creak-01.wav` | TECHNICALLY_VALID | `boat.creak` |
| `audio/sfx/water/boat-creak-02.wav` | TECHNICALLY_VALID | `boat.creak` |
| `audio/sfx/water/boat-creak-03.wav` | TECHNICALLY_VALID | `boat.creak` |
| `audio/sfx/water/boat-bump-01.wav` | TECHNICALLY_VALID | `boat.collision` |
| `audio/sfx/water/boat-bump-02.wav` | TECHNICALLY_VALID | `boat.collision` |
| `audio/sfx/mining/mine-strike-01.wav` | TECHNICALLY_VALID | `mine.tool.strike` |
| `audio/sfx/mining/mine-strike-02.wav` | TECHNICALLY_VALID | `mine.tool.strike` |
| `audio/sfx/mining/mine-strike-03.wav` | TECHNICALLY_VALID | `mine.tool.strike` |
| `audio/sfx/mining/mine-hit-soil-01.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-soil-02.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-soil-03.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-softrock-01.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-softrock-02.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-softrock-03.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-softrock-04.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-hardrock-01.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-hardrock-02.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-hardrock-03.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-hardrock-04.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-ore-01.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-ore-02.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-ore-03.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-crystal-01.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-crystal-02.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-hit-crystal-03.wav` | TECHNICALLY_VALID | `mine.hit` |
| `audio/sfx/mining/mine-crack-01.wav` | TECHNICALLY_VALID | `mine.crack` |
| `audio/sfx/mining/mine-crack-02.wav` | TECHNICALLY_VALID | `mine.crack` |
| `audio/sfx/mining/mine-rubble-01.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-rubble-02.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-rubble-03.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-collect-01.wav` | TECHNICALLY_VALID | `mine.resource.collect` |
| `audio/sfx/mining/mine-collect-02.wav` | TECHNICALLY_VALID | `mine.resource.collect` |
| `audio/sfx/mining/mine-crystal-01.wav` | TECHNICALLY_VALID | `mine.resource.crystal` |
| `audio/sfx/mining/mine-crystal-02.wav` | TECHNICALLY_VALID | `mine.resource.crystal` |
| `audio/sfx/mining/mine-denied-01.wav` | TECHNICALLY_VALID | `mine.action.denied` |
| `audio/sfx/mining/mine-denied-02.wav` | TECHNICALLY_VALID | `mine.action.denied` |
| `audio/sfx/mining/mine-enter-01.wav` | TECHNICALLY_VALID | `mine.enter` |
| `audio/sfx/mining/ladder-01.wav` | TECHNICALLY_VALID | `mine.level.change` |
| `audio/sfx/mining/ladder-02.wav` | TECHNICALLY_VALID | `mine.level.change` |
| `audio/ambience/mine/amb-cave-01.wav` | TECHNICALLY_VALID | `ambience.cave` |
| `audio/ambience/mine/drip-01.wav` | TECHNICALLY_VALID | `ambience.cave.drip` |
| `audio/ambience/mine/drip-02.wav` | TECHNICALLY_VALID | `ambience.cave.drip` |
| `audio/ambience/mine/drip-03.wav` | TECHNICALLY_VALID | `ambience.cave.drip` |
| `audio/ambience/mine/drip-04.wav` | TECHNICALLY_VALID | `ambience.cave.drip` |
| `audio/ambience/mine/rumble-01.wav` | TECHNICALLY_VALID | `ambience.cave.rumble` |
| `audio/ambience/mine/rumble-02.wav` | TECHNICALLY_VALID | `ambience.cave.rumble` |
| `audio/sfx/magic/shimmer-hit-01.wav` | TECHNICALLY_VALID | `mine.discovery` |
| `audio/sfx/farming/till-01.wav` | TECHNICALLY_VALID | `farm.till` |
| `audio/sfx/farming/till-02.wav` | TECHNICALLY_VALID | `farm.till` |
| `audio/sfx/farming/till-03.wav` | TECHNICALLY_VALID | `farm.till` |
| `audio/sfx/farming/plant-01.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/plant-02.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/plant-03.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/watering-01.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/sfx/farming/watering-02.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/sfx/farming/watering-03.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/ambience/water/irrigate-01.wav` | TECHNICALLY_VALID | `farm.irrigate` |
| `audio/sfx/farming/weed-01.wav` | TECHNICALLY_VALID | `farm.weed` |
| `audio/sfx/farming/weed-02.wav` | TECHNICALLY_VALID | `farm.weed` |
| `audio/sfx/farming/cut-01.wav` | TECHNICALLY_VALID | `farm.cut` |
| `audio/sfx/farming/cut-02.wav` | TECHNICALLY_VALID | `farm.cut` |
| `audio/sfx/farming/pick-01.wav` | TECHNICALLY_VALID | `farm.pick` |
| `audio/sfx/farming/pick-02.wav` | TECHNICALLY_VALID | `farm.pick` |
| `audio/sfx/farming/pick-03.wav` | TECHNICALLY_VALID | `farm.pick` |
| `audio/sfx/farming/harvest-grain-01.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-grain-02.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-grain-03.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-01.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-02.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-03.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/basket-01.wav` | TECHNICALLY_VALID | `farm.basket` |
| `audio/sfx/farming/basket-02.wav` | TECHNICALLY_VALID | `farm.basket` |
| `audio/sfx/farming/seedbag-01.wav` | TECHNICALLY_VALID | `farm.seedbag` |
| `audio/sfx/farming/seedbag-02.wav` | TECHNICALLY_VALID | `farm.seedbag` |
| `audio/sfx/farming/tools-01.wav` | TECHNICALLY_VALID | `farm.tools` |
| `audio/sfx/farming/tools-02.wav` | TECHNICALLY_VALID | `farm.tools` |
| `audio/ambience/weather/amb-windmill-01.wav` | TECHNICALLY_VALID | `ambience.windmill` |
| `audio/ambience/village/amb-watermill-01.wav` | TECHNICALLY_VALID | `ambience.watermill` |
| `audio/sfx/creatures/voc-squirrel-01.wav` | LISTENING_REVIEW | `npc.vocalize` |
| `audio/sfx/creatures/voc-squirrel-02.wav` | LISTENING_REVIEW | `npc.vocalize` |
| `audio/sfx/creatures/voc-squirrel-03.wav` | LISTENING_REVIEW | `npc.vocalize` |
| `audio/sfx/creatures/voc-squirrel-04.wav` | LISTENING_REVIEW | `npc.vocalize` |
| `audio/sfx/creatures/squirrel-01.wav` | LISTENING_REVIEW | `npc.squirrel.chatter` |
| `audio/sfx/creatures/squirrel-02.wav` | LISTENING_REVIEW | `npc.squirrel.chatter` |
| `audio/sfx/creatures/squirrel-03.wav` | LISTENING_REVIEW | `npc.squirrel.chatter` |
| `audio/sfx/creatures/expr-happy-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-happy-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-surprised-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-surprised-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-sad-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-sad-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-calm-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-calm-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-effort-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-effort-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-annoyed-01.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/expr-annoyed-02.wav` | LISTENING_REVIEW | `npc.expression` |
| `audio/sfx/creatures/npc-activity-01.wav` | TECHNICALLY_VALID | `npc.activity` |
| `audio/sfx/creatures/npc-activity-02.wav` | TECHNICALLY_VALID | `npc.activity` |
| `audio/sfx/creatures/bird-01.wav` | LISTENING_REVIEW | `fauna.bird.song` |
| `audio/sfx/creatures/bird-02.wav` | LISTENING_REVIEW | `fauna.bird.song` |
| `audio/sfx/creatures/bird-03.wav` | LISTENING_REVIEW | `fauna.bird.song` |
| `audio/sfx/creatures/bird-04.wav` | LISTENING_REVIEW | `fauna.bird.song` |
| `audio/sfx/creatures/flock-01.wav` | TECHNICALLY_VALID | `fauna.bird.flock` |
| `audio/sfx/creatures/owl-01.wav` | LISTENING_REVIEW | `fauna.owl` |
| `audio/sfx/creatures/owl-02.wav` | LISTENING_REVIEW | `fauna.owl` |
| `audio/sfx/creatures/frog-01.wav` | LISTENING_REVIEW | `fauna.frog` |
| `audio/sfx/creatures/frog-02.wav` | LISTENING_REVIEW | `fauna.frog` |
| `audio/sfx/creatures/frog-03.wav` | LISTENING_REVIEW | `fauna.frog` |
| `audio/sfx/creatures/insect-01.wav` | LISTENING_REVIEW | `fauna.insects` |
| `audio/sfx/creatures/insect-02.wav` | LISTENING_REVIEW | `fauna.insects` |
| `audio/sfx/water/fish-01.wav` | TECHNICALLY_VALID | `fauna.fish.splash` |
| `audio/sfx/water/fish-02.wav` | TECHNICALLY_VALID | `fauna.fish.splash` |
| `audio/sfx/creatures/gull-01.wav` | LISTENING_REVIEW | `fauna.gull` |
| `audio/sfx/creatures/gull-02.wav` | LISTENING_REVIEW | `fauna.gull` |
| `audio/sfx/creatures/mammal-01.wav` | LISTENING_REVIEW | `fauna.mammal` |
| `audio/sfx/creatures/mammal-02.wav` | LISTENING_REVIEW | `fauna.mammal` |
| `audio/sfx/objects/door-open-01.wav` | TECHNICALLY_VALID | `interaction.door.open` |
| `audio/sfx/objects/door-open-02.wav` | TECHNICALLY_VALID | `interaction.door.open` |
| `audio/sfx/objects/door-close-01.wav` | TECHNICALLY_VALID | `interaction.door.close` |
| `audio/sfx/objects/door-close-02.wav` | TECHNICALLY_VALID | `interaction.door.close` |
| `audio/sfx/objects/chest-01.wav` | TECHNICALLY_VALID | `interaction.chest.open` |
| `audio/sfx/objects/chest-02.wav` | TECHNICALLY_VALID | `interaction.chest.open` |
| `audio/sfx/objects/lever-01.wav` | TECHNICALLY_VALID | `interaction.lever` |
| `audio/sfx/objects/lever-02.wav` | TECHNICALLY_VALID | `interaction.lever` |
| `audio/sfx/objects/gears-01.wav` | TECHNICALLY_VALID | `interaction.gears` |
| `audio/sfx/objects/bridge-01.wav` | TECHNICALLY_VALID | `interaction.bridge` |
| `audio/sfx/objects/bridge-02.wav` | TECHNICALLY_VALID | `interaction.bridge` |
| `audio/sfx/objects/amb-fire-01.wav` | TECHNICALLY_VALID | `ambience.fire` |
| `audio/sfx/objects/torch-01.wav` | TECHNICALLY_VALID | `interaction.torch` |
| `audio/sfx/farming/pickup-01.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/farming/pickup-02.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/farming/pickup-03.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/ui/bag-01.wav` | TECHNICALLY_VALID | `ui.inventory.open` |
| `audio/sfx/ui/bag-02.wav` | TECHNICALLY_VALID | `ui.inventory.open` |
| `audio/sfx/objects/mission-accept-01.wav` | TECHNICALLY_VALID | `mission.accept` |
| `audio/sfx/objects/puzzle-step-01.wav` | TECHNICALLY_VALID | `puzzle.step` |
| `audio/sfx/objects/puzzle-step-02.wav` | TECHNICALLY_VALID | `puzzle.step` |
| `audio/sfx/magic/magic-01.wav` | TECHNICALLY_VALID | `magic.activate` |
| `audio/sfx/magic/magic-02.wav` | TECHNICALLY_VALID | `magic.activate` |
| `audio/sfx/magic/amb-shimmer-01.wav` | TECHNICALLY_VALID | `magic.shimmer` |
| `audio/ambience/weather/amb-rain-light-01.wav` | TECHNICALLY_VALID | `weather.rain` |
| `audio/ambience/weather/amb-rain-heavy-01.wav` | TECHNICALLY_VALID | `weather.rain` |
| `audio/ambience/weather/thunder-01.wav` | TECHNICALLY_VALID | `weather.thunder` |
| `audio/ambience/weather/thunder-02.wav` | TECHNICALLY_VALID | `weather.thunder` |
| `audio/ambience/weather/amb-wind-light-01.wav` | TECHNICALLY_VALID | `weather.wind` |
| `audio/ambience/weather/amb-wind-strong-01.wav` | TECHNICALLY_VALID | `weather.wind` |
| `audio/ambience/forest/amb-forest-01.wav` | TECHNICALLY_VALID | `ambience.forest` |
| `audio/ambience/forest/amb-forest-night-01.wav` | TECHNICALLY_VALID | `ambience.forest` |
| `audio/ambience/plains/amb-plain-01.wav` | TECHNICALLY_VALID | `ambience.plain` |
| `audio/ambience/marsh/amb-swamp-01.wav` | TECHNICALLY_VALID | `ambience.swamp` |
| `audio/ambience/desert/amb-desert-01.wav` | TECHNICALLY_VALID | `ambience.desert` |
| `audio/ambience/volcano/amb-volcano-01.wav` | TECHNICALLY_VALID | `ambience.volcano` |
| `audio/ambience/coast/amb-sea-01.wav` | TECHNICALLY_VALID | `ambience.sea` |
| `audio/ambience/water/amb-river-01.wav` | TECHNICALLY_VALID | `ambience.water.river` |
| `audio/ambience/water/amb-waterfall-01.wav` | TECHNICALLY_VALID | `ambience.waterfall` |
| `audio/ambience/water/amb-lake-01.wav` | TECHNICALLY_VALID | `ambience.lake` |
| `audio/ambience/village/amb-village-01.wav` | LISTENING_REVIEW | `ambience.village` |
| `audio/ambience/night/amb-night-01.wav` | TECHNICALLY_VALID | `ambience.night` |
| `audio/music/music-menu.mid` | TECHNICALLY_VALID | `music:menu` |
| `audio/music/music-day-a.mid` | TECHNICALLY_VALID | `music:explore.day` |
| `audio/music/music-day-b.mid` | TECHNICALLY_VALID | `music:explore.day` |
| `audio/music/music-night-a.mid` | TECHNICALLY_VALID | `music:explore.night` |
| `audio/music/music-night-b.mid` | TECHNICALLY_VALID | `music:explore.night` |
| `audio/music/music-forest.mid` | TECHNICALLY_VALID | `music:forest` |
| `audio/music/music-village.mid` | TECHNICALLY_VALID | `music:village` |
| `audio/music/music-farm.mid` | TECHNICALLY_VALID | `music:farm` |
| `audio/music/music-mine.mid` | TECHNICALLY_VALID | `music:mine` |
| `audio/music/music-coast.mid` | TECHNICALLY_VALID | `music:coast` |
| `audio/music/music-swamp.mid` | TECHNICALLY_VALID | `music:swamp` |
| `audio/music/music-desert.mid` | TECHNICALLY_VALID | `music:desert` |
| `audio/music/music-mountain.mid` | TECHNICALLY_VALID | `music:mountain` |
| `audio/music/music-ruins.mid` | TECHNICALLY_VALID | `music:ruins` |
| `audio/music/music-mission.mid` | TECHNICALLY_VALID | `music:mission` |
| `audio/music/music-magic.mid` | TECHNICALLY_VALID | `music:magic` |
| `audio/music/music-discovery.mid` | TECHNICALLY_VALID | `music:discovery` |
| `audio/music/music-success.mid` | TECHNICALLY_VALID | `music:mission.success` |
| `audio/music/music-rare.mid` | TECHNICALLY_VALID | `music:rare.phenomenon` |

## Diagnostics du catalogue livré

2 diagnostics (0 avertissements : événements encore silencieux). Aucun n’est bloquant.

