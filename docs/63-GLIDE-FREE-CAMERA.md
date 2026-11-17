# Plané — pilotage indépendant, caméra libre et impulsion d'ouverture

Cette évolution complète [54 — Déplacements dynamiques](54-DYNAMIC-MOVEMENT.md) et [62 — Vol rapide](62-HIGH-SPEED-FLIGHT.md). Elle conserve une simulation à pas fixe de 30 Hz et n'ajoute aucun coût GPU.

## Comportement et commandes

- Au sol et en chute libre, la direction des déplacements reste relative à la caméra.
- En **plané**, Q/D (A/D) font tourner le hamster autour de sa direction physique actuelle. L'inclinaison de la caméra (clic-glisser ou glisser sur smartphone) vise l'altitude : regarder vers le haut fait cabrer, regarder vers le bas provoque le piqué. Z/W ou joystick vers le haut **ne forcent plus de piqué** ; S ou joystick vers le bas sert d'aérofrein.
- Le pilotage conserve l'inertie et les pertes énergétiques liées aux *virages réellement commandés* ; tourner la caméra ne provoque jamais de virage ni de perte d'énergie.
- Au premier déploiement, le cap vient de la vitesse horizontale réelle. Si celle-ci est trop faible, le dernier cap du joueur est utilisé, puis seulement l'orientation actuelle de la caméra comme ultime repli.
- Le pilotage est volontairement *relatif* à la trajectoire, plutôt qu'un verrouillage du planeur sur la direction de visée.

## Caméra en vol

Dans `src/render/flight-auto-camera.ts`, l'auto-suivi est **exclusivement une transformation de présentation** :

- délai de 2 s sans clic-glisser, ou 1 s quand la vitesse horizontale dépasse 18 m/s ou pendant un boost ;
- retour doux en lacet derrière la vitesse horizontale réelle ; l'inclinaison verticale choisie par l'utilisateur est préservée pour ne pas changer involontairement la trajectoire ;
- interruption immédiate pendant un glisser, remise à zéro hors plané / dans les menus ;
- option `autoCenterFlightCamera` activée par défaut, stockée dans les préférences locales de l'interface, jamais dans les sauvegardes.

La caméra pilote **uniquement l'assiette verticale** du planeur. Son orientation horizontale ne pilote pas le cap : joystick Q/D ou commandes clavier restent les seules commandes de virage. Le joystick mobile ne tourne pas directement la caméra.

## Impulsion de première ouverture

`src/physics/motion.ts` définit `GLIDE_DEPLOY` :

| Paramètre | Défaut |
|---|---:|
| Durée | 0,25 s |
| Gain de vitesse avant total | +2 m/s |
| Gain de vitesse verticale total | +0,8 m/s |
| Limite de vitesse résultante | 60 m/s |

Ce gain est réparti sur les ticks de simulation ; il suit le cap physique, et sa norme est plafonnée. Le joueur n'obtient pas un deuxième gain en fermant/réouvrant le planeur dans un même saut. La recharge ne se fait qu'après contact réel au sol, eau ou escalade, pas à chaque changement de mode air/plané. La propulsion à gaz reste indépendante : les impulsions et les évolutions de capacité, puissance et contrôle du main actuel sont conservées.

L'énergie supplémentaire au déploiement est *intentionnelle* (effet arcade limité), contrairement à la traînée et aux échanges altitude/vitesse du vol normal. Les champs `glideDeploymentUsed` et `glideDeploymentRemaining` sont capturés et validés pour les snapshots de simulation et le rejeu.

## Contrôles de validation

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run test:motion
```

Tests ajoutés : décollage latéral avec caméra à l'opposé, caméra libre pendant 30 ticks, virage commandé, différence piqué/cabré, assistance unique, réarmement après contact, plafond 60 m/s, sérialisation/rejeux et auto-suivi désactivable.

Mesures à vérifier sur matériel réel : ressenti du gain vertical, perte d'énergie aux virages, confort du recentrage rapide, orientation du joystick mobile et stabilité des collisions à 120 km/h.
