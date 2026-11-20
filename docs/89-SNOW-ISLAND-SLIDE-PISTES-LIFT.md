# Île alpine — début d'implémentation des trois verrous techniques

**Statut : prototype branché au runtime, validation CI et essai visuel à confirmer.**
Périmètre : physique de glisse, préparation du relief et télésiège. Les compétitions et les classements seront réutilisés depuis le système commun de courses roulade/vol ; ne pas créer de gestionnaire concurrent.

## 1. Démarrage de la démonstration

Sur une île montagneuse compilée ou dans le monde jouable, ouvrir la page de jeu avec `?snowDemo=1` (conserver les autres paramètres éventuels). Le mode est local et ne modifie **aucune** carte sauvegardée.

- `findDemoPiste()` inspecte les hauteurs et recherche un couloir descendant sans falaise abrupte. Un terrain plat ou incompatible renvoie `null` ; aucun télésiège n'est créé dans ce cas.
- Le seuil de neige de la prévisualisation est placé légèrement sous l'arrivée de la piste ; les secteurs et les workers de géographie reçoivent la même classification visuelle et physique.
- Le hamster apparaît près de la gare aval ; se placer près de la gare et utiliser **E** pour attendre un siège, monter puis débarquer automatiquement.
- **B** alterne snowboard et skis en prévisualisation ; **Q/D** ou **A/D** tournent, **S** freine, **Ctrl** freine fortement, **Espace** saute.
- La neige damée et la glace peuvent aussi être peintes via le masque **Matériaux** du Studio. Hors aperçu, un équipement devra être obtenu depuis le système de sac lorsque la future île complète l'introduira.

La prévisualisation est un **outil de validation technique**, pas encore une île alpine publiable, ni une piste nivelée.

## 2. Moteur et règles de glisse

- `src/snow/snow-slide.ts` : calcul au pas fixe, gravité projetée sur la pente, friction, virage limité, freinage, vitesse plafonnée. Aucun `requestAnimationFrame` ni état graphique dans le noyau.
- `src/player.ts` : mode `snow`, transition sol/glisse/saut/chute, momentum conservé et collisions existantes.
- `src/physics/movement-state.ts` : état de glisse enregistré dans les checkpoints/replays ; ne pas ajouter de serveur maintenant.
- `src/hamster/*` : posture glissée, meshes simples de snowboard et de skis, sans coût de rigging supplémentaire.
- `src/geography/{layers,classify,materials,engine}.ts` : matériaux `snow` et `ice`, couleurs de sommets et suppression du couvert végétal sur neige/glace ; classification identique worker/client.

À calibrer : vitesse perçue (objectif initial 70–90 km/h), freinage latéral, angles admissibles, sauts, réception et maintien du mode `snow` sur les masques de piste. Les objets du sac n'activent pas encore l'équipement en dehors du mode de test.

## 3. Relief de piste

`src/snow/snow-pistes.ts` fournit une vérification **non destructive** :
- continuité du tracé, longueur et dénivelé,
- pente longitudinale locale (sans raccourcis visuels),
- dévers transversal sur la largeur utile,
- refus des reliefs inadaptés.

À réaliser après première validation des sensations :
1. Ajouter un preset `alpine-resort` au Studio, avec altitude et exposition paramétrables.
2. Construire des **rubans de relief adouci** (retouches du modèle auteur, jamais dans le renderer), fondus sur les côtés et validés avant publication.
3. Générer 2–3 pistes de difficulté croissante avec zones de freinage, gare aval et gare amont. Publier une nouvelle île indépendante, sans régression de l'île 4×3 km.
4. Inscrire des données de piste versionnées dans le projet et le compilateur, pas dans des constantes placées dans `main.ts`.

## 4. Remontée mécanique

- `src/snow/ski-lift.ts` : trajectoire fixe, places déterministes calculées par phase temporelle, état `waiting → riding → finished`.
- `src/snow/ski-lift-view.ts` : pylônes statiques, câble et un seul `InstancedMesh` pour les sièges.
- Le hamster est temporairement asservi à la trajectoire : aucun collider mobile sur chacun des sièges.
- Embarquement près de la gare basse ; si le joueur s'éloigne pendant l'attente, la réservation est annulée ; descente automatique au sommet.

À réaliser après prototype : contrôle terrain/support des pylônes, câbles aller-retour complets, siège/pattes animés, quai d'attente, signalisation, reprise après chargement, identité de siège stable et réservation autoritaire multijoueur.

## 5. Contrats multijoueurs futurs

