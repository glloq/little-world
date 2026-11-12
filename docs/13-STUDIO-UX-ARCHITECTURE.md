# 13 — Little World Studio : UX, modules et contrats de données

**Document d'architecture cible pour le développement** — décisions basées sur [12-PROJECT-SCOPE.md](12-PROJECT-SCOPE.md). **Non implémenté entièrement.**

**Décisions complémentaires validées** : [14 — Choix techniques du moteur et des éditeurs](14-TECHNICAL-CHOICES.md). En particulier : **TE-E4 / TD-D3 = transactions inter-éditeurs + checkpoints**, **TE-E7 = validation incrémentale**, **TL-L7 = formulaires + séquences** ; les écrans restent spécialisés (E1=C).

**Contrats désormais précisés et retenus :** [15 — Schémas V3 et contrats entre éditeurs](15-STUDIO-DATA-SCHEMAS-V3.md). Ce document 13 définit **l'UX et les parcours d'auteur** ; le document 15 décrit **les sources de données, ID, composants, transactions, registres, migrations et responsabilités**. Le V3 reste une **architecture cible non implémentée**.

## Contrats communs incontournables

- Le contexte `StudioContext` conserve **projet, ID de sélection, secteur/caméra, éditeur actif et outil** quand on passe du terrain au PNJ, dialogue ou mécanisme.
- Un **`ProjectStore` versionné** prend en charge plusieurs projets, index de secteurs et des changements atomiques ; plus d'unique brouillon `main` comme cible finale.
- Un **`CommandBus` réversible avec checkpoints** assure l'historique inter-éditeurs ; **un geste continu = une transaction**.
- Les éléments affichés proviennent de **`EntityDefinitionV3` + composants typés** ; le `Mesh` Three.js n'est jamais une source de vérité d'auteur.
- Le `ReferenceIndex` résout les relations même si des secteurs sont déchargés ; erreurs de liens et invalidations sont navigables depuis la carte globale.
- La carte source V1/V2 reste migrable et utilisable pendant la transition V3.
- Les **contrats exacts et gates** sont détaillés dans le document [15](15-STUDIO-DATA-SCHEMAS-V3.md).

## 1. Principe : éditeurs spécialisés, projet unifié

**Choix E1=C confirmé** : créer des éditeurs spécialisés, plutôt qu'un seul écran débordant de menus. Ils sont **indépendants au niveau de leur interface et de leurs outils**, mais partagent un **seul graphe de données versionné**, un contexte de sélection, les IDs d'entités et le service de sauvegarde.

Le Studio doit rester utilisable **sans connaissance de Three.js ou de programmation**.

### Modules et transitions

| Éditeur | Opérations essentielles | Lien avec les autres |
| --- | --- | --- |
| **Projet / carte globale** | Vue 2D et miniature du monde, recherche des zones/objets, accès rapide à une coordonnée, état d'enregistrement | Ouvre un secteur dans l'outil approprié |
| **Terrain** | Sculpter, lisser, niveler, gérer pentes, prévisualiser régénération locale | Préserve objets/overrides ; signale collisions et objets mal posés |
| **Eau et chemins** | Rivières/lacs/cascades, volumes de nage/bateau, chemins/splines, ponts | Actualise terrain local, navmesh, biotopes et exclusions |
| **Biotopes / écologie** | Peinture, densité, familles de végétaux et animaux, règles de distribution | Produit des instances compilées par secteur |
| **Objets / bâtiments** | Catalogue, placement, multisélection, groupes, variantes, portes, modules | Crée points d'attache et objets interactifs |
| **Personnages / PNJ** | Morphologie, couleurs, accessoires, activités, déplacements, zones autorisées | Ouvre éditeur de dialogues, animations ou actions sur le même ID |
| **Dialogues** | Texte, réponses, conditions, réactions, sons, aperçu conversationnel | Références typées vers PNJ/états/actions |
| **Actions / événements** | Déclencheur → conditions → séquence → effets, mode test | Références vers objets, PNJ, audio et progression |
| **Assets** | Import GLB/audio/animations, validation, aperçu, variante/prefab | Catalogue commun, aucun lien rompu sans avertissement |
| **Test / analyse** | Jouer depuis une position, injecter états, visualiser navmesh/collisions, profiler, diagnostics | Revient à la sélection/au brouillon antérieurs |

