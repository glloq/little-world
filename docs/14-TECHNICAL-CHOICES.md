# 14 — Décisions techniques transversales validées

**Date : 12 novembre 2026 — statut : VALIDÉ pour le périmètre et l'architecture ; réalisation et budgets de performance à mesurer.**

Cette spécification consigne **l'acceptation par l'utilisateur de l'ensemble des recommandations** des choix techniques/UX discutés après le cadrage du monde et de Little World Studio.

**Lecture prioritaire :** [12 — Périmètre fonctionnel](12-PROJECT-SCOPE.md), [13 — Architecture UX du Studio](13-STUDIO-UX-ARCHITECTURE.md), **[15 — Schémas V3 du Studio](15-STUDIO-DATA-SCHEMAS-V3.md)**, [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md), [Décisions](DECISIONS.md).

**Important :** les préfixes `TW-`, `TE-`, `TP-`, `TL-`, `TG-`, `TA-`, `TT-` et `TD-` sont les **IDs uniques des choix techniques de ce document**. Ne pas confondre, par exemple, `TP-P1` (rigs) avec l'ancien choix métier `P1` (types de PNJ) du document 12.

## 1. Monde et géographie — TW

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TW-W1** | Heightfield **multi-résolution par secteurs** | Relief détaillé localement, pas de grille uniforme maximale sur 100 km² ; pas de voxels globaux |
| **TW-W2** | **Chunks + LOD + chargement spatial** | Ne charger/simuler en détail que les zones utiles ; décors d'horizon simples en planage |
| **TW-W3** | Génération **déterministe + retouches locales** | La graine, la version et les overrides sont conservés ; régénération locale annulable |
| **TW-W4** | Eau : **surfaces visuelles + volumes/profondeurs logiques** | Nage, plongée, bateau, rivières/lacs/mer ; pas de simulation de fluides |
| **TW-W5** | **Grottes, tunnels, surplombs et intérieurs en modules 3D** | Terrain principal heightfield ; meshes/collisions spécifiques où utile |
| **TW-W6** | **Biotopes peignables + règles de génération** | Densités, espèces, exclusions, correction manuelle ; pas d'écosystème global autonome |

**Contexte validé :** une seule carte continue, taille maximale de **10 × 10 km (100 km²)** comme limite de format/architecture ; **la démonstration 200 × 600 m reste un prototype**, pas un monde final rempli. La résolution, la taille des secteurs et les distances LOD **restent à mesurer** ; la décision multi-résolution n'impose pas un algorithme particulier.

## 2. Little World Studio — TE

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TE-E1** | **Studio commun à plusieurs éditeurs spécialisés** | Projet/identifiants communs ; modules chargés à la demande, pas d'écrans isolés avec formats incompatibles |
| **TE-E2** | **Vue globale 2D + édition 3D locale** | Naviguer vers une zone du monde sans charger 100 km² de meshes détaillés |
| **TE-E3** | **Prefabs, variantes et overrides locaux** | Modifier un modèle partagé sans effacer les exceptions d'instances |
| **TE-E4** | **Historique transactionnel commun entre les éditeurs** | Undo/Redo inter-outils, gestes de peinture/spline = une commande, checkpoints |
| **TE-E5** | **Inspecteur contextuel** | Afficher seulement les propriétés pertinentes, réglages avancés repliables |
| **TE-E6** | **« Jouer ici » sur copie du brouillon** | Tester sans perte d'historique, de sélection ou d'état d'édition |
| **TE-E7** | **Validation incrémentale/continue des modifications et liens** | Vérifier IDs, assets, références et limites ; contrôles lourds au préflight/export, pas à chaque frame |

**UX :** en-tête compact, outil visible, grand viewport, recherche/catalogue, sélection claire, aperçu avant application, erreur explicite et liens navigables entre objets, PNJ, dialogues et événements. Commandes de caméra du Studio distinctes de celles du joueur.

