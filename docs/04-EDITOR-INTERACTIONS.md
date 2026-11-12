# 04 — Éditeur de monde et interactions

**Statut : atelier fonctionnel avec format source v2.** Sélection/multisélection, gizmos de position/rotation/échelle, duplication/suppression, annuler/rétablir, sculpture locale, peinture de biotopes, tracés d’eau/chemins, PNJ et dialogues déclaratifs sont implémentés. IndexedDB, export/import validé, migration v1 et retour du mode test sont partagés avec le jeu.

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


## Objectif

Créer et modifier la vallée de Little World **directement dans le navigateur** : génération, sculpture du relief, eau, chemins, végétation, bâtiments, objets interactifs et test immédiat.

**Pas de serveur ni d'authentification.** L'éditeur est un outil d'auteur local, inclus au site statique mais **ses modifications ne sont pas publiées automatiquement** sur GitHub Pages.

## Un moteur de monde partagé

Le jeu et l'éditeur réutilisent les mêmes modules `world`, `rendering`, `movement`, `interactions`, `asset-registry`. Aucun système réseau n'est requis.

- **Édition** : modifier une copie de la carte source, avec historique des opérations.
- **Test local** : jouer dans une copie de la carte actuellement éditée, sans altérer l'historique.
- **Compilation/publication** : valider et produire les ressources statiques du jeu. La publication sur Pages se fait par **commit du contenu autorisé + build GitHub Actions**, jamais par une écriture anonyme dans le navigateur.
- La version incluse dans le site est une **carte par défaut en lecture seule** pour le mode joueur.

## Interface

1. **Header compact** : carte, sauvegarder localement, importer, exporter, undo/redo, générer, tester, statut non publié.
2. **Outils à gauche** : sélection, terrain, eau, végétation, chemins, bâtiments, objets, interactions.
3. **Viewport central Three.js** : navigation souris, poignées de transformation, grille facultative, raycasting.
4. **Inspecteur droit contextuel** : propriétés pertinentes de l'objet courant, sans réglages inutiles.
5. **Catalogue d'assets** : recherche, catégorie, miniature, glisser-déposer.
6. **Calques** : sol, eau, décor, collisions, interactions et volumes de test (masquables).

Les actions fréquentes ne doivent pas exiger de saisir des coordonnées manuellement.

## Outils prioritaires

### Terrain
- Génération par graine, aperçu et confirmation.
- Pinceaux : **élever, abaisser, lisser, aplanir**, réglages simples.
- Régénération partielle et avertissement en cas de conflit avec retouches manuelles.
- Visualisation des pentes non praticables.

### Eau et chemins
- Rivière et routes par splines/points de contrôle.
- Paramètres de largeur, profondeur, élévation ; volumes logiques de nage et plongée.
- Placement de ponts/quais et contrôle des connexions.

### Assets
- Placement, déplacement, rotation, échelle, duplication, suppression.
- Prefabs complets et modules ; dispersion de végétation avec zones d'exclusion.
- Prévisualisation des collisions et points d'animation (roue, porte, vanne).

## Interactions locales (sans backend)

L'interaction est **configurable en données**, sans script JavaScript arbitraire éditable dans une carte.

Composants proposés :
- `Interactable` : portée, libellé, touche `E`.
- `TriggerVolume` : entrée/sortie d'un volume.
- `Animated` : animation nommée, pivot, lecture en boucle.
- `StateMachine` : états/transitions.
- `Collectible` et `Dialogue` : différés, mais compatibles avec le modèle.

Types d'événements : `onInteract`, `onEnterZone`, `onExitZone`, `onStateChanged`.

Conditions : distance, état courant, cooldown (pas de compte ou permission distante).

Actions : `setState`, `toggleState`, `playAnimation`, `stopAnimation`, `emitEvent`.

**Exemple moulin** : appuyer sur `E` devant une vanne → état `open` → roue et eau animées localement. Pas de validation réseau ni d'état partagé entre utilisateurs en V1.

## Sauvegardes adaptées à GitHub Pages

### Édition locale
- **IndexedDB** : sauvegardes de travail automatiques ou explicites, avec schéma/version.
- **Export JSON** : sauvegarde portable complète de la carte éditable et des références aux assets.
- **Import JSON** : contrôle strict des versions, types, limites et références ; erreurs explicites.
- **Aucune promesse de persistance absolue** : les données du navigateur peuvent être supprimées, d'où l'export recommandé.
- Le navigateur ne peut pas écrire directement les fichiers GitHub Pages ; une carte modifiée reste locale tant qu'elle n'est pas intégrée au dépôt et redéployée.

### Publication
1. Éditer/tester la carte.
2. Exporter et **valider** le fichier source.
3. Ajouter au dépôt les données approuvées et les assets nécessaires.
4. Compiler le bundle statique.
5. Publier avec GitHub Actions vers GitHub Pages.
6. Vérifier la carte sur l'URL publique.

Cette procédure est **l'objectif du pipeline**, pas une fonctionnalité déjà codée.

## Sécurité et limites

- Le site public fournit un éditeur accessible si l'URL est connue : **aucune donnée privée, aucun jeton ni secret ne doit y être inclus**.
- Fichiers importés traités comme données non fiables ; aucune exécution de scripts importés.
- Références d'assets validées, pas de chargement incontrôlé d'URL tierces.
- Undo/redo d'opérations ; identifiants stables pour les objets liés.
- Le mode joueur ne propose **aucune** fonction de modification de terrain.

## Critères d'acceptation

1. Générer une carte → déplacer un arbre → sauvegarder → fermer/recharger → même état.
2. Exporter JSON → effacer le stockage local → réimporter → scène identique.
3. Changer la graine → prévisualiser → annuler sans perte.
4. Associer un levier à une roue → tester → animer, sans code spécifique au moulin.
5. Publier une carte de démonstration comme **fichiers statiques**, puis la charger sur Pages.
6. Les références manquantes, schémas invalides ou scripts interdits bloquent import ou compilation.
