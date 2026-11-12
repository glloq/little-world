# Catalogue d'assets — Little World Solo

**État : documentation uniquement. Aucun modèle 3D, animation ou audio n'a encore été intégré.**

Les fichiers 3D de la V1 seront **disponibles directement dans le dépôt public** et dans le site statique **GitHub Pages**, sans CDN ni serveur de jeu. Voir [pipeline d'assets](../docs/06-ASSET-PIPELINE.md).

## Familles visées

- `characters/flying-squirrel/` : écureuil volant original, animations.
- `nature/trees/`, `nature/rocks/`, `nature/plants/` : végétation et décors naturels.
- `buildings/houses/`, `buildings/watermill/`, `buildings/harbor/` : maisons, moulin, port.
- `props/interactions/` : vanne, levier, porte, lanterne, panneaux.
- `props/decoration/` : petits objets, caisses, tonneaux.
- `animations/` et `audio/` : ressources réutilisables.

## Garanties à l'import

1. Licence **autorisant la redistribution publique** du fichier, origine vérifiée (CC0/original prioritaire).
2. GLB valide avec modèle à **échelle métrique**, axe Y vertical et pivot cohérent.
3. Taille raisonnable, collisions et animations compatibles avec le jeu.
4. Identifiant stable dans un registre consultable par l'éditeur.
5. Prévisualisation et métadonnées disponibles.
6. **Chemin d'accès compatible avec `/little-world/`** après Vite et publication Pages.

Le futur `assets/registry.json` sera créé **au premier import réel**. Il ne contiendra pas d'entrées fictives.

L'éditeur pourra insérer ces assets dans la carte locale, mais **les ajouts au catalogue public nécessiteront un commit et une nouvelle publication GitHub Pages**.
