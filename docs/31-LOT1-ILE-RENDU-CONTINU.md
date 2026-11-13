# 31 — Lot 1 : île 3 × 8 km, lecteur V3 compilé et rendu continu

**Date : 13 novembre 2026. Branche : `claude/bold-tesla-b0pe7k`, à partir de `3c0cf39` (audit [30](30-AUDIT-BETA-ILE-3X8-STUDIO-RENDU.md)).**
Lots de l'audit couverts : **L0** (baseline/contrats), **L1** (R-02, R-03, S-01, S-02, base R-10, S-12) et une première partie de **L2** (R-04, R-06, R-07) et de S-04. **B1 n'est pas qualifiée** ; aucune cible 30/20 FPS n'est déclarée atteinte.

## 1. Ce qui fonctionne

| Mécanisme | Implémenté | Testé | Publié |
| --- | --- | --- | --- |
| **Contrat de générateur de relief** `world.terrain` dans la source V3 (absent = vallée historique) ; preset paramétrique île/volcan déterministe (graine, côte fermée bruitée, plage, plaines, volcan à ravines et cratère) | [terrain-generator.ts](../src/terrain-generator.ts), [schema V3](../src/studio-core/schema.ts) | 6 tests (déterminisme, côte fermée sur tout le périmètre, cratère, refus V2, rétrocompatibilité) | Oui via le monde publié |
| **Enveloppe verticale V3** −300…1 500 m pour les retouches « aplanir » (bornes V2 inchangées) | [VERTICAL_ENVELOPE](../src/terrain-generator.ts) | Tests de validation | — |
| **Index spatial des retouches** de relief (ordre d'application conservé) au lieu d'un parcours de toutes les retouches par échantillon | [createTerrainSource](../src/terrain.ts) | Équivalence exacte avec l'application ordonnée naïve (120 retouches, 400 points) | — |
| **Lecteur de monde compilé** (manifeste + logique globale + paquets auteur épars, hash/taille vérifiés) : même chemin pour le jeu publié (`?world=maps/<id>/manifest.json`) et pour **« Tester la copie »** du Studio (`?studioBuild=`), sans plafond V2 de 2 km | [compiled-world.ts](../src/runtime/compiled-world.ts), [build-store.ts](../src/runtime/build-store.ts), [main.ts](../src/main.ts), [shell.ts](../src/studio/shell.ts) | Équivalence avec l'adaptateur source sur le scénario de référence (objets, PNJ, retouches, eau, entités logiques, interactions, colliders) ; refus des ressources altérées ; parcours navigateur eau/studio/personnages/gameplay | Oui (`maps/island/`) |
| Le manifeste compilé porte le générateur : **un secteur sans paquet auteur garde son relief de base** (l'île publiée a 0 paquet auteur) | [compile.ts](../src/world-compiler/compile.ts), [load.ts](../src/world-compiler/load.ts) | Test île sans paquet | Oui |
| Copie de test : compilation du snapshot, stockage **IndexedDB** borné (3 copies, 96 Mio), slots temporaires isolés ; source et historique intacts | [build-store.ts](../src/runtime/build-store.ts) | Suites navigateur gameplay (slots), studio (historique), eau (point de départ/profil), île | — |
| **Studio** : création « Île volcanique · 3 000 × 8 000 m » avec graine ; **carte globale topographique** (≤ 256 px, relief de base + retouches chargées, sans géométrie 3D) | [shell.ts](../src/studio/shell.ts), [map-view.ts](../src/studio/map-view.ts) | Parcours navigateur île (création → copie compilée → retour) | — |
| **Horizon géographique** sur toute l'emprise : blocs de heightfield grossier (≤ ~32 k sommets quelle que soit la taille ; 24 blocs, 47 k triangles, ~1,5 Mio pour l'île), cellules alignées sur les tuiles ; les cellules sous une tuile détaillée affichée sont **retirées de l'index** (aucun fragment écarté, aucune géométrie cachée rastérisée) ; mer lointaine intégrée (sommets plafonnés au niveau marin) | [horizon-view.ts](../src/horizon-view.ts) | Bords de blocs identiques, mer plafonnée, budget de sommets jusqu'à 10 × 10 km, index de couverture | Oui |
| **Océan de l'île** : anneau opaque autour de l'emprise (aucun pixel sur l'île) + un quad d'eau proche par tuile affichée atteignant le niveau marin ; **aucun brouillard** ; `far` = diagonale + 2,5 km, `near` inchangé | [horizon-view.ts](../src/horizon-view.ts) | Contrôle navigateur « aucun fond sous l'horizon visuel » | Oui |
| **Priorité caméra** : frustum élargi (+0,3 rad), taille projetée (focale) et niveau partagé `PresentationBudget`, altitude, prédiction de trajectoire (2 s), **voisinage de sécurité 360°** et couronne basse priorité pour les demi-tours ; replanification sur rotation > 10°, déplacement, altitude, téléportation ; file reconstruite = annulation des requêtes périmées | [planView](../src/chunks.ts) | 5 tests (frustum, couronne, ordre, prédiction, altitude/qualité, coût indépendant de l'emprise) | Oui |
| **Quotas** : génération par tranche de 4 ms (au moins une tuile), **cache borné en octets** (64 Mio) en plus du nombre ; ancien LOD conservé jusqu'au remplacement ; tuile manquante dessinée par l'horizon | [terrain-view.ts](../src/terrain-view.ts) | Test tranche nulle = 1 tuile/mise à jour, éviction en octets | Oui |
| **Points de vue de contrôle** reproductibles des mondes compilés (`&spawn=x,z&yaw=`) et mesures exposées (`?metrics`) : tuiles visibles/actives/résidentes/en attente, octets, temps de génération, horizon, caméra, couleur de fond réelle | [main.ts](../src/main.ts) | Outil de benchmark | — |
| Décors codés en dur de la vallée (rivière, sentier, forêt, village, quai, obstacles PNJ, repères audio) **limités au générateur historique** ; mondes générés sans décor fantôme | [world.ts](../src/world.ts), [biomes.ts](../src/biomes.ts) | Suites legacy/publiées inchangées | — |

## 2. Mesures (baseline → lot)

Protocole : [benchmark-route.mjs](../tools/benchmark-route.mjs), Chromium headless **SwiftShader** (rendu logiciel, **pas un GPU intégré**), 960 × 640, DPR 1, qualité « équilibré », même itinéraire (attente de file vide → 2 s immobile → rotation 360° → course 6 s → demi-tour rapide → balayage d'horizon 8 caps). Intervalles de présentation observés par `requestAnimationFrame` (quantifiés à 16,7 ms) ; la durée JS de `renderer.render()` est une **soumission CPU, pas un temps GPU**. Les **trous** sont les pixels de couleur de fond là où un rayon caméra touche le relief analytique (ou la mer ouverte d'une île), grille 64 × 40. Exécutions uniques : variance non négligeable.

| Scénario | Révision | p50 / p95 / p99 (ms) | > 100 ms | Appels | Triangles | Tuiles actives (visibles) | Trous moyen / max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vallée 200 × 600 | `3c0cf39` origine | 67 / 133 / 183 | 54 / 384 | 120 | 36,7 k | 27 | n/d |
| Vallée 200 × 600 | lot 1 | 67 / 117 / 167 | 36 / 447 | 122 | 30,7 k | 26 (12) | 0 / 0 |
| Terrain 2 km (V2 synthétique) | `3c0cf39` origine | 83 / 133 / 167 | 49 / 384 | 131 | 41,4 k | 60 | n/d |
| Terrain 2 km (V2 synthétique) | lot 1 | 67 / 133 / 183 | 55 / 412 | 137 | 47,8 k | 40 (20) | 0 / 0 |
| Île 3 × 8 km, tuiles 64 m | `3122f63` lecteur sans horizon | 50 / 100 / 167 | 20 / 495 | 63 | 23,9 k | 61 | **3,6 % / 6,8 %** |
| Île 3 × 8 km, tuiles 64 m | lot 1 | 50 / 117 / 167 | 29 / 442 | 75 | 34,4 k | 40 (21) | **0 / 0** |
| Île 3 × 8 km, tuiles 128 m | `3122f63` lecteur sans horizon | 67 / 117 / 200 | 26 / 461 | 51 | 39,4 k | 22 | 3,4 % / 6,7 % |
| Île 3 × 8 km, tuiles 128 m | lot 1 | 50 / 117 / 150 | 36 / 442 | 63 | 43,5 k | 24 (9) | 0 / 0 |

Rapports bruts : [origine](benchmarks/2026-11-13-route-3c0cf39-origin.json), [lecteur sans horizon](benchmarks/2026-11-13-route-3122f63-reader-no-horizon.json), [lot 1](benchmarks/2026-11-13-route-lot1-after.json). Mémoire terrain détaillé estimée : 0,8–1,6 Mio résidents ; horizon : ~1,5 Mio ; génération d'une tuile 64 m : max 4–8 ms (SwiftShader, CPU partagé).

**Lecture :**
- Les trous disparaissent sur l'île (volcan, côtes et océan visibles dans tout le champ), tout en réduisant le terrain détaillé affiché (40 tuiles au lieu de 61).
- Sur l'île, le p50 est inchangé et le p95 se dégrade d'une image (100 → 117 ms) alors que la scène **dessine désormais toute la géographie lointaine** (+12 appels, +10 k triangles). La vallée s'améliore (−16 % triangles, moins de longues images) ; la carte 2 km est équivalente au bruit près.
- Une première version masquait l'horizon par `discard` puis par sommets enfouis : mesurée plus coûteuse (p50 île 67 ms), elle a été remplacée par le retrait des cellules couvertes de l'index.
- **64 m vs 128 m** : 128 m réduit les appels (63 vs 75) mais augmente triangles (+26 %) et pics de génération (8–9 ms vs 4–5 ms). **64 m reste la valeur par défaut** ; 256 m n'est pas encore comparé. Ces chiffres ne fixent aucune taille définitive.
- Aucune de ces mesures ne qualifie un GPU intégré ni Firefox.

## 3. Vérifications exécutées

- `npm test` : 164 tests OK ; `npm run typecheck` ; `npm run build` et `node tools/verify-static-build.mjs` (inclut `maps/island/manifest.json`).
- Navigateur sur **build de production** (`vite preview`) : legacy 16, publication, studio 17, gameplay 12, environnement 6, vue locale 10, personnages 6, eau 11, audio 12 et **île 11** contrôles ; sur serveur de développement : stockage IndexedDB 20, moteur audio, moteur d'eau 8.
- CI : génération reproductible de l'île (`npm run generate:island` + `git diff --exit-code`) et contrôle navigateur `island` ajoutés à [checks.yml](../.github/workflows/checks.yml).

## 4. Limites connues (non masquées)

- **Paquets auteur lus à l'ouverture** (bornés à 48 Mio) : le terrain détaillé et l'horizon sont progressifs, mais les entités, PNJ, colliders et retouches ne sont pas encore streamés par secteur. Suffisant pour une île peu dense, à faire avant de peupler l'île (R-02/R-06 suite).
- L'horizon est **dérivé au chargement** (~50–60 ms pour l'île) et non un produit compilé ; reconstruction locale par bloc après retouche, pas encore invalidée depuis le Studio en direct.
- Objets placés : visibilité par distance au joueur inchangée, pas encore de proxies lointains (R-09) ; forêt/village/parcelles absents de l'île.
- Rendu runtime encore adapté du V2 : props réduits à X/Z/lacet/échelle uniforme (S-06), limites centrées obligatoires.
- Bateau des mondes générés amarré à la première eau profonde devant le départ ; pas de quai défini (ancien quai propre à la vallée).
- Pointillés fins visibles sur certaines pentes : déjà présents à `3c0cf39`, non traités ici.
- Profondeur : `near` 0,1 m inchangé, `far` étendu ; pas de rendu d'horizon séparé ni de profondeur inversée (non nécessaires aux mesures actuelles, à réévaluer sur GPU réel).
- Pas de banc GPU intégré/Firefox ; seuils et budgets restent à calibrer.

## 5. Prochain lot recommandé

1. **Streaming des paquets auteur** par la même priorité caméra/sécurité (entités, colliders, retouches), annulation par révision, et invalidation locale de l'horizon après édition Studio (R-02/R-06, HZ-5).
2. **Outils de relief macro** (S-03) : réglage du preset île/volcan depuis le Studio avec aperçu, vrai lissage, pentes, et **navigation directe** depuis la carte topographique vers la vue locale (S-04/S-05).
3. **Transformations complètes** jeu/compilation/collisions (S-06), puis **proxies** de forêts/village (R-09) et régions forestières sectorisées (N-01) pour commencer à peupler l'île sans perte de silhouette.
