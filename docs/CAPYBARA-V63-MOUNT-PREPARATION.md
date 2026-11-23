# Capybara V6.3 — préparation d'intégration dans Little World

> **Document historique (prototype visuel).** Le rig, les animations, la simulation, les montures, les attelages et le Studio sont décrits dans [110 — Animaux](110-ANIMALS-CAPYBARA-MOUNTS.md). `capybara-pose.ts` et `capybara-world.ts` cités ci-dessous ont été remplacés par `capybara-animation.ts` et `src/animals/`.

## Contenu de la branche

- `public/models/capybara-v6.3.obj` : modèle original validé comme base visuelle, **1 maillage / 802 sommets / 1600 triangles**. Pas de texture externe.
- `src/capybara/capybara-model.ts` : chargement paresseux via `OBJLoader`, géométrie partagée entre instances, matériau individuel et animation GPU des pattes.
- `src/capybara/capybara-gait.ts` : phase de marche déterministe pilotée par distance, sans dépendance Three.js ni accès à la physique.
- `assets/animal-catalog.json` : identité stable, provenance, coût, axes, points de fixation et état de fonctionnalité.
- `tests/capybara-gait.test.mjs` : tests de phase, déterminisme, transition au repos et protection contre grands pas de temps.

Le fichier OBJ conserve le maillage V6.3 : aucune nouvelle géométrie ou « V7 » n'a été reconstruite. La démarche est une prévisualisation dérivée du test HTML, et **n'est pas encore un rig Blender**.

## Utilisation dans le moteur (opt-in)

```ts
import { createCapybaraModel } from './capybara/capybara-model.ts';

const capybara = await createCapybaraModel();
worldScene.add(capybara.group);

// Dans la boucle de présentation existante : vitesse du sol issue de la simulation.
capybara.update(dt, groundSpeed);

// Quand l'entité est retirée :
worldScene.remove(capybara.group);
capybara.dispose();
```

Chaque instance possède ses propres paramètres de marche. Le modèle est chargé une seule fois puis partagé. Le code n'ajoute **aucune boucle RAF**, aucun système de monture parallèle, aucune nouvelle île et aucun changement au joueur ou aux PNJ.

### Axes et sockets

Le modèle avance vers **+X**, avec **+Y** comme verticale. Les points de fixation sont déclarés dans le module :

- `SocketRider` : position indicative du futur cavalier ;
- `SocketHitch` : point de traction indicatif pour une charrette.

Ces sockets servent à l'assemblage de la scène ; ils ne donnent actuellement aucun droit de monter, aucune force de traction ni collision réelle. `CAPYBARA_COLLIDER` est une **proposition** de volume, pas un collider enregistré auprès du moteur physique.

### Contrat de performance

- 1600 triangles pour le corps, pas de texture, pas d'accessoire ;
- ressource OBJ de ~94 Ko en texte dans le dépôt (compression HTTP attendue à la livraison) ;
- un draw call par capybara visible ;
- déformation GPU du maillage, pas de mise à jour des sommets côté CPU à chaque frame ;
- à plusieurs dizaines d'animaux, introduire contrôle de cadence/qualité, culling et LOD ;
- l'animation est approximative : contacts du pied et genoux non anatomiques.

## Critères pour le rattachement au monde

1. Valider le rendu V6.3 et le sens +X dans la scène réelle, à l'échelle du hamster.
2. Vérifier visuellement le cycle marche/arrêt, l'absence de glissement excessif, la pente et les FPS sur GPU intégré.
3. Brancher la vitesse à l'état de locomotion animal déjà utilisé par le monde, avec mise à jour uniquement des animaux visibles/pertinents.
4. Ajouter collider et terrain snap dans la couche de physique ; ne jamais inférer les contacts depuis la déformation visuelle.
5. Exposer la famille animale à Studio **uniquement une fois** la représentation, les limites de placement, l'export et la persistance qualifiés.
6. Préparer ensuite le vrai rig (articulations des pattes, skinning) et les clips pour idle, walk, trot, transport attelé.
7. Implémenter monte/descente, vitesse et endurance, selle, chargement de charrette et droits du joueur via les systèmes de gameplay existants.

