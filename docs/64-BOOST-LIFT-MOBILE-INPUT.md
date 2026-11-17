# Boost vertical, double saut et contrôle tactile

## Décisions de gameplay

Le moteur reste déterministe à 30 Hz et conserve le système de propulsion par **impulsions consommant du gaz**. Une impulsion dispose dorénavant d'une composante **ascendante**, pour éviter que le boost ne propulse le hamster vers le sol en plané.

| Action | Comportement |
|---|---|
| Boost en plané | Nouvelle impulsion : vitesse verticale relevée à au moins **5,5 m/s**, puis poussée normale en conservant la direction et l'énergie du vol |
| Boost en chute libre | **Double saut** : une impulsion alimentée en gaz, relance verticale à au moins **6,2 m/s** et poussée verticale sur le reste du pulse |
| Boost immobile au sol | Maintien 0,35 s : décollage vertical à **7,5 m/s**, consommation d'une impulsion ; ouverture du planeur avec Saut ensuite |
| Boost en course au sol | Contrôle d'accélération et roulade, **pas de décollage involontaire** |
| Boost en eau / escalade | Aucune propulsion aérienne |
| Boost en plané après double saut | Impulsions normales possibles tant qu'il reste du gaz, avec le cooldown existant |

Le double saut en mode `air` est limité à **une activation par décollage**. Le déploiement du planeur ne recharge pas cette activation. L'atterrissage ou la reprise d'appui réelle la réarme. Les upgrades, les réserves, les coûts, la recharge et le cooldown du système actuel restent inchangés.

### Paramètres physiques

Les réglages sont regroupés dans `BOOST_LIFT` (`src/player.ts`) et peuvent être ajustés après tests joueurs. La hausse de vitesse verticale constitue une dépense d'énergie arcade **explicite** au moment du nouveau pulse ; elle ne crée pas de nouvelle impulsion lorsque le même pulse se poursuit. Aucune nouvelle passe GPU, géométrie ou animation de rendu lourde.

Le timer de maintien immobile (`groundBoostCharge`) et le garde-fou de double saut (`airBoostUsed`) sont enregistrés / validés par `captureMovement` et `restoreMovement` pour les futurs rejeux multijoueurs.

## Commandes tactiles

Conserver **deux boutons permanents**, Saut et Accélérer/Boost :

- Joystick **droite** = même sens que la touche **D**, en terrestre et en vol. L'axe n'est plus négativé une deuxième fois.
- Un **appui court (≤ 250 ms)** sur Accélérer, à terre ou en boule, active/désactive la boule. Aucun double-tap exigé.
- Maintenir Accélérer **en mouvement** maintient la roulade et la vitesse ; une courte pression peut la verrouiller. Une boule verrouillée reste active même immobile, jusqu'à nouvelle pression.
- Maintenir Accélérer **immobile** au moins 0,35 s déclenche le décollage au gaz ; relâcher avant ne coûte aucun gaz.
- En l'air, le même bouton devient **Boost** et fonctionne avant même l'ouverture du planeur.
- Après décollage, **Saut** ouvre le planeur ; la pression suivante le replie.

Le bouton contextuel **Agir** n'apparaît que lorsqu'une interaction existe, et aucun bouton supplémentaire n'est ajouté.

## Contrats et vérification

- `npm test` : comportement de l'air, de la portance, anti-spam, réglages et snapshots/replays.
- `npm run build` : vérification du compilateur + bundling.
- Tests navigateur du HUD mobile : signe horizontal, roulade en un tap, disponibilité du Boost en chute libre.
- Tests exploratoires : impulsion très proche du sol, pente forte, plafond / passage sous un pont, continuité de propulsion lors de l'ouverture du planeur, déploiement à faible vitesse, collision à 60 m/s.

La nouvelle logique n'est active que pendant une simulation de jeu et n'altère pas les sauvegardes du monde ni les données du Studio.