**Chargement différé des modules d'édition** : ne pas charger l'éditeur de dialogues/animation complet simplement pour afficher la carte. La caméra et les primitives de rendu peuvent être communes.

## 2. Parcours UX à garantir

1. **Nouvelle carte** → choisir dimensions (sous limite 10 km par axe), graine, biotopes initiaux → générer/apercevoir → sauvegarder.
2. **Créer une forêt** → ouvrir Biotopes → choisir « Forêt » → peindre → régler densité → régénérer **seulement la zone** → annuler si nécessaire.
3. **Créer une rivière** → Eau → tracer les points → modifier largeur/profondeur → aperçu des volumes de baignade et des passages de bateau.
4. **Créer une maison** → Objets/Bâtiments → glisser prefab → aligner au relief → ajouter porte à partir d'un modèle d'interaction.
5. **Créer un PNJ** → Personnages → choisir espèce/variantes, position et activité → dessiner zone de navigation → ouvrir son dialogue dans l'éditeur associé.
6. **Créer une petite mission** → dialogue d'un PNJ → réponse → action d'attribution d'objet/flag → condition de restitution → récompense ou réaction ; pas de script.
7. **Tester** → « Jouer ici » depuis la sélection/caméra, avec brouillon non publié → retour à l'éditeur sur le même projet, avec historique intact.
8. **Diagnostiquer** → sélection d'un objet/ID cassé → zoom vers sa position → proposition de correction explicite, jamais réparation silencieuse.
9. **Exporter** → préflight des schémas/liens/assets → archive portable du projet + rapport d'erreurs → compilation statique hors jeu.

Toute opération fréquente doit viser **2–3 actions** à partir d'un contexte déjà sélectionné, pas une traversée d'onglets et de modales.

## 3. Interface commune minimale

- **En-tête** : fil d'Ariane projet/zone/outil, état brouillon (sauvé/non sauvegardé), annuler/refaire, test et export. Conserver compact.
- **À gauche** : outils contextuels de l'éditeur actif et bibliothèque/objets utiles. Ne pas afficher tous les outils à la fois.
- **Au centre** : grande vue (perspective, dessus, libre) et manipulation directe de l'objet/zone.
- **À droite** : inspecteur contextuel repliable ; jamais des centaines de champs simultanés.
- **En bas** : barre de statut compacte (outil, sélection, erreurs, FPS/latence si mode diagnostic) ; pas de grand panneau permanent.
- **Commandes** : clic gauche action outil/sélection, clic droit maintenu orbite, clic molette pan, molette zoom, `F` cadrer sélection, `Suppr` supprimer, `Ctrl+Z/Y` annuler/refaire, `Échap` annuler action courante. Les mappings précis restent configurables et testés AZERTY/QWERTY.
- **Toujours visible** : outil courant, zone modifiée, survol, aperçu avant application, état d'annulation et erreurs.

Le Studio utilise son propre système de contrôle caméra ; **ne pas confondre** avec la règle du jeu (clic gauche maintenu pour orbiter).

## 4. Modèle de monde commun

Séparer la **source auteur** et le **runtime compilé**, avec contrats de données explicites (noms indicatifs) :

```text
StudioProject
├── metadata: projectId, schemaVersion, name, assetCatalogVersion
├── world: WorldDefinition (widthM, lengthM, seed, seaLevel, generatorVersion)
├── chunks: ChunkSource[] / overrides sauvegardés par secteur
├── resources: AssetReference[] / prefabs versionnés
├── entities: EntityDefinition[] avec IDs stables
├── biomes: BiomeZone[] / règles de distribution
├── navigation: NavArea[] / portails par secteur
├── dialogues: DialogueGraph[] / choix/conditions
├── behaviors: BehaviorDefinition[] / états et routines
├── interactions: InteractionDefinition[] / événements/conditions/actions
├── objectives: ObjectiveDefinition[] / petits objectifs facultatifs
└── validation: rapports, erreurs de références, migration, compilation
```

