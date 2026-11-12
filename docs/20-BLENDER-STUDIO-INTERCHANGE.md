# 20 — Blender ↔ Little World Studio : assets, presets et cartes importables/exportables

**Choix validé par le créateur :** Blender est le **modeleur 3D de référence**, Little World Studio reste le **composeur de monde, éditeur de biotopes, végétation, relief local, interactions et tests**. Les modèles et ensembles low-poly sont **réutilisables**, placés avec **translation, rotation et échelle**, et importables/exportables. Éviter de recréer dans le Studio un éditeur de sommets, UV, rigging ou matériaux générique.

**Statut : spécification cible, pas une fonctionnalité déjà entièrement implémentée.** Le prototype V2 dispose de placements simples, d'un catalogue et de ressources GLB, mais **pas** d'un import/export général de scènes Blender, d'archives complètes V3 ni d'un pipeline automatique de presets/LOD. Préserver V1/V2 pendant la migration.

Références : [03 — Géographie](03-WORLD-GENERATION.md), [05 — Architecture](05-TECHNICAL-ARCHITECTURE.md), [06 — Assets](06-ASSET-PIPELINE.md), [07 — Roadmap](07-ROADMAP.md), [09 — Tests](09-BROWSER-TEST-PLAN.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix](14-TECHNICAL-CHOICES.md), [15 — Données V3](15-STUDIO-DATA-SCHEMAS-V3.md), [17 — Horizon](17-DISTANT-VIEW-RENDERING.md), [18 — Herbe](18-GRASS-LOW-RESOURCE.md) et [19 — Environnement](19-ENVIRONMENT-WEATHER-SKY.md).

## 1. Décision : trois couches, pas un fichier magique unique

1. **Sources de création** : fichiers `.blend`, éventuels heightfields et textures source, sauvegardés par l'auteur ; `.blend` est pratique mais **format propre à Blender**, pas le format d'interopérabilité du jeu.
2. **Ressources ouvertes interopérables** : **glTF 2.0 (`.glb` préféré pour le transport)** pour meshes, matériaux compatibles, hiérarchies et positions ; **JSON versionné** et heightfields accompagnés d'un manifeste pour les données non glTF. glTF n'encode **pas** toute la logique de carte, le climat, les biotopes, la navigation et les sauvegardes.
3. **Projet Little World Studio V3** : sources de terrain par secteur, biotopes, eau, routes, placements, prefabs, PNJ, événements et références, assemblés et compilés en **manifeste + paquets de secteurs** à la publication.

La **source autoritaire du monde jouable est le projet V3**, jamais les meshes GPU. Une scène Blender peut fournir un paysage, des ensembles et des transformations, mais ne remplace pas les règles et états du Studio.

**Trois actions distinctes** dans l'UI :
- **Importer un asset ou un preset** (géométrie ou groupe) ;
- **Importer/mettre à jour une scène Blender** (ensemble de placements sélectionnés, avec aperçu de différences) ;
- **Importer/exporter un projet de carte complet** (archive Studio, données et dépendances, résultat éditable).

Ne pas présenter un export GLB seul comme une sauvegarde/restauration intégrale du monde.

## 2. Matrice des formats

