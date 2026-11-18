# Audit — génération d’îles selon plusieurs styles

Statut : audit du code au commit `2d5d2d0`, proposition d’évolution. Les modèles décrits ci-dessous ne sont pas encore implémentés. Aucun changement de génération ni de carte officielle dans cet audit.

## Besoin

Conserver la lisibilité de la référence illustrée : relief identifiable, vallées, rivières, quelques ruptures et grands ensembles écologiques. Remplacer la succession systématique de marches par des paysages formés autour de points hauts. Les plateaux deviennent des formations locales facultatives. La silhouette et le relief doivent distinguer les modèles avant même de colorer les biomes.

« Faible dénivelé » signifie ici une amplitude verticale modérée avec collines et basses terres, pas une obligation de terrain plat. « Allongée en hauteur » est interprété comme une silhouette étirée suivant l’axe vertical de la carte ; l’orientation doit rester réglable.

## Diagnostic du code existant

| Zone | Observation vérifiée | Conséquence |
|---|---|---|
| `map-requirements.ts` | Seulement île/archipel et relief doux/varié/accidenté ; cinq terrasses par défaut | Aucun choix explicite de morphologie ; le relief doux reste étagé |
| `world-terrain-planner.ts` | V3 dérivée de V2 ; au moins trois plateaux emboîtés ; niveaux de 24 à 440/680/780 m, puis sommets ajoutés | Arrondir les contours ne supprime pas la structure en marches ; le point haut ne structure pas le paysage |
| `world-terrain-v2.ts` | Axe choisi avant l’hydrologie ; enveloppe principale convexe ; archipel = île principale et deux îlots | Impossible de produire une véritable caldera fragmentée avec cette seule stratégie |
| `world-hydro-planner.ts` | Première rivière sur cet axe ; D8 limité à 1 024 cellules pour l’analyse complémentaire | Architecture adaptée au corridor descendant, pas à plusieurs versants indépendants |
| `world-tributaries.ts` | Branches construites par décalage latéral de la rivière principale | Réseau trop dépendant d’un seul axe ; peu adapté à un drainage radial |
| `world-biome-planner.ts` | Certaines provinces héritent du paysage suivant leur station sur l’axe | Succession linéaire qui ne décrit pas tous les versants ou toutes les îles |
| `world-biome-boundaries.ts` | Seuils fixes à 40/150/450 m, traitement automatique réservé à V3 | Écologie difficile à transposer aux îles basses ; les sommets bas ne sont pas forcément rocheux ou enneigés |
| `world-composition.ts` | Minimum de trois terrasses en V3 ; présence des paysages contrôlée par nom de recette | Contraintes liées à un modèle ; une recette ne prouve pas une surface réelle suffisante |
| `world-composition-quality.ts` | Part de terres dans les empreintes de plateaux | Ne mesure ni la pente réelle ni la qualité d’une île naturelle |
| `home-welcome.ts`, `composition-panel.ts` | Nombre de terrasses au premier plan ; recomposition choisit une version de générateur | Les choix techniques doivent céder la place à des styles compréhensibles |

## Modèles proposés

Plages initiales de calibration pour une emprise de quelques kilomètres : paramètres de création, pas mesures scientifiques d’îles réelles. La hauteur finale mesurée inclut le cumul des primitives et doit être contrôlée. L’altitude se règle séparément de la forme ; ne pas extrapoler proportionnellement sans limites aux petites cartes.

| Modèle | Organisation | Altitude maximale cible initiale | Eau et ruptures |
|---|---|---|---|
| Île douce | Côte irrégulière, collines larges, un ou deux points hauts diffus, larges basses terres | 40–180 m | Ruisseaux courts, estuaires ; cascades rares |
| Île allongée à massif central | Silhouette étirée, dorsale discontinue, sommets de hauteurs variées, vallées vers les deux côtes | 180–650 m | Plusieurs bassins indépendants ; plaines aux débouchés |
| Île à massif latéral | Massif décentré, versant court et abrupt, versant long avec piémont et plaine | 180–700 m | Rivière principale possible sur le long versant, petits torrents sur l’autre |
| Île volcanique | Édifice principal, cône irrégulier, cratère et vallées rayonnantes ; volcanisme actif ou ancien | 250–900 m | Drainage radial ; végétation possible sur ancien volcan |
| Archipel de caldera ancienne | Couronne interrompue, plusieurs îles inégales, lagune marine, sommets de rebord dégradés | 60–450 m | Petits bassins par île ; lagune reliée à la mer ; aucun fleuve imposé entre les îles |
| Île en étages | Interprétation stylisée de la référence, plateaux locaux irréguliers, vallées traversantes | 150–700 m | Cascades plus présentes, étages interrompus et asymétriques |