Pour 10 × 10 km : fichiers **découpés en secteurs** + manifeste/indices. Une carte « 100 km² » ne doit pas être matérialisée en un gigantesque JSON chargé en mémoire.

**IDs stables** : `projectId`, `worldId`, `chunkId`, `entityId`, `assetId`, `dialogueId`, `behaviorId`, `interactionId`, `flagId`. Interdire références par nom visuel ou index instable.

**Sources** : génération de base déterministe + overrides manuels + entités auteur. Ne jamais créer le GOLD d'un état de carte à partir de meshes rendus alors que la source existe. Recompiler uniquement les secteurs et index affectés.

## 5. Schémas d'entités et composants

Préférer un modèle déclaratif limité avec composants validés :

| Composant | Données / rôles |
| --- | --- |
| `Transform` | Position, rotation, échelle, section, parent |
| `Renderable` | asset/prefab, variante, visibilité/LOD |
| `Collider` | Forme simple, couche de collision, nature statique |
| `Interactable` | invite, portée, entrée utilisateur, cooldown |
| `TriggerVolume` | forme, événements entrée/sortie, filtres |
| `Animated` | clips/références, réglage vitesse, lecture |
| `StateMachine` | états possibles, transition, état initial |
| `CharacterAppearance` | rig compatible, proportions, couleurs, accessoires, émotions |
| `NPCBehavior` | zone d'activité, routine, chemin, réactions |
| `NavAgent` | classe de déplacement, vitesse, zones autorisées |
| `DialogueActor` | graphes de dialogue et répliques |
| `InventoryObject` | objet ramassable, ID de type, usage |
| `Persistence` | liste des champs sauvegardables, namespace de partie |
| `AudioEmitter` / `EffectEmitter` | sons/effets paramétrables avec coûts bornés |

**Ne pas obliger chaque élément à posséder toutes ces propriétés**. Les templates construisent des assemblages compatibles.

## 6. Modèle d'interaction générique

Une interaction est une suite **déclarative**, jamais un morceau de JavaScript injecté depuis les cartes :

```text
Événement → Préconditions (ET/OU) → Actions ordonnées → État(s) modifié(s)
```

### Déclencheurs

`onInteract`, `onEnterZone`, `onExitZone`, `onTimer`, `onDialogueChoice`, `onStateChanged`, `onAnimationFinished`, `onObjectiveUpdated`.

### Conditions

`flagEquals`, `entityStateEquals`, `hasItem`, `distanceWithin`, `cooldownReady`, `objectiveState`, `all`, `any`, `not` (profondeur bornée et schéma validé).

### Actions

`setState`, `toggleState`, `setFlag`, `playAnimation`, `playSound`, `showText`, `startDialogue`, `giveItem`, `takeItem`, `moveNPCTo`, `playEffect`, `wait`, `emitEvent`, `updateObjective`.

Chaque action dispose de paramètres typés, contraintes de valeur, référence d'objet sélectionnable dans la scène et erreur de validation compréhensible. Limiter la longueur/profondeur des séquences et **empêcher les cycles instantanés infinis** (`emitEvent` en boucle).

### Modèles prêts à l'emploi (P0)

- Porte à ouvrir / fermer.
- Levier → objet cible (roue, vanne, grille).
- Collectible / objet ramassable.
- PNJ qui salue / parle.
- Panneau affichant un texte.
- Déclencheur d'effet dans une zone.
- Petite mission (donner, retrouver, rapporter).
- Énigme à étapes.
- Objet à état persistant avec réinitialisation configurable.

L'auteur peut **partir du modèle** et n'éditer que les cibles, conditions et durées courantes.

## 7. Dialogues et réactions PNJ

