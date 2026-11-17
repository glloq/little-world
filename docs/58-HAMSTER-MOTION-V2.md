# 58 — Hamster Motion V2 : réactivité, animations et compatibilité multi future

**Base de développement :** `feat/hamster-motion-v2` depuis `main`.
**Nature :** implémentation expérimentale + tests automatisés, non fusionnée, sans qualification GPU intégrée.
**Documents associés :** [43 — Hamster](43-HAMSTER-JOUEUR.md), [54 — Mouvement dynamique](54-DYNAMIC-MOVEMENT.md), [56 — Gameplay roadmap](56-AUDIT-GAMEPLAY-SOLO-MULTI-ROADMAP.md), [16 — Futur multi](16-FUTURE-MULTIPLAYER.md).

## Objectif et règles

Rendre la locomotion du hamster lisible et immédiatement réactive : marche bipède, accélération debout, virage sur place/en déplacement, compression en boule, roulade inertielle, saut depuis le sol ou la boule, réception après chute/plané. **Les animations ne commandent jamais les vitesses, contacts ou récompenses** : l'autorité reste `simulatePlayer` à 30 Hz.

Conserver la géométrie/les 22 os, le rig procédural partagé, le draw call du corps, le contrat de présentation sans code réseau et les actions outils existantes. Pas de moteur physique, pas de nouvelles dépendances et pas de root motion.

## Changements de code

| Module | Livrable |
| --- | --- |
| `src/player.ts` | `autoRun` facultatif, `runCharge`, direction souhaitée, origine du saut, séquences de saut/impact, vitesse à l'atterrissage. Contrôle `run` historique inchangé si `autoRun` absent. |
| `src/main.ts` | `autoRun:true` dans le chemin joueur : progression vers la course sans consommer Shift, qui reste la commande roulade. |
| `src/physics/movement-state.ts` | Sauvegarde/rejeu des nouveaux champs de contrôle (strictement validés), sans changement de version des checkpoints. |
| `src/hamster/hamster-animation.ts` | Phase de foulée calculée depuis la distance, oscillation bipède + pieds compensés, anticipation du virage, `ROLL_AIR` et `ROLL_LAND`, sauts typés, réceptions dépendantes de la vitesse. |
| `src/hamster/hamster.ts` | Cues physiques, rotation des pieds, distance horizontale réelle, cap souhaité, extraction phases locales pour le mode distant. |
| `src/hamster/presentation-state.ts` | Extension **optionnelle** de V1 : `stridePhase`, `rollPhase`, `turnIntent`, `jumpKind`, `landingSpeed`. États V1 antérieurs restent lisibles. Les phases continues sont interpolées. |
| `tools/generate-hamster.mjs` | Clips de référence Blender supplémentaires : virages, sauts immobile/course/boule, entrée/sortie, réception douce/forte et reprise de roulade. |
| `tests/hamster-motion-v2.test.mjs` | Marche/course contrôlées, Shift, replays, réception, rotation aérienne, phase au sol, extension distante validée. |

## Commandes

- **ZQSD / WASD** : vitesse debout augmente progressivement pendant une avance soutenue (environ 1,15 s avant charge maximale). Les petits déplacements restent proches du comportement initial.
- **Shift + déplacement** : entrée/sortie de roulade. `X` continue à basculer ce mode.
- **Espace** : saut, avec origine `idle`, `run` ou `roll`; deuxième pression en vol pour ouvrir/fermer les membranes comme avant.
- **Souris** : caméra, orientation du plané; aucune nouvelle commande obligatoire.

L'option `autoRun` est volontairement facultative : anciennes commandes, scripts, replays sans elle préservent le comportement marche/course antérieur.

## Invariants de synchronisation

1. La physique et les collisions restent indépendantes du rendu à 20/30/60 FPS.
2. Les événements `jumpSeq` / `landingSeq` se produisent dans la simulation; l'animation ne crée aucun nouvel événement de gameplay.
3. Les personnages distants ne reçoivent **aucun os** : l'extension de l'état de présentation fournit seulement des indicateurs et phases numériques, et demeure optionnelle pour les anciens enregistrements.
4. Les phases sont intégrées localement depuis la distance parcourue; si un snapshot distant inclut la phase, il sert de référence et évite de reconstruire `temps × vitesse actuelle`.
5. La rotation visuelle en roulade reste proportionnelle à la distance horizontale, y compris en saut; le retour sur les pattes est interpolé.
6. Le futur multi exige toujours des snapshots horodatés / un traitement des changements de mode. Aucune synchronisation réseau n'est implémentée ici.

## Validation

Commandes :

```bash
npm test
npm run typecheck
npm run assets:hamster
npm run check:impostors
npm run build
```

Il faut régénérer **le GLB et l'atlas d'imposteurs des personnages** après modification de l'animateur, faute de quoi les vérifications de cohérence des assets échouent.

