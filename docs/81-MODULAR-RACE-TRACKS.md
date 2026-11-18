# 81 — Pistes modulaires de courses : virages, tremplins, bosses, ponts

**Statut (novembre 2026)** : prototype de pistes fixes en cours sur `feat/races-flight-roll-demo`, PR #81 en brouillon. Pas de publication automatique sur l'île 4 × 3 km ni de serveur.

## Intention de jeu

Les checkpoints doivent donner un objectif et non constituer les seules structures du parcours. Les vrais parcours de roulade suivent une route lisible, peuvent descendre et tourner, ou se dérouler presque à plat avec des enchaînements de bosses et de rampes. Chaque module doit faciliter la prise de trajectoire sans imposer de pilotage automatique. Garder le système de saut, de roulade et les boosts existants.

## Architecture

- `RaceDefinition.track?` : piste facultative, séparée de `gates`. Champs `points` (2 à 64), `width` (3–18 m), `smooth`, `material` (terre, pierre, bois), `features` (0–32). Modèle strictement déclaratif, compatible archives V3, compilateur et ancien monde sans piste.
- Les virages utilisent la fonction `centerline` native des chemins de Little World. La piste a son propre habillage basse définition pour les virages inclinés et les tabliers ; les chemins ordinaires restent intacts.
- Chaque module a un `at` et une `length` en mètres **le long de la piste** : il reste relatif au tracé si l'éditeur déplace les points. Pas de script arbitraire, pas de nouvel ECS ni de moteur de collisions.
- Le même échantillonneur 2,5D `createRaceTrackSampler` sert au maillage 3D et au sol de `WorldCollisionQuery` (avec approche depuis le dessus pour les ponts). Géométrie générée une fois, maximum de 1400 stations de 3 sommets par piste, pas de mise à jour du mesh à chaque tick.
- Dans Studio → Courses, créer une piste à partir des portes, tracer la route, choisir largeur/revêtement/lissage et ajouter/supprimer/régler les modules. Chaque modification est une transaction Undo/Redo.
- Une modification du tracé ou d'un module change `layoutKey` pour isoler les records locaux. La version du monde/terrain et de la physique devra aussi être figée avant les classements réseau.

## Modules V1

| Module | Physique et rendu | Réglages initiaux à tester |
|---|---|---|
| Virage relevé (`bank`) | Section inclinée latéralement, élevée à l'extérieur, guidage par le profil du sol | 10–25° sur 12–25 m, largeur 7–10 m |
| Tremplin (`ramp`) | Profil montant jusqu'au bord avec pente positive au lancement ; la chute au-delà du bord déclenche le saut physique | 0,8–2 m sur 7–12 m |
| Bosses (`bumps`) | Deux ondulations de faible amplitude, petits sauts à vitesse suffisante | 0,3–1 m sur 8–14 m |
| Pont (`bridge`) | Platelage interpolé entre ses deux extrémités, posable au-dessus d'un creux ; accès par-dessus sans projection depuis dessous | 8–30 m, dégagement à calibrer |

Le point de départ de la piste précède la première porte et la piste peut dépasser l'arrivée (zone de décélération). Les portes restent éditables séparément.

## Contraintes et diagnostics

- Avertir quand le rayon de virage est trop faible relativement à la largeur, quand la pente dépasse l'adhérence du hamster, quand les éléments se superposent ou dépassent la longueur.
- Vérifier en playtest l'approche au sol, le lancement en saut, la réception et le comportement sur le pont. Le calcul 2,5D ne gère pas les loops ni plusieurs tabliers superposés au même X/Z.
- Les ponts peuvent être dessinés sans appuis ni barrières solides dans ce premier lot : ne pas promettre de collision avec une rambarde visuelle. Étudier des modules de piliers et garde-corps physiques distincts.
- Éviter les tracés superposés dans une même cellule. Éviter les modules à moins de quelques mètres d'une falaise ou d'un obstacle non évalué par le générateur.
- Les routes restent visibles et roulables hors course ; la chronométrie et les checkpoints, eux, ne sont actifs que pendant un défi.
- Les fréquences de rendu LOD des alentours suivent déjà l'adaptation au matériel ; la piste n'a pas de CPU par frame. Vérifier les 30 Hz de simulation et les PC 4–8 Go.

## Évolutions ciblées, non livrées

1. Murs de virage, rails de sécurité, barrières souples et panneaux de direction avec vrais colliders ; jeu de slalom.
2. Passages au-dessus/au-dessous de deux pistes : une couche physique supplémentaire est nécessaire, pas seulement deux heightmaps au même X/Z.
3. Tunnels traversants/arches avec hauteur libre mesurée et collisions compatibles mine/terrain.
4. Raccourcis, embranchements, pénalités hors piste, multi-classes de course, fantômes.
5. Synchronisation future : géométrie/physique figées par version, arbitre serveur avec simulation à 30 Hz et passages en ordre. Pas de réseau pour ce lot.

## Qualification

`npm test` + `npm run build` + check navigateur Studio → Jouer ici, puis sessions manuelles sur île 4×3 km. Mesurer FPS, collisions et coupures de secteur avec et sans piste.
