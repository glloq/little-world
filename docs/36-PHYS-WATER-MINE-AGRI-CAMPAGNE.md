# 36 — Campagne PHYS / WATER / MINE / AGRI : état, contrats et avancement

**Base : `main` = `3be8325` (PR #9 E7–E10 fusionnée).**
**Branche de travail : `claude/bold-tesla-b0pe7k`, recalée en avance rapide sur `main`.**

**Contraintes**
- Application statique GitHub Pages : aucun serveur, compte, base distante ni CDN.
- Sauvegardes locales uniquement (`localStorage` / IndexedDB).
- Aucun asset GLB, LOD, matériau source ou registre modifié : les mines, cultures et effets d'eau utilisent des géométries procédurales légères.

Statuts utilisés : `SPECIFIED → IMPLEMENTED → TESTED → BENCHMARKED → RELEASED`.
« RELEASED » = fusionné dans `main` et publié sur GitHub Pages.

## Phase 0 — Audit de l'état réel

### Branches parallèles

| Branche | Avance sur `main` | Fichiers `src/` touchés | Risque de conflit |
| --- | --- | --- | --- |
| `feat/little-world-assets` | 10 commits | `src/structures/*` (assemblage de quais) + assets | faible (aucun module de cette campagne) |
| `feat/modular-dock-assets` | 3 | `src/structures/*` | faible |
| `feat/approved-lowpoly-buildings` | 5 | aucun | nul |
| `feat/living-world-editor` | historique disjoint | — | non utilisé |

E7–E10 est fusionné. Les contrats V3 ajoutés (sélection typée, `PathDefinition.kind/smooth`, composant `Light`) sont stables et ne recouvrent pas ceux de cette campagne.

### Inventaire des modules

| Domaine | Existant (code réel) | Statut | Lacunes |
| --- | --- | --- | --- |
| Collisions | `WorldCollisionQuery` (`src/physics/collision-world.ts`) : broadphase en grille de 32 m, AABB boîte/sphère, `SurfaceLayer` rectangulaires par `zoneId/levelId`, `surfaceAt`, `waterAt`, `move` (résolution XZ séparée par axes) | IMPLEMENTED / TESTED | pas de montée de marche ni de sol sur le dessus d'un obstacle, pas de pente limite, pas de plafond d'obstacle, pas de balayage continu (traversée possible à grande vitesse), dimensions fixes (r 0,4 / h 1,8), espaces souterrains limités à des rectangles |
| Personnage | `simulatePlayer` (`src/player.ts`) : sol / air / planage / nage / plongée, à pas fixe de 30 Hz (`FrameClock`) | IMPLEMENTED / TESTED | collision dépendante du pas, aucune transition explicite surface ↔ souterrain |
| Eau | `WaterBody` (polyligne, `profile` terrain/manuel), `compileWaterBody` (profil descendant, diagnostics), `WaterSpatialIndex` (grille de 32 m, niveau et courant), creusement local du lit, mer = terrain sous `seaLevel` | IMPLEMENTED / TESTED | pas de nœuds ni de jonctions, pas de lac polygonal, pas de cascade explicite haut/bas, pas d'exutoire typé |
| Zones | `ActivityZoneV3 {id, kind: 'farm-plot' \| 'mine', name, polygon, levels?}` (Studio E6, carte, compilateur) | IMPLEMENTED (contour seul) | aucune simulation, aucun paramètre de mine ni de culture |
| Gameplay | runtime déclaratif (états, inventaire validé par registre, transactions de segment), `WorldClock`, `createClimate` / `ClimateSummary` (intégrales exactes) | IMPLEMENTED / TESTED | aucune action de mine ni d'agriculture |
| Sauvegardes | `GameSaveV1` en `localStorage` (`little-world:game-save:v1:<monde>:<slot>`), 3 emplacements, export/import JSON, bac à sable de playtest (`sessionStorage`) | IMPLEMENTED / TESTED | aucun état de mine ni de parcelle ; plafond de 2 Mo ; pas d'IndexedDB |
| Compilateur / lecteur | `compileProject` → manifeste + paquets de secteurs ; `playableFromCompiled` (zones transmises au runtime) | IMPLEMENTED / TESTED | les paquets d'entités sont chargés au démarrage (lot 1), pas de streaming d'entités |
| Présentation | `PresentationBudget` (30/20 FPS, niveaux 0–2), streaming terrain, LOD, pool de lumières E10 | IMPLEMENTED / TESTED / BENCHMARKED (CPU) | — |

### Dépendances et ordre

- **PHYS** (espaces superposés, plafonds, transitions) est la fondation de la mine jouable.
- **MINE** dépend de PHYS (adaptateur de collision), des sauvegardes V2 et du runtime d'inventaire.
- **AGRI** dépend de `WorldClock` / `ClimateSummary`, de l'inventaire et des sauvegardes V2 ; pour l'irrigation, il dépend d'une requête « eau disponible » (WATER).
- **WATER** (lacs, cascades) est indépendant des autres, sauf pour la requête de volume partagée avec PHYS.

### Fichiers partagés sensibles

`studio-core/types.ts`, `studio-core/zones.ts`, `gameplay/save.ts`, `runtime/compiled-world.ts`, `main.ts`, `world-data.ts`.

Les changements de contrat de ces fichiers sont regroupés dans des commits dédiés, avant les fonctionnalités qui en dépendent.

### Risques techniques

1. Les sauvegardes existantes et les tests navigateur lisent la clé `little-world:game-save:v1:*` : toute évolution doit rester lisible à cette adresse.
2. Le moteur de déplacement est utilisé par le jeu publié : toute régression de collision se voit immédiatement. Les tests de régression du personnage précèdent les changements.
3. Le déterminisme agricole impose une quantification explicite du temps : les formules non linéaires (bornes d'humidité) ne sont pas associatives sur des intervalles arbitraires.
4. Une mine au-dessous d'un relief extérieur exige que le personnage ne soit jamais recollé au terrain de surface pendant qu'il est dans une galerie.

## Contrats de la campagne (V3, optionnels et rétrocompatibles)

Les contrats détaillés sont complétés phase par phase dans les sections suivantes.

## Phase 1 — PHYS : contrôleur cinématique renforcé

**Statut** : IMPLEMENTED → TESTED → BENCHMARKED (CPU, Node).

- `WorldCollisionQuery` (API conservée) :
  - mouvement balayé par sous-pas de 0,2 m, avec contact exact contre les parois ;
  - glissement par axe ;
  - dessus d'obstacles praticables sous la hauteur de marche ;
  - pente maximale du relief (tan 50° par défaut) ;
  - hauteur libre et plafonds ;
  - dépénétration des obstacles mobiles ;
  - fournisseurs d'espaces `SpaceProvider` (une mine répond depuis sa grille, sans un collider par cellule) ;
  - transitions explicites `TransitionVolume` entre espaces (entrées, escaliers, puits).
- `simulatePlayer` :
  - corps configurable (`radius`, `height`, `step`, `maxSlope`) ;
  - atterrissage par balayage vertical ;
  - plafond à la hauteur du corps ;
  - transitions sans saut implicite ; le jeu coupe l'interpolation après une transition.
- Un joueur dans une galerie n'est jamais replacé sur le terrain extérieur (test sur 3 niveaux). La caméra reste dans la galerie, sous le plafond.
- **Tests** : `tests/physics-controller.test.mjs` (7 scénarios : relief, marche, mur, glissement, plafond, pente, vitesse de 60 m/s, obstacle mobile, niveaux, retour en surface, 20/30/60 Hz). Les tests de collision existants sont inchangés et verts. Suites navigateur legacy, gameplay, island, environment et characters : vertes.
- **Mesures** (`node tools/bench-physics.mjs`, 1 pas à 30 Hz) :

| Scénario | p50 | p95 | p99 |
| --- | --- | --- | --- |
| relief | 4 µs | 10 µs | 36 µs |
| 400 obstacles proches | 43 µs | 129 µs | 243 µs |
| galerie de mine (grille) | 3 µs | 7 µs | 15 µs |

- **Choix** : Rapier n'est pas introduit ; aucun cas mesuré ne le justifie.

## Phase 2 — Cœurs MINE, AGRI, WATER

### MINE

**Statut** : IMPLEMENTED → TESTED → BENCHMARKED (CPU).

- **Contrat** `MineSettingsV3` (dans `ActivityZoneV3.mine`, optionnel) :
  - niveaux à identifiants stables et altitudes explicites, avec au moins 1,5 m de roche entre deux niveaux ;
  - entrée ;
  - escaliers entre niveaux voisins ;
  - galeries initiales ;
  - graine et version de géologie.
- **Géologie déterministe** : terre, roche, roche dure, filons de fer sur plusieurs cellules (bandes de bruit), amas de cristaux, roche mère protégée hors du contour.
- **`MineState`** :
  - un bitset de 32 × 32 bits par chunk et par niveau, avec révision ;
  - creusement validé : niveau, cellule, accessibilité, portée de 2,6 m, matière, révision attendue ;
  - atomique avec l'inventaire (la récompense doit être acceptée avant l'écriture) ;
  - idempotent par `requestId`.
- **Maillage** : faces exposées uniquement, fusionnées en bandes ; frontières de chunk lues dans l'état.
- **Mesures** (`node tools/bench-activities.mjs`) :
  - maillage d'un chunk de 32 × 32 : p50 0,22 ms, p95 0,75 ms ;
  - creusement + reconstruction des chunks touchés : p50 0,8 ms, p95 3,3 ms (recherche de cellule comprise) ;
  - sauvegarde après 300 creusements : 1,7 Ko.

### AGRI

**Statut** : IMPLEMENTED → TESTED → BENCHMARKED (CPU).

- **Profils versionnés** : blé, carotte, citrouille.
- **Paramètres** `FarmSettingsV3` (dans `ActivityZoneV3.farm`) : cultures autorisées, culture initiale, rangs, fertilité, drainage, point d'irrigation.
- **Simulation différée**, jamais par frame ni par plante :
  - tranches de ½ heure de jeu alignées sur des multiples absolus du temps du monde ;
  - chaque tranche intègre le `ClimateSummary` exact de son intervalle (chaleur, pluie, ciel clair) ;
  - les actions s'appliquent à la frontière de tranche.
- **Garantie** : une évaluation continue et une évaluation différée, même avec une sauvegarde JSON entre les deux, donnent des états identiques au bit près (test).
- **Actions** `plant` / `water` / `harvest` / `clear` : évaluation à l'heure de l'action, eau logique requise, récolte atomique avec l'inventaire, idempotence. Les champs fertilité et historique de rotation sont réservés.
- **Mesures** (évaluation d'une parcelle) :

| Absence | p50 |
| --- | --- |
| 1 jour de jeu | 0,08 ms |
| 30 jours | 0,55 ms |
| 10 ans | 63 ms (borne) |

  Au-delà d'environ 11 ans d'absence, une erreur explicite est levée.

### WATER

**Statut** : IMPLEMENTED → TESTED → BENCHMARKED (compilation).

- **`WaterBody`** (champs optionnels) :
  - `kind: 'lake'` (contour fermé, niveau constant) ;
  - liens orientés `from` / `to` (lac, rivière, mer) ;
  - cascades `falls` à niveaux haut et bas explicites.
- **`compileWaterNetwork`** :
  - compile les lacs, puis les rivières de l'amont vers l'aval ;
  - une rivière part au niveau de sa source et ne descend jamais sous son exutoire ;
  - diagnostics : lien manquant, écart, remontée, mer non atteinte, boucle, cascade incohérente ;
  - aucune cascade n'est créée sans l'auteur.
- **Volumes logiques** : lacs dans l'index spatial (niveau, sans courant), bassin creusé localement, distance aux rives, secteurs du bassin entier. La géométrie rendue n'est jamais la vérité de l'immersion.
- **Rendu** : un seul maillage par lac (triangulation par oreilles) ; la cascade est une nappe quasi verticale du ruban.
- **Mesure** : compilation du réseau de B1 (2 rivières, 1 lac, 1 cascade) p50 0,7 ms.
- **Non fait dans cette campagne** :
  - jonctions rivière → rivière avec surface de raccord dédiée (le lien et le niveau sont gérés, le rendu superpose les rubans) ;
  - LOD dédié des surfaces d'eau lointaines ;
  - animation de surface.

## Phase 3 — Sauvegardes locales V2

**Statut** : IMPLEMENTED → TESTED.

- **`GameSaveV2`** : cœur V1, espace actif, différences par mine, états par parcelle. Les slots V1 sont lus et migrés.
- **Même clé `localStorage`** : les champs du cœur restent lisibles à l'adresse historique.
- **Charges d'activité > 256 Kio** :
  - stockées dans IndexedDB (stockage intégré du navigateur, aucune infrastructure) ;
  - le manifeste compact est écrit en dernier comme point de validation ;
  - l'ancienne charge est supprimée après validation.
- **Messages clairs** si les données détaillées ont été effacées ou si le stockage est indisponible ou plein ; le bouton « Exporter la partie en cours » fonctionne toujours.
- **Import** d'une partie exportée vers un slot libre.

## Phases 4–5 — Mine et agriculture jouables, eau intégrée

**Statut** : IMPLEMENTED → TESTED (navigateur, scène B1).

- **Runtime d'activités** : intentions du joueur (F : creuser la paroi visée ou agir sur la parcelle ; C : changer de culture), validées par l'autorité locale, appliquées de façon atomique et notifiées au rendu.
- **Rendu procédural sans asset** :
  - seuls les chunks du niveau actif et des niveaux voisins sont maillés, dans un rayon de 48 m, avec un cache borné à 36 chunks ;
  - entrée et escaliers balisés ;
  - lanternes E10 à hauteur absolue ;
  - ambiance souterraine sans lumière du ciel ;
  - sol de parcelle teinté par l'humidité et cultures en `InstancedMesh`, mises à jour seulement au changement de stade et masquées au-delà de 140 m.
- **Scène de démonstration** `npm run generate:b1` : `maps/b1-demo.project.json`, `public/maps/b1-demo/`.
- **`npm run test:b1`** : parcours d'acceptation 1–11, 19 contrôles sur le monde compilé statique.

## Phase 6 — Studio

**Statut** : IMPLEMENTED → TESTED.

- **Inspecteur des zones de mine** : graine, entrée, niveaux (nom, sol, hauteur), escaliers, plan par niveau (géologie, ouvert, entrée, escaliers), réinitialisation. Le nombre de niveaux reste cohérent avec les paramètres (`withLevelCount`).
- **Inspecteur des parcelles** : cultures autorisées, culture initiale, rangs, sol, irrigation, aperçu des stades.
- **Panneau Eau** : forme rivière ou lac, liens « Sort de » / « Se jette dans », cascades éditables, diagnostics du réseau.
- **Diagnostic physique** (module Zones) : volumes de collision, pentes infranchissables, niveaux de mine. C'est une aide d'édition, jamais exportée.
- **« Démonstration B1 »** depuis l'accueil du Studio.
- **Tests** : `tests/activity-authoring.test.mjs` ; `npm run test:b1-studio` (étape 12 : édition, annulation, « Jouer ici », projet intact).
