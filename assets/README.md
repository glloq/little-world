# Catalogue d'assets Little World

**État : répertoire documentaire. Aucun modèle 3D, animation ou audio n'a encore été importé.**

La bibliothèque d'assets **sera incluse directement dans le dépôt** et complétée progressivement. Voir [le pipeline d'import](../docs/06-ASSET-PIPELINE.md).

## Familles prévues

- `characters/flying-squirrel/` : écureuil volant original, animations.
- `nature/trees/`, `nature/rocks/`, `nature/plants/` : végétation et relief.
- `buildings/houses/`, `buildings/watermill/`, `buildings/harbor/` : architecture.
- `props/interactions/` : leviers, portes, vannes, lanternes, panneaux.
- `props/decoration/` : caisses, tonneaux et petits objets.
- `animations/` et `audio/` : ressources réutilisables.

## Politique de contribution d'assets

- **Privilégier CC0 / créations originales**, vérifier la licence propre à chaque modèle.
- Décrire précisément **auteur, source, licence, version et modifications**.
- Ne pas intégrer un pack entier si seuls quelques modèles sont utiles.
- Format cible : **GLB**, unités en mètres, axe vertical Y.
- L'éditeur référencera les ressources par **ID stable**, pas par index.
- Aucun fichier sans provenance et droit de redistribution clair dans un dépôt public.

## Futur registre

`assets/registry.json` sera créé **avec le pipeline d'import** et ne listera que des fichiers effectivement présents et validés. Pas d'entrées fictives pour remplir le catalogue.

Priorité à un petit ensemble cohérent : écureuil (ou proxy temporaire), arbres, rochers, moulin à roue distincte, maison, ponton et objets d'interaction.

**Aucune dépendance à un CDN tiers ne doit être requise pour afficher les assets de base d'une version publiée.**
