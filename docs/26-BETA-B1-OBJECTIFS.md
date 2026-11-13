# 26 — Little World : objectifs de la bêta B1

**Date de cadrage : 13 novembre 2026**  
**État : PÉRIMÈTRE RETENU / IMPLÉMENTATION À QUALIFIER**  
**Livrable : première bêta solo jouable, éditable, sauvegardable et testée.**

> Ce fichier fixe les **objectifs fonctionnels et critères d'acceptation de B1**. Il ne prétend pas que les fonctionnalités sont déjà codées, testées ou publiées. Les valeurs notées « proposées » restent à confirmer par mesures ou arbitrage. Aucune infrastructure multijoueur n'est requise en B1.

## 1. Finalité et définition de B1

Little World B1 est un monde d'exploration 3D paisible, continu, low-poly, dans lequel le joueur incarne un écureuil volant. Il peut explorer, rencontrer des animaux, interagir, collecter, accomplir une courte mission, résoudre une énigme, creuser une mine localisée et faire pousser quelques cultures. Les activités restent facultatives ; pas de combat, de mort, de survie punitive ou de RPG lourd.

**La bêta doit constituer une boucle de jeu cohérente**, et non une simple vitrine de technologies : découvrir → interagir → modifier un état de partie → sauvegarder → fermer → reprendre.

- **Plateforme :** navigateur PC, TypeScript / Three.js / WebGL, publication statique GitHub Pages ; pas de serveur obligatoire.
- **Carte B1 :** une zone continue **d'environ 1 km²** (hypothèse de forme : 1 000 × 1 000 m) suffisamment riche pour démontrer les biomes, l'eau, les activités et le streaming. Elle n'impose pas un remplissage uniforme.
- **Architecture long terme :** conserver un format évolutif jusqu'à **10 × 10 km maximum** sans exiger une carte de 100 km² jouable ni prétendre garantir ses performances dans B1.
- **Présentation :** cible **30 FPS**, mode de secours **20 FPS**, simulation du joueur à pas fixe indépendante du rendu ; qualification sur PC réel requise.
- **Édition :** Little World Studio permet d'éditer les éléments nécessaires à la bêta, tester le brouillon et exporter/importer le projet sans écrire de scripts de gameplay.
- **Persistance :** les sauvegardes de **partie joueur** sont distinctes des **projets Studio** et du **monde compilé**.
- **Progression :** aucune mission ou activité ne bloque l'exploration du monde.

## 2. Liste exhaustive des 15 objectifs retenus

Le champ **Statut initial** signifie « objectif sélectionné » ; l'avancement réel doit être renseigné séparément : `SPECIFIED / IMPLEMENTED / TESTED / BENCHMARKED / RELEASED`.

