# 43 — Personnage joueur Hamster V1

**Statut : implémenté et testé sur la branche `claude/little-world-production-v1-eym947` (PR #15), non publié sur `main`. Performance non qualifiée sur GPU intégré.**
Le hamster remplace l’écureuil comme **personnage du joueur**. L’écureuil reste la morphologie par défaut des habitants, et le hamster devient une morphologie possible pour les PNJ dans le Studio.

> Règle de lecture (AGENTS §4.6) : chaque mécanisme est noté **spécifié / implémenté / testé / publié** séparément. « Testé » renvoie à un test Node ou navigateur existant. Les captures SwiftShader prouvent le fonctionnement, pas la performance.

## 1. Audit (phase A) : ce qui existait et a été réutilisé

| Système existant | Réutilisation |
| --- | --- |
| `simulatePlayer` (`src/player.ts`), pas fixe 30 Hz, modes `ground/air/glide/swim/dive/climb` | Un **mode `roll` ajouté** dans la même simulation. Pas de second contrôleur ni de moteur physique : la boule est cinématique, avec les mêmes collisions (`CollisionWorld`), la même pente et la même eau. |
| Surface `SquirrelCharacter` (update, setAppearance, group) utilisée par `main.ts` | Même surface pour `HamsterCharacter` : le remplacement est local et `main.ts` ne contient aucun code propre au rig. |
| `character-style.ts` (apparence, émotions, sauvegarde locale) et menu Apparence | Réutilisés tels quels. Accessoire `goggles` ajouté de façon facultative et rétro-compatible (les anciennes sauvegardes se lisent sans changement). |
| Activités (`gathering`, `fishing`, mine `dig`, AGRI `farmAct`) | **Inchangées** : elles restent l’autorité. Une animation est jouée seulement **après** une action validée, et l’animation ne valide jamais rien. |
| Catalogue audio V2 (`catalog-source.ts`) et routeur | 8 événements sémantiques ajoutés, **0 fichier audio nouveau** (groupes de réutilisation). Le son d’impact part de l’**événement d’animation**. |
| `CHARACTER_SCALE`, ombre-disque, matériaux plats à couleurs de sommets | Mêmes conventions que les autres personnages. |
| PNJ (`npc.ts`, `npc-view.ts`) et Studio (inspecteur, placement) | Morphologie `hamster` ajoutée (rig `hamster-rigid`), schéma V3 validé. |

## 2. Modèle et squelette (phase B)

- **Génération procédurale** (`src/hamster/hamster-model.ts`) : tout le hamster (corps, visages, accessoires, outils, membranes) forme **un seul `SkinnedMesh`**, donc **un seul appel de rendu**, avec un matériau partagé (`MeshStandardMaterial`, `vertexColors` et `flatShading`), équivalent d’un atlas de couleurs.
  - **Liaison rigide** : chaque sommet est lié avec un poids 1 à l’os de sa pièce. Il n’y a pas de mélange de poids, et chaque pièce reste indéformable.
  - **Pièces facultatives** (8 visages inutilisés, 5 accessoires, 8 outils, 2 membranes) : chacune a son propre os technique. **Échelle 1 = visible, 0 = masquée** : la pièce se réduit à un point (aire nulle, rien n’est dessiné). Les drapeaux `visible` de l’API restent les mêmes (`rig.faces`, `rig.accessories`, `rig.tools`).
  - Géométrie construite une fois et **partagée par toutes les instances** (joueur, PNJ hamsters). Seul le squelette est propre à chaque personnage.
  - Pas de fourrure, pas de simulation de tissu.
- **22 os animés** (`HAMSTER_JOINTS`), plus 22 os techniques de visibilité qui ne sont jamais animés :
  - corps (pivot au centre pour la roulade) ;
  - tête, 2 oreilles ;
  - épaules, bras et mains ×2 ;
  - hanches et pieds ×2 ;
  - queue ;
  - 2 os de membranes et la sacoche ;
  - 4 *sockets* : tête (chapeau), visage (lunettes), dos (sac), cou (écharpe/pendentif).
  - Outil : main droite (`sockets.tool`), main gauche secondaire (`sockets.offHand`).
- **Membranes de planage** : un quadrilatère à double face par côté, sur son os ; l’ouverture correspond à l’échelle x (0 = repliée et masquée).
- **Visages** : une pièce par émotion (9). Seule celle de l’émotion courante est à l’échelle 1.
- **Accessoires** : chapeau de paille, lunettes d’aviateur, sac à dos, écharpe et pendentif, ainsi que la sacoche toujours portée. Ils se masquent quand le hamster est roulé en boule ; les lunettes se masquent sous le chapeau.
- **Export GLB** : `npm run assets:hamster` écrit `public/models/hamster.glb`.
  - Contenu : un maillage skinné (7 224 sommets), une skin de 44 os, 15 clips échantillonnés depuis l’animateur. Seuls les canaux réellement animés sont gardés.
  - Sortie **déterministe**, vérifiée en CI par `git diff`.
  - Ce GLB sert d’**échange vers Blender** (doc 20). Le jeu construit le modèle depuis le code et ne charge pas ce fichier.

### Mesures (Node et Chromium/SwiftShader, à requalifier sur GPU intégré)

| Mesure | Valeur | Source |
| --- | --- | --- |
| Triangles visibles (apparence par défaut, membranes repliées) | **960** (cible 800–1500) ; 2 408 dans le tampon partagé avec toutes les options | `tests/hamster.test.mjs` |
| Os animés | **22** (cible 18–22), plus 22 os techniques de visibilité | idem |
| Maillages / matériaux du personnage | **1 `SkinnedMesh`**, **1** matériau (plus l’ombre-disque transparente) | idem, `littleWorldMetrics.character.meshes` = 2 |
| Appels de rendu du personnage | **1** (plus 1 pour l’ombre au sol) ; 14 avant la fusion | test navigateur |
| GLB exporté | **545 Kio** (attributs de skin), 15 clips | `npm run assets:hamster` |
| Taille d’un état de présentation JSON | < 400 octets | `tests/hamster.test.mjs` |

Coût accepté : le vertex shader traite toujours les 7 224 sommets, y compris ceux des pièces masquées réduites à un point. Ce sont quelques milliers de sommets par hamster contre 13 appels de rendu en moins. Le coût réel du skinning sur GPU intégré reste **à mesurer**.

## 3. Animations et locomotion (phase C)

`src/hamster/hamster-animation.ts` contient deux machines à états **pures**, sans Three.js :

1. **Couche locomotion**, pilotée par le mode de simulation :
   - `IDLE`, `WALK`, `RUN` ;
   - `ROLL_ENTER`, `ROLL_LOOP`, `ROLL_EXIT` ;
   - `JUMP`, `FALL`, `LAND` ;
   - `GLIDE_OPEN`, `GLIDE_LOOP`, `GLIDE_CLOSE` ;
   - `SWIM`, `CLIMB`, `BOAT`.
   Les transitions sont courtes et datées (`TRANSITIONS`), avec des mélanges exponentiels sans saut de pose.
2. **Couche action**, définie par une table (`ACTION_DEFS`) :
   - actions : `EQUIP`, `UNEQUIP`, `TOOL_SWING_VERTICAL`, `TOOL_SWING_HORIZONTAL`, `TOOL_DIG`, `WATERING`, `PICKUP`, `CARRY`, `FISH_CAST`, `FISH_WAIT`, `FISH_REEL`, `INTERACT`, `SIT` ;
   - chaque action déclare des images-clés par canal et des **événements datés**, émis exactement une fois par lecture : `impact`, `grab`, `release`, `reel`, `pour`, `wave`, `equip`, `unequip` ;
   - les actions sont refusées en boule, en planage et à la nage ; entrer en boule annule l’action en cours.

**Roulade** (`ROLL` dans `player.ts`) :

- `X` bascule le mode boule. L’accélération est progressive jusqu’à 11 m/s, contre environ 8,7 m/s en course.
- Le virage est limité (1,8 rad/s) au-delà de 1,5 m/s. Pousser vers l’arrière freine.
- La pente accélère la boule en descente et la ralentit en montée. Un obstacle freine la boule à 35 %, sans traverser les murs.
- Un saut garde l’élan. La boule sort d’elle-même à l’arrêt, à l’entrée dans l’eau ou sur une falaise.
- La rotation visuelle intègre la distance parcourue (`ROLL_RADIUS`) puis revient sur un tour entier.

**Planage** : les membranes s’ouvrent et se ferment avec les transitions `GLIDE_*`. L’ombre-disque est masquée en vol.

**Caméra** : distance 8 m, bornée entre 4 et 22 m. Le rendu est séparé de la logique : le personnage lit le `Player` simulé et ne le modifie jamais.

## 4. Outils et activités (phase D)

- **Objets 3D réels** fixés à la patte droite (`src/hamster/tools.ts`) :
  - pioche et pioche d’acier, hache, canne à pêche ;
  - pelle, marteau, arrosoir, sac de semences.
  Chaque outil est une géométrie fusionnée et partagée, construite à la première utilisation, et un seul outil est visible à la fois.
- `ACTIVITY_ANIMATIONS` associe chaque activité à une animation et à l’objet tenu. Il n’y a pas d’animation propre à un outil.

| Activité du jeu | Animation | Objet |
| --- | --- | --- |
| Miner | `TOOL_SWING_VERTICAL` | pioche (fer ou acier, selon l’inventaire) |
| Abattre un arbre | `TOOL_SWING_HORIZONTAL` | hache |
| Cueillir / ramasser | `PICKUP` | pattes nues |
| Semer / arroser / récolter / nettoyer | `PICKUP` / `WATERING` / `PICKUP` / `TOOL_DIG` | semences / arrosoir / — / pelle |
| Pêche : lancer, attente, ferrage | `FISH_CAST` → `FISH_WAIT` (boucle) → `FISH_REEL` | canne, ligne et flotteur en coordonnées monde |
| Parler, interagir | `INTERACT` | — |

- **Effets d’impact** (`impact-effects.ts`) : éclats instanciés dans un pool (un seul appel de rendu, sans allocation par coup), colorés selon la matière (bois, pierre, terre, cristal, fer, eau, feuille).
  - Ils partent de la tête de l’outil au moment de l’événement `impact`, et le son de frappe part au même instant.
  - Si l’animation ne peut pas jouer (par exemple en boule), le son est joué immédiatement sans éclats.
- **PNJ hamsters** : salut (`INTERACT`) et travail (`TOOL_SWING_VERTICAL` avec le marteau) jouent les mêmes actions que le joueur.

## 5. Synchronisation future, audio et optimisation (phase E)

- **Contrat de présentation** (`presentation-state.ts`), sans code réseau, conformément à AGENTS §1 quater.
  - Données transmises : position, cap, mode, vitesses, `aboard`, action, outil et flotteur. Un **`actionSeq`** fait jouer chaque action ponctuelle une seule fois chez un client distant.
  - Aucun os ni image d’animation n’est transmis.
  - `parsePresentationState` valide strictement un état non fiable ; `interpolatePresentation` interpole et prend l’angle le plus court.
  - `applyPresentation` passe par le **même chemin de code** que le joueur local.
  - Les récompenses et changements du monde restent validés par l’autorité de jeu (doc 16, doc 24, doc 25).
- **Audio** : `player.roll.start/loop/stop`, `tool.equip`, `tool.chop`, `fishing.cast/float/bite/reel`. La boucle de roulade passe par le routeur d’état ; le reste est déclenché par les événements d’animation.
- **Optimisation** :
  - géométries partagées entre instances ;
  - aucune allocation par image dans l’animateur ;
  - outils construits à la demande, un seul pool d’éclats ;
  - aucune animation CPU propre à l’herbe ou au décor.

## 6. État des fonctionnalités

### Terminées (implémentées et testées)

- Modèle hamster low-poly en **un seul maillage skinné** (1 appel de rendu), 22 os animés, sockets, 5 accessoires et sacoche, 9 visages ; export GLB déterministe.
- Locomotion : marche, course, saut, chute, atterrissage, planage avec membranes, nage, escalade, bateau.
- Roulade en boule : physique cinématique, pentes, obstacles, sortie automatique ; son et animation.
- Outils visibles et animés : pioche, hache, canne (ligne et flotteur), arrosoir, sac de semences, pelle.
- Activités reliées : mine, abattage, cueillette, agriculture (4 intentions), pêche (3 phases), dialogue et interaction.
- Événements d’animation reliés aux sons et aux éclats d’impact.
- Contrat de présentation : sérialisation, validation, interpolation, reconstruction distante testée à 10 Hz.
- Morphologie `hamster` pour les PNJ dans le Studio (schéma, inspecteur, placement, runtime).

Tests correspondants :

- `tests/hamster.test.mjs` (10 tests) ;
- `tests/hamster-roll.test.mjs` (3 tests) ;
- `tests/studio-characters.test.mjs` (test des espèces) ;
- `tools/test-hamster-browser.mjs` (11 vérifications sur l’île publiée), présent en CI.

### Partielles

- **`EQUIP`/`UNEQUIP`** : les animations, les événements et le son existent. Le jeu choisit encore l’outil automatiquement selon l’activité, sans action explicite de sortir ou de ranger un outil.
- **Marteau, `CARRY`, `SIT`** : les animations et le modèle existent, mais aucune activité du joueur ne les utilise pour l’instant. Le marteau sert seulement aux PNJ au travail.
- **Rames du bateau** : la pose `BOAT` existe (assis, pattes en avant), mais pas l’animation de rame synchronisée avec le bateau.
- **Aperçu Studio** : le hamster est placé et édité comme un PNJ dans le viewport. Il n’y a pas de panneau dédié pour visionner les animations une à une.

### Bloquées ou reportées (hors périmètre actuel)

- **Synchronisation multijoueur réelle** (sockets, serveur autoritaire) : interdite avant le jalon multijoueur (AGENTS §1 quater). Seul le contrat de données est livré.
- **Qualification de performance** sur GPU intégré : nécessite le matériel de référence. Les chiffres ci-dessus viennent de Node et de SwiftShader.

## 7. Commandes

- `X` : rouler en boule, ou en sortir.
- `Espace` deux fois : planer.
- `E` : agir (cueillir, pêcher, parler).
- `F` maintenu : frapper (miner, abattre, cultiver).
- `A` maintenu : accessoires et émotions.

Vérifications :

```bash
npm test
```

```bash
npm run assets:hamster
```

```bash
WORLD_URL=http://127.0.0.1:5173/little-world/ npm run test:hamster
```
