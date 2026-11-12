# Little World — instructions pour Codex et autres agents de développement

> **Rendu panoramique sans brouillard :** [17 — Horizon lointain, LOD et imposteurs](docs/17-DISTANT-VIEW-RENDERING.md). Priorité à la silhouette réelle, au proxy 3D lointain et aux gains mesurables ; ne pas masquer les distances par du fog.
>
> **Lire d'abord** : [Périmètre final](docs/12-PROJECT-SCOPE.md), [Architecture UX du Studio](docs/13-STUDIO-UX-ARCHITECTURE.md), **[Contrats V3 du Studio](docs/15-STUDIO-DATA-SCHEMAS-V3.md)**, **[Décisions techniques validées](docs/14-TECHNICAL-CHOICES.md)**, [Décisions](docs/DECISIONS.md), [Budget LOW-RESOURCE](docs/11-LOW-RESOURCE-POLICY.md), puis [Architecture technique](docs/05-TECHNICAL-ARCHITECTURE.md) et [Roadmap](docs/07-ROADMAP.md).
>
> **Multijoueur ultérieur seulement :** [16 — Architecture future, intérêt spatial, fréquences adaptatives et foules](docs/16-FUTURE-MULTIPLAYER.md). Ces choix sont des contraintes de compatibilité V3, **pas** un ordre d'ajouter un réseau/serveur au jeu solo.
>
> Ces documents sont les **sources de vérité du périmètre fonctionnel**. En cas de contradiction avec une ancienne description du prototype, appliquer les décisions validées les plus récentes. **Ne pas supposer qu'une fonction décrite est déjà codée.**

## 1. Limites validées

- **Jeu solo PC**, Three.js / TypeScript / Vite, **GitHub Pages statique** ; pas de backend obligatoire, serveur de jeu, comptes ou multijoueur.
- **Une seule carte continue par monde/partie**, jusqu'à **10 × 10 km maximum** comme limite de **format/architecture**, pas performance démontrée. **Prototype actuel : 200 × 600 m**.
- **Exploration paisible avec de nombreuses petites activités facultatives** : collecte/inventaire léger, pêche éventuelle, petites missions, énigmes, dialogues à choix, quelques intérieurs, conséquences persistantes et **plusieurs sauvegardes de partie locales**.
- **Pas d'humains** : PNJ animaux/créatures uniquement, variantes du personnage joueur quand morphologies/rigs compatibles. **Navigation libre avancée** mais comportements sociaux/routines simples ; pas de combat, survie punitive ou RPG lourd.
- **Plusieurs éditeurs spécialisés** dans Little World Studio : carte globale, terrain, eau/chemins, biotopes/faune, bâtiments, personnages/PNJ, dialogues, événements/actions, assets et tests. **Un seul projet partagé**, IDs, sélection et Undo/Redo cohérents. Outils génériques avant décors ad hoc.
- **Interactions déclaratives** : déclencheurs, conditions ET/OU, séquences, liens entre objets, états temporaires/persistants. Pas de JS arbitraire provenant d'une carte.
- **30 FPS normal, 20 FPS secours**, sans ralentissement du monde ; simulation à pas fixe indépendante du rendu (30 Hz implémentés et testés sur cette branche ; l’atteinte des cibles FPS doit être vérifiée sur PC de référence).
- Le joueur ne modifie **pas** le terrain de manière permanente ; l'auteur peut le modifier dans le Studio.
- Réutilisation des assets avec licence de redistribution publique (CC0/originaux prioritaires), catalogue local, aucun CDN/runtime externe obligatoire.

## 1 bis. Choix techniques transversaux approuvés

**Toutes les recommandations du tableau de décisions techniques ont été validées** : voir [14 — Décisions techniques](docs/14-TECHNICAL-CHOICES.md) pour les IDs uniques `TW-*`, `TE-*`, `TP-*`, `TL-*`, `TG-*`, `TA-*`, `TT-*`, `TD-*`.