Conserver les états séparés : `SnowSlideState` / `LiftRide` / `SkiLift` / définition de piste. Le serveur sera responsable des collisions, des checkpoints, du début/fin des courses et de la réservation des sièges. Les positions des sièges seront dérivées de la phase commune, plutôt que continuellement répliquées. Aucun réseau ni compteur de compétition ajouté dans ce lot.

## 6. Tests et gates

- `node --experimental-strip-types --test tests/snow.test.mjs` : accélération, glace, freinage, virage, limites de vitesse, validateur de piste et télésiège.
- `npm run typecheck`, `npm run test`, `npm run build` : non-régression.
- Essai navigateur : `?snowDemo=1` sur une carte montagneuse publiée, vérifier la neige visible avec `workers=0` et avec workers, tester descente et remontée, puis la même carte **sans** `snowDemo`.
- Inspecter visuellement les 3 cas critiques : transition saut/ski, arrivée gare haute, virage sur bord de pente.
- Sur un vieux PC, mesurer FPS, draw calls, triangles, chargements de secteurs et pics de frame durant une descente rapide. Pas de promesse de performance sans mesure.

### Non inclus dans cette première PR

- Île enneigée complète précompilée et accessible par bateau.
- Nivellement automatique depuis le Studio.
- Enregistrement/inventaire définitif des skis et snowboards.
- UI de télésiège, télécabine, neige saisonnière et sons.
- Courses et compétitions, qui rejoindront le module commun déjà en construction.

## Chrono local des Cimes

Le Studio génère les portes du Chrono des Cimes le long de la piste native. Le
joueur peut préparer le départ à pied avec des skis ou un snowboard. Le chrono
démarre au franchissement de la première porte en glisse et les sauts signalés peuvent compter comme
franchissement. Le planeur et les sauts hors tremplin arrêtent la tentative. Le record personnel utilise la sauvegarde commune
aux autres courses.

L’habitant du port propose la mission **Première descente aux Cimes**. Le
journal indique comment préparer le chrono et situe le départ sur la carte.
Une descente validée permet de récupérer 8 pièces auprès de l’habitant.

## Station des Cimes

La station se trouve dans la zone basse de l’île des Cimes. Elle rassemble
un chalet, un banc, un plan interactif et Ariane, la monitrice. La carte du
joueur indique la station et l’embarquement. Le chalet et ses équipements
reposent sur une terrasse de terrain éditable dans Studio.

Le Chrono des Cimes emprunte une piste damée. Dans le couloir balisé, la
neige préparée réduit la friction et conserve la prise de carre de la neige.
Studio propose le réglage **Piste damée** dans **Courses**. Le chrono sur
neige damée dispose de ses propres records personnels.

Le comptoir du chalet vend des skis à 24 pièces et des snowboards à 28 pièces.
Le matériel acheté se conserve dans le sac et s’équipe comme les autres
outils. Le prêt de la station reste disponible avec **B**.


## Chronos fixes et tremplins

Au sommet de la remontée, **Courses** propose le Chrono des Cimes en skis
et en snowboard. Les deux épreuves suivent le même tracé et enregistrent
leurs records séparément. La première porte fixe déclenche le chrono.
Changer d’équipement arrête la tentative.

Deux tremplins balisés jalonnent la descente. Ils déclenchent un saut dans le
sens de la piste avec une vitesse d’au moins 6 m/s. Les portes restent valides
pendant ce saut et la réception sur neige reprend la glisse.

## Domaine skiable des Cimes (V2)

**Statut : implémenté et testé sur branche (Node + navigateur SwiftShader) ; performance non qualifiée sur GPU intégré.**

### Ce qui change pour le joueur

