# Déplacements dynamiques : roulade et planeur

> Extension expérimentale : [62 — Vol rapide, boost et streaming](62-HIGH-SPEED-FLIGHT.md). Cette extension conserve la simulation à 30 Hz mais remplace certains réglages de traînée et d'effets de caméra décrits ci-dessous.

Implémentation sur `feat/dynamic-movement`, sans fusion ni publication dans `main`.
Le contrôleur du jeu utilise ces règles dans **tous les mondes**, y compris les tests
lancés depuis le Studio. Aucun moteur physique, serveur ou paquet supplémentaire.

## Audit et choix retenus

| Base existante | Changement |
| --- | --- |
| `simulatePlayer`, position et vitesse `Vector3`, modes sol/air/roulade/planeur/nage/escalade | Même point d'entrée et même état ; noyaux numériques extraits dans `physics/motion.ts` |
| `FrameClock`, simulation 30 Hz et présentation 30/20 FPS | Conservés ; la fréquence de rendu ne pilote jamais la physique |
| Planeur à cible 10,4 m/s et descente plafonnée | Vitesse issue de l'énergie et orientation progressive selon l'intention caméra |
| Roulade dirigée à vitesse scalaire | Vitesse XZ vectorielle, gravité projetée sur la pente, virages freinants, adhérence par sol |
| Collisions logiques indexées spatialement, heightfield, couches et mines | Balayage XYZ en sous-pas de 0,2 m ; contacts verticaux sur structures fines |
| Caméra troisième personne au clic-glisser | Intention yaw/pitch indépendante de l'orientation visuelle du hamster |
| Rig et animations du hamster, états de présentation distants | Réutilisés ; rotation de roulade selon la distance réellement parcourue, assiette du planeur selon sa vitesse verticale |
| Préférences et HUD existants | Vitesse en km/h, indication de décrochage, FOV dynamique discret et désactivable |

Les noyaux de mouvement ne créent aucun vecteur/objet par pas et n'importent ni DOM
ni rendu. L'adaptateur `player.ts` conserve les vecteurs Three.js historiques pour
rester compatible avec les autres systèmes. La requête de collision continue de
renvoyer de petits objets ; ses ensembles et tableaux candidats sont réutilisés,
et les AABB des obstacles sont mises en cache jusqu'à leur déplacement.

## Vol et énergie

Le planeur suit progressivement l'orientation demandée par la caméra, même lorsque
la touche d'avancée est relâchée. Le code de suivi de caméra ne modifie jamais cette
intention à partir de la rotation du personnage : aucune boucle d'asservissement.

- Piquer transforme de l'altitude en vitesse, jusqu'au plafond de vitesse.
- Cabrer utilise la réserve cinétique pour remonter temporairement.
- À orientation neutre, l'assiette de compensation descend selon la finesse réglée.
- Les virages et l'aérofrein ajoutent des pertes ; aucune poussée n'est ajoutée au vol.
- Sous la vitesse de décrochage, la cible d'assiette s'abaisse pour reprendre une
  descente ; aucun plancher de vitesse ne fournit d'énergie gratuite.
- Ouvrir les membranes conserve la vitesse disponible au lieu d'imposer 10,4 m/s.
  Les replier rend la main à la chute balistique en conservant l'élan.

Le modèle suit `E = |v|² / 2 + g × altitude`. La vitesse après pas est la racine
positive de `s² + 2 g sin(assiette) dt s = s_précédent² − 2 pertes` : la hauteur
traversée par l'intégration finale est comptée dans le budget. La conversion en
piqué peut être rendue moins efficace, mais jamais supérieure à 100 %. Les plafonds,
la traînée et les contacts dissipent de l'énergie. La marche et le saut restent des
actions motrices ; cette garantie de dissipation concerne le planeur sans poussée,
les échanges roulade/air conservant la vitesse au lieu de donner une impulsion cachée.
Ce n'est pas un modèle aérodynamique réaliste.

## Commandes et ressenti