| ID | Objectif B1 | Exigence minimale | Test d'acceptation |
| --- | --- | --- | --- |
| B1-01 | **Monde continu d'environ 1 km²** | Relief, régions, biomes et lieux de vie, chargement spatial/LOD sans coupure artificielle | Traversée à pied et en planage, sans trou visible ni chargement bloquant ; coûts mesurés |
| B1-02 | **Déplacements et caméra** | Marche, course, saut, planage à membrane rétractable, nage, plongée, bateau et caméra troisième personne | Transitions sol/air/eau/bateau stables, entrées cohérentes à 20 et 30 FPS |
| B1-03 | **Jour/nuit et météo simple** | Horloge monde commune, éclairage/ciel jour-nuit, quelques états météo sobres (p. ex. clair/nuageux/pluie) | Transitions visuelles reproductibles ; temps/climat interrogables par le gameplay ; coût mesuré |
| B1-04 | **Biomes, eau et navigation** | Biomes configurables, végétation/faune économiques, surfaces et volumes d'eau logiques, rivière/lac/mer utiles au parcours, navigation en bateau | Nage/plongée, berges et bateau corrects quel que soit le LOD ; biomes identiques pour une même source |
| B1-05 | **3 à 5 PNJ animaux** | Routines simples, mouvements compatibles avec obstacles/secteurs, dialogues à choix, états utiles sauvegardés | Plusieurs PNJ vivent et dialoguent ; déplacement sans téléportation injustifiée ; état pertinent restauré |
| B1-06 | **Collecte et inventaire léger** | Catalogue d'objets, ajout/retrait, quantités bornées et vérification des actions | Une ressource n'est attribuée qu'une fois ; inventaire sauvegardé et restauré |
| B1-07 | **Une mission courte et une énigme** | Facultatives, construites avec déclencheurs/conditions/actions déclaratifs | Progression, succès, échec/reprise si applicable ; pas de scripts propres à chaque décor ; états restaurés |
| B1-08 | **Sauvegarde locale de partie** | Slots versionnés, position, inventaire, flags, états des interactions, mine et agriculture ; import/export ou sauvegarde récupérable suivant contrat B1 | Fermer/recharger puis retrouver l'ensemble des états attendus ; projet Studio intact |
| B1-09 | **Mine de 2 à 3 niveaux** | Zone creusable localisée en grille 2,5D, connexions d'étages, excavation persistante, 2–3 ressources de démonstration | Creuser, franchir niveaux, récolter, sauvegarder, recharger, revenir : ni roche ni ressources restaurées à tort |
| B1-10 | **1 à 3 parcelles, 3 cultures** | Semer, croissance, arrosage simple, maturité et récolte ; calcul différé par parcelle, pas par plante par image | Rechargement cohérent, mêmes résultats pour mêmes données/temps/climat ; inventaire et récoltes cohérents |
| B1-11 | **Audio MIDI, 5 timbres initiaux** | Un moteur Web Audio léger : lecteur de séquences MIDI, synthèse limitée, échantillons courts pour environnement/interactions | Playback et note-off corrects, aucun son bloqué, mute immédiat, fonctionnement à 20/30 FPS |
| B1-12 | **Édition utile à B1** | Studio : terrain, eau/biomes, objets, PNJ/dialogues/interactions, définition minimale de mine et parcelles | Modifier un élément du scénario B1 dans Studio, tester, exporter et retrouver la modification |
| B1-13 | **Format versionné et migration** | Contrats V3 auteur/compilé/partie, identifiants stables, lecture et migration non destructives des données V1/V2 | Migrer une carte de référence, exporter/réimporter V3 sans perdre objets/IDs/liens/paramètres |
| B1-14 | **Import/export, Undo/Redo, « Jouer ici »** | Transactions réversibles, sauvegarde de projet, archive portable incluant dépendances nécessaires, test sur copie du brouillon | Éditer → annuler/refaire → sauvegarder → exporter/importer → jouer → revenir, sans altération silencieuse |
| B1-15 | **Tests et instrumentation** | Tests unitaires/intégration/navigateur, compteurs FPS/frametime, ressources/LOD, benchmark représentatif et vérification du déploiement | Gates automatisés verts, scénarios manuels tracés, tests sur PC GPU intégré et problèmes documentés |

### Explications complémentaires des critères

- **Monde :** « 1 km² » mesure la surface cible de la démonstration, pas une densité de végétation obligatoire ni une promesse de 100 km² à 30 FPS.
- **PNJ :** navigation suffisamment fiable pour B1 ; pas de simulation sociale émergente ni de compétences universelles. Les 3–5 PNJ peuvent réutiliser des morphologies/rigs compatibles.
- **Météo :** B1 exige les états utiles au jour/nuit et à la croissance, pas tous les cycles célestes, la neige persistante, les orages complexes ou un climat physique complet.
- **Mines :** seule la mine autorisée est durablement excavable par le joueur. Le relief extérieur reste non creusable par le joueur ; les modifications auteur restent possibles dans Studio.
- **Agriculture :** calculs agrégés et différés par parcelle, temps du monde commun et historique climatique compact. Aucune simulation individuelle par pied de culture.
- **Audio :** les 5 timbres désignent **5 instruments/patches musicaux**, non 5 voix maximum ; polyphonie et consommation sont bornées par un budget à mesurer. Les sons naturels peuvent employer de petits échantillons.
- **Studio :** l'objectif porte sur **les modules indispensables à B1** et leurs contrats communs, pas tous les outils du Studio final.
- **Jouer ici :** état de test temporaire isolé de la source auteur et des vraies sauvegardes de partie ; le retour au Studio conserve sélection et historique.

