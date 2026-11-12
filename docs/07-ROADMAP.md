# 07 — Feuille de route — Little World Solo / GitHub Pages

**Statut : suivi du prototype initial et plan du jeu final — 12 novembre 2026.**

**Documents de cadrage prioritaires :** [12 — Limites du jeu](12-PROJECT-SCOPE.md) et [13 — UX du Studio](13-STUDIO-UX-ARCHITECTURE.md). Le **200 × 600 m** des jalons M0–M6 est la carte de démonstration ; le monde final est **une carte continue de 10 × 10 km maximum**, performance à qualifier.

## Avancement réel

| Jalon | État | Livré / restant |
| --- | --- | --- |
| D0 documentation | **Fait** | Spécifications et test navigateur |
| M0 bootstrap + Pages | **Implémenté ; déploiement CI réalisé** | Le test visuel dans le navigateur reste à valider |
| M1 écureuil / déplacements | **Prototype fonctionnel dans le code** | Proxy 3D, mouvement arcade ; Rapier, animations et ajustements manquent |
| M2 vallée | **Prototype** | Relief et rivière déterministes, moulin, port ; éditeur du relief absent |
| M3 assets | **Démarré** | 3 GLB originaux et 3 autres prefabs procéduraux ; catalogue riche à construire |
| M4 éditeur | **Démarré** | Placement d'objets, graine, densité, IndexedDB, JSON, test brouillon ; sculpture non réalisée |
| M5 interactions | **Démarré** | Moulin interactif codé ; moteur générique déclaratif absent |
| M6 finition | **Non démarré** | Profils de performance et direction artistique finale à valider |

Ne pas confondre **tests automatiques passés** et **validation visuelle**. Le suivi détaillé figure dans [09-BROWSER-TEST-PLAN.md](09-BROWSER-TEST-PLAN.md).

**Politique générale LOW-RESOURCE :** [docs/11-LOW-RESOURCE-POLICY.md](11-LOW-RESOURCE-POLICY.md). **Objectif validé : 30 FPS nominaux, repli à 20 FPS si nécessaire ; aucun ralentissement du jeu.** La limite de cadence n'est pas encore intégrée au prototype.

### Travail technique P0 à réaliser avant l'extension de carte

- [ ] Ajouter des mesures reproductibles (frametime p50/p95, FPS, draw calls, triangles, chargements, mémoire si accessible).
- [ ] Découpler cadence d'affichage **30/20 FPS** et pas fixe de simulation proposé **30 Hz**, avec interpolation ; conserver le comportement des commandes.
- [ ] Suspendre l'activité inutile en arrière-plan et éviter tout rattrapage infini au retour de l'onglet.
- [ ] Évaluer les performances sur le PC de référence en forêt, planage, bateau, plongée et éditeur.
- [ ] Ajouter uniquement les mécanismes LOD/chunks/streaming justifiés par les mesures avant de dépasser le monde actuel.

## Objectif

Développer un **jeu solo exploratoire PC dans le navigateur**, disponible sur **GitHub Pages**, sans serveur au runtime. La première version inclut un écureuil volant, une vallée de **200 × 600 m**, un catalogue d'assets locaux et un éditeur de carte/interactions utilisable dans le navigateur.

**Le multijoueur et tout le backend sont reportés** : aucun jalon M0–M6 ne dépend de Colyseus, de PostgreSQL, de connexions ou de tests à 30 joueurs.

## Jalons successifs

### D0 — Documentation

**Livrables :** vision, gameplay, génération, éditeur, architecture, assets, objectifs, décision et guide GitHub Pages.

**Critère :** tous les documents distinguent **solo actuel** et **multijoueur hypothétique futur**. Aucune fonction n'est annoncée comme implémentée.

### M0 — Squelette exécutable + GitHub Pages

**Livrables :** monorepo TypeScript/pnpm ou structure équivalente simple ; Three.js, Vite ; application `game` et point d'entrée `editor` ; tests, lint, build ; workflow de déploiement.

