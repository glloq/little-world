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

## Prochaines améliorations à qualifier visuellement

- Recalage fin du contact des pattes en sol irrégulier (pas de solveur IK généralisé avant benchmark).
- Correction du dérapage en roulade avec un cue d'adhérence mesuré par la simulation.
- Coyote time et jump buffer `MV-03` à intégrer en cohérence avec le double appui Espace du plané.
- Réception avec glissade/micro-rebond sans gain d'énergie ni blocage de commande.
- Aperçu Studio de chaque animation, outils de calibration et régénération complète des clips GLB.
- Tests GPU intégré et vues avec plusieurs personnages à 30/20 FPS.

**Limite :** le rendu artistique, le contact précis des pattes, les performances GPU et le ressenti à la manette/clavier/souris nécessitent une qualification en navigateur et sur matériel de référence; les tests Node ne suffisent pas.
