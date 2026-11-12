# 06 — Bibliothèque d'assets et pipeline d'import

Statut : **stratégie approuvée ; aucun asset tiers encore importé**.

## Objectif

Fournir **plusieurs assets disponibles directement dans le dépôt**, classés, documentés, visibles dans l'éditeur et progressivement enrichis sans casser les scènes existantes.

Le catalogue est **une dépendance stable du jeu**, pas une collection informelle de fichiers `.glb`.

## Règles de licence pour le dépôt public

1. **Priorité au CC0 et aux créations originales** dont les droits permettent la publication dans le dépôt.
2. Une ressource étiquetée « gratuite » n'est **pas nécessairement redistribuable** ; vérifier chaque pack/fichier avant commit.
3. Conserver auteur, URL source exacte, date de récupération, licence, lien vers la licence et modifications.
4. Ne pas importer de modèles payants/propriétaires dans le dépôt public sans autorisation explicite.
5. Ne pas confondre inspiration d'ambiance et copie d'œuvres protégées : personnalité artistique originale.
6. Aucune licence du **code du projet** n'a encore été choisie ; elle est indépendante des licences des assets.

Sources possibles à évaluer **pack par pack** (aucun téléchargement acté) :
- https://quaternius.com/
- https://kenney.nl/assets

Le contrôle doit porter sur **l'asset exact**, pas sur la réputation générale du fournisseur.

## Répartition proposée

```text
assets/
├── README.md
├── registry.json                 # Généré/validé plus tard
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

Convention : noms minuscules `kebab-case`, **identifiants pérennes**, version indépendante du chemin disque. Ne pas remplacer silencieusement un ID dont la collision ou l'échelle change.

## Premier lot visé (environ 20–30 modèles utiles)

| Groupe | Inventaire prioritaire |
| --- | --- |
| Personnage | **Un écureuil volant original**, squelette compatible avec marche, course, saut, chute, planage, nage, plongée |
| Nature | Plusieurs silhouettes d'arbres, buissons, rochers, herbes / fleurs, souches |
| Architecture | Moulin, **roue séparée et animable**, petite maison, grange, pont |
| Port | Ponton, petit bateau, tonneaux, caisses, poteaux |
| Interactions | Levier, vanne, porte, coffre, panneau, lanterne |

**Un lot annoncé n'est pas un lot disponible** : `registry.json` ne devra contenir que des entrées validées et réellement présentes.

## Formats et standards

- Runtime : **`.glb`** prioritaire (glTF binaire).
- Sources : `.blend` ou autre **uniquement si licence adaptée** et nécessité de maintenance.
- Coordonnées unifiées : **mètres**, axe vertical **Y**, conventions d'orientation documentées pour les personnages/objets.
- Pivot logique explicite, important pour roues, portes, leviers, bateaux et animations.
- Couleurs, palette et matériaux harmonisés ; textures légères, atlas si utile.
- Collision : collider automatique très simple ou volumes spécifiques, **pas de collision détaillée par défaut**.
- Prévisualisation : miniature générée, dimensions, nombre de triangles, matériaux, animations.
- Instancing possible pour arbres/roches ; ne pas rendre chaque objet unique sans raison.

## Métadonnées minimales proposées

Exemple **illustratif**, non encore implémenté :

```json
{
  "schemaVersion": 1,
  "id": "nature.tree.oak-a",
  "version": 1,
  "category": "nature/trees",
  "name": "Chêne stylisé A",
  "file": "nature/trees/oak-a.glb",
  "thumbnail": "nature/trees/oak-a.webp",
  "source": {
    "author": "A DEFINIR",
    "url": "https://exemple.invalid/source-exacte",
    "license": "CC0-1.0",
    "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/"
  },
  "geometry": {
    "units": "m",
    "upAxis": "Y",
    "pivot": "base-center"
  },
  "collision": {
    "kind": "trunk-capsule"
  },
  "tags": ["tree", "forest", "instanced"],
  "animations": []
}
```

`exemple.invalid` et les champs fictifs sont **des placeholders** : ils ne doivent pas être copiés tels quels dans un registre publié.

## Pipeline d'import envisagé

1. Déposer l'asset **dans une zone d'import provisoire**.
2. Vérifier **source, licence et possibilité de redistribution** ; refuser l'import si provenance inconnue.
3. Vérifier le format, l'unité, l'orientation, les pivots et animations.
4. Calculer les limites, triangles, matériaux, textures et taille.
5. Harmoniser l'apparence et optimiser **sans détruire le fichier original autorisé**.
6. Générer miniature, collision par défaut et manifeste.
7. Valider automatiquement les contraintes et les identifiants.
8. Publier dans `assets/` et rendre l'élément immédiatement accessible dans l'éditeur.

Toute conversion destructrice devra être reproductible et documentée. Les scènes sauvegardées référencent **un ID d'asset**, jamais un index de tableau ou un nom d'affichage susceptible de changer.

## Gestion de taille du dépôt

Ne pas importer des packs complets inutiles. Conserver d'abord les **GLB optimisés** et leurs crédits ; n'ajouter les sources lourdes que si elles sont utiles et licites. Examiner Git LFS seulement si la taille réelle le justifie.

## Critères de qualification d'un asset

- Présent physiquement, s'ouvre sans erreur avec le loader.
- Licence et provenance vérifiées.
- Échelle, orientation et pivot corrects.
- Budget graphique compatible avec la catégorie.
- Collider et animation fonctionnels si requis.
- Visible et sélectionnable dans le catalogue éditeur.
- Références stables après sauvegarde et rechargement d'une scène.

## Dépendance structurante : écureuil volant

Les assets tiers risquent de ne pas fournir de modèle qui possède exactement un squelette quadrupède, une membrane de planage et les animations de nage/plongée. **Prévoir de produire ce personnage original** plutôt que de forcer une rig d'animal générique. Commencer avec un proxy animé simple jusqu'à qualification de la version artistique.