**Non-objectifs :** éditeur de polygones, UV, rigging ou shaders généraliste ; scripts arbitraires importés.

## 3. Personnages, PNJ, créatures — TP

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TP-P1** | **Familles de rigs réutilisables** | Base commune pour morphologies compatibles (dont variantes du joueur), rigs spécialisés pour oiseaux/poissons/quadrupèdes |
| **TP-P2** | **Comportements par machines à états configurables** | Activités simples, prévisibles et éditables ; pas d'IA sociale/émergente complexe |
| **TP-P3** | **Navigation hiérarchique libre** | Zones et portails inter-secteurs + navigation locale/évitement, recalcul de chemin sur événement |
| **TP-P4** | **Expressions + animations + dialogues + réactions contextuelles** | Interactions lisibles, pas de simulation de relations sociales profonde |
| **TP-P5** | **Horaires/activités simples liés à une horloge commune** | Temps logique réglable ; l'environnement visuel futur suit la même horloge et sera contrôlé par serveur seulement en multijoueur |
| **TP-P6** | **Niveaux de simulation différents selon la faune** | PNJ complets pour habitants ; oiseaux légers, poissons en groupes, insectes procéduraux |

**Périmètre des espèces :** animaux/créatures uniquement, **aucun humain**. Navigation libre `TP-P3` ne signifie **pas** que les PNJ savent automatiquement utiliser bateaux, montures, outils complexes ou tous les moyens de déplacement ; leurs capacités restent explicites par espèce/agent et pourront évoluer.

## 4. Dialogues, logique, événements et réactions — TL

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TL-L1** | **Moteur d'événements, conditions et actions déclaratifs** | Types connus et schémas validés ; jamais exécuter JS venant d'une carte |
| **TL-L2** | **Séquences d'actions avec délais et animations** | Conditions, ordre d'exécution, annulation ; pas de séquenceur cinématique généraliste |
| **TL-L3** | **Variables typées par objet, zone et partie** | Portées et durées de vie explicites, pas de variables globales sans contrôle |
| **TL-L4** | **IDs stables et références typées** | Liens entre zones/secteurs chargés ou non ; vérification des références cassées |
| **TL-L5** | **Dialogues à choix, conditions et conséquences** | Branches, réactions visuelles/sonores, actions associées, localisation possible plus tard |
| **TL-L6** | **Réactions contextuelles configurables** | Regard, salut, animation, approche/fuite/texte selon événements et état |
| **TL-L7** | **Formulaires contextuels + éditeur de séquences lisibles** | Templates pour porte, levier, PNJ, collectible et mission ; nœuds visuels universels non obligatoires |

**Règles de sécurité et d'intégrité :** borner profondeur et nombre d'actions, empêcher les cycles d'événements instantanés, traiter les références à objets non chargés via l'état du monde, sauvegarder les **états déclarés persistants** seulement. Aucune fonction métier spécifique nécessaire pour chaque porte, vanne ou quête.

## 5. Jeu, activités et progression — TG

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TG-G1** | **Horloge de jeu simple** | Événements et routines PNJ ; **cadrage ultérieur ENV du jour/nuit, astres et météo stylisée** documenté pour la bêta, sans simulation climatique physique complexe |
| **TG-G2** | **Inventaire léger : types/catégories/quantités** | Objets ramassables/utilisables ; pas de craft/stats/équipement RPG complexes |
| **TG-G3** | **Petites missions configurables** | Objectifs, conditions, flags, récompenses/réactions ; pas de campagne obligatoire |
| **TG-G4** | **Mini-activités à partir de templates** | Collecte, pêche, petite énigme, service à un PNJ ; pas de mini-jeu généraliste programmable |
| **TG-G5** | **Persistance sélective des états utiles** | Pas de simulation persistante de chaque poisson/feuille/animation |
| **TG-G6** | **Plusieurs sauvegardes locales de partie** | Slots et formats versionnés distincts des projets auteur ; pas de cloud requis |
| **TG-G7** | **Quelques intérieurs modulaires accessibles** | Pas tous les bâtiments ; continuité spatiale de la carte unique |

