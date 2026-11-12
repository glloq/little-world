# Little World

Prototype **solo** d'exploration 3D avec **Three.js**, exécutable entièrement dans un navigateur PC. Un **écureuil volant** parcourt une vallée montagneuse de **200 × 600 m**, avec rivière, moulin à eau, forêt, petit village et port maritime.

> **Statut : prototype technique jouable en développement.** La première version est volontairement simple, avec graphismes et physique provisoires. Le code et les fichiers sont dans `main`. Le site est publié via GitHub Pages. La disponibilité de la dernière révision dépend du déploiement GitHub Actions.

## Essayer le prototype

**GitHub Pages :**
- Jeu : **https://glloq.github.io/little-world/**
- Éditeur : **https://glloq.github.io/little-world/editor/**

Les publications sont suivies dans [Build and deploy Little World](https://github.com/glloq/little-world/actions). Le build est 100 % statique et utilise `/little-world/` comme préfixe.

### Lancer en local

Pré-requis : **Node.js 22** et npm.

```bash
git clone https://github.com/glloq/little-world.git
cd little-world
npm install
npm run dev
```

Ouvrir **http://localhost:5173/little-world/** ; éditeur **http://localhost:5173/little-world/editor/**.

```bash
npm test          # tests des règles de terrain, mouvement et fichiers GLB
npm run typecheck # TypeScript strict
npm run build     # génère dist/ pour GitHub Pages
npm run preview   # prévisualisation du build
```

## Fonctionnalités initiales

- **Terrain low-poly procédural** : relief, cours d'eau en pente, mer, montagnes et sentier ; graine de placement déterministe.
- **Végétation instanciée** ; moulin, maisons, ponton, barque et roue animée.
- **Écureuil 3D provisoire**, sans asset tiers, avec marche, course, saut, planage, nage et plongée.
- **Caméra troisième personne** orientable à la souris et HUD affichant l'état, les coordonnées, les FPS et l'oxygène.
- **Moulin automatique** : la roue tourne avec le cours d'eau, sans interaction artificielle.
- **Bateau pilotable** depuis le port : embarquement/débarquement, accélération, inertie, gouvernail et limites d'eau navigable.
- **Performance** : terrain rendu par sections, végétation instanciée par secteur, géométries et matériaux réutilisés, chargement GLB mutualisé et modes de qualité de rendu.
- **Éditeur initial** : changer la graine et la densité, choisir des prefabs, cliquer sur le terrain pour placer des objets, effacer, sauvegarder dans IndexedDB, exporter/importer JSON.
- **Catalogue d'assets intégré** : trois fichiers GLB originaux (`public/models/`) plus des prefabs générés par code, inventoriés dans `assets/catalog.json`.
- Aucun backend, compte, serveur multijoueur ou API externe au runtime.

## Contrôles

| Entrée | Effet |
| --- | --- |
| `ZQSD` ou `WASD` | Déplacer l'écureuil |
| Souris (clic dans la scène) | Caméra libre |
| `Shift` | Course |
| `Espace` au sol | Saut |
| Relâcher puis réappuyer `Espace` en l'air | Ouvrir/replier la membrane |
| `Ctrl` dans l'eau | Plonger |
| `Espace` dans l'eau | Remonter |
| `P` | Aller au port rapidement (raccourci de test) |
| `E` près du bateau | Monter / descendre |
| `Z/S` ou `W/S` en bateau | Avancer / reculer |
| `Q/D` ou `A/D` en bateau | Tourner à gauche / droite |
| Qualité graphique (en haut) | Économie, Équilibré, Élevée |
| `R` | Retour au départ |
| `Échap` | Libérer le pointeur |

En mode éditeur : clic-glisser pour pivoter la vue, molette pour zoomer ; sélectionner un asset à gauche puis cliquer sur le terrain pour le déposer.

## Architecture actuelle

```text
index.html                  # Jeu
editor/index.html           # Éditeur
src/
  terrain.ts                # Relief, hydrologie, graine, limites
  world.ts                  # Terrain sectionné, végétation, prefabs, GLB
  boat.ts                   # Navigation arcade et contraintes nautiques
  player.ts                 # Simulation locale et modèle d'écureuil
  main.ts                   # Boucle de jeu, entrées, caméra, HUD
  editor.ts                 # Placement, import/export, IndexedDB
  style.css                 # Interface jeu et éditeur
assets/catalog.json         # Catalogue réel : GLB + modèles procéduraux
public/models/              # Fichiers GLB originaux publiés dans le site
tests/                      # Terrain, déplacements et GLB
.github/workflows/pages.yml # Tests, build Vite, publication Pages
docs/                       # Conception, objectifs et registre de décisions
```

## Limites connues

- Le personnage est un **proxy stylisé**, sans animations squelettiques ni rig final.
- Le contrôleur de mouvement utilise actuellement des **collisions analytiques avec le terrain** : la physique Rapier et les collisions détaillées des bâtiments restent à intégrer.
- L'eau, la nage et le planage sont des **modèles arcade provisoires**, à ajuster après essais.
- Le bateau n'a pas encore de collisions physiques détaillées avec les pontons ; les limites de navigation sont évaluées à partir de la profondeur.
- Les optimisations actuelles limitent l'utilisation GPU mais ne constituent pas encore un système de streaming/LOD pour une très grande carte.
- L'éditeur ne sculpte pas encore le relief, n'édite pas les courbes de rivière, ni ne configure librement les interactions ; les changements locaux ne publient pas automatiquement le site.
- L'instance jouable charge la carte par défaut ; **les objets placés dans l'éditeur ne remplacent pas le jeu publié** tant qu'un pipeline de compilation de carte n'est pas ajouté.
- Aucun multijoueur n'est prévu pour la première version.

## Documentation

- [Vision](docs/01-VISION.md)
- [Gameplay](docs/02-GAMEPLAY.md)
- [Générateur de vallée](docs/03-WORLD-GENERATION.md)
- [Éditeur et interactions](docs/04-EDITOR-INTERACTIONS.md)
- [Architecture](docs/05-TECHNICAL-ARCHITECTURE.md)
- [Assets](docs/06-ASSET-PIPELINE.md)
- [Feuille de route](docs/07-ROADMAP.md)
- [GitHub Pages](docs/08-GITHUB-PAGES.md)
- [Registre des décisions](docs/DECISIONS.md)
- [Plan de test navigateur](docs/09-BROWSER-TEST-PLAN.md)
- [Optimisation et extension de la carte](docs/10-PERFORMANCE-ROADMAP.md)

**Licence de code :** à définir. Les premiers GLB ont été créés spécifiquement pour Little World ; aucun asset tiers n'est incorporé à ce stade.
