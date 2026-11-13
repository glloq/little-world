# 34 — Audit avant / après : générateur géographique et éditeur de cartes

**Base comparée** : `main` à `531ec4e` (avant) et la branche `claude/bold-tesla-b0pe7k` après les lots G1–G7 (après). Mesures Chromium/SwiftShader : signal de régression uniquement, aucune qualification GPU. Détails techniques : [33](33-GEOGRAPHY-ENGINE-CARTE-2D.md).

## Ce qui a changé

| Domaine | Avant | Après |
| --- | --- | --- |
| Générateur | Vallée historique ou preset « île unique » (un contour arrondi + un volcan) | Archipel v1 : plusieurs terres à contours de contrôle, îlots, volcans/cratères, massifs, collines, crêtes, vallées, plateaux, cuvettes, falaises/plages alternées, 5 échelles ; presets ; variantes locales ; ancien preset converti sans perte de volcan |
| Édition du relief de base | Paramètres figés à la création | Outil « Formes » de la carte 2D : poignées, curseurs, ajout/suppression, presets avec aperçu, export/import JSON, une transaction par validation |
| Couches géographiques | Aucune (un biome calculé par bandes d'altitude) | 8 couches (terre/mer, altitude, pentes/courbure, géologie, humidité, biomes, matériaux, occupation), dont 5 corrigeables par masques sectorisés |
| Carte 2D | Aperçu hypsométrique 256 px, sélection/visée | Éditeur par couches : visibilité/ordre/opacité/verrou/légende, pinceau, gomme, polygone, régénération locale avec aperçu, lecture au curseur, rendu progressif borné, invalidation locale |
| Classification | `sampleBiome` : côte < 90 m, altitude > 170 m, sinon prairie | Moteur pur partagé (jeu, Studio, compilation) : géologie, biome, matériau, occupation, humidité, habitats ; priorité masques > traits > calcul |
| Rendu des sols générés | 4 couleurs par bandes d'altitude | Palette de 11 matériaux + variations déterministes (sable mouillé, strates de roche, éboulis, basalte, cendre) |
| Végétation des mondes générés | Aucun arbre ni rocher ; petites plantes partout, y compris sur les plages | Forêts groupées avec clairières, arbustes, rochers de falaise, éboulis, galets, basalte, silhouettes lointaines sans brouillard ; exclusions routes/bâti/champs/zones ; ≤ 8 appels de rendu |
| Compilation | Pas de données géographiques auteur | Masques transportés source → ZIP → monde compilé → jeu ; **bug corrigé** : la validation de l'eau (compilateur et panneau Eau) utilisait le relief de la vallée historique pour tous les mondes |
| Scène de référence | Aucune | 1,6 × 2,4 km reproductible, toutes les situations exigées, testée en source et en monde compilé, jouable et ouvrable dans le Studio |

## Ce qui n'a pas changé (compatibilité)

Anciennes cartes V1/V2, projets V3 existants, scénario bêta et île publiée : valides sans migration (champs facultatifs) ; vallée historique rendue à l'identique ; commandes du jeu et du Studio préservées ; un seul éditeur, un seul historique, un seul stockage, une seule autorité de terrain, aucun backend.

## Mesures comparées (SwiftShader)

| Mesure | Avant | Après |
| --- | --- | --- |
| Parcours île : p50 / p95 / > 100 ms | 50 / 117 ms / 30 | 66,7 / 133 ms / 62 |
| Parcours île : triangles / appels moyens | 33,6 k / 74 | 39,1 k / 80 |
| Parcours île, habillage généré mais masqué : p50 | — | 50 ms (le surcoût est du remplissage, pas du CPU) |
| Tuiles 3D île (cumul) / horizon | ≈ 72 / ≈ 50 ms | ≈ 110–130 / ≈ 85–95 ms |
| Carte 2D : première ouverture / réouverture | 320 / 183 ms | ≈ 1 100 / 181 ms |
| Studio : ouverture / retour 3D / tas | 2 526 / 671 ms / 20 Mio | 2 558 / 708 ms / 30 Mio |

Fichiers bruts : `docs/benchmarks/2026-11-13-route-geo-before.json`, `docs/benchmarks/2026-11-13-route-geo-after.json`.

## Vérifications exécutées

- `npm test` : 206/206 ; `npm run typecheck` (tsc) ; `npm run build` + `tools/verify-static-build.mjs`.
- Navigateur : `test:geomap` (30), `test:studio` (17), `test:local` (10), `test-editor-browser` (37), `test:island` (11), `test:browser` (16).

## Risques et suites

1. **Coût de classification** des tuiles et de l'horizon (≈ ×1,7–1,8) : premier chantier d'optimisation (grille grossière par tuile, cache, worker).
2. **Surcoût de remplissage** de l'habillage : à mesurer sur GPU intégré réel ; paliers et rayons déjà réglables par le gestionnaire unique.
3. Pas de qualification matérielle : aucune cible 30/20 FPS n'est annoncée atteinte.
4. Fonctions spécifiées non livrées : courbes de Bézier et lignes de niveau éditables, densités d'habillage par l'auteur, ombres et vent de la végétation, habillage de la vallée historique par le nouveau moteur.
