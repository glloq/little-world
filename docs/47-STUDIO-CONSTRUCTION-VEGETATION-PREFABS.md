# 47 — Studio : constructions, végétation et prefabs V2

Périmètre : `feat/studio-creation-workflows-v1`. Aucun merge dans `main`.

## 0. Intégration de la branche inspector-edit-guard

Le correctif de conservation de focus et son test DOM étaient déjà repris. Compléments récupérés :
- `src/studio/dom.ts` : mémorise `data-initial` et `data-committed` pour les saisies non encore validées ;
- `tools/test-inspector-edit-browser.mjs` : contrôle navigateur du focus et de la valeur en cours après les reconstructions d'inspecteur et les zooms caméra ;
- `tools/run-browser-check.mjs`, `package.json`, `.github/workflows/checks.yml` : enregistrement du test et exécution CI.
Ne pas supprimer l'ancienne branche avant vérification de la CI correspondante.

## 1. Outils de ponts et murs

### Mur et clôture modulaires
Dans **Objets > Constructions modulaires**, choisir un modèle du registre World Production (groupes `walls` et `fences`) et **Tracer un mur / une clôture**.

Le Studio réutilise l'éditeur universel de polyligne, puis `wallModules` :
- espacement basé sur la **dimension mesurée en X du GLB** ;
- chaque segment est orienté selon le tracé ;
- ajustement linéaire modéré de la longueur des segments ;
- maximum 120 modules par opération ;
- véritables entités V3 avec `Transform`, `Visual`, `Collider` et Undo/Redo.

### Pont entre deux rives
Choisir un des trois modèles : `structure.bridge_log`, `structure.bridge_stone`, `structure.bridge_wooden_arch`, puis deux points.

`bridgePlan` vérifie une portée de 2 à 30 m, un étirement du modèle dans une plage de 0,6 à 2,5, la présence d'eau au milieu et la différence de hauteur des berges. Le pont est orienté selon l'axe local X et relevé relativement au relief central, avec hauteur minimale configurable. Si aucun modèle n'est compatible, l'opération échoue plutôt que produire un pont démesuré.

**Limites** : ces contrôles ne remplacent pas un calcul de résistance, une connexion aux chemins, un pont adaptatif segmenté ni une preuve de traversabilité. La géométrie et la collision du kit doivent être contrôlées visuellement en jeu.

## 2. Peinture de végétation et exclusions

Le module **Biotopes** propose **Sans végétation** et **Rétablir végétation**.

Les pinceaux utilisent le même moteur géographique que la carte 2D :
- le code d'occupation `x` supprime arbres, arbustes et couverture végétale procédurale ;
- la restauration efface uniquement les cellules effectivement marquées `x` ;
- par défaut, le dessin respecte les corrections déjà placées (route, ferme, bâti, zone protégée) ;
- la résolution est de 16 × 16 cellules par secteur, sans création de milliers d'objets ni nouveaux formats de masque ;
- les écritures sont une seule transaction V3 réversible par trait.

Les exclusions peuvent aussi être corrigées sur la **carte 2D > Occupation** avec rectangles, pinceaux et polygones déjà disponibles.

**Limites** : cellules discrètes au bord des formes, pas de bordure anti-aliasée ; l'exclusion concerne le décor végétal généré, **pas** les arbres créés manuellement comme entités. Pour des coupes détaillées, travailler avec les pinceaux 2D.

## 3. Prefabs hiérarchiques éditables par instance

Le nouveau format d'assemblage `version:2` ajoute un `key` stable par élément et un `parentKey` optionnel. Les assemblages `version:1` restent acceptés.

Lors de la capture, les relations parent/enfant de la sélection sont conservées ; les autres éléments se rattachent au premier objet. Une capture enfant-avant-parent est réordonnée pour éviter toute parenté cyclique.

Au placement :
- une entrée par pièce est conservée dans `libraries.prefabs` (composants `Visual` et `Collider`) ;
- chaque copie reçoit son propre `id`, son `Transform`, son `prefabId` stable et son `parentId` ;
- un groupe ne stocke pas une copie des GLB ;
- les instances non personnalisées utilisent automatiquement le modèle partagé, grâce à `resolveEntity` ;
- les copies peuvent être déplacées ensemble via la sélection du groupe, sans remplacer les transformations individuelles.

Dans **Assemblages réutilisables > Instance de prefab** :
- **Modifier uniquement cette instance** : applique un composant `Visual` local, conservé même lorsque le modèle partagé change ;
- **Modifier le modèle partagé** : met à jour `libraries.prefabs` et le modèle d'assemblage. Les instances non personnalisées suivent, les autres conservent leurs overrides ;
- **Sélectionner l’instance entière** : charge les secteurs concernés et sélectionne les descendants pour le gizmo ;
- **Modifier la hiérarchie de cette instance** : change le `parentId` du membre choisi, sans modifier les autres copies. Les cycles et références entre instances sont interdits.

Lorsque le modèle local n'a plus de collision mais hérite d'un Collider via le prefab, il est explicitement détaché du modèle partagé : V3 ne possède pas de suppression par override `null`. Cela évite une collision invisible.

**Limites** : parenté logique, sans graphe de transformation 3D hiérarchique vivant. Le déplacement du parent seul n'entraîne pas ses enfants ; utiliser « Sélectionner l’instance entière ». Pas encore de nested prefab dans un prefab, ni de synchronisation automatique des transformations relatives des copies après édition du modèle.

## 4. Validation et tests

Nouveaux tests :
- `tests/studio-modular-construction.test.mjs` — géométrie modulaire, portée, eau, rives ;
- `tests/studio-vegetation-masks.test.mjs` — exclusion d'occupation et conservation des corrections protégées ;
- `tests/studio-prefab-instances.test.mjs` — parenté V2, V1, modifications locales vs modèle partagé, copies indépendantes, interdiction des cycles ;
- reprise `tools/test-inspector-edit-browser.mjs` avec test DOM historique.

Suite GitHub Actions : `npm test`, `npm run build`, tests navigateur/Studio et `npm run test:inspector-edit` (dans le contexte de prévisualisation servant les pages).

Recette humaine :
1. Tracer une clôture courbe à plusieurs angles et vérifier les pivots GLB.
2. Relier deux rives par un pont adapté ; tester une travée trop longue et une vallée sans eau.
3. Peindre une exclusion de végétation à cheval sur deux secteurs, sauvegarder puis recharger et restaurer.
4. Capturer un bâtiment + décorations comme prefab ; en placer deux copies.
5. Changer un visuel local, puis le modèle partagé et vérifier les deux copies.
6. Reparent une pièce, tester la protection anticylce, sélectionner le groupe et le déplacer.
7. Exporter/réimporter le projet, annuler/refaire, puis jouer la carte en environnement WebGL réel.

## 5. Suites utiles

- Vrai snap de connexions pour murs, angles et extrémités.
- Pont paramétrique multi-modules et adaptation aux appuis.
- Masques de végétation différenciés par classe (arbres seulement, arbustes seulement, etc.).
- Groupes de transformation hiérarchiques avec pivots persistants.
- Diff d'instances visualisable et commande « Réinitialiser au modèle ».
