# 40 — UI-JOUEUR : interface de jeu (audit, contrats, architecture, état)

**Base : `main` = `d1e97c9` (PR #10 PHYS/WATER/MINE/AGRI et PR #11/#12 Audio V2 fusionnées).**
**Branche de travail : `claude/bold-tesla-b0pe7k`, recalée en avance rapide sur `main`.**

Statuts utilisés : `SPECIFIED → IMPLEMENTED → TESTED → BENCHMARKED → RELEASED` (« RELEASED » = fusionné dans `main` et publié).

## 1. Audit de l'interface existante (avant la campagne)

| Élément | Existant (code réel) | Constat |
| --- | --- | --- |
| En-tête | marque, sélecteur de qualité `#quality`, liens Studio / éditeur | liens de développement dans l'interface joueur |
| Aide | panneau `hud-help` permanent (commandes) | occupe la vue en permanence |
| Statistiques | `hud-stats` : état, coordonnées, oxygène, FPS, appels de dessin | informations techniques visibles du joueur |
| Invite | `#action` : texte « [E] … » des objets interactifs, PNJ, bateau, mine (F), parcelle (F/C) | trois sources concaténées dans `main.ts` ; aucun motif d'impossibilité |
| Messages | `#message` : un seul toast de 3,3 s (`showInfo`) | pas de file, de priorités ni de regroupement |
| Sac et parties | `game-view` : panneau modal mêlant inventaire, missions et 3 slots (sauvegarder, charger, exporter, importer, export de la partie en cours) | inventaire en liste brute, pas de catégories, sans confirmation d'écrasement |
| Dialogue PNJ | `npc-view` : nom, réplique, choix, fermeture, piège de focus | les choix non autorisés sont masqués (non affichés désactivés) ; aucune indication de mission |
| Heure et météo | `environment/view` : volet repliable (heure, météo, vitesse du monde) | outil de test bêta, utile en développement |
| Son | `audio/view` : volet « Son » (sourdine, 4 volumes persistés) | panneau isolé, sans menu de paramètres |
| Apparence | maintenir `A` : accessoires et émotions | conservé tel quel |
| Clavier | ZQSD/WASD/flèches, Espace, Ctrl, Shift, `A` (maintenir), `E`, `F`, `C`, `R`, `P` ; Échap ferme le dialogue | `I`, `J`, `M`, `Tab` libres ; aucun menu pause |
| Carte | aucune dans le jeu (carte 2D du Studio seulement) | — |
| Journal | aucune vue dédiée (objectifs listés dans le sac) | — |
| Mine / parcelle | invites F/C et messages ; état visible seulement via les métriques de test | aucun inspecteur |
| Effets de verre | `backdrop-filter: blur` sur les panneaux | coût GPU inutile |

Systèmes métier réutilisés sans duplication :
- runtime gameplay : inventaire validé, objectifs, interactions, dialogues, `grantItems` ;
- runtime d'activités : `mineTarget`, `dig`, `farmIntent`, `farmAct`, `cycleCrop`, `farmView` ;
- slots `createGameSaveStore` (V2) ;
- `AudioEngine.settings` / `setLevels` (préférences audio déjà persistées) ;
- événements `ui.*` du catalogue Audio V2.

## 2. Séparation des états

1. **État du gameplay** : runtime gameplay et runtime d'activités. Seule source de vérité.
2. **État temporaire de l'interface** (`src/ui/app`) : panneau ouvert, focus, nouveautés vues, découvertes de la session, file de notifications. Jamais sauvegardé dans la partie.
3. **Commandes** : l'interface appelle les méthodes métier existantes (`interact`, `dig`, `farmAct`, `dialogueChoice`, `slots.save`…), qui valident tout.
4. **Sauvegardes du joueur** : schéma `GameSaveV2` inchangé.
5. **Sources auteur** : jamais touchées par le jeu ni par « Jouer ici ».

Préférences d'interface : clé locale séparée `little-world:ui-preferences:v1` (sensibilité, inversion, animations réduites, mode développeur). Elles ne vont jamais dans les sauvegardes ni dans les projets.

## 3. Contrats de présentation (modèles de vue, jamais une seconde source de vérité)

- `TargetDescriptor`
  - champs : `targetId`, `targetType`, `displayName`, `primaryAction`, `availableActions`, `disabledReason`, `interactionRange`, `contextData` ;
  - fourni par des adaptateurs sur les systèmes métier ; les préconditions (creusable, mûr, déjà utilisé…) sont évaluées par ces systèmes, y compris par un essai à blanc sans écriture.
- `InventoryViewModel` : objets du registre et quantités, catégorie issue du champ métier `category`, capacité `maxQuantity`, nouveautés.
- `DialogueViewModel` : nom, réplique, choix disponibles et non disponibles.
- `QuestViewModel` : objectifs et activités avec leurs états.
- `MapViewModel` : raster de relief calculé une fois, position et cap du joueur, marqueurs (mines, parcelles, PNJ, objets d'objectifs actifs).
- `MiningViewModel` / `FarmingViewModel` : cible, matière, niveau, passages ; culture, stade, croissance, humidité, actions.
- `SaveSlotViewModel` : slot, date, version, erreur.


## 4. Architecture (`src/ui/`)

| Module | Rôle |
| --- | --- |
| `app/ui-controller.ts` | `UiController` : un seul panneau ouvert, modes d'entrée (`blocking` bloque déplacement et caméra, `paused` suspend la simulation), Échap, piège de Tab, retour du focus, confirmations internes (`alertdialog`, focus sur « Annuler »). |
| `app/game-ui.ts` | `createGameUi` : assemble HUD, panneaux et notifications à partir des API métier ; rafraîchissement HUD limité à 4 Hz et réécriture du DOM seulement si le contenu change. |
| `app/preferences.ts` | préférences joueur (clé `little-world:ui-preferences:v1`), lecture tolérante aux données corrompues, échec d'écriture signalé. |
| `interactions/targets.ts` | contrat `TargetDescriptor`, constructeurs purs par type de cible, `promptText`. |
| `notifications/notifications.ts` | `NotificationQueue` (pure) + rendu : fusion des gains par objet, priorités, 3 éléments max, bannière de mission séparée, `#message` conservé comme région live. |
| `inventory/inventory.ts` | Sac : catégories issues du champ métier `category`, quantités/capacité, nouveautés, détail, outil en main (état d'interface). |
| `journal/journal.ts` | Journal : missions en cours / terminées / à découvrir, détection des changements pour la bannière. |
| `map/map.ts` | Carte 2D : raster calculé progressivement (≤ 6 ms par image, au moins une ligne) avec `height`/`water` existants, mis en cache ; zoom/déplacement souris et clavier ; marqueurs mines, parcelles, habitants, missions actives. |
| `saves/saves.ts` | Parties : 3 emplacements `createGameSaveStore`, date, progression, version, slot illisible, confirmations, import/export. |
| `settings/settings.ts` | Paramètres : qualité (sélecteur existant), animations réduites, mode développeur, sensibilité/inversion caméra, rappel des touches, panneau audio existant ré-hébergé. |
| `menus/pause.ts` | Menu : Reprendre, Parties, Sac, Journal, Carte, Paramètres, Retour à l'accueil, lien Studio. |
| `activities/activity-card.ts` | Carte d'activité mine (niveau, sortie et distance, paroi visée et ressource ou raison) et parcelle (culture, stade, croissance, humidité, action, choix de culture). |

Aucun framework ajouté : DOM natif + CSS (`ui.css`), sans flou ni verre, contraste ≥ 4,5:1 sur les fonds de panneau.

## 5. Commandes clavier et souris

Touches existantes conservées sans réaffectation silencieuse : déplacement ZQSD/WASD/flèches, Espace, Ctrl, Shift, `A` maintenu (accessoires/émotions), `E`, `F`, `C`, `R`, clic-glissé caméra. Ajouts sur des touches libres : `I` Sac, `J` Journal, `M` Carte, `Échap` (ferme le panneau ou le dialogue, sinon ouvre le Menu). Les touches d'interface sont ignorées pendant un dialogue PNJ ou la personnalisation. La sensibilité et l'inversion verticale s'appliquent au clic-glissé existant. Réaffectation des touches : **non disponible** (indiqué dans Paramètres).

## 6. Lots et état

| Lot | Contenu | État |
| --- | --- | --- |
| UI-0 | audit, contrats, séparation des états (ce document) | IMPLEMENTED |
| UI-1 | noyau `UiController`, HUD minimal, invite contextuelle, notifications | TESTED |
| UI-2 | Sac (catégories, quantités, détail, nouveautés, vide) | TESTED |
| UI-3 | dialogues PNJ (choix verrouillés affichés désactivés, étiquette mission/objet), Journal | TESTED |
| UI-4 | Carte 2D légère | TESTED (fonctionnel) ; coût mesuré en SwiftShader seulement |
| UI-5 | Menu pause, Paramètres (préférences, audio existant) | TESTED |
| UI-6 | Parties (confirmations, erreurs, import/export, slot corrompu) | TESTED |
| UI-7 | inspecteurs mine/parcelle, tests de parcours, petite résolution, documentation | TESTED |

« BENCHMARKED » n'est revendiqué pour aucun lot : les mesures ci-dessous viennent de Chromium/SwiftShader (régression), pas d'un GPU intégré de référence. « RELEASED » seulement après fusion dans `main`.

## 7. Règles respectées

- L'interface n'écrit jamais l'état métier : ramasser/parler/creuser/cultiver passent par `interact`, `dialogueChoice`, `dig`, `farmAct`, `selectCrop` ; la faisabilité affichée vient des mêmes validateurs (`MineState.check` sans écriture, `farmPreview` sur une copie de l'état).
- « Partie sauvegardée » n'est affiché qu'après résolution du stockage ; un chargement restauré ne rejoue ni gains ni bannières de mission.
- Aucun second mixeur : la section Son est le panneau `audio/view` existant (volumes persistés par `AudioEngine`). Préférences jamais écrites dans les sauvegardes ni dans les projets auteur.
- « Jouer ici » (Studio) charge le même `main.ts`, donc la même interface ; ses emplacements restent temporaires et séparés des vraies parties.
- Les « lieux visités » de la carte sont un état de session : aucun contrat de sauvegarde ne stocke les découvertes, rien n'est persisté.
- Mode développeur : les statistiques (`hud-stats`), la vitesse du monde et le panneau audio brut ne sont visibles qu'avec la préférence ou `?metrics` / `?dev`.

## 7 bis. Coût mesuré (Chromium + SwiftShader, 1280 × 800, monde bêta)

Sonde : `MutationObserver` sur `#ui-root` pendant 5 s (`window.littleWorldMetrics.frameId` pour le nombre d'images).

| Scénario | Mutations DOM de l'interface | Images rendues |
| --- | --- | --- |
| Joueur immobile, aucun panneau | 0 | 43 |
| Marche en diagonale 5 s (invite et cartes d'activité réévaluées à 4 Hz) | 8 | 50 |

Carte : raster 256 px calculé progressivement (≤ 6 ms par image) ; première ouverture complète en 836 ms, réouverture 103 ms (raster en cache). Aucune seconde scène Three.js, aucun appel au générateur de monde. Ces chiffres servent de garde-fou de régression, pas de performance garantie sur GPU intégré.

## 8. Accessibilité

Focus visible (contour 3 px ambré), focus déplacé dans le panneau ouvert et restitué à la fermeture, Tab piégé dans le panneau ou la confirmation, Échap annule une confirmation sans fermer le panneau. Jauges avec texte et `role=meter` (jamais la couleur seule), invite désactivée accompagnée de sa raison, étiquettes « mission »/« objet » des choix de dialogue doublées d'une `aria-description`. Option « Réduire les animations » et respect de `prefers-reduced-motion`. Mise en page jusqu'à 720 × 540 vérifiée (raccourcis réduits à la touche sous 760 px).

## 9. Tests

- Unitaires (`tests/ui.test.mjs`) : file de notifications (fusion, priorités, expiration), descripteurs de cible et invites, modèle du Sac (catégories, plein, nouveautés, identifiants inconnus), Journal, emplacements (progression, version, slot illisible), préférences (bornes, corruption, échec de stockage), cartes d'activité, raster de carte (progression garantie, un échantillon par pixel).
- Navigateur `tools/test-ui-browser.mjs` (`npm run test:ui`, CI « Player interface browser checks ») : parcours complet sur le monde bêta — voir la liste des vérifications dans le fichier.
- Tests existants migrés vers les nouveaux écrans via `tools/ui-test-helpers.mjs` : `gameplay` (dont « Jouer ici » depuis le Studio et retour avec historique intact), `environment`, `b1` (mine, parcelle, cartes d'activité, sauvegarde/rechargement), `legacy` (un `Échap` qui ferme un dialogue n'ouvre pas aussi le Menu).
- `studio` : attente explicite de la mise à jour de l'inspecteur après Annuler/Refaire (la lecture immédiate du champ était une course, observée aussi sur la base `d1e97c9`).

## 10. Limites connues

- Pas de réaffectation des touches ni de manette.
- Carte : relief simplifié (≤ 256 px de côté), pas de brouillard de découverte persistant faute de contrat de sauvegarde ; marqueurs PNJ à leur position courante.
- Inventaire : aucune action « utiliser / jeter » tant qu'aucune action métier correspondante n'existe ; l'outil « en main » est un état d'interface.
- Journal : textes de missions limités aux champs `name`/`description` existants (descriptions optionnelles ajoutées au schéma, validées, non encore saisissables dans le Studio).
- Les coûts annoncés sont des mesures SwiftShader ; aucune cible FPS sur GPU intégré n'est revendiquée.

## 11. Captures

Produites par `npm run test:ui` dans `/tmp/little-world-browser/` : `ui-hud.png` (invite contextuelle), `ui-sac.png`, `ui-dialogue.png`, `ui-carte.png`, `ui-pause.png`, `ui-parametres.png`, `ui-parties.png`, `ui-petit-ecran.png` (720 × 540). Le test B1 produit en plus `b1-level3.png` (carte d'activité de mine). En CI, elles sont publiées avec l'artefact `browser-artifacts` du workflow « Validate Little World » (non versionnées dans le dépôt).