Conséquences prioritaires :
- Terrain **multi-résolution** et chunks/LOD/streaming, géographie continue.
- Studio à **plusieurs éditeurs spécialisés**, vue globale 2D et édition 3D locale, prefabs/overrides, historique **transactionnel commun avec checkpoints**.
- Familles de rigs réutilisables ; PNJ à **navigation libre hiérarchique**, mais activités pilotées par états simples et **horloge commune**.
- Logique de gameplay déclarative, variables typées à portée définie, séquences d'actions et dialogues à choix ; **pas de scripts carte arbitraires**.
- Activités par templates (collecte, pêche légère, énigme, petite mission), inventaire léger et slots de sauvegarde distincts des projets Studio.
- PC standard **GPU intégré** visé, profil indicatif 8 Go RAM / 1600 × 900 ; **ni FPS ni capacité 100 km² garantis avant benchmark**.

**Ne pas reposer ces choix comme des questions ouvertes.** Les détails de quantification (pas de terrain, taille de chunks, VRAM, nombre de PNJ, distances LOD) doivent être calibrés par mesures et documentés comme tels.

## 1 ter. Architecture V3 du Studio — acceptée comme cible

Voir **[15 — Schémas V3 et contrats entre éditeurs](docs/15-STUDIO-DATA-SCHEMAS-V3.md)** pour les schémas source/compilé/partie, IDs stables, références entre secteurs, composants, prefabs/overrides, dialogue/behaviors/actions, `StudioContext`, transaction bus, checkpoints et migration V1/V2.

**Obligations pour tout code V3 :**
- Garder la lecture V1/V2 pendant la transition ; écrire une migration **pure, non destructive et testée** vers V3, pas simplement augmenter le plafond de `parseWorld`.
- **Un projet source ≠ monde compilé ≠ sauvegarde joueur**, avec schémas, versions et stockages séparés.
- Sources par secteurs + manifeste global + index d'entités/relations ; références inter-secteurs disponibles même si un secteur est déchargé.
- Entités à **composants typés** et prefabs avec overrides ; ne pas introduire un ECS ou un framework supplémentaire sans nécessité mesurée.
- Remplacer l'historique de **copies complètes** par commandes réversibles/transactions et checkpoints ; une opération de pinceau = une transaction.
- Partager IDs, sélection, historique et validation entre les éditeurs spécialisés ; inspecteurs orientés utilisateur.
- Validation incrémentale et diagnostics navigables ; compilation stricte, puis build statique avec index/chunks.
- Ne pas annoncer le V3 « livré » sans migration, tests sur vrais projets et vérification navigateur.

## 1 quater. Préparer le futur multijoueur sans l'implémenter maintenant

La spécification [16 — Future Multiplayer](docs/16-FUTURE-MULTIPLAYER.md) prévoit **30 joueurs en premier jalon**, **200 comme cible principale** et **500 comme scénario expérimental**, **aucune capacité garantie ni mesurée**.

Préserver dès V3 : **IDs stables**, index spatial, séparation données auteur / état logique / rendu, événements typés et persistants, simulation décorrélée, supports LOD et secteurs. Les chunks de données, zones de simulation et ensembles d'intérêt réseau sont distincts.

**À NE PAS implémenter pendant la campagne solo/Studio actuelle :** sockets, backend, Colyseus, réplication, protocole binaire, comptes, serveur autoritaire, code réseau dans les composants ou métadonnées `ReplicationHints` obligatoires. Ces éléments sont reportés jusqu'au jalon multijoueur explicite.

**Politique réseau future** : mouvements cadencés par intérêt de 0 à 20 Hz (2–3 Hz pour personnages secondaires en foule), événements importants envoyés en priorité, simulation serveur indépendante, rendu client 30/20 FPS. Ne pas ralentir les règles de jeu ou les interactions à 2 Hz.

## 1 quinquies. Vue panoramique sans brouillard — décision validée

Lire [17 — Rendu longue portée](docs/17-DISTANT-VIEW-RENDERING.md). Dans le jeu solo ET le futur monde partagé :

