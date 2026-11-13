# 38 — Inventaire audio V2 (généré)

> **Fichier généré** par `npm run generate:audio` depuis [`src/audio/catalog-source.ts`](../src/audio/catalog-source.ts). Ne pas éditer à la main : modifier la source puis régénérer. Architecture et contrats : [37 — Audio V2](37-AUDIO-V2-CATALOGUE.md). Manifeste de production : [`assets/audio/production-manifest.json`](../assets/audio/production-manifest.json).

## Résumé

- Catalogue `2.0.0-aud-v2` : **108 événements**, **19 thèmes musicaux**, **19 profils d’ambiance**.
- Jouables dès maintenant : **53/108 événements** (ressources disponibles ou repli explicite) ; les autres restent silencieux sans erreur.
- Ressources disponibles : 8 fichiers de la bibliothèque V1 (6 WAV + 2 MIDI, statut GENERATED) et 5 sons procéduraux (GENERATED, écoute non qualifiée).
- **À produire : 135 fichiers** (118 échantillons, 17 MIDI) — vague 1 / B1 : **23**, vague 2 : 48 (bêta enrichie = 71), vague 3 optionnelle : 64.
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
| `player.footstep` | Pas du joueur selon la surface | Routeur : distance parcourue au sol (0,9 m marche / 1,25 m course, ≥ 200 ms) | surface, movement, intensity, wet | 40 prévue(s) | B1 | sample | 0.12–0.45 s | joueur (25 m) | shuffle, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (37/43) |
| `player.jump` | Impulsion de saut | Routeur : passage sol → air avec vitesse verticale > 1,5 m/s | surface, movement | 2 prévue(s) | B1 | sample | 0.15–0.35 s | joueur (25 m) | shuffle, cooldown 150 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `player.land` | Atterrissage | Routeur : air/planage → sol ; intensité selon la vitesse de chute | surface, intensity | 5 prévue(s) | B1 | sample | 0.2–0.6 s | joueur (25 m) | shuffle, cooldown 120 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (5/5) |
| `player.glide.deploy` | Déploiement des membranes de planage | Routeur : air → planage | movement | 2 prévue(s) | B1 | sample | 0.2–0.45 s | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `player.glide.fold` | Repli des membranes | Routeur : planage → air/sol | movement | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | shuffle, cooldown 200 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `glide-deploy` ×0.9 hauteur ×0.8 gain | Disponible (2/2) |
| `player.glide.wind` | Souffle d’air pendant le planage (boucle) | Routeur : boucle d’état tant que le mode est « glide », gain selon la vitesse | movement | 0 (réutilisation) | B1 | sample | — | non | random, max 3, ±10 % gain | réutilise `amb-wind-light` ×1.15 hauteur ×0.8 gain | Disponible (1/1) |
| `player.slide` | Glissade | Futur : glissade sur pente/neige (pas encore de mode « slide ») | surface | 2 prévue(s) | post-B1 | sample | 0.5–1 s | joueur (25 m) | shuffle, cooldown 300 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Eau

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `water.enter` | Entrée dans l’eau | Routeur : sol/air → nage/plongée ; intensité selon la chute | intensity | 5 prévue(s) | B1 | sample | 0.4–1.2 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (5/5) |
| `water.swim` | Brasse de nage | Routeur : distance en nage (1,6 m, ≥ 450 ms) | movement | 3 prévue(s) | B1 | sample | 0.4–0.8 s | joueur (30 m) | shuffle, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `water.dive` | Plongée sous la surface | Routeur : nage → plongée | — | 2 prévue(s) | B1 | sample | 0.5–1 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `water.surface` | Remontée à la surface | Routeur : plongée → nage | — | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `water.exit` | Sortie de l’eau | Routeur : nage/plongée → sol/air | surface | 0 (réutilisation) | B1 | sample | — | joueur (30 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | réutilise `fs-water` ×0.95 hauteur ×1.1 gain | Disponible (3/3) |
| `water.lap` | Clapotis ponctuel au bord de l’eau | Couche ponctuelle des ambiances lac/rivière/côte | place | 3 prévue(s) | post-B1 | sample | 0.5–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.6 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `water.rapids` | Rapides (boucle locale) | Émetteur sur un tronçon de rapides (réseau d’eau) | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | monde (40 m) | avoid-repeat, cooldown 80 ms, max 3, ±0.4 demi-ton, ±10 % gain | Émetteurs WaterNetwork à brancher. | Silencieux (à produire) · non émis (prévu) |

## Ambiances

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `ambience.underwater` | Ambiance sous-marine (boucle) | Routeur : caméra immergée ou plongée | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | non | random, max 2 | — | Disponible (1/1) |
| `ambience.cave` | Fond de mine/grotte (boucle) | Profil d’ambiance « mine » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.cave.drip` | Gouttes souterraines | Couche ponctuelle du profil « mine » | place | 4 prévue(s) | B1 | sample | 0.2–0.8 s | non | random, cooldown 1500 ms, max 2, ±1 demi-ton, ±30 % gain | — | Silencieux (à produire) |
| `ambience.cave.air` | Courant d’air souterrain | Couche du profil « mine » | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.7 hauteur ×0.5 gain | Disponible (1/1) |
| `ambience.cave.rumble` | Grondement lointain | Couche ponctuelle du profil « mine » | place | 2 prévue(s) | post-B1 | sample | 1.5–3 s | non | random, cooldown 1500 ms, max 2, ±0.5 demi-ton | — | Silencieux (à produire) |
| `ambience.windmill` | Moulin à vent (boucle) | Émetteur lié au moulin à vent | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.watermill` | Moulin à eau (boucle) | Émetteur lié au moulin de la rivière | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (45 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.fire` | Feu (boucle) | Émetteur sur feu de camp/cheminée | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (20 m) | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.forest` | Forêt (fond) | Profil « forêt » | place, time | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/2) |
| `ambience.plain` | Plaine / vallée / ferme (fond) | Profils « plaine », « vallée », « ferme » | place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.swamp` | Marais (fond) | Profil « marais » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.desert` | Désert (fond) | Profil « désert » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.volcano` | Volcan (fond) | Profil « volcan » — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.sea` | Plage / océan / côte (fond) | Profils « côte », « plage », « océan » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.water.river` | Rivière (fond) | Profil global : eau proche | nearWater, place | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |
| `ambience.waterfall` | Cascade (fond/émetteur) | Profil « cascade » ou émetteur WaterNetwork — lieu pas encore fourni par la sonde de terrain | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `ambience.lake` | Lac (fond) | Profil « lac » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.village` | Village (fond) | Profil « village » | place | 1 prévue(s) | post-B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Silencieux (à produire) |
| `ambience.ruins` | Ruines (fond) | Profil « ruines » — lieu pas encore fourni par la sonde de terrain | place | 0 (réutilisation) | B1 | sample | — | boucle globale | random, max 2 | réutilise `amb-wind-light` ×0.85 hauteur ×0.7 gain | Disponible (1/1) · non émis (prévu) |
| `ambience.night` | Nuit (grillons) | Profil global : time = night | time | 1 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/1) |