**Critères :**
- Jeu test 3D accessible sur l'URL prévue `https://glloq.github.io/little-world/`.
- Build fonctionnant sous **`/little-world/`**, avec ressources JS/WASM/GLB chargées sans 404.
- Éditeur statique accessible par une URL dédiée.
- **Aucun serveur Node.js requis après publication**.
- Instructions reproductibles de développement, build et dépannage.
- CI de build et vérification du site après publication.

### M1 — Écureuil et déplacements

**Livrables :** proxy/écureuil, caméra souris, simulation locale Rapier, marche, course, saut, chute, planage, nage et plongée.

**Critères :**
- `Espace` sur front d'appui = saut ; relâchement et nouvel appui = ouvrir/replier membrane.
- Transitions sol/air/eau stables ; aucun état bloquant.
- Rivière/volume d'eau d'essai suffisamment profond pour plonger.
- Mode debug pour trajectoire, vitesse, hauteur, état, FPS **et temps entre images**, incluant la cible nominale 30 et le secours 20.
- Tests de simulation indépendants du rendu ; validation visuelle dans **Pages**.

### M2 — Première vallée procédurale

**Livrables :** générateur déterministe de carte **200 × 600 m**, source, rivière, moulin pré-positionnable, relief, littoral et port de démonstration.

**Critères :**
- Même graine et paramètres → même résultat.
- Continuité source → estuaire → mer.
- Parcours à pied et opportunités de planage/nage/plongée.
- Collision et maillage adaptés, **carte statique chargée en navigateur**.
- Compilation de la carte en ressources téléchargeables via Pages.

### M3 — Catalogue initial d'assets

**Livrables :** validation GLB, catalogue avec métadonnées et miniature, première collection nature/architecture/objets, écureuil original ou proxy assumé.

**Critères :**
- Assets présents **physiquement** dans le dépôt, licence et provenance vérifiées.
- Chargement correct depuis GitHub Pages et par le catalogue de l'éditeur.
- Moulin avec roue animable, arbres instanciables, collisions simplifiées.
- Tests automatiques de références et des chemins, pas de faux assets dans le registre.

### M4 — Éditeur de carte statique

**Livrables :** sélection et transformation, terrain, rivière, chemins, placement d'assets, undo/redo, test dans le navigateur.

**Critères :**
- Modifier → sauvegarder **IndexedDB** → recharger → retrouver les modifications.
- Export JSON → vider stockage local → import → même carte.
- Génération et overrides séparés, pas de perte de corrections au re-generate.
- Publier une carte test **manuellement dans le dépôt** puis la charger après build sur Pages.
- Aucun besoin de backend, tokens ou compte pour utiliser l'éditeur local.

### M5 — Interactions déclaratives locales

**Livrables :** composants d'interaction, déclencheurs, conditions, animations, inspecteur de configuration.

**Critères :**
- `E` devant vanne → changement d'état **local** → roue de moulin animée.
- Possibilité de créer cette interaction depuis l'éditeur sans écrire de JavaScript spécifique.
- Schéma validé à l'import et à la compilation ; aucune exécution de scripts arbitraires issus d'une carte.
- Aucun WebSocket ni mécanisme d'état partagé.

### M6 — Finition et démonstration solo

**Livrables :** atmosphère visuelle low-poly organique, végétation, moulin, village, port, panoramas, son léger, profilage et corrections.

**Critères :**
- Parcours complet de la source à la mer, avec tous les modes de locomotion.
- Build GitHub Pages stable sur navigateurs PC ciblés.
- Taille des assets, FPS, frametimes, draw calls et consommation mémoire quand mesurable **documentés selon la politique LOW-RESOURCE** ; corrections des points critiques.
- Éditeur utilisable pour retoucher et exporter la carte.
- Pas de requête obligatoire vers une API serveur ni de donnée secrète dans le build.

## Ordre recommandé

`D0 → M0 → M1 → M2 → M3 → M4 → M5 → M6`.

M2 et M3 peuvent progresser partiellement en parallèle. Les décisions de design qui empêchent la jouabilité priment sur la finition de décor.

## Jalons suivants : jeu final et Studio spécialisé

Les jalons **M0–M6 décrivent le prototype**, pas les limites du produit final. **État : objectifs non livrés** ; ne pas présenter ces lignes comme du code déjà déployé.

