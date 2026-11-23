# 109 — Routes, ponts et liaisons entre villes et villages

> Statut : **IMPLEMENTED / TESTED (Node)** — Volcan, génération par thèmes (`roads`) et Studio ;
> vérification visuelle en jeu et dans le Studio sous SwiftShader uniquement ; **non RELEASED**.
> Les îles publiées Val forestier, Trois vagues, Cimes et Moissons ne sont qu’auditées.

## 1. Constat mesuré

Les neuf routes du Volcan étaient des polylignes de 2 à 5 points saisies à la main dans
`tools/generate-island.mjs`, lissées par Catmull-Rom, posées **avant** le réseau hydrographique,
sans lire ni le relief ni l’eau. Les passerelles étaient ajoutées après coup, perpendiculaires
au ruisseau, donc de travers par rapport à la route.

`npm run audit:roads` mesure la ligne réellement dessinée (`centerline`) de chaque chemin :

| Volcan | Avant | Après |
|---|---|---|
| Longueur de chemins | 12 634 m | 17 200 m ⁶ |
| Sous l’eau (mer, lac, ruisseau sans tablier) | 1 216 m | 0 m ¹ |
| Au-delà de la pente du profil | 939 m | 125 m ² |
| Montée dans la ligne de pente (sans lacet) | 1 426 m | 337 m ² |
| Traversées de cours d’eau sans pont | 3 / 10 | 0 / 6 ³ |
| Ponts de travers par rapport au chemin (> 15°) | 6 | 0 |
| Ponts sans chemin | 4 | 1 ⁴ |
| Sol en dévers (> 22 % en travers) | 1 496 m | 540 m ⁵ |

¹ Les sentiers de presets qui passaient à gué sont replanifiés comme les autres (§3).
² Reste : piste du hameau de montagne (falaise du preset, aucun passage praticable), ruelles de port,
et sentiers repris au palier `steep` (32 %) : sur une plateforme taillée, la pente du sol *est* celle
du sentier, donc la mesure les compte.
³ Six traversées, toutes d’équerre, sur passerelle native (tablier ≥ 55 cm au-dessus de l’eau).
⁴ Pont du preset `river-bend`, sans chemin par conception du preset.
⁵ Sans terrassement les lacets donnaient 3 014 m de dévers ; le terrain est maintenant adapté à
la route (§5). Reste : ruelles et sentiers de presets non repris, abords de l’eau.

⁶ Dont 11 liaisons nouvelles (§6) vers les comptoirs, champs, camps et la mine, jusque-là coupés du
réseau : les 18 lieux sont atteignables à pied depuis le port.

Les quatre autres mondes (Val forestier, Trois vagues, Cimes, Moissons) n’ont que des rues et
accès courts issus de `planGroundRoute` : 0 m sous l’eau sauf 8 m sous le pont du Val forestier
(pont de preset à 20° du sentier). Ils ne sont pas modifiés par ce lot.

## 2. Planificateur de routes — `src/paths/road-planner.ts`

Pur, déterministe, borné, sans Three.js. Distinct de `planGroundRoute` (accès courts au sec),
dont la sortie reste identique pour les mondes existants.

- **Eau** : jamais de sol dans l’eau. Lacs et mer ne sont pas franchis. Un cours d’eau ne se
  franchit qu’à un **site de pont** (`bridgeSites`) : perpendiculaire au courant, deux berges au
  sec de hauteurs voisines (≤ 1 m), portée ≤ 16 m, approches droites de 5 m sur chaque rive, pas
  de chute sous le tablier (un torrent de versant se franchit en suivant la courbe de niveau).
- **Pente** : la pente *le long* de la route est plafonnée (`maxGrade`). Sur un versant raide la
  route part donc en traversée et fait des épingles ; elle ne monte jamais dans la ligne de pente.
  Le dévers (`maxTilt`) est plafonné et pénalisé.
- **Épingles** : chaque coin est un arc de cercle tangent aux deux branches ; une épingle prend
  jusqu’à 23 m sur chaque branche, soit un virage de 4 à 9 m de rayon, comme un vrai lacet. Le
  virage raccourcit la montée : le terrassement (§5) absorbe la différence.