**Systèmes étalons pour l'éditeur :** (1) collecte, (2) pêche légère, (3) mécanisme/énigme à étapes, (4) petite mission à dialogue et objet à rapporter. Ils doivent être créables avec **le même moteur de conditions/actions**, sans code ad hoc à chaque activité.

## 6. Assets, animations, audio — TA

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TA-A1** | **GLB optimisés + composants procéduraux ciblés** | Assets originaux/redistribuables dans le dépôt |
| **TA-A2** | **Animations de rig et procédurales combinées** | Partage de clips, animation simple des éléments secondaires, pas de physique complète du corps |
| **TA-A3** | **Couleurs de sommets + petits atlas partagés si utiles** | Peu de matériaux ; textures haute résolution non prioritaires |
| **TA-A4** | **Instancing pour végétation et répétitions** | Variation par taille/couleur/rotation au lieu de meshes uniques |
| **TA-A5** | **Ambiance sonore par biotope + événements spatialisés** | Budget limité de voix/sources simultanées |
| **TA-A6** | **Catalogue importable, validé et versionné** | IDs, dimensions, pivots, clips, collision, licence, coût, miniatures et références |

## 7. Performance, physique, matériel — TT

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TT-T1** | **Physique hybride et collisions ciblées** | Joueur/obstacles/navire ; pas de rigid bodies par fleur/insecte |
| **TT-T2** | **Simulation cadencée selon la proximité/importance** | Scheduler central, PNJ dormants loin, décisions de groupe pour faune |
| **TT-T3** | **Streaming spatial des secteurs** | Monde continu ; pas de préchargement 100 km² |
| **TT-T4** | **LOD, instancing, caches, culling** | Compter GPU/CPU/mémoire avant de complexifier le rendu |
| **TT-T5** | **Web Workers ciblés** | Génération/compilation lourde déportée uniquement si la mesure le justifie |
| **TT-T6** | **Cible PC standard à GPU intégré** | **Profil de référence proposé** : 8 Go RAM, 1600 × 900, WebGL2, Firefox/Chromium récents ; *minimum matériel non garanti avant mesures* |

**Fréquence validée :** 30 FPS nominal, réduction à 20 FPS si nécessaire ; vitesse de jeu indépendante du rendu. Les enveloppes de triangles, mémoire, draw calls et téléchargement du document 11 restent **des objectifs indicatifs, pas des chiffres mesurés/garantis**.

## 8. Projets, formats, sauvegarde et publication — TD

| ID | Décision validée | Limite et justification |
| --- | --- | --- |
| **TD-D1** | **Manifeste + données par secteur** | Pas de JSON géant pour 100 km² |
| **TD-D2** | **IndexedDB + export portable** | Brouillons auteur sauvegardés localement, export manuel fiable |
| **TD-D3** | **Transactions communes + checkpoints** | Undo/Redo inter-outils ; historique mémoire borné et stratégie de restauration documentée |
| **TD-D4** | **Schémas versionnés + migrations** | Compatibilité projets anciens, validation d'imports non fiables |
| **TD-D5** | **Compilation puis commit + GitHub Actions** | Site statique GitHub Pages, aucun secret/token de publication embarqué |
| **TD-D6** | **Tests unitaires, d'intégration et navigateur** | Régression gameplay/Studio, métriques réelles en complément |

**Gates de publication :** un lien cassé, un asset absent, une référence PNJ/dialogue/action invalide ou une migration impossible bloque la compilation/publication avec message clair ; il ne faut pas « corriger silencieusement » les contenus.

## Complément — schémas et interfaces V3 validés

Les décisions TE-E1 à TE-E7 et TD-D1 à TD-D6 sont concrétisées dans [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md) : projet/manifeste/secteurs, entités/composants, `PrefabDefinition`, `StudioContext`, index de références inter-secteurs, commandes transactionnelles et migrations.

