# Vol stabilisé — auto-trim et protection de vitesse

## Objectif

Éviter qu'un planeur reste cabré et vide sa réserve de vitesse simplement parce que la caméra regarde encore vers le haut. Conserver le contrôle manuel de montée/piqué et la conservation d'énergie existante, sans poussée gratuite ni changement de caméra obligatoire.

## Contrôles actifs

- Q/D ou joystick horizontal : virage relatif à la trajectoire, inchangé.
- Clic-glissé sur la vue (souris ou geste tactile sur la vue) : regarder en haut/bas **pendant le geste** = demande temporaire de montée/piqué. L'orientation horizontale de la caméra ne change pas le cap de vol.
- Relâcher le geste : demande verticale **0**, auto-trim progressif vers la descente normale. Garder la caméra vers le haut après relâchement ne prolonge plus la montée.
- Z/W, joystick vers l'avant : ne forcent ni montée ni piqué. S/joystick vers l'arrière : aérofrein, inchangé.
- Shift/Boost : impulsion de gaz, réserve/cooldown et lift initial inchangés.

La commande `flightPitchInput?: number` est transmise dans les ticks de simulation 30 Hz : **+1** = demande de montée, **-1** = demande de piqué, **0/absent** = stabilisation. `cameraPitch` est conservé pour la nage sous-marine, mais ne pilote plus directement le planeur.

## Physique

`src/physics/motion.ts` garde le budget `E = |v|²/2 + gravité × altitude`. Les virages et la traînée retirent de l'énergie ; le boost est une impulsion payée séparément. Aucun verrouillage direct de `position.y`, aucune vitesse plancher injectée.

Paramètres initiaux de `GLIDE_TRIM` (à calibrer au ressenti) :

| Réglage | Valeur |
|---|---:|
| Angle neutre | `-atan(1/finesse)` ≈ -7,1° |
| Montée maximale assistée | +12° |
| Piqué maximal demandé | -35° |
| Début d'autorité de montée | 12 m/s |
| Autorité de montée maximale | 24 m/s |
| Début récupération basse vitesse | 10 m/s |
| Angle de récupération (avant stall) | -18,9° |
| Vitesse décrochage existante | 6 m/s |
| Vitesse maximale existante | 60 m/s |
| Vitesse d'ajustement pitch existante | 1,25 rad/s |

Les cibles sont lissées par la rotation d'assiette déjà en place. La montée admissible est continûment limitée selon la vitesse. Sous 10 m/s, le piqué de récupération peut primer même si le joueur demande à monter ; sous 6 m/s le traitement de stall existant complète la récupération.

Le boost conserve sa hausse verticale volontaire : après le pulse, l'assiette revient progressivement vers la cible commandée, ou neutre si le joueur a relâché le geste. Aucune altitude permanente n'est réservée au joueur.

## Interfaces, rendu, sauvegardes

- Calcul dans `glideVelocity`, sans allocation ni dépendance au rendu.
- `flightPitchIntent` dans `src/input/gameplay-input.ts` traduit le geste actif en commande normalisée, avec protection contre NaN.
- `src/main.ts` donne des commandes de caméra et de vol séparées : caméra toujours libre, auto-suivi du lacet conservé.
- `glidePitch` existant demeure la référence physique et visuelle du planeur en V, sans créer un deuxième état concurrent.
- La nouvelle commande optionnelle est validée dans le rejeu. Les snapshots de mouvement restent en version 1 : ils contiennent `glidePitch`, sans nouvel état persistant. Replays anciens sans champ `flightPitchInput` : auto-trim par défaut.
- Aucun changement aux sauvegardes Studio, assets ni collisions.

## Vérifications

```bash
npm run typecheck
node --experimental-strip-types --test tests/flight-controls.test.mjs tests/dynamic-motion.test.mjs tests/gameplay-input.test.mjs tests/high-speed-flight.test.mjs
npm test
npm run build
```

Tests ajoutés ou adaptés : commande verticale indépendante du yaw, caméra passive après relâchement, retour à l'auto-trim, prévention du cabrage à basse vitesse, forte montée au boost, collisions 60 m/s, contrôles tactiles inchangés, replays déterministes.

### Qualification manuelle navigateur

1. Planer à 20–30 m/s ; regarder vers le haut sans glisser : la trajectoire ne se cabre pas.
2. Cliquer-glisser vers le haut ; le planeur monte modérément ; relâcher en conservant le même angle de vue : il revient en descente neutre sans perte excessive de vitesse.
3. À faible vitesse, demander une montée : une récupération descendante se déclenche.
4. Faire un piqué, remonter, puis vérifier l'échange d'énergie sans accélération gratuite.
5. Booster près du relief et à altitude élevée ; contrôler la montée puis la stabilisation, y compris boost répété et ouverture/repli.
6. Sur mobile, vérifier que joystick avant ne pique pas, que le geste caméra n'inverse pas la direction, et que relâcher le geste stabilise.
7. Tester transitions nage/air/plané, collisions avec ponts/plafonds et courses aériennes.

Le fonctionnement est implémenté et testable sur cette branche ; la qualification ressentie/visuelle en navigateur et les seuils finaux doivent être validés séparément.
