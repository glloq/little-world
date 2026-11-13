# 35 — Studio E7 → E10 : sélection universelle, routes, édition géographique, éclairage local

**Base : `main` = `fc57d37` (PR #8 fusionnée). Branche : `claude/bold-tesla-b0pe7k`.**
Aucun asset (GLB, LOD, matériaux sources, registres d'assets) n'est modifié, remplacé ou régénéré. Les chemins et les aides de l'éditeur (marqueurs de lumière, gizmo de portée, contours) sont des géométries procédurales légères. Aucun serveur, aucune dépendance multijoueur.

## 1. Audit préalable

| Domaine | Existant (code réel) | Lacunes pour cette campagne |
| --- | --- | --- |
| Sélection | `SelectionService` (contexte V3 : `selected`, `selectedIds` typés `{kind,id}`, mais seul `entity` était produit), `SelectionController` (picking par `userData.entityId`, contours), `SelectTool` (gizmos, Ctrl+D, Suppr), liste d'entités, carte 2D (visée + entité proche < 25 m) | Chemins, rivières, zones, retouches de relief/biotope non sélectionnables ; inspecteur réservé aux entités ; pas de verrouillage ; nettoyage après annulation limité aux entités |
| Chemins | `PathDefinition {id, points, width}` (bibliothèque globale + `pathRefs` par secteur), outil polyligne, ruban 3D uniforme (`createRibbon`, une couleur), exclusion de la végétation (occupation `road`) | Aucun type, pas de courbes ni de raccords, chevauchement coplanaire aux croisements, aucun diagnostic de pente, un maillage par chemin non sectorisé, pas de LOD |
| Carte 2D | 8 couches, pinceaux, polygone (remplir / rétablir avec aperçu), formes de relief, lecture au curseur | Pas de rectangle, pas de relief appliqué à une zone, pas de protection des corrections, sélection limitée aux entités, aucun diagnostic des éléments touchés |
| Éclairage | `configureScene` (hémisphère + soleil + appoint) ; `createEnvironmentView` règle soleil/ambiance selon l'horloge (jeu seulement) ; aucune lumière locale ; Studio toujours éclairé de jour | Composant de lumière, budget, halos lointains, vacillement, jour/nuit des sources, aperçu de nuit du Studio |
| Données | Composants V3 typés validés (`parseComponents`), compilation des entités par secteur, `runtimeContent` (placements, PNJ), états logiques et positions de PNJ dans `gameplay/runtime.ts` | Composant `Light` à ajouter de bout en bout (schéma, compilateur, lecteur, rendu) |

Dépendances : E7 (sélection typée, inspecteurs) sert de socle à E8 (édition d'un chemin sélectionné), E9 (sélection depuis la carte, diagnostics cliquables) et E10 (sélection des lumières).

## 2. Contrats V3 (ajouts optionnels, rétrocompatibles)

- **Sélection** : `StudioSelection.kind ∈ entity | path | water | zone | terrainEdit | biomeEdit` (les lumières sont des composants d'entités). `StudioContext.locked?: string[]` : préférence d'édition, non exportée dans le monde compilé.
- **Chemins** : `PathDefinition.kind?: 'trail' | 'dirt' | 'stone' | 'wood'` (absent = terre, aspect historique) et `smooth?: boolean` (courbe interpolée ; absent = segments droits comme avant). Identifiants et `pathRefs` inchangés.
- **Lumière** : composant `Light {type:'Light', kind:'point', color:'#rrggbb', intensity (cd, 0–200), range (0,5–60 m), offset:{x,y,z} (repère local de l'entité), enabled, mode:'always'|'night'|'state', stateKey?, flicker?:{amplitude 0–1, speed 0,1–4 Hz}, preset?}`. Il se place sur une entité existante (objet, bâtiment, PNJ) ou sur une entité autonome `kind:'effect'` portant seulement `Transform` + `Light`. Il est indépendant de tout GLB ; aucune option d'ombre n'existe (refusée par le validateur).
- **Monde runtime** : `WorldDefinition.lights?` (projection runtime seulement, jamais lue depuis un fichier V1/V2, comme `geography`).

Les cartes V1/V2 et les projets V3 antérieurs restent lisibles sans migration : tous les champs sont optionnels.

## 3. Lot E7 — Sélection universelle

- `src/studio-core/elements.ts` : références typées et opérations communes (existence, libellé, ancre, secteurs touchés, déplacement, duplication, suppression, dépendants, recherche, éléments sous un point, mise à jour).
- Sélection en 3D (maillage d'entité, sinon élément sous le point du sol avec une tolérance liée à la distance caméra) et en 2D. La sélection est partagée entre la vue 3D, la carte et la liste.
- Contours drapés pour les éléments non-entités ; le gizmo les déplace en une transaction.
- Inspecteur par type : chemin, rivière, zone, retouches. Il gère la multi-sélection mixte et le verrouillage (`locked`).
- Avertissement avant une suppression qui casserait des références.
- **Tests** : `tests/elements.test.mjs` (4) ; `npm run test:selection` (13 contrôles). Ces contrôles couvrent la sélection d'une route, sa modification, le passage en 2D, la sauvegarde, le rechargement et l'édition continuée sur la même identité.

## 4. Lot E8 — Routes et chemins

- Un seul outil, quatre profils : sentier, terre, pierre, bois (`PATH_PROFILES`). On règle la largeur et les courbes Catmull-Rom centripètes, puis on édite les points après création.
- L'aimantation aux autres chemins crée des raccords propres. Des décalages par rang garantissent qu'il n'y a jamais de surfaces coplanaires. Les passerelles de bois restent au-dessus de l'eau.
- Diagnostics : pente excessive, raccord incomplet, marche à la jonction, doublon, chemin sous l'eau.
- Géométrie déterministe découpée par secteur ; une édition ne reconstruit que les secteurs touchés.
- Rendu : LOD 1 au-delà de 160 m, streaming dans un rayon de 360 m, un seul matériau partagé, aucun objet par planche, aucun collider.
- La végétation est exclue sur la chaussée via la distance aux rubans. Les données de biotope ne sont pas modifiées et l'annulation reste possible.
- **Tests** : `tests/paths.test.mjs` (4) ; `npm run test:paths` (8 contrôles). Ce test vérifie aussi que la signature du réseau est identique dans « Jouer ici ».

## 5. Lot E9 — Édition géographique

- Carte globale : rectangle et polygone sur toutes les couches, y compris les couches calculées pour la sélection.
- Actions de zone :
  - sélectionner le contenu auteur ;
  - remplir un masque en protégeant les corrections existantes ;
  - aplanir, élever ou abaisser le relief en une transaction : disques hexagonaux bornés, au plus 400, refus explicite au-delà ;
  - rétablir la génération localement.
- Après chaque transaction de relief (carte, pinceau 3D, formes, annuler), les éléments touchés sont revérifiés : chemins, rivières, parcelles en pente, bâtiments en pente, objets sous l'eau. Les points à vérifier apparaissent dans une carte cliquable de l'inspecteur.
- 8 couches conservées, invalidation locale par rectangles de changement.
- **Tests** : `tests/terrain-impact.test.mjs` (3) ; `npm run test:geo-edit` (9 contrôles) ; `npm run test:geomap` (30 contrôles, mis à jour pour l'outil rectangle).

## 6. Lot E10 — Éclairage local LOW-RESOURCE

### 6.1 Données et chaîne complète

- `src/lighting/light-data.ts` (pur) contient :
  - les préréglages : **Lanterne chaude**, **Feu vacillant**, **Lampe fixe**, **Lumière froide** ;
  - la projection `runtimeLights` : les lumières désactivées sont retirées dès la projection, le décalage local suit la rotation et l'échelle de l'entité, et les porteurs PNJ sont marqués `follow` ;
  - le facteur nuit (transition progressive au crépuscule) ;
  - le vacillement déterministe.
- Le même `runtimeContent` alimente l'aperçu Studio (`toRuntimeWorld`) et le lecteur compilé (`playableFromCompiled`). « Jouer ici » reçoit donc exactement les mêmes sources (vérifié en Node et dans le navigateur). L'archive ZIP V3 conserve le composant.

### 6.2 Stratégie de rendu hybride

- `src/lighting/light-budget.ts` (pur, sans allocation par frame) :
  - grille uniforme de 48 m pour les sources statiques ;
  - lecture des seules cellules proches de la caméra (portée maximale + 40 m) ;
  - sélection des k sources de meilleur score `facteur × intensité × portée² / (d² + 1)` dans un tampon top-k fixe.
- Re-sélection seulement après 3 m de déplacement ou toutes les 0,25 s (états, porteurs mobiles), jamais une recherche complète par frame.
- **Hystérésis** : une lumière déjà affichée garde un bonus ×1,35. Les slots sont stables : une lumière garde son slot et une édition ne rebat pas le pool.
- **Halos lointains** : jusqu'à 512 sources dans un rayon de 700 m, cellules les plus proches d'abord. Ils sont reconstruits après 87,5 m de déplacement, à un changement jour/nuit ou toutes les secondes.
- `src/lighting/light-view.ts` : **pool fixe de `PointLight`** créé une fois, à l'apparition de la première source.
  - Les slots inutilisés ont une intensité 0. Le nombre de lumières vu par les shaders ne change donc ni avec les sources, ni avec le jour/nuit, ni avec la baisse de budget en surcharge : aucune recompilation.
  - Tous les halos tiennent dans **un seul `THREE.Points`** additif aux tampons de capacité fixe, réécrits seulement quand l'ensemble change.
  - Les lumières inactives (désactivées, éteintes de jour, état faux) ne sont ni sélectionnées ni dessinées.
- **Intégration au budget existant** : il n'y a pas de second automate. `WorldView.setDetail(level, economy)` du `PresentationBudget` (doc 22) fixe :
  - qualité normale : pool de **4** ;
  - réglage « économie » : pool de **2** (une recompilation unique, au changement de réglage par l'utilisateur) ;
  - surcharge niveau 2 : moitié des lumières alimentées, sans changer le pool.
- Libération : `WorldView.dispose` libère le pool, les tampons et les matériaux à chaque changement de monde ou de projet.

### 6.3 Ombres

Les lumières locales ne projettent aucune ombre : `castShadow=false`, aucune shadow map par lanterne, aucun champ d'ombre dans le schéma.

### 6.4 Vacillement

Le vacillement est un bruit de valeur déterministe (graine = identifiant), basse fréquence (0,1–4 variations/s) et interpolé en smoothstep. Il n'y a aucune boucle d'animation par feu : il est évalué seulement pour les 2–4 lumières du pool, à partir du temps de présentation existant. La variation d'une frame à l'autre reste < 0,06 (test).

### 6.5 Jour / nuit

- Mode `night` : le facteur `nightFactor(altitude du soleil)` passe de 0 à 1 entre +0,12 et −0,12 d'altitude solaire (transition progressive).
- Mode `state` : la lumière suit l'état booléen de l'entité dans le runtime de gameplay. Les lumières attachées à un PNJ suivent sa position.
- Aperçu de nuit du Studio : la courbe ciel/soleil est mise en commun dans `src/environment/sky-lighting.ts`, utilisée par le jeu et par l'aperçu.
  - L'aperçu applique exactement les valeurs de minuit du runtime et le facteur nuit 1, sans modifier l'heure ni l'environnement du projet.
  - Un même monde, une même caméra et la nuit donnent les mêmes sources, le même budget et la même sélection que dans le jeu.

### 6.6 Interface Studio (module « Lumières », raccourci L)

- Choix du préréglage, **Placer une lumière** (aperçu fantôme, clic répétable, une transaction par lumière), **Attacher à la sélection**, **Aperçu de nuit**.
- Liste des sources chargées avec la décision du budget à la caméra courante : lumière dynamique, halo, hors budget, éteinte, lointaine. Le résumé affiche « n/4 lumières dynamiques · k hors budget ».
- Marqueurs octaèdres sélectionnables en 3D. **Gizmo de portée** (sphère filaire) de la lumière sélectionnée, coloré selon sa décision de budget. Ces aides ne sont jamais exportées.
- Inspecteur « Lumière » :
  - préréglage, active, couleur, intensité, portée, hauteur, allumage (toujours / la nuit / selon un état), vacillement ;
  - retirer la lumière ; ajouter une lumière à n'importe quel objet ou PNJ ;
  - dupliquer et supprimer via les commandes communes.
- Chaque modification est une transaction annulable.
- Correction annexe : le module « Objets » remet toujours un asset dans l'outil de placement. Avant, revenir aux objets après avoir placé une lumière ou un personnage replaçait ce dernier.

### 6.7 Mesures

**a) Sélection (CPU, Node 22, `npm run bench:lights`)**

Conditions : 3 600 frames par scénario, tous les scénarios demandés (fichier complet : `docs/benchmarks/2026-11-13-e10-lights-selection-node.json`).

| Sources | Disposition | Nuit | Caméra | p50 µs | p95 µs | Lumières dyn. max | Halos | Hors budget |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | — | — | — | 0,2–0,3 | 0,3 | 0 | 0 | 0 |
| 20 | village | oui | fixe / mobile | 0,4 / 0,3 | 3,0 / 2,5 | 4 | 20 | 4 / 0 |
| 100 | village | oui | fixe / mobile | 0,3 / 0,3 | 2,2 / 2,5 | 4 | 100 | 47 / 0 |
| 100 | dispersé | oui | fixe / mobile | 0,1 / 0,1 | 0,4 / 0,4 | 1–2 | 71–73 | 0 |
| 500 | village | non | fixe / mobile | 0,1 / 0,2 | 6,3 / 6,9 | 4 | 250 | 130 / 0 |
| 500 | village | oui | fixe / mobile | 0,2 / 0,2 | 12,8 / 10,1 | 4 | 500 | 278 / 0 |
| 500 | dispersé | oui | fixe / mobile | 0,1 / 0,1 | 0,6 / 0,7 | 4 | 372–381 | 2 / 0 |
| 2 000 (stress) | village | oui | fixe / mobile | 0,3 / 0,5 | 38 / 49 | 4 | 512 (plafond) | 1 092 / 0 |

- Ressources : quelques kilo-octets de tableaux typés par jeu de sources.
- Allocations : mesure isolée de 200 000 appels, environ 1 o/appel en moyenne, aucun objet alloué par frame. Les pics « max » isolés (jusqu'à quelques ms) sont des pauses JIT/GC de V8 pendant la première minute.

**b) Runtime dans Chromium/SwiftShader (`npm run bench:lights:browser`)**

Conditions : 960×540, vallée par défaut, `?lightBench=N&lightLayout=…&night=…` (fichier : `docs/benchmarks/2026-11-13-e10-lights-runtime-swiftshader.json`). **SwiftShader rastérise sur le CPU : ces chiffres servent à la non-régression et au coût relatif, pas à qualifier un GPU intégré.** `submit` est le temps CPU de soumission WebGL, **pas** un temps GPU.

| Sources | Nuit | Caméra | Intervalle p50 (ms) | Soumission CPU p50 (ms) | Appels de dessin | Lumières dyn. max | Halos | Programmes shader |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | non / oui | fixe | 83 | 1,7 | 224 | 0 | 0 | 14 |
| 20 village | oui | fixe | 100 | 2,2 | 188–224 | 4 | 20 | 14 |
| 100 village | oui | fixe | 117 | 2,4 | 224 | 4 | 100 | 14 |
| 500 village | oui | fixe / mobile | 100 / 100 | 2,0 / 1,8 | 224 / 217 | 4 / 2 | 500 | 14 |
| 500 dispersé | oui | fixe / mobile | 100 / 100 | 2,1 / 1,9 | 224 / 217 | 4 / 2 | 382 | 14 |

- **Acceptation** : quel que soit le nombre de lanternes et de feux (jusqu'à 500 en navigateur, 2 000 en Node), le nombre de lumières dynamiques ne dépasse jamais le pool configuré.
- Les appels de dessin ne dépendent pas du nombre de sources : un seul appel de halos.
- Le nombre de programmes shader reste identique (14) dans tous les scénarios, même en marchant et en traversant le village (`npm run test:lights`).
- Le temps CPU de mise à jour des lumières dans le navigateur est sous la résolution de `performance.now()` (100 µs) ; la mesure Node ci-dessus fait foi.
- Le passage de 0 à 4 lumières ponctuelles coûte environ +17 ms par frame en rastérisation CPU SwiftShader (83 → 100 ms). C'est un coût de remplissage par pixel, attendu ; **il doit être mesuré sur un GPU intégré de référence** avant de qualifier les 4 lumières. L'extension `EXT_disjoint_timer_query_webgl2` est présente dans cet environnement mais n'est pas encore branchée sur `PerfSampler`.
- Mémoire : pool de 4 lumières, tampons de halos 512 × 8 flottants (≈ 16 Kio), aucune texture.

### 6.8 Budget de lumières retenu et justification

- **4 lumières ponctuelles dynamiques en qualité normale, 2 en économie, moitié alimentée en surcharge de niveau 2.** Ces valeurs de départ ne sont **pas validées** sur GPU réel.
- Justification :
  1. Three.js évalue chaque lumière ponctuelle pour chaque fragment de chaque matériau éclairé : le coût croît linéairement avec le pool, quel que soit le nombre de sources auteur.
  2. Un pool fixe évite les recompilations : changer le nombre de lumières visibles recompile tous les matériaux éclairés, ce qui provoque des saccades.
  3. Avec une portée de 10–14 m, 4 lumières couvrent l'environnement immédiat du joueur dans un village dense (mesuré : 4 slots toujours occupés au centre du village, 278 sources rendues en halos).
  4. Le rendu reste correct avec 2 lumières : les halos signalent toutes les autres sources.
  5. Aucune shadow map n'est ajoutée, ce qui laisse le budget d'ombres au soleil (doc 19).

### 6.9 Statut E10

| Mécanisme | Spécifié | Implémenté | Testé | Benchmarké | Publié |
| --- | --- | --- | --- | --- | --- |
| Composant `Light` (schéma, archive, compilateur, lecteur) | oui | oui | oui (Node) | — | non (PR) |
| Budget, pool fixe, halos, hystérésis | oui | oui | oui (Node + navigateur) | oui (Node ; SwiftShader relatif) | non |
| Vacillement, jour/nuit, état, porteur PNJ | oui | oui | oui (Node ; nuit dans le navigateur) | oui (CPU) | non |
| Studio « Lumières », inspecteur, aperçu de nuit, statut budget | oui | oui | oui (navigateur, 12 contrôles) | — | non |
| Qualification GPU intégré (temps GPU, 30/20 FPS) | oui | — | — | **non** | — |

## 7. Statut par lot

| Lot | Implémenté | Testé | Benchmarké | Publié |
| --- | --- | --- | --- | --- |
| E7 Sélection universelle | oui | oui (Node 4, navigateur 13) | sans objet | non (PR vers `main`) |
| E8 Routes et chemins | oui | oui (Node 4, navigateur 8) | génération et rendu sectorisés mesurés dans les statistiques `paths` ; pas de banc GPU | non |
| E9 Édition géographique | oui | oui (Node 3, navigateur 9 + 30) | sans objet | non |
| E10 Éclairage local | oui | oui (Node 6, navigateur 12) | CPU Node + SwiftShader relatif ; **GPU non qualifié** | non |

« Publié » signifie fusionné dans `main` et déployé sur GitHub Pages : ce n'est le cas d'aucun lot tant que la PR n'est pas fusionnée.

## 8. Régressions détectées et corrigées pendant la campagne

- Panneau Eau : après Annuler puis Refaire, le tracé n'était plus retrouvé. L'annulation retire désormais de la sélection les éléments supprimés, et le panneau dépendait de cette sélection. Il mémorise maintenant le tracé édité (`test:water` rétabli, 11 contrôles).
- Module Objets : il replaçait la dernière lumière ou le dernier personnage au lieu d'un asset (corrigé, couvert par `test:lights`).
- Inspecteur : une étape asynchrone ajoutée (import différé) retardait l'affichage après Annuler. L'import est désormais statique (`test:studio`, `test:local` rétablis).

## 9. Limites connues

- Les lumières des secteurs non hydratés ne sont pas listées dans le Studio, car l'index global ne porte pas les composants. Le jeu compilé les charge toutes au démarrage, comme les autres entités (lot 1, pas de streaming d'entités).
- Les porteurs PNJ suivent la position logique du PNJ, avec une frame de décalage au plus.
- Les halos des sources en mode `state` lointaines se mettent à jour à la reconstruction des halos (≤ 1 s).
- Le Studio rend à la demande : le vacillement n'y est visible que pendant les interactions.
- Temps GPU non mesuré : le timer WebGL2 n'est pas branché, et les cibles 30/20 FPS avec 4 lumières sur GPU intégré ne sont pas qualifiées.
- Les routes ne sont pas des surfaces de collision ou de navigation : le relief reste la surface de marche.

## 10. Étapes suivantes

1. Banc sur PC de référence à GPU intégré : temps GPU (timer WebGL2 asynchrone dans `PerfSampler`), 0/2/4 lumières, village de nuit.
2. Index léger « porte une lumière » dans `entityIndex` pour lister les sources des secteurs non chargés.
3. Lumières de type « spot » seulement si un besoin concret apparaît (même pool).
4. Streaming des entités compilées (lumières incluses) quand les cartes dépasseront le chargement initial borné.
