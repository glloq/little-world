# 35 — Studio E7 → E10 : sélection universelle, routes, édition géographique, éclairage local

**Base : `main` = `fc57d37` (PR #8 fusionnée). Branche : `claude/bold-tesla-b0pe7k`.**
Aucun asset (GLB, LOD, matériaux sources, registres) n'est modifié : chemins et aides de l'éditeur sont des géométries procédurales.

## 1. Audit préalable

| Domaine | Existant (code réel) | Lacunes pour cette campagne |
| --- | --- | --- |
| Sélection | `SelectionService` (contexte V3 : `selected`, `selectedIds` typés `{kind,id}` mais seul `entity` est produit), `SelectionController` (picking par `userData.entityId`, contours), `SelectTool` (gizmos, Ctrl+D, Suppr), liste d'entités, carte 2D (visée + entité proche < 25 m) | Chemins, rivières, zones, retouches de relief/biotope non sélectionnables ; inspecteur réservé aux entités ; pas de verrouillage ; prune après annulation limité aux entités |
| Chemins | `PathDefinition {id, points, width}` (bibliothèque globale + `pathRefs` par secteur), outil polyligne (ajout/déplacement/retrait), ruban 3D uniforme (`createRibbon`, une couleur), exclusion de la végétation (occupation `road`) | Aucun type, pas de courbes, pas de raccord, chevauchement coplanaire aux croisements, aucun diagnostic de pente, un maillage par chemin non sectorisé, pas de LOD |
| Carte 2D | 8 couches, pinceaux, polygone (remplir / rétablir avec aperçu), formes de relief, lecture au curseur | Pas de rectangle, pas d'application de relief à une zone, pas de protection des corrections, sélection limitée aux entités, aucun diagnostic des éléments touchés |
| Éclairage | `configureScene` : hémisphère + soleil + appoint ; `createEnvironmentView` règle soleil/ambiance selon l'horloge (jeu seulement) ; aucune lumière locale ; le Studio est toujours éclairé de jour | Composant de lumière, gestion de budget, lueurs lointaines, vacillement, jour/nuit des sources, aperçu de nuit du Studio |
| Données | Composants V3 typés validés (`parseComponents`), compilation des entités par secteur, `runtimeContent` (placements, PNJ), états logiques et positions de PNJ dans `gameplay/runtime.ts` | Composant `Light` à ajouter de bout en bout (schéma, compilateur, lecteur, monde) |

Dépendances : E7 (sélection typée, inspecteurs) est le socle de E8 (édition d'un chemin sélectionné), E9 (sélection depuis la carte, diagnostics cliquables) et E10 (sélection des lumières).

## 2. Contrats V3 (ajouts optionnels, rétrocompatibles)

- **Sélection** : `StudioSelection.kind ∈ entity | path | water | zone | terrainEdit | biomeEdit` (les lumières sont des composants d'entités). `StudioContext.locked?: string[]` (préférence d'édition, non exportée dans le monde).
- **Chemins** : `PathDefinition.kind?: 'trail' | 'dirt' | 'stone' | 'wood'` (absent = terre, aspect historique), `smooth?: boolean` (courbe interpolée ; absent = segments droits comme avant). Les identifiants et `pathRefs` sont inchangés.
- **Lumière** : composant `Light {type:'Light', preset, color, intensity, range, offset:{x,y,z}, mode:'always'|'night'|'state', stateKey?, flicker, enabled}` sur une entité existante (objet, bâtiment, PNJ) ou sur une entité autonome `kind:'effect'` avec `Transform` + `Light`.

Le détail de chaque lot, les mesures et le statut sont complétés au fil des lots ci-dessous.