- **Aucun brouillard utilisé comme cache** pour les limites de rendu. Conserver montagnes, côtes et îles visibles au loin.
- **Séparer** le terrain/objets détaillés du **relief d'horizon ultra-léger** ; privilégier une géométrie de crête 3D pour le paysage approchable et des imposteurs/panoramas seulement lorsque la parallaxe reste crédible.
- Terrain multi-LOD à erreur projetée écran, hystérésis, transitions sans trous, préchargement en déplacement/planage ; végétation, bâtiments, avatars et eau avec profils de détails distincts.
- La source V3 est **indépendante** des proxies, imposteurs, atlas et textures de fond **compilés** ; invalidation locale après édition.
- Mesurer **draw calls, overdraw, mémoire GPU, uploads, temps de frame, popping** et consommation CPU, pas uniquement le nombre de triangles.
- N'imposer **aucune distance LOD** de 100 m / 400 m / 1,5 km comme vérité : ce sont des valeurs de benchmark.
- N'activer ni `logarithmicDepthBuffer` global ni distance caméra far excessive sans test GPU ; tester rendu d'horizon séparé / profondeur inversée si réellement utile.
- **Ne pas confondre** objectif documenté et HZ-0…HZ-6 implémentés ; préserver les LOD et caches actuels.

## Herbes courtes/hautes : priorité LOW-RESOURCE obligatoire

Lire [18 — Herbes ultra-low-resource](docs/18-GRASS-LOW-RESOURCE.md). **Décisions validées :**
- Sol herbeux d'abord assuré par **couleurs/motifs du terrain**, sans maillage par brin ; herbes 3D **facultatives et très locales**.
- Herbes hautes : **2–4 triangles/touffe à tester**, `InstancedMesh` par cellules, shader opaque partagé, **aucune ombre projetée/reçue**.
- **0 animation CPU / rigid body / mise à jour de matrice par touffe et par frame** ; vent et réaction locale au passage des personnages en vertex shader uniquement lorsque utile.
- Réaction à 1–2 personnages prioritaires d'abord ; texture d'influence de foule seulement **après benchmark**, **aucun trafic réseau propre à l'herbe**.
- Génération par `seed + biome + cellule`, sans milliers d'IDs d'herbes dans le V3 ; conserver la stabilité géographique lors du streaming.
- Profils `groundOnly / ultra-économique / équilibré / plus dense` adaptatifs selon **un budget global de végétation/scène**, hystérésis et retour automatique à `groundOnly` si nécessaire.
- **Aucun brouillard de masquage**, et aucun effet sur collisions, simulation ou gameplay ; cibles CPU < 0,1 ms/frame, GPU < 0,5 ms/frame, 1–4 draw calls et < 2 Mio **à mesurer**.
- Ne pas annoncer un shader/éditeur `GrassRenderer` livré tant qu'il n'est pas réellement codé, intégré et benchmarké.

## Environnement et astres : décision LOW-RESOURCE validée

Lire **[19 — Météo, neige, ciel, étoiles, lunes indépendantes et ombres](docs/19-ENVIRONMENT-WEATHER-SKY.md)** avant toute implémentation d'éclairage ou de météo.

- **Une horloge logique et un `EnvironmentState` commun** pour le soleil, le jour/nuit, les nuages, la pluie/neige, le vent, l'orage et le brouillard météorologique.
- **Ciel nocturne étoilé très léger** ; **0/1/plusieurs lunes** avec trajectoire et période propres, phases cohérentes avec le soleil, étoiles/astres sans lumière/mesh individuel coûteux.
- **Neige accumulée distincte de la chute**, température/altitude/fonte, coloration des terrains, toitures, arbres/rochers et proxies d'horizon via masques de matériaux ; pas de reconstruction massive du monde.
- **Ombres locales sélectionnées** : une shadow map solaire au plus en profil normal (512²/1024² à tester), casters grands/proches/importants, herbes et décor éloigné exclus, shadow maps totalement désactivables.
- Pluie/neige sous forme de **particules GPU locales**, ciel/nuages par shader très simple, vent partagé avec végétation ; pas de simulations physiques goutte/flocon ni de nuages volumétriques.
- **Brouillard météorologique autorisé** seulement comme état réel, **interdit comme camouflage** des limites de carte.
- **Menu de test bêta local** : heure accélérée/pausée, météo, température, neige, brouillard, soleil, étoiles, cycles séparés des lunes, ombres/LOD, mesure FPS. Overrides temporaires.
- `EnvironmentStateSource` **interchangeable** : local/test maintenant ; **serveur autoritaire futur** pour heure et états météo. Ne pas ajouter de backend maintenant.
- Garder un budget graphique **global** avec l'herbe, les personnages et l'horizon ; budgets et FPS sont **à benchmarker**, non considérés atteints.