La géologie volcanique ne doit pas imposer partout un biome de lave. Distinguer relief volcanique, âge/activité et couverture écologique. La caldera ancienne n’est pas nécessairement un atoll corallien.

## Pipeline recommandé

1. Résoudre le style, l’emprise, l’orientation, la graine et les demandes écologiques en paramètres effectifs affichables. Détecter les incompatibilités sans remplacer silencieusement le modèle.
2. Construire les terres et les points hauts : contours non convexes contrôlés, baies, presqu’îles ; massifs, crêtes larges et relief secondaire asymétrique. Garder les détails côtiers après la silhouette générale.
3. Former des versants continus, quelques vallées et piémonts. Les plateaux occupent des zones locales, jamais un escalier global pour tous les styles. Borner les corrections et les tentatives.
4. Analyser les bassins du relief final, choisir des sources sous les sommets et tracer vers mer ou confluence. Réutiliser `analyzeWatersheds`, `proposeWatershedRivers`, `planGuidedRiver` et le compilateur WATER. Évaluer une analyse de 4 096 à 16 384 cellules selon la taille, puis raffiner uniquement les corridors : 1 024 cellules sur 4 × 3 km donnent un pas de l’ordre de 108 m, insuffisant pour certains ruisseaux. Mesurer le coût avant de fixer ces valeurs.
5. Valider tous les points et segments du réseau, pas seulement les cellules D8. Le lissage d’un trajet peut le faire remonter : revalider après toute modification. Corriger localement un obstacle seulement si la correction de terrain est explicitement bornée et visible ; ne pas aplatir arbitrairement l’île pour satisfaire un quota de rivières.
6. Déduire les milieux du relief, des bassins, de l’humidité et de l’exposition. Associer des seuils absolus plausibles à des distributions relatives par modèle ; ne pas convertir automatiquement les 10 % les plus hauts en montagnes enneigées sur une île de 80 m. Marais = terrain bas, humide et peu pentu, pas simple ruban autour de l’eau.
7. Produire les objets auteur natifs, les diagnostics et l’aperçu depuis le même plan. Respecter les retouches, l’historique et la sauvegarde existants.

## Adaptations techniques

### Contrat et compatibilité

Introduire une nouvelle composition version 4, indépendante du schéma de projet V3. Conserver les générateurs V1/V2/V3 et leurs signatures ; déplacer le générateur étagé actuel dans un module stable avant d’ajouter le dispatch V4.

Ajouter dans les besoins un bloc optionnel versionné de style : modèle, orientation, allongement, altitude cible, position du massif, intensité des vallées et présence locale des plateaux. Valeurs par défaut résolues explicitement pour les nouveaux projets uniquement. Adapter la validation stricte : elle utilise actuellement les clés de `DEFAULT_MAP_REQUIREMENTS` comme liste autorisée ; employer une liste de champs déclarée pour accepter des options absentes du défaut. Tester export/import et absence de conversion implicite.

Créer un contrat commun de plan : terres, points hauts, bassins candidats, provinces par terre et statistiques. Rendre l’ancien `axis` facultatif pour V4 ; les consommateurs doivent accepter zéro, un ou plusieurs corridors. Garder le contrat des anciens générateurs par un adaptateur. Sous-graines stables pour silhouette, relief, eau et biomes.

### Relief et caldera

Réutiliser `mountain`, `hill`, `ridge`, `valley`, `basin`, `plateau`, `volcano` du moteur `archipelagoField`. Pas de nouveau moteur ni simulation d’érosion obligatoire.

Une terre actuelle est un contour sans trou. Représenter d’abord la caldera fragmentée par plusieurs îles non convexes, séparées par des passes marines, dans la limite des 12 terres. Éviter le passage par `convexOutline` et `provinceMosaic` sur une enveloppe globale : ils boucheraient la lagune et les baies. Générer des zones de biomes par composante terrestre, puis masquer précisément les cellules marines.

Ne pas simplement poser un grand `volcano` sur la lagune : le moteur applique le volcan après les cuvettes avec un maximum de hauteur, ce qui peut relever l’eau centrale et annuler une découpe. Composer les restes du rebord sur chaque terre et contrôler la lagune dans le champ final. Les primitives de relief peuvent aussi relever le fond au-delà du contour ; mesurer la connectivité et le trait de côte sur l’altitude finale, pas uniquement sur les polygones.

### Hydrologie et biomes

