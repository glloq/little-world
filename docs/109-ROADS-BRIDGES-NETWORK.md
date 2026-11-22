# 109 — Routes, ponts et liaisons entre villes et villages

> Statut : **IMPLEMENTED / TESTED (Node)** sur l’île du Volcan ; vérification visuelle en jeu
> sous SwiftShader uniquement ; **non RELEASED**. Les autres mondes ne sont qu’audités.

## 1. Constat mesuré

Les neuf routes du Volcan étaient des polylignes de 2 à 5 points saisies à la main dans
`tools/generate-island.mjs`, lissées par Catmull-Rom, posées **avant** le réseau hydrographique,
sans lire ni le relief ni l’eau. Les passerelles étaient ajoutées après coup, perpendiculaires
au ruisseau, donc de travers par rapport à la route.

`npm run audit:roads` mesure la ligne réellement dessinée (`centerline`) de chaque chemin :

| Volcan | Avant | Après |
|---|---|---|
| Longueur de chemins | 12 634 m | 13 968 m |
| Sous l’eau (mer, lac, ruisseau sans tablier) | 1 216 m | 15 m ¹ |
| Au-delà de la pente du profil | 939 m | 115 m ² |
| Montée dans la ligne de pente (sans lacet) | 1 426 m | 300 m ² |
| Traversées de cours d’eau sans pont | 3 / 10 | 0 / 3 ³ |
| Ponts de travers par rapport au chemin (> 15°) | 6 | 0 |
| Ponts sans chemin | 4 | 1 ⁴ |
| Sol en dévers (> 22 % en travers) | 1 496 m | 514 m ⁵ |

¹ Ruban sous trois passerelles de chemins de presets (non découpés, voir §6).
² Reste : piste du hameau de montagne (falaise du preset, aucun passage praticable), ruelles de port,
et sentiers repris au palier `steep` (32 %) : sur une plateforme taillée, la pente du sol *est* celle
du sentier, donc la mesure les compte.
³ Les routes planifiées s’arrêtent aux culées : elles ne comptent plus comme traversées.
⁴ Pont du preset `river-bend`, sans chemin par conception du preset.
⁵ Sans terrassement les lacets donnaient 3 014 m de dévers ; le terrain est maintenant adapté à
la route (§5). Reste : ruelles et sentiers de presets non repris, abords de l’eau.

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
- `bridgePlacement(site, height)` : pose d’une passerelle GLB **dans l’axe de la route**, étirée à
  la portée, tablier à la hauteur de la berge basse.
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

Volcan : 73 ouvrages sur 5 993 m, déblai max 2,09 m, remblai max 1,61 m (limite du format : 256).
Seules les routes planifiées et les accès repris sont terrassés ; rues de village et sentiers de
presets sains gardent leur sol.

## 6. Audit — `src/paths/road-audit.ts`, `npm run audit:roads`

`auditRoads` mesure par chemin : mètres sous l’eau, au-delà de la pente du profil, en dévers,
dans la ligne de pente, et par traversée : biais, pont présent, orientation du pont, ponts
orphelins. `tests/road-planner.test.mjs` verrouille le Volcan (0 m de route sous l’eau, aucun
pont de travers, aucune traversée sans pont).

Limites connues :

- **Chemins de presets** : leurs traversées restent en biais (pont aligné sur le chemin, ruban
  non coupé dessous). Les presets eux-mêmes (`landscape-presets.ts`, `bridgeOver`) ne sont pas
  modifiés pour ne pas changer les fixtures.
- **Grands ponts** (> 16 m), viaducs, gués et tunnels : hors lot (doc 88).
- **Collision des passerelles GLB** : inchangée (boîte du registre).
- **Composition V5** (`planCirculationLinks`) et **Studio** : toujours sur `planGroundRoute` ;
  le planificateur n’y est pas encore branché (les mondes composés restent identiques octet
  par octet). Les diagnostics de l’audit ne sont pas encore affichés dans le Studio. **Lot suivant décidé :**
  brancher planificateur, ponts et terrassement dans le Studio puis dans `COMPOSITION_STAGES`.
- `DRESSING_VERSION` non augmenté : la génération de végétation est inchangée, seules les
  emprises de routes du Volcan ont bougé.
- Génération du Volcan : ~20 s → ~37 s (recherche de routes) ; temps GPU non concerné.
