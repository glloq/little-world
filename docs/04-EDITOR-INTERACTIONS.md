# 04 — Little World Studio : édition de carte et interactions

**Statut : spécification fonctionnelle validée, à implémenter progressivement.**
**État de cette branche : atelier unifié fonctionnel (sculpture, eau/chemins, biotopes, objets, PNJ/dialogues, historique et stockage v2). Les éditeurs spécialisés du Studio ne sont pas encore livrés.**

**Références impératives :** [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), **[15 — Schémas V3 et contrats entre éditeurs](15-STUDIO-DATA-SCHEMAS-V3.md)**, [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

## Cible des contrats V3 — choix désormais retenus

Le Studio conserve **plusieurs éditeurs spécialisés** mais partage un `StudioContext`, un `ProjectStore`, un `CommandBus` transactionnel, un `ReferenceIndex` et une validation commune. Les objets deviennent des **entités à composants typés et prefabs avec overrides** ; PNJ/dialogues/actions sont liés par **IDs stables**, même lorsque des secteurs sont déchargés.

Les projets V3 sont **sectorisés** (manifeste, sources/overrides, registres), avec migration V1/V2 et checkpoints. **Les éditeurs actuels restent sur V2 à ce stade** ; ne pas assimiler la spécification à un état de développement. Détails : [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md).

## Fonctions disponibles

- Relief : élever/abaisser, lisser vers la moyenne locale, aplanir à une altitude ; rayon et intensité. Les retouches sont des opérations persistantes, appliquées aux calculs de collision et aux seuls chunks intersectés. Les objets placés, arbres, chemins et bâtiments proches sont recalés.
- Biotopes : pinceau circulaire parmi sept types, priorité au dernier override. La flore/faune locale est régénérée progressivement ; les habitats restent contrôlés.
- Eau : cliquer les points d’une polyligne, régler largeur/niveau/profondeur, terminer. Le lit est creusé et le même volume sert à la nage/navigation. Chemins : polyligne adaptée au relief et exclusion écologique.
- Objets : choisir le catalogue, cliquer ; sélectionner avec Maj pour grouper. Les gizmos transforment un objet ; duplication/suppression opèrent sur le groupe. Inspecteur numérique et magnétisme optionnel.
- PNJ : placement, nom, activité, rayon, vitesse ; patrouille sur le dernier chemin dessiné. Éditeur complet de graphe de dialogue : entrée, répliques, expressions, réponses, liens, conditions/effets booléens locaux ; aperçu direct.
- Chaque opération significative est annulable. L’historique garde 60 états en mémoire ; il ne persiste pas entre rechargements. Le brouillon IndexedDB et l’export conservent les données, pas l’historique.
- `npm run compile:map -- carte.json public/maps/default.json` valide et produit la carte statique et son manifeste de secteurs. Les géométries sont encore générées localement à la demande, pas précompilées.

## Limites de cette livraison

Les tracés se créent par points et se suppriment via la liste des retouches ; pas encore de poignées de déplacement de points ni de spline courbe. La multisélection n’a pas de gizmo de groupe. Pas de brosse de dispersion, miniatures de catalogue, zones d’exclusion dessinables, undo persistant, sculpture en worker, navmesh ou éditeur général d’événements/mécanismes. Les actions des dialogues modifient seulement des flags de session. Les spécifications ci-dessous restent des objectifs lorsqu’elles dépassent ces fonctions.



## 1. Choix directeur : E1=C — plusieurs éditeurs spécialisés

Le Studio permet de créer un **monde géographiquement continu** avec limite de format **10 × 10 km (100 km²)**. Cette limite ne signifie ni une carte actuelle de cette taille, ni le chargement de tout le monde en mémoire.

**Une seule source de projet, un seul historique logique et un seul graphe d'IDs**, mais plusieurs vues/outils spécialisés :

1. **Accueil / plan global 2D** : liste des projets, miniatures, recherche de zones et d'objets, ouverture à une position.
2. **Terrain et relief** : génération, sculpture, lissage, aplanissement, pentes, overrides, régénération locale.
3. **Eau et chemins** : splines, rivières, lacs, cascades, volumes navigables, chemins, ponts.
4. **Biotopes et faune** : peinture de zones, règles déterministes de flore/faune, densités, exclusions.
5. **Objets et bâtiments** : catalogue, placement, transformations, groupes, maisons modulaires, portes.
6. **Personnages / PNJ** : apparence animale, variantes du personnage joueur, comportements, zones de circulation, navigation libre.
7. **Dialogues** : répliques, choix, branches, conditions, animations, émotions et bruitages.
8. **Événements / actions** : déclencheurs, conditions ET/OU, séquences et état persistant.
9. **Assets** : import GLB, audio/animations, prévisualisations, licences et catalogues.
10. **Tests et validation** : jouer depuis la sélection, diagnostic, état du monde, navigation, performance et publication.

Une fonction doit appartenir à **un module responsable**. Si un PNJ est sélectionné dans le viewport, « Modifier son dialogue » ouvre l'éditeur de dialogue **sur le même PNJ**, avec retour rapide au viewport.

## 2. Ergonomie commune

- En-tête compact avec fil d'Ariane projet > zone > outil, nom de carte, état sauvegardé, Undo/Redo, « Jouer ici », export.
- Outils courants dans une barre latérale compacte ; pas de liste massive couvrant toutes les spécialités.
- Grand viewport 3D, avec vue de dessus, perspective et navigation libre ; caméra d'éditeur différente de celle du jeu.
- Panneau de propriétés contextuelles, masquable, sans valeurs techniques non pertinentes.
- Sélection claire et stable, multisélection, cadres de zones, gizmos simples, aperçu avant action.
- Catalogue filtrable par type/biotope/animation, miniatures et favoris éventuels.
- Raccourcis **proposés** : clic gauche sélection/action, clic droit maintenu orbite, clic molette déplacement, `F` centrer, `Suppr` effacer, `Ctrl+Z/Y` annuler/refaire, `Échap` annuler l'outil.
- Outil courant et état de sauvegarde clairement visibles.
- Une action de peinture ou transformation continue = **une seule transaction réversible**, pas une entrée d'historique par pixel.

## 3. Édition du terrain et de la géographie

### Relief
- Pinceaux élever, abaisser, lisser, aplanir, intensité/rayon, zones protégées.
- Appliquer les modifications **localement aux secteurs affectés**.
- Prévenir lorsque bâtiments/chemins/objets deviennent mal positionnés ; correction explicite.
- Régénérer un secteur sans écraser les overrides humains et sans invalider des ID.

### Eau, chemins et biotopes
- Eau/route par points de contrôle et courbes, largeur, profondeur, altitude, volume logique.
- Rivières, mer, lacs, bassins, cascades (sans simulation physique complète d'eau).
- Biotopes peignables avec densité, exclusion, types de végétaux et espèces.
- Recalculer localement instances, collisions et navigation lorsque les données changent.
- Éviter les générateurs impossibles à corriger à la main.

### Bâtiments
- Prefabs entiers et éléments modulaires : murs, toits, portes, fenêtres, pontons, ruines.
- Pas de modélisation de polygones/UV ou rigging complet dans le Studio.
- Quelques intérieurs simples, sans obligation d'intérieur pour tous les bâtiments.
- Modifications de prefab partagées, overrides par instance explicites.

## 4. PNJ et comportement

**Pas d'humains** : animaux/êtres stylisés variés ; réutiliser les paramètres du personnage joueur pour des rig/morphologies compatibles. Ne pas forcer un poisson ou un oiseau sur un squelette d'écureuil.

Outil auteur :
- Choisir morphologie/variantes, accessoires, émotions et animations.
- Déposer PNJ, dessiner ses zones d'activité et définir les obstacles/chemins autorisés.
- Ajouter une routine (se déplacer, travailler, attendre, saluer, regarder, fuir) et ses conditions.
- Configurer une **navigation libre avancée**, avec calcul hiérarchique inter-secteurs et évitement local.
- Ouvrir le dialogue ou les réactions directement depuis son panneau.
- Prévisualiser parcours, zones et états, et rendre visibles les erreurs de navigation.

**Navigation libre n'implique pas IA sociale complexe :** calculs de trajets déclenchés sur événement, activités simples, NPC éloignés endormis.

## 5. Dialogues et interactions

**L'éditeur ne doit pas exiger du JavaScript pour créer chaque activité.**

### Types de déclencheurs

- Appui sur `E` à proximité.
- Entrée / sortie d'une zone.
- Choix de dialogue.
- Minuterie.
- Changement d'état/objectif.
- Fin d'animation.

### Conditions
- État d'objet/PNJ, drapeau, inventaire léger, mission, distance, cooldown.
- Combinaisons `ET`, `OU`, négation bornée.

### Actions
- Changer état, activer mécanisme, animer un pivot, jouer son/effet, afficher texte.
- Démarrer dialogue, choix de réponse, changer expression, lancer PNJ vers destination.
- Donner/retirer objet, mettre à jour mission, mémoriser flag, déclencher autre événement.
- Délais et séquences ordonnées.

### Interface
- **Formulaires adaptés** + séquences avec étapes lisibles ; éditeur de nœuds **non obligatoire**.
- Une référence à un objet se choisit **en cliquant l'objet dans le viewport**, pas en recopiant son identifiant.
- Vérification des références cassées, cycles sans attente, cible/animation absente et conditions illisibles.
- Templates rapides : porte, interrupteur/mécanisme, dialogue simple, PNJ saluant, panneau, objet collectible, petite mission, énigme à étapes.
- Dialogue à branches avec répliques, réponses, prévisualisation, animations/émotions/sons locaux.
- Persistance configurable par état, plutôt que sauvegarde de toutes les animations.

**Exemple complet :** le joueur actionne une vanne ; si fermée et dans la portée, lancer animation + son, changer état, accélérer roue, faire regarder le meunier, afficher une réplique et mémoriser le mécanisme ouvert. Chaque lien cible un **ID stable**.

Les séquences ne peuvent pas exécuter des scripts externes. Ajouter limites de longueur/profondeur/déclenchements pour empêcher des boucles instantanées.

## 6. Inventaire, missions et sauvegardes

Cible du jeu final : **inventaire léger**, quelques objets ramassables, petites missions facultatives et conséquences locales persistantes ; **plusieurs slots de partie**.

La sauvegarde du joueur comprend les états pertinents (objets, flags, objectifs, position), **jamais** les données auteur du Studio. Séparer les namespaces et versions.

Le Studio conserve des brouillons et une archive exportable ; les cartes 100 km² sont **découpées en fichiers par secteur** et un manifeste, pas un énorme JSON monolithique.

## 7. Édition, aperçu et publication

1. Ouvrir un projet + une zone, charger la partie de carte utile.
2. Éditer en transactions Undo/Redo ; enregistrer automatiquement en local avec indication de statut.
3. Tester immédiatement dans le runtime depuis la position choisie, avec une **copie du brouillon**.
4. Revenir à l'éditeur sur le même projet et avec la sélection/historique conservés.
5. Vérifier schémas, coordonnées, assets, références NPC/dialogue/action, incohérences de navigation.
6. Exporter un projet portable ou compiler les secteurs du monde en ressources statiques.
7. Publier via GitHub/GitHub Actions → GitHub Pages, **pas par écriture anonyme depuis la page**.

Les imports sont non fiables : valider types, tailles, schémas et références, et éviter les tokens GitHub dans le client.

## 8. Contraintes LOW-RESOURCE

- Cible 30 FPS, secours 20 FPS ; pas de ralentissement du monde ni d'inputs perdus.
- Vue globale 2D légère ; viewport détaillé uniquement sur les secteurs nécessaires.
- Mutualiser meshes/GLB/matériaux, lazy loading des éditeurs lourds, culling/LOD.
- Régénération de terrain, végétation et navigation **uniquement autour des modifications** ; travailleurs Web Worker seulement si justifiés.
- PNJ et faune hors champ non simulés de façon intensive ; pas de rigid bodies décoratifs.
- Profilage des longues sessions d'édition et libération des ressources GPU après chargements/régénérations.

## 9. Critères d'acceptation

1. Créer/charger une carte, peindre un relief et un biome, sauvegarder, annuler, recharger : données identiques.
2. Créer un PNJ animal avec variante, zone de navigation libre, dialogue à choix et animation de salut **depuis des écrans spécialisés**, puis revenir à sa position sur la carte.
3. Configurer porte/vanne + réaction d'un autre objet ou d'un PNJ sans changer le code.
4. Créer une petite mission avec objet ramassable, condition d'inventaire et flag persistant.
5. Lancer « Jouer ici », vérifier les actions, revenir à la même édition et à la même sélection.
6. Exporter puis importer un projet sectorisé versionné sans perte de liens.
7. Recompiler les secteurs modifiés sans reconstruire toute la carte.
8. Tester une carte synthétique à grande échelle et documenter les limites **sans prétendre à 100 km² fluides non mesurés**.
9. Le runtime publié reste **entièrement statique** sur GitHub Pages.

**Avant de coder, consulter [12-PROJECT-SCOPE.md](12-PROJECT-SCOPE.md) et [13-STUDIO-UX-ARCHITECTURE.md](13-STUDIO-UX-ARCHITECTURE.md)**.
