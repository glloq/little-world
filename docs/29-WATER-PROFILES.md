# Eau : tracé, profil d’altitude et cohérence 3D

Contrats consultés : [21 — Hydrographie](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [15 — Sources V3](15-STUDIO-DATA-SCHEMAS-V3.md), [14 — Choix](14-TECHNICAL-CHOICES.md). Incrément du 13 novembre 2026, développé sur `feat/studio-v3`.

## Ce qui change

Auparavant, chaque `WaterBody` de l’éditeur imposait une seule valeur `level` à tout le tracé. Ce choix restait identique sur une pente et dans le maillage 3D. L’eau était aussi creusée avant les retouches de terrain, qui pouvaient reboucher le lit.

Les nouveaux cours d’eau proposent un profil calculé à partir du **terrain source, retouches incluses mais sans leur propre creusement**. Échantillonnage à environ 3 m, niveau non ascendant de l’amont vers l’aval, correction des contre-pentes locales signalée. Le lit et les berges sont dérivés après ces retouches. Le ruban possède des sections jointes aux virages et la même altitude sur toute sa largeur. Un index de segments sert les requêtes de surface/profondeur ; la nage, la caméra et le bateau consomment ces requêtes sans lire le mesh.

Le profil n’est pas recalculé par frame. Les points calculés et l’index restent des dérivés en mémoire. Aucun shader coûteux, seconde caméra, solveur de fluides ou automate de qualité n’est ajouté. Chaque ruban ajouté utilise un matériau opaque ; l’ancien matériau et la géométrie sont libérés.

## Parcours utilisateur

1. Studio → créer/ouvrir un projet → **Eau**. Pour reprendre une carte de l’éditeur historique, importer son JSON dans le Studio.
2. Choisir **Cours d’eau — relief**. S’aider de l’aperçu coloré du relief, puis cliquer de la source vers l’aval ; corriger X/Z des points si nécessaire. Régler largeur, profondeur et décalage eau/terrain (négatif pour garder l’eau sous la berge).
3. Lire le graphique : **brun = relief source**, **bleu = eau proposée**. Une arrivée trop haute, un creusement supplémentaire excessif, des points confondus ou un croisement du tracé empêchent l’application. **Inverser amont / aval** corrige un tracé dessiné à l’envers ; une forte pente signale un rapide incliné, sans inventer de cascade verticale.
4. **Profil manuel verrouillé** permet une altitude à chaque point, toujours non ascendante. **Plan d’eau — horizontal** utilise une altitude constante. Ce dernier est encore un corridor plat, pas un lac polygonal.
5. **Appliquer le tracé**, Annuler/Refaire, Sauvegarder, Exporter ZIP. L’ID et les références de secteurs sont conservés lors de la modification d’un tracé existant.
6. Ouvrir **Vue 3D locale** : la vue se centre sur le tracé sélectionné. Les retouches de relief actualisent le profil et les surfaces d’eau concernées ; Annuler/Refaire garde la même logique. Utiliser **Tester la copie** pour vérifier déplacement, nage et immersion : avec un tracé sélectionné, le départ est placé près de son point médian.

L’éditeur historique propose aussi le mode relief par défaut pour les nouveaux tracés, le graphique et l’inversion du sens. Ses anciens tracés restent horizontaux ; les convertir explicitement depuis le module Eau du Studio.

## Compatibilité et secteurs

Extension optionnelle de `WaterBody` :

```ts
profile?: { mode: 'terrain'; offset: number }
        | { mode: 'manual'; levels: number[] }
```

Sans `profile`, `level` conserve exactement son sens historique. Les valeurs auteur sont validées en V2/V3 et conservées dans les archives. Le réseau `WaterNetworkDefinitionV3` complet du document 21 reste la cible : cette extension est une étape compatible dans la bibliothèque d’eau existante, pas une implémentation de toute sa topologie.

Le profil automatique dépend du relief sur **l’ensemble du tracé**. La vue locale hydrate les sources de son corridor et leurs propriétaires canoniques ; l’adaptateur inclut ces retouches même si elles sont en amont de la vue. La compilation `little-world-descriptors-4` prend ces dépendances en compte : une retouche amont invalide les secteurs de la rivière concernée, sans invalider les secteurs indépendants. La conversion d’un ancien tracé nettoie aussi ses anciennes références réparties par bounding circle.

## Vérifications et limites

- Tests unitaires : profil descendant, diagnostics, niveaux manuels, source non mutée, absence de rétroaction, même niveau logique/géométrique, index spatial, compatibilité V2, archive V3, références et dépendances amont/invalidation.
- Chromium sur le build : tracer, appliquer, exporter, annuler/refaire, niveaux manuels, rejet d’une contre-pente sans écrasement, sauvegarder/recharger, présence réelle du mesh en vue 3D et contrôles de l’éditeur historique.
- Chromium sur les modules source : chargement différé des retouches amont sans hydrater les secteurs indépendants, pente réelle du mesh, correspondance avec la surface logique, profondeur/immersion, modification après retouche, libération des anciennes géométries, absence de reconstruction inutile et suppression.

Résultat local : **145 tests unitaires/intégration**, **11 contrôles navigateur auteur**, **8 contrôles source/3D/IndexedDB**, typecheck et build réussis. La CI de branche exécute aussi les parcours préexistants.

Commandes : `npm test`, `npm run build`, `npm run test:water` sur le preview ; `node tests/water-engine.browser.mjs <base-url>` sur Vite source. Captures Actions : `water-profile.png`, `water-3d.png`.

Pas de jonctions hydrauliques, rattachement automatique à un lac/à la mer, cascade verticale, courant de gameplay ou nouveaux LOD d’eau. Les croisements entre plusieurs tracés conservent la priorité historique du dernier volume ; leurs niveaux de raccord ne sont pas résolus par un graphe. La rivière/mer procédurale de démonstration reste présente et indépendante. Les petites largeurs peuvent encore nécessiter un relief plus fin en vue lointaine ; aucun benchmark GPU intégré n’est revendiqué.

Bornes de cette représentation : 100 points auteur/tracé, environ 4 100 échantillons maximum/tracé, diagnostic au-delà de 12 km et plafond de 65 536 segments indexés pour l’instance chargée. Ce sont des protections techniques, pas une qualification de toute la carte 10 × 10 km. Les sources hydratées restent dans le cache de la session Studio, dont l’éviction demeure un chantier distinct.
