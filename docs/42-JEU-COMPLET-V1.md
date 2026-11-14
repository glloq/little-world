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

### Contenu de l’île 3 × 8 km (générée, `npm run generate:island`)

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