- Éditeur en **liste de répliques avec embranchements visibles** ; pas d'éditeur de graphes complexe obligatoire.
- Chaque réplique peut avoir : locuteur, texte, choix, conditions, animation, émotion, son stylisé et actions avant/après.
- Aperçu interactif du dialogue avec simulation de flags/items et retour aux nœuds.
- États PNJ simples (repos, marche, travail, salut, regard, fuite, interaction).
- **Navigation libre dans la zone** avec hiérarchie à grande échelle : topologie/connexions par secteur, recherches locales proches, mises à jour seulement quand utiles ; comportements restent simples.
- Pas de PNJ humains : variantes animales du personnage joueur quand compatibles ; modèles alternatifs pour oiseaux, poissons et animaux non humanoïdes.
- Si un lien dialogue/animation/PNJ manque : préflight bloquant pour la publication, diagnostic cliquable pour l'auteur.

## 8. Périmètres de navigation et logique monde

- Jeu : coordonnées monde continues, mais chargement **spatial** de la carte.
- Plan global 2D du Studio = aperçu découplé des meshes haute résolution ; sélectionner une zone depuis le plan.
- `NavAgent` : zone autorisée, pente/traversabilité, eau/sol, obstacles, portes/ponts ; aucun calcul global par frame.
- Calculer les données de navigation avec la **compilation des secteurs** ; invalider localement les éléments touchés par la sculpture/eau/bâtiment.
- Faune décorative : **pas tous des PNJ complets**. Poissons par groupes, oiseaux à trajectoires contrôlées, insectes simplifiés.
- Retoucher le terrain ou ouvrir une porte peut invalider la navigation : signaler et recalculer les sous-zones concernées.

## 9. Annulation, sauvegarde et compilation

**Une commande d'édition = une transaction réversible** : création, suppression, modification, transformation, peinture par trait, remaniement de spline, édition d'une réplique, modification d'une interaction. Éviter une entrée Undo pour chaque pixel/déplacement de souris.

- Autosauvegarde IndexedDB avec indication visible et gestion des erreurs/quota.
- Projets, brouillons et **slots de sauvegarde du joueur distincts**.
- Export/import de projet **portable, versionné**, incluant données auteur et références du catalogue ; archive sectorisée pour grandes cartes.
- Les assets très lourds peuvent rester en fichiers distincts tant que l'archive est reproductible ; signaler explicitement les dépendances manquantes.
- `Validate Project` puis `Compile World` : vérification de schémas, liens, collision/navigation, budgets/tailles ; produire un manifeste statique et les chunks nécessaires, pas une copie du Studio dans le jeu.
- « Jouer ici » lance le **runtime sur une copie temporaire du brouillon** ; au retour, aucune modification auteur persistante involontaire.
- Publication publique : commit/build GitHub Actions, **jamais de token GitHub dans le navigateur**.

## Prévisualisation de l'horizon et contrôle des LOD

**Décision UX validée :** le Studio doit pouvoir montrer l'effet du rendu à plusieurs kilomètres **sans utiliser de brouillard-cache** (voir [17 — Vue panoramique](17-DISTANT-VIEW-RENDERING.md)).

- **Vue carte globale** : secteurs de paysage et relief d'horizon à résolution simplifiée, sans charger tous les meshes.
- **Terrain et biotopes** : aperçus de silhouette depuis quelques points de vue enregistrables, diagnostic de fissures/transition LOD.
- **Objets et assets** : indication de coût, proxy/silhouette pour les repères importants, atlas/imposteur si justifié.
- **Tests/performance** : activer/cacher séparément terrain proche, terrain lointain, végétation, imposteurs ; reproduire marche, planage, bateau et rotation panoramique.
- Ne pas submerger l'auteur de réglages GPU : profils automatiques, options avancées facultatives, erreurs navigables et résultats mesurés.

## Studio — édition simple des herbes par biotope

Le [cadrage 18](18-GRASS-LOW-RESOURCE.md) prévoit **de l'herbe courte principalement intégrée au sol**, et des **touffes hautes 3D facultatives**, générées automatiquement autour du joueur. L'éditeur Biotopes doit exposer **style, densité et hauteur d'herbe** via presets simples, peinture et exclusions ; aucune édition manuelle de milliers de touffes.