## Blender ↔ Studio, échange ouvert et import/export portable — décision validée

Lire **[20 — Blender, GLB, presets et archives de cartes](docs/20-BLENDER-STUDIO-INTERCHANGE.md)** avant de créer/modifier les outils d'assets, de placements ou d'édition 3D.

- **Blender reste le modeleur 3D** (sources `.blend`), **GLB/glTF 2.0 l'échange 3D ouvert** ; Studio est un éditeur spécialisé **d'assemblage, biotopes, végétation, eau, chemins et logique**, **pas** un clone de Blender.
- **Import et export dans les deux sens** : (a) GLB asset/préfab, (b) scène/sélection vers Blender avec sidecar de correspondance, (c) **preset réutilisable** ZIP+JSON+GLB, (d) **carte V3 entière rééditable** en ZIP portable. **Un GLB seul n'est pas un projet V3 complet**.
- **Transform complètes** : translation XYZ, quaternion, scale XYZ, parent/child, pivots/points d'ancrage ; UI simple déplacement/rotation/échelle, alignement au relief, duplication, groupes, transactions Undo/Redo.
- Respecter **Blender Z-up vs Studio/glTF Y-up**, mètres et conversions **une seule fois**. IDs stables et sidecars/`extras` **validés** : jamais accepter les noms Blender comme uniques vérités ni des scripts depuis un GLB.
- Biotopes et végétation **éditables dans Studio même sur terrain importé de Blender** : zones, densités, exclusions, graines/masques ; pas des milliers de plantes intégrées au GLB.
- Terrain heightfield importable avec **métadonnées de hauteur/échelle/origine/précision** ; grottes/surplombs/falaises en GLB, compilés spatialement et non un monde entier monolithique.
- **Import/round-trip non destructif** : importer un projet en nouveau brouillon par défaut, aperçus ajout/modification/conflit, pas de suppression silencieuse des interactions/PNJ/overrides lors d'un réimport Blender.
- **Portable = ressources réellement incluses** et licences/provenances vérifiées ; mode références léger clairement marqué non autonome. Préflight ZIP/glTF sécurisé, versionnement, limites mémoire, tests et budgets GPU.
- Les sources `.blend` peuvent être conservées **en option**, ne jamais les charger dans le jeu ; les assets compilés doivent profiter des LOD, instancing et streaming.
- **Statut** : contrats prévus ; **ne pas annoncer** le pipeline complet/presets et archives V3 déjà implémentés sur `main`.

## Eau LOW-RESOURCE : réseau, immersion, cascades et horizon — décision validée

Lire **[21 — Eau LOW-RESOURCE, rivières/lacs/mer et LOD](docs/21-WATER-HYDROLOGY-LOW-RESOURCE.md)** avant de toucher aux surfaces d'eau, à la nage/plongée ou au Studio « Eau ».

- **Une seule source hydrographique V3** : tracés orientés, nœuds/jonctions, lacs à niveau constant, rapides, cascades à niveau haut/bas, embouchures. Tracer les rivières depuis Studio et calculer le profil d'altitude, puis creuser **localement** le lit ; signaler les contre-pentes/contradictions au lieu d'inventer des niveaux.
- **Séparation absolue** `WaterNetwork` (auteur), `WaterVolumes` (immersion, profondeur, bateau/courants) et `WaterRenderer` (surfaces/écume) : un LOD graphique n'altère jamais nage/flottabilité/état logique.
- **LOD0–LOD3** commun à rivières/lacs/cascades/océan : proche léger animé, lointain **géométriquement et en shader simplifié**, mer visible à l'horizon ; LOD fonction de taille écran/distance/caméra, sans brouillard-cache.
- Océan en patches ou anneaux camera-relative **uniquement avec masquage des terres/côtes** et motifs stables en coordonnées monde ; éviter une unique surface coûteuse plein écran ou un grand GLB monolithique.
- **Aucune FFT, fluide physique, réflexions miroir par seconde caméra, SSR ou réfraction multi-pass** par défaut. Privilégier shaders opaques/teinte/masques peu profonds ; transparence, mousse et particules **locales, facultatives et benchmarkées**.
- **Sous l'eau** : se fonder sur le **volume où se trouve la caméra**, avec hystérésis et palette/visibilité à faible coût, pas uniquement sur l'état nage du joueur. Cascade verticale ≠ lac navigable.
- Le vent provient de l'environnement, **le courant** du graphe d'eau ; simulations limitées aux acteurs concernés au pas fixe, aucune animation CPU individuelle de particules.
- **Panneau bêta** : niveaux, courants, cascades, profil d'altitude, LOD, vue immergée, coût CPU/GPU. Conserver les données V2 existantes et migrer sans écrasement.
- Budgets LOW-RESOURCE et distances 0–15 / 15–60 / 60–250 / >250 m **illustratifs seulement** : réévaluer après bench sur GPU intégré ; aucune phase WAT considérée implémentée par sa seule documentation.