- **Tracé lisible** : la recherche tient compte de la direction d’arrivée (24 directions) ; un
  virage coûte (`turnM`, un demi-tour = 4 × `turnM`), d’où de longues traversées et peu
  d’épingles au lieu d’un zigzag de grille. Les coins sont ensuite arrondis (rayon ≤ 9 m) ; les
  culées et leurs approches restent exactes.
- **Réseau** : `RoadContext.network` contient les routes déjà posées. Une nouvelle route les suit
  à coût réduit et **ne crée que la partie nouvelle**, raccordée sur l’axe existant (pas de route
  doublée).
- **Paliers** : `ROAD_POLICIES.road` (16 %), `trail` (24 %), `steep` (32 %) ; `planRoadTiered`
  essaie le plus doux d’abord. Sans passage : échec avec raison, jamais de passage inventé.

Sortie : `pieces` (tronçons au sec, coupés à chaque pont) et `bridges` (sites). Ces valeurs sont
des réglages visuels à calibrer, pas des seuils qualifiés.

## 3. Adaptateur projet — `src/studio-core/road-network.ts`

- `projectRoadContext(p, avoid?)` : relief final, eau compilée, cours d’eau franchissables.
- `roadPaths(id, road, …)` : chemins natifs `PathDefinition` (≤ 100 points chacun, non lissés :
  le tracé validé est celui qui est dessiné).
- `roadBridge(p, id, site, …)` : **passerelle native** (support V3 du doc 88, `settlement.bridge` +
  composant `Bridge`) dans l’axe de la route, avec son chemin de bois `supportId` — le joueur
  **et les habitants** la traversent — et une rampe terrassée sur chaque berge. Le tablier est
  plat, à `BRIDGE_CLEARANCE_M` (55 cm) au moins au-dessus de l’eau, jamais à fleur. Les culées
  sont posées là où la berge creusée a rejoint le sol naturel (le lit s’élargit avec la hauteur
  au-dessus de l’eau), sans quoi le remblai de la rampe serait repris par le creusement du lit.
  Les rampes sont appliquées après les lits de route : à la culée, le niveau du tablier l’emporte.
- `bridgePlacement` reste pour les passerelles GLB décoratives des presets.
- `repairPath(path, …)` : reprise d’un accès généré (sentiers de presets) noyé ou trop raide —
  replanifié entre ses deux extrémités, sinon recoupé au sec ; un accès sain n’est pas touché.

## 4. Volcan — `tools/generate-island.mjs`

Ordre : presets → **réseau hydrographique** (les lacs n’inondent plus les sentiers existants) →
**routes planifiées** (mêmes destinations qu’avant, embranchements sur le tronc commun) →
reprise des accès de presets défectueux → **terrassement des routes** (§5) → feux de camp de
bord de route.
Le site remarquable n° 3 (ermite et coffre) était entièrement sous la mer : déplacé de
(1500, 1150) à (1500, 980).

## 5. Terrain adapté à la route — `src/paths/road-grading.ts`

`planRoadGrading(path, env)` ne terrasse que **là où c’est nécessaire** : sol qui tombe de côté
sous la chaussée (> 10 % en travers) ou marche le long du tracé (> 25 cm contre le profil lissé).
Il produit des terrassements `corridor` (doc 104 §C4, la primitive commune — aucun second
système de relief) :

- niveau = profil en long lissé de la route, pente bornée : le déblai côté amont équilibre le
  remblai côté aval, l’axe bouge peu ;
- plateforme = largeur du chemin + accotements, talus de 2 à 7 m selon le dévers ;
- raccord progressif au terrain naturel aux deux bouts ;
- **jamais près de l’eau** (berges, culées, profils de rivière intacts), ni sous la mer, ni
  au-delà du budget de déblai/remblai (2,5 m à l’axe) : ces tronçons restent naturels ;
- ouvrages de 20 points au plus, identifiants `road:<chemin>:<n>` : une régénération ne remplace
  que les siens, les retouches de relief manuelles ne sont jamais touchées.

Volcan : 101 lits de route sur 7 841 m (déblai max 1,29 m, remblai max 1,75 m) et 12 rampes de pont (limite du format : 256).

**Extrémités** : un chemin n’a plus de bout arrondi là où un tablier prend le relais
(`deckEnds`), il débordait sur les planches.

