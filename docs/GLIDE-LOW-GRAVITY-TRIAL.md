# Essai — gravité de vol plané réduite

## Objet

Rendre le vol du hamster moins pénalisant en montée et plus agréable en exploration, sans modifier le saut, la chute libre, la roulade ni les autres modes de déplacement.

## Paramètres

- `MOTION.gravity = 17.2` m/s² : inchangé, utilisé hors plané.
- `GLIDE_PHYSICS.gravity = 9.0` m/s² : employé uniquement dans le noyau `glideVelocity`.
- Finesse, vitesse de décrochage, vitesse maximale et commande auto-trim : inchangées.
- La traînée induite dépend de la gravité effective de plané.
- Le diagnostic d'énergie `movementEnergy` accepte une gravité explicite pour les tests du vol plané ; son paramètre par défaut reste la gravité normale.

## Vérifications

```sh
node --experimental-strip-types --test tests/dynamic-motion.test.mjs tests/flight-controls.test.mjs tests/high-speed-flight.test.mjs
npm run typecheck
npm test
npm run build
```

## Campagne de ressenti

1. Comparer les vitesses initiales de 12, 20 et 30 m/s en vol neutre, mesurer la descente sur 10 s.
2. Tester les commandes cabré / piqué et contrôler que le planeur ralentit en montant sans gain énergétique gratuit.
3. Vérifier la récupération du décrochage sous 6 m/s.
4. Enchaîner boost, virage, fermeture / redéploiement et atterrissage.
5. Valider que les sauts, chutes et collisions ne changent pas.
6. Qualifier le comportement navigateur PC et mobile avant fusion.

Ce réglage est expérimental : le piqué accélère lui aussi moins vite, puisque l'échange énergie cinétique / altitude utilise une gravité inférieure. Ajuster `diveEfficiency` seulement si les essais montrent un défaut réel : une valeur supérieure à 1 créerait de l'énergie artificiellement.
