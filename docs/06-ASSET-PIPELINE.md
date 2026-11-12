# 06 — Bibliothèque d'assets et pipeline d'import

**Statut : spécification de catalogue statique ; aucun asset 3D tiers encore importé.**

## Objectif V1

Disposer de **plusieurs assets 3D utilisables directement depuis le dépôt et son build GitHub Pages** : fichiers locaux, organisés, vérifiés et progressivement enrichis.

Le navigateur ne dépend ni d'un CDN ni d'une API pour afficher les ressources de base. **Le site public sera mis à jour par nouveau build** lorsqu'un asset est ajouté.

## Règles de licence

- Préférer **CC0 et créations originales** avec droit de redistribution dans le **dépôt public** et dans le site publié.
- « Gratuit », « gratuit pour usage personnel » et « utilisable dans un jeu » ne signifient pas forcément **redistribuable séparément**.
- Vérifier chaque pack et fichier avant l'import ; enregistrer auteur, source exacte, licence, date et transformations.
- Aucun contenu propriétaire/acheté ni source Blender ne doit être commité sans droit explicite de redistribution.
- Les modèles doivent être originaux ; l'ambiance d'animation est une référence stylistique, pas un droit de copier des personnages.
- La licence du **code** sera décidée séparément.

Catalogues possibles à examiner **modèle par modèle** : https://quaternius.com/ et https://kenney.nl/assets. **Aucun asset de ces sites n'est déclaré importé.**

## Format et conventions

- Runtime : **GLB** (glTF binaire), chargeable par `GLTFLoader`.
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

- Écureuil volant (modèle original avec rig, ou **proxy documenté** d'abord).
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

Il peut être difficile de trouver un **écureuil volant quadrupède avec membrane et animations aquatiques** sous une licence compatible. Planifier la création du modèle et du rig originaux ; commencer par un proxy jouable pendant le développement.

Ne pas stocker des packs lourds complets par défaut. Introduire Git LFS seulement si besoin mesuré et ne pas inclure de secrets ou de ressources privées dans le build public.
