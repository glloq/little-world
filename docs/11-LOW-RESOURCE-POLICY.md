# 11 — Politique globale LOW-RESOURCE (Little World)

**Statut : objectifs de conception validés pour les fréquences ; autres budgets provisoires à calibrer.**

**Références techniques approuvées :** [14 — Décisions techniques](14-TECHNICAL-CHOICES.md), groupe `TT-*`. Cible **PC standard à GPU intégré**, profil indicatif **8 Go RAM / 1600 × 900**. Cette fiche est un **objectif à mesurer**, pas un matériel minimal garanti.
**Périmètre : jeu solo PC/WebGL sur GitHub Pages, Studio et outils de génération. Limite cible : une carte continue jusqu'à 10 × 10 km maximum.**

> Cette politique concerne **tout le projet** : rendu, simulation, PNJ, faune, assets, mémoire, stockage, téléchargements et édition. **Ce n'est pas un relevé de performances atteintes.** Le prototype existant n'applique pas encore nécessairement ces paramètres ; les écarts doivent être suivis explicitement.

## 1. Décision fondamentale : 30 Hz nominal, 20 Hz dégradé

Le terme « Hz » désigne ici le **rythme d'affichage ciblé** (30 ou 20 images par seconde), **pas** un réglage arbitraire de la vitesse du monde.

| État | Présentation visuelle | Budget de temps par image | Statut |
| --- | --- | --- | --- |
| NORMAL | **30 Hz / 30 FPS** | **33,3 ms** | **Choix utilisateur, cible nominale** |
| DÉGRADÉ | **20 Hz / 20 FPS** | **50 ms** | **Choix utilisateur, seuil de secours** |
| Hors focus / onglet masqué | Rendu suspendu ou déclenché au besoin | Aucun FPS obligatoire | Politique recommandée |
| Éditeur inactif | Rendu à la demande quand possible | Aucun FPS permanent imposé | Politique recommandée |

### Ne jamais relier la vitesse de jeu aux FPS

- **Simulation principale recommandée : pas fixe de 1/30 s (30 Hz)** pour déplacement joueur, bateau et interactions sensibles ; fréquence **indépendante du rendu**.
- À 20 FPS, l'affichage interpole entre états ; **le jeu reste à vitesse normale**. Ne pas descendre automatiquement toute la simulation à 20 Hz sous prétexte que le rendu descend à 20.
- Échantillonner les entrées souris/clavier dès leur arrivée. Traiter les fronts d'appui sans les perdre, même si le rendu est moins fréquent.
- Utiliser `requestAnimationFrame` comme horloge d'affichage et un accumulateur de temps pour les mises à jour à pas fixe ; plafonner les étapes de rattrapage et **ne jamais produire une spirale CPU** après un blocage ou le retour d'onglet.
- Quand l'onglet devient invisible : suspendre le rendu et mettre la simulation locale en pause ; au retour, reprendre sans rattraper des minutes de temps écoulé.
- Les animations peuvent être interpolées à l'affichage ; les timers logiques utilisent le temps de simulation.
- Éviter les allocations fréquentes et les rebuilds pendant chaque frame.

**État de la branche de campagne : migration implémentée.** `src/frame-clock.ts` utilise un pas fixe 1/30 s, découple la présentation 30/20, borne le rattrapage et réinitialise les horloges après pause. Le joueur est interpolé à l’affichage. Résolution puis petits éléments éloignés sont réduits après 3 s de surcharge soutenue ; secours 20 Hz ensuite, restauration après 12 s de marge stable. Ces durées sont des réglages initiaux à calibrer. Les décisions PNJ sont cadencées à 10/2 Hz avec interpolation. Jeu et éditeur ne dessinent pas en onglet masqué ; le rendu de l’éditeur actif reste à 30 Hz, pas encore entièrement à la demande.

Les tests vérifient l’indépendance de la simulation à 20/30/60 FPS, la marche, le bateau, le saut et l’absence de dette de temps au retour d’onglet. Les tests navigateur couvrent aussi planage, nage et plongée. Cela ne constitue **pas** une réussite du gate de fluidité sur un PC de référence, toujours non choisi.



### Dégradation adaptative : priorité à la qualité, ensuite aux FPS

Ordre recommandé si le budget nominal est dépassé durablement :
1. Réduire la résolution interne (pixel ratio) avant toute réduction du rythme de rendu.
2. Limiter la végétation et les petits éléments éloignés ; augmenter la distance d'application des LOD simplifiés.
3. Réduire/masquer les ombres, particules et effets secondaires.
4. Réduire les mises à jour **non critiques** (PNJ lointains, insectes, poissons).
5. Si les mesures restent mauvaises, passer **l'affichage de 30 à 20 FPS**, sans ralentir la simulation.