## 3. Hors périmètre de B1

Les domaines suivants restent documentés pour le futur, sans faire partie des gates obligatoires de la première bêta :

- Serveur de jeu, comptes, persistance distante, synchronisation réseau, chat et **multijoueur** (objectifs expérimentaux futurs : 30, puis 200, puis 500 joueurs).
- Support mobile, manettes et garanties de performances sur téléphone.
- Monde de 100 km² entièrement décoré ou benchmarké comme charge obligatoire B1.
- Combat, mort punitive, faim/endurance, économie/craft/commerce complexes, IA sociale avancée.
- Éditeur de meshes/rigs/shaders, éditeur de musique complet, aller-retour Blender exhaustif et Studio final avec tous ses modules.
- Mines géantes, voxels 3D mondiaux, synchronisation serveur des excavations ; agriculture de grande échelle, toutes les maladies/traitements/rotations et droits multijoueurs.
- Simulation climatique physique, ombres multiples coûteuses, astres et phénomènes visuels avancés non nécessaires au scénario B1.

**Règle :** une capacité hors périmètre peut conserver son schéma/point d'extension lorsque cela est simple, mais ne doit pas créer de dépendance bloquante, de serveur obligatoire ou de code mort en B1.

## 4. Dépendances techniques obligatoires

| ID | Fondations / contrat à stabiliser | Consommateurs | Gate préalable |
| --- | --- | --- | --- |
| FND-01 | **World/Studio V3** : IDs stables, source sectorisée, index global, migration V1/V2 | Tous les systèmes, Studio, compilation | Migration de référence sans perte, validation de références |
| FND-02 | **GameSaveV1** : slots, versions, états métier et reprise | PNJ/mission, inventaire, mine, agriculture | Rechargement et reprise d'états cohérents |
| FND-03 | **GameAction / EventBus logique** : conditions, effets, commandes atomiques/idempotentes | Collecte, mission, creusement, récolte, interactions | Aucune ressource dupliquée au rejeu |
| FND-04 | **WorldClock + ClimateHistory** : temps déterministe, météo logique et agrégats | Jour/nuit, agriculture, routines PNJ, audio adaptatif | Croissance reproductible indépendante des FPS |
| FND-05 | **WorldCollisionQuery 3D** : surface, étage, plafond et volumes ; découplage du rendu | Déplacements, mine, eau, navigation PNJ | Trois hauteurs/sols superposés sans retour incorrect en surface |
| FND-06 | **Inventaire et catalogue ressources** versionnés | Mine, agriculture, collecte, mission | Même action = même résultat, capacités bornées et sauvegardées |
| FND-07 | **StudioContext + CommandBus** : transaction, Undo/Redo, état auteur séparé | Outils B1, prévisualisation, import/export | Une modification d'auteur reste réversible après changement d'outil |
| FND-08 | **WorldCompiler + diagnostics** : manifeste et assets statiques, préflight | Publication, import/export, Studio, runtime | Aucun lien/asset invalide publié silencieusement |
| FND-09 | **Budget de ressources partagé** avec instrumentation et quotas | Terrain, eau, PNJ, audio, météo, mine, agriculture | Pas de dégradation des états logiques avec le LOD ; benchmark GPU réel |

**Architecture minimale :** `StudioProjectV3` (auteur) → `CompiledWorld` (dérivé) ; `GameSaveV1` (état de partie), sans mélanger les responsabilités. Il faut privilégier les adaptateurs progressifs plutôt qu'une réécriture globale du prototype V2.

