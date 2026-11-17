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

## Prochaines améliorations à qualifier visuellement

- Recalage fin du contact des pattes sur les obstacles et marches (la correction de pente heightfield est désormais en place, sans solveur IK).
- Calibration perceptuelle du dérapage en roulade et de la rotation des pieds selon l'adhérence mesurée.
- Ajustement des fenêtres d'assistance `MV-03` après essais à 20/30 FPS, avec contrôle de l'ouverture du planeur.
- Réception avec glissade/micro-rebond sans gain d'énergie ni blocage de commande.
- Aperçu Studio de chaque animation, outils de calibration et régénération complète des clips GLB.
- Tests GPU intégré et vues avec plusieurs personnages à 30/20 FPS.

**Limite :** le rendu artistique, le contact précis des pattes, les performances GPU et le ressenti à la manette/clavier/souris nécessitent une qualification en navigateur et sur matériel de référence; les tests Node ne suffisent pas.
