# Pêche — mini-jeu de tension : conception et intégration V1

> **Statut : IMPLÉMENTATION MVP SUR BRANCHE / TESTS NAVIGATEUR NON TERMINÉS** — audit initial de `main` le **18 novembre 2026**, évolution dans la [PR #77](https://github.com/glloq/little-world/pull/77). Le moteur de tension, l'input et le HUD sont codés, mais le polish visuel/audio et la qualification complète restent prévus dans la roadmap. Suivi : [FISHING-MINIGAME-ROADMAP.md](FISHING-MINIGAME-ROADMAP.md).

## 1. Objectif et périmètre

Faire de la pêche une activité facultative, courte, paisible et suffisamment interactive dans Little World. Un seul geste sert au moulinage : **maintenir = mouliner, relâcher = détendre**. Le ferrage conserve sa fenêtre existante. Le mini-jeu se joue directement dans la scène 3D, avec un HUD compact ; pas de modal bloquant, de physique complexe ni de nouveau moteur.

- **MVP** : lancer, attente, touche, ferrage, combat à tension, capture/échec, récompense atomique, feedback, PC + tactile, régressions et performance.
- **Plus tard** : masses/qualités, cannes améliorées, habitats spéciaux, météo/heure, quêtes, compétitions, présentation poussée.
- **Hors périmètre MVP** : nouvelle simulation aquatique, inventaire parallèle, serveur, système multijoueur, poissons individuels persistants, loot à chaque appui, modification de la carte.

## 2. Audit réel de l'existant (`main`)

| Emplacement | État constaté | Réutilisation / évolution |
| --- | --- | --- |
| [`src/gameplay/gathering.ts`](../src/gameplay/gathering.ts) | `createFishing` gère `idle → waiting → bite` ; attente 2–7 s, touche de 1,3 s ; `strike()` choisit et retourne immédiatement un item | Extraire la pêche dans un module métier dédié sans casser les exports, ajouter `reeling` et la sélection de poisson lors de l'accrochage |
| [`src/gameplay/game-view.ts`](../src/gameplay/game-view.ts) | Instancie `createFishing()` et expose `fishing` au jeu | Conserver le point d'intégration, injecter au besoin la graine et les dépendances |
| [`src/main.ts`](../src/main.ts) | `fishingSpot()` détecte mer/lac/rivière devant le joueur au sol ; `runFishing()` lance ou ferre ; `updateFishing()` gère touche/perte ; `currentTarget()` et `actionQueue` dispatchent `E` | Transformer en adaptateur léger ; ne pas centraliser la physique du mini-jeu dans `main.ts` |
| [`src/ui/interactions/targets.ts`](../src/ui/interactions/targets.ts) | `fishingTarget` ne connaît que `idle/waiting/bite` ; le choix de cible est ordonné | Ajouter les états et faire primer une session active sur les autres interactions |
| [`src/input/touch-controls.ts`](../src/input/touch-controls.ts) | Bouton contextuel `Agir` déclenché au `pointerdown`, sans état de maintien exposé | Exposer `interactHeld` et gérer `pointerup/cancel/blur` ; pas de quatrième bouton fixe |
| [`src/hamster/hamster.ts`](../src/hamster/hamster.ts) et [`hamster-animation.ts`](../src/hamster/hamster-animation.ts) | Canne, ligne à 2 points, bouchon et actions `FISH_CAST/WAIT/REEL` existent, avec événements sonores | Ajouter un état de tension purement visuel et un moulinage continu sans nouveau rig |
| [`src/gameplay/economy.ts`](../src/gameplay/economy.ts) | Canne vendue au port/marché ; 7 poissons ; prix de vente, inventaire partagé | Garder **exactement** les IDs `fish:*`, catégories, prix et magasins en V1 |
| [`src/gameplay/runtime.ts`](../src/gameplay/runtime.ts) | `grantItems` applique une transaction atomique et vérifie la capacité | **Une seule** attribution après victoire validée, jamais au ferrage |
| [`tests/economy.test.mjs`](../tests/economy.test.mjs) | Tests actuels présument « ferrage = capture immédiate » | Remplacer cette hypothèse par « ferrage = début combat », couvrir la nouvelle séquence |

**Risques confirmés par le code** :
1. Dans `currentTarget()`, la pêche passe après bateau, marchand, PNJ, boutique et plusieurs objets : une session déjà engagée pourrait perdre sa touche `E`. La session active doit obtenir **une priorité explicite** avant tout autre choix.
2. `keydown` ignore les répétitions et ne produit qu'une action ponctuelle `actionQueue` : pour mouliner, lire l'état maintenu de `KeyE` à chaque tick, sans répéter les interactions.
3. Le contrôle tactile `Agir` déclenche un événement ponctuel ; il faut conserver ce comportement pour les autres actions et ajouter un maintien **contextuel** uniquement pendant `reeling`.
4. L'ancienne logique `strike()` donne le poisson immédiatement ; l'inventaire ne doit être modifié qu'une fois le combat gagné et terminé.

## 3. Contrat de simulation

### États et transitions

| Phase | Entrée | Commandes | Sortie |
| --- | --- | --- | --- |
| `idle` | Pas de session | `cast(spot)` si joueur au sol, eau valide, canne présente | `waiting` |
| `waiting` | Ligne lancée | `cancel` ou seconde action `E` pour relever ; simulation du délai | `bite` ou `idle` |
| `bite` | Signal touche + 1,3 s | Premier appui `E` : `hook` ; pas d'appui : échec | `reeling` ou `idle` |
| `reeling` | Espèce tirée de la table d'eau, paramètres fixés | `reelHeld` à chaque tick ; relâchement pour baisser tension ; `cancel` | `landed`, `escaped` ou `idle` |
| `landed` | Progression = 1, tension sûre | Émettre une récompense **une fois**, via `grantItems` ; feedback | `idle` |
| `escaped` | Tension rompue, délai dépassé ou erreur de ferrage | Feedback, aucune récompense | `idle` |

Les états `landed`/`escaped` peuvent être transitoires ; **l'événement métier doit être consommable une seule fois** même si l'affichage relit l'état plusieurs frames. Conserver `water`, `castAt` et un `sessionId`/compteur local jusqu'à la clôture.

### Proposition d'API métier (cible, pas encore codée)

- `cast(water, position, nowOrTick): Result` : valide et initialise la tentative ;
- `hook(): Result` : réussit seulement durant la touche et initialise poisson, tension et progression ;
- `step(dt, {reelHeld}): FishingEvent[]` : avance au pas fixe et retourne des événements typés (`bite`, `hooked`, `landed`, `escaped`) ;
- `cancel(reason): FishingEvent[]` : termine proprement, sans loot ;
- `state: Readonly<FishingState>` : lecture UI/animation ; le moteur métier ne manipule ni DOM ni Three.js.

Conserver temporairement un adaptateur de compatibilité de `createFishing` si les autres appels l'exigent ; migrer les tests et les consommateurs ensemble avant retrait de `strike()`. Le temps du gameplay vient du tick de simulation, **pas d'un timer UI**. Un seul événement de victoire par tentative, avec clôture idempotente.

### Simulation de tension / progression

- Normaliser `tension` et `progress` entre 0 et 1 ; min/max et vitesse de réaction *configurables par espèce*.
- Quand le joueur maintient : `progress` croît, `tension` augmente suivant la force du poisson et son motif de tirage.
- Quand il relâche : `tension` redescend, `progress` stagne ou recule légèrement ; ne pas rendre la capture impossible en phase de détente.
- Le poisson alterne moments de calme, accélérations et tirages via une courbe déterministe (« pattern » par espèce et graine de tentative).
- Si `tension >= 1` : ligne cassée ; si `progress >= 1` **et** tension sûre : poisson capturé.
- Empêcher les exploits : pas de progression sans maintien, aucun gain en dehors de `reeling`, valeurs bornées, `dt` borné, pas de gain sur `cancel`.
- Le système doit rester jouable à **30 Hz simulation / 20 FPS rendu** ; la simulation dépend du temps écoulé par tick et non du nombre de frames affichées.

**RNG et stabilité** : conserver les poids et biotopes actuels en V1. Sélectionner l'espèce une seule fois au ferrage réussi ; tirer la suite des mouvements depuis une graine locale reproductible (`worldSeed + tentativeId` ou RNG injecté), jamais `Math.random()` à chaque frame. La reproductibilité des tests et la possibilité d'une autorité serveur ultérieure sont prioritaires. Aucun code réseau pour le MVP.

## 4. Paramètres V1 proposés (à calibrer par essais)

| Espèce | Habitat actuel | Durée visée | Particularité |
| --- | --- | --- | --- |
| Sardine | Mer | 2–3 s | Faible résistance |
| Perche | Lac, rivière | 3–5 s | Courtes secousses |
| Truite | Rivière | 4–6 s | Tirages irréguliers |
| Carpe | Lac | 5–8 s | Force stable et pauses |
| Maquereau | Mer | 4–7 s | Accélérations |
| Bar | Mer | 6–9 s | Tirages puissants |
| Poisson doré | Les trois (très rare) | 8–12 s | Changements de rythme |

Durées **indicatives**, non garanties : le poisson rare doit être plus difficile mais pas injuste. Conserver les IDs `fish:trout`, `fish:perch`, `fish:carp`, `fish:mackerel`, `fish:sardine`, `fish:seabass`, `fish:golden` ; ne pas modifier les prix dans ce chantier.

## 5. Contrôles, HUD et résolution des conflits

**PC** :
1. Face à l'eau, `E` lance ; `E` pendant l'attente relève ; `E` pendant la touche ferre.
2. Durant `reeling`, l'état `KeyE` maintenu pilote le moulinage ; relâcher détend immédiatement. Le même appui de ferrage peut commencer le moulinage ; pas besoin de double clic.
3. `Escape` ou une interruption réelle annule la session ; pas de re-lancer automatique tant que `E` n'a pas été relâchée.
4. Garder les commandes de caméra existantes ; bloquer déplacement, saut, roulade, boost et autres actions **durant le combat seulement**, sans changer la physique globale.

**Tactile** :
- Réutiliser le bouton contextuel existant `Agir` (label lisible `Ferrer` puis `Mouliner`) ; `pointerdown` = action / maintien, `pointerup/cancel/lostpointercapture` = relâchement ;
- Exposer l'état booléen dans `TouchControls` et l'annuler lors des changements d'interface, de mode, de visibilité ou de focus ;
- Pas de bouton permanent supplémentaire, ni d'interférence avec `Saut` ou `Boost` ; tester le passage portrait/paysage.

**HUD** : deux jauges compactes « Capture » et « Tension » visibles uniquement pendant `reeling`, code couleur **avec texte** (pas couleur seule), retours visuels/sonores lors des tirages et de la capture. Éviter un overlay modal qui ferme les contrôles. Respecter zones réservées aux boutons sur mobile. Animation fluide du HUD entre deux ticks sans modifier l'état métier.

**Priorité d'interaction obligatoire** : tant que la session est `waiting`, `bite` ou `reeling`, produire en tête de `currentTarget()` un descripteur de session active pour intercepter `E`, même si le joueur regarde un comptoir ou un PNJ ; prévenir toute interaction secondaire avant la fin/cancellation. Une fois `idle`, rétablir la priorité habituelle des cibles. Vérifier aussi la touche `F`, les actions de culture et le menu pour éviter les commandes concurrentes.

## 6. Détection du lieu et annulation

Réutiliser `fishingSpot()`, `waterSurface`, la séparation mer/rivière/lac et la canne obligatoire. Ne pas pêcher depuis un bateau au MVP : cette évolution nécessite une règle explicite future. Lancer depuis une rive stable, sans téléporter le joueur.

Appeler `cancel(reason)` (sans récompense, en nettoyant les entrées maintenues, les jauges et l'animation) si : le joueur quitte la zone, tombe/nage, change de niveau de mine, embarque, change d'île, charge une sauvegarde, revient à l'accueil, change de mode incompatible, perd le focus pendant un combat ou ferme le jeu. Tester les cas limites après `hook` et avant `grantItems`.

Les sauvegardes **ne doivent pas** persister une demi-capture pour la V1 : annuler une tentative active avant sérialisation/restauration ; ne persister que le poisson gagné via l'inventaire existant. Aucun changement de schéma de sauvegarde requis pour le MVP.

## 7. Présentation graphique et sons : recycler les assets

- Partir des `FISH_CAST`, `FISH_WAIT` et `FISH_REEL` existants, puis prévoir un loop de moulinage indépendant d'un événement unique de lancer ; synchroniser canne et corps avec tension interpolée.
- `FishingLine` : garder la ligne existante à **2 points**, décaler légèrement la pointe et animer la courbure de la canne. Ne pas ajouter une simulation de corde.
- `FishingFloat` : inclinaison/immersion et ondulations à fréquence réduite ; éclaboussures ponctuelles via effet existant, sans système de particules propre à chaque poisson.
- Réutiliser `fishing.cast`, `fishing.float`, `fishing.bite`, `fishing.reel` ; prévoir au besoin `fishing.tension` / `fishing.escape` / `fishing.catch` avec limitation du nombre d'événements sonores par seconde.
- Affichage final : courte pose avec poisson générique low-poly ou vignette d'item ; l'ID réel de capture reste la source de vérité, pas le mesh.

## 8. Plan d'intégration dans le code

| Fichier cible | Action prévue |
| --- | --- |
| `src/gameplay/fishing.ts` (**nouveau**) | Machine à états pure, RNG injecté, événements et idempotence |
| `src/gameplay/fishing-data.ts` (**nouveau**) | Poids des poissons par eau + profils de difficulté |
| `src/gameplay/gathering.ts` | Supprimer/adapter l'ancien bloc pêche après migration ; **laisser intacte** la collecte |
| `src/gameplay/game-view.ts` | Initialiser la nouvelle pêche, sans moteur d'économie parallèle |
| `src/ui/interactions/targets.ts` | Phases `reeling` + libellés contextuels + descripteur session |
| `src/main.ts` | `runFishing` / `updateFishing` deviennent un adaptateur contrôles et événements ; priorité session et annulations |
| `src/input/touch-controls.ts` | Maintien contextuel pour `Agir`, nettoyage au relâchement et à l'annulation |
| `src/ui/fishing/fishing-hud.ts` + CSS (**nouveau**) | Jauges non modales, accessibles, compatibles mobile |
| `src/hamster/hamster.ts` / `hamster-animation.ts` | Animation et interpolation de tension, sans nouvelle dépendance métier |
| `src/audio/*` | Raccordement des événements existants, nouvelles variantes seulement si utiles |
| `tests/fishing.test.mjs` (**nouveau**) et `tests/economy.test.mjs` | Tests déterministes, remplacement de l'ancienne assertion « strike = loot » |

Utiliser les conventions TypeScript/Three.js existantes ; ne pas introduire de framework de composants, animation loop, scene WebGL ou système d'input supplémentaire.

## 9. Budget et validation

**Budget de conception, à mesurer (pas un résultat constaté)** :
- Une session locale simulée par tick, sans balayage de la carte, sans allocations répétées, sans nouvelle boucle `requestAnimationFrame`.
- Réutiliser ligne et bouchon existants ; viser **0 draw call permanent ajouté hors pêche**, et au plus quelques effets visuels temporaires pendant l'activité.
- Ne pas dégrader le frame pacing sur PC 4–8 Go / GPU intégré : comparer FPS, JS heap et draw calls avec pêche inactive, pendant moulinage et en cas d'annulations successives. Les seuils finaux sont déterminés par benchmark.
- Détruire ou réutiliser toutes les ressources géométriques/DOM/écouteurs ; absence de fuite sur 100 cycles de pêche/cancel.

**Gate fonctionnel** : lancer → touche → ferrer → mouliner/relâcher → capture ; poisson cohérent avec l'habitat, une seule récompense ; échec sans reward ; HUD clair et un seul bouton tactile contextuel ; déplacements/actions incompatibles exclus pendant moulinage ; test de récupération après annulation.

**Gate automatisé** : `npm test`, `npm run typecheck`, `npm run build`, `npm run test:gameplay` et tests navigateur ciblés (PC + tactile). Ajouter tests de fuzz à graine fixe, pas fixe 30 Hz, FPS de rendu 20/30, doubles commandes et inventaire plein. Ne pas marquer « DONE » tant que les gates CI et navigateurs ne sont pas vertes.

## 10. Compatibilité Studio / îles et futur multijoueur

La V1 s'appuie sur les **habitats mer/lac/rivière existants**, pas sur une nouvelle entité persistante du Studio. Plus tard : template optionnel `FishingSpot` (ID stable, zone et habitat, éventuels multiplicateurs) éditable depuis Studio, sans scripting de carte. Les régions hors de l'île chargée ne simulent aucune pêche.

Pour le multijoueur éventuel, préserver la séparation **commande → simulation → résultat validé → présentation** et un `sessionId` unique. Le futur serveur pourra arbitrer la capture, mais **aucun réseau ni serveur n'est nécessaire** pour la bêta statique GitHub Pages.

## 11. Décisions verrouillées et points à calibrer

**Décidé** : un bouton de moulinage, relâchement pour la tension, ferrage existant, 7 espèces/3 eaux, rendu low-poly dans la scène, pas de nouvelle économie, pas de changements de sauvegarde, exécution solo statique.

**À régler par jeu-test** : tension initiale, vitesses de gain/perte, courbes de tirage, délai pour les novices, intensité de courbure de canne, position précise du HUD et sons de rupture. Ces nombres doivent être regroupés dans les données et validés par tests, non disséminés en constantes magiques.

**Suivi et ordre d'exécution** : [Roadmap du mini-jeu de pêche](FISHING-MINIGAME-ROADMAP.md).
