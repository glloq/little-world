# 07 — Feuille de route — Little World Solo / GitHub Pages

**Statut : suivi du prototype initial et plan du jeu final — 12 novembre 2026.**

**Documents de cadrage prioritaires :** [12 — Limites du jeu](12-PROJECT-SCOPE.md), [13 — UX du Studio](13-STUDIO-UX-ARCHITECTURE.md), [14 — Décisions techniques validées](14-TECHNICAL-CHOICES.md) et **[15 — Schémas V3 du Studio](15-STUDIO-DATA-SCHEMAS-V3.md)**. Le **200 × 600 m** des jalons M0–M6 est la carte de démonstration ; le monde final est **une carte continue de 10 × 10 km maximum**, performance à qualifier.

## Contrats techniques désormais figés

Toutes les recommandations de [14 — Choix techniques](14-TECHNICAL-CHOICES.md) sont **acceptées comme cible**, sans être considérées comme livrées : heightfield multi-résolution ; Studio spécialisé + transactions communes ; rigs par familles ; PNJ à navigation libre hiérarchique et comportements simples ; horloge logique ; activités par templates ; conditions/états typés ; patrimoine de données versionné ; optimisation pour PC avec GPU intégré.

**Gates supplémentaires :**
1. Étape géographie : carte sectorisée + aperçu global 2D et édition locale sans reconstruire 100 km².
2. Étape Studio : un geste de peinture/spline = une transaction, annulable après changement d'éditeur ; checkpoints et références stables.
3. Étape PNJ : déplacer librement un habitant entre secteurs et autour d'obstacles avec activité simple et budget CPU borné.
4. Étape activités : produire collecte, pêche légère, énigme et mission depuis les mêmes types d'événements/conditions/actions.
5. Étape persistance : restaurer flags/objets/inventaire depuis différents slots de partie, sans altérer le projet auteur.
6. Étape performance : benchmark reproductible sur PC standard à GPU intégré, **aucune garantie 30 FPS/100 km² avant résultats**.

## Plan de migration Studio V2 → V3 — objectifs, pas encore livrés

Les contrats de [15 — Schémas V3](15-STUDIO-DATA-SCHEMAS-V3.md) doivent être intégrés par **étapes verticales testables**, sans casser la démonstration V2.

| Jalon | Travail à fournir | Gate d'acceptation |
| --- | --- | --- |
| V3-A | Manifestes/schémas V3 et migration V1/V2 | Imports non destructifs, seed/placements/dialogues/IDs conservés |
| V3-B | StudioContext, projets IndexedDB, CommandBus, checkpoints | Annuler/refaire entre éditeurs, après changement de module ; sauvegarde/retour fiable |
| V3-C | Index global d'entités et source par chunks, vue mondiale 2D | Ouvrir une zone éloignée sans charger le monde entier |
| V3-D | Entités à composants, prefabs, variantes, terrain/eau/biotopes sectorisés | Un objet lié reste stable après déplacement, sculpture et régénération |
| V3-E | PNJ/dialogues, variables typées, événements/conditions/actions réutilisables | Réactions d'un PNJ/objet déclenchées depuis des données, même si secteur déchargé |
| V3-F | Activités + inventaire + sauvegardes de partie + « Jouer ici » | Collecte, pêche légère, énigme, mission ; slots distincts des brouillons |
| V3-G | Compilation incrémentale, préflight, performances et Pages | Build statique, tests navigateur et benchmarks 30/20 FPS |

**Cibles non livrées par cette mise à jour documentaire.** L'ancien `WorldDefinition` V2 et son `parseWorld` restent valides pendant la transition ; ne pas monter la limite à 10 km dans un parseur V2 monolithique pour simuler une architecture V3.

## Axe HZ — horizon large et détaillé à coût réduit

**Décision validée :** le rendu doit conserver montagnes, côtes et îles visibles **sans brouillard qui dissimule les limites du monde**. Voir [17 — Rendu panoramique](17-DISTANT-VIEW-RENDERING.md).

