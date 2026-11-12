# Catalogue d'assets — Little World Solo

**État : ressources originales intégrées.** Les trois GLB d'objets existants (sapin, rocher, caisse) restent dans `public/models/` et dans le catalogue de placement de l'éditeur. Un quatrième GLB, `squirrel.glb`, fournit un export du personnage articulé. Dix assets écologiques supplémentaires sont générés localement par le code. Aucun asset tiers n'a été importé.

Les fichiers 3D sont **disponibles directement dans le dépôt** et embarqués dans le build statique pour **GitHub Pages**, sans CDN ni serveur de jeu. Voir [pipeline d'assets](../docs/06-ASSET-PIPELINE.md).

## Registres actuels

- **`catalog.json`** : six objets plaçables dans l'éditeur. Sapin, rocher et caisse utilisent des GLB ; feuillu, maison et lanterne sont des prefabs procéduraux de `src/world.ts`.
- **`character-catalog.json`** : écureuil original avec 14 articulations rigides, 13 états/clips et 9 expressions. Le jeu et les PNJ utilisent le rig procédural de `src/squirrel.ts` ; `public/models/squirrel.glb` est un export local de référence, pas le modèle chargé par le jeu. Le rig n'a pas de skinning pondéré.
- **`ecology-catalog.json`** : herbe, fleur, fougère, champignon, roseau, algue, nénuphar, poisson, oiseau et papillon. Ces dix géométries sont produites par `src/ecology.ts`, avec métadonnées de provenance, dimensions et triangles. Elles sont **générées par l'écosystème et ne sont pas plaçables individuellement depuis le catalogue d'objets**.

Pour reconstruire le GLB du personnage avec Node.js 22, depuis la racine du dépôt :

```bash
node --experimental-strip-types tools/generate-squirrel.mjs
```

Les 13 clips proviennent du même contrôleur de poses que le runtime. Le GLB est autonome, sans texture externe ; ses variantes d'expression et accessoires non sélectionnés sont conservés à une échelle nulle, car glTF n'encode pas la propriété `visible` de Three.js. Chargement et animation par `GLTFLoader` / `AnimationMixer` ont été vérifiés dans Chromium. Miniatures automatiques, skinning et pipeline générique d'optimisation restent à développer.

## Familles futures

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

Les trois registres distinguent objets plaçables, personnage et ressources générées par l'écosystème. Ils décrivent uniquement les ressources réellement présentes ou leurs générateurs versionnés ; une entrée procédurale n'annonce pas un fichier GLB inexistant.

L'éditeur permet d'insérer les objets de `catalog.json` dans la carte locale, mais **les ajouts au catalogue public nécessiteront un commit et une nouvelle publication GitHub Pages**.
