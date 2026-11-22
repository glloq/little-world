# 108 — Rendu de l’eau partout : recherche, lot 1 livré et suite (LOW-RESOURCE)

> Complète [21 — Eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md) (§4 rendu, §5 LOD) et respecte [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md).
> **Statut** : lot WREN-1 **implémenté et testé sur branche** (tests unitaires + navigateur SwiftShader). **Temps GPU non qualifié** sur GPU intégré réel : les mesures ci-dessous sont des signaux de régression, pas une preuve de 30 FPS.

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

## 6. Suite proposée (spécifiée, non livrée)

| Lot | Contenu | Coût visé / garde-fous |
| --- | --- | --- |
| **WREN-2** | Brume/éclaboussures au pied des cascades (≤ 8 sprites par chute proche, shader partagé, sans ombre) ; caustiques analytiques sur le fond < 4 m près de la caméra ; berges **mouillées** (assombrissement dans `materialColor` via `waterEdgeDistance` à la construction des tuiles : **0 coût runtime**) | Budget eau du `ResourceBudgetManager`, désactivé en économie |
| **WREN-3** | Confluences et embouchures : flow map basse résolution par jonction, mélange rivière → mer (dégradé d’alpha et d’écume sur les derniers mètres) ; cascades lointaines = bande claire quasi statique (silhouette conservée, doc 21 §5) | Pas de surface coplanaire double, test de jonction |
| **WREN-4** | Météo : rides plus fortes et direction du vent (`EnvironmentState`), impacts de pluie procéduraux sur l’eau proche, teinte Fresnel tirée du ciel réel (uniforme du `sky-renderer`) au lieu d’une constante | Uniformes seulement, 0 particule CPU |
| **WREN-5** | Variantes de programme précompilées (`#define WATER_STATIC`) basculées par le budget pour retirer réellement le code animé sur GPU très faible / logiciel ; warm-up des variantes (doc 106) | Pas de compilation en jeu |
| **WREN-Q** | Qualification sur GPU intégré : temps GPU (timer WebGL2) vue baie/plage/rivière/cascade, overdraw de la mer translucide, comparaison `?water=static` | Obligatoire avant d’annoncer un coût GPU |

## 7. Règles pour la suite

- Toute eau intérieure passe par `createInlandWaterMaterial` (un programme) ; toute donnée de rendu se dérive du profil compilé (`CompiledWater`), jamais l’inverse.
- La mer proche doit rester **égale à la mer d’horizon** en eau profonde et au loin : ne pas assombrir `seabedAbsorb` sans traiter les coutures de tuiles/jupes.
- Mesurer avant/après chaque ajout avec `tools/water-views.json` ; SwiftShader exécutant toutes les branches, compter les instructions, pas seulement les `if`.