- Utiliser les mêmes `seed`, régions et règles déterministes que le projet V3, avec régénération **seulement locale** et Undo/Redo cohérent.
- Prévoir un **aperçu « Sol seul / Touffes / Vent / Interaction »** et des profils graphiques `groundOnly`, économique, équilibré et dense.
- L'inspecteur ne doit pas imposer de régler par touffe distances LOD, coefficients shaders ou matrices d'instance.
- Le mode Test peut simuler **le passage de 1 ou 2 personnages** et afficher coût CPU/GPU si mesurable.
- Aucun état de déformation cosmétique, buffer GPU ou instance individuelle ne doit être sauvegardé comme source auteur ou état de partie.

## Menu d'environnement de la bêta : météo, astres, neige et ombres

La [spécification 19](19-ENVIRONMENT-WEATHER-SKY.md) définit un **panneau « Environnement » de test**, indépendant des données auteur et du futur serveur.

**Éléments à tester sans modifier une carte source :**
- Presets Clair/Nuageux/Pluie/Neige/Mixte/Brouillard/Orage et transitions immédiates ou interpolées.
- Heure solaire **0–24**, pause/×1/×60/×240, durée du jour, date/saison si disponibles.
- Couverture du ciel, visibilité des étoiles, **liste de lunes avec cycles propres** : périodes, déphasage, inclinaison, tailles/couleurs et visualisation des phases.
- Vent, température, précipitations, neige accumulée/fonte, humidité, limite altitudinale d'enneigement.
- **Ombres auto/off/on** : distance 20–40 m indicative, résolution 512²/1024², casters sélectionnés, coût rendu/frames et compteur d'ombres.
- Profil GPU minimal/équilibré/élevé, comparaisons à caméra égale, export JSON de scénario de test, restauration de l'état initial.

**Architecture UX :** un panneau compact avec presets et commandes simples, options techniques avancées repliées. Un override de test n'altère **ni `EnvironmentDefinitionV3` de l'auteur, ni slot de partie**, sauf action explicite. Le bouton « Jouer ici » reprend ce même moteur d'environnement ; ne pas dupliquer le système.

## UX Blender ↔ Studio : modèles, packs de presets et cartes

La [spécification 20](20-BLENDER-STUDIO-INTERCHANGE.md) détermine une interface compacte de création 3D **sans réimplémenter Blender**.

**Bibliothèque / assets** :
- `Importer un modèle GLB` → preview 3D, unités/axes, pivot, dimensions, nombre de triangles/matériaux, animations/LOD et provenance/licence.
- `Importer un preset` → ZIP+manifest, aperçu des enfants, points d'ancrage, dépendances et recouvrement d'IDs.
- `Exporter l'asset` ou `Exporter le preset et ses dépendances` ; source `.blend` optionnelle, non embarquée dans le runtime.
- `Mettre à jour un modèle` → garder la version du catalogue/ID, montrer les changements/pivots et remapper les ancres si nécessaire, **ne pas détruire les instances**.

