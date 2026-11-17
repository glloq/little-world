# Studio — Accueil visuel et création de monde guidée (premier lot)

Branche : `feat/studio-guided-world-onboarding`. Aucune fusion automatique.

## Parcours

L'accueil sépare quatre intentions :
1. **Créer un monde** : choix du paysage, choix du relief/dimensions puis confirmation.
2. **Explorer un monde prêt** : ouverture des six scènes de référence existantes.
3. **Partir de zéro** : terrain côtier simple et plat, sans formes de relief ni objets.
4. **Reprendre un projet** : liste des projets locaux, avec import JSON/ZIP toujours disponible.

Une section secondaire « Accès avancé », placée sous les choix principaux, conserve la création directe (y compris les vallées historiques) et les raccourcis des anciennes scènes pour les auteurs expérimentés.

Le créateur affiche, avant toute sauvegarde, une vraie carte du relief issue de `generatorField()`.
Le brouillon passe dans `buildWelcomeProject()` pour l'aperçu **et** lors de la confirmation.
Le projet V3 n'est créé dans IndexedDB que sur « Créer et ouvrir le monde ».

### Contrôles

- **Étape 1** : île, archipel, chapelet, paysage doux ou terrain simple.
- **Étape 2** : relief doux / varié / accidenté ; volcan facultatif ; 4 tailles prédéfinies et dimensions personnalisées ; graine masquée dans « Réglages avancés ».
- **Étape 3** : nom du projet ; option pour poser une montagne ou déplacer le volcan en cliquant sur l'aperçu 2D ; confirmation.
- **Autre variation** : change la graine et régénère l'aperçu, sans créer de nouveau projet.
- La barre de progression permet de revenir aux étapes précédentes.

Le terrain utilise la définition `world.terrain` existante et ses formes modifiables ; aucune génération parallèle n'est introduite. Les configurations trop grandes, hors bornes ou invalides restent refusées par la validation V3.

## Budget

La carte échantillonne au maximum 128 pixels sur le grand axe, sans second renderer WebGL ni géométrie persistante. La génération est différée à la prochaine frame pour permettre l'affichage du formulaire ; la carte de l'accueil ne crée pas de sources auteur avant confirmation.

## Hors périmètre de ce premier lot

- L'aperçu 2D ne montre **pas** encore les rivières, les biotopes, les objets ni un rendu 3D complet.
- Le placement rapide concerne une montagne et le premier volcan ; l'édition avancée des crêtes, falaises, fleuves et régions se fait toujours dans Carte globale / Régions après création.
- Une instruction textuelle libre et la génération hydrologique guidée ne sont pas implémentées.
- Les mondes de référence sont chargés tels quels ; aucune duplication automatique d'un projet existant.
- Sur « Partir de zéro », le terrain possède une côte en bordure et une altitude plate ; ce n'est pas une grille océanique illimitée.

## Vérifications

- `npm test` : tests de graine déterministe, projet vierge, placement et validation.
- `npm run typecheck` et `npm run build`.
- `npm run test:studio` : parcours de création et retour après recharge.
- Recette humaine : tester les quatre entrées, varier la graine, revenir entre étapes, saisir des dimensions personnalisées, poser une montagne, créer, enregistrer/exporter/reprendre ; vérifier le rendu sur petit écran.

## Prochaines étapes recommandées

1. Prévisualisation régionale et hydrologique avant création (sans sauvegarde).
2. Outil de composition par tracé 2D pour vallées, crêtes et rivières, en réutilisant Geography Engine / WATER.
3. Aperçu 3D à la demande avec un budget strict et possibilité de revenir au configurateur.
4. Recomposer depuis l'intérieur du Studio avec comparaison des changements et protection des retouches auteur.
