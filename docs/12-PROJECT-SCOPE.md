# 12 — Périmètre fonctionnel et limites du jeu / studio

**Référence de cadrage pour le développement — 12 novembre 2026.**

**Choix techniques complémentaires validés :** [14 — Décisions techniques transversales](14-TECHNICAL-CHOICES.md). Ce document 12 fixe le périmètre fonctionnel ; le document 14 fixe les options d'implémentation/ergonomie retenues et leurs budgets provisoires.
**Statut : décisions fonctionnelles validées par le créateur, architecture cible ; la majorité des fonctions décrites restent à développer.**

> En cas de contradiction avec les anciennes spécifications, les **décisions de ce document et de [DECISIONS.md](DECISIONS.md)** priment. La scène actuelle de 200 × 600 m reste le **prototype existant**, pas la limite du monde final. Le cadre LOW-RESOURCE reste défini dans [11-LOW-RESOURCE-POLICY.md](11-LOW-RESOURCE-POLICY.md).

## 1. Vision et limites non négociables

- **Little World** : monde 3D **solo**, PC clavier/souris, accessible sur **GitHub Pages**, **aucun backend obligatoire**.
- Monde paisible d'exploration avec **de nombreuses petites choses à faire** : rencontres, petits objectifs, collecte simple, pêche possible, énigmes, activités locales, exploration et mécanismes. **Aucun système de combat ou survie complexe**.
- Écureuil volant stylisé ; marche, course, saut, planage, nage, plongée et bateau. Accessoires et émotions ; caméra orbitale uniquement au clic-glissé.
- **Une carte continue par monde/partie**, avec un **plafond de conception de 10 × 10 km (100 km²)**. Limite de format et d'architecture, **pas obligation** de remplir 100 km² ou preuve de performance atteinte. Première carte de référence : **200 × 600 m**.
- Plusieurs projets / sauvegardes de cartes peuvent exister dans le studio, mais **chaque monde jouable reste une carte géographiquement continue**. Pas de chargement de zones comme des niveaux indépendants au cours de l'exploration.
- 30 FPS ciblés en normal ; secours 20 FPS, vitesse de simulation indépendante (voir [LOW-RESOURCE](11-LOW-RESOURCE-POLICY.md)).
- Joueur : **ne peut pas modifier de manière permanente le terrain/la carte**, contrairement à l'auteur dans le Studio.
- Assets **originaux ou redistribuables**, disponibles dans le dépôt ou le build statique ; pas de scripts arbitraires importés.
- Pas de multijoueur, serveur autoritaire, comptes, infrastructure cloud ni génération LLM au runtime.

## 2. Gameplay final retenu

| Référence | Décision | Détail du périmètre |
| --- | --- | --- |
| G1 | **Exploration + activités/aventures locales** | Nombreuses petites choses facultatives, pas RPG lourd |
| G2 | **Petites missions facultatives** | Conditions/états simples ; pas de campagne scénarisée imposée |
| G3 | **Inventaire léger** | Quelques objets ramassables, conservables et utilisables ; pas de craft/commerce complexe obligatoire |
| G4 | **Conséquences persistantes limitées** | Certains mécanismes, dialogues et événements modifient l'état local sauvegardé |
| G5 | **Quelques intérieurs simples** | Bâtiments explorables choisis, pas chaque maison obligatoirement |
| G6 | **Activités indépendantes** | Collecte, pêche, énigmes, petites tâches, promenade, bateau ; implémentation progressive, aucune obligation de toutes les livrer en première étape |
| G7 | **Plusieurs sauvegardes de partie** | Slots locaux, versionnés, distincts des brouillons de l'éditeur |

Pas de dégâts, mort, endurance, économie systémique ni agriculture complexe imposés. Réactions non hostiles ou fuite/défense simple de la faune ; **pas de combat prévu**. Jour/nuit et météo détaillée restent secondaires.

## 3. Monde et géographie