**À intégrer dans la suite des travaux V3 / LOW-RESOURCE**, sans casser les fonctionnalités existantes :

1. **HZ-0 — instrumenter** scènes panoramiques fixes et traversées (marche, planage, bateau), mesurer draw calls / triangles / overdraw / ressources.
2. **HZ-1 — horizon 3D léger** indépendant du terrain proche, silhouette cohérente même lorsque les chunks détaillés sont absents.
3. **HZ-2 — transitions LOD propres**, hystérésis, critère erreur écran et chargement anticipé en planage.
4. **HZ-3 — LOD de végétation, maisons, ruines et objets** via meshes simplifiés, regroupement par secteur.
5. **HZ-4 — imposteurs et panoramas ciblés**, sky dome, sans figer l'arrière-plan approchable dans une texture.
6. **HZ-5 — compilation et invalidation des proxies** depuis les données auteur V3 ; aperçu et contrôles simples dans le Studio.
7. **HZ-6 — gate 30/20 FPS** sans fog et sans popping critique, mesures sur GPU intégré, contenu et caméra identiques.

Ce chantier vise le **jeu solo immédiatement**, et les profils de foule du **futur multijoueur** pourront utiliser les mêmes outils de LOD. **Aucun chiffre de gain n'est revendiqué avant benchmark.**

## Axe GR — herbes basses/hautes ultra-low-resource

**Décision validée, développement et gains encore à mesurer :** [18 — Herbes, shaders et budget partagé](18-GRASS-LOW-RESOURCE.md).

| Phase | Livraison vérifiable |
| --- | --- |
| **GR-0** | Baseline sol seul, écologie actuelle et budget de rendu global sur GPU de référence |
| **GR-1** | Couleurs de biotope assurant l'herbe courte + touffes opaques instanciées ultra-simples |
| **GR-2** | Déformation GPU locale au passage d'un joueur et vent facultatif, sans matrices CPU par brin |
| **GR-3** | Génération déterministe en cellules activées autour du joueur + invalidation locale depuis biotopes/Studio |
| **GR-4** | Profils de qualité `groundOnly` / ultra-économique / équilibré / plus dense, dégradation adaptative |
| **GR-5** | Tests sur PC à GPU intégré : coût CPU/GPU/VRAM, streaming, scène forestière et personnages simulés |

**Règles :** pas de physique de brin, d'ombres ni de réseau spécifique à l'herbe ; le budget de végétation est **partagé** avec arbres, faune décorative, paysage et personnages. Les objectifs **< 0,1 ms CPU / < 0,5 ms GPU** sont des hypothèses **non atteintes** tant qu'aucun benchmark ne le prouve.

## Axe ENV — météo, neige, ciel étoilé, lunes et ombres locales

**Cible validée, implémentation non revendiquée** : [19 — Environnement LOW-RESOURCE](19-ENVIRONMENT-WEATHER-SKY.md).

| Phase | Livrable / gate |
| --- | --- |
| **ENV-0** | Audit lumière/fog actuels, baseline GPU, panneau de test bêta initial |
| **ENV-1** | `WorldClock` + `EnvironmentStateSource` + accélération/pause et transition contrôlée |
| **ENV-2** | Ciel jour/nuit, crépuscules, étoiles et **une ou plusieurs lunes à orbites/phases indépendantes** |
| **ENV-3** | Nuages simples, vent partagé, pluie/neige visuelle locale, orages et brouillard météo |
| **ENV-4** | **Neige persistante** par masques sur sol, arbres, rochers, toits et horizons, température/fonte/altitude |
| **ENV-5** | **ShadowBudgetManager** : 1 shadow map solaire locale uniquement pour grands objets proches, profil Off |
| **ENV-6** | Menu bêta et Studio : forcer temps/météo/astres/ombres, scénarios reproductibles, snapshot source simulé |
| **ENV-7** | Benchmarks PC GPU intégré : FPS 30/20, transitions, météo, paysages lointains, ombres désactivables |

