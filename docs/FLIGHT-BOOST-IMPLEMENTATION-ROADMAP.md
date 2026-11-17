# Roadmap de réalisation — Boost aérien à impulsions (FLB)

**Statut : implémentation expérimentale en branche, gates de qualification partiellement ouverts.** Ne pas confondre code poussé, tests automatiques et performances sur appareil cible.  
**Source fonctionnelle :** [Étude du boost et du fun de vol](FLIGHT-BOOST-GAMEPLAY-STUDY.md).  
**Bases :** main du 17 novembre 2026 ; ré-auditer main et les branches actives avant chaque lot.  
**Contrainte :** ne pas merger par défaut ; ne pas remplacer la roadmap générale [07](07-ROADMAP.md), ni la campagne [62](62-HIGH-SPEED-FLIGHT.md).

## État de la branche (17 novembre 2026)

| Lot | État du code | Validation / restant |
| --- | --- | --- |
| FLB-0 | Audit des modules de main et du dépôt réalisé | **PARTIAL** : baseline de référence instrumentée GPU/CPU non mesurée |
| FLB-1 | **IMPLEMENTED** : impulsion 0,20 s, coût 14, délai 0,55 s, réserve 150/200 puis 224/252/280, puissance 10/11/12/14 m/s, cap 60 m/s, snapshot/replay | Tests dédiés + collision fine ajoutés ; performance et réglages à qualifier |
| FLB-2 | **IMPLEMENTED** : Shift/bouton Boost existants, compteur segmenté, cooldown, caméra et traînées bornées | Vérification tactile et ressenti à grande vitesse sur appareil réel à approfondir |
| FLB-3 | **IMPLEMENTED (prototype)** : six effets de couleurs/silhouettes, pool 24 instances, pack audio V2 indépendant avec 25 générateurs procéduraux, sélecteurs et previews | Audio marqué LISTENING_REVIEW (écoute artistique non effectuée), profilage CPU/GPU/audio réel non effectué |
| FLB-4 | **IMPLEMENTED (prototype)** : déblocages par exploration/distance/impulsions, sauvegardes V1/V2 migrées, cosmétiques, trois arbres d'amélioration | Récompenses PNJ et recettes fromage/patate/noisette restent du contenu ultérieur facultatif |
| FLB-5 | **IMPLEMENTED (prototype)** : trois défis solo, cinq anneaux instanciés, chrono et records persistants, tests de logique | **NOT QUALIFIED** : sessions de ressenti, collision/streaming à grande vitesse et validation 30/20 FPS sur GPU intégré réel |

Les scripts CI contrôlent tests unitaires, build, génération audio et tests navigateur ; **une CI verte ne prouve pas les FPS sur matériel cible**. Le cap 60 m/s est actif **sur cette branche expérimentale uniquement** et ne doit pas être considéré prêt pour une fusion de production.

**Décisions d'implémentation :** les bonus combo +5 % restent désactivés ; la conservation physique de la vitesse est déjà le bénéfice du combo. Pour éviter de rompre la génération audio reproductible, les sons de boost se trouvent dans public/audio/boost-catalog.json, fusionnés en mémoire avec le catalogue propre au monde, et non dans le fichier public/audio/catalog.json généré par script. Les variantes sont des synthèses procédurales originales, non 25 échantillons WAV acoustiques.

**Écarts volontaires par rapport au plan initial :** déblocages actuellement automatiques par progression de vol plutôt que missions PNJ ; pas de fantôme de course ni de compétition multijoueur ; contenu alimentaire inédit non créé. Ce sont des extensions futures, sans blocage des mécaniques de vol livrées.

## 0. Stratégie de livraison

Le programme comporte **6 lots séquencés**, chacun autonome, petit et testable. Chaque PR de code doit annoncer le statut **SPECIFIED → IMPLEMENTED → TESTED → BENCHMARKED → RELEASED** (aucune revendication de performance sans mesure réelle).

Ordre : **FLB-0 audit → FLB-1 physique → FLB-2 saisie/HUD → FLB-3 feedback audio/VFX → FLB-4 progression/persistance → FLB-5 défis/qualification**.

