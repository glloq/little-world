# Studio — reliefs rocheux, bassins versants et compositions

Branche : `feat/studio-creation-workflows-v1`

## Intégré

- **Composition de régions** : sélection de 1 à 16 régions, aperçu exact par simulation des recettes dans l'ordre déterministe des identifiants, sans mutation de la source. Réutilise `applyRegion`, les masques V3, les propriétaires de cellules et le système de transaction/Undo existant. Copie uniquement les chunks concernés pour l'aperçu. L'application se fait dans une transaction unique après hydratation.
- **Bassins versants (diagnostic)** : grille D8 sur `projectGeography(...).ctx.height`, au plus 16 384 échantillons (4 096 par défaut), exutoires mer/bord/cuvette, surfaces de captage approximatives, classement des 32 principaux. Aucune génération de lac n'est imposée. Résultats reproductibles.
- **Cascades assistées** : suggestions du diagnostic de pente existant ; action de création à la demande. Calcul des niveaux sur le profil du cours d'eau et validation préalable de tout le réseau avec `compileWaterNetwork`. Limite native de huit cascades par rivière, protection des profils manuels.

## Limites / prochaines étapes

### Véritables falaises rocheuses

L'outil `rl-cliff-*` produit encore une crête heightfield, **pas une paroi verticale**. Il ne faut pas présenter ce rendu comme une falaise 3D.

Implémentation recommandée :

1. Garder la crête heightfield comme terrain navigable et support de la géographie.
2. Construire un **maillage local rocheux** par tronçons du tracé, avec normales facettées, légère variation déterministe des sommets, lèvres supérieures et raccord bas au terrain. Un seul matériau vertex-colors ; géométrie indexée et découpage par secteur.
3. Utiliser le culling et LOD0/LOD1, avec distance maximale de génération. Cache par signature `seed + feature + terrainRevision + sector + LOD`, libération des buffers à l'éviction.
4. **Collision** : le heightfield ne représente pas les surplombs. Fournir une collision simplifiée par tronçons, cohérente entre Studio et jeu, avant d'autoriser les passages sous une paroi.
5. Rafraîchir le maillage à l'édition et l'Undo/Redo ; comparer screenshots de près et de loin, mesurer triangles, draw calls, mémoire GPU et temps de génération.

Ne pas ajouter un maillage permanent sur toute la carte ni un moteur de terrain parallèle. Réutiliser les structures naturelles locales pour arches/tunnels.

### Hydrologie avancée

La D8 est une **analyse approximative** sans remplissage des dépressions (pit filling), sans gestion hydrologique des précipitations ni des fleuves multi-exutoires. Prochaine étape : cuvettes/lacs candidats, routes de drainage et débit dérivé des surfaces de captage ; prévisualiser avant écriture et valider tout changement de profil d'eau.

## Contrôles de validation

- `node --experimental-strip-types --test tests/studio-region-batch-watershed.test.mjs`
- `npm run typecheck`
- `npm test`
- Tests navigateur Studio + vérification visuelle des masques, Undo/Redo, doublons, conflits et export/import V3.

Ces commandes doivent être exécutées par la CI ou un checkout local ; une modification distante via l'API GitHub ne démontre pas leur réussite.
