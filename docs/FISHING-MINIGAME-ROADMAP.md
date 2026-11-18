# FISH — Roadmap d'implémentation : mini-jeu de pêche

> **Statut global : PLANIFIÉ / 0 lot implémenté par cette PR**. Base auditée : `main` du 18/11/2026. Cette branche **n'apporte que de la documentation** ; ne pas confondre tâches proposées avec fonctionnalités livrées.
>
> Source de vérité technique : [FISHING-MINIGAME-TECHNICAL-DESIGN.md](FISHING-MINIGAME-TECHNICAL-DESIGN.md).
>
> Stratégie : **petites PR verticales** à partir d'un `main` à jour, pas de développement simultané de plusieurs branches divergentes. Valider + merger un lot avant de commencer le suivant ; ré-auditer les fichiers après tout merge concurrent.

## 1. Découpage et dépendances

`FISH-0 → FISH-1 → FISH-2 → FISH-3 → FISH-4` forment le **MVP jouable**, puis `FISH-5` (polish), `FISH-6` (qualification) et `FISH-7` (extensions futures). Les tests métier de FISH-1 et les tests de simulation de FISH-2 sont indispensables avant de toucher aux animations.

| Lot | Priorité | Statut initial | Objectif / livrable | Dépendances | Gate de sortie |
| --- | --- | --- | --- | --- | --- |
| **FISH-0 — Baseline** | P0 | TODO | Vérifier comportement réel de la pêche et scripts existants ; figer tests et captures de référence PC/mobile, perf idle | — | Baseline datée, `npm test` / `typecheck` / `build` et navigateur ; anomalies existantes consignées |
| **FISH-1 — Contrat métier** | P0 | TODO | Extraire `createFishing` vers `fishing.ts` et `fishing-data.ts` ; phases, `sessionId`, événements typés, RNG injecté ; adaptateur de compatibilité | FISH-0 | Tests unitaires des transitions/annulations, **aucune récompense au hook** ; collecte inchangée |
| **FISH-2 — Combat tension** | P0 | TODO | `step(dt, reelHeld)`, patterns par poisson, progression, rupture, succès, anti-double-award | FISH-1 | Simulations reproductibles 30 Hz, captures réalisables pour 7 espèces, échec et cancel sans loot |
| **FISH-3 — Interaction et inputs** | P0 | TODO | Intégration `main.ts` / `game-view.ts`, cible prioritaire, `KeyE` maintenue, bouton tactile maintenu, HUD compact | FISH-2 | Test PC + mobile : un geste, aucun conflit `E/F` / bateau / boutique / menu, annulation sans touche bloquée |
| **FISH-4 — Intégration économique** | P0 | TODO | Validation canne/eau/état joueur, récompense via `grantItems`, inventaire plein, save/restore/île | FISH-3 | Une prise = un item exactement ; pas de duplication, ni récompense après interruption ; espèces cohérentes |
| **FISH-5 — Polish 3D et audio** | P1 | TODO | Courbure de canne, feedback bouchon, ligne, bruitages contextualisés et capture légère | FISH-4 | Canne/ligne/bouchon restent cohérents ; pas de nouvelles ressources permanentes ou bruitages spammés |
| **FISH-6 — Perf, CI et qualification** | P0 avant merge final | TODO | Tests d'endurance, 20/30 FPS, GPU intégré, accessibilité, nettoyage ; mise à jour docs d'état | FISH-5 | Aucun échec des suites affectées, mesures comparatives, validation manuel PC/tactile |
| **FISH-7 — Extensions** | P2/P3 | BACKLOG | Qualité/poids, cannes, météo, nouveaux biomes, quêtes, zones Studio | FISH-6 | Une extension à la fois, contrat et migration explicitement justifiés |

**Interdits de progression** : ne pas commencer FISH-3 sans simulation de FISH-2 testée ; ne pas augmenter les espèces ou l'économie avant d'avoir validé un parcours complet ; ne pas marquer FISH-6 terminé sur une simple compilation TypeScript.

## 2. Backlog d'exécution concret

### FISH-0 : constater et enregistrer

- [ ] Examiner `src/gameplay/gathering.ts` (pêche seulement), `game-view.ts`, `main.ts`, `targets.ts`, `touch-controls.ts`, `hamster.ts` et `economy.ts` à la **révision de la branche d'exécution**.
- [ ] Vérifier le mode `ground`, la portée de `fishingSpot()` et le choix des trois habitats.
- [ ] Mesurer état actuel de la ligne, du bouchon, des animations et du son.
- [ ] Exécuter tests et build ; enregistrer version/commit des résultats. Ne pas masquer d'éventuels échecs préexistants.
- [ ] Reprendre les conventions `AGENTS.md` sans éditer ce fichier en parallèle d'autres chantiers.