Règles communes :
- Partir du **main actualisé**, vérifier la branche de travail et les PR en cours pour éviter les duplications de la propulsion et des contrôles ; resynchroniser avant PR, ne pas écraser les branches de tiers.
- Changements isolés, pas de modifications d'architecture Studio/rendu non liées, pas de nouvelles dépendances externes.
- Respecter les contraintes de [AGENTS.md](../AGENTS.md), du [ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md), de l'[audio V2](37-AUDIO-V2-CATALOGUE.md) et du futur [multijoueur](16-FUTURE-MULTIPLAYER.md).
- **Implémenter chaque lot sur une branche de travail distincte** issue de l'état approprié, puis vérifier CI. La branche de cette étude ne doit pas devenir un fourre-tout.
- Pour chaque livraison : comportement observable, tests unitaires, typecheck/build, risque de migration, notes de benchmarks et capture de validation navigateur.

## FLB-0 — Audit de conformité et banc de départ [P0]

**Objectif :** figer l'état réel des paramètres avant de changer la physique, sans se fier aux docs historiques.

**Tâches**
- [ ] Contrôler les commits/PR actifs relatifs à mouvement haute vitesse, propulsion, contrôles PC/mobile et UI du jeu (les versions peuvent avoir divergé).
- [ ] Inventorier les sources et propriétaires uniques : gas-propulsion, motion, player, movement-state, gameplay-input, main, gas-effects, speed-effects, game-ui, food-effects, save, Audio V2.
- [ ] Établir la matrice des modes : ground/roll/air/glide/swim/dive/climb + pause/menus/dialogues et transition mobile/PC.
- [ ] Relever la courbe vitesse/altitude sur 120 s de planage : sans boost, maintien Shift, piqué/retour, virages ; consommation ; coûts collision/streaming.
- [ ] Ajouter ou maintenir un scénario reproductible à partir de la **carte exemple 4 × 3 km**, avec départ falaise, arches, forêt, eau et zones déchargées ; garder les anciennes fixtures comme tests seulement.
- [ ] Fixer un relevé machine : navigateur, GPU, résolution, qualité, frame p50/p95/p99, CPU physique p95, mémoire, trous de terrain, draw calls.

**Gate FLB-0 :** scénario reproductible et métriques initiales enregistrées ; aucun changement d'équilibrage avant ce relevé.

## FLB-1 — Moteur physique des impulsions [P0, indispensable]

**Objectif :** grosse impulsion, 10 boosts disponibles au départ, 14 à capacité max, cumul réel et vol rapide stable.

**Tâches**
- [ ] Introduire une configuration de propulsion centralisée (niveau capacité, puissance, coût 14, période 0,55 s, durée 0,20 s, vitesse plafond expérimentale 60 m/s). Niveaux et bornes définis une fois et réutilisés HUD/sauvegarde.
- [ ] Remplacer le débit 16 unités/s par une **consommation atomique d'une impulsion** ; ne pas consommer lorsque le mode est invalide, la réserve insuffisante ou l'impulsion encore en cooldown.
- [ ] Appliquer une poussée sur ticks fixes pendant ~0,20 s, sans téléportation ni gain de vitesse à l'ouverture du planeur ; conserver le momentum après la poussée.
- [ ] Ajouter déclenchement sur appui et **auto-repeat borné** au maintien ; les entrées doivent être dédoublonnées et respecter la priorité à un appui récent sans en déclencher deux.
- [ ] Gérer : relâchement en cours d'impulsion ; changement glide→air/eau/ground ; pause ; temps restant ; réserve à 0 ; collision ; reprise après focus.
- [ ] Adapter le noyau de vol (traînée, virages, plafonds, adaptation pente/énergie) pour tester 60 m/s. Ne pas augmenter le cap sans vérification collisions + streaming.
- [ ] Capturer/restaurer cooldown, tick/temps restant, niveau physique et séquence de pulses dans les snapshots de mouvement ; préserver la compatibilité des vieux snapshots si requise.
- [ ] Étendre les tests : 1 pression = 1 coût, 1 maintien = 1 impulsion chaque 0,55 s, 1 pulse n'excède pas le cap, latence invariance 20/30/60 FPS, pas d'impulsion à sec, aucun gain d'énergie sans propulsion ou piqué, replay exact.
- [ ] Conserver les fonctions de recharge existantes et leur validation ; coût et réserve configurables par tests, non dispersés en valeurs magiques.