## 5. Définition du parcours jouable de référence

Le scénario de qualification doit être unique, reproductible, et couvrir tous les objectifs :

1. Démarrer une nouvelle partie dans la région B1 ; vérifier le chargement et les déplacements.
2. Explorer plusieurs biomes, traverser une zone d'eau, utiliser le bateau, observer jour/nuit et météo.
3. Rencontrer un PNJ, faire un choix de dialogue et accepter une petite mission.
4. Collecter une ressource ; vérifier son ajout à l'inventaire et l'état de l'objet collecté.
5. Résoudre une énigme via une interaction déclarative ; enregistrer son résultat.
6. Entrer dans une mine, changer d'étage, creuser quelques cellules et récolter minerai/cristal.
7. Revenir en surface, semer, arroser et faire progresser au moins une culture jusqu'à sa récolte.
8. Vérifier l'ambiance MIDI/SFX, puis le mute et la reprise audio sans notes bloquées.
9. Sauvegarder, fermer/recharger l'application et retrouver l'inventaire, les missions, la mine, les parcelles et la position.
10. Ouvrir Studio, modifier un élément du scénario, annuler/refaire, sauvegarder, exporter/importer, « Jouer ici », puis revenir sans écraser le projet auteur.

**Échec bloquant :** duplication d'une récolte, retour de cellules de roche, perte de dialogue/ID, sauvegarde incompatible silencieuse, régression de déplacement, référence cassée après export/import ou blocage du navigateur.

## 6. Gates de développement

| Gate | Livrable / sortie attendue | Condition GO |
| --- | --- | --- |
| **G0 — Cadrage** | Objectifs B1, exclusions, contrats critiques, machine de test, backlog et scénarios | Incompatibilités documentaires résolues ; inconnues bloquantes affectées |
| **G1 — Socle** | Migration V3 + interfaces d'état + inventaire/commandes + GameSave | Tests de migration, ID, persistance, actions idempotentes |
| **G2 — Monde jouable** | Région continue, déplacement, eau, PNJ, interactions, horloge/météo simple | Traversées et boucle mission/énigme testées |
| **G3 — Activités spécialisées** | Mine 2–3 niveaux, parcelles/3 cultures, audio 5 timbres | Tests métier et sauvegardes des trois systèmes |
| **G4 — Studio B1** | Édition, import/export portable, Undo/Redo, Jouer ici | Workflow auteur ↔ runtime sans perte ni altération |
| **G5 — Qualification/release** | Tests, benchmarks, artefacts, déploiement et rapport | Tous les critères B1 obligatoires vérifiés ou bloquants explicités |

**Un gate documentaire ne prouve pas la réalisation du code.** Pour chaque objectif tenir à jour : `SPECIFIED` → `IMPLEMENTED` → `TESTED` → `BENCHMARKED` si pertinent → `RELEASED`, avec lien de commit/PR, test et limite connue.

## 7. Décisions restant à figer au gate G0

Ce sont des **propositions**, et non des décisions utilisateur déjà acquises :