- **Matériel acheté, plus de prêt automatique.** Sur une île dont la station possède un comptoir `shop: 'ski'` (les Cimes), aucun ski n’apparaît plus en entrant sur la neige. Le chalet vend skis (24 pièces) et snowboard (28 pièces) ; on les équipe depuis le sac ou avec **B**, qui alterne le matériel possédé (ou le range si un seul est possédé). Sans matériel, on marche dans la neige et un rappel indique le chalet. Le prêt reste disponible avec `?snowDemo=1` et sur un prototype de ski créé dans Studio sans magasin.
- **Neige sur toute la haute montagne.** Les masques de matériaux générés par la composition recouvraient la limite de neige (seul le couloir de piste était blanc). Le générateur des Cimes remet ces cellules à la valeur calculée au-dessus de la limite de neige ; la limite elle-même devient irrégulière (bruit basse fréquence ±9 m, un peu plus haute sur les faces raides), identique dans les workers, le jeu et le Studio.
- **8 pistes balisées** (verte, bleues, rouges, noires) et **7 remontées** : la télécabine des Cimes depuis le chalet, cinq télésièges sur les autres versants et le téléski du Jardin des Neiges pour débuter. Chaque piste est jalonnée à ses couleurs (un `InstancedMesh` pour tous les jalons) et teintée « neige damée » ; la carte indique les départs de piste et les embarquements.
- **Remontées vérifiées jusqu’en haut** : la commande d’action près d’une gare réserve la prochaine cabine/siège/perche ; le passager suit exactement le siège dessiné, puis est déposé à la gare d’arrivée, à côté du départ de sa piste. Les sauts (Espace) et les bosses en ski se terminent désormais sur les skis, sans roulade.

### Relief et données auteur

- `ArchipelagoParams.summitShaping` (facultatif) : remodelage **monotone** au-dessus de `fromM` (Cimes : 190 m, échelle 0,45). Il adoucit les pentes du massif sans toucher à la rivière (≤ 173 m), au port ni à la course de roulade ; tout tracé descendant reste descendant. Sommet ≈ 406 m au lieu de 650 m : c’est le compromis retenu pour obtenir des pentes skiables sur une île de 4 × 3 km.
- Nouvelle forme de relief `piste` (« Piste damée ») : points, un niveau par point, largeur et raccord latéral. Le terrain est fondu vers un profil longitudinal lissé et strictement descendant (déblai/remblai ≤ 10 m), sans dévers. Le niveau est une moyenne gaussienne des sommets voisins (tracé densifié à 6 m) : surface continue même à l’intérieur des virages. Éditable dans l’éditeur de relief comme une crête ou une vallée.
- `libraries.alpine` accepte jusqu’à 24 pistes ; `composition-alpine` reste la piste principale (chrono, tremplins, station). Champs facultatifs de `SkiAreaV1` : `difficulty`, `liftPath` (base → sommet), `liftKind` (`gondola`/`chairlift`/`draglift`), `liftName`. Sans `liftPath`, l’ancien télésiège le long de la piste est conservé ; les anciens projets restent lisibles.
- Planification (`src/studio-core/alpine-resort.ts`, `src/snow/resort-planner.ts`) : base au replat côté village, télécabine vers une gare sommitale, puis itinéraires calculés par Dijkstra (cellule + cap, virages ≤ 45°) visant la pente cible de chaque difficulté, avec dévers brut borné, couloir libre d’obstacles et distance aux autres pistes. Chaque piste est damée aussitôt ; elle n’est conservée que si toutes les pistes déjà acceptées restent dans leurs limites. Une piste introuvable est simplement omise (le monde n’est jamais forcé).
- Câbles : stations basses (embarquement au niveau de la neige), pylônes ajoutés là où une portée passerait sous la garde au sol ; le téléski suit le sol. Le parcours est dérivé au chargement du relief compilé, pas stocké.
- Compilation : `geography.ski` (piste principale) + `geography.skiRuns` (autres pistes) pour la surface neigeuse ; `PlayableWorld.alpineAreas` pour remontées, balisage et carte.

### Limites connues

- Modifier le tracé d’une piste dans **Courses** ne déplace pas sa forme `piste` damée : la retoucher dans l’éditeur de relief.
- Une seule réservation de siège à la fois, non sauvegardée ; pas de file d’attente partagée ni de collisions sur les sièges.
- Génération de l’île des Cimes ≈ 17 s (planification incrémentale avec damage) ; acceptable au build, à surveiller dans le serveur de développement.
- Qualité visuelle et coût GPU des remontées/jalons mesurés uniquement sous SwiftShader.

### Vérification

- `node --experimental-strip-types --test tests/ski-resort.test.mjs` : itinéraires, profil damé, continuité du relief, garde au sol des câbles, montée complète de chaque type de remontée, schéma.
- `tests/published-expansion-islands.test.mjs` : ≥ 6 pistes des 4 couleurs, ≥ 5 remontées dont télécabine/télésiège/téléski, chaque remontée dépose à sa gare d’arrivée près de sa piste, neige au sommet et sur toutes les pistes, chrono skis et snowboard terminés avec les deux tremplins.
- `node tools/test-expansion-islands-browser.mjs` : aucun prêt automatique, achat et équipement, chrono, tremplins, embarquement télécabine, montée complète du téléski jusqu’à la gare d’arrivée.
