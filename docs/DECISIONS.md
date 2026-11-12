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
| D-024 | Cycle jour/nuit et météo avancée non prioritaires ; **quêtes légères/activités facultatives sont désormais prévues** |
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

Également différés : mobile, manette, **IA sociale complexe**, agriculture/commerce/craft étendus, combat, changements permanents de terrain par les joueurs, météo avancée, programmation libre, éditeur de polygones/rig complet. **PNJ navigants, quêtes légères, collecte et pêche éventuelle sont dans le périmètre final**, pas livrés dans le prototype.

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
