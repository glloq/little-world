# 110 — Animaux : capybara, montures, attelages et Studio

> **Statut global : IMPLEMENTED et TESTED sur branche (tests Node + navigateur SwiftShader). NON publié sur les îles officielles, performance iGPU NOT_VERIFIED.**
> Activation **opt-in** : un projet sans `libraries.animals` se compile et se joue exactement comme avant ; la démonstration s’ouvre avec `?animalDemo=1`.
> Ce document remplace l’ordre de raccordement de [CAPYBARA-V63-MOUNT-PREPARATION](CAPYBARA-V63-MOUNT-PREPARATION.md) (prototype visuel), conservé pour l’historique.

## 0. Audit du dépôt avant le chantier (23/11/2026)

La branche `feat/capybara-mount-animation-prep` était déjà fusionnée dans `main` (PR #116). Elle ne contenait que des **prototypes visuels** : aucun module hors de `src/capybara/` ne les importait.

| Domaine | Existant constaté | Réutilisé | Manquant → livré ici | Priorité |
|---|---|---|---|---|
| Modèle 3D | OBJ V6.3 (802 sommets / 1600 triangles), silhouette approuvée | Maillage inchangé | Soudure aux 802 sommets, limites fixes | P0 |
| Rigging | Aucun os : déformation des pattes par *vertex shader*, couché = rotation globale | Convention du hamster (rig procédural, GLB généré pour Blender) | 19 os déformants + 7 sockets, skinning pondéré 4 influences | P0 |
| Animations | `gait` (phase par distance) + `pose` (6 états visuels) | `capybara-gait.ts` | `CapybaraAnimator` : allures, postures, 17 comportements, transport, événements | P0 |
| Physique | `CAPYBARA_COLLIDER` = simple proposition | `WorldCollisionQuery.move/intersectsVolume`, colliders mobiles (`fleet.ts`) | Cinématique à pas fixe, rayon de braquage, pentes, eau, obstacles | P0 |
| Navigation | PNJ : ligne droite + `canNPCWalk`; routes de résidents | Paliers `npcActivity` (full/reduced/dormant) | `steerToward`, trajets aller-retour, validation statique des trajets | P1 |
| IA animale | Écologie décorative seulement (oiseaux, poissons instanciés) | Classification du Geography Engine pour l’habitat | Besoins, modes, fuite, harde, simulation abstraite lointaine | P1 |
| Studio | Aucun animal ; modèle « mini-jeux = éléments de la sélection universelle » | `elements.ts`, `CommandBus`, inspecteur, overlay du viewport, `editPath` | Module « Animaux », inspecteur contextuel, aperçu runtime | P0 |
| Montures | Bateau : embarquement par E, `aboard` local à `main.ts`, pose `BOAT` du hamster | Contrat `TargetDescriptor`, pose assise `setAboard`, interpolation | Monte/descente, conduite relative caméra, point de descente sûr | P0 |
| Attelages | Roulotte V4 collée à la rotation de l’animal (dizaines de meshes) | Géométries et palette des accessoires | Véhicule séparé, articulation (tractrice), roues, blocages, fusion en 3 draw calls | P0 |
| PNJ | `NPCState` mutable, comportement `idle` immobile | `npcs.states` | Conducteur épinglé au siège, à pied pendant les pauses | P1 |
| Persistance | `GameSaveV2` à sections optionnelles ; bateaux **non** sauvegardés | Motif `surfBoard` (get/set) | `animals?: AnimalsSaveV1` strict + réparation des appariements | P0 |
| Performances | `PresentationBudget.resources.fullCharacters` (non consommé jusqu’ici) | Budget partagé | LOD 0/1/2, budget de rigs, paliers de simulation, bancs 1/5/10/30 | P1 |

**Risques relevés** : (1) `main.ts` fait 2 300 lignes → toute la logique vit dans `src/animals/`, `main.ts` ne fait que transmettre ; (2) convention de cap différente (modèle +X, jeu `atan2(vx,vz)`) → conversion unique dans la vue ; (3) la CI régénère les îles octet par octet → aucune île officielle n’est modifiée ; (4) schéma V3 strict (« champ inconnu ») → section de bibliothèque facultative, pas de nouveau composant d’entité.

## 1. Architecture (une seule simulation, une seule navigation, un seul registre d’événements)

```
src/capybara/            représentation de l’espèce (aucune règle de jeu)
  capybara-rig.ts        os, pivots, sockets, poids de skinning (pur, sans Three)
  capybara-animation.ts  CapybaraAnimator + CAPYBARA_BEHAVIORS (tables de données)
  capybara-gait.ts       phase de marche par distance (conservé, foulée paramétrable)
  capybara-model.ts      SkinnedMesh partagé, sockets, LOD d’animation
  capybara-accessories.ts équipements portés et véhicules fusionnés
src/animals/             système générique (extensible à d’autres espèces)
  species.ts             AnimalSpeciesDefinition : vitesses, gabarit, habitats, véhicules
  schema.ts              AnimalInstanceV1 / AnimalHerdV1 (libraries.animals), validation stricte
  locomotion.ts          stepAnimal, attelage (followHitch), steerToward, validateAnimalRoute
  simulation.ts          états, besoins, IA sauvage, monte, attelage, propriété, trajets, paliers
  cargo.ts · save.ts     transferts atomiques · AnimalsSaveV1
  view.ts                visuels paresseux, LOD, appuis sur le relief (lecture seule)
  host.ts                pont unique avec le jeu (collisions, PNJ, sac, interactions)
  cargo-panel.ts · demo.ts
src/studio-core/animal-authoring.ts   écriture, presets, adaptateur de sélection, diagnostics
src/studio/animals-panel.ts · animal-inspector.ts · animals-preview.ts
```

Correspondance avec les composants conceptuels demandés : `AnimalDefinition` → `species.ts` ; `AnimalEntity`/`AnimalBehavior`/`AnimalMount`/`AnimalDraft` → `AnimalState`/`VehicleState` dans `simulation.ts` ; `AnimalLocomotion` → `locomotion.ts` ; `AnimalVisual` → `view.ts` + `capybara-model.ts` ; `AnimalEquipment` → `loadout` + `capybara-accessories.ts` ; `AnimalPersistence` → `save.ts`.

**Règles tenues** : aucune boucle RAF ajoutée (`host.tick` dans le pas fixe 30 Hz, `host.present` dans `draw`) ; `simulatePlayer` inchangé (la monture porte le joueur comme le bateau) ; aucun moteur physique ; événements via `gameplay/events.ts` (`animal.mounted`, `animal.acquired`, `animal.hitched`) ; modules chargés à la demande (`import()`), jamais sans animaux.

**Ajouter une espèce** : une entrée de `ANIMAL_SPECIES`, un rig + animateur exposant la même interface que `CapybaraModel`, un branchement dans `view.ts`. Le schéma, la simulation, le Studio et les sauvegardes ne changent pas.

## 2. Rig et animations

- **Choix** : armature à skinning pondéré calculé depuis les positions de repos (`computeCapybaraSkin`), plutôt qu’un GLB peint à la main : une seule définition pour le navigateur, les tests Node et l’export. Liaison douce patte↔corps (masque latéral) pour que le ventre ne suive pas les membres — vérifié par test.
- **Pipeline Blender** : `npm run assets:capybara` écrit `public/models/capybara.glb` (maillage, 26 os, 29 clips échantillonnés depuis l’animateur du jeu, noms stables, +X avant, mètres). Vérifié en CI (`git diff --exit-code`) et par test (dimensions, axes, sockets, clips). Le jeu ne charge pas ce GLB (même convention que le hamster, doc 43). **Réimport de clips Blender : non livré.**
- **Allures** : `idle, walk, fast_walk, trot, walk_backward, turn_left/right, start_walk, stop_walk` — procédurales, phase = distance parcourue / foulée, pas latéral au pas, diagonal au trot.
- **Comportements** (`CAPYBARA_BEHAVIORS`) : `look_around, eat, drink, graze, sniff, sit, lie_down, rest, sleep, wake_up, stand_up, shake, react, happy, afraid, wait_loading`, avec posture (`stand/sit/lie`), priorité, enchaînement (`next`) et événements (`step, bite, sip…`).
- **Transport** : entrées `load` (tête basse, foulée courte, appui dans le collier) et `rider`. Tête indépendante (`lookYaw/lookPitch` bornés, ignorés pendant le sommeil).
- **LOD d’animation** : 0 = chaque frame ; 1 = une frame sur trois avec le temps accumulé ; 2 = pose gelée. Aucune IK : le corps est posé sur le relief par quatre échantillons de sol (LOD < 2).

## 3. Déplacement, attelage, états

- `stepAnimal` : accélération/freinage, lacet limité par `teamTurnRadius`, sonde avant (eau > `maxWade`, bord du monde, pente > `teamMaxSlope`), balayage `collision.move`. Un animal libre pivote sur place ; un attelage non.
- **Attelage** : le véhicule est une entité distincte (`VehicleState`), tirée par son timon (tractrice). Angle d’articulation borné (`maxArticulation`) → pas de mise en portefeuille ; marche arrière autorisée pour la charrette seulement ; une roue bloquée arrête tout l’attelage. La charge réduit vitesse, accélération et pente franchissable.
- **Incompatibilités** (schéma + simulation) : sauvage ⇒ ni propriétaire ni équipement ; véhicule ⇒ rôle transport ; attelé ⇒ ne dort pas ; sacoches ⇒ pas de cavalier ; un seul véhicule par animal ; dételer à l’arrêt ; cavalier disparu ⇒ `abandon()` (l’animal attend sur place).
- **Monture** : E « Monter » / « Descendre » ; Z/S/Q/D relatifs à la caméra, Maj = trot, G = atteler/dételer, H = appeler/faire attendre. Descente uniquement sur un point libre, sec et proche en altitude, sinon refus expliqué. Saut, roulade, activités F/C sont suspendus en selle ; téléportation/respawn/navette ⇒ `abandon()`.
- **Cargaison** : sacoches (12 unités) ou véhicule (30/60/40) ; `transferCargo` vérifie sac et contenant avant d’écrire (pas de duplication). Dételer laisse le chargement dans le véhicule stationné.
- **Propriété** : `ownerId`, `access` (`owner/anyone/nobody`), `acquisition` (`granted/purchase/quest/loan`). Achat atomique via le `Purse` existant. **Multijoueur : contrats seulement, aucune autorité réseau.**

## 4. Animaux sauvages et PNJ

- **Hardes** (`AnimalHerdV1`) : individus déterministes (`seed + id`), identifiants stables (`animal:harde-1#0`) ⇒ aucun doublon au rechargement ; capacité bornée par la part d’habitat praticable (`species.habitats` × biome du Geography Engine, hors sol occupé).
- **Comportement** : besoins (faim, soif, fatigue) en heures de jeu ; modes `graze, drink, rest, sleep, wander, flee, alert, idle` ; fuite devant un joueur proche ou rapide puis retour au calme ; cohésion de harde ; retour vers la zone.
- **Paliers** (réutilisent `npcActivity`) : < 65 m pas fixe complet ; < 160 m décision toutes les 0,5 s ; au-delà évolution abstraite toutes les 6 s (besoins + progression au pas, sans navigation ni collision).
- **PNJ** : `riderId` + `path` ⇒ l’attelage fait des allers-retours avec pause aux extrémités ; le PNJ est épinglé au siège en route et placé à côté pendant la pause. Trajet lointain = progression à vitesse de marche (jamais de téléportation, testé).
  **Limites** : le PNJ garde sa pose debout sur le dos (pas de pose assise PNJ) ; les routines de résidents (`ResidentRoutineV1`) ne déclenchent pas encore de trajet attelé — le trajet est porté par l’animal.

## 5. Studio

Module **Animaux** (groupe Construire) : presets (harde, sauvage, domestique, monture, sacoches, charrette, chariot, roulotte) créés au centre de la vue ; liste ; aperçu d’animations joué par **le modèle, le rig et l’animateur du jeu** (marche, trot, repos, sommeil, réveil, suivi de tête, monture, attelage).
Les animaux sont des **éléments de la sélection universelle** (`kind: 'animal'`) : clic 2D/3D, gizmo, duplication, suppression, liste d’auteur, Undo/Redo — une transaction par action.
Inspecteur **contextuel** : identité ; habitat (sauvage) ; équipement et gabarit d’attelage ; propriété/accès/obtention ; trajet + conducteur PNJ avec diagnostics cliquables (pente, eau, largeur, virage, demi-tour) ; chargement initial ; persistance ; roulotte habitable (réservé au schéma, intérieur non livré).
Données : `libraries.animals` (facultatif, ≤ 96 entrées), références `ownerId/riderId` suivies par `ReferenceIndex` (suppression d’un PNJ ⇒ avertissement). Aucune migration nécessaire : section absente = projet inchangé.

## 6. Mesures (SwiftShader, serveur de développement — références de régression uniquement)

CPU pur (`node --experimental-strip-types tools/bench-animals.mjs`, ms par pas de 30 Hz pour **tous** les animaux) :

| Animaux | proches | moyens | lointains | animateur |
|---:|---:|---:|---:|---:|
| 1 | 0,002 | 0,001 | 0,001 | 0,009 |
| 10 | 0,005 | 0,005 | 0,001 | 0,040 |
| 30 | 0,008 | 0,003 | 0,003 | 0,104 |
| 60 | 0,017 | 0,007 | 0,003 | 0,161 |

En jeu (`node tools/bench-animals-browser.mjs`, île du Volcan, 1280×720) :

| Animaux actifs | Rigs complets | Véhicules | Draw calls | Triangles | FPS (rAF) | Simulation ms/pas | Vue ms/frame |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | 0 | 0 | 140 | 75 468 | 7,3 | 0 | 0 |
| 1 | 1 | 0 | 142 | 77 596 | 7,3 | 0,017 | 0,13 |
| 5 | 2 | 1 | 145 | 81 324 | 7,0 | 0,108 | 0,30 |
| 10 | 2 | 2 | 148 | 85 052 | 6,5 | 0,146 | 0,42 |
| 23 (30 demandés, 7 en eau écartés) | 2 | 6 | 168 | 99 528 | 6,0 | 0,424 | 0,62 |

Lecture : coût CPU de l’ordre de 1 ms pour ~25 animaux actifs ; le tas JS ne montre pas de tendance (61–85 Mo, bruit du ramasse-miettes). Le FPS absolu est celui d’un rasteriseur logiciel. **Temps GPU, mémoire GPU et 30/20 FPS sur GPU intégré : NOT_VERIFIED.**

## 7. Roadmap et statuts

| Phase | Contenu | Statut | Preuve |
|---|---|---|---|
| 0 | Audit, roadmap | DONE | ce document |
| 1 | Architecture générique | IMPLEMENTED, TESTED | `tests/animals-core.test.mjs` |
| 2 | Rig, sockets, GLB | IMPLEMENTED, TESTED | `tests/capybara-rig.test.mjs`, CI `assets:capybara` |
| 3 | Animations | IMPLEMENTED, TESTED (pas de qualification artistique) | idem + `examples/capybara-rig-lab.html` |
| 4 | Déplacement, collisions | IMPLEMENTED, TESTED | plat, pente, virage, obstacle, pont étroit, attelage |
| 5 | Animaux sauvages | IMPLEMENTED, TESTED | hardes, fuite, nuit, soif, paliers |
| 6 | Monture joueur | IMPLEMENTED, TESTED (Node + navigateur) | `tools/test-animals-browser.mjs` |
| 7 | Charrette, chariot, roulotte | IMPLEMENTED, TESTED | articulation, roues, blocage, dételage |
| 8 | PNJ | PARTIAL | trajets et pauses testés ; pas de pose assise ni de lien aux routines |
| 9 | Studio | IMPLEMENTED, TESTED (Node + navigateur) | `tests/animals-studio.test.mjs`, `tools/test-animals-studio-browser.mjs` |
| 10 | Économie, propriété | IMPLEMENTED, TESTED | achat, prêt, quête, accès, cargaison |
| 11 | États, cycle de vie | IMPLEMENTED, TESTED | incompatibilités, sauvegarde réparée |
| 12 | Optimisation | IMPLEMENTED, mesuré SwiftShader | §6 ; iGPU NOT_VERIFIED |
| 13 | Tests | DONE pour le périmètre ci-dessus | voir §8 |
| 14 | Démonstration | IMPLEMENTED, TESTED | `?animalDemo=1` |

**Reste à faire (ordre conseillé)** : pose assise des PNJ cavaliers et trajets déclenchés par `ResidentRoutineV1` (docs 96–103) ; quêtes liées (`animal.*` déjà déclarés) ; intérieur/habitation de la roulotte ; clips retouchés dans Blender réimportés ; imposteur lointain dédié ; sons de pas/bouchée branchés sur les événements d’animation ; passage de l’animal avec le joueur en navette inter-îles ; placement sur une île officielle **après** qualification iGPU.

## 8. Validation

```sh
npm run typecheck
node --experimental-strip-types --test tests/capybara-*.test.mjs tests/animals-*.test.mjs
npm run assets:capybara && git diff --exit-code -- public/models/capybara.glb
npm run build && npm run preview -- --host 127.0.0.1 --port 5173 --strictPort &
npm run test:animals            # démonstration en jeu + Studio jusqu’à « Jouer ici »
node --experimental-strip-types tools/bench-animals.mjs
node tools/bench-animals-browser.mjs
```

Démonstration manuelle : `…/little-world/?world=maps/island/manifest.json&animalDemo=1` — harde sauvage, Praline au repos, Caramel (monture), Biscotte (sacoches), Noisette (chariot à dételer/atteler), Châtaigne (à acheter, 25 pièces), un charretier et une voyageuse en roulotte sur leurs trajets.