| Contenu | Source auteur conseillée | Échange Blender ↔ Studio | Stockage Studio / jeu |
| --- | --- | --- | --- |
| Objets, rochers, arbres, maisons | `.blend` | **`.glb`** ; éventuellement `.gltf` + fichiers référencés validés | Asset catalogue + prefab versionné + instances |
| Ensembles/ruines/ports/ponts | `.blend` avec hiérarchie et pivots | **`.glb` scène/collection** avec nodes ; sidecar JSON si propriétés avancées | Prefab composé, enfants, points d'attache, règles d'habillage |
| Placement/transforms | Blender Collections/Objects | Nodes glTF + `extras` whitelisted ou **JSON sidecar** versionné | `EntityDefinitionV3.Transform` (position XYZ, quaternion, scale XYZ, parent) |
| Relief heightfield (îles, collines, vallées) | Mesh Blender compatible heightfield / données de hauteur | **Heightfield 16 bits + métadonnées** de dimensions/altitudes/origine ; format binaire ou PNG 16 bits après test de fidélité | Terrain source V3 sectorisé + LOD compilés |
| Relief non heightfield (falaises, grottes, arches, surplombs) | Blender mesh | **`.glb`** ; collisions séparées/simplifiées ou définies au Studio | Modules 3D référencés, volumes/portails |
| Biotopes, densité, peuplements | Studio et/ou cartes de masques raster Blender | **JSON de zones + masques explicites** (UV/monde) si importés | `BiomeZone`, profils de végétation, seed et exclusions |
| Eau/chemins/ports | Studio (splines et volumes) ; repères Blender optionnels | JSON/manifest V3 ou marqueurs strictement typés | Sources Studio V3, pas simples meshes d'eau |
| PNJ, dialogues, triggers, quêtes, météo | Studio | **Archive V3 uniquement** ; édition Blender optionnelle des points d'ancrage | Composants/états V3, pas `extras` arbitraires |
| Carte complète rééditable | Studio | **ZIP standard + JSON versionné + GLB + heightfields et dépendances** | Archive auteur V3, séparée du build runtime |
| Build jouable | Compilateur Studio | Manifest + secteurs + assets GLB compressés au besoin | Statique, chargé spatialement ; ni `.blend` ni archive auteur requise |

**Open source / ouvert** : glTF, JSON, ZIP et données heightfield avec métadonnées explicites. `.blend` est conservé **en supplément pour l'édition Blender**, pas imposé au runtime. Les `.blend` ne sont pas à traiter comme actifs dans le navigateur.

## 3. Workflow Blender → Library → Studio

```text
Blender (.blend)
  ├── Asset simple (.glb) ───┐
  ├── Groupe/collection GLB ├──► Import validation ──► Library/Registry
  └── Terrain / masques ────┘            │                   │
                                      Preview             Prefab/Variant
                                                          │
Studio (projet V3) ◄── placement/gizmos/biotopes/peinture ─┘
        │
        ├── Export projet complet ZIP (rééditable) ──► Import Studio
        ├── Export sélection/scène GLB+JSON ────────► Blender et retour
        └── Compilation runtime par secteur ───────► GitHub Pages
```

**Asset simple** : import du GLB, extraction des meshes/meshes secondaires, vérification du pivot, unités, dimensions, textures, animations et coûts. Créer une référence stable `assetId` + entrée catalogue, éventuellement une `PrefabDefinitionV3`.

**Collection Blender** : garder un **root prefab** et une hiérarchie d'enfants avec `childKey` stables ; ne pas fusionner les objets si leurs éléments doivent être sélectionnables ou interactifs (porte, charnière, coffre, roue). En revanche, autoriser un **merge de meshes purement décoratifs** à la compilation si rentable.

**Preset composite** : une tour en ruine avec murs/arches/portes/points d'intérêt peut combiner les refs d'assets GLB + placements relatifs + exclusions + profil de végétation « envahie » + éventuelles interactions déclaratives ajoutées dans Studio. Le GLB **ne doit pas** porter de scripts ni de logique exécutée.

**Replacer un preset** crée une **instance distincte**, avec ses propres IDs stables et overrides de transformation/densité/variante. Une modification du prefab peut être propagée avec aperçu des conflits et sans écraser les overrides de l'instance.

**Mise à jour de ressource** : proposer `Remplacer la géométrie du même assetId` avec contrôle de compatibilité/aperçu, et `Importer comme nouvelle variante/assetId`. Vérifier pivots, bounds, noms de points d'ancrage, matériaux et hiérarchies avant remplacement.

## 4. Contrat de coordonnées, transformations et pivots

**Monde Studio :** mètres, **Y vertical**, `X/Z` horizontal ; référentiel mondial stable partagé avec source de terrain, physique, rendu et coordonnées V3. **Blender natif : Z vertical**. L'export glTF de Blender réalise normalement la conversion ; appliquer une conversion **une seule fois** et documenter la configuration utilisée. Contrôler l'orientation via une scène étalon : plan au sol, axes XYZ et objet asymétrique.

