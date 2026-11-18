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