**Validé comme choix d'architecture**, pas comme API figée à l'octet ni fonctionnalité déjà développée. Les types d'exemple sont à éprouver avec la carte V2, les performances et les tests de cas réels.

## Option future documentée — multijoueur et optimisations des foules

Le jeu solo V3 et Little World Studio doivent rester **sans backend obligatoire**. L'utilisateur a demandé de préparer l'évolution multijoueur selon [16 — Architecture future](16-FUTURE-MULTIPLAYER.md) : objectif de **30** puis **200** joueurs, **500** en étude expérimentale.

**Compatibilité technique dès maintenant, sans réseau** : identifiants et états logiques stables, index spatial, découplage simulation/rendu, événements typés, LOD de personnages et chunks chargés spatialement. **Implémentation différée** : AOI, fréquence réseau adaptative 2–20 Hz, 2–3 Hz pour silhouettes secondaires, serveur autoritaire, transport binaire, multi-processus. Les événements critiques exigent un traitement prioritaire indépendant de la fréquence des mouvements.

**Ces nombres sont des cibles de conception, non des capacités atteintes**. Les paramètres futurs devront être validés sur serveur et GPU intégrés réels.

## Décision de rendu longue portée — HZ

Le créateur a retenu la **vue panoramique profonde sans brouillard cache**. Voir [17 — Horizon et imposteurs](17-DISTANT-VIEW-RENDERING.md) :

- Terrain 3D ultraléger jusqu'à l'horizon visible, découplé du terrain proche.
- LOD étagés et budgets adaptés aux végétaux, bâtiments, avatars, eau, ombres et effets.
- Imposteurs/panoramas précalculés si avantage réel, notamment au lointain où la parallaxe peut être négligée ; ciel via sky dome/skybox.
- Chunks détaillés locaux ; les proxies d'horizon sont dérivés, versionnés et recompilables depuis V3.
- Transitions propres et mesures (CPU, GPU, overdraw, draw calls, mémoire, absence de popping) sur GPU intégré.
- Aucun fog de dissimulation ; distances de LOD purement indicatives tant que non benchées.

## Décisions GR — herbe basse/haute et coût marginal minimal

Le créateur a validé la [spécification 18 — Herbes ultra-low-resource](18-GRASS-LOW-RESOURCE.md) :

- Herbe courte principalement **sans géométrie supplémentaire**, via sol coloré par biome.
- Herbe haute : touffes opaques **2–4 triangles à tester**, instances groupées par cellules proches, sans ombre ni physique.
- Interactions/wind cosmétiques **GPU seulement**, sans mise à jour CPU des touffes ; réaction locale de quelques personnages, **zéro trafic réseau dédié**.
- Génération déterministe/régénération locale ; aucun ID persistant par brin dans les schémas V3.
- Profil de rendu totalement désactivable (`groundOnly`) et budgets **communs** avec le reste de la scène ; le lointain reste visible sans fog.
- Budgets CPU/GPU/draw calls/mémoire et paliers de distance **provisoires** ; tests obligatoires avant toute annonce de gain.

## Choix ENV — météo, astres et ombres LOW-RESOURCE

**Décisions validées** : [19 — Environnement météo, neige, ciel et ombres](19-ENVIRONMENT-WEATHER-SKY.md). Les choix historiques de simplicité de l'horloge n'interdisent pas **un rendu météorologique stylisé**, mais excluent une simulation atmosphérique lourde.

