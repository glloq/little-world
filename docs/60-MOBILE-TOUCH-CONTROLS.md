# 60 — Contrôles tactiles pour téléphone (expérimental)

## Portée

La bêta reste orientée **PC**, conformément à `AGENTS.md`. Cette branche ajoute **une interface pilote** pour les téléphones sans changer la physique, les graphismes, les sauvegardes ou l'architecture réseau.

### Interface de jeu

- Téléphone détecté par un pointeur principal `coarse` et un écran dont le plus petit côté mesure au plus **750 pixels CSS**.
- **Joystick analogique** en bas à gauche ; direction écran relative à la caméra. Zone morte **14 %** ; amplitude maximum 1 ; déplacement proportionnel à l'écartement du centre. Un seul `pointerId` propriétaire du joystick.
- **Deux boutons principaux permanents** à droite : Saut/Planeur/Brasse (appui ponctuel) et Accélération (maintien). **Agir apparaît seulement si un objet proche propose une action utilisable.** Aucun bouton distinct Rouler/Plonger.
- **Caméra** : glissement libre sur la scène 3D, direction horizontale corrigée pour le tactile sans modifier la souris PC. En plané, le joystick gauche pilote désormais les intentions de lacet et tangage (signe horizontal corrigé), tandis que le pouce droit reste sur l'accélérateur. Les captures de pointeurs restent indépendantes.
- Menu, Sac, Journal et Carte sont regroupés en haut. La minimap devient un raccourci Carte sans rendu canvas inutile sur téléphone ; Son reste dans Paramètres.
- L'adaptateur renseigne les `Controls` existants, plus `swimStrokePressed` (impulsion déterministe). Au sol, Accélération fait courir sans imposer la boule ; en roulade elle renforce la motricité ; dans l'eau elle accélère la nage ; en plané elle utilise la réserve de gaz existante. Le PC conserve Space pour basculer plongée/remontée.
- Aucune synthèse de `KeyboardEvent`, pas de polling DOM, pas de boucle animation/rafraîchissement propre au joystick, aucun asset téléchargé.
- Reset explicite sur `pointerup`, `pointercancel`, perte de capture, perte de focus, onglet masqué et UI bloquante ; les boutons et le joystick disparaissent dans les panneaux.
- PC avec souris : **aucun joystick créé**.

### Paysage automatique, limites navigateur

La vue tactile est pensée pour le mode **paysage**.

1. Sur l'appui explicite « Explorer l'île » : demander le plein écran, puis tenter `screen.orientation.lock('landscape')`, uniquement sur téléphone et lorsque ces API existent.
2. Ne pas considérer `lock()` comme garanti : rejet possible hors plein écran ou selon les permissions, les systèmes et les navigateurs. En particulier **Safari sur iPhone ne prend pas en charge `ScreenOrientation.lock()`**.
3. Si l'écran reste en portrait : afficher une invitation « Tournez votre téléphone » avec une option pour réessayer sur un geste explicite et une autre pour continuer volontairement en portrait.
4. En revenant à l'accueil, retirer l'invite ; si notre code a activé le plein écran, le quitter.
5. La scène Three.js suit les changements de dimensions via le `resize` existant ; aucune rotation CSS artificielle des pixels ni permutateur de coordonnées.

### Performance et non-régression

- Entrée analogique lue seulement par le tick de simulation existant, aucune géométrie Three.js supplémentaire.
- Joystick uniquement en HTML/CSS ; translation du seul bouton central sous le doigt, évite les recalculs massifs.
- `touch-action: none` limité au canvas et aux commandes tactiles, pour éviter les scrolls accidentels.
- Tests unitaires du joystick (zone morte, diagonal, saturation, valeurs invalides) et du détecteur de téléphone.
- Parcours navigateur ajouté à `tools/test-ui-browser.mjs` sur émulation de téléphone 844 × 390 : joystick visible, mouvement réel, retour au centre, boutons visibles et blocage sur ouverture du Sac.

## Restes à qualifier

