# 68 — Roadmap de réalisation et qualification : colonies, bâtiments, accès, collisions

**Statut de l'ensemble : SPECIFIED (documentation).** Branche `docs/studio-settlements-collision-roadmap` depuis `main`.  
Ce document **n'atteste aucune implémentation du générateur**, ni aucune qualification moteur ou GPU ; il définit le plan de travail dans Studio.

**SET-0 — audit statique effectué (17/11/2026) :** [69 — rapport de lecture du code `main`](69-SETTLEMENTS-SET0-AUDIT.md) et [70 — contrats techniques retenus](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md). **Pas de test exécutable ni benchmark** dans ce lot ; les gates CT-0 à CT-9 restent ouverts. SET-1 et au-delà restent non implémentés.

**Chemin critique d'implémentation rapide :** [71 — Fast-track F0 à F8](71-SETTLEMENTS-FAST-TRACK.md), avec les parcours Studio et réglages définis dans [72 — UX de génération](72-SETTLEMENTS-STUDIO-UX.md). Cette roadmap générale conserve tous les gates techniques ; la Fast-track priorise les livraisons complètes et les premières PR.

## 1. Dépendances et règles de développement

Principes :
- conserver **Studio V3** : `StudioSession`, `CommandBus`, `ProjectStore`, `ProjectDocument`, prefabs et `studio-core/schema.ts` ;
- conserver les chemins existants (`PathDefinition`, `paths/path-view.ts`), l'eau, la géographie, les structures naturelles, MINE/AGRI et les interactions déclaratives ;
- isoler logique pure / représentation 3D / physique / UX, sans créer de fichier monolithique ou de seconde boucle de simulation ;
- générer **hors boucle jeu**, prévoir Worker et cache seulement si mesuré ;
- versionner tout nouveau champ de schéma, migrer les anciens projets et tester import/export ZIP et l'île 4 × 3 km ;
- conserver les référents, IDs stables, verrous manuels et transactions réversibles ; préserver futur multijoueur sans l'implémenter ;
- garantir collisions/portes/interactions à toutes qualités graphiques.

**Références** : [65 — périmètre et catalogue](65-SETTLEMENTS-STUDIO-SPEC.md), [66 — implantation/réseau](66-SETTLEMENTS-PLACEMENT-NETWORK.md), [67 — physique et interactions](67-SETTLEMENTS-COLLISIONS-INTERACTIONS.md).

## 2. Phases et livrables

| ID | Priorité | Travail à réaliser | Livrable / gate |
| --- | --- | --- | --- |
| **SET-0** | P0 | Auditer code actuel : assets, V3, génération, routes, collisions runtime, nav, portes, structures naturelles, outils Studio ; mesurer baseline | inventaire `AVAILABLE / PARTIAL / MISSING`, choix d'extension V3, tests baseline |
| **SET-1** | P0 | Catalogue de rôles, formes, matériaux, règles culturelles/richesse, dimensions/pivots/points d'accès ; schémas validés | recettes + prefabs versionnés, migrate/parse |
| **SET-2** | P0 | Broadphase, volumes simples et composés, collision des ouvertures, surfaces navigables, inspecteur de collisions | prototypes porte, mur, toit, escalier, pont ; aucun ghost collider |
| **SET-3** | P0 | Graphe de routes/chemins/accès et raccordement aux chemins existants, ponts/escaliers | connexion routière en 3D, dessertes partagées, chemins continus |
| **SET-4** | P0 | SiteAnalyzer, contraintes terrain, zones réservées et cartes d'influence | placement impossible bloqué ; calcul borné, reproductible |
| **SET-5** | P0 | Quartiers, parcelles, fronts de rue, moteur de choix bâtiments par richesse/activité/matériaux | villages 20–80 maisons cohérents ; porte vers accès |
| **SET-6** | P1 | Campements (tentes, yourtes), cabanes forêt, feux et logiques de clairière/altitude | 3 camps de test, collisions et interactions |
| **SET-7** | P1 | Fermes, granges, moulins à vent/eau, scieries, mines, fonderies, forges, commerces | chaînes logistiques cohérentes, diagnostics si impossibles |
| **SET-8** | P1 | Ports bois/pierre, quais, entrepôts, poissonnerie, marchés ; remparts, palissades, châteaux | accès terrestres et embarcadères, enceintes franchissables seulement par portes |
| **SET-9** | P1 | Terriers et dômes (porte/fenêtre/cheminée), maisons en pente, variantes enduites | dôme low-poly, accès et fondation validés |
| **SET-10** | P1, après faisabilité | Grottes de falaise décoratives puis véritables entrées et espaces traversables, interop MINE/structures naturelles | preuve d'ouverture terrain **et collision**, pas faux passage |
| **SET-11** | P1 | UX Studio : assistant « Générer colonie », preview plan, diff, verrous, régénération ciblée, Undo/Redo | une transaction, aucune perte d'édition manuelle |
| **SET-12** | P0 transverse | LOD, instancing/batching, streaming/collision préchargée, tests perf + intégration | gates qualité et budget, documentation de mesures |