## PERF transversal — ResourceBudgetManager et limites communes (validé)

**Lire [22 — PERF / ResourceBudgetManager](docs/22-RESOURCE-BUDGET-MANAGER.md)** avant de modifier les LOD, caches, streaming, qualité adaptative, performance HUD ou moteurs eau/ombre/météo/herbe.

- **Un seul contrôleur adaptatif** : faire évoluer `PresentationBudget`, ne **pas** créer un deuxième automate divergent ; `FrameClock` continue de posséder la **simulation 30 Hz** et la présentation **30/20 FPS**.
- `PerfSampler` enregistre p50/p95/p99, longue frame, coûts CPU isolés, calls/triangles, file de génération et mémoire **estimée**. **Soumission WebGL en JS ≠ temps GPU** ; GPU timer WebGL2 asynchrone facultatif, disjoint/absence explicités.
- `ResourceBudgetManager` fournit des **quotas/qualités versionnés** aux consommateurs (terrain/horizon, objets/GLB, écologie/herbe, eau, ombres, météo, PNJ, audio et Studio) ; aucun système ne modifie la qualité globale seul.
- Adapter selon **importance/surface projetée/vitesse/altitude** et **goulot mesuré** : en cas de coût GPU/fill-rate, réduire d'abord la résolution interne ; en cas de coût CPU, réduire génération/détails secondaires ; sinon dégrader prudemment les effets cosmétiques/LOD/ombres. Secours **20 FPS de présentation en dernier recours**. Ne jamais supprimer silhouettes lointaines ni ralentir le monde.
- Gestion **CPU+mémoire+streaming** : temps de création maximal et priorité de file, préchargement devant le joueur, annulation des tâches obsolètes, estimations de RAM/VRAM, caches avec éviction, ownership des GLB partagés (pas de `dispose()` prématuré).
- **Hystérésis** : baisse après surcharge stable et remontée lente (3/12 s prévus actuellement, à calibrer), pas de changement de shader ou rebuild de tous les chunks à chaque frame.
- **Studio** : rendu à la demande si inactif, édition/gizmo immédiat, re-compilation différée et quota de previews ; aucune préférence de qualité runtime dans les archives source V3.
- **Bêta** : panneau Ressources mesurant FPS/frametime, CPU/GPU si disponible, RAM/VRAM estimée, draw calls, secteurs, LOD, qualité effective, raisons du changement ; export JSON de scénarios reproductibles.
- Contrats/étapes **PERF-0…PERF-9** ; seuils et cibles GPU **non qualifiés sans tests sur matériel réel**. Les mesures SwiftShader servent aux régressions, pas à garantir 30/20 FPS sur GPU intégré.

## Audio/MIDI LOW-RESOURCE — 5 à 10 instruments maximum (validé)

Lire **[23 — Audio MIDI, synthèse légère et échantillons](docs/23-MIDI-AUDIO-LOW-RESOURCE.md)** avant toute implémentation de musique, de sons d'ambiance ou d'`AudioEmitter`.