- **Une horloge absolue et un état d'environnement commun**, source locale/test aujourd'hui, autorité serveur future sans backend exigé en solo.
- **Soleil/coucher/aube, ciel étoilé et plusieurs lunes à périodes, inclinaisons et phases propres** via un rendu de ciel très léger, sans lights/meshes 3D par astre.
- **Neige persistante/fonte** déterminées par température/altitude/macro-climat et affichées avec masques sur terrain, toitures, arbres et paysage lointain. Précipitations pluie/neige = instances locales, aucune physique par goutte/flocon.
- **Une shadow map solaire locale au plus** en profil normal, uniquement sur grands objets proches et essentiels ; herbes, objets lointains et lunes exclus. Mode qualité minimum sans ombres dynamiques.
- **Brouillard météorologique** oui ; brouillard permanent de masquage de clipping non.
- **Bêta** : panneau pour imposer temps/météo/neige/astres/ombres, accélération temporelle, profiler le coût ; overrides non persistants.
- Ne pas multiplier les lumières/ombres, matériaux ou compilations shader lors d'une transition ; mesurer toutes les dépenses GPU, ombres à part.

## Décisions BL — Blender, packs de presets, échange de cartes et compatibilité V3

**Choix validé :** [20 — Blender ↔ Little World Studio](20-BLENDER-STUDIO-INTERCHANGE.md).

- **Modélisation low-poly dans Blender**, avec `.blend` source optionnelle ; **glTF 2.0/GLB** échange géométrique ouvert ; Studio conserve **biotopes, végétation, eau, relief local, PNJ et interactions**.
- **Modèles, collections hiérarchiques et presets composites** importables/exportables et placés via **translation XYZ, rotation quaternion, échelle XYZ**, pivots/ancres, alignement terrain, variantes/overrides et Undo/Redo.
- **Heightfields** importables/exportables avec métadonnées de dimensions/origine/altitude/précision ; falaises, surplombs, grottes, arches en modules GLB. **Pas de monde entier en un unique GLB monolithique.**
- **Formats de sortie distincts** : (a) asset/preset réutilisable `ZIP+JSON+GLB`, (b) carte entière **archive V3 ZIP autonome rééditable** avec toutes dépendances, (c) sélection/scène vers Blender en `GLB+sidecar`, (d) build runtime compilé/sectorisé.
- **Round-trip Blender non destructif** : comparaison des IDs/versions/hashes, maintien des propriétés gameplay non représentées en GLB, aperçu de diff et remapping explicite, imports transactionnels.
- **Sécurité/licences/performance** : bounds/tailles/versions, extensions glTF acceptées, axes/units, protection contre ZIP-bombs/traversal, assets redistribuables, budgets LOD/instancing/chunks mesurés.
- Compatibilité V2→V3 et jeu solo sans serveur ; statut **défini mais non entièrement implémenté**.

## Décisions WAT — eau sur relief, immersion et horizon économique

**Spécification validée :** [21 — Eau LOW-RESOURCE](21-WATER-HYDROLOGY-LOW-RESOURCE.md).

- **Réseau hydrographique V3** (sources, tronçons orientés, lacs, jonctions, cascades haut/bas, mer) et **volumes gameplay séparés des meshes**. Tracés Studio avec altitude calculée suivant le relief et profil corrigible, lit/berges en compilation sectorisée.
- Lacs **horizontaux**, rivières non ascendantes sauf erreur à corriger, rapides/cascades déduits de pente ou override auteur, embouchures et collisions/navigation explicites.
- **WaterLODManager LOD0–3** : petites vagues/écume près seulement ; surfaces lointaines **presque statiques**, simplifier géométrie **et shader/overdraw** ; océan à l'horizon sans masquer les terres.
- **Sous-marin** par position/volume de caméra + hystérésis et coloration/visibilité peu coûteuse ; aucun deuxième rendu lourd ni physique de l'eau.
- **Pas de FFT, fluides simulés, reflets/réfraction multipasses, SSR ni particules fluides en masse**. Effets GPU et rubans UV localisés, courants simples interrogés à la simulation.
- Volumes logiques stables quel que soit le LOD graphique, sauvegarde et import/export V3 non destructif, vent météo partagé, aucun réseau de vagues.
- **À mesurer** CPU/GPU, cout des pixels d'océan, p95/p99, présence d'une grande mer/planage, mode ultra-économique, pas des chiffres garantis.

