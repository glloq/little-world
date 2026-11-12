# 09 — Plan de test navigateur du prototype

**Prototype : V0.1 solo statique**. Ce document décrit les essais manuels attendus, **pas une validation visuelle déjà effectuée**.

## Accès

- Jeu : https://glloq.github.io/little-world/
- Éditeur : https://glloq.github.io/little-world/editor/
- Workflow : https://github.com/glloq/little-world/actions

**Pré-requis :** GitHub Pages doit être activé avec source **GitHub Actions** et le dernier workflow `Build and deploy Little World` doit afficher **success**. Après modification de `main`, attendre un déploiement réussi avant de conclure qu'un bug subsiste.

PC conseillé : Chrome, Edge ou Firefox récents, clavier AZERTY ou QWERTY et souris. Le support mobile n'est pas prévu.

## Jeu — scénario de test de 5 minutes

- [ ] L'écran d'accueil « Une vallée à explorer » apparaît ; pas d'erreur bloquante de chargement.
- [ ] Cliquer **Explorer la vallée** ; une scène 3D avec écureuil, vallée, forêt et rivière est visible.
- [ ] **ZQSD/WASD** : marcher, caméra souris après capture du pointeur, **Shift** pour courir.
- [ ] **Espace** au sol : saut unique. **Maintenir** Espace ne doit pas déployer le planeur automatiquement.
- [ ] Relâcher puis **réappuyer** Espace en l'air : membrane ouverte. Nouvel appui : repli.
- [ ] Aller dans la rivière : passage à la **nage** ; **Ctrl** descend, **Espace** remonte ; l'oxygène s'affiche.
- [ ] Suivre le sentier vers le moulin : appuyer sur **E** à proximité pour arrêter puis redémarrer la roue.
- [ ] Approcher de la côte et observer le ponton, la barque et les maisons.
- [ ] **R** ramène au départ, **Échap** libère la souris.
- [ ] Les FPS et la position apparaissent dans le panneau inférieur.

### Limites intentionnelles

- L'écureuil est un proxy géométrique, pas encore un personnage riggé/animé.
- Les collisions utilisent la hauteur analytique du terrain ; pas de collisions de bâtiment et de roue.
- Le mouvement est un modèle arcade simplifié ; les paramètres doivent être ajustés avec les retours d'essai.
- La rivière est un volume logique simple, pas une simulation de fluide.
- Les décors lointains et les fonds marins ne sont pas finalisés.

## Éditeur — scénario de test

- [ ] Ouvrir **/editor/** : la vallée et les panneaux d'outils apparaissent.
- [ ] Caméra orbitale : clic-glisser pour tourner, molette pour zoomer.
- [ ] Modifier **graine** et **densité**, puis cliquer « Régénérer la vallée » ; les arbres changent.
- [ ] Choisir **Sapin**, **Rocher** ou **Caisse** ; cliquer sur le terrain pour ajouter au moins trois objets.
- [ ] Vérifier que certains assets se chargent depuis **`models/*.glb`** et que le fallback procédural fonctionne en cas d'erreur de chargement.
- [ ] **Sauvegarder localement** ; recharger l'éditeur : les objets restent en place.
- [ ] **Exporter JSON** ; effacer les objets ; **Importer JSON** : les retrouver.
- [ ] Cliquer **Tester la carte** : le jeu s'ouvre avec la graine et les placements du brouillon courant, sans publier la carte.
- [ ] Revenir dans l'éditeur : les objets du brouillon sont conservés.
- [ ] Vérifier que le **mode joueur** ne propose aucun outil de modification terrain.

### Fonctionnalités éditeur encore absentes

Sculpture du relief, modification des splines d'eau, import direct de GLB depuis l'interface, suppression d'un objet individuel par sélection, undo/redo, règles d'interactions configurables pour chaque prefab, compilation de carte personnalisée dans le site public.

## Vérifications techniques

1. Ouvrir la console développeur (F12) : relever tout **404**, exception JS, erreur GLB ou message WebGL.
2. Dans **Network**, vérifier que les fichiers sont chargés sous **`/little-world/`**.
3. Tester au moins **Firefox et Chromium** si possible.
4. Relever le **FPS indiqué**, le navigateur, le GPU et la résolution.
5. Vérifier l'éditeur après un rechargement complet et après un export/import.
6. Confirmer que le site n'appelle aucun service de jeu distant.

## Format de retour utile

```text
Navigateur :
Carte (jeu / éditeur) :
Étapes pour reproduire :
Résultat observé :
Résultat attendu :
FPS affichés :
Message console (si disponible) :
```

Les tests automatiques en CI couvrent les mathématiques de terrain, les transitions principales de mouvement et la structure des GLB ; **ils ne remplacent pas les vérifications de rendu et de maniabilité**.
