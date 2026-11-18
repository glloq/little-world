# Little World

> **Archipel futur — stratégie statique d'abord :** [73 — décisions](docs/73-ARCHIPEL-VISION-DECISIONS.md) et [79 — roadmap](docs/79-ISLAND-ROADMAP-VALIDATION.md). La prochaine étape vise plusieurs **îles d'exemple pré-générées et validées**, accessibles via des voyages dans un build **GitHub Pages sans serveur ni multijoueur**. Le site actuel demeure un prototype solo avec une île 4 × 3 km ; ce système inter-îles n'est **pas encore implémenté**.

Prototype **solo** d'exploration 3D avec **Three.js**, exécutable entièrement dans un navigateur PC. Le monde de démonstration jouable et éditable mesure **4 × 3 km** ; l'architecture cible prépare **une carte continue pouvant atteindre 10 × 10 km (100 km² au maximum)**, sans considérer cette taille comme déjà implémentée.

> **Statut : prototype technique jouable en développement.** La première version est volontairement simple, avec graphismes et physique provisoires. La campagne avancée est sur `feat/studio-v3` ; le site publié depuis `main` peut rester antérieur. La disponibilité de la dernière révision dépend du déploiement GitHub Actions.

## Essayer le prototype

**GitHub Pages :**
- Jeu (île 4 × 3 km) : **https://glloq.github.io/little-world/**
- Studio : **https://glloq.github.io/little-world/studio/** — éditeur 3D (clic : sélectionner · clic droit : orienter, + ZQSD/WASD : voler · molette : zoom · F : centrer · 7 : vue du dessus), voir [32 — Éditeur 3D](docs/32-STUDIO-EDITEUR-3D.md)
- L’ancien « Atelier de cartes » (`/editor/`) et l’ancienne vallée 200 × 600 m sont **retirés** : la page d’accueil ouvre l’île, le Studio est le seul éditeur. Voir [42 — Jeu complet V1](docs/42-JEU-COMPLET-V1.md).

