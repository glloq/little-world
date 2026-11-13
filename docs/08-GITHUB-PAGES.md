# 08 — GitHub Pages — hébergement statique de Little World

**Statut :** le prototype V3 précédant l’audio a été fusionné sur `main` (`f4a4433`). Les ajouts audio et le correctif de publication sont sur `feat/studio-v3`. Un succès de build seul ne certifie pas que le site public sert le bon artefact. Le workflow corrigé contrôle les trois interfaces avant publication puis sur leur URL publique.

## Incident : site public affichant uniquement du texte

Le 13 novembre 2026, deux publications ont été déclenchées par le même merge sur `main` : [le build Vite](https://github.com/glloq/little-world/actions/runs/43391489642) et [le workflow Pages automatique](https://github.com/glloq/little-world/actions/runs/43391488649). Tous deux réussissent ; le second termine après le premier et peut remplacer l’application compilée par les sources. Le HTML source contient `/src/main.ts` et importe le CSS depuis TypeScript : un serveur statique ne peut pas exécuter ces sources et laisse le texte HTML sans interface ni scène. Ce symptôme est reproduit en servant le dépôt sans Vite.

**Remise en service immédiate (administration du dépôt) :**

1. Dans [Settings → Pages](https://github.com/glloq/little-world/settings/pages), choisir **Build and deployment → Source → GitHub Actions**, et non **Deploy from a branch**.
2. Dans Actions, relancer **Build and deploy Little World** sur `main`. Ne pas relancer le workflow automatique **pages build and deployment** qui distribue les sources.
3. Attendre la fin du déploiement, puis actualiser le site avec Ctrl+F5. L’audio arrivera après fusion de la branche qui le contient.

Le correctif fait lire la configuration Pages par le workflow. Si la source est encore `legacy`, il tente de la passer à `workflow` avec le jeton Actions disposant de `pages:write`. Si GitHub refuse ce changement, il arrête la publication avec le chemin exact du réglage manuel ; aucun jeton personnel n’est nécessaire dans le navigateur. Une publication automatique déjà lancée doit finir avant la relance manuelle.

`node tools/verify-static-build.mjs` refuse un artefact contenant les HTML source, contrôle les JS/CSS compilés et les trois pages. `node tools/test-published-browser.mjs <base-url>` vérifie leurs ressources et leur type MIME, démarre le jeu avec une scène animée, crée un projet dans le Studio et ouvre la scène de l’éditeur. Ce test tourne avant publication et après déploiement, sur l’URL publique, avec captures dans les artefacts Actions. Le contrôle public compare aussi `deployment.json` au commit attendu ; trois tentatives bornées laissent le CDN se mettre à jour. Le projet de test reste dans le navigateur éphémère de la CI.

L’environnement cloud de cette réparation ne permet pas de joindre `glloq.github.io` (HTTP 403 du proxy) ni de modifier les paramètres d’administration GitHub. La preuve publique doit donc être fournie par ce contrôle post-déploiement ; les contrôles locaux sur le build de production ne sont pas présentés comme un site public déjà réparé.


## Objectif

Publier le jeu **solo** et son **éditeur** depuis `glloq/little-world` sur GitHub Pages, avec **zéro backend** en fonctionnement.

- **Adresse prévue du jeu :** https://glloq.github.io/little-world/
- **Adresse envisagée de l'éditeur :** https://glloq.github.io/little-world/editor/ (à valider pendant M0).
- **Sources :** dépôt GitHub public.
- **Contenu :** fichiers statiques HTML, JS, CSS, WASM Rapier, cartes et GLB optimisés.
- **Hébergement :** Pages uniquement, sans serveur d'app, base de données, WebSocket ni authentification.

La publication peut être automatisée après un commit sur `main` avec **GitHub Actions**. Il faut d'abord activer **Settings → Pages → Build and deployment → GitHub Actions** dans les paramètres du dépôt.

Sources officielles : [GitHub Pages — créer un site](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), [Vite — déploiement](https://vite.dev/guide/static-deploy), [Vite — base publique](https://vite.dev/guide/build).

## Build Vite : chemins indispensables

Le projet étant servi **dans un sous-répertoire**, configurer :

```ts
// vite.config.ts — exemple minimal de base de production
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/little-world/',
});
```

Ne jamais supposer que le site est à la racine `/`. Pour les chemins générés **dynamiquement** en code, utiliser la base publique injectée :

```ts
// Exemple conceptuel : ressource située dans le dossier public du build
const assetUrl = `${import.meta.env.BASE_URL}assets/nature/tree.glb`;
```

Vite traite normalement les URL d'assets importés dans le code et le CSS. Vérifier séparément les chemins des **GLB, textures, fichiers JSON, shaders et modules WASM** Rapier.

Les applications `game` et `editor` peuvent être publiées en **une seule sortie multi-pages** (un Vite build correctement configuré) ou via deux builds assemblés. **La stratégie exacte sera choisie et testée lors de M0** ; elle ne doit pas produire d'assets doublés inutilement.

Éviter le routage URL « history » profond nécessitant un fallback HTTP. Choisir des **pages HTML réelles** ou un routage hash.

## Flux de publication attendu

1. Commit du code, des assets validés et de la **carte compilée par défaut**.
2. GitHub Actions : installation de dépendances verrouillées, lint, typecheck et tests.
3. Build Vite de production avec préfixe **`/little-world/`**.
4. Validation automatique des références statiques et de la structure du build.
5. Envoi de l'artefact statique GitHub Pages, puis déploiement.
6. Ouverture du site public et **test manuel/navigateur** des déplacements, du chargement des assets et de l'éditeur.

Un workflow doit utiliser les actions officielles `actions/configure-pages`, `actions/upload-pages-artifact` et `actions/deploy-pages`, avec les permissions nécessaires au déploiement. **Workflow en place** : `.github/workflows/pages.yml`. Les déploiements et leurs résultats sont consultables dans l'onglet Actions.

### Critères de vérification de publication

- Jeu visible directement sur `https://glloq.github.io/little-world/`.
- Pas de 404 ni d'erreur CORS sur les fichiers du projet.
- Three.js affiche une scène, et Rapier WASM se charge.
- L'éditeur se charge à son URL et utilise les mêmes modèles.
- Une mise à jour de `main` génère un nouveau build identifiable.
- Aucun appel à une API serveur externe n'est nécessaire pour **jouer** ou **éditer**.

## Sauvegarde et édition sans serveur

GitHub Pages **ne peut pas recevoir les fichiers modifiés par le navigateur**.

L'éditeur conservera donc :
- **Une carte publiée**, chargée depuis le site et traitée comme base en lecture seule.
- **Des brouillons locaux** dans IndexedDB, identifiés par `worldId` et `schemaVersion`.
- **Export JSON** de la carte éditable, que l'utilisateur peut archiver.
- **Import JSON** avec validation du schéma et des IDs.
- **Mode test local** à partir d'une copie du brouillon.

Le stockage IndexedDB peut être supprimé par le navigateur ou par l'utilisateur : il ne remplace pas un fichier exporté et sauvegardé ailleurs. Ajouter des avertissements d'export avant des changements destructifs.

Pour rendre une nouvelle carte visible de tous sur l'URL Pages :
1. Exporter la carte depuis l'éditeur.
2. Valider les données et les références d'assets.
3. Ajouter les sources pertinentes au dépôt.
4. Recompiler et republier via GitHub Actions.

**Aucun jeton d'écriture GitHub dans les JS publics ; aucune publication directe anonyme depuis l'éditeur.**

## Export source de carte, GLB et publication : flux distincts

La [spécification 20](20-BLENDER-STUDIO-INTERCHANGE.md) distingue **trois livrables** :
1. **Archive projet V3 ZIP portable** : sources auteur + GLB/dépendances + biotopes/PNJ/logic et météo, pour partage/import Studio hors ligne ; **non chargée par le jeu public**.
2. **Export Blender** : GLB + sidecar JSON des transforms/IDs, pour réédition des éléments géométriques ; **pas** une restauration entière du gameplay.
3. **Build GitHub Pages** : `manifest`, `chunks`, GLB/proxies/LOD/masques et assets optimisés, chargés au besoin sous base Vite ; **aucun fichier `.blend`** ni projet auteur volumineux embarqué automatiquement.

Le Studio doit proposer ces actions sous des noms différents, valider licences/provenance et dépendances, rejeter exports corrompus, et permettre le réimport d'un projet sur une autre machine **sans backend**. L'édition Blender de la source auteur reste locale/externe ; le site statique ne démarre jamais Blender, n'exécute jamais de script importé et ne publie pas directement un projet sans étape de build Git sécurisée.

## Eau V3 dans les archives source et dans le build statique

Voir [21 — Eau, réseau et LOD](21-WATER-HYDROLOGY-LOW-RESOURCE.md). Les sources du monde conservent réseau hydrographique, niveaux, lacs, chutes, courants et volumes **dans l'archive V3 portable** ; ne pas réduire l'hydrographie à des GLB de surfaces ou du décor Blender.

À la publication statique, le compilateur produit **géométries et données logiques sectorisées** pour les secteurs d'eau, plus LOD de surface/océan et proxies de cascade/horizon. Charger seulement les ressources d'eau utiles à la caméra, **sans téléchargement initial de tous les meshes d'océan**, et conserver une apparence lointaine simplifiée.

Aucun serveur n'est requis pour la bêta solo, aucun programme externe de simulation de fluide, et **aucune réflexion multi-passes** obligatoire côté navigateur. Les bugs de chemin sous `/little-world/`, de raccords d'eau inter-secteurs et de géométrie océan dessinée sur les îles font partie du préflight de publication.

## Contrôle des performances du build statique (PERF)

Le [document 22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md) introduit un **pilotage local des budgets** : aucune logique ou télémétrie ne nécessite de serveur en jeu solo.

- Build public : versions LOD/proxies/GLB et manifestes de secteurs pour **streaming directionnel**, sans tout télécharger dès le spawn ; sources `.blend` et archives auteur exclues du runtime.
- `ResourceBudgetManager` choisit rendu adapté au GPU actuel ; **qualité enregistrée en préférences locales**, jamais dans le format carte ou ses ressources serveur.
- Préserver le déploiement sous le `BASE_URL` Vite de Pages et tester navigateur sur GPU matériel ; le temps de préparation SwiftShader n'est pas un benchmark réel.
- Éviter de charger des décodeurs/worker/ressources supplémentaires non utilisés avant preuve de gain ; tests du cache après changement de carte, imports et retours d'onglet.
- L'export JSON des mesures est **facultatif et local**, pas une remontée d'informations à GitHub.

## Chargement statique des partitions MIDI et de quelques échantillons

La [spécification AUD](23-MIDI-AUDIO-LOW-RESOURCE.md) prévoit une **palette musicale de 5–10 instruments**, un synthétiseur Web Audio natif et un petit lecteur de sons naturels, compatibles avec **GitHub Pages sans service audio**.

- Distribuer les `.mid`, manifestes de patches et samples/loops **comme assets statiques versionnés** sous le `BASE_URL` Vite correct, avec licences et hashes. **Pas** de CDN ni banque SF2 générale obligatoire.
- Charger les pistes et sons d'ambiance **en fonction des biotopes et zones réellement visités**, préchargement borné, décodage `AudioBuffer` mutualisé ; ne pas décoder tout le monde au spawn.
- Un **`AudioContext` créé/repris après le clic utilisateur** évite les restrictions autoplay ; afficher un mode silencieux et continuer jeu/Studio si le contexte est bloqué.
- Les archives auteur ZIP V3 comprennent sources MIDI/samples et références ; le build statique ne contient pas de buffers PCM pré-décodés, offsets de voix ou graphes `AudioNode`.
- Tester les codecs/fallbacks, chargement sous `/little-world/`, stop/restart, retour d'onglet et navigateurs Firefox/Chromium sans dépendance MIDI matériel.

## Mines creusables : données statiques auteur et état de partie séparés

La [spécification MINE 24](24-MINES-MULTILEVEL-LOW-RESOURCE.md) ajoute un système d'excavation localisé, **sans modifier l'hébergement statique actuel**.

- **Build GitHub Pages** : distribuer géologie **publique** et entrées/chunks de base de mine sous manifestes V3, prefabs GLB et variantes; **ne pas** publier de données **secrètes de gisements multijoueurs futurs** ni d'inventaires joueurs.
- **Bêta solo** : les mines creusées et gisements épuisés sont stockés en **sauvegarde de partie locale** (IndexedDB ou export propre), **pas** dans la source V3 publiée du monde.
- **Serveur de jeu futur** : nécessite hébergement/application distincts pour valider actions, transactions et synchroniser **deltas/snapshots de cellules** ; **GitHub Pages ne fournit ni serveur autoritaire ni mutations partagées**.
- Chargement/streaming des **seules mines/étages proches et connecteurs utiles**, assets low-poly ; aucun téléchargement d'un volume voxel 100 km².
- Préserver le `BASE_URL` Vite pour GLB de mine, manifestes et chunks. Les licences/format/IDs restent vérifiés à l'export.

## Parcelles agricoles : build statique, progression solo et serveur futur

**Contrat :** [25 — AGRI par parcelles](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md).

- Le build **GitHub Pages** distribue **`FarmPlotDefinitionV3`**, polygones/profils d'espèce/sol, visuels et manifestes par secteurs, **pas** les récoltes et états privés des joueurs.
- **Solo statique** : `FarmPlotState`, événements, temps agricole et résumé climatique nécessaires sont dans une **sauvegarde locale de partie**. Les parcelles se mettent à jour **de manière différée à la reprise**, sans service réseau et sans tick lorsque le jeu est fermé.
- **Futur multijoueur** : serveur distinct exigé pour **horloge, historique climatique, droits, stock, état persistant, actions et récoltes atomiques** ; **GitHub Pages ne peut pas synchroniser les fermes de plusieurs personnes**.
- Charger les assets/rangs de plantes proches seulement à la demande ; le lointain utilise **une couleur/masque de parcelle**, sans download de milliers de modèles par champ.
- Les fichiers/archives V3 sauvegardent les **sources auteur** ; aucune banque d'états de partie publics ou autorité agricole dans le HTML statique. Base Vite/chemins d'assets à tester.

## Limites et décisions

- GitHub Pages est adapté au **jeu solo** : la logique de mouvement et d'interaction s'exécute sur le PC du joueur.
- Pas de stockage partagé, de session serveur, de classement fiable ou de multijoueur en temps réel.
- Les performances dépendent du PC et des assets ; mesurer taille du bundle, démarrage et framerate.
- Les ressources publiées doivent être librement redistribuables ; respecter leurs licences.
- Si un backend devient utile plus tard, il sera **hébergé ailleurs** et fera l'objet d'un projet distinct.

## Liste de tâches M0

- [x] Initialiser le projet TypeScript, Three.js, Vite et tests.
- [x] Définir une stratégie unique de build du jeu et de l'éditeur (Vite multipage).
- [x] Configurer `base: '/little-world/'` et les URL des fichiers statiques.
- [x] Ajouter une scène 3D légère et un aperçu d'éditeur.
- [x] Ajouter `.github/workflows/pages.yml` pour test/build/publish.
- [x] Activer GitHub Pages depuis les paramètres du dépôt (déploiement Actions réussi).
- [ ] Vérifier site public, console, erreurs réseau et WASM.
- [x] Documenter commandes locales de démarrage, build et aperçu.

> **La CI valide le build, pas le rendu** : vérifier la page dans un navigateur avant de marquer M0 totalement qualifié.

## Évolution vers Little World Studio et une carte plus grande

L'hébergement **reste GitHub Pages** pour le jeu solo et pour les **éditeurs spécialisés**. Ceux-ci peuvent être regroupés dans une application Studio à plusieurs routes et modules chargés à la demande, à condition de conserver des URLs compatibles avec un site statique (pages physiques ou hash routing) et de **ne pas charger les outils auteurs dans le bundle du jeu**.

- **Une carte continue**, limite de format maximale **10 × 10 km** ; bundle monolithique contenant tous les meshes 100 km² interdit comme approche par défaut.
- Publier un **manifeste et des paquets de secteurs** : les données sont disponibles statiquement, téléchargées selon la position du joueur/caméra.
- Format auteur dans le Studio : manifeste global, données sectorisées, IDs stables, schémas versionnés, dépendances d'assets explicitement vérifiées.
- Brouillons auteur / export d'archive : IndexedDB et téléchargement local ; publication uniquement après validation + commit + build GitHub Actions.
- Le **jeu final dispose de plusieurs sauvegardes de partie locales**, séparées des données auteur et accessibles sans compte/backend.
- Les dialogues, missions et interactions sont des données déclaratives **compilées dans le site**, pas des scripts téléchargés à la volée.
- **Limite réelle :** un site statique peut distribuer des milliers de fichiers optimisés, mais ses performances de chargement et de cache doivent être **mesurées** ; ne pas promettre 100 km² à 30 FPS sans benchmark.

Voir [12 — Périmètre du projet](12-PROJECT-SCOPE.md) et [13 — UX Studio](13-STUDIO-UX-ARCHITECTURE.md).

**Statut : objectif d'architecture.** La branche actuelle possède un compilateur de données statiques et un terrain à chargement local, testés sur des scènes synthétiques jusqu’à 2 × 2 km. La compilation/streaming complète de 100 km² et les éditeurs spécialisés restent à développer.
