# FISH — Roadmap d'implémentation : mini-jeu de pêche

> **Statut global : IMPLÉMENTATION EN COURS sur `docs/fishing-minigame-v1-roadmap` (PR #77), NON QUALIFIÉE**. Audit basé sur `main` du 18/11/2026. Le noyau, le HUD et le raccordement PC/mobile sont maintenant codés, mais les tests navigateur ciblant la boucle complète, le polish 3D et la qualification bas de gamme restent à terminer.
>
> Source de vérité technique : [FISHING-MINIGAME-TECHNICAL-DESIGN.md](FISHING-MINIGAME-TECHNICAL-DESIGN.md).
>
> Stratégie : cette première implémentation reste sur la **branche explicitement demandée** et dans la PR #77. Pour les évolutions après cette PR, découper en petits lots, repartir d'un `main` à jour, éviter les branches divergentes et requalifier après tout merge concurrent.

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

- [x] Réutiliser `FISH_CAST / FISH_WAIT / FISH_REEL` ; répéter le moulinage maintenu avec un intervalle borné. L'inclinaison spécifique du rig reste à affiner sans invalider les imposteurs.
- [x] Ajouter une ligne souple de 5 points en superposition uniquement pendant le combat, avec flèche liée à la tension ; aucune simulation physique. La vraie déformation du mesh de la canne reste différée.
- [x] Garder `FishingLine` et `FishingFloat` existants ; 3 anneaux d'ondulation mutualisés, écume/éclaboussures via le pool d'impacts déjà présent, bouche du bouchon animée et petit poisson 3D temporaire à la capture.
- [x] Conserver `fishing.cast / float / bite / reel` ; compléter le catalogue **à l'exécution seulement** par trois sons procéduraux originaux `fishing.strain / fishing.catch / fishing.escape` via le moteur audio V2 (mixeur et budgets communs).
- [ ] Vérifier en navigateur PC/mobile la lisibilité de la ligne et du poisson, les interruptions, la caméra et le mixage sonore (reporté à FISH-6 selon la séquence demandée).

### FISH-6 : validation et fermeture

- [x] Tests unitaires déterministes dans `tests/fishing.test.mjs` + adaptation de `tests/economy.test.mjs`.
- [x] Parcours Chromium dédié avec `npm run test:fishing`, sur clavier et tactile émulé. Le test couvre le lancer, le relevage anticipé, le ferrage, le relâchement et le crédit d’un seul poisson. Il est inclus dans le workflow de validation.
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

## Avancement constaté — 18 novembre 2026

- Les **698 tests unitaires** de GitHub Actions ont réussi sur le code de pêche ; `check:impostors`, `check:world-assets` et `npm run build` ont ensuite réussi après suppression de la modification du source hamster incluse dans l'empreinte d'atlas.
- Parcours navigateur généraux du démarrage, gameplay/sauvegardes, Studio et interface : progression des vérifications sur le run [Validate Little World #44352207315](https://github.com/glloq/little-world/actions/runs/44352207315).
- **Ne pas considérer FISH-3 et FISH-4 qualifiés** sans essai automatisé de la séquence lancer → ferrer → mouliner/relâcher → capture sur PC **et** tactile. Les tests historiques du hamster vérifient seulement la canne et la ligne lors du lancer.
- Une modification de `src/hamster/hamster.ts` invalide actuellement le hash de l'atlas `characters`. L'amélioration visuelle FISH-5 devra soit régénérer les impostors, soit utiliser une couche de présentation isolée sans modifier la source prise en compte par l'outil.

## FISH-5 — Finitions visuelles et sonores codées (qualification artistique à faire)

- `src/render/fishing-effects.ts` : 3 anneaux de surface recyclés, une ligne de pêche courbée (5 points) affichée seulement pendant `reeling`, mouvement léger du bouchon et un poisson low-poly éphémère affiché uniquement en cas de capture validée. Le maillage du hamster et l'empreinte du générateur d'imposteurs restent **inchangés**.
- Réutilisation du pool `createImpactEffects` pour les éclaboussures (touche, rupture, capture) ; aucune nouvelle boucle ni simulation de corde. Prévoir une mesure réelle des appels de rendu.
- `src/gameplay/fishing-audio.ts` : trois événements `fishing.strain`, `fishing.catch`, `fishing.escape` produits par les outils procéduraux de l'AudioEngine V2, sans modifier le catalogue généré, avec limites de voix et cooldown.
- `src/main.ts` : séquence sonore du flotteur pilotée par l'horloge du jeu plutôt qu'un `setTimeout` non annulable, moulinage intermittent synchronisé aux actions `FISH_REEL` et aux événements existants, tension sonore une seule fois au passage de seuil.
- `src/ui/fishing/fishing-hud.ts` : nom de l'espèce et indication de danger lisible ; `tests/fishing-polish.test.mjs` : catalogue audio et ressources visuelles réutilisées.
- **À qualifier en FISH-6** : comportement des sons dans le jeu, faible FPS, style visuel final, taille/position de l'affichage du poisson, accessibilité tactile et tests navigateur complets.

## 5. Pilotage et suivi

À chaque lot, noter ici une ligne de progression : **ID / statut (TODO, IN_PROGRESS, REVIEW, DONE, BLOCKED) / branche+PR / SHA validé / tests+résultats / points restants**. Statut initial ci-dessous :

| ID | Statut | PR | Validation | Reste |
| --- | --- | --- | --- | --- |
| FISH-0 | REVIEW | #77 | Audit source et CI unitaire/compilation ; captures/perfs initiales absentes | Baseline navigateur/performance |
| FISH-1 | REVIEW | #77 | `fishing.ts` / `fishing-data.ts`, tests unitaires passés | Contrôles de non-régression finale |
| FISH-2 | REVIEW | #77 | Tests de tension/rupture et 7 espèces passés | Calibrage artistique et gameplay |
| FISH-3 | REVIEW | #77 | `main.ts`, `touch-controls.ts`, HUD compact, build réussi | Test navigateur de moulinage PC/tactile |
| FISH-4 | REVIEW | #77 | `grantItems` uniquement en fin de combat ; test unitaires | Scénarios de navigation, save et inventaire plein en navigateur |
| FISH-5 | IN_PROGRESS | #77 | Rendu et audio implémentés ; tests unitaires/CI de la révision finale attendus | Validation artistique des sons, effet canne et PC/mobile |
| FISH-6 | IN_PROGRESS | — | Parcours clavier et tactile émulé dans Chromium | CI complète, qualification matérielle et benchmark 4–8 Go |
| FISH-7 | BACKLOG | — | — | Évolutions optionnelles |

### Ordre recommandé pour démarrer

**Premier sprint : FISH-0 + FISH-1 + FISH-2**, sans modifier la 3D. Il livre un cœur métier testé, et garantit que la nouvelle mécanique ne produit pas de récompenses prématurées. **Deuxième sprint : FISH-3 + FISH-4**, pour obtenir la boucle complète. **Troisième sprint : FISH-5 + FISH-6**, pour la qualité visuelle et la qualification.

**Cette PR #77 contient désormais du code MVP et les premières finitions FISH-5.** Ne pas la présenter comme totalement qualifiée : Le parcours complet est testé en Chromium sur clavier et tactile émulé depuis la branche d’expansion. La qualification matérielle FISH-6 reste ouverte.