### FISH-1 : noyau sans DOM ni Three.js

- [ ] Créer `fishing-data.ts` avec les 7 IDs existants, les poids mer/rivière/lac et les profils de difficulté.
- [ ] Créer `fishing.ts` avec `idle/waiting/bite/reeling/landed/escaped`, événements et commande `cancel`.
- [ ] Sélectionner une seule espèce au ferrage valide, non à la récompense finale.
- [ ] Ajouter un compteur de tentative/graine pour les patterns, injecter RNG dans les tests.
- [ ] Garder les exports consommateurs ou migrer atomiquement et adapter `tests/economy.test.mjs`.
- [ ] Vérifier que les autres fonctions de `gathering.ts` sont inchangées.

### FISH-2 : jeu de tension

- [ ] Implémenter la mise à jour basée sur `dt` du simulateur, avec bornes et valeurs finies.
- [ ] Ajouter tension, progression, pattern calme/accélération/tirage et profils distincts.
- [ ] Tester victoire, rupture, abandon, maintien constant, relâchement permanent, alternance et grands pas temporels bornés.
- [ ] Tester que toute espèce a une trajectoire de réussite raisonnable ; paramétrer les durées (pas de « victoire impossible »).
- [ ] Déclencher `landed` exactement une fois, sans accès à l'inventaire depuis le noyau.

### FISH-3 : UX réellement jouable

- [ ] Ajouter une cible `fishing` prioritaire **lorsque la session est déjà en cours**.
- [ ] Intercepter les appuis d'`E` en `waiting/bite` ; en `reeling`, exploiter le maintien de `KeyE` ; annuler à la perte de focus.
- [ ] Étendre `TouchControls` avec `interactHeld` sans casser `action()` au premier appui.
- [ ] Pointer capture, relâchement sur `pointerup/cancel/lostpointercapture`, fermeture UI, masquage tactile et focus perdu.
- [ ] Afficher HUD non modal « Capture / Tension » avec zones de danger, texte accessible, tailles mobiles.
- [ ] Ne pas laisser les actions `F` (mine/cueillette), `E` (commerce/navette), saut/boost ni la rotation du personnage déclencher un autre acte en `reeling` ; caméra toujours contrôlable.
- [ ] Vérifier clavier AZERTY/QWERTY, PC souris, tactile paysage et retour portrait.

### FISH-4 : intégration monde/inventaire

- [ ] Valider canne obligatoire, rayon vers l'eau, mer/lac/rivière ; refuser pêche à bord, dans les mines ou en nage.
- [ ] Implémenter résultat unique via `gameplay.runtime.grantItems`, avec échec explicite si sac plein.
- [ ] Un succès en mer ne peut attribuer truite/carpe ; un succès en rivière ne peut donner sardine ; conserver poisson doré rare.
- [ ] Relever/cancel après mouvement, arrivée navette/changement d'île, sauvegarde/restauration, accueil, modal, remise à zéro.
- [ ] Ne sauvegarder **aucun état de combat** ; une prise déjà ajoutée continue de suivre la sauvegarde/inventaire du jeu.
- [ ] Essai avec comptoir du port et vente des prises sans nouvelle monnaie ni stockage.
- [ ] Rendre l'état métier indépendant du HUD et des animations.

### FISH-5 : rendu et sons

- [ ] Réutiliser `FISH_CAST / FISH_WAIT / FISH_REEL` ; gérer moulinage maintenu et inclinaison du hamster.
- [ ] Courber la canne visuellement selon tension ; ne pas introduire de simulation de corde.
- [ ] Garder `FishingLine` et `FishingFloat` existants ; animation de plongée/ondulations et éclaboussures bornées.
- [ ] Conserver événements `fishing.cast / float / bite / reel` ; ajouter « tension/capture/rupture » si besoin.
- [ ] Tester interruption pendant chaque animation, changement de caméra et fin d'action.

### FISH-6 : validation et fermeture

