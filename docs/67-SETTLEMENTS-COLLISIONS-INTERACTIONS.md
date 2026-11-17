# 67 — Collisions, navigabilité et interactions joueur des colonies

**Statut : SPECIFIED — cible technique à développer et vérifier**, complément de [65](65-SETTLEMENTS-STUDIO-SPEC.md) et [66](66-SETTLEMENTS-PLACEMENT-NETWORK.md). Priorité haute : ces règles conditionnent la qualité des maisons, terriers, grottes, portes, ponts, escaliers, campements et ports.

## 1. Diagnostic de départ vérifié / à vérifier

- **Vérifié sur `main`** : `src/studio-core/types.ts` définit `ColliderComponent` (`box | sphere`, `solid | trigger`) et `TriggerVolumeComponent`; `src/studio-core/interaction-templates.ts` et `src/gameplay/templates.ts` offrent déjà `door`, `lever`, `collect`, `deliver` via états déclaratifs. `src/studio/viewport/placement-rules.ts` ne fait actuellement qu'une vérification simplifiée de proximité/pente/eau.
- **Vérifié sur `main`** : `src/structures/natural-structure.ts` indique que le terrain global demeure un heightfield ; tunnels/arcs sont représentés par maillages locaux et retouches de terrain réversibles. `src/structures/natural-view.ts` sépare les colliders source/compilés de la visibilité, à préserver.
- **À auditer obligatoirement en SET-0** : système runtime de collision du joueur, précision en 3D, portes actionnables, contact avec assets GLB, plateformes/escaliers/ponts, gestion des tunnels, sélection des triggers, navigation PNJ. Ne pas affirmer que la simple présence d'un composant `Collider` rend déjà un bâtiment physiquement solide.
- Références transversales : [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [15 — V3](15-STUDIO-DATA-SCHEMAS-V3.md), [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md), [24 — MINE](24-MINES-MULTILEVEL-LOW-RESOURCE.md).

## 2. Invariants non négociables

1. **Collision logique ≠ maillage visuel** : la collision ne dépend ni du LOD, ni des imposteurs, ni du culling/streaming graphique.
2. Entrée, fenêtre, tunnel et passage sont de **vrais espaces libres**, jamais un bloc invisible qui ferme l'ouverture.
3. Joueur, PNJ, bateau, roulade, saut et planage utilisent des règles de collision compatibles (couches/filtres explicites).
4. Les collisions **solides** et les **triggers d'interaction** sont deux familles séparées ; un panneau interactif n'est pas forcément obstacle.
5. Déplacement et collisions sur **pas de simulation fixe** cohérent avec `FrameClock` (30 Hz cible). Les taux d'image 30/20 FPS ne changent pas les résultats.
6. Déplacer/supprimer une porte, un pont ou un tunnel invalide **localement** collisions, navigation et accès ; jamais toute la carte.
7. Les entités hors secteur visible ne peuvent pas devenir traversables au moment où le joueur s'en approche rapidement : préchargement prioritaire de leur collision.
8. Etat `open/closed/locked` et objets interactifs sont enregistrés sur l'entité logique avec références stables, pas sur `THREE.Mesh`.
9. Les intérieurs sont **facultatifs**, et seulement les bâtiments `enterable` demandent une géométrie intérieure/navigabilité persistante.
10. Pas de système de physique général lourd si primitives / requêtes cinématiques suffisent ; Rapier reste optionnel et exige comparaison mesurée.

## 3. Contrat des volumes (cible à intégrer par migration validée)

| Catégorie | Primitive / traitement attendu | Exemples |
| --- | --- | --- |
| `solid_static` | AABB/OBB, capsule, convex simplifiée, compound limité | murs, maisons, tour, cheminées proches |
| `walkable_surface` | sol/plan incliné/polygones marchables | sols, quais, escaliers, passerelles, toit accessible |
| `one_way_surface` si gameplay requis | logique de traversée explicite | plateformes particulières, jamais implicitement |
| `portal` | ouverture avec linteau / largeur / hauteur, liaison nav | porte, entrée de grotte, arche |
| `dynamic_barrier` | collider lié à l'état, jamais uniquement visuel | porte, portail, trappe, pont-levis |
| `trigger` | volume non solide, filtré et débouncé | interaction, feu, zone d'abri, entrée de maison |
| `hazard` | zone d'effet déclarative sans physique complexe | feu de camp, four, lave si applicable |
| `decorative` | aucune collision ou proxy simplifié | herbes, petites pierres, fumée, fleurs |
| `terrain` | heightfield source + ouvertures locales explicites | sol, falaises |
| `cave_interior` | meshes rocheux locaux + proxy/triangles simples près du joueur | grotte traversable, pièce troglodyte |

**Attention :** aujourd'hui V3 ne sérialise que `box/sphere`. Les propositions `compound`, `portal`, surfaces marchables et volumes 3D doivent faire l'objet de contrats de schéma, validateurs, migrations et tests dédiés ; ne jamais ajouter des champs ad hoc qui seront rejetés par `src/studio-core/schema.ts`.

### Assemblages low-poly sans collider mesh complet

- Maison fermée : fondations/4 murs en boîtes orientées + toiture éventuellement non solide si inaccessible ; **retirer** du collider frontal l'emprise de la porte/fenêtre.
- Maison ouverte : segments de mur à gauche/droite/au-dessus de la porte, collision du cadre si pertinente, pas de boîte sur tout le volume.
- Dôme/terrier : approximation convexe ou compound extérieur, **percement de façade réel**, cheminée collider facultatif si non accessible.
- Tente/yourte : petit nombre de boîtes/convexes ; toile visuelle généralement non bloquante si la règle de gameplay le permet.
- Pont : surface marchable et garde-corps solides si présents ; dessous libre quand il est censé être traversable.
- Escaliers : primitive en pente ou marches optimisées (éviter contact chaotique marche par marche avec le joueur), connecteur nav entre niveaux.
- Remparts et palissades : segments solides répétables, portes et créneaux à géométrie d'ouverture réelle.
- Quai : dessus marchable, bord vers l'eau non invisible ; bateau et joueur peuvent atteindre l'embarquement.
- Moulin : base solide ; rotation des pales/roue visuelle ; volume de sécurité et collision des pièces mobiles seulement si gameplay le justifie.
- Feu de camp : zone de danger + interaction ; petits cailloux et flammes sans dizaines de colliders.

## 4. Contrôleur joueur : toutes locomotions

Pour un joueur hamster rond/roulant/planant, prendre une **capsule ou volume cinématique équivalent** (forme réelle à valider au vu de l'existant), avec filtre de couches et test de balayage (`sweep` / time-of-impact) avant intégration. Tester marche, course, roulade, saut, vol plané, nage, bateau et transitions au sol.

À **120 km/h**, le joueur parcourt environ **33,3 m/s**, donc **1,11 m par pas de 1/30 s**. Une simple requête de chevauchement après déplacement ou des rayons ponctuels peuvent manquer un mur, une palissade ou la façade d'un terrier.

**Cible** : `swept capsule` / déplacement continu, fractionnement local borné si requis, contact glissé sur les murs, réponse sûre aux coins, escalier/rampe, toit et dessous de pont. Garder le calcul au pas fixe ; n'ajouter des sous-pas qu'aux mouvements qui le nécessitent, avec benchmark.

Cas impératifs :
- glisser contre un mur au lieu de s'arrêter brutalement ou passer à travers ;
- sauter contre une porte fermée, planer vite vers un clocher/une falaise, rouler entre clôtures ;
- franchir correctement porte ouverte, pont, terrasse, escaliers, passage de grotte ;
- pas de téléportation sur le toit ou à l'intérieur quand les assets/LOD se chargent ;
- la forme et le cap du joueur tiennent compte de ses changements d'animation sans que le collider « chonky » devienne instable.

## 5. Portes et futures interactions

| Élément | États logiques possibles | Interaction future |
| --- | --- | --- |
| Porte habitation | closed, open, locked | ouvrir/fermer, entrer |
| Portail remparts | closed, open, locked | autorisation / levier |
| Coffre / caisse | closed, opened, empty | fouiller / collecter |
| Forge / atelier | inactive, working | fabriquer / commercer |
| Étal / boutique | open, closed, sold_out | vente/achat |
| Moulin | stopped, active | activer, livrer céréales |
| Feu de camp | off, lit | allumer, se reposer |
| Grotte | sealed, open | entrer, découvrir, collecter |
| Auberge | open, closed | dialogue, repos |
| Pêche / ponton | available, in_use | pêche, vente/achat |

**Conserver les templates déclaratifs actuels** (`onInteract`, `toggleState`, `giveItem`, `takeItem`, `showText`) et étendre uniquement par capacités génériques quand le gameplay l'exigera. Pas de scripts arbitraires dans la carte ni de moteur d'interactions par type de bâtiment.

Définir pour chaque prefab des **points nommés** : `entry.front`, `entry.back`, `window.0`, `dock.boarding`, `shop.counter`, `work.anvil`, `fire.safe_spot`, `exit.cave`; chacun possède pose, clearance, classe d'agent, interaction/connexion éventuelle. Ces points sont sources auteur versionnées, indépendants du LOD.

### Portes : synchronisation atomique

Une transition `closed → open` doit mettre à jour **état logique, collider de barrière, liens de navigation, animation et validation d'accès** d'une manière cohérente ; une animation lente ne doit pas rendre le portail traversable prématurément sans règle explicite. Prévoir `blocked` quand l'ouverture heurte un acteur, plutôt que téléporter.

## 6. Terriers, dômes et grottes de falaises

### 6.1 Terriers et dômes

- Une **maison-dôme de surface** peut être un mesh low-poly simplement posé, avec vrais segments de façade ouverts pour porte/fenêtre, entrée plate, cheminée et sol intérieur local facultatif.
- Une **habitation semi-enterrée** requiert une retouche contrôlée du relief et un masque local d'occupation ; ne pas cacher l'entrée sous le heightfield.
- Si l'intérieur est non jouable, l'entrée est explicitement `decorative` ou déclenche un comportement **défini et annoncé**, pas une ouverture faussement traversable.
- Le décor végétalisé ne reçoit pas un collider par touffe.

### 6.2 Grottes de falaise

- Le terrain global reste heightfield ; **un mesh noir collé contre la falaise ne suffit pas** pour une entrée jouable.
- Pour traverser : définir un portail en 3D + ouverture de terrain **locale, réversible et validée** (retouches/masque de triangles si réellement compatible avec le moteur) + maillage intérieur indépendant. Un retrait de matière qui ne retire que le mesh visuel mais laisse le collider heightfield **bloquerait le joueur** ; les deux dérivés doivent correspondre.
- **Ne pas supposer** que les retouches de terrain actuelles savent déjà découper une ouverture horizontale dans une falaise : SET-CAVE commence par un prototype de faisabilité avec solution explicite (patch local du terrain et de sa collision, ou galerie/entrée extérieure ajustée avec masquage contrôlé). Si impossible, bloquer le mode traversable et conserver seulement la variante décorative.
- Réutiliser le système des **structures naturelles** pour pierres/voûtes/transitions, la logique MINE pour les espaces souterrains pertinents, sans transformer toute l'île en voxels.
- Portail : aire dégagée de chaque côté, hauteur suffisante pour le hamster, détecteur entrée/sortie, occlusion et frustum intérieur ; chemins/escaliers adaptés aux terrasses.
- Grottes multi-étages : connections verticales explicites et nav locale par étage, interdiction de relier deux étages sur simple croisement XZ.
- Entrées près d'eau : vérifier immersion/niveau/courant avant autorisation d'un passage.

## 7. Navigation PNJ et portée des interactions

- Graphe stratégique des routes par secteur + navigation locale autour des obstacles, portes et escaliers. Les propriétés `walkable/canRoll/canSwim/canBoat` sont distinctes.
- Invalider localement les sous-graphes touchés quand une maison, un pont, une porte, un niveau de grotte ou le relief change.
- Un PNJ lointain ne calcule pas de pathfinding haute fréquence ; recalcul sur objectif/obstacle, dormance et LOD logique selon la politique existante.
- Portée d'interaction mesurée sur le point nommé avec **filtre de visibilité/occlusion** si requis ; pas d'achat à travers un mur ou depuis l'autre côté d'une falaise.
- Préparer les IDs d'objets, de portes et d'événements pour un futur serveur autoritaire ; **aucune réplication ni autorité réseau livrée par ce chantier documentaire**.

## 8. Streaming et performance

La source auteur contient des primitives logiques et volumes. Le compilateur construit les index spatiaux et les colliders utiles ; `ResourceBudgetManager` gère rendu et chargement **sans supprimer une collision nécessaire**. Priorité : (P0) joueur et collision proche, porte/pont/entrée prévus sur sa trajectoire, (P1) nav/interactions locales, (P2) décor, (P3) détail lointain.

- Broadphase par secteur + emprises traversant plusieurs secteurs ; narrowphase seulement contre candidats proches, sans scan de tous les bâtiments.
- Représentation collision stable sans coût proportionnel au nombre de triangles décoratifs.
- Preload dans la direction du déplacement rapide ; retenir les colliders tant qu'un acteur peut les rencontrer.
- Dynamic props physiques **uniquement** pour éléments réellement mobiles et importants ; pas de rigidbody individuel pour chaque toit, tente, tonneau, arbre, brin d'herbe.
- Mesurer frame p50/p95/p99, charge CPU collision, mémoire, nombre de colliders actifs, événements ratés, pics de chargement. Aucune cible de performance non mesurée n'est une garantie.

## 9. Matrice de qualification obligatoire

| Scénario | Contrôle |
| --- | --- |
| Habitation simple | arrêt sur murs, porte réelle, toiture, ouverture fenêtre |
| Maison mitoyenne | pas de chevauchement et sortie vers rue |
| Dôme/terrier | porte et sol corrects, cheminée visible, pas de collision de végétation |
| Tente/yourte | accès dégagé, pas de collision intempestive de toile |
| Camp forestier | feu/stockage/arbres ne bloquent pas le passage |
| Pont/escaliers | dessus et dessous, hauteur libre, multi-niveaux |
| Port | embarcadère, bord de quai, marche/bateau/nage |
| Porte/portail | collisions changent avec l'état ; pas de passage à travers une porte fermée |
| Grotte décorative | pas de promesse de traversée |
| Grotte jouable | collision du terrain réellement ouverte, entrée/sortie, plafond, parois |
| Grotte multi-étages | pas de lien XZ parasite entre étages |
| Mouvement rapide | vol ~120 km/h et roulade contre bâtiments sans tunneling |
| Dégradation 30/20 FPS | résultat physique et portée des interactions identiques |
| LOD/imposteur | même solidité et même interaction entre représentations |
| Edition terrain/bâtiment | invalidations locales et Undo/Redo sans collider fantôme |
| Rechargement sauvegarde | état porte/coffre et référents préservés |

Une scène n'est pas `TESTED` tant qu'une exécution automatisée prouve le résultat attendu. Le détail des gates est dans [68](68-SETTLEMENTS-ROADMAP-TESTS.md).