Scénarios de recette visuelle : 1) départ bref et course continue, 2) virage sur place et à vitesse élevée, 3) entrée en boule / demi-tour, 4) sortie et reprise de course, 5) saut arrêté, 6) saut lancé, 7) saut en boule avec rotation continue, 8) réception après plané, 9) réception sur pente, 10) joueur distant reconstruit à 10 Hz et rendu à 20/30 FPS.


## Lot V2.1 — tolérance de saut, terrain et dérapage

**Implémenté en branche, à valider visuellement sur le matériel cible.**

- **MV-03 — Coyote time** : `Controls.jumpAssist` est facultatif; avec l'option activée dans le jeu, un appui dans les 100 ms suivant la perte d'un support reste un saut moteur. L'origine `ground/run/roll` est conservée. Hors de cette fenêtre, Espace garde sa sémantique de déploiement du planeur.
- **MV-03 — Jump buffer** : une pression dans les 130 ms avant l'atterrissage, seulement quand le joueur descend suffisamment près du sol, est mémorisée et consommée une fois au contact. L'ouverture du planeur n'est pas déclenchée par cette pression. Les appuis plus haut en l'air continuent à déployer/replier le planeur. Les états eau, escalade et téléportation ne réutilisent pas un ancien appui.
- **Accélération debout** : `runCharge` est conservée si le joueur maintient sa direction en l'air; elle n'augmente pas pendant le vol. Cela évite de retrouver artificiellement la vitesse de marche après un saut lancé.
- **MV-06 — Dérapage en roulade** : `rollSlip` est calculé à partir de l'erreur directionnelle restante, de la vitesse et du facteur d'adhérence de la surface. La simulation reste autoritaire pour le cap, la friction et la vitesse; le skid n'agit **que** sur l'assiette et la rotation visuelle.
- **Contact des pieds sur pente** : `groundPitch`/`groundRoll` sont évalués à partir de quatre échantillons du heightfield en contact proche. La correction demeure faible (rotation des chevilles et décalage vertical de chaque pied), désactivée sur les structures surélevées, les espaces souterrains, dans l'eau et en vol. **Pas d'IK complète** ni de nouveau bone.
- **Compatibilité V1** : `jumpAssist` et les champs de présentation `rollSlip`, `groundPitch`, `groundRoll` sont optionnels. Les timers de saut, le mode d'origine et les cues physiques sont inclus dans les snapshots de replay et validés. Aucun réseau serveur n'est ajouté.

### Invariants supplémentaires

1. Aucun saut supplémentaire autorisé après expiration des timers : 100 ms / 130 ms sont des fenêtres maximales, non des impulsions réitérées.
2. Le saut anticipé est incompatible avec une réception dans l'eau; pas de saut gratuit à la sortie du plané ou dans une galerie sans support.
3. Aucune requête géométrique supplémentaire par animation de PNJ distant : le réglage de pose consomme seulement des nombres déjà calculés ou reçus.
4. Sur les ponts et autres surfaces 3D, l'orientation du terrain visible en dessous ne doit pas pencher les chevilles du hamster.
5. Test manuel nécessaire sur une piste de descente avec surfaces herbe/roche/sable/boue : valeurs `rollSlip` à affiner selon le ressenti.

### Prochain lot recommandé

- Stabilisation fine de l'appui des pieds, éventuellement un mini-solveur à deux points **seulement pour le héros proche**, sous garde-fous GPU/CPU.
- Modes de réception contextualisés : récupération de roulade sur les pentes, glissade à l'impact, éventuel micro-rebond purement visuel sans création d'énergie.
- Outil de prévisualisation et de réglage des transitions dans le Studio, avec export GLB déterministe et mesures sur PC intégré.

## Lot V2.2 — récupération de saut, support 3D et outil de calibration

**Sur la branche `feat/hamster-motion-v2`, sans fusion dans `main`.**

- **Réceptions contextuelles** : la simulation produit `landingKind` (`idle`, `run`, `roll`, `glide`) et `landingSlide` borné [0, 1], dérivés de la vitesse horizontale, de l'impact et du matériau. Ces valeurs **n'appliquent ni poussée ni freinage** et ne modifient pas l'autorité du joueur.
- **Reprise après saut en boule** : l'animateur passe par `ROLL_LAND` lorsque la réception fait suite à une roulade. La compression, la glissade et le retour progressif des pattes sont visuels ; `LAND` conserve un comportement distinct pour la course et le plané.
- **Amorti visuel** : petit rebond limité au corps, sans impulsion verticale et sans déplacement de la capsule.
- **Contact sur une marche/plateforme** : en complément de `groundPitch` et `groundRoll` sur le heightfield, seulement si le joueur repose sur un obstacle 3D surélevé, deux sondes étroites sous les pieds calculent `footSupportLeft` / `footSupportRight`. Chaque pied peut descendre indépendamment. Les requêtes sont évitées sur un sol normal, dans l'eau et en l'air ; pas de solveur IK général.
- **États distants / replays** : les quatre nouveaux paramètres restent optionnels et validés, avec interpolation des valeurs continues. Aucun os ni calcul de collision distant n'est transmis. Compatibilité de présentation V1 conservée.
- **Studio — Animations du hamster** : nouveau module `Logique > Animations du hamster`, chargé uniquement à l'ouverture. Douze scènes de pose/transitions (repos, marche, course, demi-tour, roulade, dérapage, saut en boule, saut en course, plané, réception, pente, marche), réglages vitesse/impact/pente/dérapage, pause/reprise, caméra rotative à la souris. Le module utilise le rig procédural existant ; il n'écrit **aucun** document ni monde. Renderer WebGL limité en cadence, résolution et mémoire, détruit à la fermeture.

