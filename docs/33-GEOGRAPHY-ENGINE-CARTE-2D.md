# 33 — Geography Engine, éditeur de carte 2D par couches et habillage naturel

**Statut : implémenté et testé sur la branche `claude/bold-tesla-b0pe7k` (lots G1 à G7). Non publié sur `main`. Mesures : Chromium/SwiftShader uniquement — aucune qualification sur GPU réel.**

Ce document décrit la refonte évolutive du générateur géographique et de l'éditeur de cartes de Little World Studio. Il complète [03 — Génération](03-WORLD-GENERATION.md), [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md), [17 — Horizon](17-DISTANT-VIEW-RENDERING.md), [18 — Herbes](18-GRASS-LOW-RESOURCE.md) et [22 — Budget](22-RESOURCE-BUDGET-MANAGER.md). Il n'introduit **ni second éditeur, ni second système de sauvegarde, ni seconde autorité de terrain, ni voxels, ni backend**.

## 1. Architecture

```text
Sources V3 (projet Studio, IndexedDB / ZIP)
  world.terrain ............ générateur versionné : legacy-valley | island v1 | archipelago v1
  chunks[*].terrainEdits ... retouches de relief (inchangées)
  chunks[*].biomeEdits ..... traits de biotope historiques (toujours honorés)
  chunks[*].layers ......... NOUVEAU : masques de corrections 16×16 par secteur et par couche
  libraries.water/paths/zones, entités (bâtiments)
        │
        ▼
Geography Engine (src/geography/*, pur, déterministe, sans rendu)
  archipelagoField ........ hauteur + côte + falaise + volcanisme (GeneratorField)
  classifyPoint ........... pente, courbure, humidité, géologie, biome, matériau, occupation
  habitatOf ............... densités de végétation/rochers avec exclusions
  generateDressingCell .... habillage naturel par cellule (graine + cellule + classification)
        │                       ▲ un seul createGeoContext pour tous les consommateurs
        ├── runtime (terrain.ts, engine.ts) : couleurs des tuiles et de l'horizon, écologie, habillage
        ├── Studio 2D (studio-core/geo-context.ts) : tuiles de carte, lecture au curseur, aperçus
        └── compilation : masques transportés dans les paquets de secteurs
```

Invariants garantis par le code et les tests :

| Invariant | Mécanisme | Preuve |
| --- | --- | --- |
| Le LOD ne change jamais la logique | La classification ne dépend que des sources ; tuiles, horizon et habillage n'en sont que des consommateurs | `geo-map.test` : parité carte 2D / runtime sur 300 points |
| Indépendant de l'ordre de chargement des secteurs | Fonctions pures, bruit indexé par coordonnées monde, graines par forme/cellule | `geography.test`, `dressing.test` (génération dans deux ordres) |
| Les corrections auteur l'emportent | Masque de couche > trait de biotope historique > valeur générée | `geography.test` (priorités) |
| Aucune perte silencieuse | Restauration locale avec aperçu chiffré, une transaction annulable ; corrections hors zone conservées | `geography.test`, `test-geomap-browser` |
| Pas de modification permanente du terrain par le joueur | Le moteur ne lit que des sources auteur | — |
| Heightfield uniquement | `archipelagoField` renvoie une hauteur par (x, z) | — |

## 2. Contrats de couches

