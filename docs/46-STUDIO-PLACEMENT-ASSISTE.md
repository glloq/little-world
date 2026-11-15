# 46 — Little World Studio : placement assisté et accompagnement de création

Branche `feat/studio-creation-workflows-v1`. Aucun merge automatique dans `main`.

## Nouveaux parcours

### 1. Assistance à la création depuis zéro

Le module **Assistant de création** de la barre d’outils propose neuf étapes : géographie, relief, eau, biomes, objets, chemins, personnages, zones et validation. Chaque étape ouvre **le véritable module de travail existant**, pas un moteur alternatif. Un résumé affiche les dimensions de la carte et le nombre d’éléments issus des index V3. Le test « Jouer ici » demeure une compilation isolée.

### 2. Placement individuel amélioré

Dans **Objets**, sélectionner un asset dans la bibliothèque puis ouvrir « Précision du placement » :
- rotation numérique (R / Maj+R pour 15°) ;
- échelle uniforme de 0,1 à 5 ;
- aimantation et pas de grille ;
- aperçu 3D correspondant ;
- création des composants Collider et Light prévus par le registre World Production, à l’identique des autres méthodes d’ajout.

### 3. Construction sur ligne

Sélectionner un asset, définir l’espacement et cliquer **Répéter sur une ligne**.

Le Studio réutilise le tracé 3D commun : points à la souris, édition des poignées, Entrée pour créer. `linePattern` distribue les éléments à distance constante sur la longueur cumulée et oriente chaque instance selon la tangente de la ligne. Le décalage d’orientation reste configurable.

Exemples : clôture, haie, chemin de lampadaires ou rangée d’arbres.

### 4. Remplissage d’une zone

Sélectionner le modèle, définir l’espacement, cliquer **Remplir un polygone** et dessiner au moins 3 sommets. `areaPattern` place une grille régulière et conserve uniquement les points intérieurs au polygone.

Un tracé = **une transaction CommandBus** ; maximum **160 entités** par opération. Les limites du monde, l’eau profonde, les pentes et les conflits sont contrôlés avant validation. Un avertissement peut être ignoré si l’option de protection est décochée.

Cet outil reste une solution pour des groupes de décors ou objets interactifs. Pour une forêt très dense, préférer l’habillage de biotope instancié.

### 5. Assemblages rotatifs

Le placement « à la souris » des assemblages sauvegardés permet maintenant R / Maj+R. Le centre, les décalages X/Z et les rotations des entités de chaque copie sont transformés ensemble. Le ghost de placement reprend les dimensions des assets du registre lorsqu’elles sont disponibles. Les objets conservent leurs composants visuels/collisions, jamais leurs identifiants de gameplay d’origine.

### 6. Alignement et distribution multi-objets

Avec plusieurs objets sélectionnés, l’inspecteur propose :
- **Aligner X** / **Aligner Z** : moyenne des positions sur l’axe ;
- **Espacer X** / **Espacer Z** : distribution régulière entre la première et la dernière position sur l’axe.

Seules les transformations sont modifiées. Undo/Redo utilise les transactions existantes.

### 7. Catalogue d’assets

Les miniatures sont produites en lots de 8, progressivement, pour éviter de charger tous les modèles 3D simultanément. Le catalogue affiche les caractéristiques mesurées du modèle actuellement sélectionné. Favoris et catégories demeurent disponibles.

## Sécurité et limitations

- Les changements de sources sont capturés dans les secteurs V3 par `StudioSession.change`, dont l’hydratation et l’historique restent partagés.
- Les fonctions de distribution géométrique sont **pures** et bornées : les maillages d’assets ne sont pas dupliqués dans les données projet.
- L’alignement de l’objet sur la pente, les collisions précises entre modules tournés et l’édition hiérarchique d’assemblages restent à développer.
- Les longs tracés dépassant 160 éléments doivent être fractionnés ou bénéficier d’un mode de distribution instanciée.
- Les miniatures peuvent rester vides lorsqu’un aperçu GLB ne charge pas ; cela ne supprime ni ne bloque l’asset.

## Tests ciblés

```bash
npm test
npm run typecheck
npm run build
node --experimental-strip-types --test tests/studio-placement-patterns.test.mjs
node --experimental-strip-types --test tests/studio-selection-layout.test.mjs
node --experimental-strip-types --test tests/studio-creation-workflows.test.mjs
npm run test:studio
```

## Recette recommandée

1. Créer un projet d’île vierge dans l’assistant initial.
2. Utiliser « Assistant de création » pour parcourir relief, eau et biomes.
3. Poser un bâtiment à échelle 1,5 avec rotation numérique.
4. Placer 15 clôtures le long d’une courbe ; tester Ctrl+Z.
5. Remplir une parcelle polygonale ; vérifier que les objets hors zone sont exclus.
6. Capturer trois objets dans un assemblage, appliquer R pour le tourner et le poser ailleurs.
7. Multisélectionner quatre objets, les aligner puis les distribuer sur X.
8. Exporter/réimporter le ZIP, lancer « Validation » et « Jouer ici ».
9. Faire une inspection visuelle sur GPU faible puissance avant toute promotion dans `main`.

## Étapes ultérieures recommandées

1. Prefabs hiérarchiques éditables par instance et séparation décor interactif / décor instancié.
2. Brush à masques pentes/biomes/exclusions et gomme de végétation à aire variable.
3. Construction de ponts sur rives et tracés de murs/clôtures paramétriques.
4. Contrôle d’occupation spatial indexé plutôt que balayage complet de `entityIndex`.
5. Prévisualisation GPU à budget, streaming de mesh et comparateurs de performances réelles.