**Périmètre** : implémenter le test en source locale dans la bêta, garder la même interface pour **l'autorité serveur future**, **sans créer de backend en solo**. **Ne pas introduire de météo physique lourde, de nuages volumétriques ni d'ombres lunaires**. Budgets GPU des ombres mesurés séparément de ceux des shaders/particules.

## Axe BL — Blender, bibliothèque de presets et import/export de cartes

**Choix validé, fonctionnalités encore à développer :** [20 — Échange Blender ↔ Little World Studio](20-BLENDER-STUDIO-INTERCHANGE.md).

| Phase | Livrable vérifiable |
| --- | --- |
| **BL-0** | Audit du code import/export actuel, tests pivots/axes Blender Z-up → glTF/Studio Y-up, schéma de formats |
| **BL-1** | **Import GLB catalogue** : préflight, aperçu/LOD/coûts, licences, ressources et IDs versionnés |
| **BL-2** | **Prefabs composés / groupes** et transform XYZ/quaternion/scale, gizmos, alignement, annuler/refaire |
| **BL-3** | **Export/import de packs de presets ZIP+JSON+GLB**, dépendances, variantes, conflits/IDs |
| **BL-4** | **Import heightfield Blender, masques de biotopes, modules de terrain GLB**, édition locale Studio |
| **BL-5** | **Export/import d'archive V3 portable de carte entière** (sources, assets, biotopes, logique, météo), sans perte |
| **BL-6** | **Export scène/sélection vers Blender** (GLB+sidecar), réimport diff conservant IDs, interactions et overrides |
| **BL-7** | Compilation low-poly : chunks, LOD, instancing, streaming, budgets GPU et tests GitHub Pages |

**Règle :** ne pas faire de Blender un prérequis pour utiliser le Studio ; un GLB ne remplace pas les données auteur V3. Toute fusion/mise à jour importée est prévisualisée, transactionnelle, **non destructive**. Le jeu solo ne requiert ni backend ni décodeur `.blend`.

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