| Référence | Décision | Implications |
| --- | --- | --- |
| M1 | **Maximum 10 × 10 km** | Chunks et LOD ; imposer des limites claires à l'import/génération ; performances à mesurer |
| M2 | **Une carte continue** | Une seule géographie par partie, sans écrans de chargement de niveaux indépendants |
| M3 | **Grottes/tunnels/surplombs par modules 3D** | Terrain principal heightfield + objets 3D distincts ; pas de voxels généralisés |
| M4 | **Prefabs + construction modulaire** | Maisons, murs, toits, portes, fenêtres en modules ; pas d'édition polygonale façon Blender |
| M5 | **Rivières, lacs, cascades, bassins, mer** | Surfaces visuelles + volumes logiques (nage, plongée, bateau) ; pas de simulation hydraulique |
| M6 | **Biotopes configurables/peignables** | Palette de biomes, densités, exclusions, règles de flore/faune |
| M7 | **Génération + régénération locale** | Overrides édités protégés, aperçu/annulation, recompilation par secteur |

L'éditeur peut enregistrer plusieurs cartes/projets, mais **le runtime d'une partie charge un monde continu unique**. Les dimensions et les offsets spatiaux ne doivent pas être éparpillés en constantes `200 × 600`.

## 4. Espèces, PNJ et navigation

| Référence | Décision | Limite |
| --- | --- | --- |
| P1 | **Animaux et créatures seulement ; aucun humain** | PNJ variés, dont animaux anthropomorphes ; variantes du système de personnage joueur lorsque la morphologie/rig le permet |
| P2 | **Activités simples** | Parcours, travail, repos, salut ; pas de simulation profonde de faim, sommeil, économie et relations sociales |
| P3 | **Navigation libre avancée** | Déplacement autonome, évitement, planification de chemins avec navigation hiérarchique par secteurs |
| P4 | **Dialogues à embranchements** | Réponses et conditions simples, données déclaratives |
| P5 | **Réactions contextuelles** | Regard, salut, surprise, approche/fuite et animations associées |
| P6 | **Texte + sons/voix stylisées** | Pas de doublage intégral obligatoire |
| P7 | **Fuite ou défense non combattante** | Pas de système de combat obligatoire |

**Différence essentielle :** P3 = navigation **spatialement libre et suffisamment robuste**, P2 = comportements **intentionnellement simples**. Ne pas confondre navigation libre et IA émergente coûteuse. Définir des zones autorisées, obstacles et accès (ponts, portes, chemins), recalculer les chemins seulement sur événement et activer la simulation détaillée à proximité.

Les PNJ de morphologie compatible utilisent la **même base d'apparence, d'animation et de points d'attache** que l'écureuil, avec variables de silhouette, tête, oreilles, queue, couleur, taille et accessoires. Prévoir rigs alternatifs légers pour poissons, oiseaux ou espèces trop différentes ; ne pas déformer arbitrairement un rig incompatible.

## 5. Interactions, progression et dialogues

| Référence | Choix | Limite |
| --- | --- | --- |
| I1 | **Interaction E, zones, temporisations, événements** | Catalogue d'événements validés, pas de code libre |
| I2 | **Séquences d'actions ordonnées** | Délais, animations et transitions simples ; cinématiques complexes secondaires |
| I3 | **Conditions simples ET/OU** | État, objet possédé, dialogue, proximité, drapeau, cooldown |
| I4 | **Liens entre entités** | Un levier peut ouvrir une porte, un PNJ peut réagir à une vanne |
| I5 | **État temporaire ou persistant configurable** | Sauvegarder les faits pertinents, pas chaque animation/per-frame |
| I6 | **Une fois, répétable, cooldown, reset** | Paramétrage sans JavaScript |
| I7 | **Formulaires + éditeur de séquence** | Préférer modèles prêts à l'emploi ; graphe à nœuds facultatif et non prioritaire |

**Q1 : niveau B** — éditeur déclaratif d'événements, conditions, actions et séquences configurables. **Pas de langage de script arbitraire**.

Exemple canonique : `E` sur une vanne → si fermée → jouer poignée et son → changer état de la vanne → accélérer roue → faire réagir meunier → mémoriser l'événement si configuré. Tous les liens utilisent des **IDs stables**, pas les noms de mesh ou index d'un tableau.

Les activités (pêche, collecte, mini-énigme) doivent être **des templates/fonctions métier configurables** et non chacune une nouvelle architecture incompatible. Pas de fabrication/commerce complets obligatoires.

## 6. Périmètre du studio et des outils de création

**E1 = C : plusieurs éditeurs spécialisés**, mais reliés à **un projet, une scène, des données et un historique communs**. Cela ne signifie pas plusieurs projets isolés ou fichiers JSON incompatibles.

