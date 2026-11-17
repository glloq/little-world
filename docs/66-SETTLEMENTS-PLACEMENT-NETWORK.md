# 66 — Implantation intelligente, voirie, parcelles et contraintes des colonies

**Statut : SPECIFIED**, complément de [65 — objectifs Studio](65-SETTLEMENTS-STUDIO-SPEC.md). Aucune de ces règles ne doit être considérée comme implémentée par la présente branche.

## 1. Architecture proposée (logique pure, hors rendu)

```text
SettlementRecipe (auteur, version, seed, zone, activités, style)
  -> SiteAnalyzer (terrain, pente, littoral, ressources, obstacles)
  -> AnchorPlanner (centre, accès externes, port, mine, château, moulin...)
  -> TransportGraph (nœuds + segments + niveaux + dessertes partagées)
  -> DistrictPlanner (centralités, densité, zones d'activité)
  -> ParcelPlanner (lots, frontage, portes, accès, services)
  -> BuildingSolver (prefabs, volume réservé, collisions, métiers, richesse)
  -> InfrastructureDresser (revêtement, ponts, quais, murets, clôtures)
  -> Diagnostics/Preview/Transaction -> RuntimeCompiler
```

Implémenter les algorithmes géographiques **sans Three.js ni DOM**, de manière testable avec Node. Le Studio les appelle via la session et le travail calculé peut être déplacé dans un Worker. Les objets validés deviennent des entités V3 et des chemins existants ; pas de deuxième format monde parallèle.

## 2. Données d'entrée et sorties attendues

**Entrée** : bounds du projet, heightfield, pente/normal, eau et hydrographie, biomes/forêts, falaises/grottes, routes existantes, obstacles et zones interdites, zones de parcelles agricoles, éventuels points d'intérêt, profils de ressources et populations, verrouillages et seed.

**Sortie auteur versionnée** (forme de contrat à arbitrer en SET-0, ne pas ajouter aveuglément aux schémas validés) :
- `SettlementRecipe` : `id`, `generatorVersion`, `seed`, `region`, `styleProfile`, `wealthProfile`, `size`, `requiredRoles`, `optionalRoles`, `forbiddenRoles`, `locks`.
- `SettlementPlan` dérivé : ancrages, quartiers, segments de route, parcelles, instances de prefab, zones réservées, accès, diagnostics et estimations perf.
- Sources persistées : entités, chemins, zones, recettes et overrides **avec IDs stables**. Les grilles de coût, scores temporaires et meshes sont **dérivés**, régénérables.
- `generationRecord` relie auteur, seed locale par phase, recette/version et propriétaires des objets créés. Un re-run ne doit pas supprimer un objet non possédé par cette recette.

**Exemple de recette (illustratif, NON schéma déjà accepté) :**

```json
{
  "id": "colony-village-01",
  "generatorVersion": 1,
  "seed": 48219,
  "form": "organic_village",
  "activity": ["agriculture", "market"],
  "architecture": {"dominant": "timber_stone", "plasterWhite": 0.2},
  "wealth": {"level": 2, "variation": 0.35},
  "buildings": {"target": 60, "mandatory": ["market", "windmill"]},
  "defense": "none",
  "roads": {"reuseExisting": true, "shareAccess": true},
  "regenerate": {"scope": "unlocked_only"}
}
```

## 3. Contraintes géométriques absolues — rejet avant scoring

- Empreinte 2D avec rotation, marges et **volume 3D** réel ; sol support suffisant, débordement non autorisé, superposition avec voisin ou infrastructure interdite.
- Pente maximale, variation de fondation, distance au bord de falaise, recul de rive/inondation, couvert forestier à retirer explicitement, respect zones protégées.
- Porte accessible à hauteur de sol correcte ; réserver l'arc d'ouverture et un palier devant la porte ; fenêtres non enterrées si elles doivent être ouvertes.
- Route/chemin avec largeur utile, pente, rayon de virage, hauteur libre, continuité de niveau ; accès charrette pour grange/entrepôt, uniquement piéton pour refuge.
- Pas de route fantôme à travers l'eau, le bâtiment, une falaise ou un vide de grotte ; traversée d'eau seulement par pont, gué explicitement navigable ou embarcadère.
- Intersections de projection 2D **non connectées** si altitudes ou structures distinctes (pont, tunnel, escalier).
- Terriers et bâtiments troglodytes : réserver entrée et plateforme de circulation **avant** d'appliquer la géométrie locale au terrain.
- Contraintes d'exclusion autour du feu, des mécanismes de moulin et des zones dangereuses ; les valeurs sont des paramètres du prefab/rôle, pas des nombres magiques dispersés.
- Les conflits doivent afficher `ERROR | WARNING | INFO` avec IDs/localisation et correctif suggéré ; pas d'auto-correction destructrice silencieuse.

