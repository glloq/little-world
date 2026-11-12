# 05 — Architecture technique — solo et GitHub Pages

**Statut : architecture cible avec un premier prototype codé.** `src/terrain.ts`, `src/world.ts`, `src/player.ts`, `src/main.ts` et `src/editor.ts` sont en place ; Rapier reste différé.

## Principe cardinal

**Toute la V1 s'exécute dans le navigateur.** GitHub Pages sert le HTML, JavaScript, WASM, fichiers GLB, textures et cartes compilées. **Aucun serveur applicatif, API de jeu, WebSocket, comptes, PostgreSQL ou Colyseus.**

Le multijoueur pourra être étudié après la V1, mais **ne doit pas complexifier l'architecture courante** : garder simplement simulation et rendu séparés.

## Stack cible

| Partie | Technologie |
| --- | --- |
| Code commun | **TypeScript** strict |
| Rendu 3D | **Three.js** / WebGL |
| Physique | **Rapier JS/WASM** (prévu, pas encore installé dans le prototype) |
| Build / dev | **Vite** |
| Dépendances et workspace | **pnpm** |
| Test du code | Tests unitaires TS et tests navigateur |
| Publication | **GitHub Actions → GitHub Pages** |
| Sauvegarde d'éditeur | **IndexedDB** + import/export JSON |
| Assets | **GLB** + manifeste local versionné |

Pas de service Node.js au runtime : Node n'est utilisé **qu'au développement et dans le build CI**.

## Structure visée

```text
little-world/
├── apps/
│   ├── game/              # Jeu solo statique Three.js
│   └── editor/            # Éditeur statique, même moteur
├── packages/
│   ├── core/              # Horloge, IDs, événements et contrats
│   ├── movement/          # Simulateur local et états de déplacement
│   ├── world/             # Générateur, carte source, compilation
│   ├── rendering/         # Three.js, caméra, animation
│   ├── interactions/      # États et actions locaux déclaratifs
│   ├── asset-registry/    # Catalogue, provenance, validation
│   └── shared/            # Types et schémas
├── assets/                # Assets redistribuables dans le repo
├── docs/
├── tools/                 # Conversion/import/tests
└── .github/workflows/     # Build/test/deploy Pages
```

Ne créer **aucun** `apps/server` dans la V1. Des packages ne doivent être créés que si la séparation sert réellement la maintenabilité ; éviter des abstractions inutiles.

## Découpage de l'exécution

| Couche | Rôle |
| --- | --- |
| `InputMapper` | Souris/clavier → commandes |
| `MovementSimulator` | Machine à états, accélérations, planage, eau |
| `PhysicsAdapter` | Collisions et volumes Rapier |
| `WorldLoader` | Charger manifeste/terrain/objets statiques locaux |
| `InteractionRuntime` | Événements et états locaux d'objets |
| `CharacterView` | Modèle GLB, animations, interpolation graphique |
| `CameraController` | Caméra troisième personne indépendante |
| `EditorState` | Modifications, undo/redo, sérialisation (éditeur seulement) |

**Le rendu ne décide pas de l'état physique.** Simulation à pas fixe, rendu à fréquence variable ; mesures de performance et trajectoires reproductibles.

### Politique de cadence et de ressources

La référence globale est [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md) : **30 Hz d'affichage nominal (33,3 ms/image), 20 Hz en secours (50 ms/image)**. Proposition pour la simulation locale : **pas fixe 30 Hz** et interpolation visuelle, indépendamment du FPS. Le joueur, le bateau et les interactions doivent conserver leur vitesse et leurs commandes en mode 20 FPS ; PNJ et faune peuvent employer des fréquences plus basses. Éviter l'exécution de plusieurs moteurs de simulation ou de rendu par entité.

**Écart d'implémentation identifié :** au 12 novembre 2026, `src/main.ts` conserve un pas de simulation `1/60` et rend à chaque `requestAnimationFrame`. Les objectifs 30/20 ne sont **pas encore implémentés**. Les modifier exige des tests de locomotion, planage, eau et bateau.

Le joueur ne charge pas les outils de compilation/édition ; mettre la génération lourde, la validation et l'optimisation des cartes hors de la boucle de rendu.

## Gestion des données

### Jeu

Charge une **carte de démonstration versionnée** livrée avec le site ; aucune requête vers un backend. Les états temporaires (roue du moulin, leviers, position) peuvent rester en mémoire et sont réinitialisés au chargement pour la V1. La persistance de progression joueur n'est **pas nécessaire**.

### Éditeur

- Format source JSON validé par schéma.
- Stockage de travail IndexedDB (stockage local non garanti à vie).
- Export/import JSON manuel comme sauvegarde portable.
- Carte publiée dans le site seulement après **validation, commit et nouveau build**.

### Assets

Registre local stable, chemins de fichiers construits **relativement à la base publique du build**, sans dépendance CDN. Aucun chargement d'asset via URL externe non validée par défaut.

## Spécificités GitHub Pages

Site de projet prévu : `https://glloq.github.io/little-world/`.

Pour Vite, choisir **`base: '/little-world/'`** en production. Ne pas écrire de chemins absolus `/assets/...` qui chercheraient les fichiers à la racine de `github.io`. Utiliser `import.meta.env.BASE_URL` quand il faut fabriquer une URL publique dynamiquement.

Jeu et éditeur peuvent être deux points d'entrée statiques ou utiliser un routage **hash** ; éviter les URLs SPA profondes qui provoquent un 404 au rechargement sans configuration de fallback.

CI : lint/typecheck/tests → build → vérification des chemins/artefacts → déploiement GitHub Pages. Le workflow **sera implémenté à M0** ; GitHub Pages doit être activé dans les paramètres du repo.

Détails : [08-GITHUB-PAGES.md](08-GITHUB-PAGES.md).

## Tests V1

1. Build statique **sans serveur au runtime**.
2. Chargement correct depuis le préfixe **`/little-world/`** et non seulement depuis `localhost:/`.
3. Rapier WASM et textures/GLB accessibles avec les bons chemins.
4. Marche/course/saut/planage/nage/plongée testés à différents FPS.
5. Générateur déterministe et formats de cartes validés.
6. Sauvegarde/export/import/rechargement d'éditeur sans perte.
7. Test navigateur automatisé avec capture des erreurs réseau/console.
8. Budgets LOW-RESOURCE (30/20 FPS, temps CPU/GPU, draw calls, triangles, téléchargements, mémoire) mesurés sur un PC de test de référence.
9. Un artefact de build publié est **visuellement vérifié** sur GitHub Pages.
10. Une baisse d'affichage à 20 FPS ne ralentit pas le monde ; aucune perte d'input, aucun rattrapage CPU incontrôlé après changement d'onglet.

## Travaux explicitement différés

Colyseus, serveur autoritaire, prédiction/réconciliation réseau, rooms, chat, authentification, base de données, position des autres joueurs, sauvegarde partagée et tests de charge 10–30 joueurs.

Une future évolution réseau demanderait un nouveau jalon et une conception spécifique ; **ne pas ajouter d'infrastructure prématurée**.
