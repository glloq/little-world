# 60 — Contrôles tactiles pour téléphone (expérimental)

## Portée

La bêta reste orientée **PC**, conformément à `AGENTS.md`. Cette branche ajoute **une interface pilote** pour les téléphones sans changer la physique, les graphismes, les sauvegardes ou l'architecture réseau.

### Interface de jeu

- Téléphone détecté par un pointeur principal `coarse` et un écran dont le plus petit côté mesure au plus **750 pixels CSS**.
- **Joystick analogique** en bas à gauche ; direction écran relative à la caméra. Zone morte **14 %** ; amplitude maximum 1 ; déplacement proportionnel à l'écartement du centre. Un seul `pointerId` propriétaire du joystick.
- **Boutons tactiles** à droite : Saut/plané (appui et maintien), Agir, Rouler (maintenir), Plonger (maintenir).
- **Caméra** : glissement sur la scène 3D via le contrôleur de caméra existant. Le joystick et les actions ont leur capture de pointeur indépendante.
- Sac et Journal restent accessibles ; minimap compacte en bas à droite en paysage.
- **Pas de modification** de `simulatePlayer` : l'adaptateur renseigne `Controls.forward/right/jumpPressed/spaceHeld/rollHeld/dive` dans la simulation déterministe existante.
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
