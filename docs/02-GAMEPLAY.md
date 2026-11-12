# 02 — Personnage, déplacements et contrôles

Statut : **comportements validés, paramètres physiques à régler par prototypage**.

## Identité du personnage

- **Écureuil volant animal**, stylisé, non humanoïde.
- Déplacement principalement quadrupède, queue expressive.
- Membrane de planage entre membres avant et arrière ; **animation contrôlée** (pas de simulation coûteuse de tissu).
- Modèle, squelette et animations devront rester compatibles avec un format **glTF/GLB**.
- Silhouette identifiable de loin et dans les vues de dessus inclinées.

## Commandes clavier / souris proposées

| Contexte | Commande | Effet |
| --- | --- | --- |
| Tous | Souris | Orbite de la caméra en troisième personne ; capture du pointeur à valider |
| Au sol | `ZQSD` ou `WASD` | Mouvement relatif à la caméra |
| Au sol | `Shift` maintenu | Course |
| Au sol | `Espace` | Saut |
| En l'air, après relâchement | Nouvel appui `Espace` | Ouvre ou replie la membrane |
| En surface | `ZQSD` | Nage horizontale |
| Dans l'eau | `Espace` maintenu | Remonte vers la surface |
| Dans l'eau | `Ctrl` maintenu | Descend / plonge |
| Près d'un objet interactif | `E` | Interagir |
| Tous | `Échap` | Quitter la capture du pointeur / pause locale |

Les **touches exactes sont une proposition** ; la règle demandée est ferme : `Espace` saute au sol et commande le planage après le saut. Les systèmes doivent accepter un mapping de touches reconfigurable.

### Gestion rigoureuse d'Espace

Un saut se déclenche sur **front d'appui**, jamais à chaque frame. En l'air, l'activation du planage requiert **relâchement puis nouvel appui** afin de ne pas déployer automatiquement la membrane au moment du saut. À l'entrée dans un volume d'eau, le changement de contexte annule les commandes d'air non pertinentes.

Le comportement d'un second appui en l'air est retenu comme un **toggle** de membrane. L'ouverture peut être limitée par un très bref délai de sécurité, à régler aux essais.

## États de locomotion

États de haut niveau proposés :

- `GROUNDED` : repos, marche, course et saut initial.
- `AIRBORNE` : chute et saut.
- `GLIDING` : portance simplifiée, conservation d'une vitesse minimale, descente contrôlée.
- `SWIMMING_SURFACE` : mouvement sur le plan d'eau.
- `DIVING` : mouvement 3D sous la surface.

Transitions pilotées par **contact physique**, position du volume d'eau, profondeur d'immersion et actions utilisateur. Éviter que les animations soient elles-mêmes la source de vérité de la locomotion.

| Transition | Déclencheur | Règle |
| --- | --- | --- |
| Sol → Air | Front `Espace` ou bord de falaise | Appliquer impulsion si saut, sinon chute |
| Air → Planage | Front `Espace` après relâchement | Déployer membrane |
| Planage → Air | Nouveau front `Espace` | Replier membrane |
| Air/Planage → Sol | Collision d'atterrissage valide | Retour locomotion au sol |
| Sol/Air → Nage | Immersion suffisante dans volume d'eau | Fermer membrane, adapter vitesse |
| Nage → Plongée | `Ctrl` ou immersion voulue | Mouvement vertical sous l'eau |
| Plongée → Surface | Remontée à la ligne d'eau | Reprendre nage |
| Eau → Sol/Air | Sortie de l'eau selon contacts | Remettre locomotion terrestre / aérienne |

## Physique et ajustements

**Rapier** est proposé pour les collisions et la détection des contacts ; la simulation de planage et de flottabilité sera une logique spécialisée, avec des états testables sans Three.js.

### Sol

- Vitesse marche/course configurable dans des données, pas dans des constantes disséminées.
- Gravité et impulsion de saut cohérentes avec l'échelle du monde.
- Gestion des pentes, marches faibles, glissement sur surfaces trop raides.
- Aucune endurance.

### Planage

- Modèle **arcade contrôlé** : accélération modérée, descente minimale, limites de vitesse et virage doux.
- Pas de propulsion infinie, pas de gain arbitraire d'altitude.
- Mesurer distance de planage et vitesse terminale dans une scène standard.
- Les paramètres pourront évoluer après essais, sans changement de protocole réseau.

### Eau

- Surface décrite par une hauteur ou une fonction de hauteur ; volumes d'eau explicites pour détecter les transitions.
- Flottabilité et résistance à l'eau simplifiées ; mouvement de plongée en trois dimensions.
- Barre ou indicateur d'oxygène, **limite longue** à préciser lors des tests.
- **Pas de mort en V1** : à épuisement de l'oxygène, appliquer une remontée ou un retour en surface sûr, à choisir en prototypage.
- Rendu sous-marin : modification simple de brouillard/couleur, avec caméra encore lisible.

## Caméra

Troisième personne, contrôlée à la souris ; suivi amorti, évitement des obstacles entre la caméra et le personnage, distance et angle limités. Prévoir des réglages indépendants pour course, nage et planage, mais une seule implémentation de caméra.

PC : cible clavier AZERTY et QWERTY ; mappings exposés dans les paramètres. Pas d'interface tactile dans la première version.

## Modèle réseau à respecter

Les **commandes** (direction, saut, course, déploiement, nage) sont les données transmises par le client. Le serveur détient les états physiques et les valide. Le client pourra prédire son mouvement puis se réconcilier avec l'état autoritaire ; la synchronisation de position brute sans prise en compte des inputs n'est pas l'architecture cible.

## Jeux de tests nécessaires

1. Saut unique même si `Espace` reste enfoncé.
2. Saut → relâchement → second appui → planage.
3. Planage → repli → atterrissage ; absence de déploiement automatique.
4. Air → eau, eau → sol et eau → profondeur sans oscillation entre états.
5. Sortie de l'eau proche d'une pente ou d'un rebord.
6. Caméra coincée entre personnage et montagne.
7. Correspondance simulation locale/serveur sur un jeu d'inputs rejoué.
8. Changement de mapping AZERTY/QWERTY sans modifier le contrôleur.