**Ordre de réalisation recommandé** : SET-0 → SET-1 → **SET-2 en parallèle du design SET-3** → SET-3 → SET-4 → SET-5 → SET-6/7/8/9 → SET-10 → SET-11 (premier aperçu dès SET-4) ; SET-12 transversal **dès SET-0**.

### Découpage logique des modules — pistes, pas noms imposés

```text
src/settlements/
  schemas / catalog / styles / economics / seeded-random
  site-analysis / anchors / road-graph / parcel-planner / building-solver
  placement-validation / diagnostics / generation-diff
src/studio/
  panneau de génération de colonies + aperçu/inspecteur
src/studio-core/
  extensions validées de schémas, résolution/transaction/migration
src/paths/
  topologie et transitions de surfaces (réutilisation du renderer)
src/structures/
  terriers et grottes (interop naturelle et terrain)
src/gameplay/ et système de collision existant
  points d'interaction, portes, volumes, navigation et locomotion
tests/
  suites unitaires déterministes + intégration navigateur et perf
```

Ne pas ajouter ces dossiers avant SET-0 : valider les modules existants réutilisables et éviter le doublonnage.

## 3. Scènes de référence et recettes de qualification

| Scène | Contenu obligatoire | Démonstration |
| --- | --- | --- |
| **S1 — Hameau pauvre rural** | terre, bois, chaume, 10–20 maisons, ferme, chemin unique partagé | matériaux modestes + dessertes non redondantes |
| **S2 — Village forestier** | rondins, cabanes, bûcherons, feu, scierie, accès sentier | clairières et volumes de sécurité |
| **S3 — Village agricole mixte** | 50–80 maisons, place, ferme/grange, champs, moulin vent/eau selon terrain | centre/périphérie, production, porte/route |
| **S4 — Bourg marchand prospère** | maison pierre/brique/enduit, rue et place pavées, commerces, marché | richesse ↔ revêtements ↔ métiers |
| **S5 — Port bois/pierre** | quai, pontons, échoppes de pêche, entrepôt, accès bateaux | réseau piéton/logistique + embarquement |
| **S6 — Campements** | tentes, yourtes, cabanes, feu, haut de col/forêt/route | dégagement, accès et placement contextuel |
| **S7 — Terriers** | maisons dômes, portes, fenêtres, cheminées, pente douce | collision et silhouette sans terrain fantôme |
| **S8 — Falaise troglodyte** | entrée décorative puis traversable, terrasses, escaliers, multi-niveaux | portail réellement ouvert dans collision + nav |
| **S9 — Fortification** | remparts/palissades, tours, porte actionnable, château | continuité des enceintes et des routes |
| **S10 — Traversée rapide** | vol rapide, roulade, pont, toit, falaise, porte | zéro traversée parasite, même logique en 20/30 FPS |

Exécuter plusieurs seeds sur une même géographie, plusieurs géographies sur une même recette, et au moins une répétition complète sauvegarde → réimport → jeu.

## 4. Tests automatisés nécessaires

**Unitaires (Node, déterministes)**
- contraintes sur sols/pentes/eau/forêts, colliers de volumes, portes et dégagements, relations métier/site ;
- coût/largeur/surface du réseau, continuité des voies et des changements de matériaux ;
- stabilité d'IDs et plans sous graines, ordre de chargement des secteurs, nombre d'itérations borné ;
- cohérence du scoring et signalement des rôles impossibles ;
- schémas V3, validation/migration avec anciennes cartes et rollback de transaction ;
- invariance collisions/logique indépendamment du LOD.

