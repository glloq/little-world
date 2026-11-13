# 09 — Plan de test navigateur du prototype

**État de campagne :** le parcours automatisé `npm run test:browser` a exécuté 16 vérifications sur le build statique sous Chromium/SwiftShader à 1280 × 800 : édition du graphe de dialogue, import, transformation/duplication, undo/redo, sculpture, peinture, chemin, export, sauvegarde/rechargement, test et retour, dialogue, personnalisation, planage, navigation/nage/plongée et rejet d’un import malformé et de saisies invalides avec restauration du brouillon. Aucune exception JS ni erreur HTTP observée. Les captures sont des artefacts d’exécution, pas une validation artistique exhaustive.

Exécution : `npm run build`, lancer `npm run preview -- --host 127.0.0.1 --port 5173 --strictPort` dans un terminal, puis `npm run test:browser`. `WORLD_URL`, `CHROMIUM_PATH` et `ARTIFACTS_DIR` permettent d’adapter le parcours. La CI installe Chromium Playwright ; en cloud le navigateur système est utilisé. Les cas manuels ci-dessous restent des essais supplémentaires, notamment Firefox, qualité artistique, courbes et performances GPU PC.


## Accès

- Jeu : https://glloq.github.io/little-world/
- Éditeur : https://glloq.github.io/little-world/editor/
- Workflow : https://github.com/glloq/little-world/actions

**Pré-requis :** GitHub Pages doit être activé avec source **GitHub Actions** et le dernier workflow `Build and deploy Little World` doit afficher **success**. Après modification de `main`, attendre un déploiement réussi avant de conclure qu'un bug subsiste.

PC conseillé : Chrome, Edge ou Firefox récents, clavier AZERTY ou QWERTY et souris. Le support mobile n'est pas prévu.

## Jeu — scénario de test de 5 minutes

- [ ] L'écran d'accueil « Une vallée à explorer » apparaît ; pas d'erreur bloquante de chargement.
- [ ] Cliquer **Explorer la vallée** ; une scène 3D avec écureuil, vallée, forêt et rivière est visible.
- [ ] **ZQSD/WASD** : marcher, caméra souris après capture du pointeur, **Shift** pour courir.
- [ ] **Q / ←** déplace l'écureuil vers la gauche de l'écran, **D / →** vers la droite. Sur QWERTY, A est réservé au menu d'apparence.
- [ ] Sans clic, déplacer la souris : la caméra **ne tourne pas**.
- [ ] Maintenir le clic gauche sur la scène puis déplacer la souris : la caméra tourne ; relâcher le bouton : elle s'arrête.
- [ ] Maintenir **A** (touche indiquant le caractère A, y compris sur AZERTY) : le menu **Accessoires & émotions** apparaît.
- [ ] Tout en maintenant A, cliquer sur **Chapeau**, **Sac à dos**, **Pendentif** et **Écharpe** : chaque changement est visible immédiatement ; pendentif et écharpe sont exclusifs.
- [ ] Essayer les **5 expressions** : joyeux, ravi, surpris, apaisé, déterminé. Vérifier les yeux et la bouche.
- [ ] Relâcher A : fermeture du menu ; reprendre la marche. Recharger la page : tenue et émotion conservées.
- [ ] **Membrane invisible hors planage** ; lors du planage, déploiement visible des deux côtés, puis disparition en repliant.
- [ ] **Espace** au sol : saut unique. **Maintenir** Espace ne doit pas déployer le planeur automatiquement.
- [ ] Relâcher puis **réappuyer** Espace en l'air : membrane ouverte. Nouvel appui : repli.
- [ ] Aller dans la rivière : passage à la **nage** ; **Ctrl** descend, **Espace** remonte ; l'oxygène s'affiche.
- [ ] En plongée, la teinte bleue n'apparaît **que lorsque la caméra** passe sous la surface ; elle disparaît lorsque la caméra remonte, même si l'écureuil reste sous l'eau.
- [ ] Suivre le sentier vers le moulin : sa roue tourne **sans interaction manuelle**.
- [ ] Presser **P** pour rejoindre rapidement le port, puis **E** près du bateau pour embarquer.
- [ ] En bateau : **Z/S** avance/recul, **Q/D** gouvernail ; tester accélération, inertie et direction.
- [ ] Naviguer vers la côte : le bateau s'arrête avant les zones non navigables (rivage/eau trop peu profonde).
- [ ] **E** pour débarquer : près du port, retour vers le ponton ; plus loin, retour à la nage.
- [ ] Le bouton « Économie / Équilibré / Élevée » modifie la résolution interne sans changer la carte.
- [ ] Noter les **draw calls** et triangles affichés dans le HUD en vue du port et de la vallée.
- [ ] Approcher de la côte et observer le ponton, la barque et les maisons.
- [ ] **R** ramène au départ, **Échap** libère la souris.
- [ ] Les FPS et la position apparaissent dans le panneau inférieur.

