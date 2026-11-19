# Satiété et recharge automatique des boosts (V1)

## Contrat de gameplay

- Le hamster possède **10 charges de boost maximum**, utilisables même lorsque sa satiété est nulle.
- Une charge revient automatiquement à la fois, sans action du joueur ; la progression partielle est conservée entre deux recharges.
- La satiété commence à **100**, diminue de **2,5 points/minute de simulation active** (100 → 0 en 40 min) et n'est jamais négative.
- Satiété à **0** : arrêt de la recharge, sans retirer les charges disponibles.
- Manger augmente uniquement la satiété, pas le nombre de charges. Les objets comestibles restent définis par la liste blanche `src/gameplay/food-effects.ts` ; les champignons inconnus ne sont pas comestibles.
- La barre de satiété et son libellé sont toujours visibles. Le nombre de boosts est visible **8 secondes après utilisation**, **2,5 secondes après une recharge**, et masqué sinon.

## Calibration

| Satiété | Temps d'une charge |
| --- | ---: |
| 80–100 | 2,5 s |
| 50 | 4 s |
| 25 | 6 s |
| 1 | ~9,84 s |
| 0 | arrêt |

Interpolation continue entre les points. À 100 %, les dix charges reviennent en 25 s. La satiété diminue pendant la recharge, mais ce rythme est assez faible pour ne pas modifier les dix premières charges d'une réserve initialement vide.

## Architecture

- `stepBoostVitals(player,dt)` : calcul déterministe et borné, appelé par le mouvement du personnage et pendant le trajet en bateau/remontée mécanique.
- `gasBoostStep` : conserve le comportement physique, la cadence d'impulsion et les événements audio/visuels existants.
- `eatForSatiety` : permet au sac V3 d'agir sur la satiété, sans créer de boost immédiatement.
- `game-ui.ts` : affichage à 4 Hz ; aucune temporisation dédiée par segment.

## Validation avant fusion

- Vérifier les tests `npm test` et `npm run build` via la CI.
- Tester la commande boost en vol et sous l'eau, la consommation unitaire/multiple dans le sac et les états du HUD.
- Vérifier la migration des anciennes sauvegardes et le comportement de satiété au changement d'île. La persistance spécifique de satiété n'est **pas encore ajoutée** au schéma de sauvegarde historique : limitation V1 à résoudre avant validation finale.
- Garder la PR en brouillon jusqu'à la qualification navigateur.
