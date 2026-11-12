# 07 — Feuille de route — Little World Solo / GitHub Pages

**Statut : campagne avancée implémentée sur branche — 12 novembre 2026 ; publication distincte.**

## Campagne avancée — état livré sur branche

| Domaine | Avant | Après | Statut | Reste à faire |
|---|---|---|---|---|
| Moteur / performance | Terrain complet et caches de prefabs | Génération locale répartie, cache GPU borné, libération, compteurs et benchmark RAF | Implémenté et mesuré en rendu logiciel | Worker, mesures GPU PC, LOD du bâti |
| Grande carte | Dimensions figées 200 × 600 m | Configuration commune, limites physiques dynamiques, scènes 1 × 1 et 2 × 2 km | Scènes synthétiques vérifiées | Générateur géographique et grande forêt répartie |
| Écureuil / rigging | Groupes procéduraux | 14 os rigides, oreilles/queue articulées, sockets, GLB original reproductible | Implémenté | Skinning pondéré, GLB utilisé directement au runtime |
| Animations | Sinusoïdes marche/planage | 13 états interpolés et 13 clips exportés, 9 expressions | Testé | Animations artistiques détaillées et interactions variées |
| PNJ | Aucun | 4 exemples déclaratifs, activités et simulation selon distance, navigation sol/eau/pente/obstacles | Testé | Graphe de chemins et évitement avancé |
| Dialogues / interactions | Bateau, moulin automatique | Dialogues à choix, flags, conditions/actions, éditeur de graphe et aperçu | Testé | Événements de zones et moteur de mécanismes générique |
| Biotopes | Règles fixes de forêt | 7 configurations, peinture locale persistante, habitats contrôlés | Implémenté | Zones d’exclusion auteur, densité par coup de pinceau |
| Faune / flore | Arbres/rochers | 7 plantes et 3 créatures instanciées, secteurs bornés, poissons dans l’eau | Testé | Vent, sons, perchoirs, fuite, bancs évolués |
| Éditeur | Placement simple | Sculpture locale, gizmos, multisélection, duplication, historique, eau/chemins, PNJ/dialogues, retour du test | Parcours navigateur validé | Déplacement des points, gizmo de groupe, brosse de dispersion, miniatures |
| Assets | 3 GLB + prefabs | GLB écureuil original, registres séparés personnage/écologie, provenance et dimensions | Testé | Pipeline général de miniatures/optimisation |

### Données et outils

`world-data.ts` constitue le contrat v2, partagé par le jeu, l’éditeur et le compilateur. Migration v1, validation des limites/types/identifiants/références, JSON sans code exécutable. La génération reste recalculable depuis la source et les overrides. Le compilateur émet des données et un manifeste de secteurs ; il ne précompile pas encore les meshes GPU.

Les cartes de démonstration conservent la rivière, les bâtiments et le port historiques. Dimensions acceptées : largeur 200–2000 m, longueur 600–2000 m. La configuration analytique active est unique par page. Les grandes scènes ne représentent pas des kilomètres carrés de contenu entièrement authored.

### Validation

Campagne locale : **61 tests réussis**, TypeScript/build réussis, compilation de la carte (40 secteurs) et régénération GLB identique (236 788 octets), **15 vérifications Chromium** réussies sur le build statique, aucune erreur JS/HTTP. Quatre scénarios de benchmark ont terminé sans erreur ; la version enrichie est plus lente sur SwiftShader que la référence et aucun gain global n’est revendiqué.

Commits applicatifs : `710fe46` (données/terrain), `7bd718d` (personnage/PNJ/dialogues), `ad45f73` (intégration atelier/écologie/tests). Branche : `feat/living-world-editor`. La création de Pull Request et l’observation de CI via API sont bloquées par le refus réseau vers `api.github.com` ; l’ajout du domaine est enregistré dans le brouillon de l’environnement et doit être appliqué dans les paramètres. La présence d’authentification API utilisable reste à vérifier après cette autorisation réseau. Aucun déploiement de cette branche n’est revendiqué.

Les résultats de campagne sont décrits dans le [plan navigateur](09-BROWSER-TEST-PLAN.md) et les [mesures](10-PERFORMANCE-ROADMAP.md). Le build vérifie TypeScript strict. La validation des branches/PR est définie dans `.github/workflows/checks.yml`, avec tests, compilation de carte, build et parcours Chromium sur le build statique. Le workflow Pages de main est conservé.

L’état distant de CI et le déploiement doivent être vérifiés séparément : une exécution locale réussie ne vaut pas publication. Voir le rapport final de campagne pour la branche et le dernier commit.

---

## Feuille de route historique et objectifs restants

Les jalons ci-dessous décrivent le prototype initial et la cible V1 ; le tableau de campagne ci-dessus fait foi pour les évolutions de cette branche.

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

## Après V1 (hors plan de livraison)

**Évolution optionnelle** : concevoir un multijoueur 10–30 joueurs avec serveur autoritaire, synchronisation, persistance et comptes. Ce n'est **ni implémenté, ni planifié pour la V1**. Une étude séparée devra évaluer coûts, contraintes et modifications de l'architecture solo.

Autres fonctionnalités différées : pêche jouable, PNJ, quêtes, météo complexe, agriculture, inventaire, personnalisation, mobile/manette.

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
