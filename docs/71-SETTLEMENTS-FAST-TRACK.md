# 71 — Plan d'implémentation accélérée : colonies, maisons et villes dans Studio

**Statut : ROADMAP FAST-TRACK — documentation uniquement, rien d'implémenté.**  
**17 novembre 2026.** Branche `docs/studio-settlements-collision-roadmap`.  
**Source de référence :** [69 — audit de code](69-SETTLEMENTS-SET0-AUDIT.md), [70 — contrats](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md), [68 — roadmap exhaustive](68-SETTLEMENTS-ROADMAP-TESTS.md), [72 — UX Studio](72-SETTLEMENTS-STUDIO-UX.md).  
Cette roadmap **réordonne** SET-1 à SET-12 par parcours livrables, sans supprimer leurs exigences ni faire croire qu'elles sont déjà développées.

## 1. Objectif produit et parcours critique

**But utilisateur le plus court :** dans une carte déjà créée, ouvrir **Construire → Villages & villes**, choisir un modèle et une zone, voir un aperçu 2D/3D léger, cliquer **Créer**, puis modifier quelques maisons et **Jouer ici**. L'utilisateur peut ensuite changer la richesse, les matériaux ou les maisons **sans perdre ses chemins ni ses retouches manuelles**.

Les 3 premières démonstrations successives :
- **D1 : maison jouable** : murs solides, porte indépendante, accès navigable et interaction valable uniquement côté entrée.
- **D2 : hameau utile** : 8–15 maisons à partir des assets existants + 1 voie principale/2 accès partagés ; aucune route parasite, preview fidèle et commit annulable.
- **D3 : village crédible** : 50–80 bâtiments, centre, rues, parcelles, densité variable, style/richesse cohérents ; rendu/physique validés.

**Règle anti-complexité :** ne pas lancer d'emblée les grandes villes, grottes multi-niveaux, vrais intérieurs de toutes les maisons ni simulation économique. Une fonctionnalité réussit une traversée **source auteur → preview → compilation → joueur → édition/Undo** avant d'être multipliée.

## 2. Tableau de livraison optimisé (vertical slices)

Les tailles **XS/S/M/L/XL** sont des efforts relatifs (risque inclus), **pas des estimations calendaires**.

| Lot | Priorité / effort | Dépend | Implémentation minimum et résultat utilisable | Gate |
| --- | --- | --- | --- | --- |
| **F0 — baseline + garde-fous** | P0 / S | SET-0 achevé statiquement | test/build sur `main`, fixture de carte, scène de collision, benchmark actuel et liste d'assets réellement utilisables | G0 + mesures de départ |
| **F1 — habitat fonctionnel** | P0 / M | F0 | prototype maison + collider mural décomposé + porte entité indépendante, entrée nommée, occlusion d'interaction, persistance | CT-1, CT-2, CT-4 |
| **F2 — Studio « Générer » en vertical** | P0 / M | F1 | panneau minimal, choix zone, 3 profils de hameau, aperçu Canvas2D/overlay, seed, 8–15 maisons et paths existants, 1 `StudioSession.change`, Undo/Redo, Jouer ici | G1, G5 |
| **F3 — graphe + parcelles** | P0 / L | F2 | graphe logique 3D de rues/chemins, raccords aux routes existantes, accès partagés, lots orientés, validation pente/eau/entrées ; 20–80 maisons | G2, CT-3 |
| **F4 — styles + richesse** | P1 / M | F3 | données pour bois/terre/pierre/brique/enduit blanc/chaume, usure, culture, richesse 0–4 ; matériaux et revêtements de route cohérents ; reroll sélectif | G1, G5 |
| **F5 — activités et villages spécialisés** | P1 / M–L | F3–F4 | rôles agriculture/forêt/mine/pêche/commerce, 1 moulin, marché, cabane/feu/forge/port selon disponibilité ; recettes hameau → village portuaire et minier | G2, diagnostics métier |
| **F6 — camps, défenses et port** | P1 / M–L | F3–F5 | campements tentes/yourtes (assets à construire), palissades/porte, remparts, quais bois/pierre, ponton/vente ; accès piéton/charrette, embarquement | G2–G4 |
| **F7 — terriers et cavités** | P2 / M+risque | F1, F3 | dôme simple, porte/fenêtre/cheminée ; grotte décorative d'abord, entrée véritable **seulement si preuve d'ouverture terrain ET collision** | CT-5, CT-6 |
| **F8 — grandes villes + industrialisation** | P2 / L–XL | F3–F7 | quartiers 150–600 bâtiments sur budget mesuré, regen par quartier, stockage/streaming optimisés, perf PC/mobile cible du moteur | G6 et charge à plusieurs densités |

**Voie rapide utilisable : F0 → F1 → F2 → F3.**  
**Voies parallèles après F1 :** préparation du catalogue/style (F4) et des assets nécessaires aux camps/dômes (F6/F7) **sans** bloquer le premier hameau.  
**Gates bloquants :** pas de génération de passages « jouables » avant F1 ; la grotte traversable a un gate indépendant et ne bloque pas les villages en surface.