| Commande | Comportement |
| --- | --- |
| ZQSD / WASD / flèches | Marche selon la caméra ; même convention gauche/droite |
| Shift + déplacement | Entrer en roulade ; relâcher Shift revient sur les pattes avec inertie |
| X | Basculer la roulade, indépendamment du maintien de Shift |
| Espace au sol | Sauter avec l'élan ; la tangentielle verticale d'une rampe est conservée en roulade |
| Relâcher puis réappuyer Espace en l'air | Déployer/replier le planeur, y compris pendant une chute |
| Clic-glisser vers le haut de l'écran | Caméra vers le bas : piquer et accélérer (inversion Y réglable) |
| Clic-glisser vers le bas de l'écran | Caméra vers le haut : cabrer et dépenser l'élan |
| Clic-glisser horizontalement | Virage progressif du planeur ; Q/D peuvent compléter le cap |
| S en planage | Aérofrein, sans marche arrière aérienne instantanée |
| Paramètres → Affichage | Désactiver « Effets visuels de vitesse (champ de vision) » ; réduire les animations les désactive également |

L'activation du clic-glisser, la molette, la nage, la plongée, l'escalade, les activités
et le bateau restent dans leurs circuits existants. Le FOV passe progressivement de
66° à 73° au maximum ; aucune secousse ni post-traitement ajouté. Le HUD de vitesse
est actualisé à 4 Hz. L'inclinaison du hamster utilise le rig et le mélange existants.

## Paramètres centralisés

Fichier : `src/physics/motion.ts`. Les constantes sont celles utilisées par le jeu.
Le noyau `glideVelocity` accepte également un objet de réglages pour les essais Node.

| Groupe | Paramètres principaux | Valeurs par défaut |
| --- | --- | --- |
| `MOTION` | gravité, marche/course, accélération/freinage sol, traînée et direction en chute | 17,2 m/s² ; 4,65/8,7 m/s ; 28/18 m/s² ; chute plafonnée à 48 m/s |
| `ROLL` | vitesse motrice, plafond de descente, accélération, frottement, freinage | 11/18 m/s horizontaux ; 5/1,2/9 m/s² |
| `ROLL` | vitesse de virage, perte en virage, poids de la pente, saut | 1,8 rad/s avant adaptation ; 0,12 ; 0,5 ; 6,5 m/s |
| `GLIDE` | vitesse de compensation, maximale, décrochage | 11 / 34 / 6 m/s |
| `GLIDE` | finesse, efficacité de conversion du piqué | 8 ; 1 (réglable entre 0 et 1) |
| `GLIDE` | réaction d'assiette, vitesse de cap, limites piqué/cabré | 1,25 / 1,15 rad/s ; −1,05 / +0,58 rad |
| `GLIDE` | traînée fixe/quadratique, perte en virage, assiette de décrochage | 0,10 / 0,0007 ; 0,12 ; −0,7 rad |
| `SURFACE_MOTION` | friction et adhérence herbe/roche/sable/boue/bois | table partagée dans le même fichier |

`minCruise` est une vitesse de compensation aérodynamique, **pas** une vitesse minimale
imposée. Pour limiter la remontée, modifier `maxClimb`, `pitchRate`, la traînée ou la
perte en virage. Pour ajuster l'accélération en piqué, modifier `diveEfficiency`,
`maxDive` ou la traînée, sans changer la gravité des autres modes.

Les matériaux viennent de la géographie, dans des cellules sources stables de 2 m.
Le cache est déterministe lors d'un retour à un ancien état. Les sols de bois sont
supportés par l'interface de requête ; les sources géographiques qui ne décrivent pas
un tablier en bois ne l'identifient pas automatiquement. Les tabliers et étages plats
utilisent leur support, sans subir la pente du terrain situé sous la structure.

## Collisions et transitions

Le balayage `WorldCollisionQuery.sweep` conserve l'ancien `move` et son index spatial.
Il réutilise les colliders auteur, les volumes des mines, les surfaces superposées et
les transitions explicites. Les obstacles fins peuvent être rencontrés pendant une
chute ou une remontée, et les passages sous des traverses restent ouverts.