- **5–10 instruments MIDI musicaux maximum** sur l'ensemble du jeu, **pas** 128 instruments GM. Le nombre de patches n'est **pas** le nombre de notes simultanées : polyphonie plafonnée globalement.
- **Un `AudioContext` Web Audio partagé**, synthétiseur léger (oscillateurs/enveloppes et éventuels patches échantillonnés), `MidiSequencer` déterministe en temps audio, et **petit lecteur d'échantillons** pour bruitages naturels (eau/vent/animaux/pas).
- Lecture de **fichiers `.mid` internes** : **Web MIDI API et clavier matériel non nécessaires** ; import SMF type0/1 restreint, mapping des programmes vers les 5–10 timbres, validation et avertissements. Aucune grosse SoundFont/SF2 ou synthèse générale 128 programmes par défaut.
- **Audio 3D uniquement pour sources audibles/proches**, priorité sons de gameplay/joueur avant ambiance décorative ; `equalpower` par défaut et HRTF seulement après tests, voix/échantillons/effets plafonnés.
- `AudioBudgetManager` est **consommateur de `ResourceBudgetManager` (doc 22)**, jamais un second arbitre. Profils éco/équilibré/qualité et cache PCM estimé, avec mesures de glitches et mémoire.
- **MIDI séquencé par horloge `AudioContext.currentTime`** avec lookahead, **pas** selon RAF/30 FPS ni accélération de `WorldClock` ; cohérence des transitions jour/nuit/météo/biome sans décalage musical.
- Autoplay navigateur : premier clic « Jouer » pour unlock/reprise ; mute et **mode silencieux sans erreur** si contexte audio bloqué, fermeture/onglet masqué robustes.
- Le Studio importe `.mid` et quelques samples/loops avec **licence, taille/PCM décodé, mappings de patches**, place des émetteurs, définit ambiances par biome ; ZIP V3 contient les **sources** audio, non les buffers décodés ou états de voix.
- Cibles de ressources/profils **provisoires**, aucune CPU ou compatibilité audio annoncée sans tests Firefox/Chromium. **AUD-0…AUD-8 spécifiés, non livrés**.

## Mines creusables LOW-RESOURCE — galeries 2,5D multi-niveaux (validé)

Lire **[24 — Mines en couches 2,5D et synchronisation des excavations](docs/24-MINES-MULTILEVEL-LOW-RESOURCE.md)** avant de modifier le terrain, les collisions souterraines, l'inventaire, les sauvegardes ou les schémas V3.

- **Décision** : **mines localisées**, grille excavable **2,5D par niveau**, avec **plusieurs étages** reliés par escaliers, rampes et puits explicites. **Heightfield extérieur conservé** ; pas de voxels sur 100 km². GLB pour entrées, rampes, soutènements et décors, pas comme source des cellules creusées.
- **Exception au périmètre précédent** : les joueurs peuvent modifier **durablement les cellules des mines autorisées seulement** ; pas de creusement libre sur le terrain de surface. **Source Studio** (mine initiale/géologie) **distincte des états de partie** (excavation/épuisement/inventaire).
- Ne pas confondre étages superposés : toutes les requêtes physiques se fondent sur **mineId, levelId et X/Y/Z** ; `terrainHeight(x,z)` seul est insuffisant dans une galerie. Remplacer localement via un `SurfaceQuery/CollisionWorld` compatible terrain extérieur.
- **Creusement** : cellules exposées et fusion de faces, meshes/collisions/nav **du chunk et voisins de bord seulement**, pas de reconstruction de la mine entière ; géométrie purement dérivée de la grille.
- **Métaux/cristaux** : filons déterministes par seed/version/strate, récolte épuisable persistante, pas de minerai physique par fragment ; pas de duplication de récompense pour une même cellule.
- **Serveur futur** : le client envoie une **intention de creuser**, le serveur vérifie distance/outils/état et valide atomiquement creusement + inventaire, puis diffuse **snapshots/deltas avec révisions et idempotence**, jamais des meshes. **Bêta actuelle solo sans backend obligatoire**, même interface via repository local.
- **PERF** : charger uniquement mine/étages/chunks visibles et voisins nécessaires, culling de galeries, quelques matériaux/lumières sans ombres massives, remeshing via `WorkScheduler` et cache `ResourceRegistry`. Collision et état logiques restent corrects à tous LOD.
- **Studio** : emprise, niveaux, entrées, gisements, plan par étage, coupe, connecteurs/validation ; playtest d'excavation sur état de partie **jetable**, aucun overwrite silencieux de source V3.
- Dimensions **1 m/cellule, 32×32, 3–8 niveaux** = paramètres de test, **pas des seuils qualifiés** ; jalons **MINE-0…MINE-9 non livrés**. Prévoir compatibilité eau et hauteur/occlusion des ouvertures.