**Rendu lointain** : une plateforme étroite n’est pas résolue par les LOD grossiers du relief, qui
recouvraient la route par endroits (pointillés vus à 150 m). Le matériau des chemins reçoit un
biais de profondeur (`polygonOffset`, `paths/path-view.ts`) : quelques millimètres de près,
croissant avec la distance comme l’erreur des LOD. Aucune passe ni texture ajoutée.
Seules les routes planifiées et les accès repris sont terrassés ; rues de village et sentiers de
presets sains gardent leur sol.

## 6. Génération automatique et Studio — `src/studio-core/road-links.ts`

`planRoadLinks(p)` relie au réseau principal chaque lieu que l’audit de circulation trouve isolé
(villages, comptoirs, champs, mines, courses, pistes, sites), du plus proche au plus lointain :
route carrossable (3 m, 16 %) pour les lieux habités ou marchands, sentier (2 m, 24 %) pour le
reste, palier plus raide en dernier recours. Il renvoie un plan (chemins, passerelles,
terrassements, échecs motivés) ; `applyRoadLinks` l’écrit. Rien n’est modifié avant.

- Départ : un point des chemins propres du lieu (raccord exact), sinon un sol libre à son bord —
  hors de son champ, hors de la chaussée de sa course.
- Les routes et leurs talus évitent bâtiments, champs, chaussées de course et pistes de ski.
- Spots de surf et de plongée : jamais forcés par une route (le relieur de chemins sert la plage).
- Graphe de circulation : une passerelle joint les deux tronçons coupés à ses culées
  (`buildCirculationGraph`), y compris les passerelles planifiées non encore écrites.

**Composition** : option `roads` de `MapRequirements` (composition 5 uniquement). L’étape
`CIRCULATION` pose d’abord les routes, puis le relieur historique sert ce qui reste. Sans
l’option, les mondes composés restent identiques. Les fiches de thème (`briefToRequirements`)
l’activent ; l’assistant de création a la case « Routes planifiées : ponts, lacets et terrain
adapté ».

**Studio**, panneau « Monde généré » :
- « Tracer les routes (ponts, lacets, terrassement) » — une seule transaction annulable ; les
  lits de route apparaissent dans la liste des terrassements, modifiables ou supprimables ;
- « Contrôler les routes » — totaux de l’audit et pires chemins, avec leurs coordonnées.

Mesures sur trois thèmes composés (chemins historiques → routes planifiées) :

| Thème | Lieux atteignables | Dévers | Ligne de pente |
|---|---|---|---|
| Île du Volcan (thème) | 30/33 → 32/33 | 599 m → 150 m | 107 m → 176 m |
| Vallons des Moissons | 40/40 → 40/40 | 116 m → 12 m | 82 m → 0 m |
| Massif des Neiges | 16/20 → 20/20 | 2 639 m → 192 m | 362 m → 45 m |

## 7. Audit — `src/paths/road-audit.ts`, `npm run audit:roads`

`auditRoads` mesure par chemin : mètres sous l’eau, au-delà de la pente du profil, en dévers,
dans la ligne de pente, et par traversée : biais, pont présent, orientation du pont, ponts
orphelins. `tests/road-planner.test.mjs` verrouille le Volcan (0 m de route sous l’eau, aucun
pont de travers, aucune traversée sans pont).

Limites connues :

- **Presets** (`landscape-presets.ts`, `bridgeOver`) : non modifiés pour ne pas changer les
  fixtures ; c’est le générateur du Volcan qui replanifie leurs accès à gué. Le Val forestier
  garde donc son pont à 20° du sentier.
- **Grands ponts** (> 16 m), viaducs, gués et tunnels : hors lot (doc 88).
- **Rues de village et accès de sites** (`planGroundRoute`) : inchangés.
- **Ponts de presets** (`bridgeOver`, pierre ou arche GLB, sans chemin) : seulement remontés
  au-dessus de l’eau par le générateur du Volcan ; pas de support de navigation.
- **Routage des habitants** : le pont est un support valide (testé : tablier praticable, culées
  de niveau) ; un trajet complet d’habitant sur une passerelle de route n’a pas été rejoué en jeu.
- `DRESSING_VERSION` non augmenté : la génération de végétation est inchangée, seules les
  emprises de routes du Volcan ont bougé.
- Composition d’un thème : +3 à +9 s avec `roads`. Génération du Volcan : ~20 s → ~48 s (recherche de routes) ; temps GPU non concerné.