| Jalon | À réaliser | Critère de fin |
| --- | --- | --- |
| **S0 — Studio Core** | Données partagées, IDs, validation, sélection, Undo/Redo transactionnel, projets et sauvegardes auteur versionnés | Import/export d'un projet fiable et sans perte |
| **S1 — Carte mondiale** | Une carte continue configurable, plafond 10 × 10 km, vue globale 2D, chunks/LOD/streaming mesurés | Navigation entre zones/secteurs, benchmark et contrôles de mémoire |
| **S2 — Géographie** | Outils terrain, rivières, lacs, cascades, routes, overrides et recalcul local | Modifier un secteur n'efface pas les autres |
| **S3 — Biotopes et décors** | Peinture, génération déterministe, végétation/faune, objets modulaires, GLB importables | Catalogue et biotopes modifiables depuis Studio |
| **S4 — Personnages / PNJ** | Variantes animales (pas d'humains), rig compatible, routines simples, navigation libre et évitement | PNJ traverse secteurs/obstacles avec simulation dormante à distance |
| **S5 — Dialogues et interactions** | Dialogues à choix, événements/conditions/actions, réactions, petits objectifs, objets ramassables | Quête et mécanisme créés **sans code ad hoc** |
| **S6 — Sauvegardes de jeu** | Slots de partie, inventaire léger, actions et flags persistants, intérieurs choisis | Recharger la partie restaure les états prévus |
| **S7 — Intégration UX / performance** | Éditeurs spécialisés cohérents, « Jouer ici », compilation, diagnostic, benchmarks 30/20 FPS | Jeu + Studio publiables sur GitHub Pages et testés |

**Priorité Q3=B : outils génériques avant accumulation de contenu.** Décomposer chaque jalon en incréments testables ; ne pas implémenter 100 km² de végétation avant de mesurer le chargement des secteurs.

### Gates de conception

1. Aucun modèle de données du Studio ne dépend de l'état temporaire des meshes Three.js.
2. Un PNJ a des comportements simples, mais peut **trouver son chemin librement** dans des zones adaptées.
3. Un outil spécialisé peut ouvrir un objet créé par un autre **sans perdre la sélection ni casser les références**.
4. Les données de sauvegarde joueur et les brouillons auteur ne se mélangent jamais.
5. Une carte au maximum théorique de 10 × 10 km n'est **pas une garantie de rendu 30 FPS**.
6. Chaque fonctionnalité suit : conçue → codée → testée → publiée/validée navigateur.

## Après V1 (hors plan de livraison)

**Évolution optionnelle** : concevoir un multijoueur 10–30 joueurs avec serveur autoritaire, synchronisation, persistance et comptes. Ce n'est **ni implémenté, ni planifié pour le jeu solo actuel**. Une étude séparée devra évaluer coûts, contraintes et modifications de l'architecture solo.

Fonctions hors périmètre final actuel : combat, simulation sociale/économique lourde, crafting/commerce complexes, agriculture avancée, météo complexe, éditeur de rig/polygones généraliste, mobile/manette. **PNJ, dialogues, pêche légère, collecte, petites quêtes, inventaire léger et personnalisation font désormais partie de l'objectif final** (S3–S6), pas du prototype actuel.

## Définition de terminé

Pour chaque jalon : commit/PR, tests automatisés, captures ou essai navigateur, statut **implémenté / testé / publié / validé**, limitations et métriques. **Un build réussi n'est pas une preuve de fonctionnement sur Pages.**

## Risques dominants

| Risque | Parade |
| --- | --- |
| 404 des ressources sous `/little-world/` | Tests du chemin base Vite et des URL dynamiques |
| Une sauvegarde IndexedDB disparaît | Export JSON recommandé et testé |
| Incohérence des transitions locomotion | Machine à états + tests à FPS variables |
| Scène lourde pour navigateur PC | Instancing, culling, budgets mesurés |
| Éditeur trop complexe | Outils simples puis raffinements |
| Assets tiers non redistribuables | Vérification fichier par fichier avant commit |
| Écureuil volant difficile à trouver sous licence | Proxy puis modélisation / rig original |
