# 08 — GitHub Pages — hébergement statique de Little World

**Statut :** le workflow Pages de main est conservé et utilise désormais `npm ci`. Un workflow de validation des branches/PR compile la carte, exécute les tests et le build puis le parcours navigateur sur les fichiers statiques. La campagne actuelle est livrée sur une branche ; son déploiement public n’est pas effectué. Les succès de déploiement historiques mentionnés ci-dessous ne valident pas cette nouvelle révision.


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