## Décisions PERF — ResourceBudgetManager et optimisation globale

**Cible technique validée, non livrée par la seule documentation :** [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md).

- **Un seul arbitre des ressources** remplace/étend progressivement `PresentationBudget`, `FrameClock` et sa simulation 30 Hz restent distincts. Présentation 30 FPS nominal / secours 20 FPS, mode Auto et plafonds manuels.
- **PerfSampler** : mesure p50/p95/p99, CPU sim/update/soumission, métriques WebGL, cache/queue ; timer GPU asynchrone facultatif et VRAM **estimée**. Ne pas appeler temps CPU WebGL « GPU ».
- **QualityBudgetSnapshot** : limites globales versionnées, consommateurs autonomes terrain/horizon, GLB, herbe, eau, météo, ombres, PNJ/audio/Studio ; dégradation stable selon origine CPU/GPU/mémoire, avec cooldown/hystérésis.
- **ResourceRegistry** : owner/refcounts de ressources partagées, poids GPU/CPU estimé, mémoire cache soft/hard et libération sûre. **WorkScheduler** : priorité critique/visible/prédictive/opportuniste, temps CPU et upload max par frame, tâches invalidées/annulées après édition.
- **LOD selon importance/surface projetée**, prefetch directionnel planage/bateau, culling hiérarchique, aucune rupture de skyline, pas de fog de camouflage ni disparition du monde.
- **Bêta** : panneau Ressources, contrôles et forçage diagnostics, export de scénarios ; source V3 rééditable **indépendante des profils de qualité d'un appareil**.
- **Gate** : benchmarks reproductibles sur GPU intégré réel avec longues traversées, scène océan plein écran, forêt, village, retours, p95/p99, croissance mémoire et absence de régression gameplay ; valeurs provisoires non promises.

## Choix AUD — 5–10 instruments MIDI et samples LOW-RESOURCE

Voir [23 — Audio MIDI / synthèse / échantillons](23-MIDI-AUDIO-LOW-RESOURCE.md).

- **MIDI pour musique et notes**, **5 à 10 patches musicaux maximum** ; séquenceur interne SMF type0/1 avec programmes réaffectés à la palette, sans MIDI USB/Web MIDI API requis.
- **Web Audio natif** : un seul `AudioContext` après interaction utilisateur, un mixeur music/SFX/ambience/master, **synthétiseur oscillateurs/enveloppes léger**, voix globales limitées, `SamplePlayer` pour sons naturels et certains timbres.
- **Ni SoundFont GM 128 programmes ni AudioWorklet d'office** ; le coût des patches, du décodage/PCM et des voix prime sur le poids du MIDI seul. Sélection `equalpower` pour la spatialisation avant HRTF coûteux.
- **Musiques/ambiances liées à biomes, météo et heure du monde**, notes programmées sur l'horloge audio indépendamment du FPS/simulation, séquences crossfadées proprement.
- **`AudioBudgetManager` est un consommateur de `ResourceBudgetManager`**, profils limitant voix totales/notes musicales/sources 3D/PCM, effets décoratifs supprimables, événements critiques préservés.
- **Studio/V3** : catalogue `.mid` et samples licites, patches/IDs/emitters/budgets éditables, ZIP portable ; profils qualité sont des données runtime et non une propriété du monde auteur.
- Test Firefox/Chromium : autoplay, compat codecs, notes qui restent actives, plusieurs PNJ/cascades, cache/décodage, glitch, long-play. **Budget et latence non garantis avant benchmark.**

## Choix MINE — cellules 2,5D multiétages et synchronisation légère

**Spécification acceptée :** [24 — Mines creusables 2,5D](24-MINES-MULTILEVEL-LOW-RESOURCE.md).

