# 80 — Courses en vol, roulade et circuits fixes Studio

Statut : implémentation de la phase Studio sur feat/races-flight-roll-demo (PR #81 brouillon). Pas encore fusionné.

## Utilisation

Dans le jeu, le panneau Courses donne accès aux trois démonstrations dynamiques (vol, roulade, mixte) et aux circuits fixes issus du projet Studio. Pour un circuit fixe, rejoindre la première porte, lancer le défi puis franchir la porte dans le bon sens pour déclencher le chronomètre.

Dans Studio, ouvrir Courses (groupe Logique). Tracer les checkpoints dans l'ordre avec le PolylineTool existant, puis régler leur altitude par rapport au terrain, forme et dimensions. Modifier le tracé, renommer, supprimer et annuler/refaire utilisent le CommandBus commun.

## Architecture

- Source : bibliothèques V3 optionnelles libraries.races ; validateAuthoredRace et putAuthoredRace ; anciens projets préservés.
- Compilation : bibliothèques transportées par compiled-logic ; playableFromCompiled les expose dans PlayableWorld.races.
- Physique : checkpoints traversés via segment orienté à 30 Hz, sans raycast de rendu ni nouvelle physique ; chrono au franchissement de la porte de départ et arrivée interpolée.
- Graphisme : anneaux et arches low-poly instanciés, dissociés de la validation.
- Records : locaux, liés à une signature de la géométrie du circuit ; aucune compétition globale.

## Limites

Les tracés ne font pas encore l'objet d'un diagnostic complet de trajectoire réalisable (pentes, objets, vents), ni de parcours fixes publiés dans l'île officielle. Le multijoueur, les serveurs et les classements globaux sont reportés. Il reste à qualifier les tests navigateur et les FPS sur PC 4–8 Go.

## Vérification

npm ci ; npm test ; npm run typecheck ; npm run build ; npm run test:ui ; npm run test:motion.
