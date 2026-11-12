# 06 — Bibliothèque d'assets et pipeline d'import

**Statut : trois GLB d’objets conservés, un GLB de personnage articulé exporté et dix assets écologiques procéduraux documentés. Aucun asset tiers importé. Le pipeline générique de miniatures et d’optimisation reste à développer.**

## Objectif V1

Disposer de **plusieurs assets 3D utilisables directement depuis le dépôt et son build GitHub Pages** : fichiers locaux, organisés, vérifiés et progressivement enrichis.

Le navigateur ne dépend ni d'un CDN ni d'une API pour afficher les ressources de base. Les GLB sont livrés localement via Vite ; les ressources procédurales sont construites depuis le code versionné. **Le site public sera mis à jour par nouveau build** lorsqu'un asset est ajouté.

## Inventaire livré

| Registre | Contenu réel | Utilisation |
| --- | --- | --- |
| `assets/catalog.json` | Six objets plaçables : sapin, feuillu, rocher, maison, caisse et lanterne ; sapin/rocher/caisse disposent d'un GLB local | Catalogue de placement dans l'éditeur, références stables dans les cartes |
| `assets/character-catalog.json` | Écureuil original, 14 articulations rigides, 9 expressions et 13 clips exportés dans `public/models/squirrel.glb` | Asset de référence exporté ; joueur et PNJ utilisent encore le rig procédural équivalent |
| `assets/ecology-catalog.json` | Dix formes originales : herbe, fleur, fougère, champignon, roseau, algue, nénuphar, poisson, oiseau et papillon | Génération écologique par `src/ecology.ts` ; **pas des objets sélectionnables dans le catalogue de placement** |

Les registres écologiques déclarent leur provenance, leurs dimensions de géométrie source, leurs triangles et leur usage. Les variations d'instances modifient dimensions et palette. Oiseaux, poissons et insectes restent des représentations géométriques simplifiées avec trajectoires paramétriques ; leurs fiches ne promettent ni GLB individuel, ni miniature, ni rig skinné.

### Reconstruction de l'écureuil

Depuis la racine du dépôt, avec Node.js 22 et les dépendances installées :

```bash
node --experimental-strip-types tools/generate-squirrel.mjs
node --experimental-strip-types --test tests/character*.test.mjs
```

L'outil utilise `GLTFExporter`, sans Blender, téléchargement ou serveur. Il reconstruit `public/models/squirrel.glb` depuis `src/squirrel.ts` et les poses de `src/character-animation.ts` / `src/character-clips.ts`. Deux générations successives ont produit un fichier identique. Les animations exportées sont `idle`, `walk`, `run`, `jump`, `rise`, `fall`, `deploy`, `glide`, `fold`, `land`, `swim`, `dive` et `ascend`.

Le GLB possède une **hiérarchie d'articulations rigides**, sans poids de skinning ni déformation continue du maillage. Le format glTF ne conserve pas `Object3D.visible` : les expressions et accessoires non sélectionnés sont exportés avec une échelle nulle ; les métadonnées décrivent ce choix. Le fichier contient toutes ces variantes, tandis que le runtime procédural masque réellement les groupes inutilisés. Le chargement du GLB, son rendu et l'animation d'une articulation par `AnimationMixer` ont été vérifiés dans Chromium.

Un chargement de personnage GLB intégré au jeu, des déformations skinnées, des miniatures automatiques et une qualification artistique exhaustive restent à réaliser.

## Règles de licence

- Préférer **CC0 et créations originales** avec droit de redistribution dans le **dépôt public** et dans le site publié.
- « Gratuit », « gratuit pour usage personnel » et « utilisable dans un jeu » ne signifient pas forcément **redistribuable séparément**.
- Vérifier chaque pack et fichier avant l'import ; enregistrer auteur, source exacte, licence, date et transformations.
- Aucun contenu propriétaire/acheté ni source Blender ne doit être commité sans droit explicite de redistribution.
- Les modèles doivent être originaux ; l'ambiance d'animation est une référence stylistique, pas un droit de copier des personnages.
- La licence du **code** sera décidée séparément.