Outils cibles :
1. **Projet / carte globale** : aperçu 2D, navigation vers une zone, données mondiales, versions et diagnostics.
2. **Terrain et relief** : génération, pinceaux, modification locale, pentes/collisions.
3. **Eau et voies** : splines rivières/routes, lacs, volumes, ports, ponts.
4. **Biotopes et écologie** : zones/peinture, règles de placement, végétation/faune, exclusions.
5. **Scène et bâtiments** : catalogue, prefabs, modules, multisélection, manipulation 3D.
6. **Personnages et PNJ** : variantes de rig/personnage, parcours, navmesh/zones, activités et réactions.
7. **Dialogues** : répliques, choix, conditions, animations/sons, aperçu.
8. **Événements et actions** : déclencheurs, conditions ET/OU, séquences, références croisées, simulation.
9. **Assets et prévisualisation** : import GLB/animations/audio, licences, variantes, catalogue.
10. **Test et validation** : jouer depuis un point choisi, scènes de test, erreurs de liens, profils de ressources et sauvegarde.

Les outils peuvent partager une coquille d'application et un viewport Three.js **sans que toute la logique d'édition soit chargée simultanément** : routage par fonctionnalités/lazy loading.

| Référence | Choix |
| --- | --- |
| E2 | Orbite + vue dessus + navigation libre |
| E3 | Sélection d'objets, groupes et sous-éléments pertinents ; pas de sculpture polygonale |
| E4 | Prefabs réutilisables, variantes et overrides |
| E5 | Hiérarchie par zone, groupe et catégorie |
| E6 | Multisélection, duplication, peinture/dispersion d'objets |
| E7 | Autosauvegarde locale + historique annuler/refaire + export |
| E8 | Test immédiat du brouillon puis retour à l'édition, sans perdre les changements |

**Q3 = B : implémenter en priorité les outils génériques**, puis enrichir la carte avec ces outils plutôt que coder chaque décor en dur.

## 7. Limites des outils de contenu

| Référence | Choix retenu |
| --- | --- |
| C1 | Catalogue + import GLB ; pas de modeleur 3D intégré |
| C2 | Animations prédéfinies/importées + séquences simples ; pas d'éditeur de rig complet |
| C3 | Volumes simples, polygones et chemins ; pas de sculpture volumétrique arbitraire |
| C4 | Éclairage global + lumières/ambiances locales ; pas de pipeline cinématographique lourd |
| C5 | Import audio et positionnement spatial ; pas d'éditeur audio complet |
| C6 | Effets visuels paramétrables parmi des presets ; pas d'éditeur de shaders complet |
| C7 | **Plusieurs projets éditables** et **catalogue commun** ; une carte continue par monde/partie |

## 8. Sauvegarde, publication et sécurité

