# 80 — Planeur en V déployé depuis le sac à dos

Statut : **implémenté sur la branche `feat/backpack-v-glider`**, qualification CI/essais visuels à confirmer. **Pas de modification du modèle physique** et aucun achat nécessaire.

## Objectifs retenus

- À l'état rangé, le planeur est **totalement invisible** : aucune armature pliée ne dépasse du sac. Seul le sac à dos lui-même peut être affiché suivant les accessoires du joueur.
- L'ouverture révèle successivement le mât puis les deux ailes de toile en V. La fermeture retourne à l'état entièrement caché.
- Les deux ailes ne font plus partie de l'anatomie du hamster **dans le jeu** : les membranes du rig historique sont systématiquement masquées pendant le rendu joueur.
- Le hamstér conserve son animation de planage, ses contrôles et ses capacités de vol, et le planeur est purement visuel.
- Le sac est affiché automatiquement tant que le planeur est déployé, même si l'accessoire optionnel « sac à dos » est normalement désactivé.
- Le modèle classique est fourni **gratuitement et systématiquement**. Toute future variation de couleur ou de mesh ne doit pas modifier la physique, l'inventaire nécessaire au vol, les commandes ou la disponibilité du planeur.

## Fichiers et contrats

- `src/hamster/backpack-glider.ts` : géométrie des 2 ailes, mât, charnière, interpolation visuelle. Géométries et matériau partagés, pas de tissu simulé ni allocation par frame.
- `src/hamster/hamster.ts` : point d'attache `sockets.back`, visibilité du sac, masquage des membranes corporelles, mise à jour du planeur en local et pour les états de présentation distants.
- `src/player.ts` : `glideBrake` indique visuellement le freinage demandé (ne crée aucune force nouvelle).
- `src/hamster/presentation-state.ts` : extensions **optionnelles** `glideStalled`, `glideBrake`, `glidePitch`, `glideTurnRate`. Les paquets V1 sans ces champs restent acceptés.
- `tests/hamster-glider.test.mjs` : transitions, visibilité, décrochage, virage, boost, freinage et paquets distants.
- `tools/generate-hamster.mjs` : pour préserver le fichier GLB historique exigé par la CI, l'exporteur conserve provisoirement l'ancien modèle de référence. Le jeu utilise le nouveau planeur et n'affiche pas les membranes anciennes ; **le GLB du dépôt n'est pas encore un export combiné fidèle de ce nouveau design**.

## Machine d'animation

Un seul paramètre `deployment` continu, dans `[0,1]` :

| Mode | Évolution |
| --- | --- |
| `STOWED` | `deployment=0`, groupe masqué |
| `OPENING` | `0 → 1`, durée cible 0,38 s ; mât qui monte et bras qui s'écartent |
| `OPEN` | `deployment=1` ; les ailes restent ouvertes |
| `CLOSING` | `1 → 0`, durée cible 0,26 s ; interpolation entièrement réversible |

Couches visuelles indépendantes :
- **Décrochage** : déformation et battement asymétriques, retour amorti en 0,16 s, piloté par `Player.stalled`.
- **Virage** : roulis du groupe d'ailes et léger flex des longerons depuis `glideTurnRate`.
- **Boost** : secousse du support à chaque nouvelle `gasPulseSeq`, enveloppe de 0,24 s, plus petite tension continue pendant la poussée.
- **Freinage** : fermeture partielle des ailes (sans fermer le planeur) proportionnelle à `glideBrake`, transition 0,12 s.
- **Piqué / cabré / grande vitesse** : léger changement d'assiette et vibration bornée ; aucune force physique, collision supplémentaire, ombre projetée ni particule.

Les couches ne s'excluent pas : un virage peut se produire pendant le boost ou le freinage. L'arrivée au sol, l'entrée dans l'eau et le changement de mode déclenchent la fermeture.

## Validation

1. `npm test` (dont `tests/hamster-glider.test.mjs`).
2. `npm run typecheck`, `npm run assets:hamster`, vérification d'absence de changement du fichier historique `public/models/hamster.glb`.
3. `npm run build` et test navigateur hamster / contrôle mobile.
4. Tests manuels : saut → ouverture ; fermeture avant ouverture complète ; freinage + virage ; décrochage puis récupération ; boost en piqué ; atterrissage violent ; entrée dans l'eau ; roulade puis saut ; état du sac avec accessoire personnalisé.
5. Mesurer FPS et nombre de meshes visibles sur GPU intégré. Les 4 nouveaux meshes ne doivent être **visibles que pendant le déploiement, le planage ou le repli**.

## Suite non bloquante

- Définir les skins du planeur comme des présentations interchangeables, identifiant `classic` toujours valide et repli automatique vers `classic` pour un identifiant inconnu.
- Les débloquages/achats ne doivent jamais empêcher de décoller ni de charger une sauvegarde.
- Lors de la refonte ultérieure de l'export GLB, éliminer aussi physiquement les anciennes membranes du **fichier de référence** et produire un nouvel export et ses tests ; ne pas interrompre le fonctionnement du modèle procédural pendant la transition.
