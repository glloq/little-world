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