- **Deux domaines séparés** : (a) brouillons/projets du **Studio**, (b) sauvegardes des **parties joueur** (plusieurs slots). Les données ne doivent pas s'écraser mutuellement.
- Éditeur : IndexedDB, autosauvegarde, historique, import/export **archive de projet** avec manifeste + fichiers par secteur + refs d'assets. Éviter un unique JSON gigantesque de 100 km².
- Jeu : sauvegarder états persistants pertinents (inventaire léger, flags, actions, états d'objets, emplacement), **pas les géométries compilées**.
- Compilation statique : source et overrides → validation → bundles/secteurs optimisés + manifeste, puis commit et build **GitHub Actions → GitHub Pages**. Un navigateur public **ne peut pas publier directement** sans mécanisme sécurisé explicite (hors périmètre).
- Les données importées sont non fiables ; limiter taille, version et types, vérifier IDs/références, chemins et conditions ; ne jamais exécuter des scripts des cartes.
- Format source/compilé, migrations et sauvegardes doivent être **versionnés**. Les changements de schéma n'effacent pas silencieusement les projets existants.

## 9. Objectifs LOW-RESOURCE

- 30 FPS nominal, mode dégradé 20 FPS, sans ralentissement de simulation.
- Monde 100 km² **non préchargé en détail** : secteurs compilés, culling, LOD, streaming si les mesures le justifient.
- Navigation libre PNJ à **plusieurs niveaux** : topologie/portails par secteurs pour grands trajets, détail local pour évitement ; suspendre PNJ et faune éloignés.
- Instancing végétation, groupes de poissons/insectes, états de comportement événementiels, caches partagés, pas de rigid body par décoration.
- Studio : charger/modifier/recompiler les zones utiles, éviter les longues opérations sur le thread principal et les fuites GPU.
- Toutes les cibles de mémoire, draw calls et FPS restent **à mesurer** sur PC de référence.

## Évolution future volontairement différée : multijoueur

Le produit **actuel** reste **solo**, sans backend ni réseau obligatoire. L'objectif futur discuté est un monde partagé avec un **premier palier de 30 joueurs**, une **cible de 200** et **500 comme scénario expérimental** ; ces chiffres sont des hypothèses de dimensionnement et **pas des résultats de performance**.

Pour la V3, préparer seulement les **IDs stables**, la logique indépendante de Three.js, les données spatialement indexables, la persistance explicite, les niveaux de détails et la simulation décorrélée. Le fonctionnement futur visé comprend **AOI**, synchronisation de mouvement **2–20 Hz** selon intérêt (jusqu'à **2–3 Hz** pour avatars secondaires d'une foule), événements prioritaires et optimisation du rendu des foules.

**Aucun serveur, protocole, compte ou système de réplication à implémenter maintenant.** Spécification : [16 — Futur multijoueur et optimisation des foules](16-FUTURE-MULTIPLAYER.md).

## Vision artistique : horizon étendu sans brouillard

Le jeu doit conserver des **panoramas profonds et des reliefs lointains reconnaissables** depuis les hauteurs, la côte et pendant le planage, **sans brouillard servant à masquer les distances de rendu**.

Retenir un **terrain simplifié géométriquement jusqu'à l'horizon**, des LOD différents pour forêt/bâtiments/objets et des **imposteurs/panoramas précalculés** réservés aux éléments suffisamment éloignés. Un sky dome/skybox représente le ciel, pas des reliefs approchables. Les seuils seront mesurés et adaptés à 30/20 FPS sur GPU intégré.

Spécification, état réel du code et étapes HZ : [17 — Vue profonde et optimisation](17-DISTANT-VIEW-RENDERING.md).

## 10. Frontière entre acquis et objectifs

**Sur la branche `feat/living-world-editor` :** vallée de démonstration préservée, données v2 communes et migration v1, terrain local à trois LOD/cache borné, scènes synthétiques 1/2 km, rig rigide animé et GLB original, quatre PNJ animaux à navigation simple, dialogues/flags temporaires, écologie instanciée, atelier unifié avec sculpture/tracés/transformation/historique/IndexedDB/export/test. Ces évolutions sont testées ; elles ne constituent **pas** le Studio spécialisé, la navigation libre hiérarchique ou le streaming complet de 100 km².

**À développer :** éditeurs spécialisés, archive sectorisée avec compilation des meshes/navigation, moteur générique d’événements/séquences, navigation avancée, inventaire, activités et sauvegardes de partie. Le suivi de campagne et ses limites figurent dans [07-ROADMAP.md](07-ROADMAP.md).

## 11. Règles applicables à tout développement Codex

1. Lire ce document, [04-EDITOR-INTERACTIONS.md](04-EDITOR-INTERACTIONS.md), [13-STUDIO-UX-ARCHITECTURE.md](13-STUDIO-UX-ARCHITECTURE.md), [DECISIONS.md](DECISIONS.md) et [11-LOW-RESOURCE-POLICY.md](11-LOW-RESOURCE-POLICY.md) avant de créer un nouveau système.
2. Réutiliser les **contrats partagés** et ajouter des fonctionnalités sans recopier leur logique dans le jeu et le Studio.
3. Ne pas coder un PNJ, une activité ou un objet interactif spécial si le mécanisme peut être décrit comme prefab + événements + conditions + actions.
4. Garder chaque fonction testable et les composants de responsabilité limitée. Éviter les classeurs géants de centaines de cas spéciaux.
5. Proposer des migrations des formats, fournir des tests et distinguer **conçu**, **implémenté**, **testé** et **publié**.
6. Ne pas agrandir la carte au plafond théorique avant d'avoir une base de compilation, streaming/LOD et benchmarks.
7. Ne pas sacrifier l'UX (outils contextuels, sélection visible, annulation, erreur explicite) pour ajouter beaucoup d'options brutes.