| Couche | Mode | Source | Valeurs |
| --- | --- | --- | --- |
| Terre / mer | éditable (formes) | `world.terrain` (contours) | calculée : côte, profondeur |
| Altitude | éditable (formes, pinceaux de relief) | générateur + `terrainEdits` | mètres, courbes 10/20/100 m selon le zoom |
| Pentes / courbure | calculée | dérivée du relief | pente (montée/2 m vers l'est, convention des tuiles 3D), laplacien |
| Géologie | éditable | masque `geology` | sol meuble, sable, roche, basalte, cendre, éboulis |
| Humidité | corrections | masque `moisture` (`0`…`9`) | drainage simplifié 0..1 |
| Biomes | éditable | masque `biome` (+ traits historiques) | prairie, forêt, marais, montagne, volcanique, lande, littoral, rivière, eau calme, village |
| Matériaux | corrections | masque `material` | 11 revêtements (herbe … boue) |
| Occupation | éditable | masque `occupation` + zones + chemins + bâtiments | bâti, agricole, chemin, réservé, sans végétation |

Les palettes de diagnostic de la carte (`layers.ts`) sont **distinctes** de la palette de rendu du jeu (`materials.ts`).

## 3. Formats, versions et migrations

- `world.terrain = {kind:'archipelago', version:1, archipelago}` : validation stricte (`parseArchipelago`) — 1 à 12 terres, contours 3 à 64 points, 64 formes, lignes 2 à 32 points, bornes par champ, identifiants uniques, cratère cohérent ; champ facultatif `variant` (entier) par forme. Une version inconnue est refusée.
- `chunks[*].layers` : chaînes de 256 caractères (`.` = valeur générée). Une couche vide est supprimée ; un secteur sans correction n'a pas de champ `layers`. Champs **facultatifs** : les projets V3 existants, la vallée historique (V1/V2 migrés) et l'île publiée restent valides **sans migration**.
- Monde compilé : `CompiledChunkData.layers` facultatif, `COMPILER_VERSION = little-world-descriptors-6` ; le lecteur accepte les mondes v5 (île régénérée en v6 sur cette branche).
- Archive ZIP : les masques voyagent avec leurs secteurs (aller-retour testé).
- Presets de relief : fichier `{format:'little-world-relief-preset', version:1, archipelago}` validé à l'import.

## 4. Génération du relief (archipel v1)

Composition en cinq échelles, ordre fixe : (1) masses terrestres = contours de contrôle + bruit de côte reproductible ; (2) plaines et collines de fond ; (3) formes majeures (plateaux → massifs/collines/crêtes → cuvettes/vallées → volcans avec cratère et ravines) ; (4) détail local fbm ; (5) habillage géologique dérivé, jamais stocké. Les falaises varient le long de la côte (`cliffs` + bruit basse fréquence) : plages et falaises alternent. Chaque forme a sa graine `seed ^ hash(id) ^ variant` : « Varier » ne modifie que son emprise (testé).

Presets fournis : archipel volcanique (île principale + 2 îlots), île unique avec volcan (conversion du preset historique), chapelet d'îlots. Les îles diffèrent par leurs paramètres (bruit de côte, falaises, plaines).

## 5. Classification

Entrées : hauteur, pente, distance à la côte, falaise, volcanisme, eau (surface au point), distance aux rivières (≤ 60 m, boîtes englobantes), masques, traits de biotopes, occupation (zones agricoles/mines, chemins, bâtiments). Sorties catégorielles : géologie → biome → matériau ; `habitatOf` donne arbres/arbustes/fleurs/herbe/rochers/roseaux, à zéro sur routes, bâti, champs, exclusions et sous l'eau, sans arbres en zone réservée ni sur forte pente.

## 6. Éditeur 2D (module « Carte globale »)

- **Couches** : visibilité, ordre (▲▼), opacité, verrouillage, couche active, légende/valeurs ; préférences mémorisées par visiteur (`localStorage`, facultatif).
- **Outils adaptés à la couche** : Viser, Déplacer ; masques → Pinceau, Gomme (rétablit le calcul), Polygone (Remplir / Rétablir la génération avec aperçu chiffré) ; Altitude & Terre/mer → Formes, Monter, Creuser, Lisser, Aplanir, Polygone (rétablir) ; Pentes → navigation seule.
- **Formes** : poignées des contours d'îles et îlots, volcans, massifs, collines, cuvettes, plateaux, crêtes, vallées ; ajout, glisser, double-clic pour insérer un point, Suppr pour retirer ; curseurs de paramètres ; « Varier (aperçu) » ; presets avec aperçu ; export/import ; conversion d'une île unique.
- **Rendu** : tuiles de 64 px échantillonnées par le moteur (une classification par pixel partagée par toutes les couches), niveau grossier d'abord puis niveau exact, cache LRU borné à 24 Mio conservé entre bascules 2D/3D, invalidation locale.
- **Lecture au curseur** : altitude, pente, géologie, biome, matériau, occupation, humidité.
- **Surimpressions** : rivières, chemins, zones, entités, cible caméra, grille des secteurs (affichage avancé).
- **2D ↔ 3D** : même session, même historique, même sélection et même cible caméra ; la vue 3D se met à jour pendant que la carte est ouverte. Un trait, un remplissage, un déplacement de forme ou une restauration = **une** transaction annulable.

## 7. Dépendances et invalidation

| Changement | Carte 2D | Vue 3D (tuiles, horizon, écologie, habillage) |
| --- | --- | --- |
| Masque d'un secteur | tuiles du secteur + 96 m | secteurs dont la signature de masques change |
| Retouche de relief | tuiles des secteurs concernés + 96 m | rayon de la retouche (existant) |
| Forme d'archipel (déplacer, régler, varier) | emprises avant/après des formes modifiées (`terrainChangeRects`, comparaison par id) | idem |
| Réglage général (fond marin, détail, preset, conversion) | toute la carte | tout le monde |
| Zones / eau / chemins (bibliothèques) | toute la carte | zones : emprises des polygones ; eau/chemins : existant |

Le terrain reste analytique dans le monde compilé (pas de géométrie cuite) ; les paquets de secteurs portent leurs masques et le manifeste porte le générateur. **Correctif inclus** : la validation de l'eau du compilateur et le panneau Eau du Studio évaluaient le relief de la vallée historique au lieu du générateur du monde.

## 8. Habillage naturel (G4/G5)

- **Matériaux** (couleurs de sommets, sans texture ni appel supplémentaire) : sable mouillé au rivage, strates et faces sombres de roche, mouchetis d'éboulis/galets, basalte, cendre.
- **Habillage** : bosquets et clairières en forêt, arbustes, modules rocheux de falaise, éboulis, galets, affleurements de colonnes de basalte. Aucun identifiant stocké : pilotage par biomes, masques, occupation et zones.
- **Rendu** : une `InstancedMesh` par famille (≤ 8 appels), arbres détaillés ≤ 90 m, silhouettes de 4 à 8 triangles jusqu'à 720 m (une sur deux au-delà de 320 m), cailloux ≤ 60–80 m, rochers ≤ 320 m ; cache borné (900 cellules), génération budgétée (3 ms/image), cellules périmées conservées jusqu'à régénération, paliers du gestionnaire de qualité unique (`PresentationBudget`), décalage d'un palier en qualité « basse ». **Aucun brouillard, aucune ombre, aucune animation CPU par instance.** Les rayons sont des réglages de benchmark, pas des vérités.
- Les petites plantes de l'écologie utilisent la classification (plus de touffes sur plages, routes, champs et exclusions).

## 9. Scène de référence

`npm run generate:reference` produit `maps/reference.project.json`, sa copie Studio (`public/maps/reference.project.json`, bouton « Scène de référence géographique ») et le monde compilé `public/maps/reference/` (jeu : `?world=maps/reference/manifest.json`). 1 600 × 2 400 m, distincte de la carte finale : île montagneuse (massif + crête), volcan et cratère, vallée avec rivière, plages et falaises, prairie, forêt, marais, plateau constructible, zone de village (3 maisons), champ, entrée de mine (zone réservée), îlot. `tests/reference-scene.test.mjs` vérifie la présence de chaque situation dans la source **et** dans le monde compilé, ainsi que l'absence d'arbres dans le champ, la mine et le village.

## 10. Tests et mesures

Tests Node : `geography.test` (7), `geo-map.test` (5), `dressing.test` (3), `reference-scene.test` (4) — suite complète 206/206. Navigateur : `npm run test:geomap` (30 vérifications) ; suites existantes `test:studio`, `test:local`, `test-editor-browser`, `test:island`, `test:browser` repassées.

Mesures SwiftShader 1440×900 / 960×640 (signal de régression uniquement) :

| Mesure | Avant (main + G1) | Après | Commentaire |
| --- | --- | --- | --- |
| Construction des tuiles 3D, île, cumul au démarrage | ≈ 72 ms (max 6,5 ms/tuile) | ≈ 110–130 ms (max 10–17 ms) | classification par sommet ; à optimiser |
| Horizon, île, construction | ≈ 50 ms | ≈ 85–95 ms | idem |
| Parcours île (`benchmark-route`, p50 intervalle) | 50 ms | 66,7 ms | habillage généré **masqué** : 50 ms → coût de remplissage du rastériseur logiciel, pas CPU |
| Triangles moyens du parcours | 33,6 k | 39,1 k | +5,5 k ; appels +6 |
| Carte 2D, première ouverture complète | 320 ms (aperçu 256 px) | ≈ 1,1 s (rendu progressif, toutes tuiles exactes) | grossier d'abord |
| Carte 2D, réouverture | 183 ms | 181 ms | cache conservé |
| Studio, ouverture / retour 3D médian / tas | 2 526 ms / 671 ms / 20 Mio | 2 558 ms / 708 ms / 30 Mio | +10 Mio = cache de tuiles (borné) |
| Habillage, cellule de 64 m | — | 0,54 ms (Node), ≤ 6–11 ms (SwiftShader, à froid) | |

## 11. Tableau de statut

| Mécanisme | Spécifié | Implémenté | Testé | Benchmarké | Publié |
| --- | --- | --- | --- | --- | --- |
| Générateur d'archipel v1 + validation + presets | oui | oui | oui | coût par échantillon (Node) | non |
| Masques de corrections par secteur (5 couches) | oui | oui | oui (transport source → ZIP → compilé → runtime) | — | non |
| Classification + habitats | oui | oui | oui | coût tuiles (SwiftShader) | non |
| Carte 2D par couches, outils, Undo/Redo, 2D↔3D | oui | oui | oui (Node + navigateur) | ouverture/réouverture | non |
| Formes, variantes, presets, export/import | oui | oui | oui | — | non |
| Invalidation locale (carte + 3D) | oui | oui | oui (rectangles) | — | non |
| Matériaux enrichis | oui | oui | visuel | — | non |
| Habillage par habitat (forêts, rochers, basalte…) | oui | oui | oui (déterminisme, exclusions) | parcours île | non |
| Scène de référence | oui | oui | oui (source + compilé) | — | non (fichiers statiques sur la branche) |
| Qualification GPU réel / PC de référence | oui | — | — | **non** | non |

## 12. Limites connues

- Classification par sommet : coût de construction des tuiles ≈ ×1,7 et de l'horizon ≈ ×1,8 (SwiftShader). Piste : grille de classification par tuile à pas grossier, mise en cache par cellule ou calcul en worker.
- La carte 2D n'affiche que les corrections des secteurs hydratés (au-delà de 600 secteurs visibles non chargés, elle invite à zoomer).
- Pas d'édition vectorielle des contours au-delà des points (pas de courbes de Bézier) ; pas de lignes de niveau éditables (crêtes/vallées tiennent ce rôle).
- Habillage : pas d'ombres, pas de vent, silhouettes lointaines simplifiées ; aucun réglage de densité par l'auteur hors biomes/masques/occupation.
- Vallée historique : classification affichée sur la carte mais rendu 3D inchangé (palette historique) ; son habillage reste le décor codé d'origine.
- Aucune mesure sur GPU intégré réel : les cibles 30/20 FPS ne sont pas qualifiées.
