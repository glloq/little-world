# Little World — instructions pour Codex et autres agents de développement

> **Lire d'abord** : [Périmètre final](docs/12-PROJECT-SCOPE.md), [Architecture UX du Studio](docs/13-STUDIO-UX-ARCHITECTURE.md), **[Contrats V3 du Studio](docs/15-STUDIO-DATA-SCHEMAS-V3.md)**, **[Décisions techniques validées](docs/14-TECHNICAL-CHOICES.md)**, [Décisions](docs/DECISIONS.md), [Budget LOW-RESOURCE](docs/11-LOW-RESOURCE-POLICY.md), puis [Architecture technique](docs/05-TECHNICAL-ARCHITECTURE.md) et [Roadmap](docs/07-ROADMAP.md).
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
