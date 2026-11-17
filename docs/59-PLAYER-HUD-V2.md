# 59 — Interface joueur V2 : HUD, audio et navigation

Branche de travail : `feat/player-hud-redesign`. Cette itération ne fusionne rien dans `main`.

## Objectifs
- Aucune information technique permanente dans le jeu normal : le monde 3D reste visible.
- HUD haut gauche : menu (Échap), bourse (🪙 + montant provenant de `inventory[COIN]`).
- HUD haut droit : météo (☀️/☁️/🌧️) et heure fictive depuis `climate.state(clock.time).dayPhase`, haut-parleur.
- PC, bas à droite au-dessus de la minimap : icônes SVG du Sac (I) et du Journal (J). Sur téléphone, la disposition tactile reste adaptée au joystick à gauche.
- Suppression de l'ancien bandeau temporaire des raccourcis, toujours documentés dans Paramètres → Contrôles.
- Bouton Son actif : accès au mixeur existant (muet, volume général, réglages avancés). Il tente de reprendre l'audio au clic ; en l'absence de catalogue sonore, il présente un état explicite plutôt qu'un bouton désactivé.
- Le bouton redondant « Activer / reprendre le son » et le mixeur flottant hors HUD ont été supprimés. Un seul mixeur est partagé avec les Paramètres et réutilise l'AudioEngine.
- Bas droit : minimap cliquable (M) ouvrant la carte principale.
- Les jauges (oxygène, endurance, vitesse, activité) n'apparaissent que selon le contexte.
- SVG locaux (sans bibliothèque, fonts ou textures externes), panneaux sobres et animations très limitées.

## Modules / contrats
| Module | Responsabilité |
| --- | --- |
| `src/ui/app/game-ui.ts` | Composition HUD, indicateurs 4 Hz, raccourcis et interaction ; aucune mutation du gameplay |
| `src/ui/app/hud.css` | Style et responsive (720×540 et petites largeurs), pas de backdrop-filter |
| `src/ui/shared/icons.ts` | SVG locaux pour menu, sac, journal, son, carte |
| `src/audio/view.ts` | **Un seul mixeur** associé à l'AudioEngine existant, déplacé entre popover et Paramètres |
| `src/ui/map/map.ts` | Carte générale, catégories, repères, suivis de destination, zoom et déplacement |
| `src/ui/map/minimap.ts` | Rendu Canvas 2D fixe 180×180, centré joueur, direction et destination |
| `src/ui/map/waypoints.ts` | Stockage local borné et validé, jamais injecté dans les sauvegardes ou projets |

## États
- Pièces : inventaire gameplay (autorité unique). Aucun compteur UI local.
- Heure / météo : même horloge climatique que la scène et l'audio ; ce n'est pas l'heure de l'ordinateur.
- Son : même instance `AudioEngine` et mêmes niveaux persistants `master/music/sfx/ambience/muted`. Le panneau sonore n'est **pas dupliqué** ; il est réhébergé dans la zone contextuelle ou dans Paramètres. En Paramètres, « Mixage avancé » est développé.
- Carte : un `MapRaster` issu de `createMapRaster` est partagé par la grande carte et la minimap, limité à 256 px côté long et généré progressivement. La minimap dessine une petite image 2D **4 fois par seconde max** lors du HUD, sans nouveau rendu Three.js.
- Lieux : mines, parcelles, PNJ, missions actives déjà exposés par le runtime + villages (biomes) et bâtiments remarquables (placements) quand les données auteur existent. **Aucun lieu fictif ajouté**.
- Repères personnalisés : nom (48 caractères maximum), position X/Z validée dans les bornes du monde, nombre limité à 24 ; une destination active, distance/guide visuel ; clé locale séparée par monde et par environnement normal/« Jouer ici ».

## Interactions
1. Menu en haut gauche ou Échap : panneau existant, simulation mise en pause.
2. Icônes Sac/Journal ou touches I/J : panneaux existants, simulation non suspendue.
3. Haut-parleur : panneau de volume principal et sourdine ; « Mixage avancé » pour musique, effets, ambiance. Cliquer hors panneau ou Échap le ferme.
4. Minimap ou M : carte générale, avec zoom/pan et filtres de catégories.
5. Carte : bouton « Placer un repère » → clic sur la carte → saisir le nom → « Enregistrer ». Repère automatiquement choisi comme destination ; « Ne plus suivre », « Viser », et suppression sont disponibles.
6. Les destinations éloignées sont signalées sur le bord de la minimap et leur distance s'affiche sous la carte.

## Règles de performance et compatibilité
- Un seul raster partagé, généré avec budget de temps limité ; aucun second canvas WebGL / moteur 3D.
- Position et icônes du HUD actualisées dans le rafraîchissement déjà limité à 4 Hz de `createGameUi.frame`.
- Pas de nouveau framework, pas de dépendance de production.
- Les repères ne sont pas inclus dans `GameSaveV2` et **ne suivent pas** un export/import de partie : cela demanderait une migration explicite et un choix de portée par emplacement. Ils restent locaux au navigateur et au monde.
- Aucune propagation réseau / synchronisation multijoueur pour ces repères : ce sont des préférences de navigation locales.
- Conservation de la navigation clavier, du focus modal du `UiController`, des raccourcis et du mode développeur.

## Validation
- `tests/ui.test.mjs` : validation de la version/coordonnées/IDs, isolation des espaces, capacité maximale et persistance des repères.
- `tools/test-ui-browser.mjs` : présence du HUD, météo/horloge, mixeur audio, minimap, ajout de repères, carte et paramètres.
- Pour les tests : `npm run typecheck`, `npm test`, `npm run build`, `npm run test:ui`, plus la CI Validate Little World.

## Suites potentielles
- Contractualiser des POI nommés (« ville », « port », etc.) dans le modèle auteur et le compilateur plutôt que de déduire les catégories de noms d'assets.
- Associer explicitement les repères à chaque emplacement de sauvegarde (migration sauvegarde + import/export).
- Ajouter une boussole facultative et une aide d'orientation quand la minimap est masquée.

## Affichage debug discret (PC)

Le mode développeur (`Paramètres → Mode développeur`, `?metrics` ou `?dev`) affiche uniquement **FPS, position X/Z/H et draw calls/triangles** en texte translucide en haut, au centre, sans panneau opaque, ombre portée de carte, ni capture de clics. Sur écran intermédiaire, seuls FPS et coordonnées restent visibles ; sur téléphone seul FPS est affiché. Le statut et l'oxygène hérités restent présents en éléments invisibles pour compatibilité avec les diagnostics, et l'oxygène utile reste dans la jauge du HUD. La version normale reste dépourvue de statistiques.