Une limite de 0,2 m sur les déplacements horizontaux/verticaux évite de sauter un
contact. La normale du relief provient des hauteurs ; aucune intersection avec les
meshes graphiques, aucun raycast de rendu par frame. L'entrée dans l'eau conserve le
comportement de flottaison existant et replie les membranes. L'atterrissage supprime
la composante verticale ; l'inertie horizontale se résorbe progressivement au sol.

## Scène et outils d'essai

**Studio → Scène de référence Déplacements** ouvre un projet V3 de 400 × 600 m :

- pente de départ à l'ouest, rampe et espace d'atterrissage ;
- plateau/falaise à l'est pour les départs en vol ;
- arche de test à trois colliders, plateforme de 15 cm d'épaisseur ;
- bassin pour la transition vers la nage, sans végétation automatique.

| Point | X, Z (m) |
| --- | --- |
| Pente | −90, −205 |
| Rampe | −90, −45 |
| Plateau de départ | 90, −120 |
| Départ proche du bord utilisé dans le test navigateur | 90, −84 |
| Arche | −80, 120 |
| Plateforme fine | 45, 120 |
| Bassin | 125, 210 |

Sources : `tools/generate-motion-reference.mjs`, `maps/motion-reference.project.json`,
copie Studio dans `public/maps/motion-reference.project.json`, version compilée dans
`public/maps/motion-reference/`. L'export/import ZIP, la compilation et le chargement
utilisent les mêmes fonctions que les autres mondes. Pas de règle physique spécifique
ni de téléportation de l'acteur pour faire réussir la scène.

```sh
npm ci
npm run generate:motion     # reproductible, sans réécrire les sorties identiques
npm run dev
npm run test:motion         # autre terminal ; vrais clavier et souris
npm test
npm run typecheck
npm run build
npm run bench:physics
```

Pour ouvrir directement le monde compilé, ajouter au préfixe `/little-world/` :
`?world=maps/motion-reference/manifest.json&spawn=90,-84&yaw=0&pitch=.32&metrics=1`.
La position de départ est sur le plateau : avancer en boule, sauter avant le bord,
relâcher Espace puis le réappuyer pour déployer les membranes.

Le test navigateur accepte `WORLD_URL` et `ARTIFACTS_DIR`. Ses images et mesures sont
dans `/tmp/little-world-motion` par défaut. Exemple sur le build de production :

```sh
npm run preview -- --host 127.0.0.1 --port 4176 --strictPort
WORLD_URL=http://127.0.0.1:4176/little-world/ npm run test:motion
```

Les métriques développeur exposent `movement` (état physique et tick), `velocity` et
`flight`, distincts de la caméra et de la pose. Les captures livrées se trouvent dans
`docs/captures/motion/`. L'asset `public/models/hamster.glb` est régénéré depuis les
animations du jeu ; son générateur fait maintenant avancer la référence pour exporter
correctement une rotation proportionnelle au trajet. Il ne fournit aucune autorité
physique au runtime.

## Interfaces multijoueur et courses futures

`physics/movement-state.ts` fournit :

- `MovementCommand {tick, input}` : commande datée, sérialisable ;
- `captureMovement` : position, orientation, vitesse, mode et états cachés de
  transition (roulade, planeur, oxygène, escalade, espace courant) ;
- `restoreMovement` : remise à un état validé ;
- `replayMovement` : application d'une bande de commandes consécutives à 30 Hz.

Ces fonctions permettent de brancher ultérieurement une correction d'autorité puis
le rejeu des entrées non acquittées. Le circuit de présentation distante existant
(`PlayerPresentationState`, `interpolatePresentation`) reste distinct. Aucune socket,
file réseau, prédiction automatique, réconciliation réseau, course, chrono ou classement
n'est ajouté. Un futur fantôme peut enregistrer les états/ticks ou rejouer les commandes ;
les checkpoints peuvent consommer la même position physique, sans lire le renderer.

Le futur serveur devra partager les mêmes sources de collisions, paramètres et version
de physique, valider les commandes et gérer les ticks/acquittements. Le rejeu est testé
sur le même environnement JavaScript : pas de garantie bit à bit entre moteurs JS.
L'adaptateur actuel conserve Three.js pour ses vecteurs mathématiques et les limites
mondiales configurées ; les noyaux numériques sont indépendants de ces dépendances.
Un serveur multi-mondes devra expliciter ce contexte et ajouter son propre transport,
sa politique de correction et ses buffers d'interpolation.

