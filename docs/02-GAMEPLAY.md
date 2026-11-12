# 02 — Personnage, déplacements et contrôles

**Statut : comportements validés, valeurs physiques à calibrer. V1 solo / client local uniquement.**

## Personnage

- **Écureuil volant stylisé à proportions chibi**, selon la planche de référence fournie : tête ronde, yeux très expressifs, grandes oreilles, ventre beige et queue facettée. La posture visuelle est davantage bipède au repos ; le contrôleur physique reste identique.
- Membrane entre membres, **animation de déploiement**, sans simulation de tissu coûteuse.
- Le **modèle procédural original est implémenté** dans `src/squirrel.ts` ; squelette/animations glTF/GLB restent à réaliser pour la version finale.

## Contrôles (proposition à tester)

| Contexte | Entrée | Action |
| --- | --- | --- |
| Tous | **Clic gauche maintenu et glissement souris** sur le canvas 3D | Rotation orbitale ; pas de rotation au simple mouvement de souris |
| Sol/eau | `ZQSD` ou `WASD` | Se déplacer par rapport à la caméra |
| Sol | `Shift` maintenu | Courir |
| Tous | **`A` maintenu** | Menu accessoires / émotions (cliquable pendant le maintien) |
| Tous | `A` relâché | Fermer le menu sans perdre l'apparence choisie |
| Sol | `Espace` (front d'appui) | Saut simple |
| Air | `Espace` après relâchement | Déployer / replier la membrane |
| Nage/plongée | `Espace` maintenu | Remonter |
| Nage/plongée | `Ctrl` maintenu | Descendre |
| Près d'un objet | `E` | Interagir |
| Tous | `Échap` | Libérer la souris / menu local |

**Menu A :** la touche est identifiée par `KeyboardEvent.key === 'a'` pour fonctionner en AZERTY/QWERTY. Sur QWERTY, la touche A est **réservée à ce menu** et ne sert plus à straffer : utiliser Q ou flèche gauche. Les déplacements sont ignorés tant que le menu est affiché, et l'apparence choisie est enregistrée localement. Le menu doit rester accessible pendant un clic sur ses options.

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
- **Caméra :** suivi amorti, zoom et **orbite uniquement au clic-glissé** ; éviter toute capture permanente du pointeur. Évitement d'obstacles et réglages contextualisés au planage/eau restent à perfectionner.

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
9. Sans bouton de souris enfoncé : aucun changement de lacet/inclinaison de caméra ; clic-glissé actif : rotation autorisée.
10. Maintenir A → menu visible ; cliquer options → changement immédiat ; relâcher A → fermeture ; reload → préférences conservées.
11. Hors planage la membrane est invisible, quelles que soient les émotions et accessoires choisis.

## Cible de gameplay final et comportements des personnages

**Ce qui précède décrit surtout le prototype du joueur**. Le jeu final comprend **de nombreuses petites choses facultatives à faire** : courtes missions, collecte/pêche simples, énigmes, rencontres et interactions persistantes, sans RPG lourd, mort ou combat.

- Personnages non humains : **PNJ animaux et créatures**. Réutiliser le modèle de personnage du joueur (morphologie, rig, animations, vêtements et émotions) pour les espèces compatibles, et choisir un autre rig pour les espèces qui ne le sont pas.
- Navigation PNJ **libre et robuste** (zones autorisées, obstacle, portes/ponts et planification à travers plusieurs secteurs), mais activités/réactions **simples et peu coûteuses** (repos, déplacement, travail, dialogue, salut, fuite).
- Dialogues à choix, émissions de texte/sons stylisés, réactions à l'approche du joueur et aux états des objets.
- Inventaire léger, quelques actions qui persistent, **plusieurs slots de sauvegarde locale** du jeu, distincts des projets auteur.
- Les systèmes interactifs sont **déclaratifs**, configurés dans des éditeurs spécialisés du Studio, sans script propre à chaque objet.

La géographie est **une carte continue jusqu'à 10 × 10 km maximum**, sans garantie de peuplement intégral ou de FPS avant benchmark. Le Studio comporte plusieurs éditeurs spécialisés et partage les données et IDs du jeu. Les choix complets sont dans [12 — Périmètre](12-PROJECT-SCOPE.md) et [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md).

**État :** ces systèmes PNJ, activités, sauvegardes et Studio multi-éditeurs sont des objectifs confirmés et **pas encore livrés**.
