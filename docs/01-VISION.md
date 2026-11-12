# 01 — Vision et périmètre de Little World

**Statut : vision approuvée pour le jeu final ; la scène actuelle reste un prototype.**
**Références prioritaires :** [12 — Périmètre et limites](12-PROJECT-SCOPE.md), [13 — Little World Studio](13-STUDIO-UX-ARCHITECTURE.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

## Concept

Un monde 3D **solo**, paisible et vivant, dans lequel le joueur incarne un **écureuil volant** et peut découvrir **de nombreuses petites activités facultatives** : rencontres avec des PNJ, courtes missions, dialogues, pêche, collecte limitée, petites énigmes et mécanismes locaux. L'exploration et les déplacements restent le centre du jeu. **Pas de RPG lourd, de survie punitive ni de combat.**

L'application fonctionne dans le navigateur PC avec Three.js/WebGL et se publie sur **GitHub Pages sans backend obligatoire**.

## Monde et dimensions

| Critère | Choix |
| --- | --- |
| Prototype actuel | **200 × 600 m** : vallée, rivière, moulin, village et port |
| Limite du monde final | **10 × 10 km maximum (100 km²)** |
| Organisation | **Une carte continue** par partie, sans niveaux séparés |
| Génération | Déterministe avec retouches manuelles, régénération locale |
| Relief | Terrain heightfield + modules 3D pour tunnels, grottes et surplombs |
| Hydrologie | Rivières, lacs, mer, bassins et cascades ; volumes de nage/navigation simplifiés |
| Biotopes | Peignables, configurables et enrichis en flore/faune |
| Décors | Prefabs complets et construction par modules |
| Édition du monde | Réservée au créateur dans **Little World Studio** ; le joueur ne façonne pas la carte |

Le plafond de 100 km² est une **limite d'architecture/format**, pas une obligation de contenu, et **n'est pas garanti performant** avant benchmarks. Priorité à une petite carte riche et bien éditable.

## Joueur et univers

- Écureuil chibi low-poly, grand visage expressif, queue facettée, membrane cachée hors planage.
- Marche/course, saut/planage, nage/plongée, navigation en bateau.
- Caméra troisième personne orbitale **uniquement au clic-glissé de la souris**.
- Accessoires/émotions depuis **A maintenu**.
- Style low-poly organique, coloré et original ; magie naturelle principalement environnementale.
- Pas de dégâts, mort, endurance ni combat en V1.

## Vie et interactions

- **PNJ exclusivement animaux ou créatures, jamais humains**, dont des variantes du personnage joueur quand les rigs sont compatibles.
- Déplacements **libres** avec navigation avancée, mais **activités volontairement simples** : trajet, travail, repos, regard, salut, fuite, échange.
- Dialogues textuels à choix multiples, conditions simples et sons/voix stylisés.
- Événements et réactions configurables : proximité, interaction, séquences, délais, conditions ET/OU, conséquences persistantes sélectionnées.
- Petites missions facultatives, inventaire léger, quelques intérieurs simples et **plusieurs sauvegardes de partie locales**.
- Pas de simulation socio-économique complexe, de fabrication étendue ou d'IA cloud.

## Outils de création : Little World Studio

**Plusieurs éditeurs spécialisés, un projet partagé** : carte globale, terrain, eau/chemins, biotopes, bâtiments/objets, personnages/PNJ, dialogues, actions/événements, assets, tests.

- Édition directe dans des vues 3D/2D cohérentes ; inspecteurs contextuels, sélections stables.
- Modèles prêts à l'emploi (porte, mécanisme, PNJ, objet ramassable, petite mission) et logique déclarative, **sans script arbitraire**.
- Historique Undo/Redo commun, autosauvegarde locale, export/import de projet versionné.
- Carte compilée en ressources statiques ; publication après intégration dans Git et build GitHub Actions.
- Test immédiat de la carte, des PNJ et des dialogues, puis retour dans l'éditeur sans perdre les modifications.

## Objectifs LOW-RESOURCE

- **30 FPS cible**, **20 FPS secours**, pas fixe de simulation indépendant du rendu.
- Chunks, LOD, culling, instancing, ressources partagées, chargement spatial sur grandes cartes.
- PNJ/faune avec fréquence de logique adaptée à la proximité.
- Aucune dépendance serveur pour jouer, éditer ou sauvegarder localement.

## Optimisation globale : PERF

Le jeu vise une **qualité adaptative unifiée** par [ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) : CPU, GPU, RAM/VRAM estimée, streaming et LOD pour terrain, ciel, eau, végétation, bâtiments, personnages et Studio. L'optimisation préserve **la simulation à pas fixe**, les interactions et **les silhouettes du paysage jusqu'à l'horizon sans brouillard de masquage**.

Le prototype dispose déjà de **`FrameClock`, `PresentationBudget`**, caches de terrain et LOD de personnages ; leur intégration à un arbitre commun, la gestion mémoire et les budgets de chargement sont des **objectifs de développement**, pas des gains démontrés. Les **30 FPS nominaux et 20 FPS de secours** sont à qualifier sur GPU intégré matériel.

## État d'implémentation

**Prototype déjà codé :** vallée 200 × 600 m, personnage procédural, déplacement/planage/nage, bateau, roue de moulin, premier catalogue GLB et éditeur de placement local.

**Objectif, non livré :** monde jusqu'à 100 km², streaming/LOD validés, PNJ librement mobiles, dialogues, interactions déclaratives, activités, inventaire, progression/sauvegardes de partie et Studio multi-éditeurs. Les affirmations de fonctionnalité nécessitent des tests réels et un état distinct du simple document de conception.

Pour les décisions détaillées, voir [12-PROJECT-SCOPE.md](12-PROJECT-SCOPE.md).
