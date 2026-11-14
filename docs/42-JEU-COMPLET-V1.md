# 42 — Jeu complet V1 : boucle de jeu, économie, île peuplée et Studio unique

**Statut : implémenté et testé sur la branche `claude/little-world-production-v1-eym947` (PR #15), non publié sur `main`.**
Suite de [41 — World Production V1](41-WORLD-PRODUCTION-V1.md). Ce document consigne les **nouveaux objectifs** demandés le 14 novembre 2026 (« finaliser un jeu complet »), ce qui est livré et prouvé, et la **feuille de route** des points restants.

> Règle de lecture : chaque mécanisme est noté **spécifié / implémenté / testé / publié** séparément. « Testé » renvoie à un test Node ou navigateur existant. Les captures SwiftShader prouvent la reproductibilité, pas la performance sur GPU intégré. **Aucun FPS cible n’est annoncé atteint.**

## 1. Objectifs (demande du 14 novembre 2026)

1. Une **carte complète et cohérente** : biotopes, rivières, roches, collines et falaises qui ont une logique ; **pas de grandes zones vides**.
2. Des **habitants** (PNJ animaux), **plusieurs villes** de styles différents, des **missions/quêtes**.
3. Un **écureuil** moins coûteux (moins de polygones) avec de meilleures animations.
4. Des **éléments 3D low-poly** sans problème de licence (originaux du projet ou CC0).
5. **Pêche** (canne dans l’inventaire, obtenue par quête ou achat), **argent**, **comptoirs**, **cueillette** (fruits, champignons, fleurs) et **matériaux de mine**.
6. **Abattre des arbres** pour obtenir des bûches.
7. **Agriculture plus « jeu »** : petites parcelles encloses (haies, clôtures, murets), semences.
8. **Points d’intérêt partout** : auberges, tours, château, remparts, église, cathédrale, arbre-monde, ruines, gros blocs de pierre ; cachés par les volumes du relief (à la *Breath of the Wild*).
9. **Mine** mieux intégrée : 20 à 500 coups selon le matériau, éclats occasionnels, rendu organique (pas de blocs plats), comptoirs à l’entrée (pioche, revente des minerais) ; idem forêt et ports.
10. **Falaises** mieux dessinées et **escalade**.
11. **Supprimer les anciennes cartes et l’ancien éditeur** : seul Little World Studio reste ; maximiser le contrôle de tous les éléments et de la logique depuis le Studio.
12. Documentation et feuille de route à jour.

## 2. Ce qui est livré

| # | Mécanisme | Spécifié | Implémenté | Testé | Publié |
| --- | --- | --- | --- | --- | --- |
| 5 | **Économie** : pièces (objet `coin`, 40 au départ), prix d’achat/vente, 6 types de comptoirs (mine, forêt, port, marché, ferme, auberge), panneau de commerce, bourse au HUD | oui | `src/gameplay/economy.ts`, `src/ui/shop/shop.ts` | `tests/economy.test.mjs`, `tools/test-economy-browser.mjs` | non |
| 5 | **Cueillette** : fruits (pommier, poirier, prunier, cerisier), champignons, fleurs, roseaux sur la végétation générée, repousse datée, sauvegarde | oui | `src/gameplay/gathering.ts` | `tests/economy.test.mjs` | non |
| 6 | **Abattage** : hache requise, plusieurs coups, bûches, l’arbre disparaît du décor puis repousse | oui | idem | test navigateur (achat de la hache, abattage, revente) | non |
| 5 | **Pêche** : lancer, attente, touche (fenêtre 1,3 s), ferrage ; tables de poissons mer / rivière / lac ; canne requise (achat ou quête) | oui | `createFishing` | `tests/economy.test.mjs` | non |
| 9 | **Mine** : points de vie par matériau (terre 20, roche 60, roche dure 150, fer 220, cristal 500), puissance mains 2 / pioche 8 / pioche d’acier 25, éclats occasionnels, dégâts partiels sauvegardés | oui | `src/mine/mine-state.ts` | `tests/economy.test.mjs`, B1 navigateur | non |
| 9 | **Rendu organique des galeries** : faces par cellule en rangées, sommets déplacés **dans la roche** par une fonction pure de la grille (sans fissure, jamais dans l’espace marchable), voûte | oui | `src/mine/mine-mesher.ts` | `tests/mine.test.mjs` (invariants), capture B1 | non |
| 7 | **Agriculture « jeu »** : semer consomme un sachet de semences, une récolte en rend un ; kit de départ ; mondes sans économie inchangés | oui | `src/gameplay/activity-runtime.ts` | `tests/economy.test.mjs`, B1 navigateur | non |
| 7 | **Petits champs clos** (haie / clôture / muret) dans les villages et la ville | oui | `enclosedField` (presets) | `tests/landscapes.test.mjs` | non |
| 10 | **Escalade** : pousser contre un relief plus raide que la marche (> 50°) ; endurance (jauge HUD), saut pour se détacher (planage possible), chute à l’épuisement, fin sur la crête ; relief extérieur uniquement | oui | `src/player.ts` (`climb`) | `tests/physics-controller.test.mjs`, `tools/test-climb-browser.mjs` | non |
| 3 | **Écureuil allégé** : sphères 8×6, pièces fusionnées par articulation (couleurs de sommet), géométries partagées entre tous les personnages ; **35 → 12 appels visibles, 4 320 → 2 736 triangles** par personnage | oui | `src/squirrel.ts` (`mergeRigidParts`) | `tests/character-animation.test.mjs` | non |
| 3 | **Animation d’escalade** (pattes alternées, corps redressé, face à la paroi) | oui | `src/character-animation.ts` | captures | non |
| 4 | **Kit d’assets original** : 37 modèles low-poly (auberge, maisons, château, murailles, tours, portes, église, cathédrale, arbre-monde, conifères, blocs, aiguille, arche, falaise, grotte, menhirs, tour en ruine, obélisque, étals, comptoirs mine/forêt/port, puits, lanterne, panneau, tonneau, caisses, banc, fontaine, palissade, cabane de ponton, **coffre**), 2–3 LOD, licence *project-original* | oui | `tools/assets/generate-world-kit.mjs` | `tests/world-assets.test.mjs` | non |
| 2 | **Ville au château v2** : rayon proportionnel au nombre de maisons, lots remplis depuis la place, **remparts circulaires avec tours** et porte, château hors les murs, cathédrale, marché, auberge, cours | oui | preset `castle-town` v2 | `tests/landscapes.test.mjs`, capture | non |
| 2 | **Autres établissements** : ports de pêche, hameaux de montagne, camp minier, camps de bûcherons, villages-clairières, chacun avec comptoir(s), habitants et quêtes | oui | presets | idem | non |
| 1 | **Bois et clairières** (`woodland`) : masque de forêt, canopée fermée au-delà d’une densité 1,2, clairière, souches | oui | preset + `dressing.ts` | `tests/landscapes.test.mjs`, carte de densité | non |
| 8 | **Trésors cachés** : coffres (interaction déclarative, ouverture unique, état sauvegardé) **au sommet de 12 falaises** (récompense de l’escalade), **derrière les repères** (hors de vue depuis le sentier) et **au cœur des bois** | oui | `treasure()` (presets), `generate-island.mjs` | test navigateur (ouverture, pas de seconde récompense) | non |
| 11 | **Ancien éditeur et ancienne vallée supprimés** : la page d’accueil ouvre l’île ; le Studio est le seul éditeur ; la vallée V1 reste un **fixture de migration** (`tests/fixtures/legacy-v1-valley.json`) | oui | `index.html`, `src/main.ts` | `published`, `studio`, migration | non |

### Contenu de l’île 3 × 8 km (première passe ; remplacée par l’île 4 × 3 km, §3 ter)

| Élément | Nombre |
| --- | --- |
| Paysages (presets appliqués) | 49 (dont 10 bois, 8 repères, 2 ports, 2 hameaux, 2 villages, 1 ville au château, 1 camp minier, 2 camps de bûcherons) |
| Entités | 1 615 |
| Habitants (PNJ) | 32 |
| Quêtes (objectifs) | 14 |
| Comptoirs | 9 (2 forêt, 2 port, 2 ferme, 1 mine, 1 marché, 1 auberge) |
| Coffres cachés | 28 |
| Maisons | 66 |
| Champs clos (AGRI) | 8 |
| Chemins / routes | 55 |

Carte de densité (végétation par cellule de 64 m, paysages, entités) : `docs/captures/island-density.png`, produite par `node tools/render-density-map.mjs maps/island.project.json docs/captures/island-density.png 8`. Part des cellules terrestres presque vides : **0,8 %** (mesure de l’outil).

### Contrôle depuis le Studio

- Tous les presets (dont `woodland`, `castle-town` v2, `landmark-site` v2 avec coffre) apparaissent dans le panneau **Paysages** : paramètres (densité, nombre de maisons, quêtes, coffre…), régénération qui respecte les retouches manuelles.
- Habitants, dialogues, quêtes, objets et **interactions** générés sont des données V3 ordinaires (bibliothèques `behaviors`, `dialogues`, `objectives`, `items`, `interactions`), modifiables dans les éditeurs Personnages / Dialogues / Interactions ; une entrée encore référencée ailleurs n’est jamais supprimée par une régénération.
- Un comptoir est une entité avec l’état `shop` (`mine`, `forest`, `port`, `market`, `farm`, `inn`) : le placer et le changer depuis l’inspecteur suffit.

## 3. Mesures et preuves

- `npm test` : 327 tests Node, 0 échec (au moment de ce document).
- Navigateur (Chromium/SwiftShader, fonctionnel) : `economy` (14 contrôles : comptoir, achat de hache, revente, abattage, arbre retiré, coffre), `climb` (6), `b1` (22, dont semis par sachet et récolte rendant une graine), `landscapes`, `editor`, `editor-content`, `ui`, `gameplay`, `audio`, `published`, `studio`, `water`.
- Ville au château, vue à 120 m : ~234 appels, 72 k triangles sous SwiftShader (signal de régression, pas un benchmark GPU).
- Écureuil : 12 appels / 2 736 triangles par personnage visible (mesure du graphe Three.js, `traverseVisible`).
- **Parcours de route de l’île** (`tools/benchmark-route.mjs`, scénario `island-3x8`, SwiftShader, même protocole que 41) — `docs/benchmarks/2026-11-14-route-game-v1.json` :

| Mesure | World Production V1 | Jeu complet V1 | Lecture |
| --- | --- | --- | --- |
| p50 / p95 / p99 intervalle | 66,7 / 150 / 250 ms | 66,7 / 150 / 250 ms | inchangé |
| Appels de dessin (moyenne) | 90,3 | 75,7 | −16 % (écureuils fusionnés, modules instanciés) |
| Triangles (moyenne) | 45,7 k | 43,3 k | −5 % |
| Démarrage (boot) | 5,6 s | 9,4 s | **+3,8 s : régression** |
| Tas JS | 29,7 Mo | 48,7 Mo | **+19 Mo : régression** |
| Trous d’horizon (max) | 0,29 % | 0,29 % | inchangé |

**Hypothèse non encore mesurée** : la hausse du démarrage et de la mémoire viendrait du contenu lu d’un bloc au démarrage (1 141 secteurs auteur contre 939, interactions, bibliothèques, végétation plus dense). Le profilage du démarrage puis le streaming des paquets auteur par proximité sont la **première tâche de G6**.

## 3 bis. Priorités de l’habillage : arbres et forêts d’abord (G6, 14 novembre 2026)

**Constat** (demande : « les arbres ne restent pas à l’écran ») : sur une machine chargée, le budget adaptatif (doc 22) descend aux niveaux 2–3 ; l’ancienne règle réduisait **tous** les éléments du même facteur (arbres compris, rayon × 0,45 au niveau 3) et **coupait les silhouettes lointaines** au niveau 3. De plus, les silhouettes s’arrêtaient à 540–720 m : depuis les hauteurs, les forêts éloignées n’étaient plus que de la couleur de terrain.

**Règle implémentée** (`src/world-production/dressing-priority.ts`, consommée par `src/dressing-view.ts` ; le budget global ne fait que fixer le niveau) :

| Classe | Niveau 0 | 1 | 2 | 3 | Part max. d’un lot GLB |
| --- | --- | --- | --- | --- | --- |
| Arbres (modèles proches) | 1 | 0,95 | 0,85 | 0,75 | 100 % |
| Silhouettes lointaines | 1 | 1 | 0,9 | 0,8 | — (jamais coupées) |
| Fleurs, champignons, roseaux (cueillables) | 1 | 0,9 | 0,8 | 0,7 | 25 % |
| Buissons | 1 | 0,8 | 0,6 | 0,45 | 25 % |
| Plantes de sol (fougères, mousses…) | 1 | 0,6 | 0,4 | **0** | 30 % |
| Bois mort | 1 | 0,6 | 0,4 | **0** | 8 % |
| Gros rochers, basalte | 1 | 0,85 | 0,7 | 0,6 | — |
| Cailloux, éboulis | 1 | 0,5 | **0** | **0** | — |

- Rayons de base réduits pour les petits éléments (plantes de sol 22/42 m au lieu de 30/55, bois mort 25/50 au lieu de 35/70, cailloux 40 m au lieu de 60, éboulis 55 au lieu de 80) ; cueillables 45/80 m.
- Remplissage **par passes** (arbres de toutes les cellules, puis cueillables, buissons, plantes de sol, bois mort, minéraux) : un lot plein refuse d’abord les petits éléments ; **un arbre refusé garde sa silhouette** au lieu de disparaître.
- Bosquets lointains éclaircis (1/2 au-delà de 320 m, 1/4 au-delà de 560 m, silhouettes agrandies : même couverture).
- **Canopée lointaine** (`generateCanopyCell`) : au-delà des silhouettes et jusqu’à 1 800 / 1 600 / 1 400 / 1 100 m selon le niveau, 9 échantillons de la **même classification** par cellule de 64 m donnent quelques grandes couronnes là où l’habitat porte des arbres (≈ 11 × moins cher que l’habillage complet en Node) ; générée **dans les workers** après l’habillage proche, mêmes familles de silhouettes (aucun appel de dessin en plus), redessin limité à 1 / s.

**Mesures** (SwiftShader, même vue aérienne au niveau 2, captures `game-v1/forests-far.jpg`) : silhouettes d’arbres 957 → ~7 400, arbres en modèles réels 374 → 539 dans un bois, plantes de sol 3, cailloux 0, appels de dessin de l’habillage inchangés (4–5). Parcours de route (`docs/benchmarks/2026-11-14-route-dressing-priority.json`, deux passes chacun) :

| Mesure | Avant (2 passes) | Après (2 passes) |
| --- | --- | --- |
| p50 | 66,6–66,7 ms | 66,7 ms |
| p95 | 133–150 ms | 150–167 ms (bruit SwiftShader du même ordre) |
| Mise à jour JS / image | 1,28–1,42 ms | 1,38–1,47 ms |
| Triangles (moyenne) | 43,3–43,8 k | 48,1–48,4 k (+11 %) |
| Appels de dessin | 75,7–76,3 | 75,5 |

Non qualifié sur GPU intégré : les triangles supplémentaires (silhouettes 4–8 triangles) sont le coût assumé de forêts visibles jusqu’à l’horizon.

## 3 ter. Deuxième passe (demande du 14 novembre 2026, H1–H5)

| # | Demande | Implémenté | Testé | Publié |
| --- | --- | --- | --- | --- |
| H1 | **Écran de chargement** : barre et étapes (monde, relief, arbres, forêts proches) calculées sur les vrais compteurs ; « Explorer » activé quand la zone de départ est prête (sécurité 25 s) | `src/ui/loading.ts` | `tests/loading.test.mjs`, suite navigateur `environment` (« Chargement… » avant l’amorçage) | non |
| H1 | **Pas moins forts** : gain 0,4 → 0,18 (repli 0,35 → 0,16), catalogue audio régénéré | `catalog-source.ts` | tests audio | non |
| H2 | **Moulins** : rotor du moulin à vent et roue du moulin à eau animés par les pivots nommés des GLB (`RotorPivot`, `WheelPivot`) | `world-production/animated-assets.ts` | capture (angle qui change) | non |
| H2 | **Phare** : faisceau additif tournant, visible la nuit, dégradé vers la pointe | idem | capture de nuit | non |
| H2 | **Bateaux** : le bateau du joueur porte le modèle `boat.sailboat_small` (gréement et safran suivent la barre) ; barques et voiliers amarrés aux ports | idem + preset `fishing-port` v2 | capture, métrique `boatModel` | non |
| H3 | **Collisions** : `Collider` écrit dans la source V3 depuis l’usage du registre (bâtiments par emprise, murs/props/rochers par boîte, arbres par tronc) ; troncs des arbres générés enregistrés autour du joueur (36 m), désactivés dès l’abattage | `registry.colliderFor`, `gameplay/tree-colliders.ts` | `tests/colliders.test.mjs` | non |
| H3 | **Proportions** : personnages ×0,72 (`CHARACTER_SCALE`), corps du joueur 1,35 m × r 0,32, caméra rapprochée : maisons et arbres paraissent ≈ 1,4 × plus grands | `squirrel.ts`, `main.ts` | suites `ui`, `b1`, `economy`, `climb` | non |
| H4 | **Éclairage** : lanternes de rue (nuit), auberge et une maison sur deux (lampe de porte), feux de camp vacillants — composants `Light` auteur ; nouveau modèle `structure.campfire` ; feux de camp avec rondins tous les ~320 m le long des routes | `registry.lightFor`, `world-production/roadside.ts` | captures de nuit, compteurs de lumières | non |
| H5 | **Carte 4 × 3 km** à fort relief : nord habité (ports, ville fortifiée, villages, plages) où l’on commence, crête centrale qui coupe la vue vers un sud sauvage (volcan, massif, gorge, mine, hameaux) ; collines partout | `tools/generate-island.mjs` | suites `island`, `economy`, `climb`, `b1`, `landscapes` | non |
| H5 | **Occultation par le relief** : champ d’horizon par azimut (64 × 24 m jusqu’à 2,4 km), recalculé par tranches après un déplacement ; silhouettes lointaines, canopée, modèles d’arbres au-delà de 60 m, bâtiments et structures sous l’horizon ne sont pas dessinés ; le terrain n’est jamais caché | `src/render/horizon-occlusion.ts` | `tests/occlusion.test.mjs` | non |
| H5 | **Correction du moteur géographique** : `polylineDistance` renvoyait la distance **au carré** ; crêtes et vallées faisaient √largeur (≈ 18 m pour 320 m) → lames et « dents de scie » ; corrigé, cartes régénérées ; les presets qui tracent de l’eau sont appliqués en dernier (validation WATER sur le relief final) | `geography/archipelago.ts` | tous les tests Node | non |

**Mesures (SwiftShader, régression seulement)** : occultation au sol, vue depuis la ville vers la crête : triangles 65,5 k → 50,6 k (−23 %), instances de végétation 3 723 → 1 722 (−54 %) ; depuis la plage : −13 % de triangles, −41 % d’instances. Parcours de route sur la nouvelle carte (`docs/benchmarks/2026-11-14-route-island-4x3.json`) : p50 66,7 ms, p95 133 ms (contre 150–167), p99 200 ms (contre 250–267), 39 k triangles (contre 48 k), aucun trou d’horizon. Captures : `docs/captures/game-v1/map-4x3/`, carte de densité `docs/captures/island-density.png`.

**Île 4 × 3 km** : 36 paysages, 46 formes de relief, 1 511 entités (1 433 avec collisions, 54 lumières), 32 habitants, 14 quêtes, 9 comptoirs, 66 maisons, 8 bateaux amarrés, 14 feux de camp, 16 coffres cachés, rivière, cascade et lac.

**Limites** : les cuvettes de marais du nord restent sans étang (trop plates sur ce relief, diagnostic du preset) ; les collisions sont des boîtes alignées sur les axes (un bâtiment tourné à 45° bloque un peu plus large que son mur) ; l’occultation est vérifiée sur des vues fixes et un parcours, pas encore en planage continu sur GPU réel.

## 4. Limites connues (honnêtes)

- **Performance non qualifiée** sur GPU intégré. Sous SwiftShader, l’intervalle de présentation est inchangé, mais **le démarrage (+3,8 s) et le tas JS (+19 Mo) régressent** (voir §3).
- Les modèles du kit sont **GENERATED_NOT_REVIEWED** : validés techniquement, pas artistiquement.
- L’escalade suit le **heightfield** : les falaises en GLB (blocs, aiguilles) restent des obstacles, pas des parois grimpables.
- L’animation de l’écureuil reste un rig rigide (pas de skinning pondéré) ; nouvelles poses d’escalade seulement.
- Les quêtes sont des livraisons/collectes simples ; pas encore de chaînes à plusieurs étapes ni de récompenses de réputation.
- La pêche n’a pas d’objet « canne » visible dans la main, ni de bouchon animé.
- Pas de streaming des paquets auteur au-delà du compilateur actuel (1 141 secteurs pour l’île).

## 5. Feuille de route (suite)

| Lot | Contenu | Gate d’acceptation |
| --- | --- | --- |
| **G6 — Qualification** | Streaming des paquets auteur par proximité (démarrage et tas revenus au niveau de 41) ; budget d’instances des bois et des villes dans `ResourceBudgetManager` ; GPU intégré réel | boot ≤ 6 s et tas ≤ 32 Mo sous SwiftShader ; p95 mesuré sur GPU intégré |
| **G7 — Quêtes en chaîne** | Quêtes à étapes (objectifs liés), récompenses d’objets uniques, PNJ qui changent de dialogue après la quête ; éditeur de quête par template dans le Studio | Chaîne de 3 étapes jouée et sauvegardée, éditée sans code |
| **G8 — Styles de villes** | Ville portuaire en terrasses, village de montagne en pierre, hameau de marais sur pilotis ; variantes de maisons du kit | 3 nouveaux styles générés, revus en capture |
| **G9 — Falaises GLB grimpables** | Collision et escalade sur blocs/arches/aiguilles (surface de contact verticale), prises visibles | Escalade d’un bloc GLB en test navigateur |
| **G10 — Pêche et outils visibles** | Canne/hache/pioche dans la patte, bouchon et ligne simples, animations de lancer et de coup | Captures + test d’état visuel |
| **G11 — Agriculture approfondie** | Saisons, rotation, engrais (AGRI-4+), vente au comptoir avec prix variables bornés | Tests AGRI déterministes, partie sauvegardée |
| **G12 — Revue artistique** | Revue humaine du kit original, remplacement éventuel par des assets CC0 vérifiés | Statut `REVIEWED` dans le registre |

Les jalons précédents (V3-A…G, HZ, PERF, AUD, MINE, AGRI, WATER) restent ceux de [07 — Roadmap](07-ROADMAP.md) ; ce document ne les déclare pas terminés.
