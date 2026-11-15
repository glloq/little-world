# 50 — Studio A/B : Régions géographiques et recettes écologiques

Branche : `feat/studio-creation-workflows-v1`. Aucun merge automatique dans `main`.

## Campagne A — Géographie de la carte

Le nouveau module **Régions** (barre **Monde**) rassemble les étapes de délimitation et de génération d'un espace. La création utilise **le même outil polygonal 3D** que les autres formes du Studio : clic pour poser les sommets, glisser une poignée pour déplacer un sommet, Entrée pour valider, Échap pour abandonner. De 3 à 48 sommets, dans les limites du monde, sans auto-intersection.

Chaque région est une source V3 éditable dans le registre facultatif `libraries.regions`. Elle dispose d'un nom, d'un identifiant stable, de sa géométrie, d'une recette, de sa graine et d'un historique de génération. La source est sauvegardée dans le ZIP et peut être rééditée indépendamment. Les projets anciens sans `regions` restent valides.

### Relief

La région peut créer **un plateau polygonal** (altitude et largeur de transition), comme `ReliefFeature` native du Geography Engine. Une seule forme est enregistrée dans `world.terrain.archipelago.features`, sans maillage de terrain supplémentaire. Les reliefs déjà présents continuent à être modifiables dans **Carte globale > Formes** : montagnes, crêtes, vallées, volcans, falaises, etc.

L'ancien moteur de relief et le heightfield restent l'unique autorité. Les edits manuels du relief ne sont pas écrasés par un second générateur.

### Rivière guidée

L'action **Tracer une rivière automatique** utilise deux points : source et direction initiale. `planGuidedRiver` réutilise `traceDownhill`, puis `compileWaterNetwork` avant toute validation. Les règles appliquées sont celles du projet, y compris la continuité, la descente, les limites du monde et la profondeur de creusement. Lorsqu'un exutoire est identifiable à proximité, le tracé est raccordé au lac ou à la rivière ; un exutoire marin est conservé lorsque la mer est atteinte.

Le tracé est un `WaterBody` V3 classique, consultable et modifiable depuis **Eau**. Les cours d'eau qui ne descendent pas ou provoquent une erreur du réseau sont refusés. Le contour proposé est visible en 3D pendant la création.

**Limites A :** pas encore de génération globale de bassins versants ni de placement automatique de cascades, barrages, ponts ou quais. Le relief polygonal direct est actuellement un plateau ; les crêtes, vallées et falaises avancées utilisent encore l'outil de formes 2D. Le rendu d'une rivière longue peut nécessiter une retouche humaine.

## Campagne B — Recettes régionales

Huit recettes initiales : **forêt**, **prairie**, **marais**, **montagne**, **plage/littoral**, **volcanique**, **lande** et **village/clairière**.

Chaque recette associe des codes déjà reconnus du Geography Engine aux masques `biome`, `moisture`, `geology`, `material` et, si nécessaire, `occupation`. La couche corrigée reste dans les secteurs V3, à la résolution existante de 16 × 16 cellules par secteur. Le rendu, les matériaux et les espèces végétales continuent à provenir des profils d'écosystèmes et de l'habillage **instancié** du moteur. Aucun arbre ni buisson n'est créé comme nouvelle entité par la recette.

- **Couverture (0–100 %)** : proportion de cellules géographiques corrigées, sélectionnées de façon déterministe à partir de la graine.
- **Transition (0–150 m)** : dégradé probabiliste près de la frontière polygonale afin de laisser apparaître les valeurs géographiques de la région voisine.
- **Graine** : même contour, même recette, même graine donnent le même masque.
- **Aperçu** : nombre de secteurs, de corrections possibles et de corrections préexistantes protégées.

**Attention :** couverture de masques ≠ densité d'arbres dans la forêt. La densité fine et le choix des espèces restent contrôlés par `world-production/biotopes.ts`. Modifier les mélanges de végétation par région sera l'étape B suivante.

### Régénération non destructive

L'historique `generated.masks` mémorise uniquement les cellules peintes par cette recette. Lors d'une modification, d'un déplacement de la région ou d'une suppression :

1. Chaque ancienne cellule n'est effacée que si sa valeur est **toujours celle enregistrée** lors de la génération.
2. Une cellule repeinte par l'auteur avec une autre valeur reste intacte.
3. Le nouveau contour ne peint que les cellules libres ; les corrections d'une autre région ou d'un autre outil sont protégées.
4. Les plateaux utilisent une empreinte stable : une forme modifiée manuellement est conservée, sans écrasement silencieux.
5. Tout l'ensemble est une seule transaction `StudioSession.change`, avec Undo/Redo.

Ce système n'a pas besoin d'une deuxième table de biotopes dans le runtime. La bibliothèque sert à la réédition ; les masques et formes générés sont la source de vérité à l'exécution.

**Limite :** si une correction manuelle remplace une valeur générée par **la même valeur exacte**, elle ne peut pas être distinguée d'une cellule inchangée ; cela reste une limite du suivi par valeur. Les régions se superposant ne sont pas recomposées automatiquement en couches : la seconde recette respecte les masques déjà peints.

## Budgets et sécurité

| Ressource | Limite |
| --- | --- |
| Polygone | 3 à 48 sommets |
| Région | 256 secteurs affectés au maximum |
| Registre | 250 régions |
| Altitude du plateau | 0 à 1 200 m |
| Transition écologique | 0 à 150 m |
| Ressources GPU de la recette | Aucune géométrie propre ajoutée |
| Plantes individuelles produites | 0 |
| Tracé de rivière | 90 points au plus et 4 km demandés au maximum |
| Undo/Redo | 1 transaction V3 par opération |

La grille de masques est déterministe et produite à la création/régénération, non à chaque frame. Le suivi des cellules reste compact (chaînes de 256 caractères par couche/secteur). Les changements des zones entraînent la mise à jour des secteurs de la carte et de l'habillage existants. Aucun asset 3D, texture, shader ni nouveau moteur de scène n'est nécessaire.

## Vérifications

- `tests/studio-region-recipes.test.mjs` : polygones invalides, masques déterministes, protections, déplacement de régions, suppression, plateau, ZIP et Undo/Redo.
- `tests/studio-guided-river.test.mjs` : pente, profil hydrologique, raccordement à la mer, paramètres invalides et refus de courant stagnant non raccordé.
- `tools/test-studio-regions-browser.mjs` : création de région en vue 3D, paramétrage, ZIP, réédition, Undo et capture d'écran.
- Workflow ciblé : `.github/workflows/studio-regions.yml`.
- Suite générale : `npm test`, `npm run build` et scénarios navigateur.

Avant publication : inspecter dans le navigateur une carte de 1 km² avec plusieurs régions adjacentes, enregistrer/exporter puis réimporter, vérifier l'interface de transition entre forêt/marais/montagne, contrôler les rivières dans le module Eau et mesurer la réactivité sur CPU/GPU économiques.

## Suites A/B proposées

1. **A2** : éditeur de falaises/crêtes/cols directement en 3D avec profils paramétriques et transitions.
2. **A3** : graphes hydrologiques interconnectés, placement de cascades, zones de réception et validation de bassins.
3. **B2** : profils personnalisables par région (densité réelle arbres/arbustes/herbes, mélange d'espèces, exclusions par type) sans entités individuelles.
4. **B3** : régénération progressive de plusieurs régions avec couche d'édition et comparateur de changements avant validation.