- **Mines localisées, grille 2,5D par étage**, terrains extérieure heightfield + modules GLB. Pas de voxels mondiaux, de destruction libre du sol extérieur ou de moteur volumétrique universel.
- **Plusieurs niveaux** avec escaliers/rampes/puits explicites, collisions `XYZ` et zone physique active ; `terrainHeight(x,z)` de la surface ne s'applique pas à une galerie superposée.
- Source `MineDefinitionV3` stable **séparée** de `MineState` de la partie (cellules excavées, stocks de métaux/cristaux, inventaire). Les joueur modifient durablement **uniquement les mines autorisées**.
- Construire **faces exposées/fusion locale** par chunks et bordures, pas un cube par bloc ; matériaux communs, culling de galeries, pas de lumières/ombres complexes.
- Récolte atomique et **idempotence**, gisements seed/profondeur/version, snapshots/deltas de cellules avec révision pour serveur autoritaire **futur**. Le solo utilise le même contrat logique en sauvegarde locale.
- Budgets de travail/streaming/mémoire via PERF, **pas de régression collisions/navigation/inventaire** sous LOD minimal ; tests MINE-0…9 incluant eau/mer, hauteur, débordement des niveaux et concurrence.
- Valeurs 1 m/cellule, chunks 32×32 et 3–8 étages **illustratives seulement** ; prototype comparatif MINE-0 pour qualifier les coûts et limites verticales.

## 9. Règles d'architecture issues de ces décisions

1. **Un projet source, plusieurs éditeurs spécialisés**. Partager objets/IDs/sélection/historique, mais charger les écrans lourds à la demande.
2. **Source auteur ≠ monde compilé ≠ état sauvegardé joueur** : trois domaines distincts et versionnés.
3. **Zone globale 2D / zone locale 3D**, carte unique continue, données par secteur, surplombs en modules.
4. **États d'entités hors secteur chargé** disponibles à la logique de jeu : événements et variables ne doivent pas dépendre de l'existence d'un Mesh Three.js.
5. **Une petite activité = composition de templates et d'actions**, pas nouveau moteur ou code spécial.
6. **Une opération d'édition = transaction réversible**, valide sur le projet commun ; le mode « Jouer ici » ne modifie pas la source.
7. **Ne simuler/charger que ce qui est utile** ; la taille maximale du monde n'est pas la taille de la scène active.
8. **Respecter la limite du hardware bas de gamme cible** tout en mesurant et documentant ce qui est atteint.
9. **Distinguer spécifié, implémenté, testé, publié** dans chaque rapport Codex.

## 10. Critères de validation pour un incrément vertical

Une étape d'éditeur est considérée intégrée seulement si :
- **Créer → modifier → annuler → sauvegarder → exporter → réimporter → tester** fonctionne.
- Les données restent valides et les IDs/références sont préservés.
- L'édition locale n'invalide pas la carte entière ; dépendances recalculées de façon explicite.
- Aucune régression des commandes du joueur, de la caméra, de l'eau, du bateau ou des accessoires.
- La fonctionnalité peut être testée dans le navigateur et les performances sont **mesurées**, non supposées.

## 11. Statut de cette décision

- **VALIDÉ :** choix fonctionnels et architectures de ce document, par accord explicite du créateur.
- **À ÉTALONNER :** tailles de chunks, résolution de terrain, distances LOD, hardware de référence exact, mémoire, nombres d'instances et latences.
- **À IMPLÉMENTER / COMPLÉTER :** tout outil ou mécanisme absent du dépôt ou de la branche cible au moment du développement.
- **HORS PÉRIMÈTRE :** backend de jeu, multijoueur initial, scripts utilisateurs non fiables, moteur voxel universel, simulation sociale ou **simulation physique de météo** de complexité élevée (les effets stylisés ENV sont prévus en bêta).

**Chaque agent de développement doit comparer ses changements à ce document et aux spécifications 12/13, en vérifiant l'état de la branche avant de modifier le code.**