### Limites intentionnelles

- Le nouvel écureuil se compose de **maillages 3D originaux**, inspirés de la planche conceptuelle fournie ; ce n'est **pas encore** un GLB riggé/animé finement.
- Le menu de personnalisation est local au navigateur ; le changement de vêtements et d'émotions ne constitue pas une mécanique réseau.

- L'écureuil est un proxy géométrique, pas encore un personnage riggé/animé.
- Les collisions utilisent la hauteur analytique du terrain ; pas de collisions de bâtiment et de roue.
- Le mouvement et le bateau sont des modèles arcade simplifiés ; collisions du ponton et système de baignade à améliorer avec les retours d'essai.
- La rivière est un volume logique simple, pas une simulation de fluide.
- Les décors lointains et les fonds marins ne sont pas finalisés.

## Éditeur — scénario de test

- [ ] Ouvrir **/editor/** : la vallée et les panneaux d'outils apparaissent.
- [ ] Caméra orbitale : clic-glisser pour tourner, molette pour zoomer.
- [ ] Modifier **graine** et **densité**, puis cliquer « Régénérer la vallée » ; les arbres changent.
- [ ] Choisir **Sapin**, **Rocher** ou **Caisse** ; cliquer sur le terrain pour ajouter au moins trois objets.
- [ ] Vérifier que certains assets se chargent depuis **`models/*.glb`** et que le fallback procédural fonctionne en cas d'erreur de chargement.
- [ ] **Sauvegarder localement** ; recharger l'éditeur : les objets restent en place.
- [ ] **Exporter JSON** ; effacer les objets ; **Importer JSON** : les retrouver.
- [ ] Cliquer **Tester la carte** : le jeu s'ouvre avec la graine et les placements du brouillon courant, sans publier la carte.
- [ ] Revenir dans l'éditeur : les objets du brouillon sont conservés.
- [ ] Vérifier que le **mode joueur** ne propose aucun outil de modification terrain.

### Fonctionnalités éditeur encore absentes

Sculpture du relief, modification des splines d'eau, import direct de GLB depuis l'interface, suppression d'un objet individuel par sélection, undo/redo, règles d'interactions configurables pour chaque prefab, compilation de carte personnalisée dans le site public.

## Vérifications techniques

1. Ouvrir la console développeur (F12) : relever tout **404**, exception JS, erreur GLB ou message WebGL.
2. Dans **Network**, vérifier que les fichiers sont chargés sous **`/little-world/`**.
3. Tester au moins **Firefox et Chromium** si possible.
4. Relever le **FPS indiqué**, le navigateur, le GPU et la résolution.
5. Vérifier l'éditeur après un rechargement complet et après un export/import.
6. Comparer **FPS / draw calls / triangles** : port, forêt, vue lointaine de la vallée ; changer la qualité graphique.
7. Tester la navigation et les collisions limites du bateau ; relever toute traversée de berge.
8. Confirmer que le site n'appelle aucun service de jeu distant.

## Format de retour utile

```text
Navigateur :
Carte (jeu / éditeur) :
Étapes pour reproduire :
Résultat observé :
Résultat attendu :
FPS affichés :
Appels de rendu / triangles :
Qualité graphique :
Message console (si disponible) :
```

Les tests automatiques en CI couvrent les mathématiques de terrain, les transitions principales de mouvement et la structure des GLB ; **ils ne remplacent pas les vérifications de rendu et de maniabilité**.

## Plan de tests futur BL — échange Blender, presets et cartes

**Non livré par le simple cadrage** : tests à développer selon [20 — Import/export Blender ↔ Studio](20-BLENDER-STUDIO-INTERCHANGE.md).

1. Importer un GLB Blender asymétrique : **axes Z-up → Y-up**, unité **1 m**, pivot, matériau, texture, aperçu et catégorie cohérents.
2. Poser trois instances d'un prefab avec **translation XYZ, rotation quaternion/axe Y, scale** et parent/enfant ; copier, grouper, annuler, recharger puis comparer les transforms.
3. Exporter le prefab comme **pack ZIP+JSON+GLB**, l'importer dans un autre projet ; vérifier refs, hiérarchie, licence, versions et collisions d'IDs.
4. Importer un heightfield source avec résolution/hauteurs/origine connues, puis poser un module de falaise/grotte GLB ; peindre végétation/biotope sans perdre les hauteurs.
5. Exporter une **carte V3 ZIP autonome**, ouvrir sur un navigateur vierge/hors ligne avec assets inclus, vérifier terrain, eau, biotopes, PNJ/dialogues, objets, météo et interactions sans perte.
6. Exporter une **sélection vers Blender GLB+sidecar**, modifier le modèle, réimporter ; aperçu des changements et maintien des IDs/overrides/refs non géométriques. Aucun effacement automatique des absents.
7. Fichiers invalides : ZIP `../`, archive compressée pathologique, GLB extension inconnue, texture externe, ID dupliqué, erreur de version, licence absente ; **projet actif intact**.
8. LOD, collisions, ombres/neige sur un prefab importé et profil 30/20 FPS ; recompilation des **seuls secteurs affectés**.
9. Vérifier le **build GitHub Pages** sans `.blend` dans le runtime, ressources chargées depuis la base Vite et catalogue complet.

Un rapport doit distinguer **échange géométrique Blender (non exhaustif côté gameplay)** et **archive V3 complète**. Le round-trip test valide l'absence de perte des **données prises en charge**, non l'identité binaire des ZIP.

## Plan de test WAT — rivière, lacs, cascades, sous-marin et LOD de mer

**Gates futurs, pas fonctionnalités déjà prouvées :** [21 — Eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

1. Dessiner une rivière source→embouchure sur terrain accidenté. Vérifier **profil d'altitude non ascendant**, lit/berges cohérents, niveaux de raccordement et Undo/Redo.
2. Forcer des niveaux impossibles/rivière en contre-pente : diagnostic et blocage/validation humaine, pas de creusement ou correction silencieuse.
3. Créer source → **rapides** → **cascade** (haut/bas distincts) → **lac horizontal** → mer. Tester continuité géométrique, collisions, volumes, jonctions, effets locaux.
4. En nage et plongée, la **caméra** franchit la surface de nombreuses fois : immersion/hystérésis sans clignoter ; sous-face, couleur, visibilité, fonds/faune et lumière adaptés.
5. Bateau : navigation rivière/lac/mer, zone trop peu profonde et cascade refusées ; courants stables indépendants du rendu et FPS.
6. Tester **LOD0, LOD1, LOD2, LOD3**, puis océan très grand et planage : mer visible jusqu'à l'horizon, **sans vagues/écumes lointaines animées, bandes de LOD, glissement d'UV ni eau traversant les îles**.
7. Cascade observée de loin : silhouette conservée, effet particulaire coupé ; même résultat logique pour gameplay avec rendu LOD3.
8. Mesurer GPU/CPU/p95/p99 + draw calls + overdraw alpha, **avec/sans eau**, y compris mer plein écran et profil ultra-économique.
9. Export/import ZIP V3 garde IDs, tronçons, cascades, niveaux et liens ; compatibilité ancien volume V2 sans destruction des retouches.

## Plan de tests PERF — gestionnaire global de ressources

**Plan futur, pas mesure déjà réalisée :** [22 — ResourceBudgetManager et gates PERF-0…PERF-9](22-RESOURCE-BUDGET-MANAGER.md).

1. Un seul système de qualité gouverne `FrameClock` et DPR/LOD ; **30/20 FPS ne change pas les 30 Hz de simulation**. Tester oscillations autour des seuils, surcharge 3 s, restauration 12 s, retour d'onglet, redimensionnement.
2. CPU JS `renderer.render` **n'est pas étiqueté GPU** ; timer GPU WebGL2 absent/disjoint affiche `non disponible`, pas 0 ; p50/p95/p99 et longues frames correctement collectés.
3. **Scènes fixes** : forêt + écureuil/PNJ, village GLB répétitif, océan plein écran, cascade, plage/nage, horizon îles/montagnes, nuit/orage, planage et bateau rapide. Caméra/seed/résolution identiques pour comparaison.
4. Plusieurs mouvements de caméra/retours/téléportations → tâches prioritaires et prefetch, **aucun chunk critique absent**, pas de compilation synchrone incontrôlée, LOD stable sans pop sévère.
5. **Ressources** : 100 clones d'un GLB puis suppression partielle/totale, import/export répétés dans Studio, limite de cache et mémoire estimée ; pas de dispose prématuré ni fuite prolongée.
6. **Mode éco** : herbes/ombres/water FX cosmétiques retirés mais sources, volumes, interactions, PNJ logique et **silhouettes lointaines** maintenus.
7. Profil Auto/Éco/Équilibré/Qualité et mode debug forçage, import V3 sur autre appareil, même monde mais qualité propre à l'appareil.
8. Tests navigateur **SwiftShader pour régression**, puis vrais PC GPU intégré Firefox/Chromium pour qualification ; aucune conclusion GPU réel depuis le temps CPU de soumission.
9. **Studio inactif** ne doit pas rendre en boucle par défaut après implémentation du mode idle ; manipulation reste réactive, annulation et save préservés.

## Plan navigateur AUD — MIDI 5–10 timbres et audio à ressources bornées

**Contrat à implémenter** : [23 — Audio MIDI LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md).

1. **Autorisation** : aucun son ne part avant interaction ; « Jouer » active le contexte ; mute/master/music/SFX/ambience, changement d'onglet, retour focus et refus d'audio ne bloquent pas le jeu.
2. **MIDI** : partitions SMF type0 et type1, tempo et changements, notes note-on/off, notes velocity0, plusieurs pistes, mapping vers **5–10 instruments** autorisés ; pas de note infinie/notes en rafale au retour de pause.
3. **Polyphonie** : essais limite de 8/12/16 notes et 12/16/24 voix totales (hypothèses), voice stealing audible sans clic, sons importants du joueur préservés.
4. **Échantillons** : 1 cascade + 1 vent + 1 chant animal + pas, mono/stéréo et codec fallback, cache PCM partagé et nettoyé après passage à une autre région.
5. **Spatialisation** : 100–200 émetteurs logiques mais seulement quelques sources audibles/spatialisées, `equalpower`, attenuation cohérente avec distance, aucune source permanente par NPC.
6. **Ambiance et musique adaptatives** : forêt → marais → côte, midi/nuit et pluie/neige, transitions propres et synchrones **en temps audio**, même à 20 FPS.
7. **Studio** : importer MIDI, mapper programmes non pris en charge, prévisualiser patches, placer émetteur et enregistrer les données dans ZIP V3 portable sans décoder toute la banque.
8. **Erreurs et sécurité** : MIDI malformé/SysEx/énorme, sample absent/licence/codec, autoplay bloqué, import annulé : aucun crash ni mutation de données auteur.
9. **Perf** : Firefox/Chromium matériel modeste, 0/8/16/24 voix, Panner OFF/ON, durée/latence/glitches, allocations audio décodées et sessions prolongées ; ne pas déduire CPU audio du seul FPS graphique.

## Plan de tests MINE — excavation, étages, persistance et charge

**Contrat :** [24 — Mines creusables 2,5D LOW-RESOURCE](24-MINES-MULTILEVEL-LOW-RESOURCE.md). Tests à créer pendant MINE-0…MINE-9, **pas acquis**.

1. Grille 2,5D en mine locale : creuser 1/10/100 cellules ; faces exposées seulement, pas de cube interne ni fissure entre chunks.
2. **3 puis 8 niveaux** superposés et connecteurs escalier/rampe/puits ; joueur/collisions ne rebondissent pas à la hauteur de la surface `terrainHeight(x,z)`.
3. Entrée via terrain et GLB, changement de zone physique, cohérence des surfaces, collision avec plafond/étage supérieur et navigation de PNJ.
4. Filière minerai/cristal par seed/version/strate, mêmes dépôts au rechargement, récolte persistée, zéro duplication ou régénération implicite.
5. Sauvegarde de partie fermée/reprise : cellules creusées, gisements épuisés et inventaire inchangés ; export ZIP **auteur** distinct de save joueur.
6. Simulation concurrente : 2 commandes identiques ou joueurs sur même cellule → **1 seule récompense**, révision monotone, snapshot après delta manquant, rejet hors portée/non autorisé.
7. Eau/lac/mer/traversée de niveau et volumes interdits : diagnostics et prévention de cavités incohérentes.
8. Mine chargée/déchargée rapidement, téléportation, 20/30 FPS, cache/mesh/invalidation sur frontières, aucun `dispose` prématuré ou gap de collision.
9. Benchmark comparatif **2,5D vs GLB modules vs voxels locaux** à géométrie/récolte équivalentes : CPU remeshing p95/p99, mémoire GPU estimée, draw calls, tailles de sauvegarde et de delta.
10. En solo **aucune connexion serveur requise** ; futur serveur testé séparément, sans masquer l'absence d'autorité réseau dans GitHub Pages.

## Plan de tests AGRI — parcelles, météo passée, propriétaire et LOD

**Tests futurs spécifiés dans [25 — Agriculture LOW-RESOURCE](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md)**, non exécutés par la documentation.

1. Dessiner trois parcelles et sous-zones, semer, arroser, traiter, mûrir, récolter, sauvegarder puis recharger — cultures, stocks et inventaire intacts.
2. **10–30 jours fictifs sans connexion** : mêmes résultats que croissance évaluée par étapes sous **la même météo historique**, y compris sécheresse/gel/rotation ; pas de calcul agronomique à chaque RAF.
3. Horloge accélérée, onglet masqué et changements d'heures/saisons : pas de croissance doublée, gelée ou de retard faux; historique climatique/version de règles respectés.
4. Récolte/arrosage simultanés simulés, requêtes dupliquées et versions de parcelle obsolètes : **une seule transaction**, stocks d'eau/graines et inventaire corrects.
5. **Agriculteur propriétaire/ouvrier** reçoit état détaillé; **visiteur** ne reçoit que stade/infos publiques ni droits; **même géométrie LOD à même caméra**.
6. Un champ à proximité : plantes instanciées; à mi-distance rangs simplifiés; en planage couleur/masque; herbe naturelle exclue, aucune animation/collision par plant.
7. 100/1 000/10 000 parcelles **synthétiques**, 0/10/100 visibles proches, événements météo/échéances et récoltes simultanés : p95/p99, CPU, caches, mémoire, draw calls et bande passante simulée.
8. Parcelle recoupant 2–3 chunks, conflit eau/route/bâtiment/mine, Undo/Redo Studio et export ZIP **source** distinct de la sauvegarde de **partie**.
9. Vérifier sur **GPU intégré matériel**, pas seulement SwiftShader; maintenir 30 FPS nominal/20 secours comme objectif à qualifier, sans changer le rythme agricole lors du downgrade.

## Scénarios futurs — Studio complet et jeu final (non implémentés)

Cette liste est un **plan d'acceptation pour la prochaine architecture**, et non un compte-rendu de tests réussis :

1. Créer un projet, générer une petite carte puis ouvrir un secteur via **la vue globale 2D**.
2. Passer entre les éditeurs spécialisés (terrain → biotopes → PNJ → dialogues → événements) en conservant projet, sélection et historique.
3. Sculpter une berge, modifier un chemin et régénérer la végétation **sans reconstruire toute la carte**.
4. Créer un PNJ animal avec variante du joueur, zone et navigation **libre**, parcourant plusieurs secteurs.
5. Ajouter un dialogue à choix, un objet à ramasser et un mécanisme lié à une porte/vanne ; les configurer **sans code**.
6. Activer une petite mission ; vérifier sa persistance et la restauration d'un des **plusieurs slots de partie**.
7. Tester la carte depuis une position auteur puis revenir au même contexte d'édition, sans modifier le projet de manière inattendue.
8. Exporter et réimporter une archive auteur sectorisée, puis vérifier liens, assets, données PNJ/actions.
9. Compiler, déployer le monde et vérifier que le jeu fonctionne **sans serveur**, avec uniquement les secteurs proches chargés.
10. Tester une **carte continue de taille synthétique jusqu'à 10 × 10 km au maximum** avec chiffres mesurés CPU/GPU/mémoire/chargement ; aucune performance présumée.
11. Vérifier 30 FPS nominal et secours 20 FPS **sans perte d'input ni ralentissement de simulation**, suivant la politique LOW-RESOURCE.

Références : [12 — Limites](12-PROJECT-SCOPE.md), [13 — Studio](13-STUDIO-UX-ARCHITECTURE.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).
