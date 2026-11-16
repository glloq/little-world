# Studio — reliefs rocheux, bassins versants et compositions

Branche : `feat/studio-creation-workflows-v1`

## Intégré

- **Composition de régions** : sélection de 1 à 16 régions, aperçu exact par simulation des recettes dans l'ordre déterministe des identifiants, sans mutation de la source. Réutilise `applyRegion`, les masques V3, les propriétaires de cellules et le système de transaction/Undo existant. Copie uniquement les chunks concernés pour l'aperçu. L'application se fait dans une transaction unique après hydratation.
- **Bassins versants (diagnostic)** : grille D8 sur `projectGeography(...).ctx.height`, au plus 16 384 échantillons (4 096 par défaut), exutoires mer/bord/cuvette, surfaces de captage approximatives, classement des 32 principaux. Aucune génération de lac n'est imposée. Résultats reproductibles.
- **Cascades assistées** : suggestions du diagnostic de pente existant ; action de création à la demande. Calcul des niveaux sur le profil du cours d'eau et validation préalable de tout le réseau avec `compileWaterNetwork`. Limite native de huit cascades par rivière, protection des profils manuels.

## Limites / prochaines étapes

### Falaises rocheuses 3D — première intégration

Les reliefs `rl-cliff-*` conservent leur crête native et gagnent des **faces rocheuses facettées**.

- Nouveau moteur visuel `src/render/cliff-view.ts`, partagé entre le jeu et le Studio via `buildWorld`.
- Géométrie locale `BufferGeometry` non indexée, normales plates, couleurs de sommet, sans texture ; variation déterministe stable par tronçon.
- 2 LOD, rayon proche de 250 m, 32 tronçons résidents maximum, jusqu'à 3 constructions par mise à jour. Éviction, `dispose()` et rechargement des reliefs à l'édition/Undo/Redo.
- Les faces épousent la crête et les flancs échantillonnés sur le heightfield ; le pied est posé sur le terrain. La collision reste le heightfield, **pas de surplomb physique**. Pour arches et tunnels, utiliser les structures naturelles locales.
- Tests de déterminisme géométrique, LOD, streaming et libération des ressources : `tests/cliff-view.test.mjs`.

À vérifier dans le navigateur : apparence des raccords haut/bas, transparence ou trous à différents angles, cas de forts virages, budget de draw calls et coût d'invalidation lors des éditions. Aucun benchmark chiffré n'est encore établi.

### Falaises — finition géologique low-poly

- **Strates** : bandes longitudinales de roches de tons alternés, couleurs de sommet directement dans le maillage (`MeshLambertMaterial` partagé ; aucune texture ni nouveau shader).
- **Irrégularités** : facettes et nervures verticales déterministes, bornées par la largeur et le dénivelé réel ; points d'extrémité non perturbés.
- **Éboulis** : petits éclats triangulaires posés sur le heightfield à proximité du pied. Intégration dans le même `BufferGeometry` que la paroi : aucune entité, aucun collider ni draw call supplémentaire par pierre.
- **Jonctions** : normales du tracé interpolées au raccord des polylignes, coordonnées cumulées sur tout le tracé. Les extrémités voisines conservent les mêmes positions et échantillonnages, indépendamment de l'ordre de chargement.
- **LOD** : maillage fin 3 stations × 7 bandes et 3 éclats par face ; LOD distant 2 stations × 7 bandes (anneaux communs pour les raccords mixtes) et 1 éclat par face. Les limites de streaming (32 tronçons, 3 constructions par mise à jour) ne changent pas.
- **Vérification** : tests de déterminisme, raccords entre tronçons, budget géométrique, éviction, destruction et niveaux de détail. Un test navigateur d'inspection à forts virages et aux transitions LOD reste souhaitable avant qualification visuelle définitive.

### Hydrologie avancée

La D8 est une **analyse approximative** sans remplissage des dépressions (pit filling), sans gestion hydrologique des précipitations ni des fleuves multi-exutoires. Prochaine étape : cuvettes/lacs candidats, routes de drainage et débit dérivé des surfaces de captage ; prévisualiser avant écriture et valider tout changement de profil d'eau.

## Contrôles de validation

- `node --experimental-strip-types --test tests/studio-region-batch-watershed.test.mjs`
- `node --experimental-strip-types --test tests/cliff-view.test.mjs`
- `npm run typecheck`
- `npm test`
- Tests navigateur Studio + vérification visuelle des masques, Undo/Redo, doublons, conflits et export/import V3.

Ces commandes doivent être exécutées par la CI ou un checkout local ; une modification distante via l'API GitHub ne démontre pas leur réussite.

La scène de référence dédiée, les vues et les mesures sont décrites dans [53 — Laboratoire de falaises](53-CLIFF-REFERENCE.md).