## Navigation

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `boat.move` | Bateau en déplacement (boucle) | Routeur : boucle d’état à bord si vitesse > 0,4 m/s | — | 1 prévue(s) | B1 | sample | 4–8 s (boucle) | non | random, cooldown 300 ms, max 2, ±10 % gain | — | Silencieux (à produire) |
| `boat.board` | Embarquement | Routeur : à bord = vrai | — | 2 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `boat.disembark` | Débarquement | Routeur : à bord = faux | — | 0 (réutilisation) | B1 | sample | — | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | réutilise `boat-board` ×0.92 hauteur | Disponible (2/2) |
| `boat.creak` | Craquement de coque | Couche ponctuelle du profil « navigation » | activity | 3 prévue(s) | post-B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 3000 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `boat.collision` | Collision du bateau | Futur : choc de la coque contre un rivage/obstacle | intensity | 2 prévue(s) | post-B1 | sample | 0.4–0.9 s | joueur (40 m) | avoid-repeat, cooldown 300 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Mines

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mine.tool.strike` | Frappe de l’outil (indépendante de la matière) | Creusement tenté : précède la réponse de la matière | tool | 3 prévue(s) | B1 | sample | 0.12–0.3 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `mine.hit` | Coup d’outil selon la matière | Creusement validé (ActivityRuntime.dig) ; matière de la cellule visée | material, tool | 17 prévue(s) | B1 | sample | 0.2–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-hit-softrock` ×0.9 gain | Disponible (21/21) |
| `mine.crack` | Fissuration | Futur : creusement en plusieurs coups (non utilisé, une action creuse une cellule) | material | 2 prévue(s) | post-B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `mine.cell.excavated` | Cellule excavée (éboulis) | Creusement validé (après mine.hit) | material | 3 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `mine.resource.collect` | Récolte de pierre/minerai | Creusement validé avec récompense | material | 2 prévue(s) | B1 | sample | 0.25–0.5 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.resource.crystal` | Récolte de cristal | Creusement validé d’une cellule de cristal | — | 2 prévue(s) | B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.tool.switch` | Changement d’outil | Futur : sélection d’outil | tool | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 60 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `tools` | Silencieux (à produire) · non émis (prévu) |
| `mine.action.denied` | Action impossible (roche mère, hors de portée) | Creusement refusé | material | 2 prévue(s) | B1 | sample | 0.2–0.4 s | non | avoid-repeat, cooldown 400 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Disponible (2/2) |
| `mine.enter` | Entrée dans une mine | Routeur : espace de mine atteint | place | 1 prévue(s) | post-B1 | sample | 0.8–1.6 s | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | partagé avec `mine.exit` | Silencieux (à produire) |
| `mine.exit` | Sortie de mine | Routeur : retour en surface | place | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 1500 ms, max 3, ±0.5 demi-ton, ±10 % gain | réutilise `mine-enter` ×1.1 hauteur | Silencieux (à produire) |
| `mine.level.change` | Escalier / puits / échelle | Routeur : changement de niveau de mine | surface | 2 prévue(s) | post-B1 | sample | 0.5–1 s | joueur (25 m) | avoid-repeat, cooldown 500 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Repli → `player.footstep` |
| `mine.discovery` | Découverte souterraine (chatoiement) | Futur : première découverte de cristal d’un niveau (complète le thème « discovery ») | — | 1 prévue(s) | post-B1 | sample | 1–2 s | non | avoid-repeat, cooldown 5000 ms, max 3, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Agriculture

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `farm.till` | Travail du sol | Futur : action « préparer le sol » | surface | 3 prévue(s) | post-B1 | sample | 0.4–0.8 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.plant` | Semis | Action ferme « plant » validée | objectKind | 3 prévue(s) | B1 | sample | 0.4–0.9 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `farm.water` | Arrosage à l’arrosoir | Action ferme « water » validée | objectKind | 3 prévue(s) | B1 | sample | 0.8–1.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (3/3) |
| `farm.irrigate` | Irrigation (rigole, boucle) | Futur : émetteur de canal d’irrigation | — | 1 prévue(s) | post-B1 | sample | 4–6 s (boucle) | monde (20 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.weed` | Désherbage | Futur : action désherber | — | 2 prévue(s) | B1 | sample | 0.3–0.7 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (2/2) · non émis (prévu) |
| `farm.clear` | Nettoyage de parcelle | Action ferme « clear » validée | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `weed` | Disponible (2/2) |
| `farm.fertilize` | Fertilisation | Futur : action fertiliser | — | 0 (réutilisation) | B1 | sample | — | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | réutilise `plant` ×0.9 hauteur | Disponible (3/3) · non émis (prévu) |
| `farm.cut` | Coupe (sécateur) | Futur : taille/coupe | — | 2 prévue(s) | post-B1 | sample | 0.2–0.4 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.pick` | Cueillette | Futur : cueillette fruits/légumes | objectKind | 3 prévue(s) | post-B1 | sample | 0.25–0.5 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.harvest` | Récolte | Action ferme « harvest » validée ; objectKind = culture | objectKind | 6 prévue(s) | B1 | sample | 0.4–1 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (6/6) |
| `farm.basket` | Panier | Futur : dépôt dans un panier/coffre de ferme | — | 2 prévue(s) | post-B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `farm.seedbag` | Sac de graines | Changement de culture sélectionnée | — | 2 prévue(s) | post-B1 | sample | 0.3–0.6 s | non | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `farm.tools` | Outils | Futur : prise/rangement d’outil | tool | 2 prévue(s) | post-B1 | sample | 0.3–0.6 s | joueur (25 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.4 demi-ton, ±10 % gain | partagé avec `mine.tool.switch` | Silencieux (à produire) · non émis (prévu) |
| `farm.ripe` | Signal de maturité | Futur : parcelle mûre à proximité | — | 1 disponible(s) | B1 | procedural | 0.6 s | non | avoid-repeat, cooldown 5000 ms, max 2, ±0.4 demi-ton, ±10 % gain | — | Disponible (1/1) · non émis (prévu) |

## PNJ

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `npc.vocalize` | Vocalisation de dialogue | Ouverture d’un dialogue avec un PNJ | species | 4 prévue(s) | B1 | sample | 0.2–0.6 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) |
| `npc.squirrel.chatter` | Écureuil (cri, PNJ) | Futur : activité/émotion d’un PNJ écureuil | species, state | 3 prévue(s) | post-B1 | sample | 0.3–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `npc.expression` | Expressions des personnages | Futur : changement d’émotion (A maintenu, dialogues) | state, species | 12 prévue(s) | post-B1 | sample | 0.2–0.8 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `npc.activity` | Activités des PNJ (fouiller, grignoter) | Futur : routines PNJ | state | 2 prévue(s) | post-B1 | sample | 0.5–1.2 s | monde (30 m) | shuffle, cooldown 400 ms, max 2, ±0.5 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Faune

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `fauna.bird.song` | Chants d’oiseaux | Couche ponctuelle forêt/plaine (jour) | time, place | 4 prévue(s) | B1 | sample | 0.8–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.bird.flock` | Envol d’oiseaux | Futur : fuite des oiseaux décoratifs | — | 1 prévue(s) | post-B1 | sample | 0.8–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `fauna.owl` | Chouette (nuit) | Couche ponctuelle forêt de nuit | time | 2 prévue(s) | post-B1 | sample | 1–2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.frog` | Grenouilles | Couche ponctuelle marais/lac | place, time | 3 prévue(s) | post-B1 | sample | 0.5–1.2 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.insects` | Insectes (bourdonnement) | Couche ponctuelle plaine/ferme (jour) | place, time | 2 prévue(s) | post-B1 | sample | 1–2.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.fish.splash` | Poisson qui saute | Couche ponctuelle lac/rivière | place | 2 prévue(s) | post-B1 | sample | 0.3–0.7 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.gull` | Mouettes (côte) | Couche ponctuelle plage/côte | place | 2 prévue(s) | post-B1 | sample | 0.6–1.5 s | non | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | — | Silencieux (à produire) |
| `fauna.mammal` | Mammifères (renard, cerf…) | Futur : faune mammifère | species | 2 prévue(s) | post-B1 | sample | 0.5–1.5 s | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | partagé avec `mount.vocalize` | Silencieux (à produire) · non émis (prévu) |
| `mount.vocalize` | Animal montable (futur) | Futur : montures | species | 0 (réutilisation) | post-B1 | sample | — | monde (60 m) | avoid-repeat, cooldown 1500 ms, max 2, ±0.8 demi-ton, ±20 % gain | réutilise `mammal` ×0.85 hauteur | Silencieux (à produire) · non émis (prévu) |

## Objets et interactions

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `interaction.door.open` | Ouverture de porte | Interaction « door » (état open = vrai) | objectKind | 2 prévue(s) | B1 | sample | 0.5–1.1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.door.close` | Fermeture de porte | Interaction « door » (état open = faux) | objectKind | 2 prévue(s) | B1 | sample | 0.4–0.9 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.chest.open` | Coffre | Futur : coffre interactif | — | 2 prévue(s) | post-B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.lever` | Levier | Modèle « levier » (choix dans Interactions) | — | 2 prévue(s) | B1 | sample | 0.3–0.7 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Repli → `lever` |
| `interaction.gears` | Engrenages (boucle) | Émetteur sur mécanisme actif | — | 1 prévue(s) | post-B1 | sample | 2–4 s (boucle) | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | partagé avec `ruins.mechanism` | Silencieux (à produire) · non émis (prévu) |
| `interaction.bridge` | Pont (grincement/abaissement) | Futur : pont mobile / passage | — | 2 prévue(s) | post-B1 | sample | 0.8–1.6 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.torch` | Torche allumée | Futur : allumer une torche | — | 1 prévue(s) | post-B1 | sample | 0.5–1 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `interaction.collect` | Collecte de matériaux | Action playSound de collecte (V2) | objectKind | 3 prévue(s) | B1 | sample | 0.25–0.5 s | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | — | Disponible (3/3) |
| `ruins.mechanism` | Mécanisme de ruines | Futur : porte/dalle de ruine | — | 0 (réutilisation) | post-B1 | sample | — | monde (30 m) | avoid-repeat, cooldown 100 ms, max 2, ±0.3 demi-ton, ±5 % gain | réutilise `gears` ×0.7 hauteur | Silencieux (à produire) · non émis (prévu) |

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
| `mission.accept` | Mission acceptée | Futur : début de mission (dialogue) | — | 1 prévue(s) | post-B1 | sample | 0.6–1.2 s | non | avoid-repeat, cooldown 300 ms, max 1 | — | Repli → `mission` · non émis (prévu) |
| `mission.complete` | Mission réussie (bruitage) | Livraison/objectif terminé, accompagne le thème « mission.success » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Pas de fichier propre : repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |
| `puzzle.step` | Étape d’énigme | Futur : mécanisme d’énigme correct | — | 2 prévue(s) | post-B1 | sample | 0.3–0.6 s | monde (30 m) | avoid-repeat, cooldown 300 ms, max 1 | — | Silencieux (à produire) · non émis (prévu) |
| `puzzle.solved` | Énigme résolue (bruitage) | Futur : énigme résolue, accompagne le thème « puzzle.solved » | — | 0 (réutilisation) | post-B1 | sample | — | non | avoid-repeat, cooldown 300 ms, max 1 | Repli sur « mission » + jingle MIDI. | Repli → `mission` · non émis (prévu) |

## Magie

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `magic.activate` | Activation magique | Futur : phénomène/objet magique | — | 2 prévue(s) | post-B1 | sample | 0.8–1.6 s | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |
| `magic.shimmer` | Aura magique (boucle) | Futur : émetteur de lieu magique | — | 1 prévue(s) | post-B1 | sample | 4–8 s (boucle) | monde (40 m) | avoid-repeat, cooldown 200 ms, max 2, ±0.3 demi-ton, ±10 % gain | — | Silencieux (à produire) · non émis (prévu) |

## Météo

| ID | Description | Déclencheur | Contexte | Prises | Priorité | Type | Durée | Spatialisation | Répétition | Réutilisation | État réel |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `weather.rain` | Pluie (boucle) | Profil global météo : weather = rain/storm | weather | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/2) |
| `weather.thunder` | Tonnerre | Couche ponctuelle météo : storm (état futur du climat) | weather | 2 prévue(s) | post-B1 | sample | 2–4 s | non | random, cooldown 8000 ms, max 2 | — | Silencieux (à produire) · non émis (prévu) |
| `weather.wind` | Vent (boucle) | Profils plaine/montagne/désert/ruines et météo venteuse | weather, place | 2 prévue(s) | B1 | sample | 6–8 s (boucle) | boucle globale | random, max 2 | — | Disponible (1/4) |

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

### Vague 1 — B1 (première tranche) : 23 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/water/boat-move-01.wav` | boat-move (1/1) | `boat.move` | 4–8 s | oui | Boucle : eau qui glisse le long d’une petite coque en bois, régulière. |
| `audio/ambience/mine/drip-01.wav` | drip (1/4) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/ambience/mine/drip-02.wav` | drip (2/4) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/ambience/mine/drip-03.wav` | drip (3/4) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/ambience/mine/drip-04.wav` | drip (4/4) | `ambience.cave.drip` | 0.2–0.8 s | non | Goutte d’eau qui tombe dans une flaque, petite résonance. |
| `audio/sfx/creatures/voc-squirrel-01.wav` | voc-squirrel (1/4) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/creatures/voc-squirrel-02.wav` | voc-squirrel (2/4) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/creatures/voc-squirrel-03.wav` | voc-squirrel (3/4) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/creatures/voc-squirrel-04.wav` | voc-squirrel (4/4) | `npc.vocalize` | 0.2–0.6 s | non | Babillage d’écureuil stylisé (syllabes aiguës non verbales), amical, sans mots. |
| `audio/sfx/creatures/bird-01.wav` | bird (1/4) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/creatures/bird-02.wav` | bird (2/4) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/creatures/bird-03.wav` | bird (3/4) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/creatures/bird-04.wav` | bird (4/4) | `fauna.bird.song` | 0.8–2 s | non | Court chant d’oiseau de forêt tempérée, lointain, sans fond. |
| `audio/sfx/objects/door-open-01.wav` | door-open (1/2) | `interaction.door.open` | 0.5–1.1 s | non | Petite porte en bois qui pivote : grincement court + loquet. |
| `audio/sfx/objects/door-open-02.wav` | door-open (2/2) | `interaction.door.open` | 0.5–1.1 s | non | Petite porte en bois qui pivote : grincement court + loquet. |
| `audio/sfx/objects/door-close-01.wav` | door-close (1/2) | `interaction.door.close` | 0.4–0.9 s | non | Porte en bois qui se referme : toc + loquet. |
| `audio/sfx/objects/door-close-02.wav` | door-close (2/2) | `interaction.door.close` | 0.4–0.9 s | non | Porte en bois qui se referme : toc + loquet. |
| `audio/sfx/objects/lever-01.wav` | lever (1/2) | `interaction.lever` | 0.3–0.7 s | non | Levier en bois/métal qui bascule avec un cran. |
| `audio/sfx/objects/lever-02.wav` | lever (2/2) | `interaction.lever` | 0.3–0.7 s | non | Levier en bois/métal qui bascule avec un cran. |
| `audio/ambience/plains/amb-plain-01.wav` | amb-plain (1/1) | `ambience.plain` | 6–8 s | oui | Boucle : espace ouvert, herbe agitée, très doux. |
| `audio/music/music-mine.mid` | mine (1/1) | `music:mine` | 45–90 s | oui | Ambiance souterraine : clochette grave, harpe espacée, mystère doux, jamais angoissant. (60–72 BPM) |
| `audio/music/music-discovery.mid` | discovery (1/1) | `music:discovery` | 3–6 s | non | Jingle de découverte, 2 mesures, harpe montante + clochette finale. (libre) |
| `audio/music/music-success.mid` | mission.success (1/1) | `music:mission.success` + `music:puzzle.solved` | 3–6 s | non | Jingle de réussite chaleureux, cadence parfaite, flûte + pluck. (libre) |

### Vague 2 — bêta enrichie : 48 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/water/lap-01.wav` | lap (1/3) | `water.lap` | 0.5–1.5 s | non | Petite vague qui lèche une berge ou une coque, calme. |
| `audio/sfx/water/lap-02.wav` | lap (2/3) | `water.lap` | 0.5–1.5 s | non | Petite vague qui lèche une berge ou une coque, calme. |
| `audio/sfx/water/lap-03.wav` | lap (3/3) | `water.lap` | 0.5–1.5 s | non | Petite vague qui lèche une berge ou une coque, calme. |
| `audio/ambience/water/amb-rapids-01.wav` | amb-rapids (1/1) | `water.rapids` | 6–8 s | oui | Boucle : eau vive sur des rochers, remous et éclaboussures continues, plus agitée qu’une rivière. |
| `audio/sfx/water/boat-creak-01.wav` | boat-creak (1/3) | `boat.creak` | 0.6–1.5 s | non | Grincement de bois de petite barque, doux. |
| `audio/sfx/water/boat-creak-02.wav` | boat-creak (2/3) | `boat.creak` | 0.6–1.5 s | non | Grincement de bois de petite barque, doux. |
| `audio/sfx/water/boat-creak-03.wav` | boat-creak (3/3) | `boat.creak` | 0.6–1.5 s | non | Grincement de bois de petite barque, doux. |
| `audio/sfx/mining/mine-enter-01.wav` | mine-enter (1/1) | `mine.enter` + `mine.exit` | 0.8–1.6 s | non | Changement d’air : souffle qui se resserre, très discret. |
| `audio/sfx/mining/ladder-01.wav` | ladder (1/2) | `mine.level.change` | 0.5–1 s | non | Échelle en bois qui grince sous de petites pattes. |
| `audio/sfx/mining/ladder-02.wav` | ladder (2/2) | `mine.level.change` | 0.5–1 s | non | Échelle en bois qui grince sous de petites pattes. |
| `audio/ambience/mine/rumble-01.wav` | rumble (1/2) | `ambience.cave.rumble` | 1.5–3 s | non | Grondement sourd et lointain, rassurant (pas d’effondrement). |
| `audio/ambience/mine/rumble-02.wav` | rumble (2/2) | `ambience.cave.rumble` | 1.5–3 s | non | Grondement sourd et lointain, rassurant (pas d’effondrement). |
| `audio/ambience/water/irrigate-01.wav` | irrigate (1/1) | `farm.irrigate` | 4–6 s | oui | Boucle : filet d’eau qui court dans une rigole de terre, discret. |
| `audio/sfx/farming/seedbag-01.wav` | seedbag (1/2) | `farm.seedbag` | 0.3–0.6 s | non | Graines secouées dans un petit sac en toile. |
| `audio/sfx/farming/seedbag-02.wav` | seedbag (2/2) | `farm.seedbag` | 0.3–0.6 s | non | Graines secouées dans un petit sac en toile. |
| `audio/ambience/weather/amb-windmill-01.wav` | amb-windmill (1/1) | `ambience.windmill` | 4–8 s | oui | Boucle : ailes qui tournent, bois qui grince en rythme lent. |
| `audio/ambience/village/amb-watermill-01.wav` | amb-watermill (1/1) | `ambience.watermill` | 4–8 s | oui | Boucle : roue à aubes, eau qui retombe, axe en bois. |
| `audio/sfx/creatures/expr-calm-01.wav` | expr-calm (1/2) | `npc.expression` | 0.3–0.7 s | non | Petit ronronnement/gazouillis paisible. |
| `audio/sfx/creatures/expr-calm-02.wav` | expr-calm (2/2) | `npc.expression` | 0.3–0.7 s | non | Petit ronronnement/gazouillis paisible. |
| `audio/sfx/creatures/expr-effort-01.wav` | expr-effort (1/2) | `npc.expression` | 0.2–0.5 s | non | Petit « hmpf » d’effort non verbal. |
| `audio/sfx/creatures/expr-effort-02.wav` | expr-effort (2/2) | `npc.expression` | 0.2–0.5 s | non | Petit « hmpf » d’effort non verbal. |
| `audio/sfx/creatures/owl-01.wav` | owl (1/2) | `fauna.owl` | 1–2 s | non | Hululement lointain et doux. |
| `audio/sfx/creatures/owl-02.wav` | owl (2/2) | `fauna.owl` | 1–2 s | non | Hululement lointain et doux. |
| `audio/sfx/creatures/frog-01.wav` | frog (1/3) | `fauna.frog` | 0.5–1.2 s | non | Coassement isolé de grenouille. |
| `audio/sfx/creatures/frog-02.wav` | frog (2/3) | `fauna.frog` | 0.5–1.2 s | non | Coassement isolé de grenouille. |
| `audio/sfx/creatures/frog-03.wav` | frog (3/3) | `fauna.frog` | 0.5–1.2 s | non | Coassement isolé de grenouille. |
| `audio/sfx/creatures/insect-01.wav` | insect (1/2) | `fauna.insects` | 1–2.5 s | non | Bourdon qui passe, doppler léger. |
| `audio/sfx/creatures/insect-02.wav` | insect (2/2) | `fauna.insects` | 1–2.5 s | non | Bourdon qui passe, doppler léger. |
| `audio/sfx/water/fish-01.wav` | fish (1/2) | `fauna.fish.splash` | 0.3–0.7 s | non | Petit poisson qui saute et retombe : « plic » bref et bulles. |
| `audio/sfx/water/fish-02.wav` | fish (2/2) | `fauna.fish.splash` | 0.3–0.7 s | non | Petit poisson qui saute et retombe : « plic » bref et bulles. |
| `audio/sfx/creatures/gull-01.wav` | gull (1/2) | `fauna.gull` | 0.6–1.5 s | non | Cri de mouette lointain. |
| `audio/sfx/creatures/gull-02.wav` | gull (2/2) | `fauna.gull` | 0.6–1.5 s | non | Cri de mouette lointain. |
| `audio/sfx/objects/amb-fire-01.wav` | amb-fire (1/1) | `ambience.fire` | 4–8 s | oui | Boucle : crépitement de petit feu de bois. |
| `audio/ambience/weather/amb-wind-strong-01.wav` | amb-wind-strong (1/1) | `weather.wind` | 6–8 s | oui | Boucle : vent fort d’altitude, rafales lentes. |
| `audio/ambience/forest/amb-forest-night-01.wav` | amb-forest-night (1/1) | `ambience.forest` | 6–8 s | oui | Boucle nocturne : feuillage presque immobile, air froid, très calme. |
| `audio/ambience/marsh/amb-swamp-01.wav` | amb-swamp (1/1) | `ambience.swamp` | 6–8 s | oui | Boucle : eau stagnante, bulles rares, insectes très lointains. |
| `audio/ambience/coast/amb-sea-01.wav` | amb-sea (1/1) | `ambience.sea` | 6–8 s | oui | Boucle sans couture : vagues régulières sur le sable, ressac doux. |
| `audio/ambience/water/amb-waterfall-01.wav` | amb-waterfall (1/1) | `ambience.waterfall` | 6–8 s | oui | Boucle : chute d’eau continue, large bande mais sans souffle agressif. |
| `audio/ambience/water/amb-lake-01.wav` | amb-lake (1/1) | `ambience.lake` | 6–8 s | oui | Boucle : eau calme qui clapote très doucement. |
| `audio/ambience/village/amb-village-01.wav` | amb-village (1/1) | `ambience.village` | 6–8 s | oui | Boucle : vie de village animal paisible, bois, outils lointains, aucune voix humaine. |
| `audio/music/music-menu.mid` | menu (1/1) | `music:menu` | 32–64 s | oui | Thème d’accueil chaleureux, flûte + harpe, boucle propre sur 8–16 mesures. (72–84 BPM) |
| `audio/music/music-forest.mid` | forest (1/1) | `music:forest` | 45–90 s | oui | Motif boisé à la flûte, pizzicati, mode dorien, sans percussion forte. (76–88 BPM) |
| `audio/music/music-village.mid` | village (1/1) | `music:village` | 45–90 s | oui | Air de village enjoué, pluck + percussion douce, carrure régulière. (92–104 BPM) |
| `audio/music/music-farm.mid` | farm (1/1) | `music:farm` | 45–90 s | oui | Motif pastoral, harpe + flûte, rythme de travail paisible. (88–100 BPM) |
| `audio/music/music-coast.mid` | coast (1/1) | `music:coast` + `music:sailing` | 45–90 s | oui | Houle en 6/8, flûte ample et harpe ondulante. (80–92 BPM) |
| `audio/music/music-mountain.mid` | mountain (1/1) | `music:mountain` | 45–90 s | oui | Grand espace : harpe en arpèges larges, flûte lointaine. (64–76 BPM) |
| `audio/music/music-ruins.mid` | ruins (1/1) | `music:ruins` | 45–90 s | oui | Mystère ancien : clochettes, intervalles de quarte, rares percussions. (60–70 BPM) |
| `audio/music/music-mission.mid` | mission (1/1) | `music:mission` | 32–64 s | oui | Motif de réflexion léger, pizzicati, boucle courte non lassante. (96–108 BPM) |

