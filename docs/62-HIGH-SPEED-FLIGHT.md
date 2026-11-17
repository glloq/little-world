# Vol rapide 120 km/h — campagne LOW-RESOURCES

Branche: `feat/high-speed-flight-boost` (aucune fusion dans `main`). Cette campagne étend [54 — Déplacements dynamiques](54-DYNAMIC-MOVEMENT.md) et respecte [22 — Budget ressources](22-RESOURCE-BUDGET-MANAGER.md).

## Contrat physique

- `GLIDE.max = 34 m/s` soit 122,4 km/h, plafond *réel*, non multiplicateur graphique.
- Boost progressif vers `GAS.acceleration = 10 m/s²` (rampe temporelle de 0,16 s). Consommation conservée à 16 unités/s, réserve initiale 75/100 et réapprovisionnement alimentaire existant.
- Inertie: la relâche du boost coupe la poussée, sans écraser la vitesse du joueur. Le piqué transforme l'altitude en mouvement; le cabré dépense l'énergie cinétique; les virages et la traînée dissipent l'énergie.
- Traînée = terme fixe + terme induit (dominant à basse vitesse) + terme quadratique (dominant à haute vitesse). Plafond conservé et rayon de virage progressivement augmenté au-delà de 15 m/s.
- Les mêmes commandes et l'état de rampe `gasThrust` sont inclus dans les checkpoints/rejeux déterministes; aucun changement aux sauvegardes de jeu ni au schéma réseau actuel.
- Simulation fixe à 30 Hz indépendante de la présentation 30 ou 20 FPS. Pas de poussée cachée lors du déploiement ni à l'atterrissage.

## Caméra et effets cosmétiques

`src/render/speed-effects.ts` sépare les états graphiques de `src/physics` :
- FOV interpolé de 66° vers 76–77° sous forte accélération, recul maximum de 3,6 m et inclinaison de caméra limitée à 0,075 rad en virage;
- 12 petites traînées de vent maximum, un `InstancedMesh`, pas de création par frame ni post-traitement;
- effets désactivables avec la préférence `speedEffects` ou `reduceMotion`, sans modifier vitesse, forces ou consommation;
- particules de propulsion existantes réutilisées sans nouvelle texture.

## Streaming et collisions à grande vitesse

- Le planificateur `planView` étend l'anticipation de 2 s jusqu'à 4 s selon la vitesse horizontale, et limite le décalage à la moitié de la distance de vue configurée.
- Le cache borné, les LOD, l'anneau de sécurité et les workers de géographie déjà disponibles restent la seule source de chargement; pas de génération à chaque frame.
- `world.update` accepte en option la vitesse physique autoritaire du joueur plutôt qu'une estimation à partir des frames rendues.
- Le balayage XYZ conserve les segments de 0,2 m mais évite leur sous-découpage répété dans `move` lorsqu'un pas a déjà été borné; la subdivision complète reste active en cas de blocage.
- Les tests doivent couvrir les murs minces, les plateformes fines, les arches et l'atterrissage rapide. Une refonte swept capsule/AABB reste conditionnée au profilage, non incluse.

## Qualification

Exécuter:

```sh
npm ci
npm test
npm run typecheck
npm run build
npm run bench:physics
npm run benchmark:route
npm run test:motion
```

Selon le paquet, les benchmarks navigateur nécessitent serveur Vite, Chromium et un environnement compatible (voir les scripts du dépôt). Les benchmarks de rendu sur SwiftShader sont utiles pour les régressions seulement : le gate 30/20 FPS exige de tester sur GPU intégré réel.

Scénarios représentatifs: départ sur pente et falaise, piqué, maintien du boost jusqu'au plafond, relâchement du boost, virage serré, cabré/décrochage, réception sur sol/plateforme, forêt dense, traversée rapide et retour. Relever `velocity`, `movement`, `flight`, `camera.fov`, `chunks.pending`, `terrainWork`, frames p50/p95/p99, longues frames et trous de terrain.

**Critères:** 120 km/h atteignables sans téléportation; vitesse stable indépendamment du rendu; impulsions de boost bornées par la réserve; aucune traversée de collider; files de streaming bornées; effets de vitesse désactivables; aucun coût GPU lourd ajouté. Les FPS et résultats de matériel cible restent à mesurer.
