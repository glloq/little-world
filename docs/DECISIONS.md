# Registre de décisions — Little World

**Mise à jour : 12 novembre 2026 — limites du jeu et de Little World Studio validées.**

**Références de développement :** [12 — Périmètre et choix G/M/P/I/E/C/Q](12-PROJECT-SCOPE.md), [13 — UX et modèles Studio](13-STUDIO-UX-ARCHITECTURE.md), **[14 — Décisions techniques transversales validées](14-TECHNICAL-CHOICES.md)**, **[15 — Schémas V3 et contrats entre éditeurs](15-STUDIO-DATA-SCHEMAS-V3.md)**, [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

**Cadrage de l'évolution future seulement :** [16 — Multijoueur et optimisation des foules](16-FUTURE-MULTIPLAYER.md).

**Rendu panoramique validé :** [17 — Vue longue portée sans brouillard](17-DISTANT-VIEW-RENDERING.md). Il faut préserver les silhouettes du monde à grande distance sans charger toutes les géométries. **Le jeu actuel reste solo** ; valider un objectif de capacité ne signifie pas livrer une infrastructure réseau.

États :
- **VALIDÉ** : choisi par l'utilisateur / confirmé précédemment.
- **PROPOSÉ** : valeur technique modifiable après tests.
- **OUVERT** : à préciser avant implémentation de la fonction.
- **DIFFÉRÉ** : exclu de la V1, sans obligation de conception immédiate.

## VALIDÉ — V1

| ID | Décision |
| --- | --- |
| D-001 | Rendu **Three.js / WebGL** |
| D-002 | **Prototype 200 × 600 m** ; **plafond d'architecture 10 × 10 km**, une seule carte géographique continue par monde/partie |
| D-003 | Personnage **écureuil volant animal stylisé**, surtout quadrupède |
| D-004 | Vue troisième personne, caméra contrôlée à la souris |
| D-005 | **PC uniquement**, clavier/souris |
| D-006 | Marche, course, saut, nage, plongée, planage |
| D-007 | **Pas d'endurance** |
| D-008 | `Espace` au sol pour sauter, déclenchement volontaire de la membrane en l'air |
| D-009 | Oxygène de plongée à **grande limite** |
| D-010 | Pas de dégâts ni mort en V1 |
| D-011 | Exploration avec **de nombreuses petites activités facultatives** et missions courtes ; pas de RPG lourd |
| D-012 | Les joueurs **ne modifient pas la carte** |
| D-013 | Génération automatique + **éditeur visuel** de carte, objets et interactions |
| D-014 | Assets disponibles **dans le dépôt**, ajout progressif |
| D-015 | Direction artistique **low-poly organique optimisée**, chaleureuse et originale |
| D-016 | **Première version solo exclusivement** ; multijoueur reporté |
| D-017 | Hébergement visé : **GitHub Pages**, frontend statique |
| D-018 | **Aucun serveur de jeu / backend / API nécessaire à la V1** |
| D-019 | Bibliothèque d'assets à redistribution autorisée, préférence **CC0 / originaux** |
| D-020 | Bâtiments complets et modulaires dans l'éditeur |
| D-021 | Carte : source, forêt, rivière, moulin à eau, village, port près de la mer |
| D-022 | Interactions configurables dans l'éditeur, sans code spécifique pour chaque objet |
| D-023 | Possibilité de sauvegarder et d'exporter les modifications localement |
| D-024 | **Priorité historique V1** : jour/nuit et météo non prioritaires. **Cadrage ultérieur adopté** dans ENV-D01…ENV-D12 : environnement stylisé complet à tester dans la bêta, sans simulation physique météo lourde |
| D-025 | **Design d'écureuil chibi** selon la planche fournie : grands yeux, ventre clair, queue volumineuse, membrane invisible au repos |
| D-026 | **Accessoires** : chapeau, sac à dos, pendentif ou écharpe ; **émotions** affichées sur le visage |
| D-027 | Menu de personnalisation **uniquement pendant le maintien de la touche A** ; sélection à la souris |
| D-028 | **Caméra : rotation uniquement par clic gauche maintenu + déplacement de la souris** ; aucune capture permanente |
| D-029 | **LOW-RESOURCE : affichage cible 30 Hz en normal et jusqu'à 20 Hz si nécessaire** ; aucune modification de la vitesse du monde liée aux FPS |
| D-030 | **M1 : maximum 10 × 10 km (100 km²)** comme limite de format, pas performance atteinte |
| D-031 | **M2=A : une carte continue par monde/partie** ; plusieurs projets auteur possibles mais pas de niveaux disjoints |
| D-032 | **G1–G7 : exploration + petites missions/activités facultatives, inventaire léger, quelques intérieurs, conséquences persistantes et plusieurs slots de partie** |
| D-033 | **P1 : animaux/créatures exclusivement ; aucun humain** ; réutiliser des variations du personnage joueur avec rig compatible |
| D-034 | **P2=B et P3=C : comportements simples mais navigation libre avancée**, avec calcul hiérarchique localisé |
| D-035 | **P4–P7 : dialogues à choix, réactions, sons stylisés, faune pouvant fuir/se défendre sans combat** |
| D-036 | **I1–I7=B : événements, conditions ET/OU, séquences, liens, persistance et réglage par formulaires**, sans scripts |
| D-037 | **E1=C : plusieurs éditeurs spécialisés avec une source de projet et un historique communs** |
| D-038 | **E2–E8=B : vue dessus/perspective, groupes, prefabs/overrides, multisélection, autosauvegarde et test immédiat** |
| D-039 | **M3–M7=B : modules de grottes/surplombs, bâtiments modulaires, eau diversifiée, biotopes peignables et régénération locale** |
| D-040 | **C1–C7=B : import GLB/animations/audio, zones, lumières/effets paramétrables, catalogues partagés** ; une seule carte continue par partie |
| D-041 | **Q1=B : création visuelle de gameplay via événements/conditions/actions, pas programmation arbitraire** |
| D-042 | **Q2=B : activités/réactions PNJ configurables sans IA sociale émergente obligatoire** |
| D-043 | **Q3=B : outils génériques du Studio en priorité, puis enrichissement du contenu de carte** |
| D-044 | **Sauvegardes distinctes** : projets/brouillons auteur et slots de partie joueur, sans écrasement |
| D-045 | Les modèles de données sont **versionnés et sectorisés** ; compiler les cartes en ressources statiques GitHub Pages |
| D-046 | **TW-W1 à TW-W6 validés** : heightfield multi-résolution, chunks/LOD, génération + overrides, eau par volumes, modules 3D et biotopes peignables |
| D-047 | **TE-E1 à TE-E7 validés** : Studio spécialisé + vue globale 2D, prefabs/variantes, inspecteur contextuel, « Jouer ici », validation incrémentale et **Undo/Redo transactionnel commun** |
| D-048 | **TP-P1 à TP-P6 validés** : familles de rigs, machines à états simples, navigation libre hiérarchique, expressions/animations, horaires et faune à simulation adaptée |
| D-049 | **TL-L1 à TL-L7 validés** : événements/conditions/actions déclaratifs, séquences, variables typées par portée, références stables et dialogue à embranchements |
| D-050 | **TG-G1 à TG-G7 validés** : horloge simple, inventaire léger, petites missions, mini-activités par templates, états persistants, sauvegardes multiples, quelques intérieurs |
| D-051 | **TA-A1 à TA-A6 validés** : GLB optimisés/procédural léger, animations rig + procédurales, vertex colors/atlas, instancing, ambiances audio et catalogue versionné |
| D-052 | **TT-T1 à TT-T6 validés** : physique ciblée, simulation adaptative, streaming, LOD/instancing/caches, Workers ciblés ; cible PC standard GPU intégré, **à mesurer** |
| D-053 | **TD-D1 à TD-D6 validés** : manifeste + secteurs, IndexedDB/export, transactions + checkpoints, schémas/migrations, publication CI et tests navigateur |


| D-054 | **Studio V3 : trois domaines distincts** — projet auteur sectorisé, monde compilé et sauvegardes joueur ; versions et validations indépendantes |
| D-055 | **V3 : registre mondial d'IDs stables et références typées** ; propriétaire par secteur et index logique accessible sans chargement 3D |
| D-056 | **V3 : entités à composants typés, prefabs versionnés, variantes et overrides locaux** ; pas d'ECS/framework lourd obligatoire |
| D-057 | **V3 : StudioContext partagé** (projet, sélection, caméra, module), éditeurs spécialisés et affichage contextuel |
| D-058 | **V3 : historique par commandes réversibles, transactions et checkpoints**, sans copie intégrale de carte à chaque édition |
| D-059 | **V3 : schémas dialogues/PNJ/événements/activités indépendants**, portées de variables typées et logique hors secteurs chargés |
| D-060 | **V3 : migration V1/V2 vers V3 pure, non destructive et testée**, sans casser les anciennes cartes et sans qualifier le V3 comme déjà livré |
| D-061 | **V3 : validation incrémentale + préflight global, compilation locale des secteurs** ; erreurs et liens cassés navigables depuis le Studio |

## VALIDÉ — garde-fous pour un éventuel multijoueur futur (hors livraison solo)

| ID | Décision de cadrage différée |
| --- | --- |
| **FMP-001** | Préparer sans implémenter maintenant le multijoueur ; solo/Studio/GitHub Pages restent indépendants du réseau |
| **FMP-002** | Jalon initial **30 joueurs**, cible principale **200**, scénario expérimental **500**, sans performance garantie |
| **FMP-003** | AOI/Interest Management spatial **et contextuel** avec priorités, visibilité, interactions et hystérésis |
| **FMP-004** | Réplication adaptative **0–20 Hz**, généralement **2–20 Hz** pour entités suivies ; **2–3 Hz pour foule secondaire**, pas pour interactions critiques |
| **FMP-005** | **Simulation serveur indépendante** (20–30 Hz comme hypothèse à mesurer), interpolation et rendu client à 30/20 FPS |
| **FMP-006** | Événements critiques fiables/prioritaires, snapshots initiaux et deltas, messages binaires compacts/quantifiés et backpressure à étudier |
| **FMP-007** | Rigs et avatars à LOD, animations locales et simulation PNJ/faune adaptative ; pas de rendu détaillé de centaines de joueurs |
| **FMP-008** | **Séparer** secteurs de stockage, zones d'autorité/simulation et ensembles de visibilité réseau ; multi-processus uniquement si benchmark nécessaire |
| **FMP-009** | V3 doit garder IDs, index spatial, états logiques et événements typés indépendants de Three.js et du transport |
| **FMP-010** | Vérifier séparément **bots serveur** et **vrais clients GPU intégré** ; tests 30/100/200/500 et densités de foules |
| **FMP-011** | Aucun socket, `NetworkEntity`, authentification ou métadonnée obligatoire de réplication dans les modèles solo/V3 actuels |

**Détails, valeurs provisoires et tests :** [16-FUTURE-MULTIPLAYER.md](16-FUTURE-MULTIPLAYER.md).

## VALIDÉ — vue panoramique profonde / optimisation du monde

| ID | Choix |
| --- | --- |
| **HZ-D01** | **Vue large et profonde sans brouillard pour masquer le clipping** ; préserver reliefs, côtes, îles et grands repères visibles au loin |
| **HZ-D02** | **Terrain et objets à plusieurs niveaux de détail** ; simplification géométrique progressive, contrôle de l'erreur écran et hystérésis |
| **HZ-D03** | **Horizon 3D ultra-léger indépendant du terrain détaillé** ; éviter le préchargement des hectares de décors |
| **HZ-D04** | **Imposteurs 2D/panoramas** lorsque la parallaxe le permet, et skybox/dôme pour le ciel ; éviter l'image de fond unique pour des montagnes approchables |
| **HZ-D05** | **LODs par famille** : herbes/forêts, bâtiments/ruines, personnages/PNJ, eau, particules, ombres, ressources GPU |
| **HZ-D06** | **Proxies dérivés de la source V3**, compilés/versionnés, invalidés localement après sculpture ou modifications d'assets |
| **HZ-D07** | **Budget GPU et comparaison à contenu identique** : triangles + draw calls + overdraw + mémoire + popping ; 30/20 FPS sur PC intégré à vérifier |
| **HZ-D08** | **Rendu profond cohérent en planage** et en vue panoramique depuis la côte/falaise ; distances LOD provisoires à étalonner |

**Spécification d'implémentation HZ-0…HZ-6 :** [17-DISTANT-VIEW-RENDERING.md](17-DISTANT-VIEW-RENDERING.md).

## VALIDÉ — herbe ultra-économique et réaction aux personnages

| ID | Décision |
| --- | --- |
| **GR-D01** | Herbe courte représentée **principalement par le sol** : couleurs/motifs de biotope déjà intégrés au terrain, pas un brin 3D par tige |
| **GR-D02** | Herbe haute : **touffes opaques 3D très peu polygonales**, instanciées par zones proches ; géométrie et matériau mutualisés |
| **GR-D03** | **Aucune ombre dynamique, physique individuelle, rigid body, mise à jour CPU des matrices ni animation CPU par touffe/frame** |
| **GR-D04** | Vent et passage du joueur en **déformation de sommets GPU locale et facultative**, racines ancrées ; calcul d'influence de courte portée |
| **GR-D05** | Génération déterministe par seed/biotope/secteur et exclusions ; **aucun stockage individuel** de milliers de touffes dans les schémas V3 |
| **GR-D06** | Profils `groundOnly`, ultra-économique, équilibré et dense ; **budget adaptatif commun** avec le reste du terrain, de la végétation et des foules |
| **GR-D07** | Réaction locale des autres joueurs sans réseau dédié : positions déjà disponibles ; texture d'influence **facultative et à benchmarker**, pas d'implémentation anticipée |
| **GR-D08** | Lointain assuré par les couleurs et silhouettes de biotopes, **sans brouillard**, sans maintenir des milliers d'herbes 3D invisibles |
| **GR-D09** | Objectifs expérimentaux : **< 0,1 ms CPU/frame**, **< 0,5 ms GPU/frame**, **1–4 draw calls**, **< 2 Mio GPU** de coût supplémentaire ; jamais considérer ces chiffres comme atteints sans mesure |

**Spécification :** [18 — Herbes ultra-low-resource](18-GRASS-LOW-RESOURCE.md). Distances, densités et coûts à calibrer sur GPU intégré ; les modèles V2 ne sont pas considérés comme déjà enrichis de ces effets.

## VALIDÉ — environnement LOW-RESOURCE et cycles célestes (cadrage de la bêta)

| ID | Décision |
| --- | --- |
| **ENV-D01** | Une horloge et un **état météo canonique** utilisés par ciel, éclairage, matières, pluie/neige, vent, orage, brouillard |
| **ENV-D02** | **Source locale et menu bêta maintenant**, même interface avec **serveur autoritaire futur** ; aucune infrastructure réseau requise actuellement |
| **ENV-D03** | **Jour/nuit et lever/coucher** via direction solaire et palettes interpolées, un ciel procédural peu coûteux |
| **ENV-D04** | **Étoiles nocturnes en fond unique déterministe**, masquées de jour et sous les nuages ; aucun mesh/light par étoile |
| **ENV-D05** | **0/1/plusieurs lunes à cycles indépendants** (orbites/périodes/phase initiale/inclinaison), phases éclairées cohérentes avec le soleil ; pas de shadow map lunaire |
| **ENV-D06** | Nuages en **1–2 couches shader** sans raymarching volumétrique, vent commun, pluie/neige via un système local d'instances |
| **ENV-D07** | **Accumulation/fonte de neige indépendantes des précipitations** ; neige sur terrain, arbres, toitures, rochers et **relief d'horizon** via masques/coefficient, sans nouveau mesh global |
| **ENV-D08** | **Brouillard seulement météorologique**, non utilisé pour masquer la distance de clipping ; horizon réel toujours présent |
| **ENV-D09** | **Ombres dynamiques uniquement près du joueur et sur objets volumineux/importants** ; 1 shadow map solaire locale au plus en qualité normale ; herbes et monde lointain exclus |
| **ENV-D10** | Profil minimum **sans shadow map**, petites ombres simulées si utiles ; résolution/distance/selection casters adaptées et benchmarkées |
| **ENV-D11** | Menu bêta : forcer météo, heure, transitions, températures, neige, nuages, étoiles, lunes/cycles, ombres et qualité ; overrides réversibles, pas de modification implicite des sauvegardes |
| **ENV-D12** | Budgets communs LOW-RESOURCE, évaluations séparées CPU/GPU/ombres et tests de transitions ; paramètres numériques provisoires tant que non mesurés |

**Contrats et phases ENV-0…ENV-7 :** [19 — Environnement, ciel, étoiles, lunes, neige et ombres](19-ENVIRONMENT-WEATHER-SKY.md). La météo « avancée » exclue du périmètre initial désigne une **simulation physique climatique complexe**, pas ces effets visuels stylisés.

## VALIDÉ — Blender, presets et import/export de carte

| ID | Décision |
| --- | --- |
| **BL-D01** | **Blender comme modeleur 3D externe** ; le Studio reste un éditeur de placement, biotopes, végétation, eau, interactions et composition |
| **BL-D02** | **glTF 2.0 / GLB** comme format d'échange 3D ouvert ; `.blend` source facultative, aucun runtime Blender |
| **BL-D03** | Presets simples ou **composites/collections** avec hiérarchies, pivots, ancres, variantes et dépendances, importables et exportables entre projets |
| **BL-D04** | Placement dans Studio avec **translation XYZ, quaternion/rotation, scale XYZ**, gizmos, alignement terrain et groupes ; ids stables, overrides non écrasés |
| **BL-D05** | **Terrain heightfield + métadonnées d'origine/résolution/altitude** importable/exportable ; falaises, arches, grottes et surplombs via GLB modulaires |
| **BL-D06** | **Biotopes et végétations restent définis/éditables dans Studio**, avec masques/règles/seed, même quand géométrie importée depuis Blender |
| **BL-D07** | **Archive ZIP standard + JSON V3 + dépendances** pour carte complète réellement portable et rééditable ; **GLB seul ≠ carte complète** |
| **BL-D08** | **Export scène/sélection vers Blender** via GLB+sidecar, réimport avec comparaison d'IDs/hashes, aperçu des différences et préservation des références gameplay |
| **BL-D09** | Import transactionnel sécurisé : versions, licences, limites, chemins, extensions glTF, collision d'IDs, migrations et rollback ; aucune exécution de scripts importés |
| **BL-D10** | Build jouable séparé des archives auteur et sources `.blend`, optimisé pour secteurs, LOD, instancing et GPU intégré |
| **BL-D11** | Importer une carte en **nouveau projet** par défaut ; fusion/mise à jour uniquement avec consentement explicite et remapping de références cohérent |
| **BL-D12** | Distinguer **format Blender éditable**, **asset ouvert** et **source Studio complète** ; round-trip sans perte uniquement garanti pour les données supportées de l'archive Studio |

**Spécification et jalons BL-0…BL-7 :** [20 — Blender ↔ Studio, presets et cartes](20-BLENDER-STUDIO-INTERCHANGE.md). **Aucun importer/exporter V3 complet n'est présumé livré** par la validation de ces décisions.

## VALIDÉ — eau hydrographique et rendu LOW-RESOURCE

| ID | Décision |
| --- | --- |
| **WAT-D01** | L'eau est décrite par **réseau auteur, volumes gameplay et rendu** distincts ; aucun LOD ne change la nage, la profondeur ou la flottabilité |
| **WAT-D02** | Studio permet le **tracé des cours d'eau et de lacs** : source, points, largeur, profondeur, jonctions, exutoires et **profil de pente automatique + overrides** |
| **WAT-D03** | **Rapides et cascades** issus de la pente et d'indications auteur ; une cascade possède **niveaux haut/bas explicites**, détection des contre-pentes et diagnostics |
| **WAT-D04** | Lit/berges/écume/volumes et LOD sont compilés **par secteurs**, avec source de relief indépendante du lit calculé, invalidation locale et Undo/Redo |
| **WAT-D05** | Rivières, cascades, lacs, océan rendus par **rubans/polygones et shaders stylisés légers**, pas de simulateur de fluides, FFT, réflexion ou réfraction multipasses |
| **WAT-D06** | **WaterLODManager LOD0–3** : vagues/interactions proches ; moyen fortement simplifié ; **océan et cascades lointains visibles mais sans détails animés** |
| **WAT-D07** | LOD selon **distance, surface projetée, altitude et budget graphique**, avec hystérésis ; simplifier **aussi le shader/fill-rate**, pas seulement les triangles |
| **WAT-D08** | Océan patches/anneaux possibles avec **masque des îles/côtes** et phases ancrées au monde ; aucun glissement visuel, fissure ou eau traversant la terre |
| **WAT-D09** | **Nage/plongée depuis la caméra et volumes d'eau** : teinte/visibilité, lumière adaptée et hystérésis ; pas de second rendu caméra ni de fog-cache terrestre |
| **WAT-D10** | Courants simplifiés uniquement pour acteurs concernés, navigation bateau/poisson, zones de cascades non navigables ; **aucun trafic réseau de vague/écume** |
| **WAT-D11** | Outil Studio et panneau bêta de test de l'eau : profil longitudinal, effets, niveaux, LOD, immersion et métriques, scénarios reproductibles |
| **WAT-D12** | Budget partagé avec environnement/terrain/herbe, animations GPU locales seulement, mesures réelles GPU intégré avant fixation des distances/coûts |

**Contrat technique et jalons WAT-0…WAT-7 :** [21 — Eau, hydrographie et LOD](21-WATER-HYDROLOGY-LOW-RESOURCE.md). Ces règles ne constituent **pas** une preuve de code livré.

## VALIDÉ — PERF transversal : arbitrage global CPU/GPU/RAM/streaming

| ID | Décision |
| --- | --- |
| **PERF-D01** | **ResourceBudgetManager unique** : faire évoluer `PresentationBudget` existant, conserver `FrameClock` ; aucune double boucle de qualité |
| **PERF-D02** | Observabilité honnête : p50/p95/p99, longs frames, **CPU simulation/update/soumission**, appels, caches ; **temps JS WebGL ≠ temps GPU** |
| **PERF-D03** | Mesure GPU asynchrone **seulement si supportée et valide** ; mémoire GPU **estimée** via registre de ressources, jamais présentée comme mesure matérielle exacte |
| **PERF-D04** | Budgets globaux versionnés et **consommateurs modulaires** (terrain, GLB, herbe, eau, ombres, météo, PNJ, audio, Studio) avec minima gameplay non dégradables |
| **PERF-D05** | Profils **Auto/Éco/Équilibré/Qualité**, baisse progressive et restauration lente avec hystérésis ; résolution adaptative, 20 FPS présentation en dernier recours, simulation 30 Hz indépendante |
| **PERF-D06** | LOD par **taille/erreur projetée**, importance, caméra, planage et préchargement spatial ; préserver îles, montagnes, côtes et océan visibles **sans fog-cache** |
| **PERF-D07** | **ResourceRegistry** : partage/ownership GLB, géométries et textures, cache borné en **octets estimés**, refcounts, éviction non active, test context loss |
| **PERF-D08** | **WorkScheduler** : files de priorités, quota CPU par frame et uploads bornés, préchargement directionnel, annulation/versions, fallback visuel et zéro rebuild massif |
| **PERF-D09** | **Studio** : rendu à la demande si idle, traitement différé des imports/compilations et conservation des propriétés V3 indépendamment de la qualité locale |
| **PERF-D10** | Panneau bêta Ressources : métriques, causes d'adaptation, inspection LOD/caches/queues, tests forcés, export JSON de scénario |
| **PERF-D11** | Benchmarks comparables avec/sans adaptation, p95/p99, longues traversées, mémoire, océans plein écran, scènes couplées et matériel GPU réel, pas seulement SwiftShader |
| **PERF-D12** | **Cibles non garanties** : 30 FPS nominal/20 secours, 10×10 km plafond de format, RAM/VRAM/draw calls ajustés **uniquement après mesures** ; conserver gameplay et vues lointaines |

**Spécification, interfaces et plan PERF-0…PERF-9 :** [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md). L'implémentation du manager et ses gains restent **à qualifier**, même si des bases d'adaptation existent déjà.

## VALIDÉ — audio MIDI limité et synthèse LOW-RESOURCE

| ID | Décision |
| --- | --- |
| **AUD-D01** | **5 à 10 instruments MIDI au maximum**, palette sonore réutilisable à l'échelle du monde ; ne pas confondre patches et notes simultanées |
| **AUD-D02** | **Un seul AudioContext partagé** et mixeur music/SFX/ambience/master, audio initialisé/réactivé après action utilisateur et fallback silencieux |
| **AUD-D03** | **Synthétiseur léger Web Audio** : oscillateurs, enveloppes, filtre minimal optionnel, voix mutualisées ; SoundFont GM complète et 128 patches exclus |
| **AUD-D04** | **Lecteur d'échantillons courts partagé** pour bruitages et ambiances naturelles ; boucle/sons procéduraux retenus selon coût mesuré |
| **AUD-D05** | MIDI SMF 0/1 interne → séquenceur horloge audio, programmes mappés à palette 5–10, contrôleurs restreints ; **Web MIDI matériel non requis** |
| **AUD-D06** | **AudioBudgetManager consommateur de PERF**, plafonds de voix totales/musicales, sources 3D, couches d'ambiance et cache PCM ; pas de second régulateur global |
| **AUD-D07** | Spatialisation limitée aux sons audibles, `equalpower` économique en priorité, HRTF optionnel après benchmark ; priorité aux signaux de gameplay |
| **AUD-D08** | Musique et ambiance adaptatives selon biome, météo, jour/nuit et événements depuis états logiques existants ; lecture audio indépendante des FPS/accélération de l'horloge monde |
| **AUD-D09** | **Studio** : import `.mid` et samples, mapping des 5–10 instruments, presets, `AudioEmitter` et ambiances par biotope, sans créer un DAW |
| **AUD-D10** | Archive V3 portable contient partitions, samples, patches, IDs/refs/licences, pas buffers PCM décodés, graphes de nœuds ni états audio runtime |
| **AUD-D11** | Mesurer polyphonie, latence/glitches, décodage, cache PCM et coût navigateur Firefox/Chromium, sans déduire le CPU audio des FPS GPU |
| **AUD-D12** | Pas de Web MIDI API obligatoire, pas de banque géante, pas de script dans l'import et pas de backend audio/cloud en solo |

**Architecture, budgets et étapes AUD-0…AUD-8 :** [23 — Audio LOW-RESOURCE / MIDI](23-MIDI-AUDIO-LOW-RESOURCE.md). La musique et le moteur audio sont **à développer**, pas considérés livrés.

## VALIDÉ — mines creusables 2,5D, niveaux et persistance

| ID | Décision |
| --- | --- |
| **MINE-D01** | Mines **localisées creusables par étage 2,5D**, **heightfield extérieur inchangé** ; pas de voxels mondiaux, benchmark ciblé d'alternatives en MINE-0 |
| **MINE-D02** | **3–8 étages à tester**, grilles locales par `mineId/levelId`, escalier/rampe/puits explicites ; liberté horizontale, liberté verticale **contrainte** |
| **MINE-D03** | **Exception au non-creusement du monde** : excavation **persistante uniquement dans les mines autorisées**, jamais modification implicite des sources auteur Studio |
| **MINE-D04** | Cellules solides/excavées → **faces exposées, fusion de faces et maillages par chunks**, invalidation des seules bordures concernées |
| **MINE-D05** | Collisions/navigation de mine selon **position 3D et étage**, transitions de surface ; `terrainHeight(x,z)` extérieur seul ne suffit plus |
| **MINE-D06** | **Métaux/cristaux en filons déterministes** par seed/version/profondeur, stocks épuisables persistants ; pas d'objet physique par éclat |
| **MINE-D07** | **Source V3 / partie séparés** : géologie, étages et presets auteur ; excavations, inventaire et gisements épuisés en sauvegarde locale puis serveur futur |
| **MINE-D08** | **Commande de creusement validée** : portée/outils/état, idempotence, transaction atomique excavation+récompense ; réplication snapshots/deltas et révisions plutôt que meshes |
| **MINE-D09** | Backend serveur **différé** (jeu solo statique actuel), mais protocole prêt ; futurs clients abonnés à la zone de mine, données de minerai rare gardées serveur si nécessaire |
| **MINE-D10** | **PERF** : streaming des seuls étages/chunks utiles, culling galeries, aucune ombre dynamique par torche, remeshing local et budgets partagés |
| **MINE-D11** | **Studio** : emprises/entrées/niveaux, plan par étage, filons, connexions, aperçu coupe, test temporaire, validation et archive ZIP V3 |
| **MINE-D12** | Tester entrées/heightfield, eau/mer, rampes, collisions, concurrence de récolte, sauvegarde, FPS/CPU/VRAM ; dimensions **1m / 32×32 / 3–8 étages indicatives seulement** |

**Spécification et phases MINE-0…MINE-9 :** [24 — Mines LOW-RESOURCE](24-MINES-MULTILEVEL-LOW-RESOURCE.md). **Défini ne signifie pas implémenté ni synchronisé sur un serveur en production.**

## VALIDÉ — AGRI : agriculture par parcelles, simulation différée et vues adaptées

| ID | Décision |
| --- | --- |
| **AGRI-D01** | Agriculture **facultative et délimitée à des parcelles**, moteur de culture riche **agrégé par parcelle/sous-zone**, aucun plant logique individuel |
| **AGRI-D02** | `FarmPlotDefinitionV3` **source Studio**, `FarmPlotState` **état de partie/serveur futur**, `FarmPublicVisualState` **vue compacte**, meshes/LOD **dérivés** |
| **AGRI-D03** | Croissance **à l'action, lecture ou échéance** avec `lastEvaluatedWorldTime` ; aucun tick par plante/parcelle à 30 Hz |
| **AGRI-D04** | **Historique climatique agrégé** par région/période + événements d'entretien datés ; rattrapage hors-ligne reproductible et règles versionnées |
| **AGRI-D05** | Moteur par profils de culture : saisons, température, croissance, humidité, fertilité, irrigation, maladies/parasites, rotation, rendement/qualité |
| **AGRI-D06** | Propriétaire/ouvrier autorisé : données détaillées et actions ; passant : informations publiques seulement ; **LOD graphique par caméra et budget, pas par rôle** |
| **AGRI-D07** | Cultures proches **instanciées**, rangs groupés, cultures lointaines **couleur/masque de parcelle** ; pas de collision/animation de vent/ombres par plante |
| **AGRI-D08** | **PERF** arbitre rendering, cache, quotas d'échéances et géométrie ; index spatial des parcelles, aucune boucle qualité AGRI indépendante |
| **AGRI-D09** | Actions `Plant/Irrigate/Fertilize/Treat/Tend/Harvest/Clear` validées avec stocks/eau/droits ; future transaction serveur atomique/idempotente |
| **AGRI-D10** | **Solo en sauvegarde locale**, serveur partagé et AOI futur : snapshots/deltas à événements, révisions, droits privés/publics, pas de streaming de plantes individuelles |
| **AGRI-D11** | **Studio** : outils parcelles/sous-zones/cultures/irrigation/sol, preview du cycle, ZIP V3 auteur, essais sur état de partie distinct |
| **AGRI-D12** | Benchmarks connecté/hors-ligne, 100/1 000/10 000 parcelles synthétiques, rendu de champs, p95/p99, inventaires/permissions et GPU intégré ; seuils **non garantis** |

**Spécification et phases AGRI-0…AGRI-8 :** [25 — Agriculture par parcelles](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md). **Prévu/documenté, pas encore codé ni qualifié**.

## PROPOSÉ — technique

| ID | Choix | Réévaluation |
| --- | --- | --- |
| P-001 | TypeScript strict + Vite + pnpm | M0 |
| P-002 | Rapier JS/WASM pour collisions | M1 |
| P-003 | Jeu statique et **Studio à éditeurs spécialisés** avec modules/viewport/données partagés et chargement différé | Studio Core |
| P-004 | Publication GitHub Actions, site `/little-world/` | M0 |
| P-005 | `base: '/little-world/'` en prod Vite, assets base-aware | M0 |
| P-006 | Stockage **IndexedDB + import/export JSON** pour l'éditeur | M4 |
| P-007 | Carte source structurée, génération déterministe, overrides, carte compilée | M2/M4 |
| P-008 | GLB, unités mètres, Y vertical, pivots documentés | M3 |
| P-009 | `ZQSD/WASD` mouvement, `Shift` course, `Ctrl` descente, `E` interagir | M1 |
| P-010 | `Espace` front au sol ; nouvel appui après relâchement pour toggle membrane | M1 |
| P-011 | Pas de persistance requise dans le **prototype M1**, mais **plusieurs slots persistants** pour le jeu final | Après Studio Core |
| P-012 | États d'interactions locaux, composants déclaratifs sans JS externe | M5 |
| P-013 | Terrain heightfield + meshes séparés pour surplombs | M2 |
| P-014 | Instancing végétation, décors éloignés simplifiés | Profilage M6 |
| P-015 | Pas d'escalade complexe, saut simple | M1 |
| P-016 | Carte **continue** compilée par secteurs et publiée ; Studio web **ne commit pas directement** | Pipeline carte |
| P-017 | Pas de routage SPA historique exigeant un fallback serveur | M0 |
| P-018 | Pas de `apps/server` ni de packages réseau en V1 | M0 |
| P-019 | Simulation joueur/bateau à **pas fixe 30 Hz**, indépendante du rendu 30/20 FPS, avec interpolation graphique | Première migration du runtime |
| P-020 | Budgets CPU/GPU, mémoire et réseau du document [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md) considérés comme **hypothèses à étalonner** | Benchmarks sur PC cible |
| P-021 | Dégradation par étapes (résolution, densité, LOD, effets, PNJ), passage à 20 FPS en dernier ressort | Benchmark 30/20 |

## OUVERT — valeurs, sans bloquer D0

| ID | Point à décider | Échéance |
| --- | --- | --- |
| O-001 | Licence **du code** public | Avant contributions externes |
| O-002 | Proportions finales, rig et animations originales de l'écureuil | M1/M3 |
| O-003 | Vitesses et coefficients du planage, impulsion de saut, collision | M1 |
| O-004 | Durée exacte d'oxygène et réaction non punitive à zéro | M1 |
| O-005 | Altitudes, terrain praticable et bornes visuelles de la carte | M2 |
| O-006 | Résolution du terrain et distances de rendu | M2 |
| O-007 | Sensibilité caméra et détails de capture de la souris | M1 |
| O-008 | Organisation finale des points d'entrée jeu/éditeur sur Pages | M0 |
| O-009 | Sélection des assets exacts et droits de redistribution | M3 |
| O-010 | Scène de démonstration initiale / carte source à publier | M2 |
| O-011 | Gestion des versions/migrations de cartes JSON | M4 |
| O-012 | Plage d'accès de l'écureuil à la mer | M2 |

## DIFFÉRÉ — aucune livraison V1

**Multijoueur hors livraison actuelle** (premier objectif 30 joueurs, cible future 200, scénario expérimental 500) : serveur autoritaire, transport, synchronisation, comptes, chat, persistance partagée, validation côté serveur, prédiction réseau et tests de charge ; voir [16 — Multijoueur futur](16-FUTURE-MULTIPLAYER.md).

Également différés : mobile, manette, **IA sociale complexe**, agriculture/commerce/craft étendus, combat, changements permanents de terrain par les joueurs, **météo physiquement simulée à haute complexité** (les effets stylisés ENV sont prévus en bêta), programmation libre, éditeur de polygones/rig complet. **PNJ navigants, quêtes légères, collecte et pêche éventuelle sont dans le périmètre final**, pas livrés dans le prototype.

## Écart entre politique et prototype actuel

La **politique de cadence 30/20 FPS est validée** et la migration de runtime est implémentée sur cette branche : simulation fixe 30 Hz, interpolation, réduction de résolution puis détails avant secours 20 Hz, pause hors visibilité et reprise bornée. Les PNJ utilisent des décisions 10/2 Hz. Les tests ne remplacent pas la validation de fluidité sur PC de référence ; les seuils adaptatifs restent provisoires. Voir [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md).

## Règles de suivi

1. Toute nouvelle décision métier modifie ce registre et les spécifications impactées.
2. Distinguer **confirmé**, **proposé**, **testé**, **livré**.
3. Ne pas écrire une infrastructure « au cas où » si elle complique la V1 statique.
4. L'architecture doit rester modulaire, mais la modularité n'implique pas la présence d'un serveur.

## Implémentation — campagne avancée du 12 novembre 2026

- Architecture plate TypeScript conservée ; npm/package-lock est le gestionnaire effectif.
- Source carte v2 commune, migration v1, stockage IndexedDB, export et compilation statique validés.
- Terrain local à trois LOD avec jupes, cache borné et génération répartie ; pas de worker ni promesse de gain FPS non mesuré.
- Configuration active unique par page ; carte historique conservée, grandes cartes synthétiques jusqu’à 2 km de côté.
- Rig original articulé rigide, export GLB reproductible ; skinning pondéré différé.
- PNJ par données, navigation analytique légère ; dialogues/flags de session, aucun service distant.
- Biotopes peints en overrides, écologie instanciée locale ; modèles originaux catalogués séparément des objets plaçables.
- UI d’auteur incrémentale avec annuler/rétablir ; pas de langage de script importé ni d’éditeur de règles universel.

## État après synchronisation du cadrage Studio / 100 km²

Les décisions G/M/P/I/E/C/Q validées dans main sont conservées. Le plafond **final de conception** est 10 × 10 km, mais le validateur de cette version reste volontairement limité à 2 × 2 km pour les scènes expérimentales. L’atelier livré reste unifié ; le Studio spécialisé, navigation hiérarchique, inventaire, petites activités et slots de sauvegarde joueur sont à développer. Les PNJ livrés sont tous des écureuils/créatures, aucun humain. L’interface actuelle de dialogue agit sur des flags temporaires, sans prétendre au moteur de séquences et de progression final.
