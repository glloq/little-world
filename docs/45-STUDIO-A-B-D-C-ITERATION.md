# 45 — Studio A → B → D → C : incréments de création de monde

Document historique du lot A-B-D-C. La branche `feat/studio-creation-workflows-v1` a été fusionnée via la PR #22. Pour le périmètre actuel et les corrections A→H, voir [53 — Production géographique V2](53-STUDIO-GEOGRAPHY-PRODUCTION-V2.md). Les sections « reste » décrivent les limites **au moment de ce lot**, et non un audit actuel.

## A — Nouveau monde / géographie

- L'assistant de création propose île, archipel, chapelet d'îlots ou relief doux.
- Dimensions libres de 500 à 8 000 m, graine, proportion de falaises et option volcan.
- Le panneau Eau propose « Prolonger le cours d’eau vers l’aval » à partir de sa source ou de son dernier point ; il réutilise `traceDownhill`, limite le tracé à 100 points et ajoute le raccord à la mer lorsque le terrain le permet.
- Les sources sont des contrats `world.terrain.archipelago` V3 validés, **pas un second moteur**.
- Un projet neuf se modifie ensuite avec les formes existantes (îles, volcans, crêtes, plateaux, vallées) sur la carte 2D.
- Les presets de vallées historiques restent disponibles.

**Ce qui reste à développer dans A** : raccordement automatique multi-réseaux des tracés hydrologiques, outil 3D de falaises/plateaux et zones de paysage polygonales avec transitions. Le Studio possède déjà les outils basiques de formes 2D et paysages rectangulaires ; ils ne sont pas remplacés.

## B — Biotopes et construction

- Six palettes écologiques configurent les pinceaux existants (forêt légère/dense, prairie, montagne, littoral et village).
- Les palettes écrivent les traits de biome du moteur existant ; l'habillage reste procédural et instancié.
- Le module Assemblages accepte désormais « Placer à la souris » : aperçu volumétrique, clic pour créer et Ctrl+Z pour retirer, sans dupliquer d'interactions.
- Les limites des assemblages V1 persistent : pas de groupe parent/enfant ni de redimensionnement interactif collectif.

**Ce qui reste dans B** : vraie peinture d'écosystèmes multi-espèces avec filtres et gommes, duplication de prefabs paramétriques, outils lignes/clôtures/ponts, meilleur ghost (modèles réels et collision).

## D — Validation de création

- Nouveau contrôleur indépendant `studio-core/world-audit.ts`, sans mutation : erreurs de références d'eau manquantes, liens sur soi, connexions distantes, cours d'eau/chemins trop courts, éléments hors carte et zones incomplètes.
- Intégration au panneau Validation/Compilation ; chaque problème mène à la position concernée dans la vue 3D.
- Un contrôle ouvre directement la surimpression existante des pentes et collisions, sans créer un nouveau calcul de physique.
- **Les warnings ne bloquent pas la compilation** et le strict preflight existant reste l'autorité de validité.

**Ce qui reste dans D** : pente et accessibilité du joueur/PNJ, contrôle géométrique 3D et collisions, budget GPU et parcours de playtest instrumenté.

## C — Édition non destructive (premier pas)

- Le pinceau de décoration ignore par défaut les placements signalés en conflit par le contrôle existant, option explicite de désactivation.
- Les corrections de relief, masques et presets conservent leurs règles de priorité existantes ; aucun nouveau stockage de protections concurrent n'est ajouté.

**Ce qui reste dans C** : historique visuel, collections/hiérarchies, points de restauration nommés et graphe complet des dépendances de régénération.

## Tests

- `tests/studio-world-start.test.mjs`
- `tests/studio-world-audit.test.mjs`
- Tests Studio historiques et workflows de création, en CI GitHub.

Vérifier la dernière CI de branche pour constater le statut de `npm test`, `npm run build` et les scénarios Chromium. Un succès de CI n'est **pas** une qualification visuelle, artistique ou GPU réel.

## Recette manuelle conseillée

1. Créer une île de 1 km × 1 km sans volcan, régler les falaises, sauvegarder/recharger.
2. Peindre plusieurs palettes écologiques, modifier des formes 2D, puis annuler/refaire.
3. Créer un assemblage de trois objets ; le placer plusieurs fois en vue 3D ; exporter/réimporter.
4. Tracer un chemin et une rivière ; créer volontairement un lien d'eau absent et constater le diagnostic.
5. Peindre des objets près de bâtiments avec la protection activée, puis désactivée ; vérifier le traitement des conflits.
6. Lancer « Jouer ici », traverser la zone et contrôler la stabilité de la mémoire sur la grande île.
