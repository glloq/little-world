# Branche de travail des assets Little World

Branche canonique : `feat/little-world-assets`.

## Inventaire

- **Bâtiments approuvés** (déjà intégrés à `main`) : cabane bois V1, maison pierre V1, phare V1.2 — `assets/buildings/approved.json` et `public/models/buildings/`.
- **Ponton modulaire approuvé** : 5 pièces × 3 LOD — `assets/structures/dock/manifest.json`, `public/models/structures/dock/`, assembleur `src/structures/assemble-dock.mjs`.
- **Pont en pierre approuvé V2** : 3 LOD, 564/362/186 triangles — `assets/structures/stone_bridge/manifest.json`, `public/models/structures/stone_bridge/`.

## Procédure pour nouveaux modèles

1. Créer le GLB localement et faire valider son rendu multi-angles (Z-buffer + backface culling).
2. Vérifier triangles, orientation des faces, normales, échelle, pivot, LOD, couleurs et empreintes.
3. Enregistrer GLB et manifeste versionné dans cette branche, avec licence et identifiant stable.
4. Ne pas ajouter au catalogue de placement avant qualification runtime. Garder les collisions, animations et navigation indépendantes du LOD graphique.
5. Vérifier `npm test` et `npm run build` ainsi que la CI; signaler explicitement ce qui n'a pas été testé.

Les anciennes branches d'assets restent intactes pour historique. **Ne pas fusionner automatiquement dans `main`.**