**Gate FLB-1 :** gameplay sans effets visuels déjà jouable, flux déterministe, aucun test locomotion/régression cassé, simulation à 30 Hz ; vitesse 60 m/s **non activée en production** avant qualification FLB-5.

**Livrables :** module de simulation, tests, paramètres documentés, comparatif avant/après des courbes de vitesse et consommation.

## FLB-2 — Commandes, HUD et ressenti caméra [P0]

**Objectif :** garder une action simple et des informations visibles sans polluer le HUD.

**Tâches**
- [ ] PC Shift : appui et maintien en glide ; préserver roulade au sol et vitesse en nage ; ne pas utiliser le clic droit comme action.
- [ ] Mobile : **Boost et Saut/Planeur restent deux commandes distinctes**, joystick gauche/droite correct, orientation caméra cohérente, bouton Action uniquement contextuel.
- [ ] Couper les entrées au focus UI/textarea, chargement, pause, perte du focus et changement d'onglet ; supprimer raccourcis navigateur involontaires, double activation de Space et réouverture du dernier panneau.
- [ ] Mettre à jour la jauge en **impulsions complètes (disponibles/max)** et afficher un signal de cooldown sobre ; ne pas afficher de jauge redondante hors planage.
- [ ] Réutiliser le FOV/recul/roulis/traînées existants ; calibrer leur effet de 34 à 60 m/s sans secousse et sans modifier la physique ; respecter reduceMotion et speedEffects.
- [ ] Ajouter un retour explicite mais discret lors d'un boost refusé (réserve, cooldown, planeur fermé), sans notification intrusive à chaque tick.
- [ ] Tester souris, clavier AZERTY/QWERTY, Firefox (menu clic droit), tactile, navigation/menus et 20 FPS de rendu avec simulation 30 Hz.

**Gate FLB-2 :** 20 appuis successifs ou maintien sans double déclenchement, comportement cohérent sur PC/mobile, aucune fenêtre parasite ; HUD et volant de caméra restent lisibles à grande vitesse.

## FLB-3 — Skins, animation et sons [P1]

**Objectif :** rendre chaque impulsion expressive sans charger le GPU/CPU ni fatiguer l'auditeur.

