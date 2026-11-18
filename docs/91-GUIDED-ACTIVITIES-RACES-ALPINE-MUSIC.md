# Génération guidée : courses, île alpine et musique

Ce lot synchronise `feat/stepped-island-identity` avec `main` à `1e23b61`, en conservant les ports natifs, parcelles et villages de la branche. Il réutilise les nouvelles courses, la physique de neige, le télésiège et le catalogue musical ; aucun moteur de jeu parallèle n’est créé.

## Réglages de création

Dans **Créer un monde → Style de l’île → Courses, ski et musique**, choisir :

- Sans circuit, circuit de roulade sur terrain relativement plat, descente de roulade, ou les deux.
- Une descente de ski prototype, ou le bouton **Profil Île alpine**, qui prépare un massif central de 650 m, des vallées moins marquées et une rivière souhaitée.
- Musique contextuelle Little World, ou absence de musique avec bruitages conservés.

Les options sont facultatives et enregistrées dans les besoins V5. Les anciennes recettes ne reçoivent aucune activité supplémentaire. Le port, les villages, les champs et les réservations sont calculés avant les activités : un circuit ne consomme pas un champ ou une emprise habitée pour forcer son placement.

Les circuits de roulade utilisent le planificateur de terrain de `main`, avec au maximum neuf zones de recherche, chacune limitée à 72 propositions. Les pentes, dévers, eau, bâtiments, routes et autres courses sont vérifiés. Les modules éventuels restent ceux du système commun. Les checkpoints et pistes sont enregistrés dans `libraries.races`, modifiables dans **Courses** et compilés dans **Jouer ici**.

Une activité explicitement demandée mais introuvable produit une erreur et bloque la création. Choisir un autre relief, une autre graine, ou retirer cette demande. Un circuit validé géométriquement demande toujours un essai de pilotage pour évaluer sa difficulté.

Les circuits de vol et mixtes restent disponibles dans l’éditeur spécialisé de `main` ; leur placement automatique n’est pas ajouté à ce lot.

## Ski enregistré et éditable

La recherche utilise `findDemoPiste` et `validatePiste` de `main`, complétés par le contrôle du couloir complet : largeur, eau et occupation. Elle ne creuse ni ne nivelle automatiquement une pente incompatible. Le résultat est une définition source versionnée dans `libraries.alpine['composition-alpine']`, avec points, largeur, seuil de neige, équipement de prêt et activation de la remontée.

Le panneau **Courses** permet de voir la descente, de déplacer ses points avec l’éditeur de tracés natif, de choisir skis/snowboard et d’activer ou retirer le télésiège. La validation du tracé précède la transaction ; Annuler/Refaire utilise l’historique existant.

Le couloir fournit une surface neigeuse autoritaire, même lorsque les masques régionaux décrivent de l’herbe. Il réutilise l’index spatial de corridors pour sa géographie ; aucun mesh alternatif ni calcul de distance sur toute la carte à chaque image. Le même échantillonnage détermine le matériau de glisse et l’absence de végétation, dans le Studio, le jeu et les workers. Hors du couloir, les corrections de matériaux existantes gardent leur priorité sur la limite naturelle de neige.

Le compilateur conserve le tracé exact. Le runtime ne recherche pas une autre descente et n’exige pas `snowDemo=1`. Le télésiège dérive son parcours du tracé enregistré. L’équipement de prêt est utilisable dans cette zone ; **B** alterne skis et snowboard. Les repères de départ de remontée et de sommet sont ajoutés à la carte. Le point de départ du monde conserve le fonctionnement habituel ; le profil ne téléporte pas automatiquement le joueur depuis le port vers la montagne.

### Limites du ski

Il s’agit toujours du prototype de glisse/remontée de `main`, pas d’une station de ski complète. Le lot n’ajoute ni compétition chronométrée de ski, ni plusieurs pistes, ni nivellement de terrain, ni bâtiments de gare, ni contrôle complet des supports/câbles. La réservation et la sauvegarde d’une place dans le télésiège restent à compléter. L’équipement de prêt ne constitue pas une économie de location.

Un massif élevé peut ne pas offrir d’emplacement valide pour le village d’accueil ; l’avertissement existant reste visible. Aucun bâtiment n’est forcé sur une pente incompatible.

## Musique et protection des sources

La musique reprend le catalogue V2 existant, ses partitions, timbres, conditions de monde et horloge audio. Aucun fichier musical n’est généré. Le choix « sans musique » retire les thèmes et conserve les événements sonores. Le catalogue est conservé dans `world.audio`, exporté et compilé ; il reste éditable dans **Audio**.

Le brouillon et la compilation revérifient les activités après une modification du terrain ou de l’eau. La recomposition protège les courses, la descente et l’audio retouchés. Les courses régénérées conservent l’identité du monde d’origine et reçoivent une empreinte cohérente. La validation d’un circuit exclut sa propre emprise, sans ignorer les autres courses.

## Vérification

Les tests couvrent les tracés déterministes, le transport source → compilation → runtime, la neige réellement échantillonnée sur la piste, l’exclusion de végétation, les activités impossibles, les modifications invalidantes, la musique coupée et la protection par recomposition.

**818 tests réussis**, compilation TypeScript et build réussis. Le parcours navigateur comporte **14 contrôles réussis**, sans erreur JavaScript ; il vérifie aussi que le joueur entre réellement en mode glisse sur le couloir enregistré. Le parcours maritime ferry/commerce existant passe également.

Le parcours navigateur crée une île douce avec roulade et musique coupée, puis un profil alpin avec descente, roulade et musique contextuelle. Il contrôle l’export ZIP, le panneau d’édition, le chargement compilé et l’alternance d’équipement sans paramètre de démonstration.

Commandes : `npm test`, `npm run build`, puis avec Vite sur le port 5174, `node tools/test-generated-activities-browser.mjs`. Le script accepte `WORLD_URL` et `CAPTURE_DIR`.

Captures et rapport : [carte alpine](captures/guided-activities-v1/alpine-map.png), [éditeur](captures/guided-activities-v1/alpine-studio.png), [jeu alpin](captures/guided-activities-v1/alpine-playtest.png), [rapport navigateur](captures/guided-activities-v1/browser-report.json).

Aucune carte officielle, aucun nouveau GLB ou fichier audio, aucune publication ni déploiement dans ce lot. Les vérifications fonctionnelles ne garantissent pas les FPS sur une machine donnée.