Dernier commit applicatif : `7128fc9`, avec validation GitHub réussie ([exécution](https://github.com/glloq/little-world/actions/runs/43291414744)). Les cadrages de `main` jusqu’à `abf85bb` sont intégrés ; la publication Pages de ces fonctionnalités et la création de PR ne sont pas faites. La PR est bloquée par le refus réseau de l’API GitHub, pas par un échec des tests.

La dernière CI applicative a réussi sur `7128fc9` : [exécution GitHub](https://github.com/glloq/little-world/actions/runs/43291414744). Le dernier correctif de rendu réduit la distance détaillée du petit animal à 8 m ; PNJ parlants à 18 m. Le plafond final validé reste 100 km², le Studio spécialisé/progression/slots de partie sont encore des objectifs.

Campagne locale : **72 tests réussis**, TypeScript/build réussis, compilation de la carte (40 secteurs) et régénération GLB identique (236 788 octets), **16 vérifications Chromium** réussies sur le build statique, aucune erreur JS/HTTP. Quatre scénarios de benchmark ont terminé sans erreur ; la version enrichie est plus lente sur SwiftShader que la référence et aucun gain global n’est revendiqué.

Commits applicatifs : `710fe46` (données/terrain), `7bd718d` (personnage/PNJ/dialogues), `ad45f73` (intégration atelier/écologie/tests). Branche : `feat/living-world-editor`. La création de Pull Request et l’observation de CI via API sont bloquées par le refus réseau vers `api.github.com` ; l’ajout du domaine est enregistré dans le brouillon de l’environnement et doit être appliqué dans les paramètres. La présence d’authentification API utilisable reste à vérifier après cette autorisation réseau. Aucun déploiement de cette branche n’est revendiqué.

Les résultats de campagne sont décrits dans le [plan navigateur](09-BROWSER-TEST-PLAN.md) et les [mesures](10-PERFORMANCE-ROADMAP.md). Le build vérifie TypeScript strict. La validation des branches/PR est définie dans `.github/workflows/checks.yml`, avec tests, compilation de carte, build et parcours Chromium sur le build statique. Le workflow Pages de main est conservé.

La CI GitHub a réussi sur `5baf97f`, puis sur `bbe0796` après synchronisation avec main et migration 30/20 Hz ([exécution](https://github.com/glloq/little-world/actions/runs/43288636931)). Le déploiement doit être vérifié séparément : une exécution CI réussie de branche ne vaut pas publication sur Pages. Voir le rapport final de campagne pour la branche et le dernier commit.

---

## P0 LOW-RESOURCE et objectifs restant à valider

- [x] Instrumentation, simulation fixe 30 Hz, présentation 30/20, interpolation et pause des onglets masqués.
- [x] Données source communes, secteurs/LOD locaux et cache borné ; 1/2 km synthétiques mesurés.
- [ ] PC de référence, longues traversées, navigation hiérarchique, Studio spécialisé et format sectorisé pour 100 km².

Les jalons ci-dessous sont la **cible générale** et les critères restants ; le tableau de campagne décrit ce qui est effectivement livré sur cette branche.

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

## Évolution différée : multijoueur du même monde continu

**Choix de préparation validés, développement non demandé pour la campagne solo/V3.** Voir [16 — Multijoueur futur et optimisation des foules](16-FUTURE-MULTIPLAYER.md).

| Jalon futur | Description | Gate indispensable |
| --- | --- | --- |
| **MP-0** | Isoler un prototype réseau et un serveur autoritaire sans dépendance pour le solo | 2–10 clients, états cohérents, collisions/actions validées |
| **MP-1** | Premier multijoueur, **30 joueurs regroupés**, AOI et intérêts contextuels | Mouvement, interactions et reconnexion validés en navigateurs |
| **MP-2** | Cible principale **200 connectés**, test **100 regroupés** | Cadences 2–20 Hz, LOD de foules, CPU/réseau/p95 et qualité client |
| **MP-3** | Objectif **500 expérimentaux**, test **200–300 regroupés** | Profilage puis décision si multi-processus nécessaire |
| **MP-4 éventuel** | Autorité répartie par zones de simulation, transferts de joueurs et abonnements trans-zones | Aucun doublon d'autorité, aucun écran de chargement lors de traversée |

**À prévoir maintenant dans la V3 uniquement :** IDs stables, états logiques indépendants du rendu, référence inter-secteurs, simulation découplée, index spatial, LOD et événements typés. **Ne pas coder** le transport, les comptes, les réplications et le scheduler réseau avant MP-0.

**Différence cruciale :** `2–3 Hz` pour les mouvements des avatars secondaires **n'est pas** une simulation serveur à 2 Hz et ne s'applique pas aux interactions prioritaires. Les chiffres 30/200/500 sont des **objectifs de test**, non une capacité atteinte.

## Après V1 (hors plan de livraison)

**Évolution optionnelle** : concevoir un multijoueur 10–30 joueurs avec serveur autoritaire, synchronisation, persistance et comptes. Ce n'est **ni implémenté, ni planifié pour le jeu solo actuel**. Une étude séparée devra évaluer coûts, contraintes et modifications de l'architecture solo.

Fonctions hors périmètre final actuel : combat, simulation sociale/économique lourde, crafting/commerce complexes, agriculture avancée, **simulation climatique physique complexe** (ciel et météo stylisés prévus via ENV-0…ENV-7), éditeur de rig/polygones généraliste, mobile/manette. **PNJ, dialogues, pêche légère, collecte, petites quêtes, inventaire léger et personnalisation font désormais partie de l'objectif final** (S3–S6), pas du prototype actuel.

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