Prévoir une **hystérésis**, par exemple dégradation après plusieurs secondes de surcharge et restauration seulement après une période stable suffisante, pour éviter les oscillations de qualité. Durées exactes et seuils d'activation **à étalonner**. Ne pas utiliser une seule frame lente comme déclencheur.

### Garde-fous de fluidité (cibles de validation, non garanties)

Sur un **PC de référence** et une résolution de référence à consigner :
- Mode normal : moyenne de session **≥ 28 FPS**, cible 30 ; intervalle entre images au 95e percentile **≤ 40 ms**.
- Mode dégradé : moyenne de session **≥ 19 FPS**, cible 20 ; 95e percentile **≤ 58 ms**.
- Identifier séparément les **pics > 100 ms** (chargement, GC, reconstruction, changement de zone), même si la moyenne est correcte.
- Pas de ralentissement des déplacements, de perte de commandes ou de saut de caméra lors du changement 30 ↔ 20.
- Mesurer le temps CPU simulation, la préparation du rendu et le temps GPU si les outils le permettent ; un FPS seul est insuffisant.

Ces seuils sont des **critères de départ proposés** ; les ajuster avec les résultats des vrais PC, sans jamais les présenter comme atteints avant mesure.

## 2. Budgets globaux provisoires

Ils servent à **détecter tôt les régressions**, pas à imposer un plafond universel indépendant du matériel.

| Ressource (vue représentative) | Objectif initial indicatif | Alerte / action |
| --- | --- | --- |
| FPS | 30 normalement ; secours 20 | Dégrader qualité de façon stable, pas la vitesse du jeu |
| Appels de rendu (`renderer.info.render.calls`) | **≤ 150** en zone ordinaire | Étudier matériaux, instancing, secteurs si > 250 |
| Triangles rendus | **≤ 250 000** en vue ordinaire | Vérifier LOD/culling lorsque > 400 000 |
| Téléchargement initial pour jouer | **≤ 15 Mio** de données transférées | Découper assets ou optimiser si dépassé |
| Heap JS | **≈ 150 Mio** ou moins en scénario représentatif | Surveiller croissance sans borne ; mesure variable selon navigateur |
| Textures/ressources GPU estimées | **≈ 200 Mio** ou moins | Examiner atlas, dimensions, instancing, dispose |
| Allocation JS dans la boucle critique | **Très faible et stable** | Éviter les objets/arrays temporaires et garbage collections répétées |
| Traitement PNJ/faune en dehors de la vue | **Quasi nul** | Suspendre ou passer à un état logique dormant |

**Attention :** la VRAM et le coût mémoire des navigateurs ne sont pas toujours mesurables directement ; ces nombres sont des repères, **pas des garanties vérifiables de manière portable**. Les seuils en triangles/draw calls ne préjugent pas du FPS réel : certains shaders, transparences ou résolutions sont plus coûteux que plusieurs centaines de milliers de triangles simples.

Le **matériel de référence est à choisir** (idéalement PC avec circuit graphique intégré, navigateur Firefox et Chromium, test en 1600 × 900 puis 1920 × 1080). Consigner GPU, CPU, OS, résolution, qualité, navigateur et révision Git dans chaque mesure.

## Exigence de vue profonde sans brouillard