- Tests sur **appareils Android et iOS réels** (y compris le système de verrouillage d'écran, la caméra tactile, les zones sûres et la chauffe).
- Calibrer la taille des boutons selon les pouces/tailles d'écran et la sensibilité du joystick.
- Mode configuration des commandes tactiles et accessibilité mobile.
- Mesurer le GPU, la température et l'autonomie sur un téléphone réel avant d'annoncer une prise en charge mobile officielle.

## Boost au gaz en vol (fusion `feat/glide-gas-boost`)

- Le bouton d'accélération occupe toujours le même emplacement à droite, quel que soit le mode.
- Il se nomme « Boost » et consomme le gaz uniquement en mode `glide`, avec une réserve strictement positive ; il est désactivé en chute libre.
- Maintenir le bouton renseigne `Controls.boostHeld` en plané, exactement comme le clic droit sur PC. La simulation `gasBoostStep` conserve la responsabilité des dépenses, accélérations et impulsions : aucun système de poussée supplémentaire.
- Relâchement de touche, annulation de pointeur, perte de focus, ouverture d'un panneau, épuisement du gaz ou fin du plané réinitialisent la poussée. Le bouton reste affiché, changeant de fonction selon l'activité.
- Les tests doivent vérifier l'apparition du bouton, l'épuisement de gaz pendant le maintien et l'arrêt immédiat au relâchement.

## Implantation mobile V2 et ouverture sur téléphone

- Détection téléphone : pointeur principal grossier et petit côté de l'écran ≤ 750 pixels CSS ; aucune commande tactile créée sur PC.
- Premier démarrage mobile en qualité `low` (sans MSAA) **uniquement si le joueur n'a jamais choisi de qualité** ; le choix conservé localement reste prioritaire.
- L'écran d'accueil explique les contrôles mobiles. Au lancement, demander le mode paysage via plein écran + verrouillage si pris en charge ; conserver le choix explicite de continuer en portrait si refus navigateur.
- Zones de pouces fixes et séparées : joystick à gauche ; Saut/Planeur/Brasse + Accélération à droite. Un unique petit bouton Agir apparaît au-dessus uniquement près d'une interaction utilisable. Double appui Accélération : basculer roulade au sol ou plongée/remontée dans l'eau.
- Barre de tête : menu / Sac / Journal / Carte. Éviter minimap et débogage flottants sur les commandes ; météo, monnaie et son secondaire dans les menus.
- Sans texture supplémentaire et sans nouvelle boucle de simulation ; pas de dépendance d'interface tierce.
- Contrat nage : une brasse déclenche une impulsion bornée (0,32 s), sans répétition automatique ; accélération par maintien. Double appui rapide sur Accélération (≤ 340 ms) : plonger/remonter, sans troisième bouton. Le PC conserve ses touches.
- Contrat vol : le joystick gauche agit sur les intentions de caméra (yaw/pitch, angles bornés et intégrés à 30 Hz) ; le moteur conserve la rotation progressive, la finesse, l'énergie et le décrochage.
- À qualifier sur appareils réels : multitouch simultané joystick + accélérateur, retour d'écran verrouillé, Safari iOS, écrans très étroits, clavier virtuel et échauffement GPU.

## Correction tactile droite/gauche et réduction des boutons

- Horizontal mobile (sol/eau/bateau) : inversion de la contribution analogique tactile seule, sans toucher au clavier PC.
- Caméra au doigt : signe horizontal inversé sur téléphone uniquement ; les préférences de sensibilité et d'inversion verticale sont respectées.
- Plané : le joystick gauche utilise le signe de lacet corrigé afin de tourner dans le sens attendu.
- **Deux commandes visibles en permanence.** La troisième, « Agir », est conditionnée par une `primaryAction.enabled` trouvée à proximité, recalculée à 8 Hz. L'appui résout toujours la cible à nouveau au moment d'agir.
- Rouler ou sortir de la boule : double-tap Accélération au sol. En eau, double-tap Accélération bascule plongée/remontée. Le maintien seul reste une accélération ordinaire.
- Aucun changement du comportement souris/clavier PC, ni nouvelle animation, géométrie ou boucle permanente.