**Transform complète** :
- translation `position: {x,y,z}` en mètres ;
- rotation `quaternion: {x,y,z,w}` (rotation autour de Y simplifiée affichée par défaut dans l'UI) ;
- échelle `scale: {x,y,z}`, avec commande **uniforme par défaut** et non uniforme possible seulement si mesh/collider/matériau le supportent ;
- `parentId/childKey` hiérarchiques, et mode `alignToTerrain`/snap **optionnel**, pas modification permanente du mesh source.

**Pivots** : origin au sol pour arbres/bâtiments en général ; pivots spécialisés pour portes, roues, charnières et points d'attache. Une rotation ou une échelle ne doit pas déplacer involontairement l'ancrage logique. Les transformations négatives ou quasi nulles doivent être explicitement refusées ou traitées après validation de normales/culling/collisions ; éviter de mélanger coordonnées locales/mondiales et d'appliquer deux fois une rotation de conversion.

**Format sidecar indicatif, non encore API publiée :**

```json
{
  "schemaVersion": 1,
  "kind": "little-world-blender-scene",
  "sourceSceneId": "author-harbor-v1",
  "units": "meters",
  "axes": "Y_UP",
  "instances": [
    {
      "sourceNodeKey": "dock/bridge_01",
      "entityId": "bridge-port-west",
      "prefabId": "bridge.wood.01",
      "position": [120, 6, -58],
      "rotation": [0, 0.3826834, 0, 0.9238795],
      "scale": [1, 1, 1]
    }
  ]
}
```

Le sidecar peut aussi porter un hash de source/asset et un schéma de version ; les métadonnées glTF `extras` sont facultatives et **non fiables**. Ne jamais attribuer un `entityId` issu de Blender sans contrôle d'unicité/provenance. Les noms visibles d'objets Blender **ne suffisent pas** à servir d'IDs immuables.

## 5. Trois workflows d'export de carte à ne pas confondre

### A. Archive Studio complète — export/import sans perte des données supportées

**Objectif** : un projet créé sur machine A doit pouvoir être réouvert sur machine B **sans perdre relief, biotopes, eau, placements, PNJ, dialogue, objets, interactions, IDs ou références**.

Structure **proposée** (ZIP standard ; noms évolutifs avant implémentation) :

```text
my-little-world.zip
  manifest.json                 # formatVersion, worldId, limites, hashes, licences
  world/
    index.json                  # table secteurs et ressources, compilation non requise
    chunks/<cx>_<cz>.json       # sources locales, biotopes, overrides, placements
    terrain/<cx>_<cz>.bin       # heightfield SOURCE si utilisé + metadata
    masks/<cx>_<cz>.*           # masques explicites facultatifs
  library/
    assets.json                 # assets IDs, versions, hashes, origine et licences
    prefabs.json                # composites, enfants/variants et paramètres
    assets/<assetId>/model.glb  # ressources nécessaires, en mode portable
    authoring/                  # .blend éventuels seulement sur demande explicite
  logic/
    dialogues.json
    interactions.json
    behaviours.json
  environment/
    definition.json             # météo, soleil, lunes, régions climatiques
```

**Modes d'export** :
1. **Portable autonome (recommandé)** : ZIP embarquant **tous les assets nécessaires** pour ouvrir la carte hors ligne, dont modèles et éventuels masques/heightfields ; afficher taille, licences et dépendances.
2. **Léger par références** : manifeste + sources et dépendances adressées par IDs/hash, **non autonome** ; l'indiquer clairement, refuser l'import complet sans ressources disponibles.
3. **Build jouable** : export compilé distinct (chunks et proxies dérivés, assets optimisés) ; **ne remplace jamais** l'archive auteur rééditable.

Exporter la **source intacte et des refs**, pas un dump de tous les objets de Three.js. Les caches GPU, effets de pluie, herbes instanciées et ressources d'horizon compilées sont **recréables** et ne sont pas la vérité auteur.

### B. Export scène/zone/sélection vers Blender — réédition géométrique

Exporter au choix :
- **un prefab** isolé ou ses sous-meshes, avec axes/pivot contrôlés ;
- **une sélection ou zone** de carte sous forme **GLB de scène + sidecar JSON** de correspondance avec les IDs/hiérarchies des instances ;
- **un relief** en mesh GLB pour contexte Blender **et/ou** heightfield source + métadonnées (les masques V3 restent des fichiers séparés).

**Limite explicite** : cet export Blender est une **vue d'édition géométrique**, **pas** un export intégral de gameplay. Il ne garantit pas la conservation des dialogues, PNJ, biotopes, transitions météo, inventaires, scripts déclaratifs et autres états non glTF.

**Réimport depuis Blender** : comparer les `sourceNodeKey/entityId` et le `sourceHash` au projet courant ; proposer aperçu **ajoutés / modifiés / manquants / conflits** avec choix explicite **mettre à jour**, **importer en copie**, **ignorer**. **Pas de suppression silencieuse** des entités du Studio non présentes dans la scène GLB. Les propriétés V3 non géométriques (références, interactions, biotopes) restent intactes si elles ne sont pas explicitement remappées.

### C. Pack de presets réutilisables — échange entre projets

**Un preset peut être** : (a) asset simple, (b) prefab hiérarchique, (c) ensemble décoratif/lieu complet, (d) preset de biotope/vegetation, (e) combinaison lieu + profils d'habillage + points d'ancrage.

Exporter un **ZIP + manifeste JSON + dépendances GLB/masques** et éventuelles `.blend` sources si l'auteur demande de les joindre ; l'import crée une entrée **Library** versionnée avec prévisualisation, taille/coût, licence, catégorie, variante et références.

- **Mode lien** : une instance référence le `prefabId` original ; correction du prefab propagée suivant les règles/overrides.
- **Mode copie indépendante** : nouveau `prefabId` pour variation locale volontaire, avec provenance.
- Si IDs déjà utilisés : comparer hash/version, **ne pas écraser automatiquement** ; remapper les IDs et les références internes en une seule opération, ou mettre à jour après examen.
- Les presets avec logique, dialogues et zones doivent embarquer leurs **dépendances logiques valides**, sans générer des refs cassées.

Le même mécanisme sert à transférer une forêt aménagée, une maison, une ruine, un pont ou une zone d'habitat entre deux cartes.

## 6. Blender et terrain : ne pas rendre tout le monde monolithique

**Terrain heightfield** recommandé pour les plaines, collines, vallées, îles et reliefs accessibles : import de hauteur comme **données numériques** plus métadonnées `widthM/lengthM/origin/minHeight/maxHeight/sampleCount/encoding`. Préserver les sources à haute précision pour l'édition ; LOD compilés séparément.

- **Ne pas déduire les altitudes du pixel d'un PNG 8 bits** ; si PNG16 utilisé, vérifier le véritable chemin de décodage 16 bits. Une **grille binaire 16 bits ou float** avec bornes/endianness connus est une alternative à comparer.
- Un heightfield ne peut pas représenter **plusieurs hauteurs à (x,z) identique** : arches, grottes et surplombs restent en meshes GLB posés/raccordés au terrain, avec zones de masquage/entrée explicites.
- Les retouches de relief dans Studio se stockent en **overrides** (ou source éditée versionnée), et ne modifient pas silencieusement le `.blend` de l'auteur.
- Les grands exports Blender doivent être **découpés par zones/secteurs au compilateur**, pas devenir un `glb` de 100 km² chargé d'un bloc.
- Lors de réimport : une zone sculptée depuis Blender et une zone localement modifiée dans Studio peuvent entrer en conflit ; proposer **conserver overrides locaux / remplacer explicitement / comparer**, jamais écraser les modifications auteur.
- **Collisions** : proches, simples, versionnées, potentiellement dérivées d'un mesh proxy/collider explicite. La géométrie d'horizon et l'apparence enneigée n'influencent jamais collisions ou navigation sans décision dédiée.
- **Eau/chemins** : garder des splines/volumes source V3. Une géométrie GLB servant de décoration ne crée **pas** une rivière navigable par simple apparence.

## 7. Import des biotopes, végétations et masques

Le Studio doit conserver les contrôles simples de **peinture du biotope**, de densité, de hauteur, de variantes et d'exclusion, même lorsqu'un paysage provient de Blender.

- Les zones peuvent être dessinées dans Studio ; option d'import de **masques spatiaux** produits par Blender, via **origine, taille, résolution, coordonnées et convention** explicites (pas un masque libre sans géoréférencement local).
- Les masques classent **forêt, prairie, marais, désert, roche, littoral, eau, village**, etc. ; les catégories existantes V2 migrent sans perte et les nouveaux IDs de biotope doivent être **versionnés**.
- Les végétaux sont **générés par seed/version/secteur et recettes**, pas enregistrés en GLB milliers de fois : arbres instanciés, herbe économique du [document 18](18-GRASS-LOW-RESOURCE.md), faune à cadence locale.
- **Prefab d'habitat** : règles du type `overgrownRuins`, `pineForest`, `marshEdge`, définissant végétation à semer et zones interdites ; évitent d'encapsuler des milliers de plantes dans un modèle de ruine.
- Un artiste peut fournir quelques **arbres héros placés à la main** et la distribution automatique pour les autres ; les deux ont des responsabilités distinctes.
- Peindre le terrain, changer l'objet ou remplacer un modèle **n'invalide que les secteurs et dépendances touchés** (végétation, navigation, collisions, proxy horizon, masques météo).
- Les paramètres du Studio restent configurables en **mode normal** ; réglages de shaders/LOD/import technique rangés dans un inspecteur avancé.

## 8. Import sécurisé et contrôle de qualité

Toute entrée est considérée **non fiable**, même si elle provient de Blender local.

**Préflight avant validation/commit** :
1. Vérifier ZIP/JSON/glTF/heightfield : **version, taille globale et décompressée, nombre de fichiers et de nœuds, profondeur de hiérarchie, tailles de textures et buffers**, types/mime attendus ; éviter ZIP bombs et consommation mémoire excessive.
2. Refuser les chemins absolus, `../`, références extérieures non explicitement autorisées, fichiers exécutables, scripts, expressions ou `extras` arbitraires interprétés comme code.
3. Appliquer allowlist des `extras` / sidecars : IDs, pivots, catégories, zones, labels, repères, collider proxy, liaison de prefab ; **ne jamais exécuter des scripts contenus dans un asset**.
4. Vérifier tous les nombres finis, quaternions normalisables, échelles/axes/units, pivot, topologie/meshes, taille de secteur, limites du monde et répétitions d'IDs.
5. Vérifier et **documenter les extensions glTF réellement supportées** : ne pas affirmer que tout shader Blender (Geometry Nodes, procédural, Blender modifiers, contraintes, scripts, volumes, particules) sera préservé dans glTF. Exiger une conversion/baking dans Blender lorsque nécessaire.
6. Produire une **fiche coût** par asset/preset : triangles, matériaux, draw calls attendus, textures/buffers et animation, tailles transférées, candidats à instancing, LOD/collisions ; avertir/bloquer selon budgets fixés par benchmarks.
7. Vérifier provenance et **licence de redistribution dans le dépôt et le site public** ; ne pas considérer « gratuit » comme redistribuable. Les `.blend` sources et textures optionnelles suivent les mêmes obligations.
8. En cas d'échec : **aucun remplacement du projet actif** ; rapport lisible et action de correction. Import sous transaction atomique avec Undo/Redo et restauration si erreur.

**Sécurité des fichiers** : traitement hors du thread principal pour gros imports si nécessaire ; n'exécuter aucun script Blender ni extension externe automatiquement sur le serveur ou le client. Gérer explicitement les ressources créées/jetées pendant un import annulé (textures, géométries, blobs).

## 9. Optimisation du runtime / faible consommation

- **Une seule géométrie partagée par prefab** et nombreux placements via `InstancedMesh` **lorsque matériau, mesh et conditions le permettent** ; conserver les objets interactifs comme entités logiques distinctes, même si le rendu est instancié.
- Ne pas convertir automatiquement tous les enfants d'un prefab en autant de draw calls si certains éléments peuvent être fusionnés au build.
- **LOD d'assets** : source détaillée + proxy low-poly et éventuellement imposteur d'horizon ; produire/comparer les versions à la compilation. Garder les sources Blender complètes hors runtime.
- Les caches et instancing sont **par secteur/zone visible**, pas un unique mesh pour toute la carte ; streaming et éviction des ressources.
- Si compression Meshopt/Draco/KTX2 étudiée : **mesurer** les gains de téléchargement contre le décodage, la taille embarquée des décodeurs et le coût GPU. Compression non obligatoire tant que les benchmarks ne la justifient pas.
- Budget de textures partagé, matériaux minimalistes/vertex colors, alpha transparent à éviter si possible, ombres limitées aux grandes structures proches ([document 19](19-ENVIRONMENT-WEATHER-SKY.md)).
- Le build jouable ne contient **ni `.blend` auteur, ni archives projet, ni descriptions de sources redondantes**, sauf décision explicite.
- **Pas de téléchargement des assets de 100 km² au spawn** ; les manifestes et bundles permettent un chargement progressif compatible GitHub Pages.
- Les matériaux importés compatibles doivent pouvoir subir la météo/neige via shaders/matériaux intégrés au runtime ; ne pas dupliquer toutes les variantes hiver/été.

## 10. Little World Studio : interface recommandée

**Dans la bibliothèque :**
- **Importer asset GLB**, **Importer preset/pack**, **Importer scène Blender**, avec affichage avant validation de **catégorie**, preview 3D, dimensions, pivot, triangle budget, licence/provenance, noms de nodes, matériaux et LOD.
- **Exporter asset**, **Exporter preset avec dépendances** ; possibilité de conserver le fichier `.blend` source **comme pièce jointe facultative**, mais export GLB disponible pour la réutilisation.
- Différence entre un **GLB visuel**, un **preset logique** et une **carte complète** clairement indiquée.

**Dans l'éditeur de carte/scène :**
- Sélection dans la bibliothèque → clic ou glisser-déposer dans le monde → manipuler via gizmos **déplacement, rotation et échelle**, chiffres optionnels X/Y/Z, rotations faciles autour de Y, échelle uniforme par défaut, boutons **aligner au relief**, dupliquer, grouper/dégrouper, réinitialiser, annuler/refaire.
- Hiérarchie locale des groupes/prefabs, choix de sous-objets lorsqu'ils doivent être éditables. Modification du prefab maître **distincte** des overrides de l'instance.
- **Peinture de biotopes et végétation** même sur terrain importé : style, densité, diversité, hauteurs, exclusions, régénération locale, aperçu et playtest, pas de modélisation manuelle de chaque plante.
- Préflight d'import de carte : **ouvrir en nouveau projet** par défaut ; **fusionner explicitement** avec aperçu de différences/IDs/dépendances, jamais remplacer silencieusement la carte courante.
- **Exporter le projet complet** (ZIP portable), **Exporter la sélection vers Blender** (GLB+JSON), **Exporter le build jouable** : noms/explications distincts pour éviter les pertes.
- Panneau technique avancé (optionnel) : LOD, colliders, volumes, sockets, mapping de markers Blender, masques et budget de triangles; interface normale **simple et claire**.

**Flux de référence** :
1. Modéliser une ruine Blender, exporter GLB.
2. Importer la ruine au Studio, choisir les marqueurs (entrée/portes), vérifier son pivot, générer miniature et prefab.
3. Placer trois copies avec **translations/rotations/échelles différentes**, peindre le biome de ruines et le preset de végétation envahissante.
4. Associer une interaction/énigme via les outils déclaratifs ; sauvegarder.
5. Exporter un **preset réutilisable** de la ruine complète et un **ZIP autonome de la carte**.
6. Ouvrir le ZIP sur un autre poste et tester; réexporter un sous-ensemble vers Blender, changer un mesh, réimporter et **préserver les IDs et interactions non modifiés**.

## 11. Tests d'acceptation et étapes d'implémentation

| Phase | Livraison / gate |
| --- | --- |
| **BL-0** | Inventaire du pipeline actuel ; matrice de formats, scène étalon XYZ, pivots, rotation et unités |
| **BL-1** | Import GLB en catalogue avec préflight, preview, manifest, source/hash/licence, assetId stable |
| **BL-2** | Prefabs/groupes, variantes et instances : translation XYZ, quaternion, scale XYZ, parent/child, gizmos, Undo/Redo |
| **BL-3** | Packs de presets ZIP+JSON+GLB ; import/export portable, références, remap IDs, conflits, provenance |
| **BL-4** | Import relief Blender heightfield et modules GLB + placement sectorisé, biotopes/masques conservés et éditables |
| **BL-5** | **Export/import carte complète ZIP autonome** V3 + contrôle de pertes, migrations V1/V2, préflight |
| **BL-6** | Export sélection/scène vers Blender (`GLB+sidecar`), réimport diff avec maintien IDs/overrides/biotopes et conflits |
| **BL-7** | Build optimisé GLB/LOD/instances, streaming, benchmarks GPU intégré et compatibilité GitHub Pages |

**Cas obligatoires** :
- Blender Z-up → glTF Y-up → Studio Y-up : **1 m et orientation conservés**, sans double rotation, dans une scène étalon X/Y/Z.
- Round-trip transformations de trois copies d'un asset avec rotations XYZ, échelle uniforme et non uniforme admise, parent/enfant et pivots, sans dérive perceptible.
- Un preset de ruine comprenant marqueurs, logique, exclusion végétale et matériaux neigeux revient avec les mêmes IDs internes ou un remapping bijectif explicitement validé.
- Import ZIP de projet complet **hors ligne sur une autre machine** : mêmes heightfields, biotopes, routes, eau, PNJ, dialogues, interactions et références, sans URL privée nécessaire.
- Reimport Blender d'un pont mis à jour : même `entityId` et liens, ajout de sous-mesh sans effacement des flags/dialogues ou remplacements silencieux.
- Import malformé / ZIP-bomb / chemin `../` / extension glTF inconnue / asset manquant : **échec propre, projet ancien inchangé**.
- Recompilation locale après remplacement de mesh, peinture biome ou sculpture ; aucune invalidation globale inutile.
- Vérifier poids initial, draw calls, triangles, pression VRAM, charge et temps de décodage, fuites GPU, 30/20 FPS sur matériel de référence.
- Vérifier **météo/neige/ombres et LOD/horizon** pour le prefab importé, pas seulement l'apparence en éclairage de studio.
- Tester **archive V3 → import V3 → export V3** sans perte logique, avec normalisation déterministe si les zips diffèrent octet pour octet.

**Statut réel du dépôt `main` à la date de cadrage** : `src/world-data.ts` est encore **V2**, avec `Placement` (x, z, rotation, scale facultative) et un catalogue statique ; `src/editor.ts` utilise des gizmos et un brouillon local. **BL-0…BL-7 sont des livrables cibles, pas des fonctionnalités déclarées acquises**.

## Échanges de carte et preset : hydrographie indépendante des meshes Blender

La [spécification 21](21-WATER-HYDROLOGY-LOW-RESOURCE.md) valide un réseau d'eau éditable **distinct de la géométrie GLB**.

- Blender peut créer **falaises, grottes, rochers, ponts, ruines de barrage et habillages de cascade** en GLB ; ces meshes **n'impliquent pas** un niveau d'eau, une rivière navigable ou des collisions aquatiques.
- Le **Studio** garde `WaterNetworkDefinitionV3`, splines/points, cascades haut/bas, lacs, exutoires, profondeurs, courants et overrides, en **données JSON V3** au sein du ZIP portable de la carte.
- Un export de **scène vers Blender GLB+sidecar** peut inclure **des marqueurs d'ancrage** de rivière/chute/port, mais le round-trip géométrique ne remplace **pas** la source hydrographique. Réimport avec aperçu de conflit, aucun écrasement implicite des niveaux.
- **Heightfields importés de Blender** sont échantillonnés avant la génération du lit ; eau/berges et volumes sont compilés localement, secteur par secteur. Ne pas exporter un océan de 100 km² en mesh GLB unique.
- Les **presets de lieux** peuvent inclure `WaterNetwork` partiel (p. ex. petit étang avec cascade) et des références de volumes avec IDs remappés proprement lors de l'import, à condition d'avoir des **interfaces amont/aval** explicites et une validation des raccords.

## Import Blender sous le budget transversal PERF

Voir [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md).

- Le **préflight** d'un GLB/preset/ZIP déclare le poids **CPU/VRAM estimé** et le nombre de matériaux, triangles/texture/meshes ; ne pas confondre le nombre de geometries WebGL et les octets réels.
- Après import, les assets sont **enregistrés avec ownership/références** ; plusieurs instances de la même ruine ne consomment pas chacune une copie GPU. Les ressources ne sont libérées qu'après retrait du dernier consommateur.
- Décodage, génération de miniatures, construction LOD, upload GPU et compilation des secteurs passent par des **jobs priorisés et limités en temps/mémoire**, sans bloquer les gizmos ou écraser le projet si import annulé.
- Un preset portuaire/de grotte/ruine possède des options LOD/proxy et catégories d'importance ; **les paramètres de qualité propres à l'appareil ne font pas partie du format auteur portable V3**.
- Ne pas compiler/charger un monde GLB de 100 km² d'un bloc : géométrie source sectorisée, préchargement selon caméra/vitesse et rendu d'horizon simplifié.
- Benchmark de 100 copies du même prefab, import/export répétés, context loss, suppression/mise à jour, stabilité mémoire après de nombreuses opérations.

## Presets Blender / cartes V3 avec ressources MIDI et échantillons

Le [document 23 — Audio MIDI LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md) ajoute les **sons et partitions** aux dépendances des presets réutilisables.

- Un preset ruine, pont, port, moulin ou forêt peut déclarer des **références `soundId/scoreId/patchId`** et des points d'implantation pour `AudioEmitter`, mais les modèles GLB ne transportent **ni scripts Web Audio ni événements MIDI runtime**.
- L'**archive de carte Studio V3** inclut partitions `.mid`, petite palette de **5–10 patches MIDI**, samples/loops, licences, manifestes et IDs liés ; **pas** de `AudioBuffer` décodés, `AudioContext`, voix ni offsets de lecture.
- L'import d'un pack vérifie **résolution des IDs, droits/licences, taille PCM estimée, contrôle de mapping MIDI** vers la palette existante. Si le pack introduit un onzième instrument, proposer remappage/substitution **explicite**, pas expansion silencieuse.
- Export scène Blender `GLB+sidecar` préserve les **références audio non géométriques** dans V3 ; une mise à jour de géométrie ne supprime pas les sons d'interaction.

## 12. Décisions finales et exclusions

**Validé :** Blender pour fabriquer les modèles/sets low-poly ; `glTF 2.0/GLB` comme échange 3D ouvert ; `.blend` comme source facultative ; Studio pour placements XYZ/rotation/échelle, biotopes/peinture/génération, prefab/groupes et interactions ; import/export de **presets** et de **cartes rééditables**.

**À qualifier** : codec précis de heightfield/masques, limites de complexité/size GLB, quantité d'assets instanciables, variantes LOD, éventuels champs glTF `extras`, qualité de réimport de scène, surcoût des textures compressées.

**Hors cible** : refaire Blender dans le navigateur, exporter toutes les données de gameplay dans un GLB seul, stocker chaque touffe dans le zip, accepter du script non sûr depuis les assets, activer un backend pour échanger des projets.

**Principe directeur :** *Blender crée la géométrie ; Studio crée et conserve la logique du monde ; le compilateur publie un monde léger.* Une carte complète possède un **format auteur portable indépendant de Blender**, et les échanges Blender portent sur les **parties géométriques réellement éditables**.
