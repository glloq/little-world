# 02 — Personnage, déplacements et contrôles

**Statut : comportements validés, valeurs physiques à calibrer. V1 solo / client local uniquement.**

## Personnage

- **Écureuil volant stylisé non humanoïde**, locomotion surtout quadrupède, queue expressive.
- Membrane entre membres, **animation de déploiement**, sans simulation de tissu coûteuse.
- Modèle glTF/GLB avec squelette/animations ; **proxy** géométrique autorisé pour tester la simulation avant la création du personnage définitif.

## Contrôles (proposition à tester)

| Contexte | Entrée | Action |
| --- | --- | --- |
| Tous | Souris | Caméra libre à la troisième personne |
| Sol/eau | `ZQSD` ou `WASD` | Se déplacer par rapport à la caméra |
| Sol | `Shift` maintenu | Courir |
| Sol | `Espace` (front d'appui) | Saut simple |
| Air | `Espace` après relâchement | Déployer / replier la membrane |
| Nage/plongée | `Espace` maintenu | Remonter |
| Nage/plongée | `Ctrl` maintenu | Descendre |
| Près d'un objet | `E` | Interagir |
| Tous | `Échap` | Libérer la souris / menu local |

**Règle essentielle :** un `Espace` maintenu ne doit pas provoquer un saut puis un déploiement involontaire. Il faut un **nouvel appui après relâchement** en l'air. Les mappings restent configurables.

## Machine à états unique

- `GROUNDED` : repos, marche, course, lancement du saut.
- `AIRBORNE` : chute et vol balistique.
- `GLIDING` : membrane ouverte ; portance arcade, descente contrôlée.
- `SWIMMING_SURFACE` : nage de surface.
- `DIVING` : mouvement 3D sous l'eau.

Les transitions proviennent de **contacts géométriques**, volumes d'immersion, profondeur et commandes ; une animation ne décide jamais de l'état physique.

| Transition | Condition |
| --- | --- |
| Sol → Air | Saut sur nouvel appui ou perte de support |
| Air → Planage | Nouvel appui Espace après relâchement |
| Planage → Air | Nouvel appui Espace |
| Air/Planage → Sol | Collision d'atterrissage admissible |
| Sol/Air → Eau | Seuil d'immersion franchi |
| Nage → Plongée | Commande de descente / profondeur |
| Plongée → Nage | Retour au niveau de la surface |
| Eau → Sol/Air | Sortie valide du volume d'eau |

Appliquer des marges/hystérésis aux seuils pour empêcher une alternance de modes à chaque frame.

## Physique et réglages

**Rapier** est proposé pour collisions et contacts, avec un **pas de simulation fixe**, indépendant du framerate Three.js. Nage, flottabilité et planage utilisent des règles dédiées.

- **Sol :** accélération, vitesse marche/course, pentes, marches, glissement et saut.
- **Planage :** vitesse avant, angle d'inclinaison, portance simplifiée, perte d'altitude ; impossible de monter indéfiniment sans source de courant ascendant explicitement conçue.
- **Eau :** surface logique et volumes de profondeur, résistance, flottabilité simplifiée, contrôle vertical.
- **Oxygène :** longue durée configurable ; comme il n'y a **ni dégâts ni mort**, prévoir une remontée/assistance non punitive à zéro et en confirmer l'ergonomie.
- **Caméra :** suivi amorti, zoom et orbite souris, évitement d'obstacles, réglages contextualisés au planage/eau.

## Architecture locale (sans réseau)

1. `InputMapper` collecte le clavier/souris.
2. `MovementController` traite l'input dans une machine à états testable.
3. `PhysicsAdapter` lit collisions, pentes et volumes d'eau.
4. `CharacterView` anime le GLB d'après l'état simulé.
5. `ThirdPersonCamera` suit le personnage sans imposer sa propre physique.

**Pas de synchronisation joueur, de prédiction réseau ni de serveur en V1.** Éviter néanmoins de mélanger logique et rendu : un éventuel mode en ligne pourra réutiliser le contrôleur et les commandes.

## Tests obligatoires

1. Espace maintenu produit **un seul saut**.
2. Saut, relâchement, deuxième appui = planage, troisième appui = repli.
3. Saut/chute → eau ; eau → sol, sans oscillation.
4. Nage en surface, plongée, remontée et sortie d'eau près de berges.
5. Inclinaison du terrain, marches et obstacles.
6. Caméra ne traverse pas durablement les rochers ni ne se retrouve coincée.
7. Comportement stable à **FPS variables**, grâce au pas fixe.
8. Les modes ne dépendent pas d'une animation GLB particulière ; un proxy reste fonctionnel.