V4 doit déduire le réseau du terrain plutôt que réutiliser par défaut `proposeComposedTributaries`. Calculer les confluences explicitement ; ne pas relier artificiellement deux composantes insulaires. Les cascades dépendent des ruptures réelles, leur nombre ne dépend plus de `terraces`.

Remplacer le caractère obligatoire des deux affluents et des cascades par des souhaits dans les modèles doux ou fragmentés, avec possibilité de demande stricte avancée. Un réseau absent doit être expliqué et jamais enregistré comme satisfait. Conserver les exigences strictes explicites de l’auteur.

Passer des stations de l’axe à des régions environnementales. La succession personnalisée devient une préférence amont–aval sur un bassin choisi ; signaler une demande incompatible. Contrôler les surfaces finales des biomes, leur continuité et leur présence sur la terre correcte, après application des masques. Conserver la propriété des cellules générées et les protections des recettes modifiées.

### Studio

Dans « Créer un monde », afficher six cartes de style avec silhouette et coupe de relief. Choisir ensuite dimensions, graine, altitude et position du massif ; proposer orientation nord–sud par défaut pour l’île allongée, mais ne pas confondre l’orientation avec les dimensions. Les réglages avancés portent sur irrégularité côtière, vallées et plateaux locaux.

Préremplir les souhaits écologiques et hydrologiques selon le modèle. Afficher les contraintes incompatibles : haute montagne sur île douce, grande rivière sur petits fragments, cascades sur versants faibles. Offrir une correction explicite des paramètres, sans changement caché.

En aperçu : altitude, pente, eau/bassins, biomes ; ajouter une coupe longitudinale et transversale calculée sur le champ existant, sans second WebGL. Afficher altitude maximale réelle, proportion de basses terres, nombre d’îles et exutoires. La vue du relief doit rester lisible sans couleurs de biomes.

Dans « Recomposer », choisir un style plutôt qu’une version technique. Comparer ancien/nouveau relief avant application ; le mode biomes seuls ne change ni le style, ni la géométrie, ni l’eau. Conserver toutes les protections actuelles et Undo/Redo.

## Livraison recommandée

1. Contrat V4, isolation V3 et métriques indépendantes des terrasses ; premier modèle doux, choix de style et aperçu en coupe. Critère : une île réellement peu élevée, sans plateaux emboîtés.
2. Massifs central et latéral, silhouettes allongées, plusieurs bassins versants, biomes environnementaux. Critère : relief et écoulements identifiables sur les deux versants.
3. Modèles volcanique et caldera fragmentée ; lagune et connectivité marine vérifiées. Critère : couronne irrégulière ouverte, sans disque central remonté ni rivière traversant la mer.
4. Modèle illustré en étages locaux, réglages avancés, recomposition complète et campagne de comparaison des styles.

## Validation à préparer

- Matrice initiale : au moins 30 graines par style, trois amplitudes et plusieurs emprises/allongements ; résultats et rejets documentés, aucune garantie extrapolée des 30 anciennes graines V3.
- Compatibilité : signatures V1/V2/V3, import/export V4, aperçu identique au projet créé, graine reproductible, anciennes cartes inchangées.
- Forme : nombre de composantes, aire terrestre, allongement et position des points hauts ; lagune connectée à la mer pour la caldera ouverte ; relief visible en silhouette et en coupe.
- Relief : maximum et quantiles d’altitude, répartition des pentes, surfaces plates réelles, ruptures localisées. Remplacer la seule part d’empreintes de plateaux par ces mesures ; calibrer les seuils sur une planche de cartes avant de les figer.
- Eau : sources sur terre, descentes validées à résolution WATER, exutoires valides, confluences raccordées, zéro traversée marine entre îles ; absence de cascade acceptée lorsqu’elle est cohérente avec le modèle.
- Écologie : surfaces réelles et transitions, marais peu pentus, côte au bord réel, ancien volcan végétalisable ; aucun biome requis validé par son seul nom de recette.
- Studio : changement de style, contraintes visibles, comparaison, retouches manuelles protégées, Undo/Redo, biomes seuls et réouverture du projet.
- Budgets : maximum natif de 12 terres, 64 formes, 64 points par contour et 32 par ligne ; mesurer durée de génération et d’aperçu, taille source et mémoire. Pas d’entités par plante ni de second moteur de rendu.

Les références à des îles existantes devront servir à calibrer les proportions (largeur, longueur, hauteur, forme des versants), avec sources identifiées lors de cette étape. Cet audit n’établit pas encore de reproduction géographique réelle.