**Navigateur / playtest**
- déplacement de l'acteur à pied, course, roulade, saut, planage rapide ; collision des murs, façades, portes et plafonds ;
- traversée de terriers/grottes/portes/escaliers, entrée et sortie de port/bateau/nage ; pas de pseudo-ouverture bloquée ;
- achat/vente/collecte/dialogue à la bonne portée, interaction bloquée par une paroi si occlusion requise ;
- edition/Undo/Redo, écran de validation, régénération locale, verrouillage, save/load et « Jouer ici ».

**Performances**
- mesures séparées Studio génération/preview et jeu en mouvement : temps CPU, p50/p95/p99, nombre de colliders actifs, draw calls, triangles, mémoire JS/VRAM estimée, GC, uploads, chargement de secteurs ;
- benchmark colonie vide / 20 / 80 / 300 / 600 bâtiments, région dense, vue proche, panorama, approche en planeur ;
- 30 FPS nominaux et 20 FPS de secours selon [11](11-LOW-RESOURCE-POLICY.md) ; ne jamais sacrifier collision ou interaction pour respecter le FPS ;
- benchmarks sur **GPU intégré et Firefox/Chrome** avant toute prétention de performance ; SwiftShader/headless = signal de régression seulement ;
- budgets numériques détaillés à fixer **après baseline SET-0** : ne pas réutiliser des chiffres estimés comme seuils de release.

Suites existantes à réutiliser selon couverture : `npm test`, `npm run typecheck`, `npm run build`, `npm run test:studio`, `npm run test:paths`, `npm run test:selection`, `npm run test:geo-edit`, `npm run test:lights`, `npm run test:cliffs`, `npm run benchmark`, `npm run test:render-budget`. Ajouter des tests ciblés plutôt que grossir une suite monolithique.

## 5. Gates bloquantes (Definition of Done par livraison)

| Gate | Preuve exigée |
| --- | --- |
| **G0 — compatibilité** | projet V3 parse, anciennes maps et fixtures inchangées, tests existants verts |
| **G1 — déterminisme** | plan identique pour même seed/recette/source ; sous-seeds locales stables |
| **G2 — accessibilité** | 100 % des entrées requises connectées ; aucune route bloquée ou fausse jonction multi-niveaux |
| **G3 — collision** | passages ouverts réellement libres ; murs/portes fermées solides ; pas de tunneling sur scénarios rapides |
| **G4 — gameplay** | triggers, portes, achats/objets, état/sauvegarde cohérents entre rendu proche et lointain |
| **G5 — édition** | preview fidèle, diff explicite, une transaction, Undo/Redo, verrous préservés, invalidation ciblée |
| **G6 — rendu/ressources** | pas de fuite mémoire, régression de perf mesurée et documentée, budgets globaux PERF respectés |
| **G7 — publication** | CI verte, exemples Studio/jeu, aucune fusion ou diffusion implicite |

En cas de blocage G2/G3, **ne pas rendre l'objet jouable** : conserver le placement en alerte Studio, ou proposer une variante décorative clairement étiquetée.

## 6. Suivi d'état recommandé

| Lot | SPECIFIED | IMPLEMENTED | TESTED | BENCHMARKED | RELEASED |
| --- | --- | --- | --- | --- | --- |
| SET-0 audit statique et contrats | Oui + rapport [69](69-SETTLEMENTS-SET0-AUDIT.md) / contrats [70](70-SETTLEMENTS-TECHNICAL-CONTRACTS.md) | Audit documentaire réalisé ; tests baseline encore requis | Non exécutés | Non | Non |
| SET-1…SET-12 | Oui (présent document) | Non implémentés | Non | Non | Non |

Les futures PR préciseront les chemins modifiés, tests exécutés, mesures avant/après, choix/risques, statut exact et ce qui reste incomplet. **Aucun merge vers `main` dans cette branche de documentation.**

## 7. Première itération concrète recommandée

Construire **sur une petite zone existante** une scène de test comprenant 1 route principale pierre/terre, 1 chemin partagé, 6 maisons (bois, terre, pierre, brique, enduit, dôme), 1 cabane avec feu, 1 tente, 1 forge/atelier, 1 porte actionnable, 1 pont/escaliers et 1 entrée de grotte décorative.

Cette scène force à valider **volumes/accès/portails/réseau/transactions avant** de demander 80 ou 600 bâtiments. Ensuite seulement étendre la génération automatique par lots et ajouter une grotte réellement traversable avec preuve de faisabilité du terrain.
