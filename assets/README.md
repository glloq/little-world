# Catalogue d'assets — Little World Solo

**État : premier lot intégré.** Trois modèles GLB originaux (sapin, rocher, caisse) se trouvent dans `public/models/` et sont embarqués dans le site statique. Les autres prefabs sont procéduraux, définis dans `src/world.ts`. Aucun asset tiers n'a encore été importé.

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

Le catalogue initial `assets/catalog.json` liste les modèles GLB présents et les prefabs procéduraux. Un registre plus complet pourra le remplacer lors de l'évolution du pipeline. Il ne contiendra pas d'entrées fictives.

L'éditeur pourra insérer ces assets dans la carte locale, mais **les ajouts au catalogue public nécessiteront un commit et une nouvelle publication GitHub Pages**.