## 4. Réseau de voirie : topologie et revêtement séparés

### 4.1 Hiérarchie et sémantique

| Catégorie | Usage | Requiert |
| --- | --- | --- |
| `regional` | inter-villages / commerce | raccordement externe, priorité grande échelle |
| `primary_street` | place, port, portes de remparts | continuité et largeur |
| `local_street` | quartiers résidentiels | desserte mutualisée |
| `rural_track` | fermes, moulins, scieries, mines | trafic charrette si nécessaire |
| `footpath` | cabanes, terriers, campements | circulation piétonne |
| `private_access` | porte → réseau | court, sans doublons |
| `stairs_ramp` | étagement / falaise | dénivelé, largeur et clearance |
| `bridge` | franchissement | appuis / passages / collision |
| `quay_access` | logistique portuaire | liaison entre quai et rue |

`surface` est une propriété indépendante : terre, herbe usée, gravier, pierre brute, pavés, dalles, planches, brique. Largeurs et matériaux varient **sans rupture de la connectivité**.

### 4.2 Algorithme

1. Projeter les accès régionaux et les ancrages obligatoires (port, porte de ville, marché, château, mine, moulins).
2. Générer un graphe de candidats sur le terrain constructible ; coût = longueur + pente + terrassement + traversées + danger + conflit + coût de matériau.
3. Connecter d'abord les points structurants par arbre minimal ou croissance incrémentale de chemins ; autoriser **boucles utiles** au centre et au commerce, pas une seule arborescence rigide.
4. Dessiner les rues de quartier et découper les lots le long des axes ; les maisons se placent selon **frontage** et orientation vers la rue.
5. Mutualiser les accès : rejoindre la desserte la plus proche si son coût est raisonnable, plutôt que créer une branche individuelle.
6. Déterminer les surfaces de voirie **après** la topologie suivant style/ressources/prospérité/usage ; prévoir transitions continues (pavés centre → gravier → terre).
7. Compiler vers les `PathDefinition` existants ou une évolution compatible, en réutilisant `src/paths/path-view.ts`. Les attributs futurs (graphe, intersection, liaison pont/escaliers, matériau) doivent être ajoutés par migration explicite.

### 4.3 Éviter la « toile d'araignée » de chemins

- Réutiliser un segment existant si déviation inférieure au coût d'un nouveau chemin.
- Un cluster de maisons partage une entrée de chemin, et chaque maison a un accès final court vers sa porte.
- Éviter routes parallèles proches, impasses inutiles, doubles liaisons de même niveau sans gain de circulation.
- Un chemin de ferme suit les limites des parcelles quand pertinent ; une rue de ville peut être plus directe.
- Tester la connectivité sur **graphe routier pondéré**, pas sur distance euclidienne.

## 5. Matrice d'implantation métier/ressource