### Mapping de la roadmap globale

- F0 = SET-0 finalisation de qualification.
- F1 = SET-1 minimal + SET-2 (risque collision/porte).
- F2 = SET-4 minimum + SET-11 UX anticipée.
- F3 = SET-3 + SET-4/SET-5.
- F4 = SET-1 styles + SET-5.
- F5 = SET-7 + SET-8 métiers.
- F6 = SET-6 + SET-8.
- F7 = SET-9 + SET-10.
- F8 = SET-12 transversal, avec SET-11 final.

**L'optimisation et les tests sont transversaux dès F0 ; ce tableau ne repousse pas la performance à F8.**

## 3. Ordre des premières PR (petites, réversibles)

| PR | Contenu technique | Fichiers réutilisés / étendus | Critère pour merger ultérieurement |
| --- | --- | --- | --- |
| **PR-A** | baseline, fixtures et scénarios de collision, aucune feature | `tests/`, `tools/`, scripts existants | CI verte sur base choisie ; pas de faux taux de couverture |
| **PR-B** | porte indépendante + 3–6 volumes simples, test cinématique/occlusion, pas de nouveau moteur | `physics/collision-world.ts`, `physics/definitions.ts`, `gameplay/game-view.ts`, `studio-core/*`, `world-compiler/*` si nécessaire | ouverte : entrée libre et murs solides ; fermée : entrée bloquée ; vol/roulade sans tunneling |
| **PR-C** | recettes données + panneau 3 écrans + aperçu hameau | `studio/shell.ts` (point d'entrée uniquement), panneau dédié, `studio-core/schema.ts`, `session.ts`, `world-data.ts` pour paths | preview=commit, Undo/Redo, save/reload |
| **PR-D** | routes connectées/parcelles/validations sous fonctions pures | `paths/path-geometry.ts` et moteur existant, modules purs `settlements/*`, `studio-core/*` | aucune maison sans accès, aucun faux passage 2D |
| **PR-E** | palettes architecturales/wealth, reroll des maisons indépendant des routes | `world-production/registry.ts`, catalogue, logique styles | mêmes chemins après changement de style, absence de nouveaux GLB obligatoires |
| **PR-F** | métiers & préréglages camps/ports/forteresses, puis dômes et grottes en PR séparées | présets data, `structures/*`, activités, Studio | contraintes respectées ; fonctionnalités non réalisables diagnostiquées |
| **PR-G** | benchmark, optimisations ciblées, ville dense | `render/*`, `runtime/compiled-world.ts`, `physics/*` selon mesures | pas de régression p95/p99, mémoire bornée |

**Hygiène des branches :** créer les branches de feature à partir du `main` le plus récent au moment de coder, reprendre **seulement les docs 65–72 nécessaires**, puis PR ciblées. Ne pas accumuler toutes les features dans la branche documentaire ni merger sans demande.

## 4. Architecture minimale pour coder vite sans dette

```text
Studio module Villages & villes
   -> SettlementDraft (formulaire léger)
   -> planSettlement(recipe, sourceSnapshot)  [pure JS/TS, aucune scène Three.js]
       site.sample -> anchors -> roads -> plots -> prefab placement -> diagnostics
   -> PreviewPlan (Canvas2D et overlay, jamais une seconde scène WebGL)
   -> validatePlan(plan, sourceSnapshot)
   -> applyPlanViaSessionChange(plan) [1 transaction auteur]
       source entités V3 + libraries.paths
   -> compilateur EXISTANT -> collision/logique -> Jouer ici
```

**Pour le MVP :**
- Utiliser des `EntityDefinitionV3`, `PrefabDefinitionV3`, `PathDefinition` et colliders/états existants ; aucun format de monde parallèle.
- Ajouter au maximum **une petite bibliothèque optionnelle versionnée** pour recette/provenance (`libraries.settlements` sous réserve d'extension du parser/compilateur).
- Générer les **ID stables** et tracer propriété source/overrides dans la recette ; ne pas multiplier les entités enfant pour chaque détail décoratif.
- Réutiliser l'outil de sélection/zone/polyline et le renderer de chemins ; le nouveau module gère les choix métier, pas sa propre caméra ni son propre historique.
- Réutiliser les unités mètres Y-up, les chunks et les indexes, et conserver les commandes réversibles. Éviter les mutations directes de sources non hydratées.
- Générer par étapes : **échantillonnage de site borné, ancres, routes, parcelles, maisons**, puis décor et polish uniquement après sélection d'une version.
- Si preview calculée sur une révision devenue périmée : rejeter le commit et recalculer ; pas de modification silencieuse.

## 5. Limites et adaptations de performance dès le départ

- **F2** : maximum 8–15 bâtiments dans la fixture principale ; preview logique basique, sans mesh/collider lourds. Mesurer le temps de plan et commit.
- **F3** : fixture 20–80 bâtiments ; index spatial pour éviter les scans O(n²) terrain/maisons, grille de candidats avec borne stricte d'itérations. Tester plusieurs seeds (au moins 10 par scénario, valeur provisoire).
- **F4–F6** : mutualiser couleurs, matériaux, modèles et modules de rue ; pas de nouveau drawcall par variation de façade si une variante de prefab suffit.
- **F8** : 150/300/600 bâtiments comme **scénarios de charge**, jamais comme garantie de fluidité. Test de vol rapide, étagement, panoramas et port dense. Isoler données compilées, rendu et collision.
- Toujours contrôler CPU de la génération, mémoire du navigateur, volume de JSON compilé (cap de 48 Mio de payload auteur dans le lecteur inspecté), nombre de collisions actives, appels de rendu, p95/p99 et les pics de chargement.
- **Collision d'abord** : ne jamais économiser le CPU en retirant un obstacle solide sur la trajectoire du hamster.
- Code modulaire : calcul sans DOM/Three.js pour routes/scoring/slots ; rendu aperçu séparé ; tests unitaires sur logique ; un seul point d'intégration dans `StudioSession`.

## 6. Définition concrète de « MVP disponible » (sortie F3)

Test utilisateur sur la carte de démonstration :
1. Ouvrir « Construire → Villages & villes ».
2. Choisir **Village rural** puis sélectionner une zone de terrain existante.
3. Choisir **Taille moyenne** et **Style automatique**.
4. Obtenir une proposition avec centre et rues ; faire **Varier les maisons** sans déplacer les routes.
5. Corriger un bâtiment et le **verrouiller**.
6. Régénérer : le bâtiment verrouillé demeure ; maisons et chemins restant accessibles.
7. Créer, sauvegarder, réouvrir, **Jouer ici** ; le hamster marche et plane sans traverser de murs ; les portes ouvertes sont franchissables.
8. Annuler la génération : les éléments ajoutés sont correctement supprimés et les tracés préexistants restent intacts.

Si un seul point échoue, **F3 n'est pas terminé**, même si la ville semble visuellement crédible.

## 7. Principaux risques à tester tôt (ordonnés par coût de reprise)

| Risque | Prévention rapide | Fallback si échec |
| --- | --- | --- |
| Porte fermée/ouvert et « colliders fantômes » | PR-B avec 1 maison, 4 orientations et vol rapide | limiter aux bâtiments extérieurs décoratifs ; bloquer la publication `enterable` |
| Passage multi-niveaux / pont | 1 nœud 3D par altitude + test sous et sur pont | routes/escaliers marqués non navigables plutôt que faux raccord |
| CommandBus saturé par un gros commit | profiler 15 puis 80 bâtiments, plan diff compact | batches auteur contrôlés + journal de restauration explicitement testé |
| Prévisualisation trop lourde | Canvas2D et minimap, 3D seulement sur demande | preview 2D déterministe + diagnostics |
| Générateur lent sur relief extrême | grille basse résolution + index + itérations bornées | réduire candidats et proposer autres zones |
| Caves et entrées dans heightfield | preuve de terrain **et collider** ouverts | grotte décorative seule, sans promesse d'entrée |
| Multiplier trop vite les variantes d'assets | formes + matériaux + présets, réutilisation GLB | limiter aux assets disponibles |
| UI trop chargée | 5 paramètres principaux, étapes et options conditionnelles | presets simples + Mode avancé |

## 8. Tests et revue par PR

Chaque PR indique : `SPECIFIED` / `IMPLEMENTED` / `TESTED` / `BENCHMARKED`, ainsi que les suites exécutées et l'état CI. Ne pas annoncer de succès avant exécution.

Commandes déjà déclarées dans `package.json` à cibler (selon code touché) :
```bash
npm run typecheck
npm test
npm run build
npm run test:studio
npm run test:paths
npm run test:editor
npm run test:gameplay
npm run bench:physics
npm run benchmark
npm run check:world-assets
```
Vérifier disponibilité de l'environnement navigateur avant test ; compléter par tests unitaires propres à `settlements`, regression de conversion V3 et tests de bout en bout. Les chiffres de budget GPU/CPU doivent venir de mesures et non d'estimations.

## 9. Livrables externes attendus

- F1 : démonstrateur de maison collisionnée et interactive.
- F2 : panneau Studio + génération hameau, capture « avant/après ».
- F3 : scène « Village rural 60 maisons » avec rues, chemins et parcelles, plusieurs seeds et diagnostics.
- F4 : mêmes géométries déclinées en profils richesse/style, **sans** toucher la topologie du réseau.
- F5–F6 : recettes agriculture/forêt/mine/pêche/port/fortifié et équipements correspondants.
- F7 : terrier fonctionnel et étude de grotte explorables séparée.
- F8 : benchmarks sur vraie configuration et limites UX/perf documentées.

**Priorité finale : réaliser le plus tôt possible le parcours complet « Générer → Prévisualiser → Ajuster → Sauvegarder → Jouer », plutôt qu'achever successivement tous les sous-systèmes invisibles pour l'utilisateur.**
