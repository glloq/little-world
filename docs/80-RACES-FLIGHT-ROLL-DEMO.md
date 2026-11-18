# 80 — Courses en vol, roulade et mixtes : démonstration solo

**Statut (18 novembre 2026) : première implémentation en branche `feat/races-flight-roll-demo`, non fusionnée ; qualification navigateur et matériel à réaliser.** Aucune fonctionnalité réseau n'est activée. Les défis historiques de propulsion (`flight-courses.ts`) restent inchangés.

## Première livraison

- Trois modèles opt-in dans le jeu (barre rapide **Courses**) : **Anneaux des falaises** (5 anneaux, planeur déjà ouvert), **Descente des noisettes** (5 arches, démarrer en roulade), **Du sol aux nuages** (2 arches en roulade, 3 anneaux à franchir en plané).
- Les parcours se placent devant le joueur, selon sa direction et la hauteur terrain échantillonnée. Placement refusé hors des limites de l'île. Ils sont destinés au **test immédiat**, pas à l'implantation permanente des îles.
- Les origines sont quantifiées à 5 m et le cap à 15° pour reproduire un même tracé. Les temps personnels ne sont comparés qu'à **géométrie identique** (monde + type + version + clé de disposition). Aucun record global ni leaderboard.
- La course démarre depuis l'état physique courant, sans téléporter le joueur ou modifier vitesse/boost. La fermeture du planeur pendant un vol, la perte du mode roulade hors saut, les téléportations et les temps hors limite interrompent le défi.
- La simulation de passage repose sur le **segment entre positions physiques de deux ticks de 30 Hz**, une intersection avec un plan orienté et la forme de la porte. L'ordre est obligatoire, le passage à contre-sens ou à côté est ignoré. Temps d'arrivée interpolé dans le tick.
- Affichage : `InstancedMesh` partagé pour anneaux et arches, aucune collision physique créée. HUD simple à 5 Hz, mêmes règles si effets graphiques réduits.
- Sauvegarde locale facultative pour les records d'entraînement, distincte de la sauvegarde joueur et du projet Studio.

## Interfaces

- `src/gameplay/races.ts` : types purs, validation, moteur de progression de course, fonction `gateCrossing`.
- `src/gameplay/race-demos.ts` : trois configurations de parcours d'essai.
- `src/gameplay/race-records.ts` : records locaux des géométries identiques.
- `src/render/race-gates.ts` : rendu léger ; ne possède aucune autorité de validation.
- `src/main.ts` : branchement au tick physique, interruption sur changement de contexte, résultats.
- `src/ui/app/game-ui.ts` : panneau Courses.

## Étapes suivantes (à ne pas présenter comme réalisées)

1. Qualification visuelle et physique des trois circuits sur l'île 4 × 3 km, PC 4–8 Go et mobile : test réel des rampes, falaises, petits anneaux, rythme, collisions, streaming et accessibilité.
2. **Studio** : ajouter une bibliothèque de circuits source V3 versionnée et une compilation vers les données statiques ; éditeur de portes 3D avec gizmos, Undo/Redo et vérification d'accessibilité/obstacles. Ne pas ajouter de code script arbitraire dans une carte.
3. Circuits fixes construits sur la carte d'exemple : départs géolocalisés, balisage sur carte, ordre/règles compatibles avec une future course standard.
4. Fantômes à échantillons bornés, restitution visuelle sans simulation permanente ; tests de replay/snapshot complets ; scores séparés standard/libre.
5. Multijoueur **plus tard** : réutiliser `RaceDefinition` et `advanceRace` côté serveur avec autorité sur ticks et commandes, conserver les acteurs distants interpolés, lancer une session synchronisée, garantir la version de la physique, du monde, et du tracé. Les positions déclarées par le client ne doivent jamais valider seules un temps officiel.

## Qualification

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:motion # nécessite une instance navigateur locale
npm run test:ui     # nécessite une instance navigateur locale
```

**Tests unitaires ajoutés :** passage interpolé à vitesse élevée, sens de traversée, ouverture, ordre, tick consécutif, changement de mode, déplacement incohérent, bornes de carte, stabilité du tracé et records par géométrie.

**Limites volontaires :** pas de multijoueur actif, pas d'éditeur de course Studio, pas de courses fixes publiées sur carte, pas de ghost, pas de comparaison entre circuits générés à des positions différentes. Les portes générées à la demande ne certifient pas la faisabilité physique de tout le trajet : éviter les rochers, falaises et l'eau pendant les premiers tests.
