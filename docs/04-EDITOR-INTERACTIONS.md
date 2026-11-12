# 04 — Éditeur de monde et système d'interactions

Statut : **architecture fonctionnelle recommandée**, validation par prototypes requise.

## Objectif

Permettre de **générer, retoucher et publier** la carte de Little World et d'y associer des comportements sans modifier le code pour chaque nouvel objet.

L'éditeur est un outil **développeur / créateur**, distinct du gameplay : les joueurs **ne peuvent pas modifier le relief, les chemins, l'eau ni les bâtiments statiques**.

## Un moteur de monde commun

Le jeu et l'éditeur doivent consommer les mêmes données, définitions d'assets, volumes de collision et composants d'interaction.

- **Mode édition :** chargement des données sources, outils de modification, inspection, validation.
- **Mode simulation :** exécution locale à partir d'une copie figée de la scène en cours ; les modifications de test ne doivent pas altérer l'édition.
- **Mode publication :** vérification des références puis production d'un **bundle versionné immuable** utilisable par le client et le serveur.

Éviter de dupliquer les calculs de terrain/rivière dans une implémentation éditeur et une implémentation jeu divergentes.

## Interface de l'éditeur

Interface claire et compacte :

1. **Barre supérieure** : nom de carte, sauvegarde, annuler/refaire, générer, tester, publier.
2. **Barre d'outils gauche** : sélection, terrain, eau, végétation, chemins, bâtiments, objets, interactions.
3. **Viewport central** : Three.js, contrôles de navigation, grille/magnétisme activables.
4. **Inspecteur droit contextuel** : paramètres uniquement de l'objet sélectionné.
5. **Catalogue d'assets** : recherche, filtres, aperçu, insertion par glisser-déposer.
6. **Calques** : terrain, eau, décor statique, gameplay, volumes invisibles ; masquage/verrouillage.

Pas de saisie manuelle obligatoire des coordonnées pour les actions courantes : utiliser les poignées de manipulation et la sélection directe.

## Outils prioritaires

### Génération du monde
- Modifier graine et contraintes ; aperçu avant validation.
- Régénérer une **zone** avec indication des overrides potentiellement impactés.
- Garder les derniers états sauvegardés pour revenir en arrière.

### Terrain
- Pinceaux **élever, abaisser, lisser, aplanir** ; taille/force.
- Repère des pentes impraticables.
- Collisions reconstruites à la compilation ou lors de l'aperçu, pas à chaque mouvement de souris inutilement.

### Eau
- Dessiner rivière par points de contrôle (spline).
- Ajuster largeur, profondeur et profil de hauteur.
- Visualiser les volumes d'eau indépendamment du rendu.

### Décor
- Palette de prefabs avec miniatures ; placement, déplacement, rotation, échelle.
- Dispersion contrôlée (végétation, pierres), avec exclusions autour des chemins.
- Bâtiments complets et modules assemblables ; pas d'éditeur d'architecture complexe initial.

### Chemins et zones
- Dessiner des chemins par spline ou points ; validation des pentes.
- Zones logiques : immersion, déclencheur, interaction, végétation, spawn, exclusion.

## Système d'interactions

**Séparer l'apparence d'un objet et son comportement.** Chaque instance placée référence un prefab plus un ensemble de composants de gameplay.

Composants proposés :
- `Interactable` : portée, commande d'activation, libellé.
- `TriggerVolume` : entrée / sortie d'une zone.
- `Animated` : animation nommée, pivot, durée, boucle.
- `StateMachine` : états possibles et transitions autorisées.
- `Collectible` : collecte (post-prototype).
- `Container` : inventaire associé (post-prototype).
- `Dialogue` : dialogues (itération ultérieure).

**V1 de l'éditeur :** règles déclaratives, pas de scripts arbitraires injectés depuis la carte. Un catalogue d'événements/conditions/actions validé côté serveur protège le modèle réseau et permet de tester chaque règle.

| Événements | Conditions | Actions |
| --- | --- | --- |
| `onInteract` | `distance < seuil` | `setState` |
| `onEnterZone` | `state == X` | `playAnimation` |
| `onExitZone` | `hasPermission` | `stopAnimation` |
| `onStateChanged` | `cooldownReady` | `emitEvent` |

Les futurs nœuds visuels doivent utiliser **le même schéma de données** que les règles simples, sans second interpréteur.

## Exemple : vanne du moulin

- Prefab visuel `mill_gate` avec poignée, animation et collider.
- `Interactable` à portée de 2 m (valeur d'exemple).
- États `closed` et `open`.
- `onInteract` : vérifier portée et permissions → basculer l'état autoritaire → déclencher animation de poignée et de roue.
- Les clients observent l'état et animent **localement** : pas de synchronisation de chaque angle de la roue à 60 Hz.

Ce type d'objet doit pouvoir être configuré, testé et enregistré sans ajouter une classe JavaScript spécifique au moulin.

## Données, undo/redo et publication

- Commandes d'édition réversibles et granulaire (ajout, suppression, déplacement, modification propriété).
- Sauvegarde **atomique** d'une version source avec schéma et références d'assets.
- Identifiants stables pour instances, zones et composants ; les liens entre objets ne doivent pas dépendre de l'ordre dans un tableau.
- Validation avant publication : références manquantes, collisions absentes, événements inconnus, volumes incohérents, points de spawn invalides.
- Publication versionnée ; session multijoueur verrouillée sur **une version exacte** de la carte.

## Tests d'acceptation

1. Générer → déplacer un arbre → enregistrer → recharger : position identique.
2. Changer la graine avec overrides : aucun effacement silencieux.
3. Importer un prefab valide → placer → publier → voir dans le client.
4. Associer une interaction → tester localement → sauvegarder → tester en réseau.
5. Deux joueurs activant simultanément la vanne aboutissent à un état serveur cohérent.
6. La fonction undo/redo reproduit l'état attendu sans altérer les IDs des autres éléments.
7. Une interaction avec un type inconnu ou asset absent **bloque la publication** avec erreur explicite.