### Vague 3 — optionnelle / ultérieure : 64 fichiers

| Fichier | Groupe (prise) | Événements | Durée | Boucle | Cahier des charges |
|---|---|---|---|---|---|
| `audio/sfx/footsteps/fs-metal-01.wav` | fs-metal (1/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur grille/plaque métallique : tintement court et sourd, sans résonance longue. |
| `audio/sfx/footsteps/fs-metal-02.wav` | fs-metal (2/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur grille/plaque métallique : tintement court et sourd, sans résonance longue. |
| `audio/sfx/footsteps/fs-metal-03.wav` | fs-metal (3/3) | `player.footstep` | 0.15–0.3 s | non | Pas sur grille/plaque métallique : tintement court et sourd, sans résonance longue. |
| `audio/sfx/footsteps/fs-snow-01.wav` | fs-snow (1/3) | `player.footstep` | 0.2–0.4 s | non | Pas dans neige fraîche : compression feutrée (neige éventuelle). |
| `audio/sfx/footsteps/fs-snow-02.wav` | fs-snow (2/3) | `player.footstep` | 0.2–0.4 s | non | Pas dans neige fraîche : compression feutrée (neige éventuelle). |
| `audio/sfx/footsteps/fs-snow-03.wav` | fs-snow (3/3) | `player.footstep` | 0.2–0.4 s | non | Pas dans neige fraîche : compression feutrée (neige éventuelle). |
| `audio/sfx/player/slide-01.wav` | slide (1/2) | `player.slide` | 0.5–1 s | non | Glissade sur terre/herbe : frottement continu court. |
| `audio/sfx/player/slide-02.wav` | slide (2/2) | `player.slide` | 0.5–1 s | non | Glissade sur terre/herbe : frottement continu court. |
| `audio/sfx/water/boat-bump-01.wav` | boat-bump (1/2) | `boat.collision` | 0.4–0.9 s | non | Coque en bois qui heurte la rive : toc sourd sans casse. |
| `audio/sfx/water/boat-bump-02.wav` | boat-bump (2/2) | `boat.collision` | 0.4–0.9 s | non | Coque en bois qui heurte la rive : toc sourd sans casse. |
| `audio/sfx/mining/mine-crack-01.wav` | mine-crack (1/2) | `mine.crack` | 0.3–0.7 s | non | Roche qui se fend : craquement sec. |
| `audio/sfx/mining/mine-crack-02.wav` | mine-crack (2/2) | `mine.crack` | 0.3–0.7 s | non | Roche qui se fend : craquement sec. |
| `audio/sfx/magic/shimmer-hit-01.wav` | shimmer-hit (1/1) | `mine.discovery` | 1–2 s | non | Scintillement montant très doux, complète le jingle MIDI. |
| `audio/sfx/farming/till-01.wav` | till (1/3) | `farm.till` | 0.4–0.8 s | non | Binette dans la terre meuble. |
| `audio/sfx/farming/till-02.wav` | till (2/3) | `farm.till` | 0.4–0.8 s | non | Binette dans la terre meuble. |
| `audio/sfx/farming/till-03.wav` | till (3/3) | `farm.till` | 0.4–0.8 s | non | Binette dans la terre meuble. |
| `audio/sfx/farming/cut-01.wav` | cut (1/2) | `farm.cut` | 0.2–0.4 s | non | Coup de sécateur sur tige tendre. |
| `audio/sfx/farming/cut-02.wav` | cut (2/2) | `farm.cut` | 0.2–0.4 s | non | Coup de sécateur sur tige tendre. |
| `audio/sfx/farming/pick-01.wav` | pick (1/3) | `farm.pick` | 0.25–0.5 s | non | Fruit/légume détaché à la main : petit « pop » végétal. |
| `audio/sfx/farming/pick-02.wav` | pick (2/3) | `farm.pick` | 0.25–0.5 s | non | Fruit/légume détaché à la main : petit « pop » végétal. |
| `audio/sfx/farming/pick-03.wav` | pick (3/3) | `farm.pick` | 0.25–0.5 s | non | Fruit/légume détaché à la main : petit « pop » végétal. |
| `audio/sfx/farming/basket-01.wav` | basket (1/2) | `farm.basket` | 0.3–0.6 s | non | Osier qui reçoit des légumes. |
| `audio/sfx/farming/basket-02.wav` | basket (2/2) | `farm.basket` | 0.3–0.6 s | non | Osier qui reçoit des légumes. |
| `audio/sfx/farming/tools-01.wav` | tools (1/2) | `farm.tools` + `mine.tool.switch` | 0.3–0.6 s | non | Outils en bois et métal qui s’entrechoquent doucement. |
| `audio/sfx/farming/tools-02.wav` | tools (2/2) | `farm.tools` + `mine.tool.switch` | 0.3–0.6 s | non | Outils en bois et métal qui s’entrechoquent doucement. |
| `audio/sfx/creatures/squirrel-01.wav` | squirrel (1/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/creatures/squirrel-02.wav` | squirrel (2/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/creatures/squirrel-03.wav` | squirrel (3/3) | `npc.squirrel.chatter` | 0.3–0.8 s | non | Cri/claquement d’écureuil réaliste mais doux. |
| `audio/sfx/creatures/expr-happy-01.wav` | expr-happy (1/2) | `npc.expression` | 0.3–0.7 s | non | Petit son joyeux non verbal. |
| `audio/sfx/creatures/expr-happy-02.wav` | expr-happy (2/2) | `npc.expression` | 0.3–0.7 s | non | Petit son joyeux non verbal. |
| `audio/sfx/creatures/expr-surprised-01.wav` | expr-surprised (1/2) | `npc.expression` | 0.2–0.5 s | non | Petit sursaut non verbal. |
| `audio/sfx/creatures/expr-surprised-02.wav` | expr-surprised (2/2) | `npc.expression` | 0.2–0.5 s | non | Petit sursaut non verbal. |
| `audio/sfx/creatures/expr-sad-01.wav` | expr-sad (1/2) | `npc.expression` | 0.4–0.8 s | non | Soupir doux non verbal. |
| `audio/sfx/creatures/expr-sad-02.wav` | expr-sad (2/2) | `npc.expression` | 0.4–0.8 s | non | Soupir doux non verbal. |
| `audio/sfx/creatures/expr-annoyed-01.wav` | expr-annoyed (1/2) | `npc.expression` | 0.2–0.5 s | non | Petit grognement de mécontentement léger, jamais agressif. |
| `audio/sfx/creatures/expr-annoyed-02.wav` | expr-annoyed (2/2) | `npc.expression` | 0.2–0.5 s | non | Petit grognement de mécontentement léger, jamais agressif. |
| `audio/sfx/creatures/npc-activity-01.wav` | npc-activity (1/2) | `npc.activity` | 0.5–1.2 s | non | Petit animal qui grignote/fouille les feuilles. |
| `audio/sfx/creatures/npc-activity-02.wav` | npc-activity (2/2) | `npc.activity` | 0.5–1.2 s | non | Petit animal qui grignote/fouille les feuilles. |
| `audio/sfx/creatures/flock-01.wav` | flock (1/1) | `fauna.bird.flock` | 0.8–1.5 s | non | Battements d’ailes d’un petit groupe qui s’envole. |
| `audio/sfx/creatures/mammal-01.wav` | mammal (1/2) | `fauna.mammal` + `mount.vocalize` | 0.5–1.5 s | non | Appel lointain d’un mammifère forestier, non agressif. |
| `audio/sfx/creatures/mammal-02.wav` | mammal (2/2) | `fauna.mammal` + `mount.vocalize` | 0.5–1.5 s | non | Appel lointain d’un mammifère forestier, non agressif. |
| `audio/sfx/objects/chest-01.wav` | chest (1/2) | `interaction.chest.open` | 0.5–1 s | non | Couvercle de coffre en bois, charnières. |
| `audio/sfx/objects/chest-02.wav` | chest (2/2) | `interaction.chest.open` | 0.5–1 s | non | Couvercle de coffre en bois, charnières. |
| `audio/ambience/misc/gears-01.wav` | gears (1/1) | `interaction.gears` + `ruins.mechanism` | 2–4 s | oui | Boucle : engrenages en bois qui tournent lentement. |
| `audio/sfx/objects/bridge-01.wav` | bridge (1/2) | `interaction.bridge` | 0.8–1.6 s | non | Pont en bois qui grince et se pose. |
| `audio/sfx/objects/bridge-02.wav` | bridge (2/2) | `interaction.bridge` | 0.8–1.6 s | non | Pont en bois qui grince et se pose. |
| `audio/sfx/objects/torch-01.wav` | torch (1/1) | `interaction.torch` | 0.5–1 s | non | Embrasement court d’une torche (« fwoosh »). |
| `audio/sfx/objects/mission-accept-01.wav` | mission-accept (1/1) | `mission.accept` | 0.6–1.2 s | non | Petit motif d’engagement (2 notes boisées), distinct du succès. |
| `audio/sfx/objects/puzzle-step-01.wav` | puzzle-step (1/2) | `puzzle.step` | 0.3–0.6 s | non | Pierre qui s’enclenche, clic net. |
| `audio/sfx/objects/puzzle-step-02.wav` | puzzle-step (2/2) | `puzzle.step` | 0.3–0.6 s | non | Pierre qui s’enclenche, clic net. |
| `audio/sfx/magic/magic-01.wav` | magic (1/2) | `magic.activate` | 0.8–1.6 s | non | Activation douce : carillon + souffle scintillant. |
| `audio/sfx/magic/magic-02.wav` | magic (2/2) | `magic.activate` | 0.8–1.6 s | non | Activation douce : carillon + souffle scintillant. |
| `audio/sfx/magic/amb-shimmer-01.wav` | amb-shimmer (1/1) | `magic.shimmer` | 4–8 s | oui | Boucle : nappe scintillante très légère. |
| `audio/ambience/weather/amb-rain-heavy-01.wav` | amb-rain-heavy (1/1) | `weather.rain` | 6–8 s | oui | Boucle : averse dense, sans tonnerre intégré. |
| `audio/ambience/weather/thunder-01.wav` | thunder (1/2) | `weather.thunder` | 2–4 s | non | Tonnerre lointain roulant, sans claquement violent. |
| `audio/ambience/weather/thunder-02.wav` | thunder (2/2) | `weather.thunder` | 2–4 s | non | Tonnerre lointain roulant, sans claquement violent. |
| `audio/ambience/desert/amb-desert-01.wav` | amb-desert (1/1) | `ambience.desert` | 6–8 s | oui | Boucle : vent sec et chaud avec sable qui glisse, espace très ouvert. |
| `audio/ambience/volcano/amb-volcano-01.wav` | amb-volcano (1/1) | `ambience.volcano` | 6–8 s | oui | Boucle : grondement tellurique grave, bouillonnement lointain. |
| `audio/music/music-day-b.mid` | explore.day (1/1) | `music:explore.day` | 40–80 s | oui | Variante jour légère et aérée, mêmes timbres que midi-day, tonalité voisine. (84–96 BPM) |
| `audio/music/music-night-b.mid` | explore.night (1/1) | `music:explore.night` | 40–80 s | oui | Variante nocturne clairsemée : clochette, harpe, longues respirations. (60–72 BPM) |
| `audio/music/music-swamp.mid` | swamp (1/1) | `music:swamp` | 45–90 s | oui | Motif lent et humide, notes tenues de flûte grave. (66–76 BPM) |
| `audio/music/music-desert.mid` | desert (1/1) | `music:desert` | 45–90 s | oui | Mode phrygien doux, pluck répétitif, espace. (70–80 BPM) |
| `audio/music/music-magic.mid` | magic (1/1) | `music:magic` | 32–64 s | oui | Nappe de clochettes et harpe en gammes par tons. (libre) |
| `audio/music/music-rare.mid` | rare.phenomenon (1/1) | `music:rare.phenomenon` | 4–8 s | non | Jingle étrange et merveilleux, clochettes en tons entiers. (libre) |

### Déjà produits : 112 fichiers

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
| `audio/sfx/player/jump-01.wav` | TECHNICALLY_VALID | `player.jump` |
| `audio/sfx/player/jump-02.wav` | TECHNICALLY_VALID | `player.jump` |
| `audio/sfx/player/land-soft-01.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-soft-02.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-soft-03.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-heavy-01.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/land-heavy-02.wav` | TECHNICALLY_VALID | `player.land` |
| `audio/sfx/player/glide-deploy-01.wav` | TECHNICALLY_VALID | `player.glide.deploy` |
| `audio/sfx/player/glide-deploy-02.wav` | TECHNICALLY_VALID | `player.glide.deploy` |
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
| `audio/ambience/water/amb-underwater-01.wav` | TECHNICALLY_VALID | `ambience.underwater` |
| `audio/sfx/water/boat-board-01.wav` | TECHNICALLY_VALID | `boat.board` |
| `audio/sfx/water/boat-board-02.wav` | TECHNICALLY_VALID | `boat.board` |
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
| `audio/sfx/mining/mine-rubble-01.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-rubble-02.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-rubble-03.wav` | TECHNICALLY_VALID | `mine.cell.excavated` |
| `audio/sfx/mining/mine-collect-01.wav` | TECHNICALLY_VALID | `mine.resource.collect` |
| `audio/sfx/mining/mine-collect-02.wav` | TECHNICALLY_VALID | `mine.resource.collect` |
| `audio/sfx/mining/mine-crystal-01.wav` | TECHNICALLY_VALID | `mine.resource.crystal` |
| `audio/sfx/mining/mine-crystal-02.wav` | TECHNICALLY_VALID | `mine.resource.crystal` |
| `audio/sfx/mining/mine-denied-01.wav` | TECHNICALLY_VALID | `mine.action.denied` |
| `audio/sfx/mining/mine-denied-02.wav` | TECHNICALLY_VALID | `mine.action.denied` |
| `audio/ambience/mine/amb-cave-01.wav` | TECHNICALLY_VALID | `ambience.cave` |
| `audio/sfx/farming/plant-01.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/plant-02.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/plant-03.wav` | TECHNICALLY_VALID | `farm.plant` |
| `audio/sfx/farming/watering-01.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/sfx/farming/watering-02.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/sfx/farming/watering-03.wav` | TECHNICALLY_VALID | `farm.water` |
| `audio/sfx/farming/weed-01.wav` | TECHNICALLY_VALID | `farm.weed` |
| `audio/sfx/farming/weed-02.wav` | TECHNICALLY_VALID | `farm.weed` |
| `audio/sfx/farming/harvest-grain-01.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-grain-02.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-grain-03.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-01.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-02.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/harvest-03.wav` | TECHNICALLY_VALID | `farm.harvest` |
| `audio/sfx/farming/pickup-01.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/farming/pickup-02.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/farming/pickup-03.wav` | TECHNICALLY_VALID | `interaction.collect` |
| `audio/sfx/ui/bag-01.wav` | TECHNICALLY_VALID | `ui.inventory.open` |
| `audio/sfx/ui/bag-02.wav` | TECHNICALLY_VALID | `ui.inventory.open` |
| `audio/ambience/weather/amb-rain-light-01.wav` | TECHNICALLY_VALID | `weather.rain` |
| `audio/ambience/weather/amb-wind-light-01.wav` | TECHNICALLY_VALID | `weather.wind` |
| `audio/ambience/forest/amb-forest-01.wav` | TECHNICALLY_VALID | `ambience.forest` |
| `audio/ambience/water/amb-river-01.wav` | TECHNICALLY_VALID | `ambience.water.river` |
| `audio/ambience/forest/amb-night-01.wav` | TECHNICALLY_VALID | `ambience.night` |

## Diagnostics du catalogue livré

109 diagnostics (55 avertissements : événements encore silencieux). Aucun n’est bloquant.

- « player.slide » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.lap » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « water.rapids » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.move » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.creak » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « boat.collision » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.crack » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.tool.switch » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.enter » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.exit » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave.drip » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.cave.rumble » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « mine.discovery » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.till » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.irrigate » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.cut » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « farm.pick » n’a encore aucune ressource disponible : l’événement reste silencieux.
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
- « puzzle.step » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ruins.mechanism » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « magic.activate » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « magic.shimmer » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « weather.thunder » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.plain » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.swamp » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.desert » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.volcano » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.sea » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.waterfall » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.lake » n’a encore aucune ressource disponible : l’événement reste silencieux.
- « ambience.village » n’a encore aucune ressource disponible : l’événement reste silencieux.