**Hors périmètre :** spawn sur une île publiée, sauvegarde de capybara, interactions de monture/traction, réseau, IK pied-sol, export GLB avec squelette.

## Validation

```sh
npm run typecheck
node --experimental-strip-types --test tests/capybara-gait.test.mjs
npm run build
```

Le test navigateur interactif et la qualification iGPU restent nécessaires avant merge / activation dans le monde.


## Équipements modulaires (optionnels)

Le module `src/capybara/capybara-accessories.ts` construit et détruit à la demande six variantes :
`none`, `saddle`, `pack`, `cart`, `wagon`, `caravan`.
La selle et les sacoches sont fixées visuellement au corps ; charrette, wagon et roulotte sont **des prototypes de décor sans articulation ni dynamique de roues**.
Changer de variante élimine les primitives de la précédente pour éviter les fuites mémoire. La ressource du corps reste mutualisée.

```ts
const animal = await createCapybaraModel('saddle');
animal.setLoadout('caravan'); // Démo : ne crée pas de véhicule jouable.
animal.setLoadout('none');
```

Le nombre de triangles/draw calls annoncé pour le corps (1600 / 1) ne comprend pas l'équipement. Les accessoires sont construits avec des primitives Three.js peu détaillées, sans textures et sans atlas : il faudra réduire leurs draw calls (fusion / partage / instancing) avant activation massive.

## Présentation comportementale

`src/capybara/capybara-pose.ts` fournit les états de présentation `idle`, `walk`, `follow`, `rest`, `sleep`, `wake`.
Les états sont pilotés par une seule boucle extérieure. L'orientation vers le joueur est définie par une position monde (Three.Vector3) et convertie en yaw/pitch local, borné à ±0,55 et ±0,24 radians.

```ts
const animal = await createCapybaraModel('none');
animal.setState('follow');
animal.setLookTarget(player.group.position); // position monde, conservée par référence
animal.update(dt, animalGroundSpeed);       // depuis la boucle existante

animal.setState('rest');   // pose couchée approximative sur le côté
animal.setState('sleep');  // yeux visuellement fermés + respiration lente
animal.setState('wake');   // transition douce vers le repos debout
```

Cette couche est **visuelle uniquement**, sans intelligence de suivi, fatigue, besoins vitaux, interaction ni capacité de montage réelle. Les courbes de pose sont progressives et la marche reste pilotée par la vitesse.
Les états couchés sont désactivés visuellement lorsque l'animal tracte `cart`, `wagon` ou `caravan`, afin d'éviter une déconnexion flagrante de l'attelage. Quand un animal bouge, la couche de pose impose la marche plutôt que le sommeil.

**Limites à corriger** : l'inclinaison sur le côté est une rotation globale du maillage (pas une véritable pose anatomique). Les jambes ne se replient pas, le contact latéral avec le sol est approximatif, les paupières sont simulées par shading et la tête pivote par déformation locale du shader plutôt que par un os. Le futur rig Blender devra remplacer ces approximations sans changer l'API comportementale.

## Tests supplémentaires

```sh
node --experimental-strip-types --test tests/capybara-pose.test.mjs
```

La qualification de la silhouette couchée, des appuis, de la selle et de la roulotte en navigateur est **non terminée**. Ajouter une galerie de validation et tester l'échelle d'un hamster assis avant d'intégrer à Studio.

## Passe accessoires V2 — attaches et orientation

Le harnais et les sangles ne traversent plus le ventre avec des blocs cubiques : bandes courbes autour du torse, selle et sacoches arrondies. Les roues sont orientées dans le plan XY, avec axe de rotation +Z, et possèdent un pivot propre. La déformation GPU des pattes reste indépendante.

**Hiérarchie** :
- `capybara.group` : mouvement/rotation du personnage et de tous ses équipements ;
- `CapybaraPoseRoot` : corps couché + selle/sacoches lorsqu'ils suivent le corps ;
- `CapybaraTowAssembly` : roulotte / charrette dans le repère du capybara, avec roues sous pivots animés par la distance `groundSpeed * dt` ;
- `SocketHitch` : repère d'attelage, conservé.

