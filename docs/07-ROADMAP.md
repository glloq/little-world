# 07 — Feuille de route — Little World Solo / GitHub Pages

**Statut : plan de développement. D0 documentaire uniquement.**

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
- Mode debug pour trajectoire, vitesse, hauteur, état et FPS.
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
- Taille des assets et FPS **mesurés et documentés**, et corrections des points critiques.
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