**Si le site affiche uniquement du texte :** relancer **Build and deploy Little World** sur `main` avec le workflow corrigé. Il attend la fin de la publication automatique des sources avant de publier le build Vite et vérifie les trois interfaces publiques. Le réglage recommandé dans [Settings → Pages](https://github.com/glloq/little-world/settings/pages) est **Build and deployment → Source → GitHub Actions** pour éviter ce double build, mais le workflow fonctionne aussi sans modifier ce paramètre administratif. Publier uniquement `dist/`, jamais les sources TypeScript. Voir [le diagnostic et les contrôles de publication](docs/08-GITHUB-PAGES.md#incident--site-public-affichant-uniquement-du-texte).

Les publications sont suivies dans [Build and deploy Little World](https://github.com/glloq/little-world/actions). Le build est 100 % statique et utilise `/little-world/` comme préfixe.

### Démonstration officielle et scénarios techniques

La seule carte exemple publiée est **Île du volcan — 4 × 3 km**. Dans Studio → **Explorer un monde prêt**, une copie de cette carte complète est éditable.

Les anciennes cartes de falaises, mouvements, géographie, B1 et bêta sont des **fixtures de régression non publiées** (`tests/fixtures/legacy-maps/`). Les tests navigateur les utilisent après `node tools/stage-test-maps.mjs dist/maps` sur un build isolé, via `studio/?testFixtures=1`. Elles ne sont plus des modèles proposés au public.

Voir [la stratégie de démonstration 4 × 3 km](docs/61-SHOWCASE-ISLAND-4X3.md) et [les budgets des falaises](docs/53-CLIFF-REFERENCE.md).

### Îles composées et brouillon 2D

Sur `feat/stepped-island-identity` : silhouettes naturelles, croissant et tortue, réservations de port/champs/lac, accès à pied vérifiés et édition groupée avant création. Les accès impossibles sont signalés. La création peut désormais inclure un port N1 bâti et un village : [caldeira, port et quartiers organiques](docs/89-COMPLETE-ISLAND-START-CALDERA-PORT-VILLAGES.md). Voir [les fonctionnalités, limites et captures V5](docs/74-COMPOSED-ISLANDS-V5.md).

### Villages et villes dans le Studio

Sur la même branche, **Construire → Villages & villes** permet de prévisualiser, créer et modifier des implantations de surface de 8 à 80 maisons : rues partagées, portes indépendantes, verrous et régénération préservant les retouches. [Fonctionnalités, captures et limites de cette première version](docs/75-SETTLEMENTS-SURFACE-V1.md). Une option ajoute désormais une place, des équipements selon l’activité et un comptoir utilisable : [livraison des services](docs/76-SETTLEMENTS-SERVICES-V1.md).

### Déplacements dynamiques

Roulade sensible aux pentes et aux sols, planeur piloté au clic-glisser avec échange
altitude/vitesse. scénario technique de régression ;
`npm run test:motion` pour le parcours automatisé sur le build de validation.
[Commandes, réglages, audit et limites](docs/54-DYNAMIC-MOVEMENT.md).

**Vol rapide expérimental (branche de fonctionnalité) :** boost progressif, pointe à 122,4 km/h, caméra de vitesse et anticipation des secteurs. Voir [62 — Vol rapide et performances](docs/62-HIGH-SPEED-FLIGHT.md).

**Boost aérien à impulsions (branche expérimentale) :** 10 impulsions disponibles au départ sur 14, capacité évolutive jusqu'à 20, puissance progressive, six skins, 25 sons procéduraux et trois défis solo. **Implémenté sur `feat/flight-boost-gameplay-roadmap` ; ni mergé ni qualifié sur GPU intégré.** Voir [étude de gameplay](docs/FLIGHT-BOOST-GAMEPLAY-STUDY.md) et [suivi de réalisation FLB-0 à FLB-5](docs/FLIGHT-BOOST-IMPLEMENTATION-ROADMAP.md).

### Lancer en local

Pré-requis : **Node.js 22** et npm.

```bash
git clone https://github.com/glloq/little-world.git
cd little-world
npm ci
npm run dev
```

Ouvrir **http://localhost:5173/little-world/** (jeu) ; Studio **http://localhost:5173/little-world/studio/**.

```bash
npm test          # tests des règles de terrain, mouvement et fichiers GLB
npm run typecheck # TypeScript strict
npm run build     # génère dist/ pour GitHub Pages
npm run preview   # prévisualisation du build
```

## Périmètre final validé

Little World doit devenir un **monde vivant où il existe de nombreuses petites choses facultatives à faire** : dialogues à embranchements, petites missions, collecte et inventaire légers, énigmes et activités comme la pêche. Des actions peuvent modifier durablement certains états et plusieurs sauvegardes de partie seront possibles. **Pas d'humains, de combat ni de RPG lourd**.

Les **PNJ animaux/créatures** pourront réutiliser les variantes du personnage joueur lorsque leur morphologie le permet, avec activités simples et **navigation libre avancée**. La création du monde passera par **Little World Studio**, un ensemble d'éditeurs spécialisés partageant un projet et des données communes : relief, eau/chemins, biotopes, bâtiments, PNJ, dialogues, actions, assets et tests.

Ce périmètre complet reste **un objectif confirmé** ; les fonctions livrées sur la branche sont précisées ci-dessous. Voir [12 — Périmètre](docs/12-PROJECT-SCOPE.md) et [13 — Studio et UX](docs/13-STUDIO-UX-ARCHITECTURE.md).

## Campagne de développement

- Terrain en secteurs chargés progressivement, trois LOD et cache borné ; cartes synthétiques jusqu’à **2 × 2 km**. La carte publiée et la référence du Studio sont l'île 4 × 3 km.
- Écureuil articulé avec 14 os, 13 états animés interpolés, 9 expressions et accessoires ; GLB original exportable. Le rig est rigide, sans skinning pondéré ; le jeu utilise sa version procédurale.
- Quatre PNJ de démonstration, activités selon la distance, navigation simple et dialogues à choix/flags locaux.
- Sept biotopes et dix modèles écologiques procéduraux instanciés : flore, oiseaux, papillons et poissons contraints à l’eau.
- Atelier : sculpture, peinture de biotopes, tracés d’eau/chemins, sélection/gizmos, historique, PNJ et dialogues, sauvegarde/rechargement et test immédiat.
- Format de carte v2 validé commun au jeu/éditeur, migration v1, compilation en données statiques pour Pages.

```bash
npm run generate:island      # régénère l’île (source V3 + monde compilé)
npm run assets:squirrel # régénère le GLB original
# Avec npm run dev dans un autre terminal et Chromium installé :
npm run test:economy && npm run test:climb
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
- **Objectif LOW-RESOURCE** : 30 FPS nominal, 20 FPS en secours, sans ralentissement de la simulation ; [budget global de ressources](docs/11-LOW-RESOURCE-POLICY.md). Cadences implémentées avec simulation fixe 30 Hz, interpolation, adaptation de qualité et pause des onglets masqués ; fluidité sur PC de référence non validée.
- **Éditeur initial** : changer la graine et la densité, choisir des prefabs, cliquer sur le terrain pour placer des objets, effacer, sauvegarder dans IndexedDB, exporter/importer JSON.
- **Catalogue d'assets intégré** : trois fichiers GLB originaux (`public/models/`) plus des prefabs générés par code, inventoriés dans `assets/catalog.json`.
- Aucun backend, compte, serveur multijoueur ou API externe au runtime.

## Contrôles

| Entrée | Effet |
| --- | --- |
| `ZQSD` ou `WASD` | Déplacer le hamster |
| **Clic gauche maintenu + glisser** sur la scène | Tourner la caméra ; souris libre autrement |
| `Shift` maintenu | Rouler en boule pour aller vite (relâcher : sur ses pattes) ; nage plus rapide dans l'eau |
| `X` | Se mettre en boule / en sortir (bascule) |
| **`A` maintenu** | Menu accessoires et émotions ; clic pour équiper/choisir |
| `A` relâché | Fermer le menu (choix conservés localement) |
| `Espace` au sol | Saut |
| Relâcher puis réappuyer `Espace` en l'air | Ouvrir/replier la membrane |
| `Espace` dans l'eau | Plonger ; `Espace` à nouveau : remonter à la surface (le hamster nage à moitié immergé, la tête hors de l'eau) |
| Avancer sous l'eau | Suit la caméra : regarder vers le bas pour descendre, vers le haut pour remonter |
| `Ctrl` maintenu dans l'eau | Couler |
| `P` | Aller au port rapidement (raccourci de test) |
| `E` | Action principale indiquée en bas de l'écran (ramasser, parler, embarquer/descendre du bateau, creuser, cultiver) ; si l'action est impossible, la raison est affichée |
| `F` / `C` | Creuser ou agir sur la parcelle / changer de culture |
| `I` · `J` · `M` | Sac · Journal · Carte |
| `Z/S` ou `W/S` en bateau | Avancer / reculer |
| `Q/D` ou `A/D` en bateau | Tourner à gauche / droite |
| Qualité graphique | Menu (`Échap`) → Paramètres : Économie, Équilibré, Élevée |
| `R` | Retour au départ |
| `Échap` | Fermer le panneau ou le dialogue ouvert, sinon ouvrir le Menu (Reprendre, Parties, Paramètres, Retour à l'accueil) |

**Clavier :** le menu reconnaît la lettre **A** sur AZERTY et QWERTY (pas la position physique de la touche). Sur QWERTY, **A est réservé au menu** : utiliser **Q** ou **←** pour aller à gauche. Sur AZERTY, **Q** reste la commande gauche. Les choix d'accessoires/émotions sont enregistrés en `localStorage`.

**Hamster V1 (joueur) :** `Shift` maintenu : rouler vite en boule (relâcher pour se remettre sur ses pattes) · `X` : boule en bascule (pentes, sortie automatique) · `Espace` ×2 planer avec les membranes · outils visibles (pioche, hache, canne avec ligne et flotteur, arrosoir, semences, pelle). Voir [43 — Hamster joueur](docs/43-HAMSTER-JOUEUR.md).

**Jeu complet V1 :** `E` agir (parler, commercer, pêcher, ouvrir un coffre, cueillir) · `F` maintenu : frapper (abattre, creuser, cultiver) · avancer contre une falaise : grimper (endurance), `Espace` : se détacher. Voir [42](docs/42-JEU-COMPLET-V1.md).

## Architecture actuelle

```text
index.html                  # Jeu
studio/index.html           # Little World Studio (seul éditeur)
src/
  terrain.ts                # Relief, hydrologie, graine, limites
  world.ts                  # Terrain sectionné, végétation, prefabs, GLB
  boat.ts                   # Navigation arcade et contraintes nautiques
  player.ts                 # Simulation locale des mouvements
  squirrel.ts               # Modèle 3D original, morphologie, mimiques, accessoires
  character-style.ts        # Options et sauvegarde des apparences
  customization-menu.ts     # Interface de personnalisation (A maintenu)
  main.ts                   # Boucle de jeu, entrées, caméra, HUD
  studio/                   # Studio V3 (éditeurs spécialisés)
  gameplay/                 # Économie, cueillette, pêche, activités, sauvegardes
  style.css                 # Interface jeu et éditeur
assets/catalog.json         # Catalogue réel : GLB + modèles procéduraux
public/models/              # Fichiers GLB originaux publiés dans le site
tests/                      # Terrain, déplacements et GLB
.github/workflows/pages.yml # Tests, build Vite, publication Pages
docs/                       # Conception, objectifs et registre de décisions
```

## Limites connues

- Le personnage est une **version procédurale stylisée plus aboutie**, avec rig rigide et transitions animées ; skinning pondéré et déformation fine restent à réaliser.
- Le contrôleur de mouvement utilise actuellement des **collisions analytiques avec le terrain** : la physique Rapier et les collisions détaillées des bâtiments restent à intégrer.
- L'eau, la nage et le planage sont des **modèles arcade provisoires**, à ajuster après essais.
- Le bateau n'a pas encore de collisions physiques détaillées avec les pontons ; les limites de navigation sont évaluées à partir de la profondeur.
- Les optimisations actuelles limitent l'utilisation GPU mais ne constituent pas encore un système de streaming/LOD pour une très grande carte.
- Les éditeurs spécialisés (relief, eau, biotopes, PNJ, dialogues, événements) **restent à développer**. L’atelier actuel sculpte le relief, trace eau/chemins et édite PNJ/dialogues, mais ne constitue pas encore ces éditeurs spécialisés ni un moteur général d’événements ; les changements locaux ne publient pas automatiquement le site.
- L'instance jouable charge la carte par défaut ; **les objets placés dans l'éditeur ne remplacent pas le jeu publié** sans compiler la carte exportée dans `public/maps/default.json`, la commiter et redéployer.
- Aucun multijoueur n'est prévu pour la première version. **Évolution future seulement** : objectif expérimental de 30 puis 200 joueurs dans un même monde, 500 à étudier, via AOI et synchronisation adaptative ; **aucun serveur ni résultat de charge actuellement**. Voir [16 — Multijoueur futur](docs/16-FUTURE-MULTIPLAYER.md). L'architecture cible de **100 km² est une limite de conception, pas une performance démontrée**.

## Documentation

- [Audit de la bêta : Studio, rendu panoramique et île de 3 × 8 km](docs/30-AUDIT-BETA-ILE-3X8-STUDIO-RENDU.md)

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
- [Instructions de développement pour Codex](AGENTS.md)
- [Périmètre et limites validés (jeu + Studio)](docs/12-PROJECT-SCOPE.md)
- [UX du Studio, éditeurs spécialisés et contrats de données](docs/13-STUDIO-UX-ARCHITECTURE.md)
- [Décisions techniques validées pour tous les systèmes](docs/14-TECHNICAL-CHOICES.md)
- [Schémas V3, contrats entre éditeurs et migration des cartes](docs/15-STUDIO-DATA-SCHEMAS-V3.md)
- [Évolution future : multijoueur, AOI, foules et synchronisation adaptative](docs/16-FUTURE-MULTIPLAYER.md)
- [Vue panoramique sans brouillard : LOD, relief d'horizon et imposteurs](docs/17-DISTANT-VIEW-RENDERING.md)
- [Herbes ultra-économiques : sol, touffes instanciées, passage des personnages et budgets](docs/18-GRASS-LOW-RESOURCE.md)
- [Environnement LOW-RESOURCE : météo, neige, étoiles, lunes indépendantes, ombres et menu bêta](docs/19-ENVIRONMENT-WEATHER-SKY.md)
- [Blender ↔ Studio : GLB, création de presets, import/export de scènes et de cartes complètes](docs/20-BLENDER-STUDIO-INTERCHANGE.md)

- [PERF : ResourceBudgetManager, budgets communs, métriques, mémoire, streaming et qualité adaptative](docs/22-RESOURCE-BUDGET-MANAGER.md)
- [Audio LOW-RESOURCE : 5 à 10 instruments MIDI, synthétiseur Web Audio, échantillons et budgets](docs/23-MIDI-AUDIO-LOW-RESOURCE.md)
- [Audio V2 : catalogue contextuel, événements sémantiques, migration et production](docs/37-AUDIO-V2-CATALOGUE.md) · [inventaire généré](docs/38-AUDIO-V2-INVENTAIRE.md) · [rapport de production et préécoute](docs/39-AUDIO-PRODUCTION-RAPPORT.md)
- [UI-JOUEUR : interface de jeu (HUD contextuel, Sac, Journal, Carte, Menu, Paramètres, Parties, inspecteurs mine/parcelle)](docs/40-UI-JOUEUR.md)
- [World Production V1 : registre d'assets mesuré, 10 biotopes, 10 presets de paysages, scène de référence et île 3 × 8 km peuplée](docs/41-WORLD-PRODUCTION-V1.md)
- [Mines LOW-RESOURCE : galeries creusables 2,5D, niveaux superposés, filons et synchronisation future](docs/24-MINES-MULTILEVEL-LOW-RESOURCE.md)
- [Agriculture LOW-RESOURCE : parcelles, croissance différée, rendu LOD et gestion des cultures](docs/25-AGRICULTURE-PARCELS-LOW-RESOURCE.md)- [Eau LOW-RESOURCE : rivières en pente, lacs, cascades, plongée et océan LOD](docs/21-WATER-HYDROLOGY-LOW-RESOURCE.md)

**Licence de code :** à définir. Les premiers GLB ont été créés spécifiquement pour Little World ; aucun asset tiers n'est incorporé à ce stade.

### Génération géographique guidée

Studio → **Créer un monde** propose une composition éditable avec terrasses,
rivière descendante et régions successives. Les critères obligatoires non satisfaits
bloquent la création ; l'aperçu et le projet sauvegardé utilisent le même plan.
Voir [architecture, exemples de graines et limites](docs/62-GUIDED-WORLD-COMPOSITION.md).

La composition en [provinces, plateaux et plaines](docs/63-GEOGRAPHIC-PROVINCES-V2.md)
étend les biomes sur toute l'île. Les anciens mondes conservent leur version ;
le panneau « Recomposer le monde » permet une comparaison avant changement.

La composition V3 conserve les [îles en étages aux contours organiques](docs/64-ORGANIC-STEPPED-ISLANDS.md).
Le nouveau défaut propose [six styles d’îles V4](docs/66-ISLAND-STYLES-V4.md) : île douce,
massif central ou latéral, volcan, caldera fragmentée et plateaux locaux. Les points hauts
structurent les versants, puis le drainage et les milieux. Altitude, orientation, vues de pente
et coupes du terrain sont disponibles dans le Studio. Mesures : `npm run benchmark:styles`.

Avant création, [retoucher le brouillon 2D](docs/68-COMPOSITION-DRAFT-FIRST-IMPLEMENTATION.md)
permet de modifier côte, relief, hauteurs et eau, avec historique et reprise locale.
Le projet créé conserve exactement le plan retouché. Vérification : `npm run test:composition-draft`.

## Génération de colonies — conception et roadmap

Le générateur de colonies (maisons, villages, villes, camps, ports, terriers et grottes) est **spécifié mais non implémenté** sur la branche de documentation `docs/studio-settlements-collision-roadmap` :

- [65 — Catalogue architectural, styles, richesse, morphologies et UX Studio](docs/65-SETTLEMENTS-STUDIO-SPEC.md)
- [66 — Implantation intelligente, routes, chemins, parcelles et métiers](docs/66-SETTLEMENTS-PLACEMENT-NETWORK.md)
- [67 — Collisions 3D, accès, grottes, portes et interactions joueur](docs/67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md)
- [68 — Roadmap SET-0 à SET-12, tests et gates de qualification](docs/68-SETTLEMENTS-ROADMAP-TESTS.md)
- [69 — SET-0 : audit du code existant (état présent, lacunes, risques)](docs/69-SETTLEMENTS-SET0-AUDIT.md)
- [70 — SET-0 : contrats techniques retenus et gates bloquants](docs/70-SETTLEMENTS-TECHNICAL-CONTRACTS.md)
- [71 — Roadmap accélérée : implémentation progressive, petites PR et tests](docs/71-SETTLEMENTS-FAST-TRACK.md)
- [72 — Parcours Studio intuitif : cinq réglages, aperçu, génération et édition](docs/72-SETTLEMENTS-STUDIO-UX.md)

Ce chantier réutilise les contrats V3, le CommandBus, les chemins, la géographie et les systèmes d'interactions existants ; il n'ajoute pas de second moteur ni de simulation économique en temps réel.

Le placement propose également un centre d’activité, des rues concentriques irrégulières et des profils de densité village/ville/ville fortifiée (implantation seulement), avec retouches directes sur le plan : [organisation organique et limites](docs/77-ORGANIC-SETTLEMENT-PLACEMENT.md).

Les villages peuvent aussi suivre une rue sinueuse, un flanc de montagne, une rivière ou un rivage de pêche : [modèles adaptés au site](docs/78-CONTEXTUAL-SETTLEMENT-PATTERNS.md).


## Archipel multi-îles — roadmap, mode SOLO statique d'abord

**Pas encore livré.** La prochaine évolution proposera plusieurs îles de démonstration **pré-générées et validées**, sélectionnables depuis une carte maritime, avec chargement de chaque île à la demande et cinématique de bateau. Le build sera toujours statique et jouable depuis GitHub Pages sans serveur ni connexion multijoueur. Un seul monde 3D demeure actif à la fois.

- [73 — Vision, décisions et exclusions](docs/73-ARCHIPEL-VISION-DECISIONS.md)
- [74 — Registre et contrats des îles](docs/74-ISLAND-MANIFEST-REGISTRY.md)
- [75 — Voyages, horaires de ports, cloches et carte](docs/75-ISLAND-TRAVEL-FERRIES-PORTS.md)
- [76 — Autonomie économique et simulation différée](docs/76-ISLAND-AUTONOMY-ECONOMY-TRADE.md)
- [77 — Gouvernance et construction communautaire](docs/77-ISLAND-COMMUNITY-CONSTRUCTION.md)
- [78 — Studio et UX joueur](docs/78-ISLAND-STUDIO-PLAYER-UX.md)
- [79 — Roadmap, gates et preuve de livraison](docs/79-ISLAND-ROADMAP-VALIDATION.md)

**Important :** la construction coopérative, l'économie inter-joueurs et la persistance partagée nécessiteront plus tard un backend autoritaire ; leurs contrats sont préparés, **aucun serveur/WebSocket/compte ne doit être introduit au stade des démos GitHub Pages**. En solo, l'économie d'une île absente peut faire un rattrapage local à la reprise, pas une simulation active sans navigateur.

### Traversée inter-îles (pilote solo)

Sur la branche `feat/archipelago-real-island-travel`, deux îles d'exemple **compilées** sont prévues dans le build GitHub Pages : l'île officielle 4 × 3 km et une île forestière issue du projet de référence Studio. Le rameur permet le trajet aller-retour selon la présence de la navette. Chaque déplacement sauvegarde l'île quittée dans un slot de voyage dédié et transfère le sac, le boost et l'horloge ; la navigation complète décharge la scène précédente. Le multijoueur reste désactivé. Le statut final dépend de la validation CI et navigateur.

Les villages de rivière peuvent proposer un petit pont vers une seconde rive, des services variés et un habitant avec dialogue ; le raccord maritime reprend les modules N1 de main : [livraison et limites](docs/88-VILLAGES-RIVER-LIFE-MAIN-INTEGRATION.md).

Les nouvelles implantations proposent des jardins joueur et des champs PNJ ; les abords du port reçoivent cabanes et bateaux de rive. La caldeira peut privilégier une grande île principale : [fonctionnalités, captures et limites](docs/90-SETTLEMENT-GARDENS-COAST-DOMINANT-CALDERA.md).
