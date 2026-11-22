# 108 — Rendu de l’eau partout : recherche, lot 1 livré et suite (LOW-RESOURCE)

> Complète [21 — Eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md) (§4 rendu, §5 LOD) et respecte [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md).
> **Statut** : lots WREN-1 (rendu) et WREN-2 (cours d’eau réalistes, courant, réseau hydrographique) **implémentés et testés** (tests unitaires + navigateur SwiftShader). WREN-1 a été fusionné dans `main` (#114). **Temps GPU non qualifié** sur GPU intégré réel : les mesures ci-dessous sont des signaux de régression, pas une preuve de 30 FPS.

## 1. État initial (main, 21/11/2026)

Inventaire du code réel avant ce lot :

| Eau | Code | Rendu constaté |
| --- | --- | --- |
| Rivières (`WaterBody` sans `kind`) | `world.ts::refreshWater` + `water/geometry.ts::waterRibbonData` | Ruban plat, `MeshLambertMaterial` **opaque** couleur unique `0x6daeb5`, bords nets posés 12 cm au-dessus de la berge creusée, aucune animation, aucune idée de courant. |
| Cascades (`falls`) | même ruban : 2 points distants de 5 cm | **Mur vertical** de la même couleur turquoise que la rivière ; illisible comme eau qui tombe ; pas d’écume au pied. |
| Lacs (`kind:'lake'`) | `lakeSurfaceData` (ear clipping) | Polygone plat uni, rivage dur. |
| Mer proche | `horizon-view.ts` `NearSea` : quads par tuile, Lambert **transparent 0,9** | Aplat uniforme `SEA_COLOR`, fond marin invisible, aucune ligne de rivage, coutures visibles en eau profonde (jupes de tuiles, zones couvertes par l’horizon). |
| Mer lointaine | `OceanRing` + sommets d’horizon plaqués au niveau de la mer | Aplat opaque `SEA_COLOR` (correct, conservé). |
| Surf | `surf-water-material.ts` (shader dédié) | Hors périmètre de ce lot, inchangé (seule la chaîne Lambert par sommet est exportée pour être partagée). |
| Sous l’eau | `underwater-view.ts` (brouillard physique caméra) | Inchangé. |

Bonne base existante réutilisée : couleurs de fond marin par profondeur (`geography/depth-zones.ts`), profil hydrographique compilé (`water/profile.ts` : niveaux, distance curviligne, cascades explicites), shader de surf éclairé par sommet.

## 2. Recherche : techniques retenues / écartées pour un GPU intégré

Critère : **aucune passe supplémentaire**, aucune texture/rendu cible, coût par pixel borné, la physique (`waterSurface`, profondeur, courant, nage, bateau) ne lit jamais le rendu.

| Technique | Coût | Décision |
| --- | --- | --- |
| Réflexion planaire (2ᵉ caméra), SSR, réfraction multi-passe, FFT, fluide | 2× la scène ou passes plein écran | **Écarté** (doc 21 §4). |
| Texture de profondeur (depth prepass) pour l’écume de rivage | 1 passe + texture | **Écarté** : remplacé par l’absorption peinte sur le terrain (ci-dessous). |
| **Absorption par profondeur peinte sur le fond** (terrain sous le niveau de la mer teinté puis absorbé vers la couleur de mer) + surface de mer translucide | quelques ALU par pixel de fond marin, 0 texture | **Retenu** : hauts-fonds turquoise, sable visible, profondeur lisible. L’eau profonde converge **exactement** vers `SEA_COLOR` → aucune couture avec l’horizon/anneau océanique, les jupes ou les tuiles non construites. |
| **Ligne d’écume de rivage sur le terrain** (bande autour du niveau de la mer, largeur horizontale constante via la pente par sommet, va-et-vient ≈ 7 s) | 1 `sin` + 2 `smoothstep`, seulement à ±0,6 m du niveau | **Retenu**. |
| **Attributs de flux par sommet** sur les rubans (distance aval, position berge, « rush » = pente de la ligne d’eau, écume précalculée) | 4 floats / sommet, calcul unique à la compilation | **Retenu** : stries qui suivent le courant, rapides, cascade, bassin. Données dérivées du profil compilé, jamais sauvegardées. |
| Flow map texture (jonctions, tourbillons) | 1 texture/rivière | **Reporté** (lot WREN-3) : utile aux confluences seulement. |
| Bruit de valeur procédural (hash) | 4 hash / octave | Retenu **uniquement** sur l’eau intérieure (petite surface écran) ; **supprimé** de la mer (grande surface) au profit d’une normale de ride analytique (2 `sin` + 2 `cos`). |
| Reflet du soleil (glint) analytique | `reflect` + puissance par carrés successifs | **Retenu**, détail seulement près de la caméra, 0 à budget nul. |
| Fresnel « ciel » (opacité et teinte ciel aux angles rasants) | 1 division + 2 produits | **Retenu** (remplace une réflexion). |
| Éclairage Lambert par sommet pour la mer plane | supprime le Lambert par pixel | **Retenu** : la normale de la mer est constante, l’éclairage par sommet est exact (mêmes termes que `MeshLambertMaterial`, chaîne partagée avec le surf). C’est ce qui **compense** le coût des nouveaux effets. |
| Particules de brume/éclaboussures au pied des cascades | sprites, transparence | **Reporté** (WREN-2), local, facultatif, benchmarké. |
| Caustiques analytiques sur le fond proche | ~6 ALU / pixel de fond < 4 m | **Reporté** (WREN-2), derrière le budget. |

Leçon mesurée : **SwiftShader exécute toutes les branches** (même jamais prises). Un `if` ne suffit donc pas à rendre un code « gratuit » sur le rasteriseur logiciel de la CI ; le lot réduit le **nombre absolu** d’instructions (bruit basse fréquence, pente et distance calculés par sommet, motif d’écume en sinus). Sur GPU réel, les branches cohérentes (eau lointaine, terrain hors mer) sont effectivement sautées — **à vérifier** sur matériel de référence.

## 3. Lot WREN-1 livré (code)

Un seul module : `src/render/water-look.ts` (uniformes partagés `uWaterTime`, `uWaterDetail`, `uWaterSea`, `uWaterFar`).

1. **Rivières, lacs, cascades** — `createInlandWaterMaterial()` : **un seul matériau / programme** pour toute l’eau intérieure (Lambert de three + lignes injectées, donc mêmes lumières/brouillard/tone mapping).
   - Centre profond / berges claires, **berges fondues** (alpha → 0 sur les 14 % extérieurs : plus de liseré dur), Fresnel ciel.
   - Stries étirées dans le sens du courant, vitesse selon la pente (0,45 → 5,5 m/s), **eau blanche** dans les rapides et sur les cascades.
   - Lacs : rides isotropes lentes, bande de rive de 3 m (`LAKE_SHORE_BAND`) calculée par sommet (`lakeRenderData`, subdivision barycentrique dont la maille grandit avec l’aire — ≈ 1 100 triangles pour une mare de 60 × 40 m, ≈ 6 900 pour un lac de 2,4 × 1,6 km au test, ≤ 48² sous-triangles par triangle source ; surface plane donc sans fissure).
   - `forceSinglePass` : un matériau transparent `DoubleSide` serait sinon dessiné **deux fois** par three.js (+1 draw call par masse d’eau).
2. **Cascades** — `waterRibbonData` remplace le mur vertical par une **feuille courbe** de 6 rangées (`FALL_SHEET_ROWS`) : jet parabolique (décalage aval ∝ √hauteur, ≤ 2,5 m), léger évasement, écume croissante vers le bas, **bassin d’écume** sous la chute (rayon `max(6 m, 1,6 × largeur)`), lèvre blanchie en amont. La distance `along` continue sur la hauteur de chute : les stries ne sautent pas.
3. **Mer proche** — `createSeaSurfaceMaterial()` (ShaderMaterial, éclairage par sommet) : translucide en regardant vers le bas (0,6), opaque aux angles rasants et au-delà de 80 → 420 m (= mer d’horizon), rides et reflet solaire près de la caméra.
4. **Fond marin et rivage** — `createTerrainMaterial()` (programme `terrain-geomorph-v2-water`) : teinte des hauts-fonds, absorption exponentielle vers `SEA_COLOR`, ligne d’écume mobile ; terrain hors mer : une comparaison.
5. **Budget** — `world.setDetail(level, economy)` → `waterDetailFor` : 1 / 0,85 / 0,5 / 0 ; `economy` = couleurs statiques seulement (profondeur, berges, écume précalculée restent). `?water=static|full` force le niveau pour les captures/bench.

**Inchangé** : physique et volumes d’eau, `waterSurface`, nage/plongée/bateau, rivière de la vallée legacy (fixture), shader de surf, horizon/anneau océanique, sauvegardes, schémas V3 (aucune donnée d’eau ajoutée aux sources).

## 4. Mesures (SwiftShader, 960×540, qualité haute, île 4 × 3 km)

`tools/water-views.json` (points de vue reproductibles, utilisables avec `node tools/capture-world-views.mjs <url> <dossier> tools/water-views.json`). Images avant/après : `docs/images/water-v1/`.

FPS moyen sur 12 s (≈ 70–100 images), deux exécutions par configuration ; draw calls identiques à `main` :

| Vue | main | WREN-1 (détail plein) | Draw calls |
| --- | --- | --- | --- |
| Baie (mer + embouchure) | 6,61–6,71 | 6,53–6,63 | 98 = 98 |
| Plage | 8,02–8,19 | 8,55–8,79 | 100 = 100 |
| Rivière proche | 7,37–7,49 | 7,11–7,71 | 88 = 88 |

Lecture : **parité dans le bruit de mesure** (± 5 %). Étapes intermédiaires instructives : première version +12–15 % de temps de frame (bruit + `dFdx` dans le shader du terrain, exécutés partout par SwiftShader), puis +1 draw call par eau (double passe `DoubleSide`), corrigés avant livraison. Triangles : +≈ 250 sur la vue rivière (mare subdivisée, feuille de cascade). Aucun brouillard ajouté.

## 5. Constats sur le contenu (hors rendu)

- **La cascade de la gorge (`ls-waterfall-gorge-1.falls-river`) s’arrête 3 m après la chute** : la feuille tombe sur un sol presque sec, le bassin d’écume n’a pas la place d’exister. À corriger dans le générateur (`studio-core/world-terrace-falls.ts`) : prolonger le tronçon aval et/ou creuser un bassin (lac) au pied, avec mesure avant/après et `DRESSING_VERSION` si l’occupation change.
- Rivière principale (`ls-river-bend-1.river`) : rapides détectés près de l’embouchure (pente > 12 %) — cohérent avec le relief, à confirmer artistiquement.
- Restes du raccord surf ↔ mer proche : quelques pointillés aux bords des rectangles de surf (déjà présents sur `main`, désormais atténués) ; à traiter avec le lot surf.

## 6. Lot WREN-2 : des cours d’eau qui ressemblent à des cours d’eau

Constat de départ (après WREN-1) : toutes les cartes n’ont qu’**une à deux rivières** (île du volcan : un méandre de 8 m posé par préréglage, une rivière de gorge, une mare), de **largeur constante**, sans affluent, au lit en U régulier bordé d’un mur de 2 m quand le terrain est plus haut ; les bords sont de la **boue brune** sur 10–20 m (humidité > 0,88) et le **lit sous l’eau est classé « herbe »**. Rien ne pousse le nageur.

### 7. Courant (gameplay)

- `water/profile.ts` : `riverCurrentProfile` dérive une vitesse de surface par point de la **pente de la ligne d’eau lissée sur ± 12 m** : `0,25 + 9·√pente` m/s, plafonnée à 3,2 (`RIVER_CURRENT`). Lacs et mer : 0. Au bord du lit, il ne reste que 30 % du courant (on s’échappe par la rive). Chaque `WaterHit` porte `speed`.
- `terrain.ts::waterCurrentAt(x,z)` : vecteur (m/s) déterministe, fonction de la seule position.
- `player.ts` (nage/plongée, pas fixe 30 Hz) : la cible de vitesse inclut le courant (60 % en plongée, `SWIM.currentDive`) ; dans un bief calme on remonte en nageant, dans un rapide on recule, au bord d’une cascade on est emporté. `boat.ts` : la coque dérive, jamais poussée sur une berge (`canMove`).
- Hors lot : bouchon de pêche et objets lâchés (pas d’objet flottant physique aujourd’hui).

### 8. Réseau hydrographique dendritique (génération automatique)

`world-production/river-network.ts::planRiverNetwork` — hydrologie classique sur une grille bornée (24 m pour l’île, ≈ 21 000 cellules, < 1 s) :
1. **remplissage des cuvettes** par priority-flood (avec une gigue déterministe de ± 0,3 m pour casser les lignes droites du D8 sur les pentes planes) ;
2. **D8** sur le relief rempli et **aire drainée** cumulée ;
3. **lacs dans les vraies cuvettes** (≥ 1,5 m) au niveau de débordement, rivage trouvé par 64 rayons sur le vrai relief, jamais sur une route, un champ ou un village (`keepDry`) ; un **exutoire** repart du point de débordement (`from:{kind:'lake'}`) ;
4. **chenaux** au-delà de `minAreaM2` (pas sur les plats remplis hors lac, pas sur les zones habitées) ; découpage aux confluences selon la **règle de Hack** (le cours principal continue vers la plus grande aire, les autres deviennent **affluents** `to:{kind:'river'}` qui se terminent exactement sur le tracé de leur rivière) ; ordre de Strahler en diagnostic ;
5. **largeur ∝ √aire** (`streamWidth` : 1,4 → 12 m), profondeur dérivée ; lissage de Chaikin, **méandres doux** (λ ≈ 14 largeurs) qui ne montent jamais sur une berge ;
6. chaque cours d’eau est **recompilé par le compilateur WATER partagé** ; un échec retire le cours d’eau et ses affluents.

Île du volcan (`tools/generate-island.mjs`, après les routes) : **28 cours d’eau, 7 lacs** (dont un **lac de cratère** sur le volcan), plusieurs systèmes à affluents, **10 passerelles** (`structure.bridge_wooden_arch`, étirées selon la largeur) là où une route croise un ruisseau. Sources rééditables dans le Studio (eau V3 ordinaire), aucune nouvelle donnée de schéma. Seules deux pierres décoratives se retrouvent dans l’eau (un rocher dans le lac du cratère, une pierre de ruine dans un ruisseau).

Essai écarté : creuser des vallées (élément `valley`) le long des seuils. La vallée à profondeur constante surcreuse l’amont et crée de nouveaux seuils (test à l’appui) ; les lacs de cuvette + les berges en V (§9) règlent le problème proprement.

### 9. Lit organique (toutes les cartes, dérivé à la compilation)

`water/profile.ts::shapeChannel` (déterministe par identifiant, physique = rendu = creusement) :
- **largeur qui respire** : mouilles plus larges, radiers plus étroits (`CHANNEL_SHAPE`, 0,7 → 1,18 × la largeur auteur), **largeur auteur conservée aux deux extrémités** (liaisons, ponts) ;
- **thalweg décalé vers l’extérieur des courbes** (jusqu’à 0,28 largeur) : fond profond côté extérieur, **banc de galets** côté intérieur ;
- `terrain.ts::carveWaterBeds` : **berges en V** dont la largeur croît avec la hauteur du terrain au-dessus de l’eau (≈ 32°, portée `bankM` calculée par cours d’eau, ≤ 16 m) au lieu d’un mur de 2 m ; ligne de berge légèrement irrégulière (± 0,8 m).
- `DRESSING_VERSION` 7 → 8 (le sol change près de l’eau).

### 10. Lits et berges sur le terrain (0 coût runtime)

`geography/classify.ts::materialAt` : **galets** dans le lit des rivières et sur une marge de 1 m au ras de l’eau, **sable** au fond des lacs, **herbe humide** (verte) le long des berges ; la **boue** est réservée aux vrais marais (> 12 m d’une rivière). Calculé à la construction des tuiles, comme toutes les couleurs du sol.

### 11. Pierres de rivière

`render/river-stones.ts` : galets de berge, **blocs dans les radiers et rapides** (seulement où l’eau est assez peu profonde pour les montrer), cailloutis sur les rives convexes, blocs autour des bassins de cascade, pierres de rive des lacs. Dérivés du profil compilé (déterministes), **un seul `InstancedMesh`** (roche 20 triangles, Lambert plat, couleur par instance, sans ombre), rangés par cellules de 48 m et envoyés au GPU seulement dans un rayon de 140 m quand le joueur s’est déplacé de plus de 6 m. Budget par niveau de présentation (`riverStoneBudget` : 1500 / 1000 / 500 / 0, économie 300). Décoratives : **aucune collision**.

### 12. Draw calls de l’eau intérieure

Les rubans d’eau sont **regroupés par cellule de 512 m** (premier point de chaque eau) : un réseau dense coûte quelques appels de rendu, une retouche Studio ne reconstruit que les cellules touchées. Les lacs utilisent désormais un **anneau de rive + intérieur à sommets partagés** (la subdivision précédente laissait des micro-trous de jonction en T visibles en pointillés).

### Mesures WREN-2 (SwiftShader, 960×540, qualité haute)

| Vue | main (avant WREN-1) | WREN-2 | Draw calls main → WREN-2 |
| --- | --- | --- | --- |
| Baie | 6,6–6,7 FPS | 7,2–7,3 | 98 → 101 |
| Plage | 8,0–8,2 | 8,5–9,2 | 100 → 107 |
| Rivière proche | 7,4–7,5 | 7,8–8,3 | 88 → 93 |
| Confluence (nouvelle) | — | 7,5–8,2 | 82 |

Lecture : FPS au moins équivalents (le contenu a changé : lacs et ruisseaux remplacent une partie de la végétation) ; **+3 à +7 draw calls** (pierres, passerelles, groupes d’eau, nouveaux lacs). Temps GPU réel **non qualifié**. Captures avant/après : `docs/images/water-v2/` (points de vue `tools/water-network-views.json`).

Tests : `tests/water-current.test.mjs` (courant, nageur, bateau), `tests/river-network.test.mjs` (affluents, mer, lac de cuvette, zones évitées, déterminisme), `tests/water-channel.test.mjs` (largeur, thalweg, berges en V, pierres), plus les tests navigateur Eau/Studio et île.

### Limites connues

- Les rubans d’un affluent et de sa rivière se recouvrent sur quelques mètres à la confluence (deux surfaces translucides) : à rogner côté rendu (WREN-3).
- Le relief de l’île n’a pas été façonné par l’eau : l’essentiel des ruisseaux reste court (bassins côtiers de 0,1–0,9 km²). Un relief généré avec érosion donnerait des bassins plus grands.
- Le planificateur n’est branché que sur l’île du volcan ; l’exposer comme option **opt-in V5** de l’étape HYDRO de `COMPOSITION_STAGES` (doc 104) pour les autres îles reste à faire.
- Pierres sans collision ; objets flottants (bouchon) sans courant.

## 13. Suite proposée (spécifiée, non livrée)

| Lot | Contenu | Coût visé / garde-fous |
| --- | --- | --- |
| **WREN-3** | Confluences et embouchures : rubans d’affluent rognés à la berge de la rivière, mélange rivière → mer (alpha et écume sur les derniers mètres), brume au pied des cascades (≤ 8 sprites proches), cascades lointaines = bande claire quasi statique (doc 21 §5) | Pas de surface coplanaire double, test de jonction |
| **WREN-4** | Météo : rides et direction du vent (`EnvironmentState`), impacts de pluie procéduraux, teinte Fresnel tirée du ciel réel ; caustiques analytiques sur le fond proche | Uniformes seulement, 0 particule CPU |
| **WREN-5** | Variantes de programme précompilées (`#define WATER_STATIC`) basculées par le budget ; warm-up des variantes (doc 106) | Pas de compilation en jeu |
| **HYD-3** | Réseau dendritique en option opt-in V5 de `COMPOSITION_STAGES` ; relief avec érosion légère pour des bassins plus grands ; écume localisée autour des blocs | Mondes existants identiques sans l’option |
| **WREN-Q** | Qualification sur GPU intégré : temps GPU vue baie/plage/rivière/cascade/confluence, overdraw de la mer translucide, comparaison `?water=static` | Obligatoire avant d’annoncer un coût GPU |

## 14. Règles pour la suite

- Toute eau intérieure passe par `createInlandWaterMaterial` (un programme) ; toute donnée de rendu **et de gameplay** (courant, pierres, berges) se dérive du profil compilé (`CompiledWater`), jamais l’inverse.
- Un cours d’eau généré passe le compilateur WATER partagé ; un lac généré ne recouvre jamais une route, un champ ou un bâtiment.
- La mer proche doit rester **égale à la mer d’horizon** en eau profonde et au loin.
- Mesurer avant/après chaque ajout avec `tools/water-views.json` et `tools/water-network-views.json` ; SwiftShader exécutant toutes les branches, compter les instructions, pas seulement les `if`.