- [ ] Tests unitaires déterministes dans `tests/fishing.test.mjs` + adaptation de `tests/economy.test.mjs`.
- [ ] Tests navigateur ciblés dans le parcours `npm run test:gameplay` (ou test dédié intégré aux scripts).
- [ ] `npm test`, `npm run typecheck`, `npm run build`, `npm run test:gameplay`.
- [ ] Tester 100 cycles cast/cancel/catch sur 20/30 FPS de rendu ; comparer mémoire/GC/draw calls aux références FISH-0.
- [ ] Qualification manuelle PC à faibles ressources et smartphone : lisibilité, ergonomie, aucune touche/bouton coincé.
- [ ] Mettre à jour README/roadmap et marquer les lots réellement livrés uniquement **après** CI et vérification navigateur.

## 3. Matrice de tests à conserver

| ID | Scénario | Attendu |
| --- | --- | --- |
| FISH-T01 | Lancer sans canne / sans eau / dans mine / en nage / à bord | Refus sans changement inventaire |
| FISH-T02 | Lancer / relever avant touche | Retour `idle`, aucun item |
| FISH-T03 | Ferrer trop tôt / 1,3 s écoulée | Échec, aucun item |
| FISH-T04 | Ferrer correctement | `reeling`, inventaire inchangé |
| FISH-T05 | Maintenir puis relâcher | Progression/tension réagissent à `dt`, relaxation effective |
| FISH-T06 | Rompre tension | `escaped`, zéro loot |
| FISH-T07 | Gagner avec 7 espèces et graine fixée | Résultat atteint et espèce compatible avec eau |
| FISH-T08 | Répéter transition de fin / double appui `E` | Attribution exactement **une** fois |
| FISH-T09 | Inventaire plein | Message clair, aucune duplication |
| FISH-T10 | Cible bateau/comptoir/PNJ proche pendant combat | `E` reste réservée au mini-jeu |
| FISH-T11 | Maintien tactile, `pointercancel`, `blur`, rotation téléphone | Maintien annulé, pas de moulinage fantôme |
| FISH-T12 | `Escape`, menu, changement d'île, retour accueil, rechargement | Annulation sûre, nettoyage UI et canne |
| FISH-T13 | Rendu 20 FPS / 30 FPS, même simulation 30 Hz et graine | Même résultat métier à commandes/ticks identiques |
| FISH-T14 | 100 cycles successifs | Pas de fuite d'écouteurs/meshes, pas de gain en double |

## 4. Conditions de livraison du MVP

Le MVP est accepté **uniquement si** :

1. Un joueur peut acheter/posséder une canne, trouver mer/lac/rivière, lancer, ferrer, mouliner/relâcher et capturer sur **PC et mobile** sans nouveau bouton permanent.
2. Le HUD reste compact ; les animations/sounds existants restent fonctionnels ; les autres activités (mine, récolte, bateau, boutique, navette) ne régressent pas.
3. Les tests FISH-T01 à FISH-T14 sont verts, avec inventaire atomique et absence de gain hors capture.
4. Le jeu reste **statique sur GitHub Pages** (pas de serveur), qualité low-poly et coûts CPU/GPU comparés à baseline.
5. Le statut `DONE` et les captures/perfs de validation sont consignés **avec le commit de test**.

## 5. Pilotage et suivi

À chaque lot, noter ici une ligne de progression : **ID / statut (TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED) / branche+PR / SHA validé / tests+résultats / points restants**. Statut initial ci-dessous :

| ID | Statut | PR | Validation | Reste |
| --- | --- | --- | --- | --- |
| FISH-0 | TODO | — | — | Baseline |
| FISH-1 | TODO | — | — | Moteur pur |
| FISH-2 | TODO | — | — | Tension |
| FISH-3 | TODO | — | — | Contrôles et HUD |
| FISH-4 | TODO | — | — | Monde et inventaire |
| FISH-5 | TODO | — | — | Effets |
| FISH-6 | TODO | — | — | Tests finaux |
| FISH-7 | BACKLOG | — | — | Évolutions optionnelles |

### Ordre recommandé pour démarrer

**Premier sprint : FISH-0 + FISH-1 + FISH-2**, sans modifier la 3D. Il livre un cœur métier testé, et garantit que la nouvelle mécanique ne produit pas de récompenses prématurées. **Deuxième sprint : FISH-3 + FISH-4**, pour obtenir la boucle complète. **Troisième sprint : FISH-5 + FISH-6**, pour la qualité visuelle et la qualification.

**Ne pas merger cette seule documentation en prétendant livrer la pêche V1**. Son unique livrable est un plan actionnable.
