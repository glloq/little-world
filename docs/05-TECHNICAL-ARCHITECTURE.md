# 05 — Architecture technique

Statut : **choix technologiques recommandés, non encore implémentés**.

## Stack cible

| Domaine | Choix | Commentaire |
| --- | --- | --- |
| Langage | **TypeScript** | Types partagés client / serveur / éditeur |
| Frontend rendu | **Three.js** | WebGL, modèles glTF/GLB |
| Build & dev | **Vite** | Clients jeu et éditeur séparés |
| Physique | **Rapier JS** | Collisions, détection de contacts |
| Réseau | **Colyseus / WebSocket** | Rooms et état autoritaire |
| Backend | **Node.js** | Une instance de serveur en premier |
| Stockage | **PostgreSQL**, plus tard | États persistants ; initialement stockage simple reproductible |
| Assets | **GLB** | Catalogue et validation à l'import |
| Outils | pnpm workspaces | Monorepo partagé et scripts reproductibles |

Choix provisoires sujets à un **spike d'intégration** : Rapier avec personnage quadrupède et planage, fréquence réseau, stratégie de prédiction, persistance, outils de build d'assets.

## Monorepo envisagé

```text
little-world/
├── apps/
│   ├── game/              # Client navigateur / joueur
│   ├── editor/            # Éditeur de monde (web)
│   └── server/            # Serveur autoritaire Colyseus
├── packages/
│   ├── core/              # Horloge, événements, identifiants
│   ├── movement/          # États, inputs, simulateur
│   ├── world/             # Générateur, carte source, compilateur
│   ├── rendering/         # Three.js, caméra, visuels
│   ├── interactions/      # Modèle déclaratif partagé
│   ├── asset-registry/    # Contrats et validation d'assets
│   └── shared/            # Protocoles, schémas et types
├── assets/                # Catalogue documenté d'assets
├── docs/
└── tools/                 # Tests, import et compilation
```

Les modules **simulation**, **world** (données) et **interactions** doivent rester indépendants des types Three.js quand ce n'est pas indispensable ; les objets 3D appartiennent au rendu.

## Séparation des responsabilités

| Couche | Responsabilité | Ne doit pas décider |
| --- | --- | --- |
| Entrées | Clavier/souris → commandes datées | Collisions |
| Simulation | États, vitesse, contacts, transitions | Maillages et UI |
| Rendu | Meshes, interpolations, animations, caméra | État autoritaire |
| Monde | Terrain, eau, placement, version de carte | Identité des joueurs |
| Interactions | Événements, conditions, actions validées | Scripts arbitraires externes |
| Réseau | Ordonnancement, snapshots/deltas, sessions | Art direction |
| Éditeur | Outils d'édition, historique, compilation | Logique alternative de gameplay |

## Boucle de simulation

- **Pas fixe** pour la physique et la logique (fréquence exacte à mesurer).
- Un input comprend au minimum : `sequence`, `clientTick`, mouvement, course, saut, planage, commandes de nage.
- **Serveur autoritaire** : chaque action est validée sur sa simulation et la version publiée de la carte.
- **Prédiction locale** possible pour la fluidité ; réconciliation basée sur séquences, pas sur simple téléportation périodique.
- Interpolation des joueurs distants.
- Ne jamais faire dépendre la simulation de `requestAnimationFrame`, de la fréquence de rendu ou d'une animation GLB.

### Déplacements / Rapier

Éviter de compter sur un contrôleur de personnage Rapier comme solution complète : il faut implémenter explicitement les règles de nage et de planage. Pour la reproductibilité réseau, documenter précision numérique, ordre de traitement et tolérances de correction.

## Synchronisation de la carte et des actions

1. Le **bundle de carte publié** est identifié par `worldId` + `publicationVersion` + hachage.
2. Tous les clients d'une room chargent cette même version.
3. La géométrie statique **n'est pas retransmise à chaque joueur** par le protocole temps réel.
4. Le serveur synchronise positions/modes des personnages et **états** d'interactions partagées.
5. La roue du moulin tourne côté client à partir de son état et de son paramètre d'animation, pas d'un angle envoyé à chaque frame.
6. La visibilité réseau peut filtrer les entités lointaines si le profilage montre le besoin ; ne pas surdimensionner prématurément.

## Performance cible — hypothèses à tester

**PC navigateur seulement** au premier jalon. La carte est petite mais les scènes riches en végétation et les vues de planage peuvent coûter cher. Cibles de départ : rendu fluide sur PC moyen et test d'au moins 2 joueurs ; **10 à 30 joueurs restent un objectif**, pas une capacité démontrée.

Suivre FPS, durée des frames, draw calls, triangles, textures/mémoire, coût de la physique, utilisation CPU serveur, bande passante et latence perçue. Rapporter performances sur machines et scénarios reproductibles.

## Validation / CI

- Lint, format et TypeScript strict.
- Tests unitaires des transitions de mouvement et des règles d'interactions.
- Tests de schéma des données de cartes/assets, migrations et refus de contenu invalide.
- Tests du générateur : reproductibilité pour graine/version données.
- Tests d'intégration client/serveur : 2 joueurs, transitions eau-air, déclenchement simultané.
- Test navigateur de parcours minimal incluant caméra et entrée clavier.
- Benchmarks à 2, 10 et 30 joueurs avec profils réalistes et métriques conservées.

Un test réussi ne signifie pas automatiquement **déployé** : distinguer implémentation, test local, validation en CI et version effectivement publiée.

## Sécurité et exploitation

- Ne jamais faire confiance aux positions finales envoyées directement par un client.
- Vérifier portée, état, permissions et fréquence des interactions côté serveur.
- Versionner les protocoles entre clients et serveur.
- Garder les sauvegardes persistantes indépendantes des artefacts compilés de carte.
- Isoler les commandes d'éditeur des routes publiques de jeu ; publication réservée aux auteurs.

## Ordre d'intégration

Créer en premier les contrats `InputCommand`, `MovementState`, `WaterVolume`, `WorldManifest`, `AssetManifest`, `InteractionDefinition`. Ensuite seulement développer les adaptateurs Three.js, Rapier et Colyseus. L'objectif est d'éviter les classes globales monolithiques et les règles implicites.