| Rôle | Favoriser | Éviter | Connexion requise |
| --- | --- | --- | --- |
| `farm` | sol cultivable, champs, eau | fortes pentes, centre dense | chemin rural |
| `barn` | ferme, aire agricole | petite ruelle urbaine | charrette |
| `windmill` | vent, hauteur dégagée, champs | forêt dense, obstacles pales | champs → village |
| `watermill` | débit et dénivelé exploitables | rivière sans chute, zone inondable | chemin + bief/roue |
| `mine` | gisement, roche, accès sûr | habitations, eau profonde | voie logistique |
| `forge` | logistique mine + village + clients | quartier dense sensible au bruit/fumée | voie carrossable |
| `smelter` | minerai + combustible + livraison | maisons et place | logistique |
| `sawmill` | forêt + transport, eau éventuelle | centre urbain | chemin forestier |
| `market` | population, place, axes fréquentés | impasse excentrée | rue principale |
| `shop` | logements et flux piétons | zone inaccessible | rue résidentielle |
| `bakery` | marché, moulin, habitations | zone sans clientèle | rue |
| `inn` | porte de ville, axe régional | rue peu fréquentée | route principale |
| `fishing_market` | débarquement, ponton, stockage | rive inaccessible | quai → rue |
| `warehouse` | quai et route de livraison | zone piétonne étroite | transport marchandises |
| `watchtower` | visibilité, crête ou col | terrain masqué/instable | sentier |
| `camp` | route, point d'eau, replat, POI en hauteur | pente, crête trop exposée, feu dangereux | sentier |
| `forest_cabin` | clairière, forêt, feu et eau | arbres qui chevauchent, pente | chemin forestier |
| `burrow` | pente douce/colline, terre | roche inadaptée, eau, porte enterrée | sentier |
| `cliff_cave` | roche stable, replat/terrasse | falaise instable ou sans accès | escalier/sentier |
| `castle` | défendable, dominant, porte | pas d'accès logistique | route/porte principale |

Une relation « proche » peut être une **distance de réseau** ; pour la forge, optimiser les flux de matières premières/clients et non le seul raccourci vers la mine.

## 6. Scores et résolution sous contraintes

1. Échantillonner une grille basse résolution ou candidats géographiques ; filtrer les **contraintes absolues**.
2. Calculer les champs d'influence par ressource/POI et les coûts de trajet multi-sources ; pas de recherche A* complète pour chaque maison.
3. Score normalisé `S = Σ(w_i * normalizedCriterion_i) - penalties`, pondéré par rôle, où `S` ne peut jamais compenser une contrainte bloquante.
4. Réserver les grandes emprises (place, port, remparts, moulin, château), puis quartiers, routes, parcelles et maisons.
5. Un placement modifie l'occupation locale : rafraîchir seulement les cellules et dépendances concernées, avec boucle bornée de backtracking.
6. Trier les candidats de façon stable et départager par sous-graine du rôle + ID ; aucun `Math.random` non contrôlé, aucun effet de l'ordre de chargement des chunks.
7. Si `mandatory` impossible : diagnostic explicite + alternatives (autre zone, moins de bâtiments, changer moulin) ; jamais créer une rivière ou écraser un relief verrouillé sans consentement.

Sous-graines indépendantes : `site`, `anchors`, `roads`, `districts`, `parcels`, `buildings`, `materials`, `dressing`. Une variante de toit ne doit pas recalculer la voirie.

## 7. Regénération locale et édition sûre

- `ownedByGeneration` (ou équivalent validé) enregistre recettes/versions/IDs ; séparation stricte des créations automatiques et des objets manuels.
- Verrous par zone, route, parcelle, bâtiment ou entrée. Conserver les entités étrangères et leurs liens.
- Planifier en **diff** : créer/modifier/supprimer, impact sur collisions, navigation, parcelles, eau, ressources et budget.
- Prévisualiser les conflits ; appliquer uniquement les secteurs dépendants par **une transaction**, avec rollback complet en cas de validation manquée.
- Recompiler les dérivés graphiques, collisions et nav des secteurs touchés, préserver les zones hors périmètre.
- Si la génération traverse la frontière d'un secteur, les références globales gardent un **owner** unique et un index spatial multi-secteurs, sans double entité.

## 8. Tests de qualité urbaine à ajouter

- 100 % des portes « accessibles » connectées à une zone de circulation et au graphe voulu ; aucun faux contact 2D entre pont et voie inférieure.
- Aucun chemin qui traverse une maison, coupe l'eau sans traversée définie, ou s'arrête à une falaise sans escalier.
- Répartition de matériaux vérifiée par style + disponibilité locale + richesse ; centre pavé / périphérie terre dans le cas attendu.
- Densité croissante vers le centre pour recettes concernées ; pas imposée aux campements/villages de falaise.
- Stabilité de la graine sous rechargement, inversion d'ordre de chunks et changement de LOD ; vérification des verrous.
- Coût du placement borné par candidats/itérations avec diagnostics explicites ; pas de `O(n²)` non borné sur la carte entière.

Voir [67 — collisions](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md) pour la validité traversable et [68 — tests](68-SETTLEMENTS-ROADMAP-TESTS.md) pour la campagne de qualification.