**Dans l'éditeur de carte** :
- Glisser-déposer d'un modèle/preset depuis la bibliothèque, gizmos **déplacer/rotation/échelle**, translation XYZ et scale uniforme en mode courant, 3 axes/parents en avancé ; aimantation, alignement terrain, duplicate, group, Undo/Redo.
- L'éditeur de terrain conserve **sculpture locale**, import heightfield Blender + géométrie GLB pour grottes/arches, masques de biome avec origine/échelle explicites.
- **Biotopes/végétation** restent de simples contrôles de zones, densités, exclusions et seed même si la scène vient de Blender.
- **Exporter la sélection vers Blender** (GLB + JSON sidecar d'IDs/transforms) et **réimporter la scène** via aperçu ajout/modification/suppression potentielle/conflit ; ne pas perdre dialogues/PNJ/overrides non géométriques.
- **Exporter le projet complet** (ZIP portable), **Importer un projet** (nouveau projet par défaut), **Exporter le build jouable** : trois commandes **distinctes et clairement décrites**.
- Les erreurs de taille, licence, géométrie non supportée, IDs ou dépendances sont **cliquables** et bloquent les mutations destructives, sans remplacer la carte courante à l'échec.

**Parcours obligatoire** : Blender GLB → Library → placement avec 3 transforms → peinture d'un biome → prefab/preset exporté → nouvelle carte avec import → export ZIP carte → restauration avec toutes les références → export scène Blender → réimport non destructif.

## Éditeur Eau : profil longitudinal et niveaux de détails

**Contrat :** [21 — Eau, relief, cascades et LOD](21-WATER-HYDROLOGY-LOW-RESOURCE.md). Étendre le tracé de l'eau V2 au lieu de concevoir une interface de simulation de fluides.

- Outils **Cours d'eau / Lac / Cascade / Rapides / Mer**, avec clics de points et édition directe dans le viewport et la carte 2D.
- **Adaptation automatique au relief** après tracé, visualisation simple du **profil terrain / niveau eau** et repères de cascades/rapides, diagnostic des sections qui remontent.
- Contrôles simples : largeur, profondeur, courant, surface claire/turbide, niveau verrouillé facultatif, distance aux berges et navigabilité ; overrides manuels et Undo/Redo.
- Preview **rive / bateau / plongée / planage**, curseur LOD0–3 et profil qualité, boutons mousse/vagues/particules, mesures CPU/GPU/draw calls si disponibles.
- Édition propre : une action unique undo pour modification de spline/tronçon, aperçu du terrain creusé et des chunks invalidés, **préserver les IDs et les projets lors des imports V2/V3**.
- Une cascade GLB Blender reste **un décor graphique** tant que son volume, ses niveaux et sa navigation ne sont pas définis dans l'hydrographie V3 ; export archive Studio portable.
- Les options GPU avancées restent repliées ; l'auteur ne règle pas manuellement chaque triangle d'une rivière.

## Bêta : panneau Ressources / Performance et budget du Studio

**Spécification :** [22 — ResourceBudgetManager](22-RESOURCE-BUDGET-MANAGER.md). Le Studio ne doit pas multiplier les sous-menus d'optimisation à côté des éditeurs Eau, Herbe, Météo et Assets.

**Un seul panneau technique bêta**, organisé **Résumé / Qualité & LOD / Chargement & mémoire / Scénarios**, accessible indépendamment du module actif :
- **Résumé** : FPS réel/cible, frametimes p50/p95/p99, frames >100 ms, CPU sim/update/submit, GPU **si disponible**, résolutions réelle/CSS, draw calls, triangles et qualité effectivement appliquée.
- **Qualité** : Auto/Éco/Équilibré/Qualité, plafonds de résolution, profils ombres, végétation/eau/météo, raisons des dégradations ; options avancées **repliées**, mode `freezeAuto` pour benchmark uniquement.
- **Chargement/mémoire** : secteurs actifs/résidents/en attente, occupations RAM/VRAM **estimées**, GLB/texture/geometry partagés, files de job et priorités, préchargement, annulation de génération périmée.
- **Scénarios** : capturer caméra/seed/viewport/qualité/événements avec export JSON de mesure, comparaison stable sur GPU réel ou SwiftShader, **aucune télémétrie externe**.
- **Éditeur** : préserver gizmos, Undo/Redo, sauvegarde et apparence de l'asset sélectionné ; repousser build/imports/miniatures lourds et **ne rendre que sur changement si la vue est idle**.
- La **qualité est locale à l'appareil et temporaire**, non incluse dans l'archive auteur V3 ni imposée par un preset Blender. Le playtest utilise le même gestionnaire que le jeu, pas un deuxième.

## Studio Audio — MIDI restreint, sons naturels et contrôle simple

La [spécification 23](23-MIDI-AUDIO-LOW-RESOURCE.md) ajoute un **éditeur audio spécialisé**, et non une station musicale complète.

**Bibliothèque Audio** :
- `Importer une partition MIDI` → durée, tempo, pistes, événements, polyphonie maximale prévisible, **mapping des instruments** vers une **palette unique de 5–10 patches**, avertissements GM.
- `Importer un son` → écoute, mono/stéréo, codec compatible, poids téléchargé et **PCM décodé estimé**, licence, classe SFX/ambiance, loop/variante.
- Palette 5–10 instruments : nom, échantillon ou synthèse simple (enveloppe/timbre pré-approuvé), preview, coût et ID ; ajouter au-delà de 10 bloqué par validation.

**Édition du monde** :
- Sélectionner objet/PNJ/lieu → composant `AudioEmitter` : son/partition, position, rayon, gain, atténuation, déclencheur, priorité et prévisualisation à distance.
- Panneau biotope : **1–2 couches d'ambiance** + événements discrets, influence de météo/nuit via les états existants. La logique de biotope n'est **pas** liée aux sources audio réellement actives.
- Outils jeu/bêta : volume master/music/sfx/ambience, mute, lecture MIDI et budget voix, sources spatialisées, cache PCM et mode éco ; les contrôles audio avancés sont dans Ressources/PERF, pas sur l'écran principal.
- Audio bloqué avant le clic : affichage clair de l'état `suspended`, activation au clic et mode silence si indisponible. Ne pas tenter de lancer un `AudioContext` pour chaque modèle importé.
- **Archive Studio V3** : sources MIDI/sons + patchs + références stables/licences ; ne pas sauvegarder graphes `AudioNode`, voix actives ou données PCM temporaires.

**Parcours d'essai** : créer 5 patches, importer deux MIDI, mapper les pistes, associer une musique à forêt/nuit, placer un chant d'oiseau et une cascade échantillonnée, tester transition et portée, exporter ZIP, réimporter et vérifier aucune dépendance perdue.

## 10. Politique UX et performance

- Ne pas afficher toutes les catégories et réglages à la fois ; le contexte détermine l'inspecteur.
- Données et rendu du Studio réutilisent le runtime, **mais pas les éditeurs lourds dans le build du jeu**.
- Limiter le chargement aux secteurs nécessaires ; recalcul des overlays, collisions et navmesh **par zone touchée**.
- Profiler les longues sessions, 20 coups de pinceau, 10 régénérations, 100 objets, 50 PNJ de test sans prétendre à la performance réelle avant mesure.
- Objectif global : 30 FPS normal / 20 FPS de secours ; temporisation de sauvegarde indépendante du rendu.
- Le Studio doit permettre de visualiser les secteurs et les budgets (chunks, draw calls, triangles, entités actives), sans afficher les compteurs à tous les auteurs par défaut.

## 11. Découpage d'implémentation proposé

1. **Core Studio** : schémas partagés, ID/selection, gestion de projet, commandes Undo/Redo, catalogue, validation.
2. **Vue globale** : plan du monde, navigation/secteurs, recherche, brouillons, ouvrir l'éditeur lié.
3. **Terrain / Eau / objets** : outil complet sur zone locale, transactions, modifications et compilation incrémentale.
4. **Éditeur PNJ** : variantes, points/zones/navigation, états simples, aperçu et inspection.
5. **Dialogues / événements** : templates et liens fiables, aperçu runtime.
6. **Biotopes/faune** : peinture, distribution déterministe, édition d'overrides.
7. **Test/compilation** : préflight, archive, runtime statique, audit UX et performance.
8. **Finition** : raccourcis, onboarding contextuel, retours d'erreurs, performance 10 × 10 km synthétique.

**Acceptation minimale** : une personne peut créer une carte, placer un moulin/PNJ, tracer son parcours, écrire son dialogue, lier un levier à une roue, tester le tout, revenir au Studio, exporter/importer puis republier le monde sans modifier le code métier.

## 12. Hors scope

- Édition de polygones/UV/rigs 3D complète.
- Scripts arbitraires et plugins exécutés depuis des cartes importées.
- Simulation sociale lourde ou économie autonome des PNJ.
- Un serveur cloud ou des comptes obligatoires.
- Plusieurs niveaux géographiques indépendants dans une même partie.
- Terrain voxel illimité / création d'îles océaniques dynamiques par le joueur.
- Garantie 100 km² à 30 FPS avant réalisation de benchmarks.