### Vérifications V2.2

- `npm test` inclut les tests unitaires de récupération après roulade, réception du plané, influence du matériau sans freinage physique, support différencié des pieds, réutilisation des snapshots V1 et validation des cues.
- `node tools/test-hamster-motion-lab-browser.mjs` parcourt le Studio et vérifie plusieurs presets, les contrôles, l'absence de mutations du projet et la fermeture du canvas.
- `npm run assets:hamster` puis `IMPOSTOR_GROUP=characters npm run generate:impostors` régénèrent le GLB et l'atlas pour conserver la correspondance avec l'animateur.
- **Qualification visuelle restant à faire :** pieds sur marches irrégulières, cadence réelle sur GPU intégré, récupération sur sols fortement inclinés et transitions à 20 FPS.

**Limite volontaire :** il s'agit d'un aperçu d'animation du hamster, pas encore d'un éditeur de keyframes ni d'un solveur IK sur les collisions complètes.

## Lot V2.3 — transitions rapides, snapshots distants et banc de rendu

**Implémenté sur la branche de fonctionnalité ; aucune synchronisation réseau ajoutée.**

- **Roulade → saut → plané → chute** : le passage en mode `glide` libère explicitement l'état de boule aérienne, évitant qu'un ancien `ROLL_AIR` revienne après la fermeture des membranes. Test unitaire sur la séquence complète.
- **Intervalles distants 10/20 FPS** : les snapshots de présentation V1 peuvent désormais inclure `jumpSeq` et `landingSeq`, des compteurs de la simulation strictement validés et non interpolés. Ils permettent au rig distant de récupérer un saut ou une réception dont les images intermédiaires ont été perdues. Les effets d'animation restent purement visuels, sans événement d'autorité et sans retransmission des os ; les anciens snapshots restent acceptés.
- **Lab Studio 30 Hz fixe / rendu 20 ou 30 FPS** : un ordonnanceur pur `motion-lab-clock.ts` maintient la même progression de simulation même si les draw calls sont espacés, avec backlog plafonné pour l'onglet suspendu. Le laboratoire n'ajoute aucun appel de simulation à la boucle de jeu.
- **Inspection précise** : timeline de 0 à 3,20 s, saut vers un instant de la séquence avec reconstruction déterministe depuis son origine, pause/reprise et avancement d'un pas `1/30 s`. Une séquence `ROLL_AIR` puis `ROLL_LAND` peut être inspectée à une image près.
- **Instrumentation légère** : `renderer.info.render.calls`, triangles et temps CPU de `renderer.render` moyenné sur 60 images ; dimensions et `devicePixelRatio` bornés. Ces chiffres **ne mesurent pas la durée GPU** ni les FPS réels sur une puce intégrée.
- **Tests** : invariant 30 ticks/s sous entrées 20/30/60 FPS, récupération des événements distants sans répétition, retour du plané, budget visuel et navigation/fermeture du laboratoire.

Commandes ciblées :

```bash
npm test
npm run build
npm run assets:hamster
npm run check:impostors
node tools/test-hamster-motion-lab-browser.mjs # après démarrage de la preview compilée
```

**Qualification encore nécessaire :** exécuter le navigateur sur l'ordinateur avec GPU intégré cible. Les résultats GitHub Actions Chromium/SwiftShader ne sont pas représentatifs d'une mesure GPU matérielle. Vérifier les interactions clavier/souris, la silhouette à distance et les transitions en mouvement sur relief très irrégulier.

## Prochaines améliorations à qualifier visuellement

- Recalage fin du contact des pattes sur les obstacles et marches (la correction de pente heightfield est désormais en place, sans solveur IK).
- Calibration perceptuelle du dérapage en roulade et de la rotation des pieds selon l'adhérence mesurée.
- Ajustement des fenêtres d'assistance `MV-03` après essais à 20/30 FPS, avec contrôle de l'ouverture du planeur.
- Réception avec glissade/micro-rebond sans gain d'énergie ni blocage de commande.
- Aperçu Studio de chaque animation, outils de calibration et régénération complète des clips GLB.
- Tests GPU intégré et vues avec plusieurs personnages à 30/20 FPS.

**Limite :** le rendu artistique, le contact précis des pattes, les performances GPU et le ressenti à la manette/clavier/souris nécessitent une qualification en navigateur et sur matériel de référence; les tests Node ne suffisent pas.
