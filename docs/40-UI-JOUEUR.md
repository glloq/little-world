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

Les détails et l'état de chaque lot sont complétés dans les sections suivantes au fil de la campagne.