## 2. Séparation des données et des responsabilités

- Projet auteur : `worldId`, `schemaVersion`, `seed`, dimensions, chunks, overrides, prefabs, entités, dialogues, navigation, interactions.
- Monde compilé : manifeste + paquets de secteurs/LOD/collisions, chargés à proximité ; **ne pas créer un seul énorme JSON/GLB pour 100 km²**.
- Runtime : simulation, rendu, caméra, états locaux, inventaire et slots de partie ; **pas** de code d'éditeur chargé dans le jeu public.
- Studio : modification visuelle par transactions annulables, sauvegarde IndexedDB, import/export d'archive, préflight, compilation et « Jouer ici » sur copie du brouillon.
- Objets et comportements : **IDs stables, schémas validés** et références explicites, pas de liens par nom visuel de mesh.
- PNJ : navigation hiérarchique inter-secteurs + cheminement/évitement local quand nécessaire, pas de calcul global pour tous les PNJ par frame.
- Faune décorative : animation simplifiée/groupée ; poissons/insectes **ne sont pas** des PNJ complets.
- Éditeurs spécialisés : lazy loading des modules et viewport partagé si pertinent ; interfaces compactes, manipulations directes, inspecteurs contextuels.

## 3. Règles UX non négociables

- Chaque opération fréquente doit être réalisable directement dans la scène en peu d'actions.
- Sélection, survol, outil actif, état « sauvegardé », et erreurs doivent être lisibles.
- **Undo/Redo** : une opération d'édition continue (pinceau, spline, déplacement) = une transaction.
- À partir d'un PNJ/objet sélectionné, ouvrir son dialogue/interaction sans perdre l'ID ni son contexte spatial.
- Lancer « Jouer ici » puis revenir au Studio avec carte, historique et sélection intacts.
- Utiliser des templates prêts à l'emploi pour porte, vanne, panneau, PNJ, collectible, mission et énigme avant un éditeur de programmation graphique complexe.
- Commandes du jeu existantes (planage, nage, plongée, bateau, **A maintenu** pour accessoires/émotions, rotation caméra **clic-glissé**) à préserver. Commandes du Studio distinctes si nécessaire.

## 4. Développement et validation

1. Examiner l'état **réel** du code avant de le modifier. Ne pas inventer de tests ni de métriques.
2. Modifier progressivement, avec fonctions courtes, responsabilité claire, contrats partagés et pas d'abstractions inutiles.
3. Faire les changements de schéma avec migration explicite et tests de compatibilité des anciens projets.
4. Garder un build statique accessible sous `/little-world/` ; chemins base-aware (incluant GLB/WASM).
5. Exécuter selon l'outillage présent : `npm test`, `npm run typecheck`, `npm run build`, puis tests navigateur / GitHub Pages si accessibles. Adapter si la structure du dépôt a évolué.
6. Pour chaque mécanisme, noter **spécifié / implémenté / testé / publié** séparément.
7. Ne jamais annoncer **100 km² à 30 FPS** sans benchmark comparable ; ne pas ajouter de streaming complexe sans mesures.
8. **Aucun jeton GitHub public** pour permettre aux navigateurs de publier ; les données auteur sont importées/compilées dans le dépôt puis déployées par CI.
9. Préserver la version jouable ; travailler sur une branche/PR pour modifications majeures et éviter les changements destructeurs.

## 5. Critères transversaux de réussite

- Un auteur crée relief + eau + biome + bâtiment + PNJ animal + dialogue + interaction, puis teste et exporte **sans écrire de code métier**.
- Le monde continu peut être représenté de façon sectorisée et le studio navigue sans charger toutes les géométries de la carte.
- Le joueur peut explorer, parler, résoudre une petite activité, sauvegarder un slot et le reprendre.
- Le comportement du joueur ne change pas quand le rendu descend de 30 à 20 FPS.
- Aucune assertion de fonctionnalité livrée sans preuve par tests et/ou validation visuelle appropriée.

**Priorité recommandée : Studio Core → formats et carte sectorisés → outils relief/eau/biotopes → NPC/navigation → dialogues/interactions → activités/sauvegardes → QA/performance**, avec incréments exécutables à chaque étape.