## Validation et limites

Les tests couvrent piqué/remontée, décrochage, dissipation d'énergie, vitesse maximale,
efficacité du piqué, virage, déploiement sans bonus, roulade/saut/planeur/atterrissage,
sols, montée sur élan, départ tangent d'une rampe, entrée dans l'eau, pont sur relief,
contacts rapides de murs/toitures, rejeu exact et fréquences de rendu 20/30/60/144 Hz.
Les tests existants de nage, escalade, mines, terrain et mouvements restent exécutés.

Le test navigateur vérifie l'ouverture Studio, Shift, deux pressions Espace, le piqué,
le cabré et le virage par clic-glisser, ainsi que le retour du FOV à 66° après désactivation
et l'absence d'avance physique pendant le menu de pause. Le parcours s'effectue dans
le vrai jeu compilé, sans injection de position ou de vitesse.

Les mesures CPU du benchmark sont indicatives, sur Node dans cette machine ; elles
ne garantissent pas les FPS d'un GPU intégré. Les AABB/sphères conservatrices existantes
restent la limite de précision sur les formes inclinées/complexes. Une façade rocheuse
visuelle ne crée pas automatiquement un surplomb physique ; le relief reste un heightfield.
Les collisions sont glissantes/inélastiques, sans rebond ou dégâts. Les frottements de
roulade sont arcade et ne modélisent pas une inertie rotationnelle de solide complète.
Le comportement et la sensibilité doivent encore être appréciés manuellement avec
une souris physique, puis calibrés sur matériel de référence.


## Fichiers de la livraison

| Domaine | Fichiers créés/modifiés |
| --- | --- |
| Simulation | `src/player.ts`, `src/physics/motion.ts` |
| Collisions et sols | `src/physics/collision-world.ts`, `src/physics/surface-material.ts` |
| État et rejeu | `src/physics/movement-state.ts` |
| Commandes, caméra et métriques | `src/main.ts` |
| Présentation du hamster | `src/hamster/hamster.ts`, `src/hamster/hamster-animation.ts` |
| HUD et préférences | `src/ui/app/game-ui.ts`, `src/ui/app/preferences.ts`, `src/ui/app/ui.css`, `src/ui/settings/settings.ts` |
| Scène Studio | `src/studio/shell.ts`, `tools/generate-motion-reference.mjs`, sources/paquets `motion-reference` |
| Export du modèle | `tools/generate-hamster.mjs`, `public/models/hamster.glb` |
| Validation | `tests/dynamic-motion.test.mjs`, `tests/hamster-roll.test.mjs`, `tools/test-motion-browser.mjs`, `tools/bench-physics.mjs`, `package.json` |

Le test historique de pente a été adapté pour fournir aux deux acteurs la même vitesse
de départ réelle (4 m/s) ; il ne dépend plus de l'ancienne impulsion gratuite à l'entrée
en boule. Un nouveau test vérifie explicitement qu'entrer en roulade à l'arrêt ne crée
pas de vitesse.


## Résultats enregistrés

- **460 tests réussis**, aucun échec ni test ignoré ; TypeScript et build Vite validés.
- Contrôle du build statique : jeu/Studio compilés et ressources présentes.
- Parcours navigateur de production : ouverture Studio, roulade, saut/déploiement,
  piqué, cabré, virage à la souris, direction D cohérente avec l'écran, FOV désactivé
  et pause vérifiés sans erreur de chargement/exécution.
- Génération de la scène répétée sans fichier réécrit ; génération GLB répétée avec
  la même empreinte SHA-256.
- Benchmark Node, p95 par pas : environ 0,013 ms en roulade, 0,009 ms en planeur,
  0,128 ms dans le scénario à 400 obstacles. Les fonctions de relief de ce microbench
  sont synthétiques : lire `physics-bench.json` et mesurer sur matériel cible avant
  toute conclusion concernant les FPS ou des centaines de personnages.
