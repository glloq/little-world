# 44 — Studio : création rapide, assemblages et cache auteur (branche expérimentale)

## Périmètre

Branche `feat/studio-creation-workflows-v1`, basée sur `main` à `0e41173`. **Aucune fusion vers `main`**.

Cette campagne étend les outils V3 existants sans créer de second moteur de scène, de sauvegarde, de CommandBus ni de génération géographique.

## 1. Bibliothèque

- Favoris d'assets (étoile par vignette, filtre « Favoris »).
- Préférences locales facultatives : une erreur de `localStorage` ne bloque jamais le Studio.
- Les assets proviennent toujours de `placeableWorldAssets` et du projet ; aucun fichier GLB n'est dupliqué.

## 2. Pinceau de décor multi-assets

- Module « Objets » : choisir un modèle dans la bibliothèque, l'ajouter à la palette, répéter, puis activer « Peindre avec la palette ».
- Un glisser génère une distribution pseudo-aléatoire **déterministe par graine** ; rayon, densité et distance minimale configurables.
- Maximum **120 objets par trait**. Un trait = **une transaction V3 annulable**.
- Contrôle des limites du monde, de la profondeur d'eau et des conditions de placement.
- Les collisions des modèles répertoriés proviennent du registre World Production.
- Les éléments sont de vraies entités V3 (un identifiant persistant par objet), pas du simple habillage procédural. Réserver ce pinceau aux petits groupes ou au décor interactif ; utiliser les biotopes instanciés pour des forêts massives.
- **Limites** : pas d'aperçu individuel des 120 objets ni de stroke multi-chunks réparti sur de longues distances ; pas de rotation automatique sur normale de terrain ; les distributions peuvent rester limitées par l'historique pour une sélection très coûteuse.

## 3. Assemblages

- La sélection 3D de 1 à 100 objets/bâtiments visuels peut être enregistrée comme un assemblage.
- Le registre optionnel `libraries.assemblies` est validé par le schéma V3 et conservé dans les exports ZIP.
- Les transformations et les composants Visual/Collider sont enregistrés ; les positions horizontales sont relatives au centre.
- Une copie entière est placée à la cible de la caméra et peut être annulée en un geste.
- Les comportements, états, dialogues et interactions **ne sont pas copiés** afin de ne pas générer de références incorrectes.
- **Limites** : groupes à plat, sans relation parent-enfant, pas d'édition par instance, pas de ghost placement à la souris ; prochains lots possibles.

## 4. Stabilisation

- Intégration du correctif de conservation de la saisie de l'inspecteur depuis `claude/studio-inspector-edit-guard`.
- `StudioSession.compactHydrated(visible,limit=512)` évince des sources auteur déjà lues, uniquement après reconstruction de la vue 3D ; la transaction courante, les secteurs non sauvegardés, le journal Undo/Redo, la sélection et leurs dépendances restent en mémoire.
- La cible 512 est **souple** : les secteurs protégés peuvent la dépasser. La géographie lointaine peut être recalculée à la prochaine navigation ; surveiller les horizons et les temps de reconstruction sur les grandes îles.
- Cette première borne ne constitue **pas** un streaming complet de tous les paquets auteur ni un budget GPU. Le runtime et les caches WebGL restent à traiter séparément.

## 5. Tests et recette

Tests ajoutés :
- `tests/studio-creation-workflows.test.mjs` : conservation dans le modèle, copie, Undo/Redo et générateur de distribution.
- `tests/studio-hydration-budget.test.mjs` : éviction sans perte des secteurs visibles.
- `tests/inspector-editing.browser.mjs` : test existant de non-perte de saisie, repris de la branche de correction.

Commandes :
```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:editor
npm run test:editor-content
npm run test:studio
```

Recette humaine : ouvrir une carte de référence, ajouter 3 assets à la palette, peindre puis annuler/refaire, sélectionner 3 objets, créer un assemblage, le placer puis enregistrer et recharger le projet. Tester ensuite un parcours sur la grande île et constater l'utilisation mémoire. Aucun niveau de performance cible n'est certifié sur GPU réel.

## 6. Suivants

1. Vrai placement de prefab sous le curseur avec aperçu fantôme et édition des groupes.
2. Pinceau instancié léger pour végétation massive, avec masques de terrain.
3. Streaming auteur/rendu consolidé : index spatial, LRU multi-cache, préchargement, mesure mémoire et optimisation de l'horizon.
4. Panneaux adaptatifs et bibliothèque progressive/virtualisée.