**Tâches**
- [ ] Créer un registre de **six skins** : classique, fromage, patate, noisette, magique, arc-en-ciel. IDs stables, paramètres de palette, taille, dispersion et silhouette ; aucun changement des forces.
- [ ] Étendre le pool existant src/hamster/gas-effects.ts (24 instances, tolérance à tester à 32) ; réutiliser géométries/matériaux, aucune création par frame. Limiter le nombre d'instances des autres joueurs futurs.
- [ ] Déclencher l'effet au **numéro d'impulsion autorisée** (gasPulseSeq), pas au maintien de la touche ni à chaque image ; décider comment gérer les impulsions manquées en rendu basse cadence.
- [ ] Ajouter animation courte du hamster (réaction à l'impulsion, déploiement et accélération) sans casser le rig low-poly ni l'animation d'atterrissage.
- [ ] Ajouter au catalogue Audio V2 **25 prises cibles** réparties en 5 classique, 4 puissant, 3 fromage, 3 patate, 3 noisette, 3 magique, 2 vent, 2 combo ; sons originaux licenciés, statuts de production explicites.
- [ ] Définir événements stables : player.boost.pulse, player.boost.heavy, player.boost.combo, player.boost.wind (noms définitifs à réserver après audit des collisions d'IDs). Sélection de variantes par skin/intensité, faible randomisation de pitch, anti-répétition et fallback.
- [ ] Prioriser les sons du joueur dans le budget Audio, limiter la polyphonie, respecter mute, environnement audio refusé, pauses et onglet masqué ; vérifier écoute longue (30 min) et variation des sons.
- [ ] Ajouter prévisualisation du skin/son dans le menu de personnalisation existant, **sans dépenser** du gaz ; une seule sélection visuelle et sonore configurables séparément.

**Gate FLB-3 :** six skins testables et six familles audibles, aucun doublon effet/son, aucun coût supplémentaire significatif non mesuré, réglages de réduction d'effets efficaces ; production sonore non déclarée « validée artistiquement » sans écoute.

## FLB-4 — Progression, nourriture, sauvegardes [P1]

**Objectif :** offrir une progression légère sans grind, sans perdre les sauvegardes existantes.

**Tâches**
- [ ] Séparer **capacité** (200/224/252/280 ; 14/16/18/20 boosts), **puissance** (10/11/12/14 m/s par impulsion), **maîtrise** (3 niveaux légers, pertes de virage), cosmétiques (skins/sons débloqués et sélectionnés).
- [ ] Introduire une table de récompenses lisible associée à de petits défis (exploration, parcours, mission PNJ, récolte) ; aucun boost imposé sur les petites quêtes.
- [ ] Garder les aliments existants (pomme +25, poire +25, prune +15, cerise +12), tester la boucle d'acquisition et de recharge ; prévoir recettes amusantes plus tard comme contenu de jeu, non comme mécanisme indispensable.
- [ ] Migrer les sauvegardes V1/V2, valeurs de gaz 0..100 vers les nouveaux plafonds **sans écraser la réserve ni créer du carburant à partir de la migration** ; renseigner des valeurs par défaut sûres pour les nouveaux champs. Documenter l'interprétation des anciennes valeurs.
- [ ] Valider les IDs de skins et les niveaux, rejeter nombres hors bornes et clés inconnues selon stratégie du parseur. Garder la persistance par slot et l'absence de backend.
- [ ] Séparer les réglages d'affichage locaux des déblocages sauvegardés ; ne pas stocker le catalogue audio dans chaque sauvegarde.
- [ ] Prévoir les règles de courses standard (capacités identiques) et libre (améliorations) pour éviter des records incomparables.

**Gate FLB-4 :** charger d'anciennes parties, gagner une amélioration, quitter/réouvrir, retrouver exactement réserve, niveaux et apparence ; aucun duplicata d'aliment ni inflation involontaire de gaz.

## FLB-5 — Défis, équilibrage et qualification finale [P1]

**Objectif :** vérifier que le nouveau vol est vraiment amusant et compatible low-resource.

**Tâches**
- [ ] Définir 3 défis solo utilisables sur l'île **4 × 3 km** : anneaux de vol, parcours piqué-remontée, trajet à nombre limité de pets.
- [ ] Enregistrer temps, nombre de pulses, vitesse maximale et meilleure performance ; HUD de course contextuel seulement. Éventuels fantômes issus des commandes/états de simulation, pas de serveur.
- [ ] Faire des sessions de réglage : 10 vs 20 pulses, appui unique vs maintien, pic 120/150/180/216 km/h, météo et relief, confort PC/mobile, effets avec son/mute.
- [ ] Benchmark de **collisions à 60 m/s** : collider fin, pont, tunnel, arche, arbres, eau, haut de falaise, réception violente ; corriger les traversées avant déblocage du cap.
- [ ] Benchmark de **streaming à 60 m/s** : préchargement d'avance, anneau de sécurité et cache borné ; pas de trous, de backlog incontrôlé ni de reconstruction par frame.
- [ ] Mesurer p50/p95/p99 de la simulation et rendu, CPU collisions, charges streaming, draw calls, mémoire/GC, voix audio et bugs de focus sur navigateur PC avec GPU intégré réel. Comparer au baseline FLB-0. Ne pas utiliser le seul SwiftShader comme validation.
- [ ] Vérifier 30 FPS nominal et 20 FPS secours comme objectifs, pas promesses ; ajuster vitesse/effets si besoin, sans changer les invariants physiques.
- [ ] Tester la capture/restauration et le rejeu déterministe des pulses, des meilleurs temps, des commandes et de l'état esthétique ; documenter le format futur de présentation distante, **sans réseau**.
- [ ] Mettre à jour les docs de gameplay, configuration, captures/mesures et la documentation de version. Programmer la revue de fusion seulement quand tous les gates obligatoires sont verts.

**Gate FLB-5 :** aucune traversée de collisions à vitesse activée, aucun terrain invisible, aucun coût inacceptable sur PC cible, sauvegardes anciennes compatibles, audio/VFX bornés, feedback joueur satisfaisant ; sinon garder le plafond réduit et consigner le blocage.

## Matrice transversale : tests à ajouter/mettre à jour

| Couche | Cas minimum | Répertoire ou commande |
| --- | --- | --- |
| Boost pur | Cadence, coût 14, réserve partielle, relâchement, refus, niveau, puissance, bornes | tests/gas-propulsion.test.mjs |
| Physique | inertie, énergie, frein, virage, vitesse 60 m/s, transitions | tests/dynamic-motion.test.mjs et nouveaux tests ciblés |
| Snapshots | capture, restauration, vieux états, replay à 30 Hz | tests/physics + src/physics/movement-state.ts |
| UI/saisie | Shift, Space, tactile, focus, clic droit, pause, HUD | tests UI/input navigateur déjà présents |
| Sauvegarde | V1/V2 migration, progression et skins, invalides | tests de gameplay/save |
| Audio | registre V2, 25 prises/fallback, événement unique, mixeur, mute | tests Audio V2 existants |
| Rendering | 6 palettes, pool borné, effets désactivés, perte WebGL | outils/browser de test et perf |
| Parcours | scénario sur l'île 4×3, 60 m/s, obstacles, streaming | npm run test:motion, npm run benchmark:route |
| Validations globales | régressions du jeu et du Studio | npm test ; npm run typecheck ; npm run build |

**Commandes de contrôle à exécuter selon lot** (certaines nécessitent un serveur local et Chromium) :

~~~sh
npm ci
npm test
npm run typecheck
npm run build
npm run bench:physics
npm run benchmark:route
npm run test:motion
npm run test:gameplay
npm run test:audio
npm run test:ui
~~~

Pour les tests navigateur, vérifier l'orthographe/les scripts présents dans package.json au moment de la livraison. Collecter captures et statistiques plutôt que d'affirmer simplement « tests passés ».

## Critères de refus / non-régression

- Ne **pas** merger si un boost consomme du gaz au sol, si le maintien répète plusieurs fois dans un seul tick, si une sauvegarde ancienne échoue ou si Shift/Espace/clic droit ouvre une interface parasite.
- Ne **pas** autoriser 216 km/h si les collisions, le streaming et la stabilité sur GPU intégré ne sont pas démontrés.
- Ne **pas** ajouter un nouveau moteur audio, une texture volumineuse par skin, une allocation par tick, une nouvelle ressource temps réel ou une dépendance serveur.
- Ne **pas** confondre bonus de combo, buff de nourriture, skin et autorité physique ; tous les déblocages visuels doivent être non compétitifs.
- Ne **pas** effacer/recréer les références de cartes Studio ni modifier des documents non liés.

## Décisions proposées à valider par le playtest

| Question | Défaut proposé | Quand juger |
| --- | --- | --- |
| 10/14 impulsions au départ | Oui (150/200 unités) | FLB-1, puis FLB-5 |
| 20 impulsions finales | Oui (280 unités) | FLB-4/5 |
| Puissance 10→14 m/s | Oui, décroissance proche du cap | FLB-1/5 |
| Cooldown 0,55 s et pulse 0,20 s | Oui | FLB-1/5 |
| Plafond 216 km/h | **Expérimental**, non garanti | FLB-5 |
| Bonus combo +5 % | **Désactivé par défaut** | Après essais FLB-5 |
| 6 skins et 25 sons | Cible de contenu | FLB-3 |
| Recettes fromage/patate/noisette | Complément ultérieur | Après FLB-4 |
| Courses / fantômes | Solo d'abord, réseau plus tard | FLB-5 |

## Compte-rendu de chaque lot (à remplir par l'agent)

- **Lot et branche/PR :**
- **Révision de base main :**
- **Fichiers modifiés et raisons :**
- **Fonctions effectivement implémentées :**
- **Tests lancés / non lancés et résultats :**
- **Mesures avant/après et machine :**
- **Compatibilité sauvegarde/Studio/carte 4×3 :**
- **Risques, régressions et décisions encore ouvertes :**
- **Statut du gate :** PASS / FAIL / NOT MEASURED

Le prochain développement doit commencer par **FLB-0**, pas par générer d'emblée 25 sons ou augmenter aveuglément la constante GLIDE.max.
