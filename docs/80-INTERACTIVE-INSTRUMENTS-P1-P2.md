# Instruments interactifs — phases 1 et 2 (prototype de validation)

État : **implémentation sur `feat/interactive-instruments-p1-p2`**, à qualifier par CI et essais réels sur PC/mobile. Pas de modèles 3D ni d'animations instrumentales dans cette livraison (phase 3).

## Périmètre jouable

Trois objets équipables sont ajoutés dans le sac de départ, uniquement pour faciliter l'essai :
- `instrument:flute` : synthèse flûte douce existante ;
- `instrument:ocarina` : patch sinusoïdal avec attaque douce ;
- `instrument:ukulele` : patch de cordes pincées courte décroissance.

L'instrument se choisit **uniquement depuis le sac** : `I → Équipements → sélectionner l’instrument → Jouer` équipe et ouvre le clavier en une action. `Équiper` seul garde l’instrument en main sans ouvrir le clavier. Il n'existe aucun sélecteur de timbre dans le panneau musical.

Panneau :
- grille de 3 × 5 boutons (15 notes diatoniques, Do4 à Do6) ;
- clavier de piano chromatique secondaire, 15 touches blanches et 10 noires ;
- transposition −1, normale, +1 octave ;
- accords possibles par maintien simultané de touches au clavier ou en multitouch ;
- préférence grille/piano conservée dans le navigateur, indépendante de la sauvegarde.

Raccourcis **positions physiques** (KeyboardEvent.code, compatibles AZERTY/QWERTY), groupés par rangées : `Digit1…Digit5`, `KeyQ…KeyT`, `KeyA…KeyG` pour les 15 touches blanches. En mode piano, touches noires supplémentaires `Digit6…Digit0`, `KeyH`, `KeyJ`, `KeyK`, `KeyL`, `Semicolon`. Les touches ne commandent pas le déplacement pendant l'ouverture du panneau. `P` ouvre/ferme le clavier si un instrument est équipé, `Échap` le ferme, et un bouton contextuel « Jouer » apparaît dans le HUD. Le raccourci `P` musical a priorité sur la téléportation vers le port de l’ancien terrain de test tant qu’un instrument est équipé. L’ouverture est refusée hors du sol, pendant une course ou un dialogue.

## Contrats de code

- `src/instruments/definitions.ts` : correspondance ID d'objet → patch sonore + futur modèle/pose.
- `src/gameplay/game-view.ts` : emplacement d'équipement `hands`, contrôlé par la possession réelle et la catégorie de l'objet. L'équipement ne modifie pas les quantités.
- `src/gameplay/save.ts` : champ V2 optionnel `equippedItemId`, compatible V1/V2 historiques.
- `src/archipelago/transit.ts` : l'identifiant équipé suit le joueur sur le ferry, facultatif pour les anciens transferts.
- `src/audio/engine.ts` : `instrumentNoteOn`, `instrumentNoteOff`, `instrumentAllNotesOff`; même `AudioContext`, mêmes budgets. Les notes jouées ont priorité 9, les partitions 2.
- `src/ui/instruments/` : clavier, prise en charge souris/tactile/clavier, libération au relâchement ou à la fermeture.

Les notes sont relâchées au changement d'interface, à la perte de focus, à la suspension de l'onglet, au mute et à la fermeture du panneau. Aucune note ou flux audio n'est enregistré dans la sauvegarde.

## Performances

Budget existant inchangé : 12/16/24 voix au total, dont 6/8/12 musicales selon la qualité. Un accord utilisateur peut préempter des voix musicales d'ambiance moins prioritaires, mais ne peut pas dépasser le plafond global.

Les 3 instruments reposent sur des oscillateurs Web Audio et des enveloppes ; **pas de SoundFont, de fichier MIDI supplémentaire ni d'AudioContext additionnel**. La latence, le CPU et les FPS restent à mesurer sur GPU intégré et sur mobile.

## Phase 3 — préparation 3D

Ne **pas** intégrer toutes les géométries dans le maillage partagé du hamster. Préparer des modèles 3D low-poly chargés seulement pour l'instrument équipé et fixés aux sockets des mains. `modelId` et `poseId` sont déjà dans les définitions :
- flute/ocarina → `MUSIC_WIND` (deux mains vers le museau) ;
- ukulele → `MUSIC_STRUM` (contre le ventre, main qui gratte les cordes).

L'implémentation 3D doit respecter la pose assise/debout, la roulade, le planeur et les interactions existantes. Aucune affirmation de rendu 3D dans les phases 1/2.

## Validation avant merge

1. `npm run typecheck`, `npm test`, `npm run build`.
2. `npm run test:instruments` (test navigateur du parcours sac V3 → jouer, ouverture HUD, raccourci P, clavier, notes) ; compléter par `npm run test:ui` et `npm run test:audio`.
3. Sauvegarder/recharger après équipement, voyager entre deux îles et vérifier la conservation de l'objet et de l'équipement.
4. Enchaîner 200 pressions/relâchements clavier, multitouch, changements d'octave, blur et fermeture de panneau : **0 note bloquée**.
5. Mesurer la latence et la stabilité des FPS sur matériel de référence 4–8 Go de RAM.
6. Vérifier à l'écoute la distinction entre flûte, ocarina et ukulélé (les patches restent de simples approximations synthétiques).