| ID | Point ouvert | Proposition de travail | Échéance |
| --- | --- | --- | --- |
| OPEN-B1-01 | Forme de la région d'environ 1 km² et répartition des lieux | 1 000 × 1 000 m ; 3–4 sous-zones visuellement distinctes | Avant création de la carte |
| OPEN-B1-02 | Contenu précis de la mission et de l'énigme | Une mission de livraison/collecte et un mécanisme environnemental | Avant scénario de référence |
| OPEN-B1-03 | Liste des PNJ, espèces, activités et dialogues | 4 PNJ de démonstration | Avant Studio PNJ |
| OPEN-B1-04 | Paramètres de la mine et gisements | 3 niveaux, grilles 1 m, chunks 32 × 32, 2–3 matières/ressources ; benchmark nécessaire | Avant mine |
| OPEN-B1-05 | Cultures/temps/saisons et absence du joueur | 3 cultures ; temps du monde figé quand l'application est fermée, progression différée pendant le jeu | Avant agriculture |
| OPEN-B1-06 | Propriété/actions des parcelles solo | Parcelles disponibles au joueur, sans système de permissions réseau | Avant agriculture |
| OPEN-B1-07 | Palette audio de référence et licence | 5 patches synthétiques + quelques SFX courts locaux | Avant audio |
| OPEN-B1-08 | Nombre de slots, sauvegarde automatique, compatibilité des changements de carte | Plusieurs slots avec version et avertissement en cas de références cassées | Avant GameSave |
| OPEN-B1-09 | Matériel et protocole de performance | PC 8 Go RAM et GPU intégré ; Firefox/Chromium ; résolution de référence à préciser | Avant qualification |
| OPEN-B1-10 | Licence du code et inventaire des licences de ressources | Définir avant une publication ou contribution externe | Avant release |

Les valeurs LOD, plafonds d'instances et budgets de mémoire sont des **hypothèses à qualifier** ; ne pas les transformer en promesses numériques avant benchmark.

## 8. Exigences pour les agents d'implémentation

- **Avant modification :** lire ce cadrage, les contrats pertinents et le code existant ; relever toute contradiction. Ne pas inventer un statut `IMPLEMENTED` sur la base de la documentation.
- **Chaque tâche :** un ID B1/FND, dépendances, fichiers concernés, invariant, tests unitaires/intégration/navigateur, preuve d'acceptation.
- **Changements structurants :** migration pure et non destructive, conservation des cartes V1/V2, tests golden et branche/PR dédiée.
- **Après changement :** `npm test`, `npm run typecheck`, `npm run build`, puis `npm run test:browser` sur build de production quand applicable ; benchmark sur scène comparée pour une optimisation.
- **Pas de dérive de périmètre :** pas de backend/multijoueur, pas de scripts libres dans les cartes, pas de système voxel global, pas d'éditeur de modèle 3D complet.
- **Validation humaine :** ergonomie, visuel, jouabilité, cohérence du monde et mesures PC réel restent indispensables ; CI et tests unitaires ne les remplacent pas.
- **Publication :** distinguer branche testée, build réussi, Pages publié et bêta effectivement qualifiée.

## 9. Documents sources

- [01 — Vision](01-VISION.md), [02 — Gameplay](02-GAMEPLAY.md), [03 — Génération du monde](03-WORLD-GENERATION.md)
- [07 — Roadmap](07-ROADMAP.md), [09 — Tests navigateur](09-BROWSER-TEST-PLAN.md), [11 — LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md)
- [12 — Périmètre](12-PROJECT-SCOPE.md), [13 — Studio UX](13-STUDIO-UX-ARCHITECTURE.md), [14 — Choix techniques](14-TECHNICAL-CHOICES.md), [15 — Contrats V3](15-STUDIO-DATA-SCHEMAS-V3.md)
- [19 — Environnement](19-ENVIRONMENT-WEATHER-SKY.md), [21 — Eau](21-WATER-HYDROLOGY-LOW-RESOURCE.md), [22 — PERF](22-RESOURCE-BUDGET-MANAGER.md), [23 — Audio](23-MIDI-AUDIO-LOW-RESOURCE.md), [24 — Mines](24-MINES-MULTILEVEL-LOW-RESOURCE.md), [25 — Agriculture](25-AGRICULTURE-PARCELS-LOW-RESOURCE.md)
- [Registre de décisions](DECISIONS.md) et [instructions pour agents](../AGENTS.md)

**Règle de priorité documentaire :** ce document détermine **ce qui est requis pour B1**, sans annuler les choix techniques globaux validés dans les documents de référence. Les fonctionnalités globales non requises pour B1 restent futures. En cas de contradiction technique, relever un point ouvert plutôt que décider silencieusement.
