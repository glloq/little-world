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
npm ci
npm run dev
```

Ouvrir **http://localhost:5173/little-world/** ; éditeur **http://localhost:5173/little-world/editor/**.

```bash
npm test          # tests des règles de terrain, mouvement et fichiers GLB
npm run typecheck # TypeScript strict
npm run build     # génère dist/ pour GitHub Pages
npm run preview   # prévisualisation du build
```

## Campagne de développement

- Terrain en secteurs chargés progressivement, trois LOD et cache borné ; cartes synthétiques jusqu’à **2 × 2 km**. La carte par défaut reste la vallée de 200 × 600 m.
- Écureuil articulé avec 14 os, 13 états animés interpolés, 9 expressions et accessoires ; GLB original exportable. Le rig est rigide, sans skinning pondéré ; le jeu utilise sa version procédurale.
- Quatre PNJ de démonstration, activités selon la distance, navigation simple et dialogues à choix/flags locaux.
- Sept biotopes et dix modèles écologiques procéduraux instanciés : flore, oiseaux, papillons et poissons contraints à l’eau.
- Atelier : sculpture, peinture de biotopes, tracés d’eau/chemins, sélection/gizmos, historique, PNJ et dialogues, sauvegarde/rechargement et test immédiat.
- Format de carte v2 validé commun au jeu/éditeur, migration v1, compilation en données statiques pour Pages.

```bash
npm run compile:map -- maps/default.json public/maps/default.json
npm run assets:squirrel # régénère le GLB original
# Avec npm run dev dans un autre terminal et Chromium installé :
npm run test:browser
npm run benchmark -- http://127.0.0.1:5173/little-world/ /tmp/world-bench
```

Les tests navigateur utilisent Chromium système s’il existe, sinon celui de Playwright (`npx playwright install chromium`). Les résultats cloud utilisent SwiftShader et ne représentent pas les performances d’un GPU PC. Le suivi précis et les fonctions restantes figurent dans [la feuille de route](docs/07-ROADMAP.md) et [les mesures](docs/10-PERFORMANCE-ROADMAP.md).

## Base du prototype conservée


- **Terrain low-poly procédural** : relief, cours d'eau en pente, mer, montagnes et sentier ; graine de placement déterministe.
- **Végétation instanciée** ; moulin, maisons, ponton, barque et roue animée.
- **Écureuil 3D low-poly original**, remodelé en style chibi (visage expressif, grandes oreilles, ventre crème, queue volumineuse). Membrane de planage cachée au repos et déployée seulement en vol ; 9 expressions et accessoires modulaires. Le personnage est encore procédural, **avec rig rigide et GLB exporté, sans skinning pondéré**.
- **Caméra troisième personne** orientable à la souris et HUD affichant l'état, les coordonnées, les FPS et l'oxygène.
- **Moulin automatique** : la roue tourne avec le cours d'eau, sans interaction artificielle.
- **Bateau pilotable** depuis le port : embarquement/débarquement, accélération, inertie, gouvernail et limites d'eau navigable.
- **Performance** : terrain rendu par sections, végétation instanciée par secteur, géométries et matériaux réutilisés, chargement GLB mutualisé et modes de qualité de rendu.
- **Objectif LOW-RESOURCE** : 30 FPS nominal, 20 FPS en secours, sans ralentissement de la simulation ; [budget global de ressources](docs/11-LOW-RESOURCE-POLICY.md). Cible **documentée mais pas encore implémentée** (boucle de jeu actuellement à 60 Hz).
- **Éditeur initial** : changer la graine et la densité, choisir des prefabs, cliquer sur le terrain pour placer des objets, effacer, sauvegarder dans IndexedDB, exporter/importer JSON.
- **Catalogue d'assets intégré** : trois fichiers GLB originaux (`public/models/`) plus des prefabs générés par code, inventoriés dans `assets/catalog.json`.
- Aucun backend, compte, serveur multijoueur ou API externe au runtime.

## Contrôles

| Entrée | Effet |
| --- | --- |
| `ZQSD` ou `WASD` | Déplacer l'écureuil |
| **Clic gauche maintenu + glisser** sur la scène | Tourner la caméra ; souris libre autrement |
| `Shift` | Course |
| **`A` maintenu** | Menu accessoires et émotions ; clic pour équiper/choisir |
| `A` relâché | Fermer le menu (choix conservés localement) |
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

**Clavier :** le menu reconnaît la lettre **A** sur AZERTY et QWERTY (pas la position physique de la touche). Sur QWERTY, **A est réservé au menu** : utiliser **Q** ou **←** pour aller à gauche. Sur AZERTY, **Q** reste la commande gauche. Les choix d'accessoires/émotions sont enregistrés en `localStorage`.

En mode éditeur : clic-glisser pour pivoter la vue, molette pour zoomer ; sélectionner un asset à gauche puis cliquer sur le terrain pour le déposer.

## Architecture actuelle

```text
index.html                  # Jeu
editor/index.html           # Éditeur
src/
  terrain.ts                # Relief, hydrologie, graine, limites
  world.ts                  # Terrain sectionné, végétation, prefabs, GLB
  boat.ts                   # Navigation arcade et contraintes nautiques
  player.ts                 # Simulation locale des mouvements
  squirrel.ts               # Modèle 3D original, morphologie, mimiques, accessoires
  character-style.ts        # Options et sauvegarde des apparences
  customization-menu.ts     # Interface de personnalisation (A maintenu)
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

- Le personnage est une **version procédurale stylisée plus aboutie**, avec rig rigide et animations interpolées ; skinning pondéré et déformation fine restent à réaliser.
- Le contrôleur de mouvement utilise actuellement des **collisions analytiques avec le terrain** : la physique Rapier et les collisions détaillées des bâtiments restent à intégrer.
- L'eau, la nage et le planage sont des **modèles arcade provisoires**, à ajuster après essais.
- Le bateau n'a pas encore de collisions physiques détaillées avec les pontons ; les limites de navigation sont évaluées à partir de la profondeur.
- Les optimisations actuelles limitent l'utilisation GPU mais ne constituent pas encore un système de streaming/LOD pour une très grande carte.
- Les tracés d’eau et chemins sont des polylignes, sans poignées de déplacement de points. Les règles d’interaction générales et les collisions détaillées de bâtiments restent à développer ; les changements locaux ne publient pas automatiquement le site.
- L'instance jouable charge la carte par défaut ; **les objets placés dans l'éditeur ne remplacent pas le jeu publié** sans compiler la carte exportée dans `public/maps/default.json`, la commiter et redéployer.
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
- [Politique globale LOW-RESOURCE : 30/20 Hz, CPU/GPU, PNJ, éditeur](docs/11-LOW-RESOURCE-POLICY.md)

**Licence de code :** à définir. Les premiers GLB ont été créés spécifiquement pour Little World ; aucun asset tiers n'est incorporé à ce stade.