Le suivi est garanti au **niveau du graphe de scène** quand le moteur déplace `capybara.group` : les accessoires ne doivent jamais être positionnés indépendamment en coordonnées mondiales. En cas de futur système de roulotte physiquement indépendante, ce nœud deviendra le visuel piloté par l'articulation de traction.

La démo HTML autonome `little-world-capybara-accessoires-v2-mobile.html` illustre un déplacement du groupe et des roues (mode marche). L'intégration en jeu, les collisions et le virage articulé de la roulotte ne sont pas implémentés.

**Tests requis avant merge :** caméra 3/4 des six accessoires, marche/arrêt avec tournants, contact roue-sol, clips repos/relèvement, test sur iGPU. L'amélioration esthétique reste soumise à validation utilisateur.

## Étape suivante — raccord au monde (préparé, non activé)

Le fichier `src/capybara/capybara-world.ts` fournit un adaptateur opt-in pour créer et piloter un capybara à partir d'une entité gérée par la simulation existante.

```ts
import {createCapybaraWorldCollection} from './capybara/capybara-world.ts';

const animals = createCapybaraWorldCollection(world.root);
const capybara = await animals.add('capybara-test-01', {
  x: 4, y: terrainHeight(4, 8), z: 8,
  heading: 0, groundSpeed: 0,
  state: 'idle', loadout: 'caravan',
});

// À appeler depuis la boucle déjà existante (aucun RAF supplémentaire) :
animals.update(dt, snapshotsById, playerPosition);

// Lorsque la carte est déchargée :
animals.dispose();
```

L'adaptateur réutilise le repère 3D de la scène `world.root`. Les coordonnées du capybara sont toujours imposées par son état de simulation; les animations ne changent jamais les coordonnées de collision. Les modèles sont créés à la demande, mutualisent la géométrie, disposent de leur propre phase de marche, et sont détruits explicitement.

### Roulotte V4 : correction du rendu

- Volume des flancs prolongé pour fermer le vide entre murs et toiture.
- Pignons avant et arrière sous le toit cintré (aucun vide ouvert).
- Trois marches derrière la porte, avec ouverture sur l'axe `-X` (arrière de l'animal).
- Les éléments du timon et des roues suivent la transformation du capybara; les roues tournent selon la distance parcourue.
- La roulotte reste un **assemblage visuel** (aucune physique de remorque ni articulation de pivot arrière).

### Ordre de raccordement proposé

1. Démo locale opt-in, un seul capybara avec les six configurations et états visuels; aucune modification des îles publiées.
2. Câbler son placement à une entité du monde et au terrain, puis mesurer orientation `+X`, hauteur du sol, collisions proposées, virages et pentes.
3. Faire qualifier le matériel attelé: largeur des chemins, rayon de braquage, longueur d'attelage, obstacles et impossibilité de se coucher lorsqu'une remorque est accrochée.
4. Faire un véritable assemblage de véhicule sur pivot d'attelage et roues en contact avec le terrain, avant d'autoriser déplacements joueurs/PNJ et persistance.
5. Ajouter une représentation d'entité animale persistante dans Studio et les îles seulement après validation des versions enregistrées et de la compatibilité des cartes existantes.

**Ne pas ajouter** le modèle OBJ dans `assets/world-assets.json` : le registre World Production représente actuellement des GLB statiques et le pipeline le régénère. Le capybara est un animal dynamique chargé via un contrôleur dédié.

### Critères de qualification avant activation

- Test de chargement et destruction répétés sans fuite de ressources.
- Validation visuelle en WebGL sur chaque côté, à l'arrêt et en mouvement.
- Vérification du mouvement de la roulotte dans les virages et de l'escalier près du sol.
- Contrôle qualité des faux appuis / mouvement de tête / sommeil.
- `npm test`, `npm run typecheck`, `npm run build` et CI de la branche au vert.