Catalogues possibles à examiner **modèle par modèle** : https://quaternius.com/ et https://kenney.nl/assets. **Aucun asset de ces sites n'est déclaré importé.**

## Format et conventions

- Ressources fichier : **GLB** (glTF binaire), chargeable par `GLTFLoader`. Les prefabs et l’écosystème peuvent aussi provenir de générateurs TypeScript locaux.
- Origine et dimensions documentées ; **mètres**, axe vertical **Y**, pivots explicites.
- Modèles et textures simples, palette cohérente, minimum de matériaux.
- Collision simple par défaut, spécialisée seulement si nécessaire.
- Animations nommées : repos, marche, course, saut, chute, planage, nage, plongée pour l'écureuil.
- Roue du moulin, portes et leviers : pivots précis et géométries séparées.
- Chaque asset reçoit un identifiant stable, une catégorie, un fichier source et une miniature.
- Les fichiers GLB/WASM/assets sont référencés par des URL compatibles avec **`/little-world/`**, jamais par une racine `/assets` codée en dur.

## Organisation cible

```text
assets/
├── README.md
├── registry.json         # Créé au premier import validé
├── characters/flying-squirrel/
├── nature/trees/
├── nature/rocks/
├── nature/plants/
├── buildings/houses/
├── buildings/watermill/
├── buildings/harbor/
├── props/interactions/
├── props/decoration/
├── animations/
└── audio/
```

`registry.json` ne listera **que des fichiers réellement présents** et validés, jamais des placeholders.

## Premier lot visé (20–30 assets, objectif non livré)

- Écureuil volant : rig rigide et export GLB déjà livrés ; skinning pondéré et finition des animations restent des objectifs.
- Quelques variantes d'arbres, rochers, buissons, herbes et fleurs.
- Moulin avec roue distincte, maison, grange, pont.
- Ponton, barque, caisse, tonneau, amarrage.
- Porte, vanne, levier, coffre, lanterne, panneau.

## Pipeline

1. Sélectionner/importer localement un fichier ou un pack explicitement autorisé.
2. Vérifier provenance, licence et droit de **redistribution publique**.
3. Valider format, orientation, échelle, pivots, animations et textures.
4. Mesurer triangles, matériaux, textures, tailles et limites.
5. Harmoniser/optimiser sans détruire les sources autorisées.
6. Créer miniature, collider simple et métadonnées.
7. Mettre à jour le manifeste et tests de cohérence.
8. Ajouter le contenu qualifié au dépôt et **recompiler** le site Pages.

Exemple informatif d'entrée de manifeste (non importée) :

```json
{
  "schemaVersion": 1,
  "id": "nature.tree.oak-a",
  "category": "nature/trees",
  "file": "nature/trees/oak-a.glb",
  "license": "CC0-1.0",
  "sourceUrl": "https://example.invalid/model-to-be-verified",
  "pivot": "base-center",
  "units": "m",
  "tags": ["tree", "forest"]
}
```

Les URL `example.invalid` et noms inventés sont de simples exemples et **interdits dans un registre publié**.

## Convention d'assets — touffes d'herbe

Pour l'herbe courte/haute, privilégier **petits modèles opaques 2–4 triangles par touffe** (à mesurer), un matériau partagé, variation de couleur et dimensions par instance. **Pas de texture transparente haute résolution**, d'animation d'os, de collision, de physique ni de génération d'ombres individuelles.

L'aspect herbe courte provient principalement des couleurs/motifs du terrain. Les herbes hautes sont générées par biotope, proches et reproductibles ; le `GrassRenderer` éventuel ajoute une déformation GPU des sommets sans modifier les matrices d'instances chaque frame.

**Les triangles ne sont pas le seul coût :** comptabiliser draw calls, overdraw, mémoire GPU, nombre de secteurs actifs et éventuels changements de shader. Les budgets et portes de validation sont définis dans [18 — Herbes ultra-low-resource](18-GRASS-LOW-RESOURCE.md).

## Métadonnées d'environnement pour les assets

Voir [19 — Environnement LOW-RESOURCE](19-ENVIRONMENT-WEATHER-SKY.md).