**Nouveau choix approuvé :** préserver une grande visibilité **sans masquer la distance avec du brouillard**. Voir [17 — Rendu panoramique, relief d'horizon et imposteurs](17-DISTANT-VIEW-RENDERING.md).

- Les **distances de vue détaillée et de silhouette lointaine sont indépendantes** : voir une montagne ne signifie pas charger ses arbres, collisions et PNJ.
- Utiliser **LOD terrain/silhouettes 3D** pour les reliefs, **imposteurs/panoramas** pour les éléments dont la parallaxe lointaine reste acceptable ; skybox pour le ciel.
- Bâtiments, végétation, eau, PNJ et personnages ont leurs **propres LOD / budgets** ; l'efficacité des imposteurs dépend aussi de la transparence/overdraw et du nombre de draw calls.
- Prioriser les vues de crête, planage, océan/îles et panorama 360°, ainsi que l'absence de trous, clignotements et transitions abruptes.
- Distance de vue, seuils de LOD, altitude et budgets d'images de fond sont **à mesurer**, jamais fixés définitivement d'après les exemples.
- Conserver les **30/20 FPS** sans diminuer la vitesse de simulation ; tout proxy lointain est une représentation graphique, pas un changement de gameplay.

## Politique validée — herbe courte et herbe haute quasi gratuite

Référence détaillée : [18 — Herbes ultra-low-resource](18-GRASS-LOW-RESOURCE.md).

- **Herbe courte** : couleur/motifs du terrain, pas un mesh par brin. **Herbe haute** : quelques centaines de touffes opaques très simples, `InstancedMesh` par cellules proches, matériau partagé, **aucune ombre**.
- **Aucune physique/rig ni mise à jour CPU individuelle** ; placement déterministe par biome/seed/cellule, recalcul seulement si entrée de zone ou édition.
- Vent et réaction des personnages : **déformation locale dans un vertex shader**, racines fixées ; désactiver totalement l'effet si budget saturé.
- **Profils adaptatifs** : `groundOnly` (aucune herbe 3D), ultra-économique (5–7 m), équilibré (8–12 m), dense (12–18 m). Distances/instances **expérimentales à étalonner**.
- **Budget commun** avec arbres, bâtiments, foules et horizon : préserver d'abord silhouette du paysage et vitesse de simulation, dégrader l'herbe cosmétique avant la vue panoramique.
- Cibles de benchmark additionnelles : **CPU < 0,1 ms/frame**, **GPU < 0,5 ms/frame**, **1–4 draw calls** et **< 2 Mio GPU** de ressources pour l'herbe ; non garantis/mesurés.
- **Futur multijoueur** : aucune synchronisation d'herbe. Utiliser positions de 1–2 avatars prioritaires, texture d'influence optionnelle seulement après mesure ; **aucun traitement de tous les joueurs dans chaque sommet**.
- Lointain : couleur de terrain et silhouettes/proxies du document 17, **sans brouillard ni bande d'arrêt visible**.

## Environnement : budget commun pour soleil, nuages, étoiles, lunes, neige et ombres

**Contrat validé** : [19 — Météo et ciel LOW-RESOURCE](19-ENVIRONMENT-WEATHER-SKY.md).

- **Ciel unique** pour ciel diurne, crépuscules, nuit étoilée et lunes à périodes indépendantes. Pas de mesh/light par étoile ou lune, pas de nuages volumétriques.
- Neige accumulée/fonte selon macro-climat, altitude et température ; **masques de matériaux et uniformes** sur terrain/toitures/arbres/rochers/proxies d'horizon, sans reconstruction de terrain.
- Précipitations pluie/neige en **instances locales limitées à la caméra**, vent commun au shader d'herbe/arbres et aux nuages ; aucun calcul par goutte/flocon sur CPU.
- **Ombres** : uniquement grands objets et proches/essentiels, **1 shadow map solaire locale (512² ou 1024² à mesurer)** en qualité normale, mode minimum **OFF**, herbes et objets éloignés exclus, lune et lanternes sans shadow map par défaut.
- Ombres à actualiser suivant caméra/casters/soleil, **pas à fréquence arbitraire de 2 Hz** si joueur en mouvement ; stabiliser le mouvement de la shadow map.
- **Fog autorisé seulement comme météo** ; toujours interdit pour cacher les limites du terrain et les trous de LOD.
- Adapter particules, nuages, puis ombres avant d'amputer la silhouette de l'horizon ou la stabilité du temps logique.
- **Cibles d'essai hors ombres** : CPU < 0,2 ms/frame, GPU < 1 ms/frame, 1–4 draw calls météo, 1–4 Mio GPU ; non mesurées. **Ombres** à benchmarker et comptabiliser **séparément**.

## Politique GLB/presets/cartes importées depuis Blender

**Contrat** : [20 — Blender, packs de presets et import/export portable](20-BLENDER-STUDIO-INTERCHANGE.md). Blender fournit la géométrie ; le Studio fournit les règles de contenu et les instances ; le compilateur produit **un runtime sectorisé, non une scène monolithique**.

- **Réutiliser les mêmes GLB** pour beaucoup d'instances ; regrouper les répétitions en `InstancedMesh` par secteurs visibles et fusionner décorations fixes seulement si rentable.
- Prévoir **LOD/proxies** pour bâtiments, falaises, arbres et objets lointains, en conservant le rendu d'horizon sans brouillard ; ne pas ajouter une copie détaillée par placement.
- Limiter nombre de matériaux, draw calls, textures et transparences dès le **préflight**. Budget de triangles et taille de textures **mesurés**, pas imposés arbitrairement comme preuve de FPS.
- Les **sources `.blend`** et l'archive V3 auteur sont facultatives dans le workspace de création, **exclues du build jouable**.
- **Import ZIP/glTF sécurisé** : limites taille décompressée, profondeur des nœuds, références externes et extensions, vérification des licences et de la VRAM approximative.
- Les biotopes et herbes proviennent de **recettes du Studio**, pas d'un GLB contenant des milliers de touffes. Masques/heightfields sont chargés/compiler par zones.
- **Pas de GLB unique pour 100 km²** ni téléchargement de tous les assets au spawn ; le manifeste/runtime choisit les secteurs nécessaires.
- Compression glTF/textures seulement après comparaison du **temps de décodage vs transfert/VRAM** sur matériel bas de gamme.

## Eau : même politique LOW-RESOURCE de profondeur de vue que terrain et végétation

**Décision validée :** [21 — Hydrographie et eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

- **Distinguer réseau d'eau auteur, volumes gameplay et surfaces graphiques** : piscine/lac/rivière, nage et bateau toujours exacts quand l'eau ne montre aucune vague.
- Tracé de spline et adaptation **au dénivelé** calculés à l'édition/compilation ; rivière non ascendante, pentes/rapides/cascades à niveaux haut/bas explicites, lit creusé **localement**, pas simulation fluide.
- **WaterLODManager** : près (effets locaux facultatifs), intermédiaire (shader/ondulations simplifiés), lointain (surface presque fixe, couleur du ciel), horizon (très peu de faces **et** d'instructions de shader). **Pas de vagues, mousse ou particules à grande distance**.
- **Océan visible jusqu'à l'horizon** sans fog-cache, mais patches/anneaux et masques de côte empêchent de dessiner l'eau sur les îles ; phasage des petites vagues **ancré au monde** et LOD sans fissure.
- **Limiter le coût fragmentaire** d'une surface d'eau très grande : préférer matériaux opaques stylisés, transparence locale, pas de réflexion/refraction seconde caméra, SSR, FFT, grosses passes ou surcouches.
- **Sous l'eau** : teinte/visibilité selon volume et caméra avec hystérésis ; aucun rendu sous-marin secondaire obligatoire. Chute d'eau ≠ bassin nageable par défaut.
- Effets d'écume, rapides et cascade : quelques rubans UV animés et sprites proches facultatifs, jamais des milliers de gouttes CPU. Vent global partagé et courant logique interrogé uniquement pour acteurs pertinents.
- Budgets **CPU/GPU à mesurer** (cibles indicatives < 0,1–0,2 ms CPU/frame récurrent et < 0,5–1 ms GPU par scène si possible), indépendamment du nombre de triangles ; garder FPS 30/20 en surcharge globale.
- Les distances illustratives **0–15, 15–60, 60–250, >250 m** ne sont pas des seuils fixes ; distance projetée, angle, altitude, budget réel et hystérésis dominent.

## Gestion globale PERF : un arbitre pour tous les budgets

**Décision validée** : [22 — ResourceBudgetManager transversal](22-RESOURCE-BUDGET-MANAGER.md).

- **Migrer `PresentationBudget` actuel vers un arbitre unique**, réutiliser `FrameClock` sans deuxième RAF ni second régulateur de qualité. Politique en vigueur **baisse ~3 s / restauration ~12 s** (à étalonner), 30/20 FPS **de présentation**, simulation 30 Hz indépendante.
- **Profils** Auto (par défaut)/Éco/Équilibré/Qualité ; **plafonds** de qualité, pas une demande de dépasser les limites. Un snapshot de quotas commun pilote terrain/horizon, GLB, herbe, eau, ombres, météo, PNJ et Studio.
- **Mesures** p50/p95/p99 et frames longues, CPU simulation/update/soumission, appels/triangles, files de chargement. **Temps de soumission WebGL JS ≠ GPU** ; timer GPU facultatif asynchrone, mémoire CPU/VRAM **estimée**, et absence de mesure explicitement affichée.
- **LOD selon erreur/taille projetée et importance**, pas simple distance fixe ; précharger devant le joueur en planage/bateau, préserver montagnes/îles/océan jusqu'à l'horizon **sans fog de camouflage**.
- **Streaming à budget** : priorité d'accès critique/visible/prédictif/cosmétique, quotas CPU et uploads, invalidation/cancellation des jobs obsolètes, fallback de LOD visible. Deux builds de terrain par frame ne suffisent pas à borner les pics si leur coût varie.
- **Mémoire** : registre d'ownership/refcounts pour GLB/texture/geometry, cache en **octets estimés** avec éviction des ressources non actives, aucun `dispose()` de ressource encore partagée ; reprise après perte de contexte WebGL à tester.
- **Dégradation du cosmétique avant fonctionnel** : particules/ombres/herbe/détails réduits, qualité GPU adaptative et 20 FPS seulement en dernier ressort, **jamais** de changement de vitesse du monde, de collisions, d'interactions ou de suppression de vue lointaine.
- **Studio** : rendu à la demande si idle, files de génération/import et compilations par secteur, édition et Undo/Redo toujours réactifs.
- **Ne pas fixer seuils supplémentaires** RAM/VRAM/frame/LOD ni déclarer 30/20 FPS atteints sur GPU intégré d'après SwiftShader ; toute amélioration doit être mesurée et reliée à sa qualité effective.

## Mines : extraction multi-niveaux LOW-RESOURCE, sans voxels mondiaux

**Choix validé :** [24 — Mines creusables 2,5D](24-MINES-MULTILEVEL-LOW-RESOURCE.md).

- **Mines limitées à des zones autorisées**, **grille 2,5D par niveau**, étages reliés par rampes/escaliers/puits, **heightfield de surface intact** sauf entrée contrôlée.
- Générer/afficher **uniquement faces de roche exposées** et regrouper les surfaces coplanaires si rentable ; **pas un mesh/collider par cube** et pas de stockage volumique pour 100 km².
- 1 m/cellule, 32×32/chunk, 3–8 niveaux **valeurs expérimentales** ; cellule à 1 octet = 1 Kio brute pour un champ, pas mémoire GPU totale ni état persistant.
- Creusement → **mise à jour locale** de collision, mesh, navigation et données de récolte, avec budget CPU/remeshing et tâches versionnées ; aucune compilation du monde entier à chaque frappe.
- N'afficher que galeries/étages réellement proches et visibles, **culling intérieur/portails**, couleurs de sommets et très peu de sources lumineuses **sans shadow maps par torche**, cristaux instanciés proches.
- **PERF** arbitre cache des mine chunks, géométries/GLB partagées et uploads ; la physique et l'inventaire **ne se dégradent jamais** avec le LOD.
- Métaux/cristaux issus de **gisements déterministes et épuisables**, non un objet physique par éclat ; collectes et modifications persistées en **état joueur** distinct de Studio.
- **Serveur futur** : intention de creusement et **deltas de cellules seulement**, validation de portée/outils et transaction creusement+inventaire. Le jeu solo statique n'implémente pas le backend.
- Vérifier les connexions de niveaux, l'entrée de terrain, collision XYZ et interactions avec eau/mer avant d'ouvrir le creusement.

## AGRI : parcelles riches en règles, coûts minimes en temps réel

**Décision :** [25 — Agriculture LOW-RESOURCE](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md).

- Agriculture **facultative**, enfermée dans **parcelles polygonales** et un petit nombre de sous-zones ; **une simulation agronomique par zone**, pas des milliers de plants simulés ou des objets de collision par culture.
- Croissance/soins/maturité **différés** à l'action, consultation autorisée ou échéance, avec **temps du monde + météo historique agrégée et versionnée**. Pas de **30 Hz** agricole ni de simulation de pluie/eau pour chaque plant.
- **Rendu LOD par caméra** : `InstancedMesh` proche, rangs agrégés en distance moyenne, **teinte/masque du champ au loin**, animation vent/ombres/effets coupés lorsque non perceptibles. Les informations du propriétaire ne justifient pas plus de triangles à caméra égale.
- **Passant** reçoit état public compact sans données privées ; **agriculteur** reçoit détails/commandes suivant droits, mêmes états et résultats. LOD graphique **indépendant** de droits/réseau.
- Fertilité/humidité/santé/parasites/rotation/rendement sont des **scalaires/états agrégés bornés**, calculés à échéances ; historique climatique et actions stockés/compactés, pas de minuteur par parcelle.
- **PERF** limite caches de rendu, génération/instances, file de simulation/échéances et mémoire. Surface cultivée exclut l'herbe naturelle en doublon; compatibilité eau/neige/pentes.
- Valeurs de mémoire, nombre de parcelles, profils d'espèces et distances LOD **à mesurer sur GPU intégré et navigateur** avant toute garantie de ressources.

## 3. Rendu 3D

- Three.js/WebGL2, **peu de matériaux**, éclairage simple, limiter les ombres portées dynamiques et la transparence.
- Rendu low-poly organique : **vertex colors** et palette partagée avant les textures uniques.
- `InstancedMesh` pour arbres, rochers, plantes et objets répétitifs **par secteur visible**.
- Partage des `BufferGeometry`, matériaux, textures et animations ; disposer seulement lorsque personne ne les utilise.
- Aucun maillage individuel par brin d'herbe, insecte minuscule ou détail décoratif sans intérêt de gameplay.
- LOD pour terrain, arbres et objets visibles de loin ; décors d'horizon extrêmement simplifiés.
- Pas d'effets coûteux systématiques (SSAO, volumétrie, reflets temps réel, fluides physiques) sans benchmark favorable.
- Calculer la **couleur sous-marine selon la caméra**, pas selon l'état de plongée du joueur ; éviter une seconde scène complexe.

## 4. Carte et génération

**Périmètre approuvé :** une seule carte géographique continue par partie, limite de format 100 km², jamais intégralement simulée en détail. Les éditeurs spécialisés du Studio partagent IDs, historique et données auteur ([12 — Limites](12-PROJECT-SCOPE.md), [13 — Studio](13-STUDIO-UX-ARCHITECTURE.md)).

- Carte et biotopes **compilés hors de la boucle de jeu** ; le runtime charge des données statiques plus les états interactifs locaux.
- `WorldConfig` versionné pour les dimensions ; supprimer à terme les limites `200 × 600` dispersées dans le code.
- Chunks de taille **proposée : 64 × 64 m**, paramétrables, avec identifiant, limites spatiales et version.
- Chargement progressif uniquement quand les tests montrent qu'il est utile ; ne pas sur-architecturer le monde actuel.
- Prévoir **LOD 0/1/2**, frustum culling et maillage terrain cohérent aux frontières.
- Les vues aériennes du planage nécessitent une **silhouette de terrain lointain disponible** sans activer toute la faune, la végétation et les collisions.
- Génération par graine déterministe, overrides manuels préservés ; recompilation **locale aux secteurs concernés**.
- Priorité à une petite carte riche et stable avant une grande carte vide.

## 5. Physique et collisions

- **Un contrôleur joueur principal**, sans simulation physique des décorations.
- Terrain : hauteur analytique/heightfield ou collider statique simplifié.
- Bateau : mouvement arcade, surface et profondeur navigable ; collisions complexes uniquement si nécessaires.
- Bâtiments : boîtes/capsules/colliders composés simples.
- PNJ : mouvement cinématique, navigation limitée aux zones pertinentes.
- Arbres : collision du tronc seulement lorsque utile ; feuillages sans collisions.
- Poissons, insectes, particules : **aucun rigid body individuel**.
- Rapier **optionnel au cas par cas** : l'ajouter seulement si les collisions réelles justifient son coût en code et en CPU.

## 6. Joueur, rigging et animations

- Viser **environ 16–24 os** pour l'écureuil comme point de départ, puis vérifier l'efficacité visuelle (pas de plafond dur).
- Un GLB compact avec animations réutilisées, points d'attache pour chapeau, sac, pendentif/écharpe.
- Membrane visible **uniquement en planage**, déploiement par animation simple, sans simulation de tissu.
- Expressions faciales peu coûteuses ; ne pas ajouter des matériaux/meshes animés excessifs par émotion.
- Interpoler les animations à l'affichage ; éviter une logique métier couplée au `AnimationMixer`.
- En premier, optimiser le **personnage joueur visible en permanence** ; ne pas ajouter plusieurs rigs complets pour la faune décorative.

## 7. PNJ, oiseaux, insectes et poissons

**Choix approuvé :** PNJ animaux et créatures sans humains, réutilisation du rig/variantes du joueur si compatible ; **navigation spatialement libre et avancée**, mais routines/activités simples. Privilégier trajets hiérarchiques par secteurs et calcul sur événement plutôt que la simulation détaillée de tous les habitants.

**Trois classes de coûts, avec budgets de fréquence distincts :**

| Catégorie | Proche et visible | Éloigné / masqué |
| --- | --- | --- |
| Joueur et bateau actif | **30 Hz simulation** | Toujours fiable (élément contrôlé) |
| PNJ interactif | Décisions **5–10 Hz**, animation interpolée | **1–2 Hz** ou état dormant |
| Oiseaux | Décisions simples **5–10 Hz** | Trajectoire analytique ou suspendue |
| Bancs de poissons | Décision **5–10 Hz par groupe**, positions légères | Groupe inactif hors secteur |
| Insectes / lucioles | Mouvement GPU/procédural ; contrôle **2–5 Hz** si nécessaire | Aucun update individuel |
| Végétation | Sans simulation CPU par plante | Static instancing, vent GPU léger si utile |

Ce sont des **ordres de grandeur**, pas des fréquences garanties. Une animation 3D peut rester interpolée à 30/20 FPS pendant que la logique PNJ tourne à 5 Hz.

- Éviter d'avoir un `requestAnimationFrame` propre à chaque PNJ, poisson ou objet.
- Utiliser un **scheduler central**, avec budgets et niveaux d'activité.
- Chaque PNJ proche possède une machine à états simple ; les animaux décoratifs utilisent des trajectoires/groupes.
- Ne pas recalculer les chemins, la proximité ou les voisins de toutes les entités chaque frame.
- À distance : entité dormante, ou état calculable directement à partir du temps et de la graine.

## Audio/MIDI : palette de 5–10 instruments et budget propre sous PERF

**Décision :** [23 — Audio LOW-RESOURCE](23-MIDI-AUDIO-LOW-RESOURCE.md). Little World ne chargera **pas** de banque General MIDI complète. Le jeu utilisera **5–10 patches musicaux maximum** partagés (formes d'onde/enveloppes simples, parfois courts samples), un petit `MidiSequencer` et des **échantillons courts/ambiance** pour les sons naturels.

- **Un AudioContext**, musique/SFX/ambiance mixés, voix musicales et émetteurs actifs plafonnés ; 5–10 timbres **≠** seulement 5–10 notes simultanées.
- Budget expérimental **Eco 12 / Équilibré 16 / Qualité 24 voix totales**, notes musicales 6–8 / 10–12 / 12–16, émetteurs spatiaux 2/4/6, et cache PCM ~2–4 / 4–8 / 8–16 Mio. **À mesurer**, ne pas présenter comme des limites garanties.
- Prioriser **sons de gameplay et du joueur** avant ambiance, oiseaux lointains et décor. Émettre uniquement les sons réellement audibles, conserver 1–2 couches d'ambiance par biome, petits fade-outs et voice stealing propres.
- **Web Audio natif**, `equalpower` par défaut, pas de reverb par voix/HRTF généralisé ; `AudioWorklet` seulement si les mesures le justifient, pas de grosse SoundFont.
- MIDI `.mid` joué par séquenceur sur **l'horloge audio** avec lookahead, jamais en déclenchant chaque note depuis le RAF/jeu ; les rythmes doivent rester stables à **20/30 FPS** et lors du retour d'onglet.
- Échantillons décodés **réutilisés** et comptés en PCM, pas de décodage par PNJ : 48 kHz mono Float32 ≈192 ko/s. Décodeurs/codec et coût CPU/latence à mesurer sous Firefox/Chromium.
- **AudioBudgetManager consommateur de PERF** pour plafonds, cache, nombre de voix et sources ; aucun deuxième contrôleur adaptatif concurrent.
- Son activé par **interaction utilisateur**, mode muet/silencieux fiable en cas d'autoplay bloqué. Le MIDI matériel/Web MIDI API reste non nécessaire.
- Bibliothèque Studio/export V3 : partitions, patches, loops, licences et références, sans graphes audio live ni données PCM réencodées dans le projet.

## 8. Eau, ambiance et audio

- Eau : surface visuelle simple + volumes logiques d'immersion distincts.
- Pas de fluides, collision de particules d'eau ou vagues physiquement simulées.
- Bateau et roue de moulin : animation calculée à partir de paramètres/état, sans simulation de toutes leurs pièces.
- Sons localisés et recyclés ; limiter les sources simultanément actives.
- Ambiance par biotope : une couche sonore de fond et quelques événements, pas des dizaines de sons indépendants.
- Particules et magie naturelle : instances/sprites regroupés avec densité plafonnée.

## 9. Assets, téléchargement et mémoire

- Assets du jeu **locaux au dépôt / GitHub Pages** ; le navigateur ne dépend d'aucun service externe.
- Formats GLB optimisés, contrôle automatique des triangles, matériaux, textures, animations et licences.
- Préférer un faible nombre de modèles avec variations d'échelle/couleur aux centaines de fichiers similaires.
- Atlas quand utile ; ne pas introduire la compression de textures (KTX2) ou de meshes avant des mesures montrant le gain net (décompression CPU incluse).
- Ne télécharger en premier que le personnage, le terrain et les ressources visibles autour du spawn. Les autres zones pourront charger ensuite.
- Cache de ressources avec cycle de vie explicite ; **pas de fuite** lors de la régénération répétée dans l'éditeur.
- Séparer **bundle jeu** et **bundle éditeur**, pour ne pas faire télécharger les outils de sculpture aux joueurs.

## 10. Éditeur LOW-RESOURCE

Le Studio a **plusieurs éditeurs spécialisés**, mais un projet/une carte continus et un historique commun. Charger dynamiquement l'éditeur actif ; la vue mondiale est 2D/simplifiée. Séparer les brouillons auteur des **plusieurs slots de partie joueur**.

- Outils de sculpture/peinture : mettre à jour **la zone affectée**, pas le terrain entier.
- Prévisualisation légère pendant un glisser-déposer ; calculs définitifs en fin d'opération ou par lots.
- Recalcul asynchrone/Worker **uniquement si** les opérations bloquent l'UI selon les mesures.
- Végétation générée de façon déterministe ; instances regroupées par secteur.
- Sauvegarde IndexedDB et export/import JSON ; sérialiser par lots si les cartes deviennent importantes.
- Utiliser les mêmes données source que le jeu, mais **compiler les rendus et collisions pour le runtime**.
- Masquer les calques non édités ; limiter les overlays complexes.
- Quand l'éditeur est inactif, arrêter les rendus inutiles ou passer à un mode événementiel.
- Mesurer aussi le coût des sessions d'édition longues : nombre de régénérations, fuites GPU, temps d'undo/redo.

## 11. Stratégie de mesure et gates

Scénarios minimum, toujours testés dans le **build de production** et sur GitHub Pages lorsque possible :
1. Départ dans la vallée, caméra fixe puis rotation au clic-glissé.
2. Traversée de forêt dense.
3. Planage en hauteur avec très grand champ de vision.
4. Nage/plongée et transition caméra sous l'eau.
5. Navigation en bateau et approche du port.
6. Village/moulin avec PNJ et animations.
7. Rivière avec poissons, insectes et végétation dense.
8. Éditeur après 20 modifications locales, plusieurs undo/redo et 10 régénérations.
9. Carte étendue synthétique (1 × 1 km puis 2 × 2 km **si le moteur est prêt**, sans prétendre à un contenu final).

Pour chaque scénario, conserver :
- Commit, navigateur, matériel, résolution, réglage qualité, dimensions du monde.
- Moyenne FPS, FPS bas (p. ex. 1 % low), intervalles p50/p95 et pics de frametime.
- Draw calls, triangles visibles, temps de simulation et de rendu si instrumentés.
- Taille téléchargée au démarrage et à l'arrivée dans une nouvelle zone.
- Mémoire approximative lorsque disponible, compte d'objets/chunks actifs.
- Résultat avant/après **sur la même scène**, sans extrapoler depuis une seule capture.

### Gate de livraison

- **PASS** : jeu jouable à 30 Hz nominal sur le PC de référence, sans blocage majeur ni perte d'inputs ; 20 Hz utilisables en secours ; pas de fuite croissante sur parcours/édition longs.
- **PARTIAL** : la baisse à 20 Hz reste fréquente ou le rendu comporte des à-coups ; conserver la fonctionnalité mais documenter le profil en échec.
- **FAIL** : simulation ralentie à 20 FPS, logique cassée, déplacements incohérents, chargements bloquants répétés, dépassement mémoire manifeste ou régression majeure mesurée.

**Ne pas déclencher un FAIL sur les seuls triangles ou draw calls** si la performance réelle est bonne ; ce sont des garde-fous indicatifs. La fluidité, la stabilité et les ressources effectivement mesurées priment.

## 12. Ordre de mise en œuvre conseillé

1. **Instrumenter et fixer le rythme nominal 30 Hz / secours 20 FPS** ; prouver l'indépendance simulation/rendu.
2. Mesurer la **base actuelle** sur un PC connu, en forêt, planage, eau, bateau et éditeur.
3. Finir caches GPU, instancing et culling ; **aucune fuite au rechargement d'une carte**.
4. Compiler la carte en secteurs et ajouter LOD si les benchmarks le justifient.
5. Introduire le scheduler des PNJ/faune avant d'ajouter beaucoup d'entités.
6. Optimiser les assets et réduire les téléchargements.
7. Ajouter du streaming asynchrone et un cache LRU **uniquement lorsque la taille étendue l'exige**.

Les étapes 1–2 sont prioritaires : aucun budget n'est considéré atteint sans instrumentation.

## Compatibilité LOW-RESOURCE du futur multijoueur (hors jeu solo)

Référence : [16 — Multijoueur futur, AOI et foules](16-FUTURE-MULTIPLAYER.md).

- **Client GPU intégré** : LOD des personnages/rigs/animations/ombres et budget plafonné pour les avatars détaillés, indépendant du nombre total de joueurs connectés.
- **Simulation** : jeu à pas fixe et scheduler PNJ/faune existants restent locaux ; un éventuel serveur futur possède une cadence propre. Ne pas faire varier vitesse de jeu ou taux de rendu au rythme des snapshots réseau.
- **Réplication future** : AOI et priorités pour réduire les destinataires ; mouvement 2–20 Hz selon intérêt, 2–3 Hz pour personnages secondaires d'une foule, éventuellement 0 hors intérêt ; événements et interactions critiques prioritaires.
- **Grosse foule** : mesurer nombre d'avatars visibles/détaillés, animation CPU, triangles/draw calls, réseau et latence d'interaction **séparément**.
- **Secteurs** : chunk de terrain, zone de simulation et zone d'intérêt restent des notions indépendantes.
- **Non-objectif actuel** : aucun serveur/socket/Protocole réseau nécessaire pour atteindre le budget solo 30/20 FPS.
- **Aucun résultat 200/500 joueurs n'est revendiqué**, les cibles seront validées par benchmarks au lancement du chantier multijoueur.

## 13. Décisions et évolution de la politique

- **Validé par l'utilisateur :** 30 Hz normalement, possibilité de descendre à 20 Hz.
- **Proposé pour le moteur :** simulation joueur à pas fixe de 30 Hz indépendamment de l'affichage.
- **Provisoire à mesurer :** tous les plafonds numériques de mémoire, poids, draw calls, triangles et seuils de dégradation.
- **Hors V1 :** backend et multijoueur.
- Toute optimisation doit préserver les comportements et les contrôles validés (écureuil, accessoires, planage, nage, plongée, bateau et éditeur).