**Pour les matériaux qui reçoivent la neige**, prévoir un **masque de dépôt précalculé** (attribut de sommet, matériau ou petite texture partagée si nécessaire), déterminé par orientation/partie du modèle et propriétés métier : neige sur dessus de toiture et feuillage, mais pas sur murs verticaux/troncs/eau par défaut. Le coefficient de neige, d'humidité et d'éclairage est un **uniforme partagé** ; ne pas dupliquer toutes les versions d'assets « été/hiver/pluie ».

Pour le **ciel, les étoiles et les lunes**, privilégier texture/carte procédurale compacte, disque/sprite peu coûteux et paramètres de palette, **sans mesh ni lumière par étoile ou lune** ; les cycles sont des données d'environnement, pas un asset animé unique par lune.

Pour les **ombres**, fournir lorsque pertinent limites/importance du modèle et catégorie de cast/receive shadow ; le `ShadowBudgetManager` choisit les **grands objets proches**, les herbes restent toujours exclues. Un objet importé **ne doit pas activer automatiquement un shader lourd, une shadow map ou une texture de neige volumineuse**.

Les matériaux spéciaux restent des dérivés compacts du catalogue et doivent être **mesurés sur GPU intégré** (draw calls, VRAM, éventuelle recompilation de shaders et surcoût de calcul fragmentaire).

## Qualification

- Fichier présent, path valide après build GitHub Pages.
- Loader GLB sans erreur navigateur.
- Licence/source contrôlées.
- Taille, orientation, palette et collision cohérentes.
- Aperçu et recherche dans l'éditeur.
- Animations disponibles si la fiche les annonce.
- Scène rechargée retrouvant la même référence par ID.
- Asset absent ou incompatible = erreur claire, jamais chargement silencieux d'une URL tierce.

## Risque principal

Le modèle et le rig rigide originaux évitent une dépendance à un personnage tiers de provenance incertaine. Le travail restant porte surtout sur la déformation skinnée, la finesse des animations, le coût de rendu et la revue artistique. La présence du GLB exporté ne signifie pas que le jeu utilise un personnage skinné.

Ne pas stocker des packs lourds complets par défaut. Introduire Git LFS seulement si besoin mesuré et ne pas inclure de secrets ou de ressources privées dans le build public.

## Besoins de la version finale : personnages, créatures et Studio

Le périmètre approuvé est **sans personnages humains**. Prévoir un système de variantes de personnages animaux / créatures à partir du modèle et du rig du joueur **lorsque la morphologie le permet** :

- Variables visuelles : taille/proportions, oreilles, queue, couleurs, accessoires, expressions, voix/sons stylisés.
- Rig/animations communs pour humanoïdes animaux compatibles ; rigs spécialisés pour poissons, oiseaux et animaux à morphologies différentes.
- Animations réutilisables pour locomotion, repos, salutation, travail, dialogue, nage/planage et réactions.
- Catalogue unifié entre le jeu et **plusieurs éditeurs spécialisés** (objets/bâtiments, personnages, biotopes, dialogues/actions), avec prévisualisation et identifiants stables.
- Import GLB, animations et sons dans le Studio, métadonnées licence/provenance et validation avant publication.
- Familles écologiques low-poly : arbres, herbes, fleurs, plantes aquatiques, algues, poissons, insectes, oiseaux, ruines, maisons et mécanismes.
- Variantes et instancing par secteur pour une **carte continue jusqu'à 10 × 10 km maximum**, sans précharger l'ensemble.
- Ne pas construire un modeleur généraliste, un éditeur de squelette/UV ou un éditeur de shaders complet dans le navigateur.

L'éditeur doit offrir un moyen clair d'ajouter un prefab **et de vérifier immédiatement ses animations, points d'attache, collisions et interactions**, mais les ressources ne sont mises en ligne que par build du dépôt.

Références : [12 — Périmètre](12-PROJECT-SCOPE.md) et [13 — Little World Studio](13-STUDIO-UX-ARCHITECTURE.md). Ces outils sont **à développer**, pas déjà disponibles.
